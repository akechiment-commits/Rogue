import { describe, it, expect } from "vitest";
import { RINGS, itemPrice } from "../items.js";

describe("黄金の指輪の実装", () => {
  it("RINGS に黄金の指輪が正しく定義されている", () => {
    const ring = RINGS.find((r) => r.name === "黄金の指輪");
    expect(ring).toBeDefined();
    expect(ring.effect).toBe("gold_ring");
    expect(ring.sellPrice).toBe(10000);
    expect(ring.rarity).toBe("B");
    expect(ring.weight).toBe(2);
    expect(ring.tile).toBe(60);
  });

  it("売却額が10000Gとして評価される", () => {
    const ring = { name: "黄金の指輪", type: "ring", effect: "gold_ring", sellPrice: 10000 };
    expect(itemPrice(ring)).toBe(10000);
  });
});
