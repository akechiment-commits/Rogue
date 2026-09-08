import { describe, expect, it, vi } from "vitest";
import { makeMonsterFromBase, MONS, monsterAI } from "../monsters.js";
import { monsterDrop } from "../items.js";
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
  it("生成時にアーチャーとワッカが8〜12個の専用弾薬を持つ", () => {
    const archerBase = MONS.find((m) => m.baseKind === "archer");
    const wokkaBase = MONS.find((m) => m.baseKind === "wokka");
    const archer = makeMonsterFromBase(archerBase, 1, 5, 5);
    const wokka = makeMonsterFromBase(wokkaBase, 1, 5, 5);

    expect(archer.projectileAmmo).toMatchObject({ type: "arrow" });
    expect(archer.projectileAmmo.count).toBeGreaterThanOrEqual(8);
    expect(archer.projectileAmmo.count).toBeLessThanOrEqual(12);
    expect(wokka.projectileAmmo).toMatchObject({ type: "arrow", stone: true });
    expect(wokka.projectileAmmo.count).toBeGreaterThanOrEqual(8);
    expect(wokka.projectileAmmo.count).toBeLessThanOrEqual(12);
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
});
