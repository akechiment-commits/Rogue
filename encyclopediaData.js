import { GEM_TYPES, ITEMS, MAGIC_MARKER, POTS, RINGS, SPELLBOOKS, WANDS } from "./items.js";

export const ITEM_CATEGORY_DEFS = Object.freeze([
  { id: "food", label: "食料", types: ["food"] },
  { id: "potion", label: "薬", types: ["potion"] },
  { id: "scroll", label: "巻物", types: ["scroll"] },
  { id: "wand", label: "杖", types: ["wand"] },
  { id: "pen", label: "ペン", types: ["pen"] },
  { id: "marker", label: "魔法の筆", types: ["marker"] },
  { id: "spellbook", label: "魔法書", types: ["spellbook"] },
  { id: "weapon", label: "武器", types: ["weapon"] },
  { id: "armor", label: "防具", types: ["armor"] },
  { id: "arrow", label: "矢・石", types: ["arrow"] },
  { id: "pot", label: "壺", types: ["pot"] },
  { id: "ring", label: "指輪", types: ["ring"] },
  { id: "gem", label: "宝石", types: ["gem"] },
  { id: "bottle", label: "瓶・水", types: ["bottle"] },
  { id: "other", label: "その他", types: [] },
]);

const ITEM_CATALOG = [
  ...ITEMS,
  ...WANDS,
  ...POTS,
  ...RINGS,
  ...GEM_TYPES,
  ...SPELLBOOKS,
  MAGIC_MARKER,
];

const itemKey = (item) => item.effect || `${item.type}_${item.name}`;
const ITEM_ORDER = new Map();
const ITEM_BY_KEY = new Map();
for (const [index, item] of ITEM_CATALOG.entries()) {
  const key = itemKey(item);
  if (!ITEM_ORDER.has(key)) ITEM_ORDER.set(key, index);
  if (!ITEM_BY_KEY.has(key)) ITEM_BY_KEY.set(key, item);
}

export function itemCategoryForType(type) {
  return ITEM_CATEGORY_DEFS.find((category) => category.types.includes(type))?.id || "other";
}

export function getItemCategoryEntries(discoveredItems = {}, categoryId = "food") {
  const category = ITEM_CATEGORY_DEFS.find((entry) => entry.id === categoryId) || ITEM_CATEGORY_DEFS[0];
  return Object.entries(discoveredItems || {})
    .map(([key, value]) => ({ key, ...value }))
    .filter((entry) => category.id === "other"
      ? !ITEM_CATEGORY_DEFS.some((candidate) => candidate.id !== "other" && candidate.types.includes(entry.type))
      : category.types.includes(entry.type))
    .sort((a, b) => {
      const ao = ITEM_ORDER.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const bo = ITEM_ORDER.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      return ao - bo || String(a.name || "").localeCompare(String(b.name || ""), "ja");
    });
}

export function getItemCatalogEntry(key, fallback = null) {
  return ITEM_BY_KEY.get(key) || fallback;
}
