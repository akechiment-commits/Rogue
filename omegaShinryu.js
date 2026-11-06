import {
  T, MW, MH, uid, rng, calcAtkDefDmg, calcPlayerDefense, playerHpEffectLabel,
  checkMonsterEvasion, consumeBarrier,
} from "./utils.js";
import {
  monsterBodyCells, monsterBounds, monsterOccupiesCell,
} from "./monsterGeometry.js";
import {
  isAttackSealed, isStatusImmune, resolveParalysisHit,
} from "./statusDuration.js";
import {
  blockPlayerStatus, hasPlayerMagicReflect, playerMagicReflectLabel, killMonster, pushEntity,
  blankScrollOrSpellbook, reduceWaterDamage, waterResistDamageLabel,
  reduceLightningDamage, hasLightningResist, lightningResistDamageLabel,
  applyLightningToInventory, wallBreakDrop,
} from "./items.js";
import { monElementDamageMultiplier, monHasElementWeakness } from "./monTraits.js";
import { blockLargeMonsterStatus, startLargeMonsterStatusCooldown } from "./largeMonsterStatus.js";
import { pushAnim, pushLightningAnim, pushSplashAnim } from "./animEvents.js";

let combatDeps = {};

export function setOmegaShinryuCombatDeps(deps) {
  combatDeps = deps || {};
}

/** Find a clear line from any exposed body cell to the target. */
export function getOmegaShinryuLine(monster, dungeon, player, minDistance = 1) {
  if (!monster || !player || player.hp <= 0) return null;
  let best = null;
  for (const origin of monsterBodyCells(monster)) {
    if ([T.WALL, T.BWALL].includes(dungeon.map?.[origin.y]?.[origin.x])) continue;
    const dx = player.x - origin.x, dy = player.y - origin.y;
    if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) continue;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    if (distance < minDistance || distance > 10) continue;
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
    if (!best || distance < best.distance ||
        (distance === best.distance && centerDistance < best.centerDistance)) {
      best = { origin, dx: stepX, dy: stepY, distance, centerDistance };
    }
  }
  return best;
}

export function chooseOmegaAttack(line, adjacent, canSee, random = Math.random) {
  const roll = random();
  if (line?.distance >= 2) {
    if (roll < 0.20) return "waveCannon";
    if (roll < 0.40) return "atomicRay";
    if (roll < 0.50) return "blaster";
    if (roll < 0.60) return "rainbowWind";
    if (canSee && roll < 0.70) return "mustardBomb";
  } else if (adjacent) {
    if (roll < 0.10) return "blaster";
    if (roll < 0.20) return "rainbowWind";
    if (canSee && roll < 0.30) return "mustardBomb";
  } else if (canSee && roll < 0.10) {
    return "mustardBomb";
  }
  return null;
}

export function chooseShinryuAttack(line, adjacent, canSee, random = Math.random) {
  const roll = random();
  if (line?.distance >= 2) {
    if (roll < 0.20) return "tidalWave";
    if (roll < 0.40) return "atomicRay";
    if (canSee && roll < 0.60) return "lightning";
    if (canSee && roll < 0.70) return "mightyGuard";
  } else if (adjacent) {
    if (roll < 0.10) return "evilEye";
    if (canSee && roll < 0.30) return "lightning";
    if (canSee && roll < 0.40) return "mightyGuard";
  } else if (canSee) {
    if (roll < 0.20) return "lightning";
    if (roll < 0.30) return "mightyGuard";
  }
  return null;
}

function areaCellsFromLine(line, breakWalls = false) {
  if (!line?.origin) return [];
  const directionLength = Math.hypot(line.dx || 0, line.dy || 0);
  if (directionLength === 0) return [];
  const ux = line.dx / directionLength, uy = line.dy / directionLength;
  const vx = -uy, vy = ux;
  const maxAlong = 10 * directionLength;
  const extentX = Math.ceil(Math.abs(ux) * (maxAlong + 0.5) + Math.abs(vx) * 1.5);
  const extentY = Math.ceil(Math.abs(uy) * (maxAlong + 0.5) + Math.abs(vy) * 1.5);
  const lanes = new Map();

  /* Rasterize a true 3-wide, 10-step rectangle around the ray. For a diagonal
     ray, include the in-between tile centers so the warning is a solid band. */
  for (let y = line.origin.y - extentY; y <= line.origin.y + extentY; y++) {
    for (let x = line.origin.x - extentX; x <= line.origin.x + extentX; x++) {
      if (x < 0 || x >= MW || y < 0 || y >= MH) continue;
      const rx = x - line.origin.x, ry = y - line.origin.y;
      const along = rx * ux + ry * uy;
      const across = rx * vx + ry * vy;
      if (along < 0.5 || along > maxAlong + 0.5 || Math.abs(across) > 1.5) continue;
      const lane = rx * line.dy - ry * line.dx;
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane).push({ x, y, along });
    }
  }

  const cells = [];
  for (const lane of lanes.values()) {
    lane.sort((a, b) => a.along - b.along);
    for (const cell of lane) {
      if (!breakWalls && [T.WALL, T.BWALL].includes(line.map?.[cell.y]?.[cell.x])) break;
      cells.push({ x: cell.x, y: cell.y });
    }
  }
  return cells;
}

