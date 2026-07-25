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

export function getInventoryUseLabel(item, player) {
  if (item.type === "weapon") return player?.weapon === item ? "外す" : "装備";
  if (item.type === "armor") return player?.armor === item ? "外す" : "装備";
  if (item.type === "arrow") return player?.arrow === item ? "外す" : "装備";
  if (item.type === "ring") return (player?.rings || []).includes(item) ? "外す" : "装備";
  if (item.type === "food") return "食べる";
  if (item.type === "scroll") return "読む";
  if (item.type === "pen") return "描く";
  if (item.type === "pot") return "入れる";
  return "使う";
}

export function canUseInventoryItem(item) {
  return ["potion", "food", "scroll", "weapon", "armor", "arrow", "ring", "pot", "pen"].includes(item.type);
}
