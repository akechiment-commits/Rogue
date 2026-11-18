import { describe, it, expect } from "vitest";
import { HUB_SHOP_POOL, rollHubShopStock } from "../hubShop.js";

describe("rollHubShopStock", () => {
  it("帰還ごとに5〜9点を返す", () => {
    const stock = rollHubShopStock();
    expect(stock.length).toBeGreaterThanOrEqual(5);
    expect(stock.length).toBeLessThanOrEqual(9);
    expect(stock.every((item) => item.name)).toBe(true);
    expect(new Set(stock.map((item) => item.name)).size).toBe(stock.length);
  });

  it("プールから選ばれる", () => {
    const names = new Set(HUB_SHOP_POOL.map((x) => x.name));
    const stock = rollHubShopStock(() => 0);
    expect(stock).toHaveLength(5);
    expect(stock.every((item) => names.has(item.name))).toBe(true);
  });

  it("杖・ペン・壺は生成時の回数／容量ロールを通る", () => {
    const seen = { wand: 0, pen: 0, pot: 0 };
    for (let n = 0; n < 300; n++) {
      for (const item of rollHubShopStock()) {
        if (item.type === "wand") {
          seen.wand++;
          expect(Number.isFinite(item.charges)).toBe(true);
          expect(item.charges).toBeGreaterThanOrEqual(1);
        } else if (item.type === "pen") {
          seen.pen++;
          expect(item.charges).toBeGreaterThanOrEqual(1);
          expect(item.charges).toBeLessThanOrEqual(5);
        } else if (item.type === "pot") {
          seen.pot++;
          expect(item.contents).toEqual([]);
          expect(item.capacity).toBeGreaterThanOrEqual(1);
        }
      }
    }
    expect(seen.wand).toBeGreaterThan(0);
    expect(seen.pen).toBeGreaterThan(0);
    expect(seen.pot).toBeGreaterThan(0);
  });

  it("決定論的RNGで同じ結果になる", () => {
    let i = 0;
    const seq = Array(32).fill(0);
    const rng = () => seq[i++];
    const a = rollHubShopStock(rng);
    i = 0;
    const b = rollHubShopStock(rng);
    expect(a.map((item) => item.name)).toEqual(b.map((item) => item.name));
  });
});
