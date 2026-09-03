/**
 * 固定ギミックの副作用を持たない照会・判定。
 * アイテム、敵、杖、描画のどこからでも循環なしで参照できる。
 */

export function statueAt(dungeon, x, y) {
  return (dungeon.statues || []).find((statue) => statue.x === x && statue.y === y) || null;
}

export function findFixedPortalPair(dungeon, portal) {
  if (!portal || portal.kind !== "fixed_portal") return null;
  return (dungeon.pentacles || []).find(
    (pentacle) =>
      pentacle.kind === "fixed_portal" &&
      pentacle.pairId === portal.pairId &&
      pentacle !== portal &&
      !(pentacle.x === portal.x && pentacle.y === portal.y),
  ) || null;
}

export function wandEffectBreaksStatue(effect) {
  if (!effect) return false;
  const safeEffects = new Set([
    "swap", "warp", "leap",
    "bless_wand", "curse_wand",
    "levelup", "portal",
    "vitality_swap",
  ]);
  return !safeEffects.has(effect);
}

/* ガチャマシーン・祭壇など、杖の有害効果で壊れる床ギミックの共通条件 */
export const FLOOR_FIXTURE_BREAKING_WAND_EFFECTS = new Set([
  "fire_wand",
  "ice_wand",
  "lightning",
  "godsparkwand",
  "dig",
  "soften",
]);

export function wandEffectBreaksFloorFixture(effect) {
  return FLOOR_FIXTURE_BREAKING_WAND_EFFECTS.has(effect);
}

export function wandEffectStatueLootOnly(effect) {
  return effect === "dig" || effect === "soften";
}
