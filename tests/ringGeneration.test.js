import { describe, expect, it } from "vitest";
import { applyGeneratedRingPlus } from "../items.js";
import { genDebugDungeon, genDebugDungeonFloor2 } from "../dungeon.js";

const PLUS_RING_EFFECTS = new Set(["power_ring", "defense_ring", "life_ring"]);

describe("力・守り・命の指輪の生成値", () => {
  it("生成時に＋1〜3を付け、他の指輪は変更しない", () => {
    expect(applyGeneratedRingPlus({ type: "ring", effect: "power_ring", plus: 0 }, () => 0).plus).toBe(1);
    expect(applyGeneratedRingPlus({ type: "ring", effect: "life_ring", plus: 0 }, () => 0.99).plus).toBe(3);
    expect(applyGeneratedRingPlus({ type: "ring", effect: "defense_ring", plus: 2 }, () => 0).plus).toBe(2);
    expect(applyGeneratedRingPlus({ type: "ring", effect: "float_ring" }, () => 0).plus).toBeUndefined();
  });

  it("デバッグ用に並ぶ指輪も＋値付きで生成する", () => {
    for (const floor of [genDebugDungeon(), genDebugDungeonFloor2()]) {
      const rings = floor.items.filter(item => PLUS_RING_EFFECTS.has(item.effect));
      expect(rings.length).toBeGreaterThan(0);
      expect(rings.every(item => item.plus >= 1 && item.plus <= 3)).toBe(true);
    }
  });
});
