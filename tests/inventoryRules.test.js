import { describe, expect, it } from "vitest";
import { canUseInventoryItem, compareInventoryItems, getInventoryUseLabel, sortInventoryItems } from "../inventoryRules.js";

describe("sortInventoryItems", () => {
  it("種別順、その中では日本語名順にその場で並べ替える", () => {
    const items = [
      { type: "potion", name: "回復薬" },
      { type: "weapon", name: "短剣" },
      { type: "weapon", name: "青銅の剣" },
      { type: "unknown", name: "不思議な物" },
      { type: "armor", name: "革の鎧" },
    ];
    expect(sortInventoryItems(items)).toBe(items);
    expect(items.map((item) => item.type)).toEqual(["weapon", "weapon", "armor", "potion", "unknown"]);
    expect(items.slice(0, 2).map((item) => item.name)).toEqual(["青銅の剣", "短剣"]);
  });

  it("同一種別で同名なら比較結果は 0", () => {
    expect(compareInventoryItems({ type: "food", name: "パン" }, { type: "food", name: "パン" })).toBe(0);
  });
});

describe("inventory use rules", () => {
  it("装備中の装備品は外すラベルになる", () => {
    const sword = { type: "weapon", name: "短剣" };
    const ring = { type: "ring", name: "守りの指輪" };
    const player = { weapon: sword, rings: [ring] };
    expect(getInventoryUseLabel(sword, player)).toBe("外す");
    expect(getInventoryUseLabel(ring, player)).toBe("外す");
    expect(getInventoryUseLabel({ type: "armor", name: "革の鎧" }, player)).toBe("装備");
  });

  it("行動ごとのラベルと使用可否を返す", () => {
    expect(getInventoryUseLabel({ type: "food" })).toBe("食べる");
    expect(getInventoryUseLabel({ type: "scroll" })).toBe("読む");
    expect(getInventoryUseLabel({ type: "pot" })).toBe("入れる");
    expect(canUseInventoryItem({ type: "potion" })).toBe(true);
    expect(canUseInventoryItem({ type: "wand" })).toBe(false);
  });
});
