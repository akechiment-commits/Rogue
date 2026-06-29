import { describe, it, expect } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("fireTrapPlayer", () => {
  it("鈍足の罠でプレイヤーが鈍足になる", () => {
    const p = makePlayer();
    const dg = makeEmptyDg();
    const trap = { effect: "slow_trap", name: "鈍足の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.slowTurns).toBe(10);
    expect(trap.revealed).toBe(true);
    expect(ml.some(m => m.includes("鈍足"))).toBe(true);
  });

  it("耐鈍足の防具で鈍足の罠を防げる", () => {
    const armor = { name: "鉄の鎧", type: "armor", ability: "slow_proof" };
    const p = makePlayer({ armor });
    const dg = makeEmptyDg();
    const trap = { effect: "slow_trap", name: "鈍足の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.slowTurns).toBeUndefined();
    expect(ml.some(m => m.includes("耐鈍足"))).toBe(true);
  });

  it("空腹の罠で満腹度が10%減る", () => {
    const p = makePlayer({ hunger: 80, maxHunger: 100 });
    const dg = makeEmptyDg();
    const trap = { effect: "hunger_trap", name: "空腹の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.hunger).toBe(70);
  });

  it("錆びの罠で武器の強化値が下がる", () => {
    const sword = { name: "短剣", type: "weapon", plus: 2 };
    const p = makePlayer({ weapon: sword, inventory: [sword] });
    const dg = makeEmptyDg();
    const trap = { effect: "rust", name: "錆びの罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(sword.plus).toBe(1);
    expect(ml.some(m => m.includes("錆び"))).toBe(true);
  });

  it("落とし穴の罠は pitfall を返す", () => {
    const p = makePlayer();
    const dg = makeEmptyDg();
    const trap = { effect: "pitfall", name: "落とし穴", x: 5, y: 5, id: "t1" };
    const ml = [];
    const result = fireTrapPlayer(trap, p, dg, ml);
    expect(result).toBe("pitfall");
  });
});