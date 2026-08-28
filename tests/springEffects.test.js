import { describe, expect, it } from "vitest";
import { placeItemAt } from "../items.js";
import { SPRING_CONFUSION_TURNS, springGoldRange } from "../springRules.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("泉の効果", () => {
  it("混乱は常に5ターン", () => {
    expect(SPRING_CONFUSION_TURNS).toBe(5);
  });

  it("泉の金貨は通常金貨の上限の約2倍まで", () => {
    expect(springGoldRange(0)).toEqual({ min: 30, max: 200 });
    expect(springGoldRange(5)).toEqual({ min: 30, max: 500 });
  });

  it("泉から飛び出すアイテムは泉の中心を避けて隣へ落とせる", () => {
    const dg = makeEmptyDg({ springs: [{ x: 5, y: 5 }] });
    const p = makePlayer({ x: 5, y: 5 });
    const item = { name: "水", type: "potion", tile: 16 };

    placeItemAt(dg, p.x, p.y, item, [], new Set(), 0, p, p.x, p.y, false, true);

    expect(dg.items).toHaveLength(1);
    expect(dg.items[0]).not.toMatchObject({ x: 5, y: 5 });
    expect(Math.max(Math.abs(dg.items[0].x - p.x), Math.abs(dg.items[0].y - p.y))).toBe(1);
    expect(dg.map[dg.items[0].y][dg.items[0].x]).toBe(T.FLOOR);
  });
});
