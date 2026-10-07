import { uid, consumeBarrier, playerHpEffectLabel, withEnemyDamageContext } from './utils.js';
import { monsterAreaTargets, monsterOccupiesCell } from './monsterGeometry.js';
import { killMonster, multiplyCursedMagicDamage, inMagicSealRoom, weakenOrClearParalysis } from './items.js';
import { monEffectiveMagicImmune } from './monTraits.js';
import { pushExplosionAnim } from './animEvents.js';

export function canCastMeteor(monster, dungeon) {
  return !(monster.meteorCooldown > 0) && !dungeon.pendingMeteors?.some(meteor => meteor.sourceId === monster.id);
}

export function castMeteor(monster, dungeon, player, messages) {
  if (!canCastMeteor(monster, dungeon)) return false;
  (dungeon.pendingMeteors ||= []).push({
    id: uid(), sourceId: monster.id, sourceName: monster.name,
    x: player.x, y: player.y, turnsLeft: 2, damage: monster.meteorDamage ?? 60,
  });
  monster.meteorCooldown = monster.meteorInterval ?? 4;
  messages.push(`${monster.name}がメテオを詠唱した！赤い3×3マスに2ターン後、隕石が落ちる！`);
  return true;
}

/** 敵の行動回数ではなくフロアの時計で進める。詠唱はこの処理より後の敵攻撃フェーズ。 */
export function advanceMeteors(dungeon, player, messages, lu, worldTicks = 1) {
  if (worldTicks <= 0 || (dungeon.timeStopTurns || 0) > 0) return;
  for (const monster of dungeon.monsters || []) {
    if (monster.meteorCooldown > 0) monster.meteorCooldown = Math.max(0, monster.meteorCooldown - worldTicks);
  }
  for (const meteor of [...(dungeon.pendingMeteors || [])]) {
    if (player.hp <= 0) break;
    meteor.turnsLeft -= worldTicks;
    if (meteor.turnsLeft > 0) continue;
    // 効果に入る前に消費し、撃破・復活・連鎖効果から二度解決されないようにする。
    dungeon.pendingMeteors = dungeon.pendingMeteors.filter(pending => pending !== meteor);
    messages.push(`${meteor.sourceName}のメテオが着弾した！`);
    pushExplosionAnim(meteor.x, meteor.y);
    const source = dungeon.monsters?.find(monster => monster.id === meteor.sourceId) ||
      { id: meteor.sourceId, name: meteor.sourceName, hp: 0 };
    const inArea = (x, y) => Math.abs(x - meteor.x) <= 1 && Math.abs(y - meteor.y) <= 1 &&
      !inMagicSealRoom(x, y, dungeon);
    if (inArea(player.x, player.y) && !consumeBarrier(player, messages)) {
      const damage = multiplyCursedMagicDamage(meteor.damage, player, dungeon);
      player.deathCause = `${meteor.sourceName}のメテオにより`;
      withEnemyDamageContext(player, () => { player.hp -= damage; });
      messages.push(`メテオを受けた！${playerHpEffectLabel(player, damage)}！`);
    }
    const targets = monsterAreaTargets(dungeon.monsters || [], inArea);
    for (const monster of targets) {
      if (monster.hp <= 0 || !dungeon.monsters.includes(monster) || monster.disguisedAsItem) continue;
      if (monEffectiveMagicImmune(monster)) continue;
      if (consumeBarrier(monster, messages)) continue;
      weakenOrClearParalysis(monster, messages);
      const damage = multiplyCursedMagicDamage(meteor.damage, monster, dungeon);
      monster.hp -= damage;
      messages.push(`メテオが${monster.name}に命中！${damage}ダメージ！`);
      if (monster.hp <= 0) killMonster(monster, dungeon, player, messages, lu, false, source);
    }
  }
}

export function meteorAt(dungeon, x, y) {
  return dungeon.pendingMeteors?.filter(meteor => monsterOccupiesCell({ ...meteor, bodySize: 3 }, x, y)) || [];
}

export function drawMeteorWarnings(ctx, dungeon, sx, sy, tileSize) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(9, Math.round(tileSize * 0.5))}px sans-serif`;
  for (const meteor of dungeon.pendingMeteors || []) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = meteor.x + dx, y = meteor.y + dy;
      if (!dungeon.visible?.[y]?.[x]) continue;
      const px = (x - sx) * tileSize, py = (y - sy) * tileSize;
      ctx.fillStyle = meteor.turnsLeft === 1 ? 'rgba(255,40,20,0.48)' : 'rgba(255,80,20,0.3)';
      ctx.fillRect(px, py, tileSize, tileSize);
      ctx.strokeStyle = '#ffb040'; ctx.lineWidth = Math.max(1, tileSize * 0.06);
      ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
      ctx.fillStyle = '#fff2ce';
      ctx.strokeStyle = '#4b1000'; ctx.lineWidth = Math.max(2, tileSize * 0.08);
      ctx.strokeText(String(meteor.turnsLeft), px + tileSize / 2, py + tileSize / 2);
      ctx.fillText(String(meteor.turnsLeft), px + tileSize / 2, py + tileSize / 2);
    }
  }
  ctx.restore();
}
