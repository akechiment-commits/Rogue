import { describe, it, expect } from "vitest";
import { sortWarehouseItems, hasAbility, getShops } from "../utils.js";

describe("sortWarehouseItems", () => {
  it("種別順→名前順でソートする", () => {
    const items = [
      { name: "回復薬", type: "potion" },
      { name: "短剣", type: "weapon" },
      { name: "革の鎧", type: "armor" },
    ];
    const sorted = sortWarehouseItems(items);
    expect(sorted.map(i => i.type)).toEqual(["weapon", "armor", "potion"]);
  });
});

describe("hasAbility", () => {
  it("単体 ability と abilities 配列の両方を判定する", () => {
    expect(hasAbility({ ability: "fire_resist" }, "fire_resist")).toBe(true);
    expect(hasAbility({ abilities: ["thorn", "dodge"] }, "dodge")).toBe(true);
    expect(hasAbility({ ability: "thorn" }, "dodge")).toBe(false);
    expect(hasAbility(null, "thorn")).toBe(false);
  });
});

describe("getShops", () => {
  it("shops / shop / 空の順で正規化する", () => {
    const a = { shops: [{ x: 1 }, { x: 2 }] };
    const b = { shop: { x: 3 } };
    const c = {};
    expect(getShops(a)).toHaveLength(2);
    expect(getShops(b)).toEqual([{ x: 3 }]);
    expect(getShops(c)).toEqual([]);
  });
});