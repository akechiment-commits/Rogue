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
    messages.push(`${pendingMine.name}が発動！`);
    runMineExplosion(dungeon, pendingMine, player, messages, lu);
  }

  if (tickTimedEffects && dungeon.pendingBombs?.length > 0 && player.hp > 0) {
    const remaining = [];
    for (const bomb of dungeon.pendingBombs) {
      bomb.turnsLeft--;
      if (bomb.turnsLeft <= 0) {
        messages.push("時限爆弾の罠が大爆発した！");
        doTimeBombExplosion(bomb.x, bomb.y, dungeon, player, messages, lu, getItemName, { sourcePending: bomb });
      } else {
        messages.push(`時限爆弾の罠：あと${bomb.turnsLeft}ターンで爆発！`);
        remaining.push(bomb);
      }
    }
    /* 爆発の連鎖で先に消費された作動済み爆弾を復活させない。 */
    const _stillPending = new Set(dungeon.pendingBombs || []);
    dungeon.pendingBombs = remaining.filter((bomb) => _stillPending.has(bomb));
  }

  if (!state._pendingSpin || player.hp <= 0) return { spinFired: false };
  const pendingSpin = state._pendingSpin;
  delete state._pendingSpin;
  fireTrapPlayer(pendingSpin, player, dungeon, messages, getItemName, lu, { ident });
  return { spinFired: true };
}