function lineAttackCells(dungeon, line, breakWalls = false) {
  return areaCellsFromLine({ ...line, map: dungeon.map }, breakWalls);
}

function adjacentRingCells(monster, dungeon) {
  const bounds = monsterBounds(monster);
  const cells = [];
  for (let y = bounds.y - 1; y <= bounds.y + bounds.height; y++) {
    for (let x = bounds.x - 1; x <= bounds.x + bounds.width; x++) {
      if (monsterOccupiesCell(monster, x, y)) continue;
      if (x < 0 || x >= MW || y < 0 || y >= MH ||
          [T.WALL, T.BWALL].includes(dungeon.map?.[y]?.[x])) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

export function queueOmegaShinryuAttack(monster, dungeon, attack, line, player, messages) {
  const turnsLeft = attack === "evilEye" ? 1 : 2;
  const cells = attack === "evilEye"
    ? adjacentRingCells(monster, dungeon)
    : lineAttackCells(dungeon, line, attack === "waveCannon");
  if (!cells.length) return false;
  (dungeon.pendingOmegaShinryuAttacks ||= []).push({
    id: uid(), sourceId: monster.id, sourceName: monster.name, sourceAtk: monster.atk,
    sourceX: monster.x, sourceY: monster.y,
    kind: attack, turnsLeft, cells, dx: line?.dx || 0, dy: line?.dy || 0,
  });
  const text = attack === "waveCannon"
    ? `${monster.name}は波動砲の構えをとった！`
    : attack === "tidalWave"
      ? `${monster.name}はタイダルウエイブの構えをとった！`
      : `${monster.name}は悪魔の瞳の構えをとった！`;
  messages.push(text);
  pushSplashAnim(monster.x, monster.y, attack === "tidalWave" ? "#4ccfff" : attack === "evilEye" ? "#b8a0ff" : "#ff8b52");
  return true;
}

const CHARGED_WAVE_KINDS = new Set(["waveCannon", "tidalWave"]);

export function hasPendingOmegaShinryuCharge(monster, dungeon) {
  return !!monster && !!dungeon?.pendingOmegaShinryuAttacks?.some(attack =>
    attack.sourceId === monster.id && CHARGED_WAVE_KINDS.has(attack.kind));
}

function chargeInterruptionMessage(attack, dungeon, source) {
  const label = attack.kind === "waveCannon" ? "波動砲" : "タイダルウエイブ";
  if (!source || source.hp <= 0 || !dungeon.monsters?.includes(source)) {
    return `${attack.sourceName}の${label}の構えは、発生源が倒れて中断された！`;
  }
  if (source.x !== attack.sourceX || source.y !== attack.sourceY) {
    return `${attack.sourceName}の${label}の構えは、位置を動かされて崩れた！`;
  }
  const cannotAct = source.sealed || isAttackSealed(source) || source.blind || source.bewitched ||
    (source.confusedTurns || 0) > 0 || (source.sleepTurns || 0) > 0 || !!source.paralyzed ||
    (source.paralyzeTurns || 0) > 0 || (source.frozenTurns || 0) > 0 ||
    (source.petrifiedTurns || 0) > 0 || (source.knockdownTurns || 0) > 0 ||
    (source.pacifistTurns || 0) > 0 || (source.potConfinedTurns || 0) > 0 ||
    combatDeps.inMagicSealRoom?.(source.x, source.y, dungeon);
  if (cannotAct) return `${attack.sourceName}の${label}の構えは妨害され、中断された！`;
  return null;
}

function sourceForAttack(dungeon, attack) {
  return dungeon.monsters?.find(monster => monster.id === attack.sourceId) || {
    id: attack.sourceId, name: attack.sourceName, atk: attack.sourceAtk, hp: 0,
  };
}

function targetHitCounts(dungeon, cells, source) {
  const counts = new Map();
  for (const cell of cells || []) {
    const target = dungeon.monsters?.find(monster => monster !== source && monster.hp > 0 &&
      !monster.disguisedAsItem && monsterOccupiesCell(monster, cell.x, cell.y));
    if (target) counts.set(target, (counts.get(target) || 0) + 1);
  }
  return counts;
}

function applyFixedWaveDamage(source, target, amount, dungeon, player, messages, label) {
  if (target.hp <= 0 || !dungeon.monsters?.includes(target)) return;
  if (consumeBarrier(target, messages)) return;
  target.hp -= amount;
  messages.push(`${label}が${target.name}に命中！${amount}ダメージ！`);
  if (target.hp <= 0) killMonster(target, dungeon, player, messages, combatDeps.luFn || null, false, source);
}

function destroyBossAreaCircles(dungeon, attack, messages) {
  const affectedCells = new Set((attack.cells || []).map(cell => `${cell.x},${cell.y}`));
  const circles = (dungeon.pentacles || []).filter(circle => affectedCells.has(`${circle.x},${circle.y}`));
  if (circles.length > 0) {
    dungeon.pentacles = dungeon.pentacles.filter(circle => !circles.includes(circle));
    for (const circle of circles) messages.push(`${attack.sourceName}の${attack.kind === "waveCannon" ? "波動砲" : "タイダルウエイブ"}で${circle.name || "魔法陣"}が壊れた！`);
  }
}

function destroyWaveWalls(dungeon, attack, messages) {
  let brokenWalls = 0;
  for (const cell of attack.cells || []) {
    const tile = dungeon.map?.[cell.y]?.[cell.x];
    if (![T.WALL, T.BWALL].includes(tile) || cell.x <= 0 || cell.x >= MW - 1 ||
        cell.y <= 0 || cell.y >= MH - 1) continue;
    const embeddedItem = dungeon.items?.find(item => item.x === cell.x && item.y === cell.y && item.wallEmbedded);
    if (embeddedItem) {
      delete embeddedItem.wallEmbedded;
      embeddedItem.discovered = true;
    }
    dungeon.map[cell.y][cell.x] = T.FLOOR;
    if (dungeon.explored?.[cell.y]?.[cell.x] !== undefined) dungeon.explored[cell.y][cell.x] = true;
    if (dungeon.visible?.[cell.y]?.[cell.x] !== undefined) dungeon.visible[cell.y][cell.x] = true;
    wallBreakDrop(dungeon, cell.x, cell.y);
    brokenWalls++;
  }
  if (brokenWalls > 0) messages.push(`${attack.sourceName}の波動砲が壁を${brokenWalls}マス破壊した！`);
}

function applyOmegaWave(attack, dungeon, player, messages, source) {
  messages.push(`${attack.sourceName}の波動砲が発射された！`);
  destroyWaveWalls(dungeon, attack, messages);
  destroyBossAreaCircles(dungeon, attack, messages);
  pushSplashAnim(attack.cells?.[0]?.x ?? 0, attack.cells?.[0]?.y ?? 0, "#ff7044");
  const cells = new Set((attack.cells || []).map(cell => `${cell.x},${cell.y}`));
  if (player.hp > 0 && cells.has(`${player.x},${player.y}`)) {
    if (!consumeBarrier(player, messages)) {
      player.deathCause = `${attack.sourceName}の波動砲で`;
      player.hp -= 100;
      messages.push(`波動砲が直撃！${playerHpEffectLabel(player, 100)}！`);
      combatDeps.interruptPlayerSleep?.(player, messages);
      combatDeps.weakenOrClearParalysis?.(player, messages);
    }
  }
  const targets = targetHitCounts(dungeon, attack.cells, source);
  for (const [target, hitCount] of targets) {
    for (let hit = 0; hit < hitCount && target.hp > 0 && dungeon.monsters.includes(target); hit++) {
      applyFixedWaveDamage(source, target, 100, dungeon, player, messages, "波動砲");
    }
  }
}

function tidalWavePlayerDamage(attack, dungeon, player, messages, source) {
  if (player.hp <= 0 || consumeBarrier(player, messages)) return;
  const base = calcAtkDefDmg(attack.sourceAtk, calcPlayerDefense(player), { defWeight: 1.5 });
  const damage = reduceWaterDamage(Math.max(1, base * 2), player);
  player.deathCause = `${attack.sourceName}のタイダルウエイブで`;
  player.hp -= damage;
  messages.push(`タイダルウエイブが直撃！水属性の${damage}ダメージ！${waterResistDamageLabel(player)}`);
  combatDeps.interruptPlayerSleep?.(player, messages);
  combatDeps.weakenOrClearParalysis?.(player, messages);
  pushEntity(dungeon, player.x, player.y, -attack.dx, -attack.dy, 3,
    messages, "player", player, player, combatDeps.luFn || null, 0, source);
}

function applyTidalWave(attack, dungeon, player, messages, source) {
  messages.push(`${attack.sourceName}のタイダルウエイブが押し寄せた！`);
  destroyBossAreaCircles(dungeon, attack, messages);
  for (const cell of attack.cells || []) pushAnim({ type: "petroBreath", x: cell.x, y: cell.y, color: "#54d9ff" });
  const cells = new Set((attack.cells || []).map(cell => `${cell.x},${cell.y}`));
  for (const item of [...(dungeon.items || [])]) {
    if (item.wallEmbedded || !cells.has(`${item.x},${item.y}`)) continue;
    blankScrollOrSpellbook(item, messages);
  }
  if (player.hp > 0 && cells.has(`${player.x},${player.y}`)) tidalWavePlayerDamage(attack, dungeon, player, messages, source);

  const targets = targetHitCounts(dungeon, attack.cells, source);
  for (const [target, hitCount] of targets) {
    let hit = false;
    for (let count = 0; count < hitCount && target.hp > 0 && dungeon.monsters.includes(target); count++) {
      if (consumeBarrier(target, messages)) continue;
      resolveParalysisHit(target, messages);
      const base = calcAtkDefDmg(attack.sourceAtk, target.def || 0, { defWeight: 1 });
      const damage = Math.max(1, base * 2);
      target.hp -= damage;
      hit = true;
      messages.push(`タイダルウエイブが${target.name}に命中！水属性の${damage}ダメージ！`);
      if (target.hp <= 0) killMonster(target, dungeon, player, messages, combatDeps.luFn || null, false, source);
    }
    if (hit && target.hp > 0 && dungeon.monsters.includes(target)) {
      pushEntity(dungeon, target.x, target.y, -attack.dx, -attack.dy, 3,
        messages, "monster", target, player, combatDeps.luFn || null, 0, source);
      if (target.hp <= 0) killMonster(target, dungeon, player, messages, combatDeps.luFn || null, false, source);
    }
  }
}

function applyEvilEye(attack, dungeon, player, messages, source) {
  messages.push(`${attack.sourceName}の悪魔の瞳が輝いた！`);
  for (const cell of attack.cells || []) pushAnim({ type: "petroBreath", x: cell.x, y: cell.y, color: "#ad9bff" });
  const affected = new Set((attack.cells || []).map(cell => `${cell.x},${cell.y}`));
  if (player.hp > 0 && affected.has(`${player.x},${player.y}`)) {
    const sanctuary = !combatDeps.inMagicSealRoom?.(player.x, player.y, dungeon) &&
      dungeon.pentacles?.some(pentacle => pentacle.kind === "sanctuary" && pentacle.blessed &&
        pentacle.x === player.x && pentacle.y === player.y);
    if (sanctuary) {
      messages.push(`祝福された聖域の加護が${attack.sourceName}の石化を防いだ！`);
    } else if (!isStatusImmune(player, messages, "自分")) {
      resolveParalysisHit(player, messages);
      player.petrifiedTurns = 4;
      messages.push("悪魔の瞳に見つめられ、石化した！(4ターン)");
    }
  }
  for (const target of [...(dungeon.monsters || [])]) {
    if (target === source || target.hp <= 0 || !dungeon.monsters.includes(target) || target.disguisedAsItem) continue;
    if (!monsterBodyCells(target).some(cell => affected.has(`${cell.x},${cell.y}`))) continue;
    if (blockLargeMonsterStatus(target, "petrify", messages)) continue;
    resolveParalysisHit(target, messages);
    target.petrifiedTurns = 4;
    startLargeMonsterStatusCooldown(target, "petrify");
    messages.push(`${target.name}は石化してしまった！(4ターン)`);
  }
}

export function advanceOmegaShinryuAttacks(dungeon, player, messages, luFn = null, worldTicks = 1) {
  if (!dungeon || worldTicks <= 0 || (dungeon.timeStopTurns || 0) > 0) return;
  combatDeps.luFn = luFn;
  for (const attack of [...(dungeon.pendingOmegaShinryuAttacks || [])]) {
    if (player.hp <= 0) break;
    if (CHARGED_WAVE_KINDS.has(attack.kind)) {
      const source = dungeon.monsters?.find(monster => monster.id === attack.sourceId);
      const canceled = chargeInterruptionMessage(attack, dungeon, source);
      if (canceled) {
        dungeon.pendingOmegaShinryuAttacks = dungeon.pendingOmegaShinryuAttacks.filter(pending => pending !== attack);
        messages.push(canceled);
        continue;
      }
    }
    attack.turnsLeft -= worldTicks;
    if (attack.turnsLeft > 0) continue;
    dungeon.pendingOmegaShinryuAttacks = dungeon.pendingOmegaShinryuAttacks.filter(pending => pending !== attack);
    const source = sourceForAttack(dungeon, attack);
    if (attack.kind === "waveCannon") applyOmegaWave(attack, dungeon, player, messages, source);
    else if (attack.kind === "tidalWave") applyTidalWave(attack, dungeon, player, messages, source);
    else if (attack.kind === "evilEye") applyEvilEye(attack, dungeon, player, messages, source);
  }
}

export function omegaShinryuAttackAt(dungeon, x, y) {
  return dungeon?.pendingOmegaShinryuAttacks?.filter(attack =>
    attack.cells?.some(cell => cell.x === x && cell.y === y)) || [];
}

export function drawOmegaShinryuWarnings(ctx, dungeon, sx, sy, tileSize) {
  if (!dungeon?.pendingOmegaShinryuAttacks?.length) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.max(9, Math.round(tileSize * 0.45))}px sans-serif`;
  for (const attack of dungeon.pendingOmegaShinryuAttacks) {
    const color = attack.kind === "tidalWave" ? "#54d9ff" : attack.kind === "evilEye" ? "#ad9bff" : "#ff7044";
    for (const cell of attack.cells || []) {
      if (!dungeon.visible?.[cell.y]?.[cell.x]) continue;
      const px = (cell.x - sx) * tileSize, py = (cell.y - sy) * tileSize;
      ctx.fillStyle = attack.turnsLeft <= 1 ? `${color}88` : `${color}55`;
      ctx.fillRect(px, py, tileSize, tileSize);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, tileSize * 0.06);
      ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#201830";
      ctx.lineWidth = Math.max(2, tileSize * 0.08);
      ctx.strokeText(String(Math.max(1, attack.turnsLeft)), px + tileSize / 2, py + tileSize / 2);
      ctx.fillText(String(Math.max(1, attack.turnsLeft)), px + tileSize / 2, py + tileSize / 2);
    }
  }
  ctx.restore();
}

export function castShinryuMightyGuard(monster, dungeon, player, messages, luFn = null) {
  if (combatDeps.inMagicSealRoom?.(monster.x, monster.y, dungeon)) {
    messages.push(`${monster.name}のマイティガードは魔封じの魔法陣で不発になった！`);
    return false;
  }
  monster.mightyGuardTurns = 10;
  messages.push(`${monster.name}がマイティガードを唱えた！10ターンの間、受けるダメージがすべて半減する！`);
  pushSplashAnim(monster.x, monster.y, "#b9f4ff");
  return true;
}

export function castShinryuLightning(monster, dungeon, player, room, messages, luFn = null) {
  messages.push(`${monster.name}が稲妻を呼び寄せた！`);
  const inRoom = (x, y) => !!room && combatDeps.findRoom?.(dungeon.rooms, x, y) === room;
  if (player.hp > 0) {
    if (hasPlayerMagicReflect(player)) {
      const damage = 50;
      monster.hp -= damage;
      messages.push(`${playerMagicReflectLabel(player)}が稲妻を神竜へ跳ね返した！${damage}ダメージ！`);
      if (monster.hp <= 0) killMonster(monster, dungeon, player, messages, luFn, false, player);
    } else if (!consumeBarrier(player, messages)) {
      const damage = reduceLightningDamage(50, player);
      player.deathCause = `${monster.name}の稲妻で`;
      player.hp -= damage;
      messages.push(`稲妻が落ちた！${playerHpEffectLabel(player, damage)}！${lightningResistDamageLabel(player)}`);
      combatDeps.interruptPlayerSleep?.(player, messages);
      combatDeps.weakenOrClearParalysis?.(player, messages);
      if (!hasLightningResist(player)) applyLightningToInventory(player, dungeon, messages, luFn, null, false,
        { killerMon: monster, sourceIsPlayer: false });
      pushLightningAnim(player.x, player.y);
    }
  }
  for (const target of [...(dungeon.monsters || [])]) {
    if (target === monster || target.hp <= 0 || !dungeon.monsters.includes(target) || !inRoom(target.x, target.y)) continue;
    if (consumeBarrier(target, messages)) continue;
    const weakness = monHasElementWeakness(target, "thunder") ? 1.5 : 1;
    const resistance = monElementDamageMultiplier(target, "thunder");
    const damage = Math.max(1, Math.floor(50 * weakness * resistance));
    target.hp -= damage;
    messages.push(`稲妻が${target.name}にも落ちた！${damage}ダメージ！${weakness > 1 ? "雷弱点！" : ""}${resistance < 1 ? "雷半減！" : ""}`);
    pushLightningAnim(target.x, target.y);
    if (target.hp <= 0) killMonster(target, dungeon, player, messages, luFn, false, monster);
  }
  return true;
}

export function castOmegaMustardBomb(monster, dungeon, player, messages) {
  (dungeon.pendingBombs ||= []).push({
    x: player.x, y: player.y, turnsLeft: 2,
    sourceName: monster.name, killerMonId: monster.id, suppressCountdownMessage: true,
  });
  messages.push(`${monster.name}はマスタードボムの構えをとった！`);
  return true;
}

export function castOmegaStatusRay(monster, dungeon, player, line, effect, messages, opts = {}) {
  if (!combatDeps.resolveStatusRay) return false;
  const status = effect === "blaster" ? "blaster" : "rainbowWind";
  return combatDeps.resolveStatusRay(monster, dungeon, player, line, status, messages, opts);
}

export function castOmegaAtomicRay(monster, dungeon, player, line, messages, opts = {}) {
  return combatDeps.castFireBreath?.(monster, dungeon, player, line, messages, opts) ?? false;
}

export function castShinryuAtomicRay(monster, dungeon, player, line, messages, opts = {}) {
  return combatDeps.castFireBreath?.(monster, dungeon, player, line, messages, opts) ?? false;
}

/** Normal attacks cover the complete one-tile ring around the 3x3 footprint. */
export function attackOmegaShinryuAdjacentCells(monster, dungeon, player, messages, opts = {}) {
  const cells = adjacentRingCells(monster, dungeon);
  for (const cell of cells) {
    if (!combatDeps.monsterCanInteractAtRange?.(monster, dungeon, cell.x, cell.y, 1)) continue;
    if (opts.canHitPlayer !== false && player.hp > 0 && player.x === cell.x && player.y === cell.y) {
      combatDeps.monsterAttackPlayer?.(monster, dungeon, player, messages,
        damage => `${monster.name}の攻撃！${damage}ダメージ！`, {
          onPlayerHit: opts.onPlayerHit,
          onPlayerMiss: opts.onPlayerMiss,
          luFn: opts.luFn,
        });
      continue;
    }
    const target = dungeon.monsters?.find(other => other !== monster && other.hp > 0 &&
      !other.disguisedAsItem && monsterOccupiesCell(other, cell.x, cell.y));
    if (!target) continue;
    if (checkMonsterEvasion(target, { baseMissRate: 0.10 })) {
      messages.push(`${monster.name}の${target.name}への攻撃は外れた！`);
      continue;
    }
    if (consumeBarrier(target, messages)) continue;
    resolveParalysisHit(target, messages);
    const damage = Math.max(1, calcAtkDefDmg(monster.atk || 1, target.def || 0, { defWeight: 1 }) + rng(-1, 1));
    target.hp -= damage;
    messages.push(`${monster.name}が${target.name}を攻撃！${damage}ダメージ！`);
    if (target.hp <= 0 && dungeon.monsters.includes(target)) {
      killMonster(target, dungeon, player, messages, opts.luFn || null, false, monster);
    }
  }
}
