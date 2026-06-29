import { sortWarehouseItems } from "./utils.js";

/* ===== HUB WAREHOUSE PURE LOGIC =====
   拠点の倉庫・ショップまわりの判定（テスト可能な純関数） */

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

/** ダンジョン帰還時：倉庫に収まる分だけ持ち帰り品をマージする（超過分は追加しない） */
export function mergeReturnItemsToWarehouse(warehouse, maxCapacity, returnItems) {
  const existing = warehouse || [];
  const max = maxCapacity || 100;
  const candidates = (returnItems || [])
    .filter((it) => it && it.type !== "goal")
    .map((it) => ({ ...it }));
  const freeSlots = Math.max(0, max - existing.length);
  const toAdd = candidates.slice(0, freeSlots);
  const overflow = candidates.length - toAdd.length;
  return {
    warehouse: sortWarehouseItems([...existing, ...toAdd]),
    added: toAdd.length,
    overflow,
  };
}