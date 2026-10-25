/** 泉から発生する効果の固定値・抽選範囲。 */
export const SPRING_CONFUSION_TURNS = 5;

/** 通常フロアで床に出る金貨の範囲。floor は1始まり。 */
export function ordinaryFloorGoldRange(floor = 1) {
  const normalizedFloor = Math.max(1, Math.floor(Number(floor) || 1));
  return { min: 30, max: 100 + (normalizedFloor - 1) * 30 };
}

/**
 * 通常フロアの金貨生成（30〜100+depth×30）を基準にした泉の金貨範囲。
 * 泉から出る金貨は通常生成上限の約2倍まで。
 */
export function springGoldRange(depth = 0) {
  const normalizedDepth = Math.max(0, Math.floor(Number(depth) || 0));
  const normalFloorGoldMax = ordinaryFloorGoldRange(normalizedDepth + 1).max;
  return { min: 30, max: normalFloorGoldMax * 2 };
}
