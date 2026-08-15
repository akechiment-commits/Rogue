/* 魔法の筆で書き込むときのインク消費量 */
export const MARKER_SPELLBOOK_INK_COST = 5;

const MARKER_SCROLL_INK_COSTS = Object.freeze({
  duplicate: 3,
  expand_inv: 2,
});

export function getMarkerInkCost(item) {
  if (item?.type === "spellbook") return MARKER_SPELLBOOK_INK_COST;
  return MARKER_SCROLL_INK_COSTS[item?.effect] ?? 1;
}
