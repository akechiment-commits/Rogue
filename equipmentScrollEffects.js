import { CAT_CLAW_T, EXCALIBUR_T, GOLDEN_AXE_T } from "./items.js";
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
