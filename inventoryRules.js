export const INVENTORY_TYPE_ORDER = [
  "weapon",
  "armor",
  "ring",
  "arrow",
  "potion",
  "scroll",
  "food",
  "wand",
  "marker",
  "pen",
  "pot",
  "bottle",
  "gold",
];

export function compareInventoryItems(a, b) {
  const aOrder = INVENTORY_TYPE_ORDER.indexOf(a.type);
  const bOrder = INVENTORY_TYPE_ORDER.indexOf(b.type);
  const aCategory = aOrder >= 0 ? aOrder : INVENTORY_TYPE_ORDER.length;
  const bCategory = bOrder >= 0 ? bOrder : INVENTORY_TYPE_ORDER.length;
  if (aCategory !== bCategory) return aCategory - bCategory;
  return a.name.localeCompare(b.name, "ja");
}

/** インベントリ配列を従来どおりその場で種別順・名前順に並べ替える。 */
export function sortInventoryItems(items) {
  return items.sort(compareInventoryItems);
}
