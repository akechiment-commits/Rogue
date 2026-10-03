import { setPlayerHpForCapacityChange } from "./utils.js";

export function ringHpBonus(ring) {
  return (ring.effect === "life_ring" ? (ring.plus || 0) * 5 : 0) + (ring.blessed ? 10 : 0);
}

export function adjustRingHp(player, bonus, wasFullHp = player.hp === player.maxHp) {
  if (!bonus) return;
  const previousMaxHp = player.maxHp;
  player.maxHp = Math.max(1, player.maxHp + bonus);
  const increase = Math.max(0, player.maxHp - previousMaxHp);
  setPlayerHpForCapacityChange(player, Math.min(player.maxHp, player.hp + (wasFullHp ? increase : 0)));
}

/* 既存装備との差だけを反映するため、同じ指輪を再設定しても補正は重複しない。 */
export function replacePlayerRings(player, rings, wasFullHp = player.hp === player.maxHp) {
  const previous = player.rings || [];
  const hpBonus = list => list.reduce((sum, ring) => sum + ringHpBonus(ring), 0);
  const torches = list => list.filter(ring => ring.effect === "torch_ring").length;
  adjustRingHp(player, hpBonus(rings) - hpBonus(previous), wasFullHp);
  const visionDelta = torches(rings) - torches(previous);
  if (visionDelta) player.visionBonus = Math.max(0, (player.visionBonus || 0) + visionDelta);
  player.rings = rings;
}

/* 装備中の＋値や祝福が変わった瞬間に、適用済み補正との差を反映する。 */
export function setPlayerItemProperties(player, item, properties) {
  const equipped = player?.rings?.includes(item);
  const before = equipped ? ringHpBonus(item) : 0;
  const wasFullHp = player && player.hp === player.maxHp;
  Object.assign(item, properties);
  if (equipped) adjustRingHp(player, ringHpBonus(item) - before, wasFullHp);
}

export function unequipPlayerItem(player, item) {
  if (player.weapon === item) player.weapon = null;
  if (player.armor === item) player.armor = null;
  if (player.arrow === item) player.arrow = null;
  if (player.rings?.includes(item)) {
    replacePlayerRings(player, player.rings.filter(ring => ring !== item), false);
  }
}
