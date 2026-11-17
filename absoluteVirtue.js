import {
  T, MW, MH, checkMonsterEvasion,
  consumeBarrier, playerHpEffectLabel, withEnemyDamageContext,
} from "./utils.js";
import {
  canPlaceMonsterBody, monsterBodyCells, monsterBodySize, monsterBounds, monsterDistance,
  monsterOccupiesCell,
} from "./monsterGeometry.js";
import {
  hasRingEffect, inMagicSealRoom, killMonster, multiplyCursedMagicDamage,
  pushEntity, weakenOrClearParalysis, hasPlayerMagicReflect, drownMonsterIfNeeded,
} from "./items.js";
import { monEffectiveMagicImmune, monReflectsMagic } from "./monTraits.js";
import { wakeIfDormant } from "./monsterRuntime.js";
import { resolveParalysisHit } from "./statusDuration.js";
import { interruptPlayerSleep } from "./turnUpkeep.js";
import { plName } from "./playerLabel.js";
import { pushSplashAnim, pushPlayerKnockbackAnim } from "./animEvents.js";

/** Closest clear ray from any exposed cell of Absolute Virtue's 3x3 body. */
export function getAbsoluteVirtueLine(monster, dungeon, player) {
  if (!monster || !player || player.hp <= 0) return null;
  const bodyDistance = monsterDistance(monster, { x: player.x, y: player.y });
  if (bodyDistance < 2 || bodyDistance > 10) return null;

  let best = null;
  for (const origin of monsterBodyCells(monster)) {
    if ([T.WALL, T.BWALL].includes(dungeon.map?.[origin.y]?.[origin.x])) continue;
    const dx = player.x - origin.x, dy = player.y - origin.y;
    if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) continue;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    if (distance < 2 || distance > 10) continue;
    const stepX = Math.sign(dx), stepY = Math.sign(dy);
    let x = origin.x + stepX, y = origin.y + stepY, blocked = false;
    while (x !== player.x || y !== player.y) {
      if (x < 0 || x >= MW || y < 0 || y >= MH ||
          [T.WALL, T.BWALL].includes(dungeon.map?.[y]?.[x])) {
        blocked = true;
        break;
      }
      x += stepX;
      y += stepY;
    }
    if (blocked) continue;
    if (!best || distance < best.distance) best = { origin, dx: stepX, dy: stepY, distance };
  }
  return best;
}

function firstAerogaTarget(monster, dungeon, player, line) {
  let x = line.origin.x, y = line.origin.y;
  for (let step = 1; step <= line.distance; step++) {
    x += line.dx;
    y += line.dy;
    if ([T.WALL, T.BWALL].includes(dungeon.map?.[y]?.[x])) return null;
    if (x === player.x && y === player.y) return player;
    const target = (dungeon.monsters || []).find(other => other !== monster && other.hp > 0 &&
      !other.disguisedAsItem && monsterOccupiesCell(other, x, y));
    if (target) return target;
  }
  return null;
}

function hitAerogaTarget(monster, target, dungeon, player, messages, opts) {
  if (target === player) {
    if (consumeBarrier(player, messages)) return false;
    const damage = multiplyCursedMagicDamage(80, player, dungeon);
    player.deathCause = `${monster.name}のエアロガで`;
    withEnemyDamageContext(player, () => { player.hp -= damage; });
    opts.onPlayerHit?.(damage, monster);
    messages.push(`${monster.name}のエアロガが${plName(player)}に命中！${playerHpEffectLabel(player, damage)}！`);
    interruptPlayerSleep(player, messages);
    weakenOrClearParalysis(player, messages);
    return true;
  }

  if (target.hp <= 0 || !dungeon.monsters?.includes(target)) return false;
  if (monEffectiveMagicImmune(target)) {
    messages.push(`${target.name}は魔法を無効化した！`);
    return false;
  }
  if (consumeBarrier(target, messages)) return false;
  if (checkMonsterEvasion(target, { baseMissRate: 0.05 })) {
    messages.push(`${target.name}はエアロガをかわした！`);
    return false;
  }
  const damage = multiplyCursedMagicDamage(80, target, dungeon);
  target.hp -= damage;
  resolveParalysisHit(target, messages);
  messages.push(`${monster.name}のエアロガが${target.name}に命中！${damage}ダメージ！`);
  if (target.hp <= 0) killMonster(target, dungeon, player, messages, opts.luFn || null, false, monster);
  else if (target.type === "shopkeeper") opts.beginNpcRetaliation?.(target, monster, messages);
  return true;
}

