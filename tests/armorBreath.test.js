import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monLevelUp, monsterAI } from "../monsters.js";
import { applyMonsterSeal } from "../items.js";
import { addArmorBreathBuff, clearArmorBreathBuff } from "../monsterBuffs.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("スネークマン系", () => {
  it("3形態の名前・タイル・水中歩行を持つ", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    expect(base).toBeTruthy();
    expect(base.kind).toBe("dragon");
    expect(base.waterWalker).toBe(true);
    expect(base.subtype).toBe("armorbreath");

    const forms = [1, 2, 3].map((level) => makeMonsterFromBase(base, level, 5, 5));
    expect(forms.map((m) => m.name)).toEqual(["スネークマン", "リザードマン", "とかげせんし"]);
    expect(forms.map((m) => m.tile)).toEqual([204, 204, 204]);
    expect(forms.map((m) => m.kind)).toEqual(["dragon", "dragon", "dragon"]);
    expect(new Set(forms.map((m) => m.tile)).size).toBe(1);
  });

  it("13階から出現し、レベル間に空白階を置く", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");

    expect([base.hp, base.atk, base.def, base.exp]).toEqual([43, 20, 5, 62]);
    expect([base.minFloor, base.maxFloor]).toEqual([13, 17]);
    expect(base.levels.map((level) => [level.minFloor, level.maxFloor])).toEqual([[20, 24], [27, 30]]);
    expect(base.levels[0].dungeonFloors).toEqual({ intermediate: { min: 20, max: 20 }, advanced: { min: 20, max: 24 } });
    expect(base.levels[1].dungeonFloors).toEqual({ advanced: { min: 27, max: 30 } });
  });

  it("レベルアップしてもスタイル3の共通タイルを維持する", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    const mon = makeMonsterFromBase(base, 1, 5, 5);
    const messages = [];

    expect(monLevelUp(mon, makeEmptyDg(), messages)).toBe(true);
    expect(mon.name).toBe("リザードマン");
    expect(mon.tile).toBe(204);
  });

  it("視界内でアーマーブレスを予約し、自分または隣接敵の防御を5上げる", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    const snake = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    snake.alwaysUseSpecial = true;
    snake.turnAttacks = 0;
    const ally = { id: "ally", name: "隣の敵", hp: 20, maxHp: 20, atk: 5, def: 3, x: 6, y: 5 };
    const player = makePlayer({ x: 5, y: 10 });
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [snake, ally],
      visible: Array.from({ length: 30 }, () => Array(40).fill(true)),
    });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      monsterAI(snake, dg, player, messages, { moveOnly: true });
      expect(snake._rangedAttackThisTurn).toBe(true);
      monsterAI(snake, dg, player, messages, { attackOnly: true });
      snake.turnAttacks = 0;
      snake._rangedAttackThisTurn = true;
      monsterAI(snake, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(ally.def).toBe(13);
    expect(snake.def).toBe(5);
    expect(messages).toContain("スネークマンがアーマーブレスを唱えた！隣の敵の防御力が5上がった！");
  });

  it.each([[1, 5], [2, 7], [3, 10]])("Lv%dのアーマーブレスは1回で防御力を%d上げる", (level, bonus) => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    const mon = makeMonsterFromBase(base, level, 5, 5);
    const initialDef = mon.def;

    expect(addArmorBreathBuff(mon)).toBe(bonus);
    expect(mon.def).toBe(initialDef + bonus);
    expect(clearArmorBreathBuff(mon)).toBe(bonus);
    expect(mon.def).toBe(initialDef);
  });

  it("レベルアップ後も既存の強化を維持し、次回から新レベル量を使う", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    const mon = makeMonsterFromBase(base, 1, 5, 5);
    addArmorBreathBuff(mon);

    expect(monLevelUp(mon, makeEmptyDg(), [])).toBe(true);
    expect(mon.def).toBe(14);
    addArmorBreathBuff(mon);
    expect(mon.def).toBe(21);
    expect(clearArmorBreathBuff(mon)).toBe(12);
    expect(mon.def).toBe(9);
  });

  it("強化解除は重ねがけ分だけを解除する", () => {
    const mon = { def: 4 };
    addArmorBreathBuff(mon);
    addArmorBreathBuff(mon);

    expect(mon.def).toBe(14);
    expect(clearArmorBreathBuff(mon)).toBe(10);
    expect(mon.def).toBe(4);
    expect(mon.armorBreathBuffs).toBeUndefined();
  });

  it("封印時にもアーマーブレスの強化が解除される", () => {
    const mon = { name: "スネークマン", x: 5, y: 5, hp: 32, maxHp: 32, def: 4 };
    addArmorBreathBuff(mon);
    const messages = [];

    applyMonsterSeal(mon, makeEmptyDg({ monsters: [mon] }), makePlayer(), messages);

    expect(mon.sealed).toBe(true);
    expect(mon.def).toBe(4);
    expect(mon.armorBreathBuffs).toBeUndefined();
    expect(messages).toContain("スネークマンのアーマーブレスの強化が封印で解除された！");
  });

  it("魔法無効の対象には効かない", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    const snake = makeMonsterFromBase(base, 1, 5, 5);
    const immune = { id: "immune", name: "魔法無効の敵", hp: 20, maxHp: 20, atk: 5, def: 3, magicImmune: true, x: 6, y: 5 };
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [snake, immune],
      visible: Array.from({ length: 30 }, () => Array(40).fill(true)),
    });
    const messages = [];
    const player = makePlayer({ x: 5, y: 10 });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      snake.turnAttacks = 0;
      snake._rangedAttackThisTurn = true;
      monsterAI(snake, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(immune.def).toBe(3);
    expect(messages).toContain("魔法は魔法無効の敵に効かない！");
  });

  it("魔法反射の対象なら唱えたトカゲ側にかかる", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    const snake = makeMonsterFromBase(base, 1, 5, 5);
    const reflector = { id: "reflector", name: "魔法反射の敵", hp: 20, maxHp: 20, atk: 5, def: 3, subtype: "magicreflect", x: 6, y: 5 };
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [snake, reflector],
      visible: Array.from({ length: 30 }, () => Array(40).fill(true)),
    });
    const messages = [];
    const player = makePlayer({ x: 5, y: 10 });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      snake.turnAttacks = 0;
      snake._rangedAttackThisTurn = true;
      monsterAI(snake, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(reflector.def).toBe(3);
    expect(snake.def).toBe(10);
    expect(messages).toContain("魔法反射の敵がアーマーブレスを反射した！");
    expect(messages).toContain("跳ね返ったアーマーブレスがスネークマンにかかり、防御力が5上がった！");
  });

  it("魔封じの魔法陣の中では発動しない", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    const snake = makeMonsterFromBase(base, 1, 5, 5);
    const ally = { id: "ally", name: "隣の敵", hp: 20, maxHp: 20, atk: 5, def: 3, x: 6, y: 5 };
    const dg = makeEmptyDg({
      rooms: [{ x: 0, y: 0, w: 40, h: 30 }],
      monsters: [snake, ally],
      pentacles: [{ kind: "magic_seal", x: 5, y: 5, blessed: false, cursed: false }],
    });
    const messages = [];
    const player = makePlayer({ x: 5, y: 10 });

    snake.turnAttacks = 0;
    snake._rangedAttackThisTurn = true;
    monsterAI(snake, dg, player, messages, { attackOnly: true });

    expect(ally.def).toBe(3);
  });
});
