import { describe, expect, it } from "vitest";
import { applyPotionEffect, splashPotion, cureBlessedHealAilments } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { applyPlayerPoison } from "../statusDuration.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T, MW, MH } from "../utils.js";

function exploredDg() {
  return makeEmptyDg({
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    traps: [{ x: 3, y: 3, revealed: false, name: "矢の罠" }],
  });
}

describe("呪われた眠り・暗闇・惑わしの杖", () => {
  it("敵に当たると薬と同じ解除、自分に当たると従来の有利効果", () => {
    const dg = exploredDg();
    const p = makePlayer();
    const mon = { name: "ネズミ", hp: 10, maxHp: 10, sleepTurns: 4, darknessTurns: 8, darkDir: 1, fleeingTurns: 6, x: 2, y: 2 };

    applyWandEffect("sleep", "monster", mon, 0, 0, dg, p, [], () => {}, () => {}, 0.5);
    expect(mon.sleepTurns).toBe(0);
    expect(dg.monsterSenseActive).toBeFalsy();

    applyWandEffect("darkness", "monster", mon, 0, 0, dg, p, [], () => {}, () => {}, 0.5);
    expect(mon.darknessTurns).toBe(0);
    expect(dg.explored[0][0]).toBe(false);

    applyWandEffect("bewitch", "monster", mon, 0, 0, dg, p, [], () => {}, () => {}, 0.5);
    expect(mon.fleeingTurns).toBe(0);
    expect(dg.traps[0].revealed).toBe(false);

    const sleepMl = [];
    applyWandEffect("sleep", "player", p, 0, 0, dg, p, sleepMl, () => {}, () => {}, 0.5);
    expect(dg.monsterSenseActive).toBe(true);
    expect(sleepMl.some((m) => m.includes("透視"))).toBe(true);

    const darkMl = [];
    applyWandEffect("darkness", "player", p, 0, 0, dg, p, darkMl, () => {}, () => {}, 0.5);
    expect(dg.explored[0][0]).toBe(true);
    expect(darkMl.some((m) => m.includes("フロア全体"))).toBe(true);

    const bewMl = [];
    applyWandEffect("bewitch", "player", p, 0, 0, dg, p, bewMl, () => {}, () => {}, 0.5);
    expect(dg.traps[0].revealed).toBe(true);
    expect(bewMl.some((m) => m.includes("罠"))).toBe(true);
  });
});

describe("祝福回復薬の状態異常回復", () => {
  it("超回復薬の祝福は下位と同じく睡眠・混乱・鈍足・毒を治す", () => {
    const p = makePlayer({ hp: 50, sleepTurns: 3, confusedTurns: 2, slowTurns: 4 });
    applyPlayerPoison(p);
    const cured = cureBlessedHealAilments(p, "player");
    expect(cured).toEqual(expect.arrayContaining(["睡眠", "混乱", "鈍足", "毒"]));
    expect(p.sleepTurns).toBe(0);
    expect(p.confusedTurns).toBe(0);
    expect(p.slowTurns).toBe(0);
    expect(p.poisoned).toBe(false);
  });

  it("祝福された回復薬の飛沫でもプレイヤーの状態異常が治る", () => {
    const p = makePlayer({ hp: 40, x: 2, y: 2, sleepTurns: 5, confusedTurns: 3 });
    const dg = makeEmptyDg({
      map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
      traps: [],
    });
    const ml = [];
    splashPotion(dg, p.x, p.y, "heal", 30, p, ml, () => {}, true, false);
    expect(p.sleepTurns).toBe(0);
    expect(p.confusedTurns).toBe(0);
    expect(ml.some((m) => m.includes("睡眠") && m.includes("解消"))).toBe(true);
  });

  it("祝福された超回復薬の飛沫でも状態異常が治る", () => {
    const p = makePlayer({ hp: 40, x: 2, y: 2, slowTurns: 8 });
    const dg = makeEmptyDg({
      map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
      traps: [],
    });
    applyPotionEffect("superheal", 100, "player", null, dg, p, [], () => {}, true, false);
    expect(p.slowTurns).toBe(0);
    expect(p.hp).toBeGreaterThan(40);
  });
});