export function castAbsoluteVirtueAeroga(monster, dungeon, player, line, messages, opts = {}) {
  const target = firstAerogaTarget(monster, dungeon, player, line);
  pushSplashAnim(monster.x, monster.y, "#b9f6ff");
  if (!target) {
    messages.push(`${monster.name}がエアロガを唱えたが、風は誰にも届かなかった！`);
    return false;
  }

  const hitCount = (monster.chainspellTurns || 0) > 0 ? 2 : 1;
  let landed = false;
  for (let hit = 1; hit <= hitCount && target.hp > 0; hit++) {
    const didHit = hitAerogaTarget(monster, target, dungeon, player, messages, opts);
    landed ||= didHit;
    if (target.hp > 0 && hitCount > 1 && didHit) {
      messages.push(`連続魔の風が${target === player ? plName(player) : target.name}にもう一度襲いかかった！(${hit}/2)`);
    }
  }
  if (!landed || target.hp <= 0) return landed;

  const kind = target === player ? "player" : "monster";
  const fromX = target.x, fromY = target.y;
  pushEntity(dungeon, fromX, fromY, line.dx, line.dy, 3, messages,
    kind, target, player, opts.luFn || null, 0, monster);
  if (target.x !== fromX || target.y !== fromY) {
    if (target === player) {
      messages.push(`${plName(player)}はエアロガで吹き飛ばされた！`);
    } else {
      messages.push(`${target.name}はエアロガで吹き飛ばされた！`);
    }
  }
  if (target !== player && target.hp <= 0 && dungeon.monsters?.includes(target)) {
    killMonster(target, dungeon, player, messages, opts.luFn || null, false, monster);
  }
  return landed;
}

function isWalkablePullCell(dungeon, x, y) {
  return x > 0 && x < MW - 1 && y > 0 && y < MH - 1 &&
    ![T.WALL, T.BWALL].includes(dungeon.map?.[y]?.[x]) &&
    !dungeon.statues?.some(statue => statue.x === x && statue.y === y);
}

function absoluteVirtuePullLanding(anchor, mover, dungeon, player, originX, originY, dx, dy) {
  const anchorBounds = anchor === player ? { x: player.x, y: player.y, width: 1, height: 1 } : monsterBounds(anchor);
  const moverOffset = mover === player ? 0 : Math.floor((monsterBodySize(mover) - 1) / 2);
  const pad = 1 + moverOffset;
  const candidates = [];
  for (let y = anchorBounds.y - pad; y <= anchorBounds.y + anchorBounds.height - 1 + pad; y++) {
    for (let x = anchorBounds.x - pad; x <= anchorBounds.x + anchorBounds.width - 1 + pad; x++) {
      const dist = mover === player
        ? monsterDistance(anchor, { x, y })
        : anchor === player
          ? monsterDistance({ ...mover, x, y }, player)
          : monsterDistance(anchor, { ...mover, x, y });
      if (dist !== 1 || !isWalkablePullCell(dungeon, x, y)) continue;
      if (mover === player) {
        if ((dungeon.monsters || []).some(other => other !== anchor && other.hp > 0 && !other.disguisedAsItem && monsterOccupiesCell(other, x, y))) continue;
      } else if (!canPlaceMonsterBody(dungeon, mover, x, y, player)) {
        continue;
      }
      const ox = x - originX, oy = y - originY;
      candidates.push({
        x, y,
        projection: ox * dx + oy * dy,
        crossTrack: Math.abs(ox * dy - oy * dx),
        distance: Math.max(Math.abs(mover.x - x), Math.abs(mover.y - y)),
      });
    }
  }
  candidates.sort((a, b) =>
    b.projection - a.projection || a.crossTrack - b.crossTrack || a.distance - b.distance || a.y - b.y || a.x - b.x,
  );
  return candidates[0] || null;
}

