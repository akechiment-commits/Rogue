import { inMagicSealRoom, hasRingEffect, killMonster } from './items.js';
import { isStatusImmune } from './statusImmunity.js';
import { plName } from './playerLabel.js';
import {
  MW, MH, uid, T, calcAtkDefDmg, calcPlayerDefense, setPlayerHpForFixedEffect,
  checkPlayerPhysicalAttackEvasion, checkMonsterEvasion, consumeBarrier
} from './utils.js';
import {
  canPlaceMonsterBody,
  monsterBodyCells,
  monsterBodySize,
  monsterDistance,
  monsterOccupiesCell,
} from './monsterGeometry.js';
import { pushPlayerKnockbackAnim, pushAnim } from './animEvents.js';
import { statusTurns, applyMonsterParalyze, applyPlayerParalyze, resolveParalysisHit } from './statusDuration.js';

const inBounds = (x, y) => x >= 0 && x < MW && y >= 0 && y < MH;
function isWalkable(map, x, y, dg = null) {
  if (!inBounds(x, y) || map[y]?.[x] === T.WALL || map[y]?.[x] === T.BWALL) return false;
  if (dg?.statues?.some(s => s.x === x && s.y === y)) return false;
  return true;
}

/**
 * オープレンティが特技を使用可能か（状態異常中でないか）
 */
export function canUseOhplentySpecial(monster) {
  return !monster.sealed &&
    !(monster.attackSealTurns > 0) &&
    !monster.blind &&
    !(monster.confusedTurns > 0) &&
    !monster.bewitched &&
    (monster.sleepTurns || 0) <= 0 &&
    !monster.paralyzed &&
    (monster.paralyzeTurns || 0) <= 0 &&
    (monster.petrifiedTurns || 0) <= 0 &&
    (monster.frozenTurns || 0) <= 0 &&
    (monster.knockdownTurns || 0) <= 0;
}

/**
 * プレイヤーが遠距離直線上にいるか判定（距離2〜10マス）。
 * 壁や途中の生物も特技の対象判定に含める。
 */
export function isFarLineToPlayer(monster, dungeon, player) {
  const dx = player.x - monster.x;
  const dy = player.y - monster.y;
  const isLine = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  return isLine && dist >= 2 && dist <= 10;
}

function getPullLandingPosition(monster, target, dg, player, dx, dy) {
  const isPlayer = target === player;
  const targetSize = isPlayer ? 1 : monsterBodySize(target);
  const range = isPlayer ? 1 : targetSize + 1;
  const candidates = [];

  for (let oy = -range; oy <= range; oy++) {
    for (let ox = -range; ox <= range; ox++) {
      if (ox === 0 && oy === 0) continue;
      const x = monster.x + ox;
      const y = monster.y + oy;
      if (isPlayer) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== 1) continue;
      } else if (monsterDistance(monster, { ...target, x, y }) !== 1) {
        continue;
      }

      const body = isPlayer ? [{ x, y }] : monsterBodyCells(target, x, y);
      if (body.some(cell => !isWalkable(dg.map, cell.x, cell.y, dg))) continue;
      if (isPlayer) {
        if ((dg.monsters || []).some(other => other !== monster && other.hp > 0 && monsterOccupiesCell(other, x, y))) continue;
      } else if (!canPlaceMonsterBody(dg, target, x, y, player)) {
        continue;
      }

      const projection = ox * dx + oy * dy;
      const crossTrack = Math.abs(ox * dy - oy * dx);
      candidates.push({ x, y, projection, crossTrack, distance: Math.max(Math.abs(ox), Math.abs(oy)) });
    }
  }

  candidates.sort((a, b) =>
    b.projection - a.projection ||
    a.crossTrack - b.crossTrack ||
    a.distance - b.distance ||
    a.y - b.y ||
    a.x - b.x,
  );
  return candidates[0] || null;
}

/**
 * 特技1: 引き寄せの魔法
 * 遠距離直線上の最初の生物を隣接マスへ引き寄せる。壁に当たった場合は
 * オープレンティ自身が壁の手前まで飛びつく。
 */
