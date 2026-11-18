import { describe, expect, it } from "vitest";
import { applyPotEffect, POTS } from "../items.js";

describe("弱化の壺と指輪", () => {
  it("+値のつく4種の指輪は弱化の壺で劣化する（強化の壺と対象を揃える）", () => {
    const pot = POTS.find(p => p.potEffect === "weaken");
    for (const effect of ["power_ring", "defense_ring", "life_ring", "niebelung_ring"]) {
      const ring = { type: "ring", name: "指輪", effect, plus: 5 };
      const ml = [];
      applyPotEffect(pot, ring, ml);
      expect(ring.plus, effect).toBeLessThan(5);
      expect(ring.plus, effect).toBeGreaterThanOrEqual(3);
      expect(ml.some(m => m.includes("劣化した")), effect).toBe(true);
    }
  });

  it("対象外の指輪は劣化しない", () => {
    const pot = POTS.find(p => p.potEffect === "weaken");
    const ring = { type: "ring", name: "指輪", effect: "other_ring", plus: 5 };
    applyPotEffect(pot, ring, []);
    expect(ring.plus).toBe(5);
  });
});
