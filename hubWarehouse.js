import { sortWarehouseItems } from "./utils.js";

/* ===== HUB WAREHOUSE PURE LOGIC =====
   拠点の倉庫・ショップまわりの判定（テスト可能な純関数） */

/** 銀行から次の冒険へ持ち込む金額を、0〜銀行残高の整数へ丸める */
export function clampCarryGold(bankGold, requestedGold) {
  const bank = Math.max(0, Math.floor(Number(bankGold) || 0));
  const requested = Math.max(0, Math.floor(Number(requestedGold) || 0));
  return Math.min(bank, requested);
}

/** 冒険中の所持金を帰還時に銀行へ預ける（死亡時の引き継ぎ率にも対応） */
export function depositDungeonGold(bankGold, dungeonGold, rate = 1) {
  const bank = Math.max(0, Math.floor(Number(bankGold) || 0));
  const gold = Math.max(0, Math.floor(Number(dungeonGold) || 0));
  const safeRate = Math.max(0, Math.min(1, Number(rate) || 0));
  const deposited = Math.floor(gold * safeRate);
  return { bankGold: bank + deposited, deposited };
}

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
