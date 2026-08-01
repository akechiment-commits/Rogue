import { describe, it, expect } from "vitest";
import {
  monEffectiveFloat, monEffectiveMagicImmune, monReflectsProjectiles,
  monReflectsMagic, monEffectiveMaxAttacks, monEffectiveWallWalker,
  monEffectiveFixedDamageOnly, monEffectiveSpeed,
} from "../monTraits.js";
import { clampDmgFixed, consumeBarrier } from "../utils.js";

describe("封印中の敵特性無効化", () => {
  it("浮遊：固有floatは封印で落ち、floatTurnsは残る", () => {
    expect(monEffectiveFloat({ float: true })).toBe(true);
    expect(monEffectiveFloat({ float: true, sealed: true })).toBe(false);
    expect(monEffectiveFloat({ float: true, sealed: true, floatTurns: 5 })).toBe(true);
  });

  it("魔法無効・壁抜け・固定ダメは封印で無効", () => {
    expect(monEffectiveMagicImmune({ magicImmune: true })).toBe(true);
    expect(monEffectiveMagicImmune({ magicImmune: true, sealed: true })).toBe(false);
    expect(monEffectiveWallWalker({ wallWalker: true, sealed: true })).toBe(false);
    expect(monEffectiveFixedDamageOnly({ fixedDamageOnly: true, sealed: true })).toBe(false);
  });

  it("反射系は封印で無効", () => {
    expect(monReflectsProjectiles({ subtype: "reflector" })).toBe(true);
    expect(monReflectsProjectiles({ subtype: "reflector", sealed: true })).toBe(false);
    expect(monReflectsMagic({ subtype: "magicreflect", sealed: true })).toBe(false);
  });

  it("速度と攻撃回数は封印で1", () => {
    expect(monEffectiveSpeed({ speed: 2, sealed: true })).toBe(1);
    expect(monEffectiveMaxAttacks({ maxAttacks: 3, sealed: true })).toBe(1);
    expect(monEffectiveMaxAttacks({ maxAttacks: 3 })).toBe(3);
  });

  it("clampDmgFixed / consumeBarrier も封印で無効", () => {
    expect(clampDmgFixed({ fixedDamageOnly: true }, 10, true)).toBe(1);
    expect(clampDmgFixed({ fixedDamageOnly: true, sealed: true }, 10, true)).toBe(10);
    const m = { name: "蟹", barrier: 2, sealed: true };
    expect(consumeBarrier(m, [])).toBe(false);
    expect(m.barrier).toBe(2);
  });
});
