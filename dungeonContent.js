/**
 * ダンジョン種別ごとの出現制限。
 * floor は 1 始まり（depth + 1）。
 * 未設定のダンジョンは制限なし（従来どおりレア度weight）。
 */
import { TRAPS, BB_TYPES } from "./items.js";

/** 初心者で出さない罠（即死級・識別破壊・フロア破壊） */
const BEGINNER_TRAP_BAN = new Set([
  "explode",
  "time_bomb",
  "unident_trap",
  "multiply_trap",
  "trap_trap",
  "item_monster_trap",
  "level_down_trap",
]);

/** 1〜5階：基本罠。6階から錆・召喚・落とし穴などちょっと危険なものを混ぜる */
const BEGINNER_TRAP_EARLY = new Set([
  "arrow_trap",
  "sleep",
  "hunger_trap",
  "confuse_trap",
  "shadow_stitch",
  "poison_arrow",
  "trip_trap",
  "spin",
]);

/** 初心者で出さない大箱（ゴミ箱・爆発・呪いなどマイナスと、不要な鑑定） */
const BEGINNER_BB_BAN = new Set([
  "identify",
  "trash",
  "curse",
  "reverse",
  "greed",
  "nitro",
  "monster",
]);

function rarityRank(rarity) {
  return { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 }[rarity] ?? 0;
}

export function trapAllowedInDungeon(trap, dungeonType, floor) {
  if (!trap) return false;
  if (dungeonType !== "beginner") return true;
  if (BEGINNER_TRAP_BAN.has(trap.effect)) return false;
  if (floor < 6) return BEGINNER_TRAP_EARLY.has(trap.effect);
  return true;
}

export function bbAllowedInDungeon(box, dungeonType, _floor) {
  if (!box) return false;
  if (dungeonType !== "beginner") return true;
  return !BEGINNER_BB_BAN.has(box.kind);
}

/**
 * 初心者：A/Sは出さない。1〜5階は E/D のみ。6階から C/B。
 * 識別の巻物・鑑定魔法は従来どおり除外。
 */
export function lootAllowedInDungeon(item, dungeonType, floor) {
  if (!item) return false;
  if (dungeonType !== "beginner") return true;
  if (item.type === "gold" || item.type === "arrow" || item.type === "food") return true;
  if (item.type === "scroll" && item.effect === "identify") return false;
  if (item.spell === "identify_magic") return false;
  const rank = rarityRank(item.rarity);
  if (rank >= 4) return false;
  if (floor < 6 && rank >= 2) return false;
  return true;
}

export function trapPoolForDungeon(dungeonType, floor, pool = TRAPS) {
  const filtered = pool.filter((t) => trapAllowedInDungeon(t, dungeonType, floor));
  return filtered.length ? filtered : pool.filter((t) => !BEGINNER_TRAP_BAN.has(t.effect));
}

export function bbPoolForDungeon(dungeonType, floor, pool = BB_TYPES) {
  const filtered = pool.filter((b) => bbAllowedInDungeon(b, dungeonType, floor));
  return filtered.length ? filtered : pool.filter((b) => !BEGINNER_BB_BAN.has(b.kind));
}

export function lootPoolForDungeon(pool, dungeonType, floor) {
  if (!pool?.length) return pool || [];
  const filtered = pool.filter((it) => lootAllowedInDungeon(it, dungeonType, floor));
  return filtered.length ? filtered : pool.filter((it) => lootAllowedInDungeon(it, dungeonType, 99));
}
