/**
 * 敵の封印中に無効化される固有特性の判定。
 * 封印中: 特技不可・通常速(1)・maxAttacks=1 に加え、
 * 浮遊・魔法無効・壁抜け・物理/魔法反射・固定ダメ等を無効化する。
 * 一時 floatTurns は状態異常なので封印でも有効。
 */

export function monIsSealed(m) {
  return !!(m && m.sealed);
}

/** 実効浮遊（固有 float は封印で無効。floatTurns は有効） */
export function monEffectiveFloat(m) {
  if (!m) return false;
  if ((m.floatTurns || 0) > 0) return true;
  if (m.sealed) return false;
  return !!m.float;
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
    m.subtype === "magicreflect" ||
    (m.baseKind === "runner" && (m.monLevel || 1) >= 3)
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

/** 封印中は速度1（倍速・鈍足無視）。呼び出し側 turnAccum でも同様に扱う */
export function monEffectiveSpeed(m) {
  if (!m) return 1;
  if (m.sealed) return 1;
  return m.speed ?? 1;
}
