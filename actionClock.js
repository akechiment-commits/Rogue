/**
 * トルネコ3式の行動時計。
 * 基準12、コストは 12/速度（等速12・2倍速6・3倍速4・0.5倍速24）。
 * プレイヤーが時計を進めたあと、敵は actionTime + cost <= player.actionTime の間だけ動く。
 * 余りは速い自分が先、速い敵が後（2対1は PPE、2対3は PEPEE）。
 */
export const ACTION_TIME_BASE = 12;

export function actionCost(speed) {
  const value = Number(speed);
  if (!Number.isFinite(value) || value <= 0) return ACTION_TIME_BASE;
  return ACTION_TIME_BASE / value;
}

export function playerHasteStage(player) {
  if ((player?.hasteTurns || 0) <= 0) return 1;
  return (player.hasteSpeed || 2) >= 3 ? 3 : 2;
}

export function playerActionSpeed(player, { idleBeat = false, hasteGrantFreeze = false } = {}) {
  if (idleBeat || hasteGrantFreeze) return 1;
  return playerHasteStage(player);
}

/** 速度が上がった行動だけ立てる。その拍の敵行動を全キャンセルする。 */
export function markHasteGrant(player, { evenIfHasted = false } = {}) {
  if (!player) return false;
  if (!evenIfHasted && playerHasteStage(player) > 1) return false;
  player._hasteGrantFreeze = true;
  return true;
}

export function grantPlayerHaste(player, turns) {
  if (!player || !(turns > 0)) return false;
  const from = playerHasteStage(player);
  if (from < 3) {
    player.hasteSpeed = from < 2 ? 2 : 3;
    player._hasteGrantFreeze = true;
  }
  player.hasteTurns = (player.hasteTurns || 0) + turns;
  return true;
}

export function hasteDurationLabel(player, addedTurns) {
  return playerHasteStage(player) >= 3 ? "3倍速" : `2倍速${addedTurns}ターン`;
}

export function maintainPlayerHaste(player, minTurns) {
  if (!player || !(minTurns > 0)) return false;
  const was = player.hasteTurns || 0;
  player.hasteTurns = Math.max(was, minTurns);
  if (was <= 0 && player.hasteTurns > 0) {
    if (!player.hasteSpeed) player.hasteSpeed = 2;
    player._hasteGrantFreeze = true;
    return true;
  }
  return false;
}

export function consumeHasteGrantFreeze(player) {
  const freeze = !!player?._hasteGrantFreeze;
  if (player) player._hasteGrantFreeze = false;
  return freeze;
}

export function worldTicksAfterAdvance(prevTime, nextTime) {
  return Math.floor((nextTime || 0) / ACTION_TIME_BASE) - Math.floor((prevTime || 0) / ACTION_TIME_BASE);
}

export function beginPlayerTurnClock(player, { idleBeat = false } = {}) {
  const freezeAtStart = !!player?._hasteGrantFreeze;
  const speed = playerActionSpeed(player, { idleBeat, hasteGrantFreeze: freezeAtStart });
  const cost = actionCost(speed);
  const prevTime = player?.actionTime || 0;
  if (player) player.actionTime = prevTime + cost;
  const nextTime = player?.actionTime || (prevTime + cost);
  return {
    cost,
    prevTime,
    worldTicks: worldTicksAfterAdvance(prevTime, nextTime),
    freezePending: freezeAtStart,
  };
}

export function syncActorsToClock(actors, actionTime) {
  const clock = actionTime || 0;
  for (const actor of actors || []) {
    if (actor) actor.actionTime = clock;
  }
}

export function finishPlayerTurnClock(player, monsters) {
  const freeze = consumeHasteGrantFreeze(player);
  if (freeze) syncActorsToClock(monsters, player?.actionTime || 0);
  return freeze;
}

export function ensureMonsterActionTime(monster, playerActionTime) {
  if (!monster) return 0;
  if (monster.actionTime != null) return monster.actionTime;
  const clock = playerActionTime || 0;
  /* 旧 turnAccum < 0（召喚直後の即行動抑制）は、この拍を消化済みとみなす。 */
  monster.actionTime = (monster.turnAccum || 0) < 0 ? clock : clock - ACTION_TIME_BASE;
  return monster.actionTime;
}

export function dueActionCount(actor, playerActionTime, speed) {
  const cost = actionCost(speed);
  if (!(cost > 0)) return 0;
  let time = actor?.actionTime || 0;
  let count = 0;
  const limit = playerActionTime || 0;
  while (time + cost <= limit + 1e-9 && count < 8) {
    time += cost;
    count++;
  }
  return count;
}

export function commitDueActions(actor, count, speed) {
  if (!actor || !(count > 0)) return;
  actor.actionTime = (actor.actionTime || 0) + actionCost(speed) * count;
}

/** 今回動ける回数を返し、その分の時計を先に進めて残りを溜めない。 */
export function takeDueActions(actor, playerActionTime, speed) {
  ensureMonsterActionTime(actor, playerActionTime);
  const due = dueActionCount(actor, playerActionTime, speed);
  commitDueActions(actor, due, speed);
  return due;
}
