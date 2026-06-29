import { describe, it, expect } from "vitest";
import { HUB_SHOP_POOL, rollHubShopStock } from "../hubShop.js";

describe("rollHubShopStock", () => {
  it("常に1点だけ返す", () => {
    const stock = rollHubShopStock();
    expect(stock).toHaveLength(1);
    expect(stock[0].name).toBeTruthy();
  });

  it("プールから選ばれる", () => {
    const names = new Set(HUB_SHOP_POOL.map((x) => x.name));
    const stock = rollHubShopStock(() => 0);
    expect(names.has(stock[0].name)).toBe(true);
  });

  it("決定論的RNGで同じ結果になる", () => {
    let i = 0;
    const seq = [0, 0.5];
    const rng = () => seq[i++];
    const a = rollHubShopStock(rng);
    i = 0;
    const b = rollHubShopStock(rng);
    expect(a[0].name).toBe(b[0].name);
  });
});