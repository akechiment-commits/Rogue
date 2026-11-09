import {
  T, MW, MH, rng, stepProjectile, playerHpEffectLabel, calcAtkDefDmg,
  consumeBarrier, checkMonsterEvasion, hasGravityPentacle,
  ensureItemMimicFloorItems, revealDisguisedItemMimic, clampDmgFixed,
} from "./utils.js";
import {
  monsterBodyCells, monsterPointDistance, monsterOccupiesCell,
} from "./monsterGeometry.js";
import {
  statusTurns, isStatusImmune, applyMonsterDarkness, resolveParalysisHit,
} from "./statusDuration.js";
import {
  hasFireResist, reduceFireDamage, fireResistDamageLabel,
  hasLightningResist, reduceLightningDamage, lightningResistDamageLabel,
  applyLightningToInventory, killMonster, isFireExplosionNullified,
  blockPlayerStatus, hasRingEffect, pushEntity,
} from "./items.js";
import {
  monEffectiveFloat, monEffectiveMagicImmune, monScaleOutgoingDamage,
  monHasElementWeakness,
} from "./monTraits.js";
import { pushAnim, pushLightningAnim, pushSplashAnim } from "./animEvents.js";
import { wakeIfDormant, triggerMushroomCounterSpore } from "./monsterRuntime.js";
import { beginNpcRetaliation } from "./npcRetaliation.js";

let combatDeps = {};

export function setHexachromaticCombatDeps(deps) {
  combatDeps = deps || {};
}

/** Find the nearest clear 8-way firing line from any cell of the 3×3 body. */
export function getHexachromaticBreathLine(monster, dungeon, player) {
  if (!player || player.hp <= 0) return null;
  const bodyDistance = monsterPointDistance(monster, player.x, player.y);
  if (bodyDistance < 2 || bodyDistance > 10) return null;

  let best = null;
  for (const origin of monsterBodyCells(monster)) {
    if ([T.WALL, T.BWALL].includes(dungeon.map?.[origin.y]?.[origin.x])) continue;
    const dx = player.x - origin.x, dy = player.y - origin.y;
    if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) continue;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist < 2 || dist > 10) continue;

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

    const centerDistance = Math.abs(origin.x - monster.x) + Math.abs(origin.y - monster.y);
    if (!best || dist < best.dist || (dist === best.dist && centerDistance < best.centerDistance)) {
      best = { origin, dx: stepX, dy: stepY, dist, centerDistance };
    }
  }
  return best;
}

function traceBreath(monster, dungeon, player, line, color) {
  let x = line.origin.x, y = line.origin.y, dx = line.dx, dy = line.dy;
  const path = [{ x, y }];
  let victim = null;
  for (let distance = 1; distance <= MW + MH; distance++) {
    const step = stepProjectile(dungeon, x, y, dx, dy, { wind: true });
    x = step.x;
    y = step.y;
    dx = step.dx;
    dy = step.dy;
    if (x < 0 || x >= MW || y < 0 || y >= MH ||
        [T.WALL, T.BWALL].includes(dungeon.map?.[y]?.[x])) break;
    path.push({ x, y });
    if (x === player.x && y === player.y) {
      victim = { kind: "player", target: player };
      break;
    }
    const monsterHit = dungeon.monsters?.find(other => other !== monster && other.hp > 0 &&
      !other.disguisedAsItem && monsterOccupiesCell(other, x, y));
    if (monsterHit) {
      victim = { kind: "monster", target: monsterHit };
      break;
    }
  }
  if (path.length > 1) {
    const end = path[path.length - 1];
    pushAnim({ type: "monProjectile", fromX: line.origin.x, fromY: line.origin.y,
      toX: end.x, toY: end.y, color, path });
  }
  return victim;
}

function applyBreathMonsterDamage(monster, victim, damage, dungeon, player, messages, opts, label) {
  wakeIfDormant(victim, messages);
  if (consumeBarrier(victim, messages)) {
    if (monster && dungeon.monsters?.includes(monster)) beginNpcRetaliation(victim, monster, messages);
    return;
  }
  damage = monScaleOutgoingDamage(monster, clampDmgFixed(victim, damage, true));
  victim.hp -= damage;
  messages.push(`${monster.name}の${label}が${victim.name}に命中！${damage}ダメージ！`);
  resolveParalysisHit(victim, messages);
  triggerMushroomCounterSpore(victim, dungeon, player, messages);
  if (victim.hp <= 0) killMonster(victim, dungeon, player, messages, opts.luFn || null, false, monster);
}