export function ohplentyPullPlayer(m, dg, pl, ml) {
  m.turnAttacks = m.maxAttacks || 1;
  if (inMagicSealRoom(m.x, m.y, dg)) {
    ml.push(`${m.name}は引き寄せの魔法を唱えようとしたが、魔封じの魔方陣で封じられた！`);
    return;
  }
  const sgnX = Math.sign(pl.x - m.x);
  const sgnY = Math.sign(pl.y - m.y);
  const dist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
  let target = pl;
  let lastX = m.x;
  let lastY = m.y;

  for (let step = 1; step < dist; step++) {
    const x = m.x + sgnX * step;
    const y = m.y + sgnY * step;
    if (dg.map[y]?.[x] === T.WALL || dg.map[y]?.[x] === T.BWALL) {
      if (lastX === m.x && lastY === m.y) {
        ml.push(`${m.name}は壁に阻まれて飛びつけなかった！`);
        return;
      }
      m.dir = { x: sgnX, y: sgnY };
      m.x = lastX;
      m.y = lastY;
      m.posHistory = [];
      m._idleStuck = 0;
      m._movedThisTurn = true;
      ml.push(`${m.name}は壁の手前まで飛びついた！`);
      return;
    }
    const blocker = (dg.monsters || []).find(other =>
      other !== m && other.hp > 0 && monsterOccupiesCell(other, x, y),
    );
    if (blocker) {
      target = blocker;
      break;
    }
    if (!isWalkable(dg.map, x, y, dg)) {
      ml.push(`${m.name}は引き寄せの魔法を唱えたが、障害物に阻まれた！`);
      return;
    }
    lastX = x;
    lastY = y;
  }

  if (!target || target.hp <= 0) {
    ml.push(`${m.name}は引き寄せの魔法を唱えたが、対象がいなかった！`);
    return;
  }

  if (inMagicSealRoom(target.x, target.y, dg)) {
    ml.push(`魔封じの魔方陣が${target === pl ? plName(pl) : target.name}への引き寄せを防いだ！`);
    return;
  }
  if (target === pl) {
    const plOnBlessedSanc = !!dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
    if (plOnBlessedSanc) {
      ml.push(`祝福された聖域の加護が${m.name}の引き寄せの魔法を防いだ！`);
      return;
    }
    if (hasRingEffect(pl, "core_ring")) {
      ml.push(`${m.name}の引き寄せの魔法を受けそうになったが、体幹の指輪で踏ん張った！`);
      return;
    }
  } else if (target.forcedMoveImmune || target.stationary) {
    ml.push(`${target.name}は${m.name}の引き寄せに耐えた！`);
    return;
  }

  const landing = getPullLandingPosition(m, target, dg, pl, sgnX, sgnY);
  if (!landing) {
    ml.push(`${m.name}は引き寄せの魔法を唱えたが、引き寄せる場所がなかった！`);
    return;
  }

  if (target === pl) {
    const fromX = pl.x;
    const fromY = pl.y;
    pl.x = landing.x;
    pl.y = landing.y;
    pushPlayerKnockbackAnim(fromX, fromY, pl.x, pl.y, -sgnX, -sgnY);
    ml.push(`${m.name}は引き寄せの魔法を唱えた！`);
    ml.push(`${plName(pl)}は${m.name}の目の前に引き寄せられた！`);

    if ((pl.sleepTurns || 0) > 0) {
      pl.sleepTurns = 0;
      ml.push("引き寄せられて目が覚めた！");
    }
    resolveParalysisHit(pl, ml);
    return;
  }

  const fromX = target.x;
  const fromY = target.y;
  target.x = landing.x;
  target.y = landing.y;
  target.dir = { x: Math.sign(landing.x - fromX), y: Math.sign(landing.y - fromY) };
  target.aware = true;
  target.lastPx = pl.x;
  target.lastPy = pl.y;
  target.posHistory = [];
  target._idleStuck = 0;
  target.patrolTarget = null;
  ml.push(`${m.name}の引き寄せの魔法が${target.name}に命中した！`);
  ml.push(`${target.name}は${m.name}の目の前に引き寄せられた！`);
}

/**
 * カスワックの予兆セル（周囲1マス）を取得
 */
