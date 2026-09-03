import { describe, expect, it } from "vitest";
import { applyPotionEffect } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { fireTrapPlayer } from "../traps.js";
import { isMpRecoveryBlocked } from "../mpRules.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T, MW, MH } from "../utils.js";

function floorDg() {
  return makeEmptyDg({
    map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
    traps: [],
  });
}

describe("封印の薬・杖は魔法封印でありMP回復禁止ではない", () => {
  it("封印の薬を飲むと封印の罠と同じ魔法封印が付く", () => {
    const p = makePlayer();
    const ml = [];
    applyPotionEffect("seal", 0, "player", null, floorDg(), p, ml, () => {});
    expect(p.sealedTurns).toBe(50);
    expect(p.mpCooldownTurns || 0).toBe(0);
    expect(p.mpSealTurns || 0).toBe(0);
    expect(isMpRecoveryBlocked(p)).toBe(false);
    expect(ml.some((m) => m.includes("魔法が封印された"))).toBe(true);
  });

  it("封印の杖を自分に当てても魔法封印になる", () => {
    const p = makePlayer();
    const ml = [];
    applyWandEffect("seal", "player", p, 0, 0, floorDg(), p, ml, () => {}, () => {}, 1);
    expect(p.sealedTurns).toBe(50);
    expect(p.mpCooldownTurns || 0).toBe(0);
    expect(isMpRecoveryBlocked(p)).toBe(false);
    expect(ml.some((m) => m.includes("魔法が封印された"))).toBe(true);
  });

  it("封印の罠と同じターン数になる", () => {
    const p = makePlayer();
    const trapMl = [];
    fireTrapPlayer({ name: "封印の罠", effect: "seal_trap", id: "t1" }, p, floorDg(), trapMl);
    expect(p.sealedTurns).toBe(50);

    const potionP = makePlayer();
    applyPotionEffect("seal", 0, "player", null, floorDg(), potionP, [], () => {});
    expect(potionP.sealedTurns).toBe(p.sealedTurns);
  });

  it("呪われた封印の杖は魔法封印だけを解き、復活後のMP回復禁止は残す", () => {
    const p = makePlayer({ sealedTurns: 40, mpSealTurns: 1000 });
    const ml = [];
    applyWandEffect("seal", "player", p, 0, 0, floorDg(), p, ml, () => {}, () => {}, 0.5);
    expect(p.sealedTurns).toBe(0);
    expect(p.mpSealTurns).toBe(1000);
    expect(isMpRecoveryBlocked(p)).toBe(true);
    expect(ml.some((m) => m.includes("MP回復禁止"))).toBe(false);
  });

  it("残っていても mpCooldownTurns はMP回復を止めない", () => {
    const p = makePlayer({ mp: 0, maxMp: 20, mpCooldownTurns: 50 });
    expect(isMpRecoveryBlocked(p)).toBe(false);
    applyPotionEffect("mana", 20, "player", null, floorDg(), p, [], () => {});
    expect(p.mp).toBe(20);
  });
});