export function hexachromaticFireBreath(monster, dungeon, player, line, messages, opts = {}) {
  if (isFireExplosionNullified(dungeon, player)) {
    messages.push((player.fireExplosionNullTurns || 0) > 0
      ? `炎と爆発が不発にされた！（残り${player.fireExplosionNullTurns}ターン）`
      : `呪われた爆発の魔方陣が${monster.name}の火炎ブレスを打ち消した！`);
    return;
  }
  messages.push(`${monster.name}が火炎ブレスを放った！`);
  const hit = traceBreath(monster, dungeon, player, line, "#ff653d");
  if (!hit) return;
  if (hit.kind === "player") {
    if (consumeBarrier(player, messages)) return;
    const fireProtected = hasFireResist(player);
    const oily = (player.oilyTurns || 0) > 0 || dungeon.oilyTiles?.some(tile => tile.x === player.x && tile.y === player.y);
    let damage = reduceFireDamage(80, player);
    if (oily) damage *= 2;
    damage = monScaleOutgoingDamage(monster, damage);
    player.deathCause = `${monster.name}の火炎ブレスで`;
    player.hp -= damage;
    opts.onPlayerHit?.(damage, monster);
    messages.push(`${monster.name}の火炎ブレスが直撃！${playerHpEffectLabel(player, damage)}！${fireResistDamageLabel(player)}${oily ? "(油まみれ×2)" : ""}`);
    combatDeps.interruptPlayerSleep?.(player, messages);
    combatDeps.weakenOrClearParalysis?.(player, messages);
    if (!fireProtected) {
      applyLightningToInventory(player, dungeon, messages, null, null, true,
        { killerMon: monster, sourceIsPlayer: false });
    }
    return;
  }
  const victim = hit.target;
  const weakMult = monHasElementWeakness(victim, "fire") ? 1.5 : 1;
  const damage = combatDeps.scaleMonFireDmg?.(victim, Math.round(80 * weakMult)) ?? Math.round(80 * weakMult);
  applyBreathMonsterDamage(monster, victim, damage, dungeon, player, messages, opts, "火炎ブレス");
}

function pushPlayerAlongBreath(monster, dungeon, player, dx, dy, messages, opts) {
  if (player.hp <= 0 || (dx === 0 && dy === 0)) return;
  const startX = player.x, startY = player.y;
  const result = pushEntity(dungeon, player.x, player.y, dx, dy, 3, messages,
    "player", player, player, opts.luFn || null, 0, monster);
  if (result.x !== startX || result.y !== startY) {
    opts.onPlayerKnockback?.(startX, startY, player.x, player.y, monster);
    messages.push(`${monster.name}の風のブレスで吹き飛ばされた！`);
  }
}

