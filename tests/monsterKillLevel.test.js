import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { killMonster, splashPotion } from "../items.js";
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
    expect(charger.name).toBe("激突角獣");
  });

  it("ラクガキ魔の魔方陣撃破はプレイヤー経験値なしでラクガキ魔を強化し、骨を残さない", () => {
    const painter = makeMonsterFromBase(MONS.find((m) => m.baseKind === "rakugakima"), 1, 3, 5, { aware: true });
    const skeleton = makeMonsterFromBase(MONS.find((m) => m.baseKind === "skeleton"), 1, 5, 5);
    skeleton.hp = 0;
    const dg = makeBattlefield([painter, skeleton]);
    const p = makePlayer({ x: 10, y: 5, exp: 0 });
    const ml = [];

    killMonster(skeleton, dg, p, ml, null, false, painter, false, true);

    expect(p.exp).toBe(0);
    expect(painter.monLevel).toBe(2);
    expect(dg.monsters).not.toContain(skeleton);
    expect(dg.traps.some((trap) => trap.name === "骨")).toBe(false);
    expect(ml).toContain("スケルトンはラクガキ魔に倒された！");
  });

  it("自分を倒した敵は自滅扱いで経験値もレベルアップもない", () => {
    const thrower = makeMonsterFromBase(MONS.find((m) => m.baseKind === "potionthrower"), 2, 5, 5);
    thrower.hp = 0;
    const dg = makeBattlefield([thrower]);
    const p = makePlayer({ x: 12, y: 5, exp: 0 });
    const ml = [];
    killMonster(thrower, dg, p, ml, null, false, thrower);
    expect(p.exp).toBe(0);
    expect(ml).toContain("ポーションメーカーは自滅した！");
    expect(ml.some((msg) => msg.includes("レベルアップ"))).toBe(false);
  });

  it("炎の薬の飛沫で自殺した投げ手はレベルアップしない", () => {
    const thrower = makeMonsterFromBase(MONS.find((m) => m.baseKind === "potionthrower"), 2, 5, 5);
    thrower.hp = 1;
    const victim = makeEnemyTarget(6, 5);
    const dg = makeBattlefield([thrower, victim]);
    const p = makePlayer({ x: 12, y: 5, exp: 0 });
    const ml = [];
    splashPotion(dg, 5, 5, "fire", 20, p, ml, null, false, false, null, thrower);
    expect(dg.monsters).not.toContain(thrower);
    expect(dg.monsters).not.toContain(victim);
    expect(p.exp).toBe(0);
    expect(ml.some((msg) => msg.includes("レベルアップ"))).toBe(false);
  });

  it("炎の薬の飛沫で他を倒して生き残った投げ手はレベルアップする", () => {
    const thrower = makeMonsterFromBase(MONS.find((m) => m.baseKind === "potionthrower"), 1, 5, 5);
    thrower.hp = 400;
    thrower.maxHp = 400;
    const victim = makeEnemyTarget(6, 5);
    const dg = makeBattlefield([thrower, victim]);
    const p = makePlayer({ x: 12, y: 5, exp: 0 });
    const ml = [];
    splashPotion(dg, 6, 5, "fire", 20, p, ml, null, false, false, null, thrower);
    expect(dg.monsters).toContain(thrower);
    expect(dg.monsters).not.toContain(victim);
    expect(thrower.monLevel).toBe(2);
    expect(ml.some((msg) => msg.includes("レベルアップ"))).toBe(true);
  });

  it("ほっちもぺのLv3名は疑問符付き", () => {
    const base = MONS.find((m) => m.baseKind === "reflector");
    expect(base.levels[1].name).toBe("モチチモチ？");
  });
});
