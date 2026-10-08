import { monsterBodySize } from "./monsterGeometry.js";

/** Keep one damage-turn token while a player action and its enemy phase resolve. */
export function withLargeMonsterDamageTurn(player, callback) {
  if (!player || typeof callback !== "function") return callback?.();
  const previousTurn = player._largeMonsterDamageTurn;
  player._largeMonsterDamageTurn = (Number(player.turns) || 0) + 1;
  try {
    return callback();
  } finally {
    if (previousTurn === undefined) delete player._largeMonsterDamageTurn;
    else player._largeMonsterDamageTurn = previousTurn;
  }
}

/** Explosion and percentage damage share one per-player-turn allowance for each large monster. */
export function blockLargeMonsterDamage(monster, player, messages) {
  if (!monster || monsterBodySize(monster) <= 1 || !player) return false;
  const turn = player._largeMonsterDamageTurn ?? (Number(player.turns) || 0) + 1;
  if (monster.largeDamageTurnToken === turn) {
    if (monster.largeDamageBlockedMessageTurn !== turn) {
      monster.largeDamageBlockedMessageTurn = turn;
      messages?.push(`${monster.name}はこのターン、爆発・割合ダメージの追加分を防いだ！`);
    }
    return true;
  }
  monster.largeDamageTurnToken = turn;
  return false;
}
