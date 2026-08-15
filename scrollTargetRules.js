import { getIdentKey } from "./items.js";

const PLUS_RING_EFFECTS = new Set(["power_ring", "defense_ring", "life_ring"]);
const BC_ONLY_TYPES = new Set(["weapon", "armor", "food"]);

/**
 * 選択式の巻物で表示・選択できるインベントリアイテムを判定する。
 * 未識別の巻物は効果を知らない状態で使うため、金貨と使用中の巻物自身を
 * 除く全アイテムを候補にし、識別済みの巻物だけ効果対象に絞り込む。
 */
export function isScrollTargetCandidate(mode, item, index, ident = new Set()) {
  if (!mode || !item || item.type === "gold" || index === mode.scrollIdx) return false;
  if (mode.wasUnknown) return true;

  switch (mode.mode) {
    case "bless":
    case "curse":
    case "duplicate":
    case "sell_item":
    case "transform_item":
      return true;
    case "forge_item":
      return item.type === "weapon" || item.type === "armor";
    case "pot_extract":
      return item.type === "pot";
    case "weapon_up":
      return item.type === "weapon" || (item.type === "ring" && PLUS_RING_EFFECTS.has(item.effect));
    case "armor_up":
      return item.type === "armor" || (item.type === "ring" && PLUS_RING_EFFECTS.has(item.effect));
    case "identify": {
      if (mode.showAll) return true;
      if (BC_ONLY_TYPES.has(item.type)) return !item.fullIdent && !item.bcKnown;
      const key = getIdentKey(item);
      return !!key && (!ident.has(key) || (!item.fullIdent && !item.bcKnown));
    }
    case "unidentify": {
      if (BC_ONLY_TYPES.has(item.type)) return !!item.fullIdent || !!item.bcKnown;
      const key = getIdentKey(item);
      return !!key && ident.has(key);
    }
    default:
      return false;
  }
}

export function hasScrollTargetCandidate(mode, inventory, ident = new Set()) {
  return inventory.some((item, index) => isScrollTargetCandidate(mode, item, index, ident));
}
