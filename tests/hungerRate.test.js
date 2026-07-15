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

  it("回復指輪は軽減後を2倍（上書きしない）", () => {
    /* 胴+指輪 → 0.5、回復で 1.0 */
    expect(calcHungerDrainRate({
      armor: { ability: "slow_hunger" },
      rings: [{ effect: "stomach_ring" }, { effect: "regen_ring" }],
    })).toBeCloseTo(1.0);
    /* 素+回復 → 2.0 */
    expect(calcHungerDrainRate({
      armor: null,
      rings: [{ effect: "regen_ring" }],
    })).toBeCloseTo(2.0);
  });
});
