import { describe, it, expect } from "vitest";
import {
  validateHubShopPurchase,
  validateBulkToWarehouse,
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