export function castAbsoluteVirtuePull(monster, dungeon, player, line, messages, luFn = null) {
  if (inMagicSealRoom(monster.x, monster.y, dungeon)) {
    messages.push(`${monster.name}は引き寄せの魔法を唱えようとしたが、魔封じの魔方陣で封じられた！`);
    return false;
  }

  let target = null;
  let x = line.origin.x, y = line.origin.y;
  for (let step = 1; step <= line.distance; step++) {
    x += line.dx;
    y += line.dy;
    if ([T.WALL, T.BWALL].includes(dungeon.map?.[y]?.[x])) break;
    if (x === player.x && y === player.y) { target = player; break; }
    target = (dungeon.monsters || []).find(other => other !== monster && other.hp > 0 &&
      !other.disguisedAsItem && monsterOccupiesCell(other, x, y)) || null;
    if (target) break;
  }
  if (!target) {
    messages.push(`${monster.name}は引き寄せの魔法を唱えたが、対象がいなかった！`);
    return false;
  }
  if (inMagicSealRoom(target.x, target.y, dungeon)) {
    messages.push(`魔封じの魔方陣が${target === player ? plName(player) : target.name}への引き寄せを防いだ！`);
    return false;
  }
  if (target === player) {
    const blessedSanctuary = dungeon.pentacles?.some(pentacle => pentacle.kind === "sanctuary" &&
      pentacle.blessed && pentacle.x === player.x && pentacle.y === player.y);
    if (blessedSanctuary) {
      messages.push(`祝福された聖域の加護が${monster.name}の引き寄せの魔法を防いだ！`);
      return false;
    }
  } else if (monEffectiveMagicImmune(target)) {
    messages.push(`魔法は${target.name}に効かない！`);
    return false;
  }

  const reflected = target === player ? hasPlayerMagicReflect(player) : monReflectsMagic(target);
  if (reflected) {
    if (monster.forcedMoveImmune || monster.stationary) {
      messages.push(`${target === player ? "魔法反射" : target.name}が引き寄せの魔法を跳ね返したが、${monster.name}は耐えた！`);
      return false;
    }
    const casterLanding = absoluteVirtuePullLanding(target, monster, dungeon, player, target.x, target.y, -line.dx, -line.dy);
    if (!casterLanding) {
      messages.push(`${target === player ? "魔法反射" : target.name}が${monster.name}の引き寄せの魔法を跳ね返したが、飛びつく場所がなかった！`);
      return false;
    }
    const fromX = monster.x, fromY = monster.y;
    monster.x = casterLanding.x;
    monster.y = casterLanding.y;
    monster.dir = { x: Math.sign(casterLanding.x - fromX), y: Math.sign(casterLanding.y - fromY) };
    if ((monster.immobileTurns || 0) > 0) monster.immobileTurns = 0;
    monster.posHistory = [];
    monster._idleStuck = 0;
    monster._movedThisTurn = true;
    messages.push(`${monster.name}は引き寄せの魔法を唱えた！`);
    if (target === player) {
      messages.push(`魔法反射が引き寄せの魔法を跳ね返し、${monster.name}が${plName(player)}の目の前に飛びついた！`);
    } else {
      messages.push(`${target.name}が引き寄せの魔法を反射し、${monster.name}が${target.name}の目の前に飛びついた！`);
    }
    drownMonsterIfNeeded(monster, dungeon, player, messages, luFn);
    return true;
  }

  if (target === player) {
    if (hasRingEffect(player, "core_ring")) {
      messages.push(`${monster.name}の引き寄せの魔法を受けそうになったが、体幹の指輪で踏ん張った！`);
      return false;
    }
  } else if (target.forcedMoveImmune || target.stationary) {
    messages.push(`${target.name}は${monster.name}の引き寄せに耐えた！`);
    return false;
  }

  const landing = absoluteVirtuePullLanding(monster, target, dungeon, player, line.origin.x, line.origin.y, line.dx, line.dy);
  if (!landing) {
    messages.push(`${monster.name}は引き寄せの魔法を唱えたが、引き寄せる場所がなかった！`);
    return false;
  }
  if (target === player) {
    const fromX = player.x, fromY = player.y;
    player.x = landing.x;
    player.y = landing.y;
    pushPlayerKnockbackAnim(fromX, fromY, player.x, player.y, -line.dx, -line.dy);
    messages.push(`${monster.name}は引き寄せの魔法を唱えた！`);
    messages.push(`${plName(player)}は${monster.name}の目の前に引き寄せられた！`);
    if ((player.immobileTurns || 0) > 0) {
      player.immobileTurns = 0;
      messages.push("移動封じが解けた！");
    }
    interruptPlayerSleep(player, messages, "引き寄せられて目が覚めた！");
    resolveParalysisHit(player, messages);
    return true;
  }

  const fromX = target.x, fromY = target.y;
  target.x = landing.x;
  target.y = landing.y;
  target.dir = { x: Math.sign(landing.x - fromX), y: Math.sign(landing.y - fromY) };
  if ((target.immobileTurns || 0) > 0) target.immobileTurns = 0;
  target.aware = true;
  target.lastPx = player.x;
  target.lastPy = player.y;
  target.posHistory = [];
  target._idleStuck = 0;
  target.patrolTarget = null;
  messages.push(`${monster.name}の引き寄せの魔法が${target.name}に命中した！`);
  messages.push(`${target.name}は${monster.name}の目の前に引き寄せられた！`);
  wakeIfDormant(target, messages);
  resolveParalysisHit(target, messages);
  drownMonsterIfNeeded(target, dungeon, player, messages, luFn, monster);
  return true;
}

