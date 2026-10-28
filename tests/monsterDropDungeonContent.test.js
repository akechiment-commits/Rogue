import { afterEach, describe, expect, it, vi } from "vitest";
import { ITEMS, RINGS, WANDS, monsterDrop } from "../items.js";
import { lootAllowedInDungeon } from "../dungeonContent.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

function weightedRollFor(target, pool) {
  const weighted = pool.filter((item) => !item.wallDropOnly && (item.weight ?? 1) > 0);
  const total = weighted.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  let before = 0;
  for (const item of weighted) {
    if (item === target) return (before + (item.weight ?? 1) * 0.5) / total;
    before += item.weight ?? 1;
  }
  throw new Error("target is not in weighted pool");
}

describe("敵ドロップのダンジョン別制限", () => {
  it.each(["power_ring", "defense_ring", "life_ring"])("新規ドロップの%sには床へ置く前に＋値を付ける", effect => {
    const ring = RINGS.find(item => item.effect === effect);
    const pool = [...ITEMS.filter(item => item.type !== "gold"), ...WANDS, ...RINGS];
    vi.spyOn(Math, "random").mockReturnValue(0.5)
      .mockReturnValueOnce(0.5).mockReturnValueOnce(weightedRollFor(ring, pool));
    const dg = makeEmptyDg();
    monsterDrop({ name: "フクマル", subtype: "runner", x: 5, y: 5 }, dg, [], makePlayer());
    expect(dg.items).toHaveLength(1);
    expect(dg.items[0].effect).toBe(effect);
    expect(dg.items[0].plus).toBe(2);
    expect(ring.plus).toBe(0);
  });
  it("初心者の敵ドロップから対象外の鈍亀の指輪を除外する", () => {
    const slowRing = RINGS.find((item) => item.effect === "slow_ring");
    const fullPool = [...ITEMS.filter((item) => item.type !== "gold"), ...WANDS, ...RINGS];
    const selectionRoll = weightedRollFor(slowRing, fullPool);
    const originalRandom = Math.random;
    let call = 0;
    Math.random = () => (call++ === 0 ? 0.5 : selectionRoll);
    try {
      const dg = makeEmptyDg({ dungeonType: "beginner" });
      const player = makePlayer({ depth: 1 });
      monsterDrop({ name: "フクマル", subtype: "runner", x: 5, y: 5 }, dg, [], player);
      expect(dg.items).toHaveLength(1);
      expect(dg.items[0].name).not.toBe("鈍亀の指輪");
      expect(lootAllowedInDungeon(dg.items[0], "beginner", 1)).toBe(true);
    } finally {
      Math.random = originalRandom;
    }
  });
});
