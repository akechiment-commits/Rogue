/** 状態防止は付与元・対象種別にかかわらず同じ判定を使う。 */
export function isStatusImmune(entity, messages = null, name = null) {
  if ((entity?.statusImmune || 0) <= 0) return false;
  messages?.push(name ? `${name}には効かなかった！(状態防止中)` : "状態防止中のため効かなかった！");
  return true;
}

/** ヨーグルトの限定免疫。全状態防止と違い、毒・混乱にだけ使用する。 */
export function isYogurtImmune(entity, messages = null, ailment = "混乱") {
  if ((entity?.yogurtImmuneTurns || 0) <= 0) return false;
  messages?.push(`乳酸菌が${ailment}を防いだ！`);
  return true;
}

