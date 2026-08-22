export const ARMOR_BREATH_DEF_BONUS = 5;
export const DIAMOND_WEAPON_ATK_BONUS = 10;

/** アーマーブレスの上昇分を、防御力本体と分けて記録する。 */
export function addArmorBreathBuff(mon) {
  if (!mon) return 0;
  mon.def = (mon.def || 0) + ARMOR_BREATH_DEF_BONUS;
  mon.armorBreathBuffs = (mon.armorBreathBuffs || 0) + 1;
  /* 祝福された強化解除の半減中でも、解除後にバフが復活しないよう同期する。 */
  if (mon._debuffOrigDef !== undefined) {
    mon._debuffOrigDef += ARMOR_BREATH_DEF_BONUS;
  }
  return ARMOR_BREATH_DEF_BONUS;
}

/** アーマーブレスの重ねがけ分だけを取り除き、元の防御力を保つ。 */
export function clearArmorBreathBuff(mon) {
  const stacks = Math.max(0, Number(mon?.armorBreathBuffs) || 0);
  if (!mon || stacks === 0) return 0;
  const amount = stacks * ARMOR_BREATH_DEF_BONUS;
  mon.def = Math.max(0, (mon.def || 0) - amount);
  if (mon._debuffOrigDef !== undefined) {
    mon._debuffOrigDef = Math.max(0, mon._debuffOrigDef - amount);
  }
  delete mon.armorBreathBuffs;
  return amount;
}

/** ダイヤモンドウエポンの上昇分を、攻撃力本体と分けて記録する。 */
export function addDiamondWeaponBuff(mon) {
  if (!mon) return 0;
  mon.atk = (mon.atk || 0) + DIAMOND_WEAPON_ATK_BONUS;
  mon.diamondWeaponBuffs = (mon.diamondWeaponBuffs || 0) + 1;
  /* 祝福された強化解除の半減中でも、解除後にバフが復活しないよう同期する。 */
  if (mon._debuffOrigAtk !== undefined) {
    mon._debuffOrigAtk += DIAMOND_WEAPON_ATK_BONUS;
  }
  return DIAMOND_WEAPON_ATK_BONUS;
}

/** ダイヤモンドウエポンの重ねがけ分だけを取り除き、元の攻撃力を保つ。 */
export function clearDiamondWeaponBuff(mon) {
  const stacks = Math.max(0, Number(mon?.diamondWeaponBuffs) || 0);
  if (!mon || stacks === 0) return 0;
  const amount = stacks * DIAMOND_WEAPON_ATK_BONUS;
  mon.atk = Math.max(1, (mon.atk || 0) - amount);
  if (mon._debuffOrigAtk !== undefined) {
    mon._debuffOrigAtk = Math.max(1, mon._debuffOrigAtk - amount);
  }
  delete mon.diamondWeaponBuffs;
  return amount;
}
