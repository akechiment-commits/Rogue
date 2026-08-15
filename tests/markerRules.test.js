import { describe, expect, it } from "vitest";
import { getMarkerInkCost, MARKER_SPELLBOOK_INK_COST } from "../markerRules.js";

describe("魔法の筆のインク消費量", () => {
  it("巻物ごとの消費量を返す", () => {
    expect(getMarkerInkCost({ type: "scroll", effect: "duplicate" })).toBe(3);
    expect(getMarkerInkCost({ type: "scroll", effect: "expand_inv" })).toBe(2);
    expect(getMarkerInkCost({ type: "scroll", effect: "identify" })).toBe(1);
  });

  it("魔法書は5回分を消費する", () => {
    expect(getMarkerInkCost({ type: "spellbook", spell: "fire_bolt" })).toBe(MARKER_SPELLBOOK_INK_COST);
  });
});
