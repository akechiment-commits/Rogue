import { describe, it, expect } from "vitest";
import {
  validateHubShopPurchase,
  validateBulkToWarehouse,
  mergeReturnItemsToWarehouse,
  isWarehouseOverCapacity,
  canStartAdventure,
} from "../hubWarehouse.js";

describe("isWarehouseOverCapacity", () => {
  it("上限ちょうどはオーバーではない", () => {
    expect(isWarehouseOverCapacity(100, 100)).toBe(false);
  });

  it("上限を1つ超えたらオーバー", () => {
    expect(isWarehouseOverCapacity(101, 100)).toBe(true);
  });
});

describe("canStartAdventure", () => {
  it("倉庫が上限以内なら出発可能", () => {
    expect(canStartAdventure(100, 100)).toEqual({ ok: true });
  });

  it("倉庫オーバー中は出発不可", () => {
    expect(canStartAdventure(101, 100)).toEqual({
      ok: false,
      reason: "warehouse_over_capacity",
    });
  });
});

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
  it("帰還時は容量を超えてもすべて追加する", () => {
    const wh = Array.from({ length: 98 }, (_, i) => ({ name: `item${i}`, type: "potion" }));
    const returns = [
      { name: "薬A", type: "potion" },
      { name: "薬B", type: "potion" },
      { name: "薬C", type: "potion" },
    ];
    const result = mergeReturnItemsToWarehouse(wh, 100, returns);
    expect(result.warehouse).toHaveLength(101);
    expect(result.added).toBe(3);
    expect(result.overCapacity).toBe(true);
  });

  it("ゴールアイテムは倉庫に入れない", () => {
    const result = mergeReturnItemsToWarehouse([], 100, [
      { name: "輝く宝玉", type: "goal" },
      { name: "回復薬", type: "potion" },
    ]);
    expect(result.warehouse).toHaveLength(1);
    expect(result.warehouse[0].name).toBe("回復薬");
    expect(result.overCapacity).toBe(false);
  });

  it("倉庫満杯でも帰還品はすべて追加する", () => {
    const wh = Array.from({ length: 100 }, (_, i) => ({ name: `item${i}`, type: "food" }));
    const result = mergeReturnItemsToWarehouse(wh, 100, [{ name: "パン", type: "food" }]);
    expect(result.warehouse).toHaveLength(101);
    expect(result.added).toBe(1);
    expect(result.overCapacity).toBe(true);
  });
});