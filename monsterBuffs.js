const LEVEL_BUFF_AMOUNTS = Object.freeze({ 1: 5, 2: 7, 3: 10 });

export const ARMOR_BREATH_DEF_BONUS = LEVEL_BUFF_AMOUNTS[1];
export const DIAMOND_WEAPON_ATK_BONUS = LEVEL_BUFF_AMOUNTS[1];

function levelBuffAmount(mon) {
  const level = Math.min(3, Math.max(1, Math.floor(Number(mon?.monLevel) || 1)));
  return LEVEL_BUFF_AMOUNTS[level];
}

export function getArmorBreathDefBonus(mon) {
  return levelBuffAmount(mon);
}

export function getDiamondWeaponAtkBonus(mon) {
  return levelBuffAmount(mon);
}

/** アーマーブレスの上昇分を、防御力本体と分けて記録する。 */
export function addArmorBreathBuff(mon, bonus = getArmorBreathDefBonus(mon)) {
  if (!mon) return 0;
  mon.def = (mon.def || 0) + bonus;
  mon.armorBreathBuffs = (mon.armorBreathBuffs || 0) + 1;
  mon.armorBreathBuffAmount = (mon.armorBreathBuffAmount || 0) + bonus;
  /* 祝福された強化解除の半減中でも、解除後にバフが復活しないよう同期する。 */
  if (mon._debuffOrigDef !== undefined) {
    mon._debuffOrigDef += bonus;
  }
  return bonus;
}

/** アーマーブレスの重ねがけ分だけを取り除き、元の防御力を保つ。 */
export function clearArmorBreathBuff(mon) {
  const stacks = Math.max(0, Number(mon?.armorBreathBuffs) || 0);
  if (!mon || stacks === 0) return 0;
  const amount = mon.armorBreathBuffAmount ?? stacks * ARMOR_BREATH_DEF_BONUS;
  mon.def = Math.max(0, (mon.def || 0) - amount);
  if (mon._debuffOrigDef !== undefined) {
    mon._debuffOrigDef = Math.max(0, mon._debuffOrigDef - amount);
  }
  delete mon.armorBreathBuffs;
  delete mon.armorBreathBuffAmount;
  return amount;
}

/** ダイヤモンドウエポンの上昇分を、攻撃力本体と分けて記録する。 */
export function addDiamondWeaponBuff(mon, bonus = getDiamondWeaponAtkBonus(mon)) {
  if (!mon) return 0;
  mon.atk = (mon.atk || 0) + bonus;
  mon.diamondWeaponBuffs = (mon.diamondWeaponBuffs || 0) + 1;
  mon.diamondWeaponBuffAmount = (mon.diamondWeaponBuffAmount || 0) + bonus;
  /* 祝福された強化解除の半減中でも、解除後にバフが復活しないよう同期する。 */
  if (mon._debuffOrigAtk !== undefined) {
    mon._debuffOrigAtk += bonus;
  }
  return bonus;
}

/** ダイヤモンドウエポンの重ねがけ分だけを取り除き、元の攻撃力を保つ。 */
export function clearDiamondWeaponBuff(mon) {
  const stacks = Math.max(0, Number(mon?.diamondWeaponBuffs) || 0);
  if (!mon || stacks === 0) return 0;
  const amount = mon.diamondWeaponBuffAmount ?? stacks * DIAMOND_WEAPON_ATK_BONUS;
  mon.atk = Math.max(1, (mon.atk || 0) - amount);
  if (mon._debuffOrigAtk !== undefined) {
    mon._debuffOrigAtk = Math.max(1, mon._debuffOrigAtk - amount);
  }
  delete mon.diamondWeaponBuffs;
  delete mon.diamondWeaponBuffAmount;
  return amount;
}
