import { rng, uid, TI } from "./utils.js";

/** 泉から発生する効果の固定値・抽選範囲。 */
export const SPRING_CONFUSION_TURNS = 5;

/** 泉の初期容量（未指定データの後方互換は 4、新規生成は 3〜6 でランダム）。 */
export const DEFAULT_SPRING_CAPACITY = 4;
export const SPRING_CAPACITY_MIN = 3;
export const SPRING_CAPACITY_MAX = 6;

export function randSpringCapacity(rngFn = null) {
  if (typeof rngFn === "function") {
    return Math.floor(rngFn() * (SPRING_CAPACITY_MAX - SPRING_CAPACITY_MIN + 1)) + SPRING_CAPACITY_MIN;
  }
  return rng(SPRING_CAPACITY_MIN, SPRING_CAPACITY_MAX);
}

export function createSpring(x, y, opts = {}) {
  return {
    id: opts.id ?? uid(),
    x,
    y,
    tile: TI.SPRING,
    contents: [],
    capacity: opts.capacity ?? randSpringCapacity(opts.rngFn),
  };
}

/** 飲む／浸す／金貨／金塊投入で願いが発動する確率 */
export const WISH_CHANCE_DRINK = 0.001;
export const WISH_CHANCE_SOAK = 0.005;
export const WISH_CHANCE_GOLD_COIN = 0.015;
export const WISH_CHANCE_GOLD_NUGGET = 0.15;

/** 金額に応じた金貨投入時の願い確率（100G: 約0.5% 〜 1000G: 約1.0% 〜 10000G以上: 最大8.0%） */
export function goldCoinWishChance(value = null) {
  if (value == null) return WISH_CHANCE_GOLD_COIN;
  const v = Math.max(0, Number(value) || 0);
  return Math.min(0.08, 0.005 + (v / 10000) * 0.05);
}

/** 金額に応じたアイテム射出確率（100G: 約15% 〜 1000G: 約20% 〜 5000G以上: 最大50%） */
export function goldCoinEjectChance(value = null) {
  if (value == null) return 0.20;
  const v = Math.max(0, Number(value) || 0);
  return Math.min(0.50, 0.15 + (v / 5000) * 0.25);
}

/**
 * 泉に金貨を投入した際に飛び出すアイテムの候補と確率の重み（合計 100）。
 * テレポートは 巻物(40%) > ペン(25%) > 杖(18%) > 魔法書(5%) の順で低確率。
 * 幸運の薬(12%) は杖と魔法書の間。
 */
export const SPRING_EJECT_CANDIDATES = [
  { name: "テレポートの巻物", weight: 40 },
  { name: "テレポートのペン", weight: 25 },
  { name: "テレポートの杖", weight: 18 },
  { name: "幸運の薬", weight: 12 },
  { name: "テレポートの魔法書", weight: 5 },
];

/** 超低確率ロール */
export function rollWishChance(kind = "drink", rngFn = Math.random, value = null) {
  let p = WISH_CHANCE_DRINK;
  if (kind === "gold_nugget") p = WISH_CHANCE_GOLD_NUGGET;
  else if (kind === "gold_coin" || kind === "gold") p = goldCoinWishChance(value);
  else if (kind === "soak") p = WISH_CHANCE_SOAK;
  return rngFn() < p;
}

/** 通常フロアで床に出る金貨の範囲。floor は1始まり。 */
export function ordinaryFloorGoldRange(floor = 1) {
  const normalizedFloor = Math.max(1, Math.floor(Number(floor) || 1));
  return { min: 100, max: 200 + (normalizedFloor - 1) * 30 };
}

/**
 * 通常フロアの金貨生成（100〜200+depth×30）を基準にした泉の金貨範囲。
 * 泉から出る金貨は通常生成上限の約2倍まで。
 */
export function springGoldRange(depth = 0) {
  const normalizedDepth = Math.max(0, Math.floor(Number(depth) || 0));
  const normalFloorGoldMax = ordinaryFloorGoldRange(normalizedDepth + 1).max;
  return { min: 100, max: normalFloorGoldMax * 2 };
}
