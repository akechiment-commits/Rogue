import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function makeEnemyTarget(x = 5, y = 5) {
  return {
    id: "target",
    name: "標的",
    baseKind: "slime",
    kind: "beast",
    monLevel: 1,
    hp: 1,
    maxHp: 1,
    atk: 1,
    def: 0,
    exp: 1,
    x,
    y,
  };
}

function makeBattlefield(monsters) {
  return makeEmptyDg({
    map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
    rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
    monsters,
  });
}

describe("敵同士の撃破によるレベルアップ", () => {
  it("わてりの水鉄砲で敵を倒すとわてりがレベルアップする", () => {
    const wateri = makeMonsterFromBase(MONS.find((m) => m.baseKind === "wateri"), 1, 3, 5, { aware: true });
    wateri.alwaysUseSpecial = true;
    wateri.turnAttacks = 0;
    const target = makeEnemyTarget(5, 5);
    const dg = makeBattlefield([wateri, target]);
    dg.map[5][3] = T.WATER;
    const p = makePlayer({ x: 10, y: 5 });
    const ml = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      monsterAI(wateri, dg, p, ml, { attackOnly: true });
      expect(dg.monsters).not.toContain(target);
      expect(wateri.monLevel).toBe(2);
      expect(wateri.name).toBe("わてに");
    } finally {
      random.mockRestore();
    }
  });

  it("突進角獣の予約突進で敵を倒しても突進角獣がレベルアップする", () => {
    const charger = makeMonsterFromBase(MONS.find((m) => m.baseKind === "charger"), 1, 3, 5, { aware: true });
    charger.turnAttacks = 0;
    charger._rangedAttackThisTurn = true;
    const target = makeEnemyTarget(5, 5);
    const dg = makeBattlefield([charger, target]);
    const p = makePlayer({ x: 10, y: 5 });
    const ml = [];

    monsterAI(charger, dg, p, ml, { attackOnly: true });
    expect(dg.monsters).not.toContain(target);
    expect(charger.monLevel).toBe(2);
    expect(charger.name).toBe("強突進角獣");
  });
});
