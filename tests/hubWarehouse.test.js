import { describe, it, expect } from "vitest";
import {
  validateHubShopPurchase,
  validateBulkToWarehouse,
  mergeReturnItemsToWarehouse,
} from "../hubWarehouse.js";

describe("validateHubShopPurchase", () => {
  it("条件を満たせば購入可能", () => {
    expect(validateHubShopPurchase(50, 100, 1000, 100)).toEqual({ ok: true });
  });

  it("所持金不足なら拒否", () => {
    expect(validateHubShopPurchase(50, 100, 50, 100)).toEqual({
      ok: false,
      reason: "insufficient_gold",
    });
  });

  it("倉庫満杯なら拒否（代金だけ消費するバグの防止）", () => {
    expect(validateHubShopPurchase(100, 100, 1000, 100)).toEqual({
      ok: false,
      reason: "warehouse_full",
    });
  });
});

describe("validateBulkToWarehouse", () => {
  it("空きがあれば移動可能", () => {
    expect(validateBulkToWarehouse(98, 100, 2)).toEqual({ ok: true });
  });

  it("1個でも溢れるなら拒否", () => {
    expect(validateBulkToWarehouse(99, 100, 2)).toEqual({
      ok: false,
      reason: "insufficient_space",
      freeSlots: 1,
      moveCount: 2,
    });
  });

  it("選択0個なら拒否", () => {
    expect(validateBulkToWarehouse(50, 100, 0)).toEqual({
      ok: false,
      reason: "nothing_selected",
    });
  });
});

describe("mergeReturnItemsToWarehouse", () => {
  it("空き分だけ持ち帰り品を追加する", () => {
    const wh = Array.from({ length: 98 }, (_, i) => ({ name: `item${i}`, type: "potion" }));
    const returns = [{ name: "薬A", type: "potion" }, { name: "薬B", type: "potion" }, { name: "薬C", type: "potion" }];
    const result = mergeReturnItemsToWarehouse(wh, 100, returns);
    expect(result.warehouse).toHaveLength(100);
    expect(result.added).toBe(2);
    expect(result.overflow).toBe(1);
  });

  it("ゴールアイテムは倉庫に入れない", () => {
    const result = mergeReturnItemsToWarehouse([], 100, [
      { name: "輝く宝玉", type: "goal" },
      { name: "回復薬", type: "potion" },
    ]);
    expect(result.warehouse).toHaveLength(1);
    expect(result.warehouse[0].name).toBe("回復薬");
    expect(result.overflow).toBe(0);
  });

  it("倉庫満杯なら何も追加しない", () => {
    const wh = Array.from({ length: 100 }, (_, i) => ({ name: `item${i}`, type: "food" }));
    const result = mergeReturnItemsToWarehouse(wh, 100, [{ name: "パン", type: "food" }]);
    expect(result.warehouse).toHaveLength(100);
    expect(result.added).toBe(0);
    expect(result.overflow).toBe(1);
  });
});