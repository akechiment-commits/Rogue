/** 泉から発生する効果の固定値・抽選範囲。 */
export const SPRING_CONFUSION_TURNS = 5;

/**
 * 通常フロアの金貨生成（30〜100+depth×30）を基準にした泉の金貨範囲。
 * 泉から出る金貨は通常生成上限の約2倍まで。
 */
export function springGoldRange(depth = 0) {
  const normalizedDepth = Math.max(0, Math.floor(Number(depth) || 0));
  const normalFloorGoldMax = 100 + normalizedDepth * 30;
  return { min: 30, max: normalFloorGoldMax * 2 };
}
