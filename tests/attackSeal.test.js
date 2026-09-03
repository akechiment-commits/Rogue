import { describe, expect, it } from "vitest";
import { applyPotionEffect } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { applyAttackSeal, isAttackSealed, statusTurns, clearStatusEffectsOnHpZero } from "../statusDuration.js";
import { advanceEarlyStatusTimers } from "../turnUpkeep.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("攻撃封印", () => {
  it("基準は10ターンで、祝福倍率はかけない", () => {
    expect(statusTurns("attackSeal", { kind: "player" })).toBe(10);
    expect(statusTurns("attackSeal", { kind: "player", blessed: true })).toBe(20);
    expect(statusTurns("attackSeal", { kind: "monster", target: { isBoss: true } })).toBe(5);
    const p = makePlayer();
    expect(applyAttackSeal(p, { kind: "player" })).toBe(10);
    expect(isAttackSealed(p)).toBe(true);
  });

  it("祝福された封印の薬は鈍足ではなく攻撃封印を付ける", () => {
    const p = makePlayer();
    const ml = [];
    applyPotionEffect("seal", 0, "player", null, makeEmptyDg(), p, ml, () => {}, true, false);
    expect(p.sealedTurns).toBe(100);
    expect(p.attackSealTurns).toBe(10);
    expect(p.slowTurns || 0).toBe(0);
    expect(ml.some((m) => m.includes("攻撃"))).toBe(true);
  });

  it("祝福された封印の杖も敵に攻撃封印を付ける", () => {
    const p = makePlayer();
    const mon = { name: "ネズミ", hp: 20, maxHp: 20, x: 2, y: 2 };
    const dg = makeEmptyDg({ monsters: [mon] });
    applyWandEffect("seal", "monster", mon, 0, 0, dg, p, [], () => {}, () => {}, 2);
    expect(mon.sealed).toBe(true);
    expect(mon.attackSealTurns).toBe(10);
    expect(mon.speed || 1).toBe(1);
  });

  it("ターン経過で解け、HP0では消えるがMP回復禁止は残る", () => {
    const p = makePlayer({ attackSealTurns: 1, mpSealTurns: 1000 });
    const ml = [];
    advanceEarlyStatusTimers(p, ml);
    expect(p.attackSealTurns).toBe(0);
    expect(ml.some((m) => m.includes("攻撃封印が解けた"))).toBe(true);

    const p2 = makePlayer({ attackSealTurns: 8, mpSealTurns: 1000 });
    clearStatusEffectsOnHpZero(p2);
    expect(p2.attackSealTurns).toBe(0);
    expect(p2.mpSealTurns).toBe(1000);
  });
});
