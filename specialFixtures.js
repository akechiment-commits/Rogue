/*
 * 次元宝物庫・祭壇など、通常の床オブジェクトとは別に
 * フロア全体の状態を持つ特殊ギミックの共通ロジック。
 */
import { T } from "./utils.js";

/* 宝物庫はレアな品ほど短時間で消える。rarity未設定はE相当。 */
export const DIMENSIONAL_VAULT_ITEM_TURNS = 20;
export const DIMENSIONAL_VAULT_TURNS_BY_RARITY = Object.freeze({
  E: 20,
  D: 16,
  C: 12,
  B: 9,
  A: 6,
  S: 4,
});

export function dimensionalVaultItemTurns(item) {
  return DIMENSIONAL_VAULT_TURNS_BY_RARITY[item?.rarity] ?? DIMENSIONAL_VAULT_ITEM_TURNS;
}

export const SPECIAL_FIXTURE_RATES = Object.freeze({
  dimensionalVault: 0.03,
  wanderingMerchant: 0.05,
  altar: 0.05,
});

/* デバッグダンジョンでは、実際に触って挙動を確認しやすいよう大幅に増やす。 */
export const DEBUG_SPECIAL_FIXTURE_RATES = Object.freeze({
  dimensionalVault: 0.50,
  wanderingMerchant: 0.50,
  altar: 0.50,
});

/* 奉納回数に応じた返礼品の段階。最初は冒険を立て直しやすい消耗品を優先する。 */
const ALTAR_REWARD_STAGES = Object.freeze([
  Object.freeze({
    min: 1,
    max: 2,
    categories: Object.freeze({ potion: 35, scroll: 25, arrow: 15, other: 25 }),
    rarity: Object.freeze({ E: 50, D: 30, C: 15, B: 4, A: 0.8, S: 0.2 }),
  }),
  Object.freeze({
    min: 3,
    max: 5,
    categories: Object.freeze({ potion: 28, scroll: 22, arrow: 12, other: 38 }),
    rarity: Object.freeze({ E: 42, D: 30, C: 20, B: 6, A: 1.5, S: 0.5 }),
  }),
  Object.freeze({
    min: 6,
    max: 9,
    categories: Object.freeze({ potion: 20, scroll: 18, arrow: 10, other: 52 }),
    rarity: Object.freeze({ E: 32, D: 27, C: 25, B: 11, A: 4, S: 1 }),
  }),
  Object.freeze({
    min: 10,
    max: Infinity,
    categories: Object.freeze({ potion: 12, scroll: 12, arrow: 6, other: 70 }),
    rarity: Object.freeze({ E: 22, D: 22, C: 28, B: 17, A: 8, S: 3 }),
  }),
]);

function altarRewardStage(offerCount = 0) {
  const n = Math.max(0, Number(offerCount) || 0);
  return ALTAR_REWARD_STAGES.find((stage) => n >= stage.min && n <= stage.max) || ALTAR_REWARD_STAGES[0];
}

export function specialFixtureRate(key, dungeon) {
  const rates = dungeon?.isDebugDungeon || dungeon?.floorType === "debugDungeon"
    ? DEBUG_SPECIAL_FIXTURE_RATES
    : SPECIAL_FIXTURE_RATES;
  return rates[key] ?? SPECIAL_FIXTURE_RATES[key] ?? 0;
}

