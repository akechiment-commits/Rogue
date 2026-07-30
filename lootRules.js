/** レア度 → weight（同レア度は同 weight。E が最コモン、S が最レア） */
export const RARITY_WEIGHT = { E: 12, D: 8, C: 4, B: 2, A: 1, S: 0.05 };
export const RARITY_RANK = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };
export const RARITY_ORDER = ["E", "D", "C", "B", "A", "S"];

export function rarityAtLeast(minRarity) {
  const minimum = RARITY_RANK[minRarity] ?? 0;
  return RARITY_ORDER.filter((rarity) => (RARITY_RANK[rarity] ?? 0) >= minimum);
}

export function isRarityAtLeast(item, minRarity) {
  if (!item?.rarity) return false;
  return (RARITY_RANK[item.rarity] ?? -1) >= (RARITY_RANK[minRarity] ?? 0);
}

/** weight フィールドを使った重み付き抽選 */
export function pickWeighted(items, randomFn = Math.random) {
  const pool = items.filter((item) => (item.weight ?? 1) > 0);
  if (pool.length === 0) return items[Math.floor(randomFn() * items.length)];
  const total = pool.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  let roll = randomFn() * total;
  for (const item of pool) {
    roll -= item.weight ?? 1;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
}

/** 任意の重みキー w を使った抽選 */
export function pickByWeight(entries, randomFn = Math.random) {
  const total = entries.reduce((sum, entry) => sum + entry.w, 0);
  let roll = randomFn() * total;
  for (const entry of entries) {
    roll -= entry.w;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

/** 店・変化・ドロップで「いいもの寄り」にする運枠。 */
export const LOOT_LUCK = {
  floor: { chance: 0, rarities: null },
  shop: { chance: 0.18, rarities: rarityAtLeast("C") },
  change: { chance: 0.18, rarities: rarityAtLeast("C") },
  change_blessed: { chance: 0.36, rarities: rarityAtLeast("C") },
  change_cursed: { chance: 0.09, rarities: rarityAtLeast("C") },
  drop: { chance: 0.10, rarities: rarityAtLeast("D") },
};

/** @deprecated 均等枠は廃止。互換のため 0 固定で残す */
export const LOOT_UNIFORM_CHANCE = { floor: 0, change: 0, shop: 0, drop: 0 };

/** 一般ランダムアイテムドロップの確率（固有ドロップは別） */
export const MONSTER_RANDOM_DROP_RATE = { plainOrSplitter: 0.02, skilled: 0.05 };

export function monsterRandomDropChance(monster) {
  if (!monster?.subtype || monster.subtype === "splitter") return MONSTER_RANDOM_DROP_RATE.plainOrSplitter;
  return MONSTER_RANDOM_DROP_RATE.skilled;
}

/** shop/change/drop は一定確率で上レア帯に寄る重み付き抽選。 */
export function pickLootFromPool(pool, context = "floor", randomFn = Math.random) {
  if (!pool || pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const luck = LOOT_LUCK[context] || LOOT_LUCK.floor;
  if (luck.chance > 0 && luck.rarities?.length && randomFn() < luck.chance) {
    const rarities = new Set(luck.rarities);
    const good = pool.filter((item) => item && rarities.has(item.rarity));
    if (good.length > 0) return pickWeighted(good, randomFn);
  }
  return pickWeighted(pool, randomFn);
}
