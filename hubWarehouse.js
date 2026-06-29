import { sortWarehouseItems } from "./utils.js";

/* ===== HUB WAREHOUSE PURE LOGIC =====
   拠点の倉庫・ショップまわりの判定（テスト可能な純関数） */

/** 倉庫が容量オーバー状態か（帰還時はオーバー可、通常操作・出発は不可） */
export function isWarehouseOverCapacity(warehouseCount, maxCapacity) {
  return warehouseCount > (maxCapacity || 100);
}

/** 新規冒険の出発可否 */
export function canStartAdventure(warehouseCount, maxCapacity) {
  if (isWarehouseOverCapacity(warehouseCount, maxCapacity)) {
    return { ok: false, reason: "warehouse_over_capacity" };
  }
  return { ok: true };
}

/** 拠点ショップでの購入可否 */
export function validateHubShopPurchase(whCount, whMax, gold, price) {
  if (gold < price) return { ok: false, reason: "insufficient_gold" };
  if (whCount >= whMax) return { ok: false, reason: "warehouse_full" };
  return { ok: true };
}

/** 持参品をまとめて倉庫へ移動できるか */
export function validateBulkToWarehouse(warehouseLen, maxCapacity, moveCount) {
  if (moveCount <= 0) return { ok: false, reason: "nothing_selected" };
  if (warehouseLen + moveCount > maxCapacity) {
    return {
      ok: false,
      reason: "insufficient_space",
      freeSlots: maxCapacity - warehouseLen,
      moveCount,
    };
  }
  return { ok: true };
}

/** ダンジョン帰還時：持ち帰り品をすべて倉庫へ追加（容量オーバー可） */
export function mergeReturnItemsToWarehouse(warehouse, maxCapacity, returnItems) {
  const existing = warehouse || [];
  const max = maxCapacity || 100;
  const toAdd = (returnItems || [])
    .filter((it) => it && it.type !== "goal")
    .map((it) => ({ ...it }));
  const merged = sortWarehouseItems([...existing, ...toAdd]);
  return {
    warehouse: merged,
    added: toAdd.length,
    overCapacity: merged.length > max,
  };
}