export function isInsideRoom(room, x, y) {
  return !!room && x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

export function isPlayerInsideDimensionalVault(vault, player) {
  return !!vault && !!player && isInsideRoom(vault.room, player.x, player.y);
}

function dimensionalVaultObjectAt(dungeon, x, y, player) {
  return (player && player.x === x && player.y === y) ||
    dungeon.monsters?.some((entry) => entry.x === x && entry.y === y && entry.hp > 0) ||
    dungeon.items?.some((entry) => entry.x === x && entry.y === y) ||
    dungeon.traps?.some((entry) => entry.x === x && entry.y === y) ||
    dungeon.springs?.some((entry) => entry.x === x && entry.y === y) ||
    dungeon.bigboxes?.some((entry) => entry.x === x && entry.y === y) ||
    dungeon.gachaMachines?.some((entry) => entry.x === x && entry.y === y) ||
    dungeon.altars?.some((entry) => entry.x === x && entry.y === y) ||
    dungeon.pentacles?.some((entry) => entry.x === x && entry.y === y) ||
    dungeon.statues?.some((entry) => entry.x === x && entry.y === y) ||
    dungeon.vents?.some((entry) => entry.x === x && entry.y === y) ||
    dungeon.stairUp?.x === x && dungeon.stairUp?.y === y ||
    dungeon.stairDown?.x === x && dungeon.stairDown?.y === y;
}

/** 未発動の宝物庫を、入室した瞬間に壁・水・内部アイテムへ変える。 */
function materializeDimensionalVault(dungeon, vault, player) {
  const isReserved = (x, y) => dungeon.map?.[y]?.[x] === T.FLOOR && !dimensionalVaultObjectAt(dungeon, x, y, player);
  for (const wall of vault.walls || []) {
    if (isReserved(wall.x, wall.y)) dungeon.map[wall.y][wall.x] = T.WALL;
  }
  for (const water of vault.water || []) {
    if (isReserved(water.x, water.y)) dungeon.map[water.y][water.x] = T.WATER;
  }

  const freeInside = () => {
    const candidates = vault.reachableCells?.length
      ? vault.reachableCells
      : (() => {
        const cells = [];
        for (let y = vault.room.y; y < vault.room.y + vault.room.h; y++) {
          for (let x = vault.room.x; x < vault.room.x + vault.room.w; x++) cells.push({ x, y });
        }
        return cells;
      })();
    for (const cell of candidates) {
      if (isReserved(cell.x, cell.y)) return { x: cell.x, y: cell.y };
    }
    return null;
  };
  for (const item of vault.pendingItems || []) {
    let pos = isReserved(item.x, item.y) ? { x: item.x, y: item.y } : freeInside();
    if (!pos) continue;
    item.x = pos.x;
    item.y = pos.y;
    dungeon.items ||= [];
    dungeon.items.push(item);
  }
  for (const trap of vault.pendingTraps || []) {
    let pos = isReserved(trap.x, trap.y) ? { x: trap.x, y: trap.y } : freeInside();
    if (!pos) continue;
    trap.x = pos.x;
    trap.y = pos.y;
    dungeon.traps ||= [];
    dungeon.traps.push(trap);
  }
  vault.pendingItems = [];
  vault.pendingTraps = [];
}

/** 宝物をすべて回収・消滅した後、発動時に出した障害物を片付ける。 */
function clearDimensionalVaultObstacles(dungeon, vault, messages) {
  if (!vault?.active || vault.obstaclesCleared) return false;
  const treasureIds = Array.isArray(vault.treasureItemIds) ? vault.treasureItemIds : [];
  if (treasureIds.length === 0) return false;
  const hasRemainingTreasure = (dungeon.items || []).some((item) =>
    treasureIds.includes(item.id) && item.vaultTurnsLeft != null
  );
  if (hasRemainingTreasure || (vault.pendingItems || []).length > 0) return false;
  for (const wall of vault.walls || []) {
    if (dungeon.map?.[wall.y]?.[wall.x] === T.WALL) dungeon.map[wall.y][wall.x] = T.FLOOR;
  }
  for (const water of vault.water || []) {
    if (dungeon.map?.[water.y]?.[water.x] === T.WATER) dungeon.map[water.y][water.x] = T.FLOOR;
  }
  vault.obstaclesCleared = true;
  messages.push("宝物庫は次元の彼方へ消えた。");
  return true;
}

/**
 * 宝物庫へ初めて入った時、内部アイテムのカウントを開始する。
 * 同じターンに拾えるよう、開始直後は減算しない。
 */
export function activateDimensionalVaults(dungeon, player, messages = []) {
  const activated = new Set();
  for (const vault of dungeon?.dimensionalVaults || []) {
    if (!isPlayerInsideDimensionalVault(vault, player) || vault.active) continue;
    vault.active = true;
    vault.startedFloorTurn = dungeon.floorTurns || 0;
    activated.add(vault.id);
    if (!Array.isArray(vault.treasureItemIds)) {
      vault.treasureItemIds = (vault.pendingItems || []).map((item) => item.id)
        .concat((dungeon.items || []).filter((item) => item.dimensionalVaultId === vault.id).map((item) => item.id));
    }
    materializeDimensionalVault(dungeon, vault, player);
    const items = (dungeon.items || []).filter((item) => item.dimensionalVaultId === vault.id);
    for (const item of items) {
      item.vaultTurnsLeft = dimensionalVaultItemTurns(item);
    }
    messages.push("次元宝物庫に入った！宝物が消え始めた！");
  }
  return activated;
}

/**
 * 起動済み宝物庫の残りターンを1減らし、0になったアイテムを消す。
 * skipVaultIds は、今ターンに入室して起動した宝物庫を示す。
 */
export function advanceDimensionalVaults(dungeon, messages = [], {
  skipVaultIds = new Set(),
  itemName = (item) => item?.name || "アイテム",
} = {}) {
  if (!dungeon?.dimensionalVaults?.length) return [];
  const expired = [];
  const expiringIds = new Set();
  for (const item of dungeon.items || []) {
    if (!item.dimensionalVaultId || item.vaultTurnsLeft == null) continue;
    if (skipVaultIds.has(item.dimensionalVaultId)) continue;
    item.vaultTurnsLeft = Math.max(0, item.vaultTurnsLeft - 1);
    if (item.vaultTurnsLeft === 0) {
      expired.push(item);
      expiringIds.add(item.id);
      messages.push(`${itemName(item)}が次元の彼方へ消えた！`);
    }
  }
  if (expired.length) {
    dungeon.items = dungeon.items.filter((item) => !expiringIds.has(item.id));
  }
  const clearedVaults = dungeon.dimensionalVaults.filter((vault) =>
    clearDimensionalVaultObstacles(dungeon, vault, messages)
  );
  if (clearedVaults.length > 0) {
    const clearedSet = new Set(clearedVaults);
    dungeon.dimensionalVaults = dungeon.dimensionalVaults.filter((vault) => !clearedSet.has(vault));
  }
  return expired;
}

/** 祭壇の奉納回数から、各レア度の抽選重みを作る。 */
export function altarRarityWeights(offerCount = 0) {
  return { ...altarRewardStage(offerCount).rarity };
}

export function altarCategoryWeights(offerCount = 0) {
  return { ...altarRewardStage(offerCount).categories };
}

function altarRewardCategory(entry) {
  if (entry?.type === "potion") return "potion";
  if (entry?.type === "scroll") return "scroll";
  if (entry?.type === "arrow") return "arrow";
  return "other";
}

function pickWeightedEntry(entries, randomFn) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return entries[0]?.value ?? null;
  let roll = Math.max(0, Math.min(0.999999999, randomFn())) * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1]?.value ?? null;
}

