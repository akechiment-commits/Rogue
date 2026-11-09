import { monsterBodySize } from "./monsterGeometry.js";

let _activeDamageEventToken = null;
let _damageEventSeq = 0;

export function newDamageEventToken(prefix = "evt") {
  return `${prefix}_${++_damageEventSeq}`;
}

/** Keep one damage-event token while a specific damage event (e.g. explosion, wand break) resolves. */
export function withLargeMonsterDamageEvent(eventToken, callback) {
  if (typeof callback !== "function") return callback?.();
  const previousToken = _activeDamageEventToken;
  _activeDamageEventToken = eventToken;
  try {
    return callback();
  } finally {
    _activeDamageEventToken = previousToken;
  }
}

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

/**
 * Explosion and percentage damage guard for large monsters.
 * Ensures a single explosion or wand throw does not deal damage multiple times
 * to the multiple body cells of a large monster, while allowing distinct explosions
 * (e.g. throwing multiple bombs while hasted) to each deal damage.
 */
export function blockLargeMonsterDamage(monster, player, messages, eventToken = null) {
  if (!monster || monsterBodySize(monster) <= 1 || !player) return false;

  const token = eventToken ?? _activeDamageEventToken;
  if (token != null) {
    if (monster.largeDamageEventToken === token) {
      if (monster.largeDamageBlockedEventToken !== token) {
        monster.largeDamageBlockedEventToken = token;
        messages?.push(`${monster.name}は爆発・割合ダメージの追加分を防いだ！`);
      }
      return true;
    }
    monster.largeDamageEventToken = token;
    return false;
  }

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
