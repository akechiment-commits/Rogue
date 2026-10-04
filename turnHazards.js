import { canActivateTrap } from "./trapActivationTurn.js";

/** 敵移動後・敵攻撃前に発火する罠、爆発、時限爆弾を解決する。 */
export function resolveTurnHazards(state, player, messages, {
  hasRingEffect,
  random = Math.random,
  doExplosion,
  runMineExplosion,
  doTimeBombExplosion,
  fireTrapPlayer,
  getItemName,
  lu,
  ident,
  tickTimedEffects = true,
}) {
  const dungeon = state.dungeon;
  if ((dungeon?.timeStopTurns || 0) > 0) return { spinFired: false };
  if (tickTimedEffects && player.hp > 0 && hasRingEffect(player, "explode_ring") && random() < 0.05) {
    messages.push("指輪が爆発した！");
    doExplosion(player.x, player.y, dungeon, player, messages, getItemName, "爆発の指輪", null, null, false, true);
  }

  if (!state._pendingMineExplosion && dungeon._pendingMineExplosion) {
    state._pendingMineExplosion = dungeon._pendingMineExplosion;
  }
  delete dungeon._pendingMineExplosion;
  if (state._pendingMineExplosion && player.hp > 0) {
    const pendingMine = state._pendingMineExplosion;
    delete state._pendingMineExplosion;
    const trap = pendingMine.trapId != null ? { id: pendingMine.trapId }
      : dungeon.traps?.find(t => t.effect === "explode" && t.x === pendingMine.x && t.y === pendingMine.y);
    if (!trap || canActivateTrap(dungeon, trap, true)) {
      messages.push(`${pendingMine.name}が発動！`);
      runMineExplosion(dungeon, pendingMine, player, messages, lu);
    }
  }

  if (tickTimedEffects && dungeon.pendingBombs?.length > 0 && player.hp > 0) {
    for (const bomb of [...dungeon.pendingBombs]) {
      // 先行する爆発に誘爆・消火されたものは、再び起爆しない。
      if (!dungeon.pendingBombs.includes(bomb)) continue;
      bomb.turnsLeft--;
      if (bomb.turnsLeft <= 0) {
        // 爆発処理に入る前に消費し、誘爆先から逆に誘爆されるのを防ぐ。
        dungeon.pendingBombs = dungeon.pendingBombs.filter(pending => pending !== bomb);
        messages.push("時限爆弾の罠が大爆発した！");
        doTimeBombExplosion(bomb.x, bomb.y, dungeon, player, messages, lu, getItemName, { sourcePending: bomb });
      } else {
        messages.push(`時限爆弾の罠：あと${bomb.turnsLeft}ターンで爆発！`);
      }
    }
  }

  if (!state._pendingSpin || player.hp <= 0) return { spinFired: false };
  const pendingSpin = state._pendingSpin;
  delete state._pendingSpin;
  if (!canActivateTrap(dungeon, pendingSpin)) return { spinFired: false };
  fireTrapPlayer(pendingSpin, player, dungeon, messages, getItemName, lu, { ident });
  return { spinFired: true };
}