/** カテゴリ→レア度→個体の順に抽選し、序盤の消耗品優先をレア度抽選でも維持する。 */
export function pickAltarRewardTemplate(pool, offerCount = 0, randomFn = Math.random) {
  if (!pool?.length) return null;
  const categoryWeights = altarCategoryWeights(offerCount);
  const rarityWeights = altarRarityWeights(offerCount);
  const byCategory = new Map();
  for (const entry of pool) {
    const category = altarRewardCategory(entry);
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(entry);
  }
  const category = pickWeightedEntry(
    Object.entries(categoryWeights)
      .filter(([key]) => byCategory.has(key))
      .map(([key, weight]) => ({ value: key, weight })),
    randomFn,
  );
  const categoryPool = byCategory.get(category) || pool;
  const rarity = pickWeightedEntry(
    Object.entries(rarityWeights)
      .filter(([key]) => categoryPool.some((entry) => (entry.rarity || "E") === key))
      .map(([key, weight]) => ({ value: key, weight })),
    randomFn,
  );
  const rarityPool = rarity
    ? categoryPool.filter((entry) => (entry.rarity || "E") === rarity)
    : categoryPool;
  const candidates = rarityPool.length > 0 ? rarityPool : categoryPool;
  return candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, randomFn()) * candidates.length))];
}