export function hexachromaticWindBreath(monster, dungeon, player, line, messages, opts = {}) {
  messages.push(`${monster.name}が風のブレスを放った！`);
  const hit = traceBreath(monster, dungeon, player, line, "#b7f4ff");
  if (!hit) return;
  if (hit.kind === "player") {
    combatDeps.monsterAttackPlayer?.(monster, dungeon, player, messages,
      damage => `${monster.name}の風のブレス！${damage}ダメージ！`, {
        damageMultiplier: 0.5,
        attackName: "風のブレス",
        onPlayerHit: (damage, source) => {
          opts.onPlayerHit?.(damage, source);
          pushPlayerAlongBreath(monster, dungeon, player, line.dx, line.dy, messages, opts);
        },
        onPlayerMiss: opts.onPlayerMiss,
        luFn: opts.luFn,
      });
    return;
  }
  const victim = hit.target;
  wakeIfDormant(victim, messages);
  if (consumeBarrier(victim, messages)) {
    if (monster && dungeon.monsters?.includes(monster)) beginNpcRetaliation(victim, monster, messages);
    return;
  }
  if (checkMonsterEvasion(victim, { baseMissRate: 0.05 })) {
    messages.push(`${victim.name}は風のブレスをかわした！`);
    return;
  }
  const normalDamage = calcAtkDefDmg(monster.atk, victim.def || 0, { defWeight: 1, variance: false });
  const damage = monScaleOutgoingDamage(monster, clampDmgFixed(victim, Math.max(1, Math.floor(normalDamage * 0.5) + rng(-1, 1)), true));
  victim.hp -= damage;
  messages.push(`${monster.name}の風のブレスが${victim.name}に命中！${damage}ダメージ！`);
  resolveParalysisHit(victim, messages);
  triggerMushroomCounterSpore(victim, dungeon, player, messages);
  if (victim.hp <= 0) {
    killMonster(victim, dungeon, player, messages, opts.luFn || null, false, monster);
  } else {
    pushEntity(dungeon, victim.x, victim.y, line.dx, line.dy, 3, messages,
      "monster", victim, player, opts.luFn || null, 0, monster);
    if (victim.hp <= 0) killMonster(victim, dungeon, player, messages, opts.luFn || null, false, monster);
  }
}

function applyMonsterDarknessStatus(victim, messages) {
  const turns = statusTurns("darkness", { kind: "monster", target: victim });
  if (applyMonsterDarkness(victim, turns, messages) > 0) {
    messages.push(`${victim.name}は暗闇状態になった！(${turns}ターン)`);
  }
}

export function hexachromaticDarkBreath(monster, dungeon, player, line, messages, opts = {}) {
  messages.push(`${monster.name}が闇のブレスを放った！`);
  const hit = traceBreath(monster, dungeon, player, line, "#8f67d8");
  if (!hit) return;
  if (hit.kind === "player") {
    combatDeps.monsterAttackPlayer?.(monster, dungeon, player, messages,
      damage => `${monster.name}の闇のブレス！${damage}ダメージ！`, {
        damageMultiplier: 0.5,
        attackName: "闇のブレス",
        onPlayerHit: (damage, source) => {
          opts.onPlayerHit?.(damage, source);
          if (blockPlayerStatus(player, messages, {
            proofAbility: "darkness_proof", proofMsg: "しかし防具が暗闇を防いだ！(耐暗闇)",
          })) return;
          if (!isStatusImmune(player, messages)) {
            const turns = statusTurns("darkness", { kind: "player" });
            player.darknessTurns = (player.darknessTurns || 0) + turns;
            messages.push(`${player.name || "プレイヤー"}は暗闇状態になった！(${turns}ターン)`);
          }
        },
        onPlayerMiss: opts.onPlayerMiss,
        luFn: opts.luFn,
      });
    return;
  }
  const victim = hit.target;
  wakeIfDormant(victim, messages);
  if (consumeBarrier(victim, messages)) {
    if (monster && dungeon.monsters?.includes(monster)) beginNpcRetaliation(victim, monster, messages);
    return;
  }
  if (checkMonsterEvasion(victim, { baseMissRate: 0.05 })) {
    messages.push(`${victim.name}は闇のブレスをかわした！`);
    return;
  }
  const normalDamage = calcAtkDefDmg(monster.atk, victim.def || 0, { defWeight: 1, variance: false });
  const damage = monScaleOutgoingDamage(monster, clampDmgFixed(victim, Math.max(1, Math.floor(normalDamage * 0.5) + rng(-1, 1)), true));
  victim.hp -= damage;
  messages.push(`${monster.name}の闇のブレスが${victim.name}に命中！${damage}ダメージ！`);
  resolveParalysisHit(victim, messages);
  triggerMushroomCounterSpore(victim, dungeon, player, messages);
  if (victim.hp <= 0) {
    killMonster(victim, dungeon, player, messages, opts.luFn || null, false, monster);
  } else {
    applyMonsterDarknessStatus(victim, messages);
  }
}

