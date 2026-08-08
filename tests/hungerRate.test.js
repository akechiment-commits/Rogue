import { describe, it, expect } from "vitest";
import { calcHungerDrainRate } from "../items.js";

describe("calcHungerDrainRate", () => {
  it("素は 1（10ターンで-1相当）", () => {
    expect(calcHungerDrainRate({ armor: null, rings: [] })).toBe(1);
  });

  it("腹持ち1つで 3/4", () => {
    expect(calcHungerDrainRate({
      armor: { ability: "slow_hunger" },
      rings: [],
    })).toBeCloseTo(0.75);
    expect(calcHungerDrainRate({
      armor: null,
      rings: [{ effect: "stomach_ring" }],
    })).toBeCloseTo(0.75);
  });

  it("胴+指輪1で 1/2、胴+指輪2で 1/4", () => {
    expect(calcHungerDrainRate({
      armor: { ability: "slow_hunger" },
      rings: [{ effect: "stomach_ring" }],
    })).toBeCloseTo(0.5);
    expect(calcHungerDrainRate({
      armor: { ability: "slow_hunger" },
      rings: [{ effect: "stomach_ring" }, { effect: "stomach_ring" }],
    })).toBeCloseTo(0.25);
  });

  it("バターでさらに半分", () => {
    expect(calcHungerDrainRate({
      armor: { ability: "slow_hunger" },
      rings: [{ effect: "stomach_ring" }],
      butterHungerTurns: 50,
    })).toBeCloseTo(0.25);
  });

  it("回復の指輪は空腹レートに影響しない", () => {
    expect(calcHungerDrainRate({
      armor: { ability: "slow_hunger" },
      rings: [{ effect: "stomach_ring" }, { effect: "regen_ring" }],
    })).toBeCloseTo(0.5);
    expect(calcHungerDrainRate({
      armor: null,
      rings: [{ effect: "regen_ring" }],
    })).toBeCloseTo(1.0);
  });

  it("空腹の指輪は軽減後を2倍", () => {
    expect(calcHungerDrainRate({
      armor: null,
      rings: [{ effect: "hunger_ring" }],
    })).toBeCloseTo(2.0);
    /* 腹持ち+空腹 → 0.75*2 = 1.5 */
    expect(calcHungerDrainRate({
      armor: null,
      rings: [{ effect: "stomach_ring" }, { effect: "hunger_ring" }],
    })).toBeCloseTo(1.5);
  });
});
