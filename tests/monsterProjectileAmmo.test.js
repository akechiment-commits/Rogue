import { describe, expect, it, vi } from "vitest";
import { makeMonsterFromBase, MONS, monsterAI } from "../monsters.js";
import { applyPotionEffect, monsterDrop } from "../items.js";
import { advanceMonsterUpkeep } from "../monsterUpkeep.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function openBattlefield(monster) {
  return makeEmptyDg({
    map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
    rooms: [{ x: 1, y: 1, w: 58, h: 28 }],
    monsters: [monster],
    visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
  });
}

describe("投擲物を使う敵の弾薬", () => {
  it("生成時にアーチャー・ワッカ・薬投げ系が8〜12回分の専用弾薬を持つ", () => {
    const archerBase = MONS.find((m) => m.baseKind === "archer");
    const wokkaBase = MONS.find((m) => m.baseKind === "wokka");
    const potionThrowerBase = MONS.find((m) => m.baseKind === "potionthrower");
    const potionHealerBase = MONS.find((m) => m.baseKind === "potionhealer");
    const archer = makeMonsterFromBase(archerBase, 1, 5, 5);
    const wokka = makeMonsterFromBase(wokkaBase, 1, 5, 5);
    const potionMaker = makeMonsterFromBase(potionThrowerBase, 2, 5, 5);
    const loxonin = makeMonsterFromBase(potionHealerBase, 1, 5, 5);

    expect(archer.projectileAmmo).toMatchObject({ type: "arrow" });
    expect(archer.projectileAmmo.count).toBeGreaterThanOrEqual(8);
    expect(archer.projectileAmmo.count).toBeLessThanOrEqual(12);
    expect(wokka.projectileAmmo).toMatchObject({ type: "arrow", stone: true });
    expect(wokka.projectileAmmo.count).toBeGreaterThanOrEqual(8);
    expect(wokka.projectileAmmo.count).toBeLessThanOrEqual(12);
    for (const monster of [potionMaker, loxonin]) {
      expect(monster.projectileAmmo).toMatchObject({ type: "potion" });
      expect(monster.projectileAmmo.count).toBeGreaterThanOrEqual(8);
      expect(monster.projectileAmmo.count).toBeLessThanOrEqual(12);
    }
  });

  it("ポーションメーカーは投げるたび薬瓶を1本消費し、在庫切れで投げなくなる", () => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === "potionthrower"), 2, 5, 5, { aware: true });
    monster.projectileAmmo.count = 1;
    monster.alwaysUseSpecial = true;
    const player = makePlayer({ x: 10, y: 5 });
    const dg = openBattlefield(monster);
    const firstMessages = [];

    monsterAI(monster, dg, player, firstMessages, { attackOnly: true });

    expect(monster.projectileAmmo.count).toBe(0);
    expect(firstMessages.some((message) => message.includes("薬を投げた"))).toBe(true);

    const secondMessages = [];
    monster.turnAttacks = 0;
    monsterAI(monster, dg, player, secondMessages, { attackOnly: true });

    expect(monster.projectileAmmo.count).toBe(0);
    expect(secondMessages.some((message) => message.includes("薬を投げた"))).toBe(false);
  });

  it("ロキソ忍は回復薬を投げるたび在庫を1本消費し、在庫切れで支援しない", () => {
    const healer = makeMonsterFromBase(MONS.find((m) => m.baseKind === "potionhealer"), 1, 3, 5, { aware: true });
    healer.projectileAmmo.count = 1;
    healer.alwaysUseSpecial = true;
    const ally = { id: "wounded-ally", name: "負傷した味方", x: 7, y: 5, hp: 40, maxHp: 100, def: 0 };
    const player = makePlayer({ x: 10, y: 5 });
    const dg = openBattlefield(healer);
    dg.monsters.push(ally);
    const messages = [];

    monsterAI(healer, dg, player, messages, { moveOnly: true });
    monsterAI(healer, dg, player, messages, { attackOnly: true });

    expect(healer.projectileAmmo.count).toBe(0);
    expect(ally.hp).toBe(70);

    monsterAI(healer, dg, player, messages, { moveOnly: true });
    monsterAI(healer, dg, player, messages, { attackOnly: true });

    expect(healer.projectileAmmo.count).toBe(0);
    expect(ally.hp).toBe(70);
  });

  it.each([
    ["薬師系", "potionthrower", 2],
    ["ロキソ忍系", "potionhealer", 1],
  ])("%sは残薬があれば5%%でランダムな薬を1個固有ドロップする", (_label, baseKind, level) => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === baseKind), level, 5, 5);
    monster.projectileAmmo.count = 1;
    const dg = makeEmptyDg();
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(0.01).mockReturnValue(0.99);

    try {
      monsterDrop(monster, dg, []);

      const potionDrops = dg.items.filter((item) => item.type === "potion");
      expect(potionDrops).toHaveLength(1);
      expect(potionDrops[0]).toMatchObject({ type: "potion", effect: expect.any(String) });
      expect(random).toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it.each([
    ["薬師系", "potionthrower", 2],
    ["ロキソ忍系", "potionhealer", 1],
  ])("%sは在庫0なら固有ドロップ抽選をしない", (_label, baseKind, level) => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === baseKind), level, 5, 5);
    monster.projectileAmmo.count = 0;
    const dg = makeEmptyDg();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      monsterDrop(monster, dg, []);

      /* 通常ドロップの判定1回のみ。薬投げ系の固有判定は残弾0で行わない。 */
      expect(random).toHaveBeenCalledTimes(1);
      expect(dg.items).toHaveLength(0);
    } finally {
      random.mockRestore();
    }
  });

  it("遠距離攻撃1回で弾薬を1個消費し、残弾0では投げない", () => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === "archer"), 1, 5, 5, { aware: true });
    monster.projectileAmmo.count = 1;
    monster.alwaysUseSpecial = true;
    monster.turnAttacks = 0;
    const player = makePlayer({ x: 10, y: 5 });
    const dg = openBattlefield(monster);
    const firstMessages = [];

    monsterAI(monster, dg, player, firstMessages, { attackOnly: true });

    expect(monster.projectileAmmo.count).toBe(0);
    expect(firstMessages.some((message) => message.includes("矢を放った"))).toBe(true);

    const secondMessages = [];
    monster.turnAttacks = 0;
    monsterAI(monster, dg, player, secondMessages, { attackOnly: true });

    expect(secondMessages.some((message) => message.includes("矢を放った"))).toBe(false);
    expect(monster.projectileAmmo.count).toBe(0);
  });

  it("固有ドロップ判定に成功すると残弾だけを全量ドロップする", () => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === "archer"), 1, 5, 5);
    monster.projectileAmmo.count = 3;
    const dg = makeEmptyDg();
    const messages = [];
    vi.spyOn(Math, "random").mockReturnValueOnce(0.01).mockReturnValue(0.99);

    monsterDrop(monster, dg, messages);

    expect(dg.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "arrow", count: 3 }),
    ]));
    vi.restoreAllMocks();
  });

  it("残弾0なら固有ドロップ判定を行わず、投擲物も落とさない", () => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === "archer"), 1, 5, 5);
    monster.projectileAmmo.count = 0;
    const dg = makeEmptyDg();
    const messages = [];
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    monsterDrop(monster, dg, messages);

    expect(dg.items.some((item) => item.type === "arrow")).toBe(false);
    vi.restoreAllMocks();
  });

  it("幸運中は通常ドロップとは別に追加ドロップ判定を行う", () => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === "archer"), 1, 5, 5);
    monster.projectileAmmo.count = 0;
    const dg = makeEmptyDg();
    const player = makePlayer({ luckTurns: 20 });
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.99) // 通常ドロップ失敗
      .mockReturnValueOnce(0.01) // 幸運の追加ドロップ成功
      .mockReturnValue(0.99);

    monsterDrop(monster, dg, [], player);

    expect(dg.items).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it("不運中は固有・通常を含めてアイテムを落とさない", () => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === "archer"), 1, 5, 5);
    monster.projectileAmmo.count = 3;
    const dg = makeEmptyDg();
    const player = makePlayer({ unluckTurns: 20 });

    monsterDrop(monster, dg, [], player);

    expect(dg.items).toHaveLength(0);
  });

  it("敵に投げた幸運の薬は、その敵の撃破時の追加判定になる", () => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === "archer"), 1, 5, 5);
    monster.projectileAmmo.count = 0;
    const player = makePlayer();
    const dg = makeEmptyDg();
    applyPotionEffect("luck", 20, "monster", monster, dg, player, [], () => {});
    expect(monster).toMatchObject({ dropExtraItem: true, dropItemsSuppressed: false });

    dg.monsters.push(monster);
    for (let turn = 0; turn < 50; turn++) advanceMonsterUpkeep(dg, player, [], {});
    expect(monster.dropExtraItem).toBe(true);
  });

  it("敵に投げた呪われた幸運の薬は、その敵をアイテムドロップなしにする", () => {
    const monster = makeMonsterFromBase(MONS.find((m) => m.baseKind === "archer"), 1, 5, 5);
    const player = makePlayer();
    const dg = makeEmptyDg();

    applyPotionEffect("luck", 20, "monster", monster, dg, player, [], () => {}, false, true);

    expect(monster).toMatchObject({ dropExtraItem: false, dropItemsSuppressed: true });
  });
});