export function hexachromaticEarthquake(monster, dungeon, player, room, messages, opts = {}) {
  messages.push(`${monster.name}が地震を起こした！`);
  pushSplashAnim(monster.x, monster.y, "#c79a55");
  ensureItemMimicFloorItems(dungeon);
  const inRoom = (x, y) => !!room && opts.findRoom?.(dungeon.rooms, x, y) === room;
  for (const victim of [...(dungeon.monsters || [])]) {
    if (victim === monster || victim.hp <= 0 || !inRoom(victim.x, victim.y)) continue;
    const floating = monEffectiveFloat(victim) &&
      (monEffectiveMagicImmune(victim) || !hasGravityPentacle(dungeon, victim.x, victim.y));
    if (floating) {
      messages.push(`${victim.name}は浮遊していて地震をかわした！`);
      continue;
    }
    revealDisguisedItemMimic(dungeon, victim, messages);
    wakeIfDormant(victim, messages);
    if (consumeBarrier(victim, messages)) {
      if (monster && dungeon.monsters?.includes(monster)) beginNpcRetaliation(victim, monster, messages);
      continue;
    }
    const damage = monScaleOutgoingDamage(monster, clampDmgFixed(victim, rng(15, 25), true));
    victim.hp -= damage;
    messages.push(`地震が${victim.name}を襲った！${damage}ダメージ！`);
    resolveParalysisHit(victim, messages);
    triggerMushroomCounterSpore(victim, dungeon, player, messages);
    if (victim.hp <= 0) killMonster(victim, dungeon, player, messages, opts.luFn || null, false, monster);
  }
  if (player.hp <= 0 || !inRoom(player.x, player.y)) return;
  const playerFloating = (hasRingEffect(player, "float_ring") || (player.floatTurns || 0) > 0) &&
    !hasGravityPentacle(dungeon, player.x, player.y);
  if (playerFloating) {
    messages.push("浮遊していて地震を受けなかった！");
    return;
  }
  if (consumeBarrier(player, messages)) return;
  const damage = monScaleOutgoingDamage(monster, rng(15, 25));
  player.deathCause = `${monster.name}の地震で`;
  player.hp -= damage;
  opts.onPlayerHit?.(damage, monster);
  messages.push(`地震が${player.name || "プレイヤー"}を襲った！${playerHpEffectLabel(player, damage)}！`);
  combatDeps.interruptPlayerSleep?.(player, messages);
  combatDeps.weakenOrClearParalysis?.(player, messages);
}

export function hexachromaticLightning(monster, dungeon, player, messages, opts = {}) {
  if (consumeBarrier(player, messages)) return;
  const baseDamage = rng(22, 32);
  const damage = monScaleOutgoingDamage(monster, reduceLightningDamage(baseDamage, player));
  player.deathCause = `${monster.name}の電撃で`;
  player.hp -= damage;
  opts.onPlayerHit?.(damage, monster);
  messages.push(`${monster.name}の電撃が落ちた！${playerHpEffectLabel(player, damage)}！${lightningResistDamageLabel(player)}`);
  pushLightningAnim(player.x, player.y);
  combatDeps.interruptPlayerSleep?.(player, messages);
  combatDeps.weakenOrClearParalysis?.(player, messages);
  if (!hasLightningResist(player)) {
    applyLightningToInventory(player, dungeon, messages, opts.luFn || null, null, false,
      { killerMon: monster, sourceIsPlayer: false });
  }
}

export function hexachromaticVicoloLiberatio(monster, dungeon, player, messages, opts = {}) {
  pushSplashAnim(monster.x, monster.y, "#f5d5ff");
  for (let strike = 1; strike <= 6; strike++) {
    const adjacent = opts.isPlayerAdjacent
      ? opts.isPlayerAdjacent()
      : monsterPointDistance(monster, player.x, player.y) === 1;
    if (player.hp <= 0 || !adjacent) break;
    combatDeps.monsterAttackPlayer?.(monster, dungeon, player, messages,
      damage => `${monster.name}のヴィコロール・リベラティオ！(${strike}/6) ${damage}ダメージ！`, {
        attackName: "ヴィコロール・リベラティオ",
        onPlayerHit: opts.onPlayerHit,
        onPlayerMiss: opts.onPlayerMiss,
        luFn: opts.luFn,
      });
  }
}
