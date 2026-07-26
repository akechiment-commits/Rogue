import { describe, it, expect } from "vitest";
import { TRAPS, pickTrap, RARITY_WEIGHT } from "../items.js";

describe("trap rarity / weight", () => {
  it("全罠に rarity と weight がある", () => {
    expect(TRAPS.length).toBeGreaterThan(10);
    for (const t of TRAPS) {
      expect(t.rarity, t.name).toMatch(/^[EDCBA]$/);
      expect(t.weight, t.name).toBe(RARITY_WEIGHT[t.rarity]);
    }
  });

  it("pickTrap はテンプレを返す", () => {
    const t = pickTrap();
    expect(t).toBeTruthy();
    expect(t.effect).toBeTruthy();
    expect(TRAPS.some((x) => x.effect === t.effect)).toBe(true);
  });

  it("E レアは B レアより weight が大きい", () => {
    const e = TRAPS.filter((t) => t.rarity === "E");
    const b = TRAPS.filter((t) => t.rarity === "B");
    expect(e.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(e[0].weight).toBeGreaterThan(b[0].weight);
  });

  it("レア度の個別指定", () => {
    expect(TRAPS.find((x) => x.effect === "explode")?.rarity).toBe("C");
    expect(TRAPS.find((x) => x.effect === "mp_absorb_trap")?.rarity).toBe("C");
    expect(TRAPS.find((x) => x.effect === "slow_trap")?.rarity).toBe("C");
    expect(TRAPS.find((x) => x.effect === "shadow_stitch")?.rarity).toBe("E");
    for (const ef of ["time_bomb", "multiply_trap", "unident_trap"]) {
      const t = TRAPS.find((x) => x.effect === ef);
      expect(t?.rarity, ef).toBe("B");
    }
  });

  it("部分プールでも pickTrap できる", () => {
    const pool = TRAPS.filter((t) => t.rarity === "E");
    const t = pickTrap(pool);
    expect(t.rarity).toBe("E");
  });

  it("レア罠の運枠が当たると C 以上だけから抽選する", () => {
    const pool = [
      { name: "通常罠", rarity: "E", weight: 12 },
      { name: "レア罠", rarity: "C", weight: 4 },
    ];
    let calls = 0;
    const rng = () => (++calls === 1 ? 0 : 0.01);
    expect(pickTrap(pool, rng, 0.36).name).toBe("レア罠");
  });
});
