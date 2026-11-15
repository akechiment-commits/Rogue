import { getIdentKey, isPreservationPot, potOccupancyCount } from "./items.js";
import { canUseInventoryItem, getInventoryUseLabel } from "./inventoryRules.js";

/** 保存の壺の中身に対して直接実行できない種別（直接装備・壺の入れ子）。 */
export const POT_NO_DIRECT_USE_TYPES = new Set(["weapon", "armor", "arrow", "ring", "pot"]);

/**
 * 保存の壺の中身アイテムに対するサブメニュー行動一覧を返す。
 * 直接装備（武器・防具・矢・指輪）および壺への直接投入は含めない。
 */
export function getPotItemActions(item, { canUseFn, useLabelFn, ident, player } = {}) {
  if (!item) return [];
  const actions = [];
  const canUse = canUseFn ? canUseFn(item) : canUseInventoryItem(item);
  if (canUse && !POT_NO_DIRECT_USE_TYPES.has(item.type)) {
    const label = useLabelFn ? useLabelFn(item) : getInventoryUseLabel(item, player);
    actions.push({ id: "use", label });
  }
  if (item.type === "spellbook") actions.push({ id: "readSpellbook", label: "読む" });
  if (item.type === "arrow") actions.push({ id: "shoot", label: "射る" });
  if (item.type === "wand") {
    actions.push({ id: "wave", label: "振る" });
    actions.push({ id: "breakWand", label: "壊す" });
  }
  if (item.type === "marker") actions.push({ id: "marker", label: "書く" });
  actions.push({ id: "take", label: "出す" });
  if (!item.noDrop) actions.push({ id: "drop", label: "置く" });
  if (!item.noThrow) {
    actions.push({ id: "throw", label: item.type === "arrow" ? "投げる(束)" : "投げる" });
  }
  actions.push({ id: "desc", label: "説明" });
  const identKey = getIdentKey(item);
  if (identKey && ident && !ident.has(identKey)) {
    actions.push({ id: "nickname", label: "名付ける" });
  }
  return actions;
}

/**
 * 保存の壺の中身を一時的に所持品末尾へ退避し、復元用エントリを返す。
 * 所持品が上限（30個等）に達していても直接操作用に一時退避できる。
 */
export function stagePotItemToInventory(player, pot, contentIdx) {
  if (!player || !Array.isArray(player.inventory) || !isPreservationPot(pot) || !Array.isArray(pot.contents)) {
    return null;
  }
  if (!Number.isInteger(contentIdx) || contentIdx < 0 || contentIdx >= pot.contents.length) {
    return null;
  }
  const [item] = pot.contents.splice(contentIdx, 1);
  if (!item) return null;
  const tmpIdx = player.inventory.length;
  player.inventory.push(item);
  return { item, pot, contentIdx, tmpIdx };
}

/**
 * 一時退避していた壺の中身がまだ所持品に残っていれば、元の保存の壺へ戻す。
 * 壺が破壊・消滅・満杯・別フロア置き去り等で戻せない場合は足元へ落とす。
 */
export function restorePotReturnItem({ player, dungeon, entry, placeItemFn, dnameFn, msgs = [] } = {}) {
  if (!player || !Array.isArray(player.inventory) || !entry?.item) {
    return { returned: false, reason: "invalid" };
  }
  const { item, pot, contentIdx } = entry;
  const invIdx = player.inventory.indexOf(item);
  if (invIdx === -1) {
    return { returned: false, reason: "already_removed" };
  }
  player.inventory.splice(invIdx, 1);
  if (player.weapon === item) player.weapon = null;
  if (player.armor === item) player.armor = null;
  if (player.arrow === item) player.arrow = null;
  if (Array.isArray(player.rings)) {
    const ringIdx = player.rings.indexOf(item);
    if (ringIdx !== -1) player.rings.splice(ringIdx, 1);
  }

  const potInInv = player.inventory.includes(pot);
  const potOnFloor = !potInInv && Array.isArray(dungeon?.items) && dungeon.items.includes(pot);
  const hasRoom = isPreservationPot(pot) && Array.isArray(pot.contents) && potOccupancyCount(pot) < pot.capacity;

  if ((potInInv || potOnFloor) && hasRoom) {
    delete item.x;
    delete item.y;
    const insertAt = Math.max(0, Math.min(Number.isInteger(contentIdx) ? contentIdx : pot.contents.length, pot.contents.length));
    pot.contents.splice(insertAt, 0, item);
    return { returned: true, destination: "pot" };
  }

  if (placeItemFn) {
    placeItemFn(item);
  } else if (dungeon && Array.isArray(dungeon.items)) {
    item.x = player.x;
    item.y = player.y;
    dungeon.items.push(item);
  }
  const itemLabel = dnameFn ? dnameFn(item) : (item.name || "アイテム");
  msgs.push(`${itemLabel}は壺に戻せず足元に落ちた。`);
  return { returned: true, destination: "floor" };
}
