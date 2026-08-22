export const ARMOR_BREATH_DEF_BONUS = 5;

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