export function castAbsoluteVirtueGoddessBlessing(monster, dungeon, player, messages) {
  if (inMagicSealRoom(monster.x, monster.y, dungeon)) {
    messages.push(`${monster.name}は女神の祝福を唱えようとしたが、魔封じの魔法陣で封じられた！`);
    return false;
  }
  const room = dungeon.rooms?.find(candidate =>
    monster.x >= candidate.x && monster.x < candidate.x + candidate.w &&
    monster.y >= candidate.y && monster.y < candidate.y + candidate.h,
  );
  if (!room) return false;
  messages.push(`${monster.name}が女神の祝福を唱えた！`);
  const inRoom = (x, y) => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
  let healedCount = 0;
  if (player.hp > 0 && inRoom(player.x, player.y)) {
    const heal = Math.min(250, Math.max(0, (player.maxHp || player.hp) - player.hp));
    if (heal > 0) {
      player.hp += heal;
      healedCount++;
      messages.push(`${plName(player)}は女神の祝福で${heal}HP回復した！`);
    }
  }
  for (const target of dungeon.monsters || []) {
    if (target.hp <= 0 || !inRoom(target.x, target.y)) continue;
    const heal = Math.min(250, Math.max(0, (target.maxHp || target.hp) - target.hp));
    if (heal <= 0) continue;
    target.hp += heal;
    healedCount++;
    messages.push(`${target.name}は女神の祝福で${heal}HP回復した！`);
  }
  pushSplashAnim(monster.x, monster.y, "#fff2a8");
  if (healedCount === 0) messages.push("しかし、回復する者はいなかった！");
  return true;
}