export function getCaswackCells(monster, map) {
  const cells = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = monster.x + dx;
      const y = monster.y + dy;
      if (!inBounds(x, y)) continue;
      if (map[y]?.[x] === T.WALL || map[y]?.[x] === T.BWALL) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * 特技2: カスワック（予兆セット）
 * 周囲1マスに予兆を出し、次ターンに発動
 */
export function castCaswack(monster, dungeon, player, messages) {
  if (dungeon.pendingCaswacks?.some(c => c.sourceId === monster.id)) return false;
  monster.turnAttacks = monster.maxAttacks || 1;
  if (inMagicSealRoom(monster.x, monster.y, dungeon)) {
    messages?.push(`${monster.name}のカスワックは魔封じの魔方陣に封じられた！`);
    return false;
  }

  const cells = getCaswackCells(monster, dungeon.map);
  monster._isCaswackCasting = true;

  (dungeon.pendingCaswacks ||= []).push({
    id: uid(),
    sourceId: monster.id,
    sourceName: monster.name,
    originX: monster.x,
    originY: monster.y,
    turnsLeft: 1,
    cells,
  });

  messages?.push(`${monster.name}はカスワックを唱え始めた！周囲に不吉な魔力の予兆が現れた！`);
  return true;
}

/**
 * 敵移動後・敵攻撃前のフロア時計でカスワックを進め、発動または中断を解決
 */
export function advanceCaswacks(dungeon, player, messages, lu, worldTicks = 1) {
  if (worldTicks <= 0 || (dungeon.timeStopTurns || 0) > 0) return;

  for (const caswack of [...(dungeon.pendingCaswacks || [])]) {
    if (player.hp <= 0) break;
    caswack.turnsLeft -= worldTicks;
    if (caswack.turnsLeft > 0) continue;

    dungeon.pendingCaswacks = dungeon.pendingCaswacks.filter(pending => pending !== caswack);

    const source = dungeon.monsters?.find(m => m.id === caswack.sourceId);
    if (source) {
      delete source._isCaswackCasting;
    }

    // 中断判定（撃破・封印・行動不能・強制移動）
    const isInterrupted = !source || source.hp <= 0 ||
      source.sealed ||
      (source.sleepTurns || 0) > 0 ||
      source.paralyzed ||
      (source.paralyzeTurns || 0) > 0 ||
      (source.petrifiedTurns || 0) > 0 ||
      (source.frozenTurns || 0) > 0 ||
      (source.knockdownTurns || 0) > 0 ||
      (source.attackSealTurns || 0) > 0 ||
      source.blind ||
      (source.confusedTurns || 0) > 0 ||
      source.bewitched ||
      inMagicSealRoom(source.x, source.y, dungeon) ||
      source.x !== caswack.originX ||
      source.y !== caswack.originY;

    if (isInterrupted) {
      messages?.push(`${caswack.sourceName}の呪文が途切れた！カスワックは不発に終わった！`);
      continue;
    }

    messages?.push(`${caswack.sourceName}のカスワックが炸裂した！`);

    // エフェクト発火
    for (const cell of caswack.cells) {
      pushAnim({ type: "caswack", x: cell.x, y: cell.y, color: "#9900cc" });
    }

    // プレイヤーへの効果判定
    const playerHit = caswack.cells.some(c => c.x === player.x && c.y === player.y);
    if (playerHit && player.hp > 0) {
      const plOnBlessedSanc = !inMagicSealRoom(player.x, player.y, dungeon) &&
        !!dungeon.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === player.x && pc.y === player.y);
      if (inMagicSealRoom(player.x, player.y, dungeon) || inMagicSealRoom(caswack.originX, caswack.originY, dungeon)) {
        messages?.push(`魔封じの魔方陣がカスワックの呪いを封じた！`);
      } else if (plOnBlessedSanc) {
        messages?.push(`祝福された聖域の加護がカスワックの呪いを防いだ！`);
      } else if (isStatusImmune(player, messages, "自分")) {
        // statusImmune で防がれた旨は isStatusImmune 内部で出力される
      } else {
        if ((player.caswackTurns || 0) > 0) {
          // すでにカスワック状態なら即死！
          player.deathCause = `${caswack.sourceName}のカスワックで`;
          player.caswackTurns = 0;
          setPlayerHpForFixedEffect(player, 0);
          messages?.push(`カスワックの呪いが重なり、即死した！`);
        } else {
          // カスワック状態（50ターン）を付与
          resolveParalysisHit(player, messages);
          player.caswackTurns = 50;
          messages?.push(`不吉な死の呪気を受けた！カスワック状態になった！（50ターンの間に再び受けると即死する！）`);
        }
      }
    }

    // 他モンスターへの効果判定
    for (const mon of [...(dungeon.monsters || [])]) {
      if (mon === source || mon.hp <= 0 || mon.disguisedAsItem) continue;
      const hitCells = caswack.cells.filter(cell => monsterOccupiesCell(mon, cell.x, cell.y));
      if (hitCells.length === 0) continue;
      if (hitCells.every(cell => inMagicSealRoom(cell.x, cell.y, dungeon))) {
        messages?.push(`魔封じの魔方陣が${mon.name}へのカスワックを防いだ！`);
        continue;
      }
      if (isStatusImmune(mon, messages, mon.name)) continue;
      const turns = statusTurns("caswack", { kind: "monster", target: mon });
      if ((mon.caswackTurns || 0) > 0) {
        mon.caswackTurns = 0;
        messages?.push(`${mon.name}はカスワックの呪いが重なり、即死した！`);
        killMonster(mon, dungeon, player, messages, lu, false, source);
      } else {
        resolveParalysisHit(mon, messages);
        mon.caswackTurns = turns;
        messages?.push(`${mon.name}はカスワック状態になった！（残り${turns}ターン）`);
      }
    }
  }
}

/**
 * 予兆マスの描画（周囲1マス）
 */
