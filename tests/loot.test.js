import { describe, it, expect } from "vitest";
import {
  pickLootFromPool,
  pickWeighted,
  LOOT_UNIFORM_CHANCE,
  ITEMS,
  WANDS,
} from "../items.js";

describe("pickLootFromPool", () => {
  const pool = [
    { name: "common", weight: 1000 },
    { name: "rare", weight: 1 },
  ];

  it("floor は常に重み抽選（均等確率0）", () => {
    expect(LOOT_UNIFORM_CHANCE.floor).toBe(0);
    let common = 0;
    for (let i = 0; i < 80; i++) {
      const t = pickLootFromPool(pool, "floor", () => 0.0001);
      if (t.name === "common") common++;
    }
    expect(common).toBe(80);
  });

  it("change で均等枠が当たると rare も選ばれ得る", () => {
    /* rng: 1回目 < 0.20 で均等、2回目で index 1 (rare) */
    let n = 0;
    const rngFn = () => {
      n++;
      if (n === 1) return 0.0; /* uniform branch */
      return 0.9; /* index 1 */
    };
    const t = pickLootFromPool(pool, "change", rngFn);
    expect(t.name).toBe("rare");
  });

  it("change で均等枠を外すと重み抽選", () => {
    let n = 0;
    const rngFn = () => {
      n++;
      if (n === 1) return 0.99; /* not uniform */
      return 0.0001; /* pickWeighted → common */
    };
    const t = pickLootFromPool(pool, "change", rngFn);
    expect(t.name).toBe("common");
  });

  it("空プールは null", () => {
    expect(pickLootFromPool([], "floor")).toBeNull();
  });

  it("pickWeighted と floor が同趣旨", () => {
    const a = pickWeighted(ITEMS.filter((i) => i.type === "potion"), () => 0.01);
    const b = pickLootFromPool(ITEMS.filter((i) => i.type === "potion"), "floor", () => 0.01);
    expect(a.name).toBe(b.name);
  });

  it("WANDS でも動く", () => {
    const t = pickLootFromPool(WANDS, "drop");
    expect(t?.type || t?.name).toBeTruthy();
  });
});
