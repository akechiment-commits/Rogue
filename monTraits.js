/**
 * 敵の封印中に無効化される固有特性の判定。
 * 封印中: 特技不可・通常速(1)・maxAttacks=1 に加え、
 * 浮遊・水上歩行・魔法無効・壁抜け・物理/魔法反射・固定ダメ等を無効化する。
 * 一時 floatTurns は状態異常なので封印でも有効。
 */

export function monIsSealed(m) {
  return !!(m && m.sealed);
}

/** 主弱点・副弱点のどちらに対しても属性弱点判定を行う。 */
export function monHasElementWeakness(m, element) {
  if (!m || !element) return false;
  const weaknesses = [m.elemWeak, m.elemWeak2].flatMap(value => Array.isArray(value) ? value : [value]);
  return weaknesses.includes(element);
}

/** 属性耐性をダメージ倍率として返す。通常の敵定義では無指定なら等倍。 */
export function monElementDamageMultiplier(m, element) {
  if (!m || !element) return 1;
  const resistances = [m.elemResist, m.elemResist2].flatMap(value => Array.isArray(value) ? value : [value]);
  return m.elemResistAll || resistances.includes(element) ? 0.5 : 1;
}

/** 火ダルマの固有炎特性または爆発から伝わった炎まといが有効か。 */
export function monHasFlameMantle(m) {
  return !!(m && !m.sealed && !(m.soakedTurns > 0) &&
    (m.baseKind === "firedemon" || (m.flameMantleTurns || 0) > 0));
}

/** 爆発系特技（自爆・誘爆を含む）は封印中に無効 */
export function monCanUseExplosiveAbility(m) {
  return !!(m && !m.sealed);
}

/** 実効浮遊（固有 float は封印で無効。floatTurns は有効） */
export function monEffectiveFloat(m) {
  if (!m) return false;
  if ((m.floatTurns || 0) > 0) return true;
  if (m.sealed) return false;
  return !!m.float;
}

/** 実効水上歩行（固有 waterWalker は封印で無効） */
export function monEffectiveWaterWalker(m) {
  return !!(m && m.waterWalker && !m.sealed);
}

export function monEffectiveMagicImmune(m) {
  return !!(m && m.magicImmune && !m.sealed);
}

export function monEffectiveWallWalker(m) {
  return !!(m && m.wallWalker && !m.sealed);
}

export function monEffectiveFixedDamageOnly(m) {
  return !!(m && m.fixedDamageOnly && !m.sealed);
}

/** 物理投射物を跳ね返す（ほっちもぺ等） */
export function monReflectsProjectiles(m) {
  return !!(m && !m.sealed && (
    m.subtype === "reflector" ||
    (m.baseKind === "runner" && (m.monLevel || 1) >= 2)
  ));
}

/** 魔法・杖を跳ね返す */
export function monReflectsMagic(m) {
  return !!(m && !m.sealed && (
    m.magicReflect ||
    m.subtype === "magicreflect" ||
    (m.baseKind === "runner" && (m.monLevel || 1) >= 3) ||
    (m.flockReflectTurns || 0) > 0
  ));
}

/** 通常の投擲物・魔法弾・巻物・杖の効果を潜ってかわす（かわしモグラ） */
export function monSubmergesProjectiles(m) {
  const _incapacitated = (m?.sleepTurns || 0) > 0 || !!m?.paralyzed ||
    (m?.frozenTurns || 0) > 0 || (m?.immobileTurns || 0) > 0 ||
    (m?.knockdownTurns || 0) > 0;
  return !!(m && !_incapacitated && !m.sealed && m.baseKind === "dodgemole" && !m._wakkaRingHit);
}

/** 封印中は1回行動まで */
export function monEffectiveMaxAttacks(m) {
  if (!m) return 1;
  if (m.sealed) return 1;
  return m.maxAttacks ?? 1;
}

/** Attack value after active boss-specific attack buffs. */
export function monEffectiveAttack(m) {
  let attack = Number(m?.atk) || 0;
  if (!m?.sealed && (m?.sharpStrikeTurns || 0) > 0) attack = Math.floor(attack * 1.5);
  if (!m?.sealed && (m?.mightyStrikeTurns || 0) > 0) attack = Math.floor(attack * 2);
  return attack;
}

/** Apply cumulative poison-arrow weakness to damage output without changing the ATK stat. */
export function monScaleOutgoingDamage(m, damage) {
  const value = Number(damage);
  if (!Number.isFinite(value) || value <= 0 || !m) return value;
  const stacks = Math.max(0, Math.min(10, Math.floor(Number(m.poisonArrowDamageHalves) || 0)));
  if (stacks <= 0 || (m.isBoss && (m.poisonArrowDamageTurns || 0) <= 0)) return value;
  return Math.max(1, Math.floor(value / (2 ** stacks)));
}

/** 封印中は速度1（倍速・鈍足無視）。呼び出し側 turnAccum でも同様に扱う */
export function monEffectiveSpeed(m) {
  if (!m) return 1;
  if (m.sealed) return 1;
  return m.speed ?? 1;
}
