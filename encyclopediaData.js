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
  { id: "goal", label: "キー", types: ["goal"] },
  { id: "other", label: "その他", types: [] },
]);

export const NO_ENCYCLOPEDIA_INFO = "特に情報はない。";

const KEY_ITEM_CATALOG = [
  { name: "訓練の証", type: "goal", desc: "最深部で手に入れ、B1Fの上り階段から地上へ持ち帰ればチュートリアル完了。" },
  { name: "輝く宝玉", type: "goal", desc: "地上に持ち帰れば初心者ダンジョン踏破の証となる。" },
  { name: "深紅の魔石", type: "goal", desc: "強大な魔力を秘めた石。中級者ダンジョンの最深部から地上へ持ち帰ろう。" },
  { name: "伝説の王冠", type: "goal", desc: "かつての王が残した冠。上級者ダンジョンの最深部から地上へ持ち帰ろう。" },
  { name: "深淵の禁書", type: "goal", desc: "深淵の底に封じられた禁断の書。地上に持ち帰れば真の伝説の冒険者だ。" },
];

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
const KEY_ITEM_ORDER = new Map();
const KEY_ITEM_BY_NAME = new Map();
for (const [index, item] of KEY_ITEM_CATALOG.entries()) {
  KEY_ITEM_ORDER.set(item.name, index);
  KEY_ITEM_BY_NAME.set(item.name, item);
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
      const order = category.id === "goal" ? KEY_ITEM_ORDER : ITEM_ORDER;
      const ao = order.get(category.id === "goal" ? a.name : a.key) ?? Number.MAX_SAFE_INTEGER;
      const bo = order.get(category.id === "goal" ? b.name : b.key) ?? Number.MAX_SAFE_INTEGER;
      return ao - bo || String(a.name || "").localeCompare(String(b.name || ""), "ja");
    });
}

export function getItemCatalogEntry(key, fallback = null) {
  return ITEM_BY_KEY.get(key) || fallback;
}

export function getKeyItemDescription(name) {
  return KEY_ITEM_BY_NAME.get(name)?.desc || null;
}