export function drawCaswackWarnings(ctx, dungeon, sx, sy, tileSize) {
  if (!dungeon.pendingCaswacks?.length) return;
  const p = (Math.sin(performance.now() / 250) + 1) / 2; // 脈動
  ctx.save();
  for (const c of dungeon.pendingCaswacks) {
    for (const cell of c.cells) {
      if (dungeon.visible && !dungeon.visible[cell.y]?.[cell.x]) continue;
      const px = (cell.x - sx) * tileSize;
      const py = (cell.y - sy) * tileSize;

      // 禍々しい濃紫・黒紫の床グラデーション
      ctx.fillStyle = `rgba(130, 0, 180, ${0.30 + p * 0.20})`;
      ctx.fillRect(px, py, tileSize, tileSize);

      ctx.strokeStyle = `rgba(220, 60, 255, ${0.60 + p * 0.35})`;
      ctx.lineWidth = Math.max(1.5, tileSize * 0.08);
      ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);

      // 残りターン数「1」
      const fs = Math.max(9, Math.round(tileSize * 0.45));
      ctx.font = `bold ${fs}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#9900cc";
      ctx.shadowBlur = 4;
      ctx.fillText(String(c.turnsLeft), px + tileSize / 2, py + tileSize / 2);
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
}

/**
 * 特技3: デストラップ
 * 周囲1マスに無差別攻撃 + 金縛り付与
 */
export function ohplentyDeathTrap(m, dg, pl, ml, opts = {}, onPlayerHit = null, onPlayerMiss = null, luFn = null) {
  const onHit = onPlayerHit || opts.onPlayerHit;
  const onMiss = onPlayerMiss || opts.onPlayerMiss;
  const lu = luFn || opts.luFn || null;

  m.turnAttacks = m.maxAttacks || 1;
  ml.push(`${m.name}のデストラップ！周囲に死の罠が炸裂した！`);
  pushAnim({ type: "deathTrap", x: m.x, y: m.y, color: "#d04070" });

  const cells = getCaswackCells(m, dg.map);

  // プレイヤーへの判定
  const playerHit = cells.some(c => c.x === pl.x && c.y === pl.y);
  if (playerHit && pl.hp > 0) {
    const plOnSanc = !inMagicSealRoom(pl.x, pl.y, dg) &&
      !!dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y);
    if (plOnSanc) {
      ml.push(`聖域の加護が${m.name}のデストラップを防いだ！`);
    } else if (checkPlayerPhysicalAttackEvasion(m, pl, ml, { attackName: "デストラップ", onMiss })) {
      // 回避成功：ダメージ・金縛りなし
    } else {
      const pdef = calcPlayerDefense(pl);
      const dmg = Math.max(1, calcAtkDefDmg(m.atk, pdef, { defWeight: 1.5 }));
      pl.deathCause = `${m.name}のデストラップで`;
      pl.hp -= dmg;
      onHit?.(dmg, m);
      resolveParalysisHit(pl, ml);
      ml.push(`${m.name}のトラップが${plName(pl)}を襲う！${dmg}ダメージ！`);

      if (pl.hp > 0) {
        if (inMagicSealRoom(pl.x, pl.y, dg) || inMagicSealRoom(m.x, m.y, dg)) {
          ml.push("魔封じの魔方陣が金縛りを防いだ！");
        } else if (!isStatusImmune(pl, ml, "自分")) {
          const pTurns = statusTurns("paralyze", { kind: "player" });
          applyPlayerParalyze(pl, pTurns, { mode: "max" });
          ml.push(`${plName(pl)}は金縛りで動けなくなった！(${pTurns}ターン)`);
        }
      }
    }
  }

  // 他モンスターへの判定
  for (const other of [...(dg.monsters || [])]) {
    if (other === m || other.hp <= 0 || other.disguisedAsItem) continue;
    const hit = cells.some(c => monsterOccupiesCell(other, c.x, c.y));
    if (hit) {
      if (consumeBarrier(other, ml)) continue;
      if (checkMonsterEvasion(other, { baseMissRate: 0.05 })) {
        ml.push(other.baseKind === "boss_mireu" ? `${other.name}は攻撃をかわした！` : `${other.name}への攻撃は外れた！`);
        continue;
      }
      const dmg = Math.max(1, calcAtkDefDmg(m.atk, other.def || 0, { defWeight: 1.0 }));
      other.hp -= dmg;
      resolveParalysisHit(other, ml);
      ml.push(`${m.name}のトラップが${other.name}に直撃！${dmg}ダメージ！`);
      if (other.hp <= 0) {
        killMonster(other, dg, pl, ml, lu, false, m);
      } else {
        applyMonsterParalyze(other, { ml, name: other.name });
      }
    }
  }
}
