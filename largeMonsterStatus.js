import { monsterBodySize } from "./monsterGeometry.js";

export const LARGE_MONSTER_STATUS_COOLDOWN_TURNS = 10;

const STATUS_LABELS = {
  poison: "毒", sleep: "眠り", slow: "鈍足", confuse: "混乱", darkness: "暗闇",
  bewitch: "幻惑", seal: "封印", paralyze: "金縛り", immobile: "移動封じ", frozen: "凍結",
};

export function largeMonsterStatusCooldown(monster, status) {
  if (monsterBodySize(monster) <= 1) return 0;
  return Math.max(0, monster.largeStatusCooldowns?.[status] || 0);
}

export function startLargeMonsterStatusCooldown(monster, status) {
  if (!monster || monsterBodySize(monster) <= 1 || !status) return;
  const cooldowns = monster.largeStatusCooldowns || (monster.largeStatusCooldowns = {});
  cooldowns[status] = Math.max(cooldowns[status] || 0, LARGE_MONSTER_STATUS_COOLDOWN_TURNS);
}

export function blockLargeMonsterStatus(monster, status, messages) {
  const remaining = largeMonsterStatusCooldown(monster, status);
  if (remaining <= 0) return false;
  messages?.push(`${monster.name}は${STATUS_LABELS[status] || "状態異常"}への耐性を保っている！(あと${remaining}ターン)`);
  return true;
}

export function advanceLargeMonsterStatusCooldowns(monster) {
  const cooldowns = monster?.largeStatusCooldowns;
  if (!cooldowns) return;
  for (const status of Object.keys(cooldowns)) {
    cooldowns[status] = Math.max(0, cooldowns[status] - 1);
    if (cooldowns[status] === 0) delete cooldowns[status];
  }
  if (Object.keys(cooldowns).length === 0) delete monster.largeStatusCooldowns;
}
