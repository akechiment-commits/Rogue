/** 泉から発生する効果の固定値・抽選範囲。 */
export const SPRING_CONFUSION_TURNS = 5;

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
