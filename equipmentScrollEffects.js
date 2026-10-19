import { CAT_CLAW_T, EXCALIBUR_T, GOLDEN_AXE_T, WEAPON_ABILITIES, ARMOR_ABILITIES } from "./items.js";
import { setPlayerItemProperties } from "./equipmentEffects.js";

/* 対象選択の入力経路によらず、同じ確率・同じ効果で装備を強化する。 */
export function applyEquipmentUpgradeScroll(player, item, mode, displayName = item.name, random = Math.random) {
  const ring = item.type === "ring" && ["power_ring", "defense_ring", "life_ring"].includes(item.effect);
  const valid = ring || item.type === (mode.mode === "weapon_up" ? "weapon" : "armor");
  if (!valid) return `${displayName}には効果がなかった。巻物は消えた。`;
  const before = item.plus || 0;
  const gain = mode.blessed ? 2 : mode.cursed ? -1 : 1;
  const suffix = mode.blessed ? "【祝】" : mode.cursed ? "【呪】" : "";
  const transformChance = mode.blessed ? 0.10 : mode.cursed ? 0.20 : 0.05;
  const transform = mode.mode === "weapon_up" && item.type === "weapon"
    ? item.name === "ロングソード" ? EXCALIBUR_T
      : item.name === "短剣" ? CAT_CLAW_T
      : ["バトルアクス", "戦神の斧"].includes(item.name) ? GOLDEN_AXE_T : null
    : null;
  if (transform && random() < transformChance) {
    const oldAbilities = [...(item.abilities || []), item.ability].filter(Boolean);
    Object.assign(item, { ...transform, id: item.id, plus: Math.max(0, before) });
    item.abilities = [...new Set([...oldAbilities, transform.ability].filter(Boolean))];
    item.ability = item.abilities[0];
    item.fullIdent = true;
    item.bcKnown = true;
    const effect = transform === EXCALIBUR_T ? "聖なる光を放ち...エクスカリバーに変化した！"
      : transform === CAT_CLAW_T ? "鋭い輝きを放ち...猫の爪に変化した！"
      : "黄金の輝きを放ち...ゴールデンアクスに変化した！";
    return `${displayName}が${effect}${suffix}`;
  }
  setPlayerItemProperties(player, item, { plus: before + gain });
  const plusLabel = value => value > 0 ? `+${value}` : value === 0 ? "無印" : String(value);
  let message = `${displayName}が${gain > 0 ? "輝いた" : "くすんだ"}！(${plusLabel(before)}→${plusLabel(item.plus)})${suffix}`;
  if (gain > 0 && item.cursed) { item.cursed = false; message += " 呪いが解けた！"; }
  return message;
}

/* 祝福錬成の強力な能力候補も、キー専用の古い一覧を持たず共有する。 */
export function applyEquipmentForgeScroll(item, mode, displayName = item.name, random = Math.random) {
  if (item.type !== "weapon" && item.type !== "armor") return `${displayName}には効果がなかった。巻物は消えた。`;
  if (mode.cursed) return `${displayName}には消せる能力がなかった。巻物は消えた。【呪】`;
  const isWeapon = item.type === "weapon";
  const allAbilities = isWeapon ? WEAPON_ABILITIES : ARMOR_ABILITIES;
  const owned = new Set([...(item.abilities || []), item.ability].filter(Boolean));
  const strong = new Set(isWeapon
    ? ["reach", "critical", "critical_oni_club", "critical_war_god_axe", "critical_cat_claw", "oil_proof",
      "bane_dragon", "bane_float", "fire_elem", "ice_elem", "thunder_elem", "inflict_seal",
      "inflict_immobile", "inflict_bewitch", "bane_undead", "bane_humanoid", "lifesteal", "double_strike"]
    : ["regen", "thorn", "dodge", "wand_reflect", "fire_resist", "lightning_resist", "ice_resist",
      "water_proof", "oil_proof", "all_resist", "aura"]);
  const available = allAbilities.filter(ability => !owned.has(ability.id) && !ability.specialOnly);
  const candidates = available.filter(ability => mode.blessed ? strong.has(ability.id) : !ability.curseOnly && !ability.blessedOnly);
  const pool = candidates.length ? candidates : available;
  if (!pool.length) return `${displayName}はもうこれ以上能力を宿せない。`;
  const ability = pool[Math.floor(random() * pool.length)];
  item.abilities = [...(item.abilities || []), ability.id];
  if (!item.ability) item.ability = ability.id;
  if (ability.id === "pickaxe" && item.durability == null) item.durability = 30;
  item.fullIdent = true;
  return mode.blessed ? `${displayName}に「${ability.name}」が宿った！【祝】` : `${displayName}に「${ability.name}」が宿った！`;
}
