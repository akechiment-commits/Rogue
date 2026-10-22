import { hasLOS } from './monsters.js';
import { inMagicSealRoom, hasRingEffect, killMonster } from './items.js';
import { isStatusImmune } from './statusImmunity.js';
import { plName } from './playerLabel.js';
import { MW, MH, uid, T, calcAtkDefDmg, calcPlayerDefense, setPlayerHpForFixedEffect } from './utils.js';
import { monsterOccupiesCell } from './monsterGeometry.js';
import { pushPlayerKnockbackAnim, pushAnim } from './animEvents.js';
import { statusTurns, applyMonsterParalyze } from './statusDuration.js';

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
 * プレイヤーが遠距離直線上にいるか判定（距離2〜10マス、障害物なしLOSあり）
 */
export function isFarLineToPlayer(monster, dungeon, player) {
  const dx = player.x - monster.x;
  const dy = player.y - monster.y;
  const isLine = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (!isLine || dist < 2 || dist > 10) return false;
  return hasLOS(dungeon.map, monster.x, monster.y, player.x, player.y);
}

/**
 * 特技1: 引き寄せの魔法
 * 遠距離直線上のプレイヤーをオープレンティの目の前（隣接マス）に引き寄せる
 */
export function ohplentyPullPlayer(m, dg, pl, ml) {
  m.turnAttacks = m.maxAttacks || 1;
  if (inMagicSealRoom(m.x, m.y, dg) || inMagicSealRoom(pl.x, pl.y, dg)) {
    ml.push(`${m.name}は引き寄せの魔法を唱えようとしたが、魔封じの魔方陣で封じられた！`);
    return;
  }
  const plOnBlessedSanc = !inMagicSealRoom(pl.x, pl.y, dg) &&
    !!dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
  if (plOnBlessedSanc) {
    ml.push(`祝福された聖域の加護が${m.name}の引き寄せの魔法を防いだ！`);
    return;
  }
  if (hasRingEffect(pl, "core_ring")) {
    ml.push(`${m.name}の引き寄せの魔法を受けそうになったが、体幹の指輪で踏ん張った！`);
    return;
  }

  // 直線に沿ってオープレンティの隣接マス（手前）を求める
  const sgnX = Math.sign(pl.x - m.x);
  const sgnY = Math.sign(pl.y - m.y);
  const targetX = m.x + sgnX;
  const targetY = m.y + sgnY;

  // 途中に障害物がないか確認し、可能な限り引き寄せる
  let destX = pl.x;
  let destY = pl.y;

  let cx = pl.x - sgnX;
  let cy = pl.y - sgnY;
  while (cx !== m.x || cy !== m.y) {
    if (!isWalkable(dg.map, cx, cy, dg) || dg.monsters?.some(o => o !== m && monsterOccupiesCell(o, cx, cy))) {
      break;
    }
    destX = cx;
    destY = cy;
    cx -= sgnX;
    cy -= sgnY;
  }

  if (destX === pl.x && destY === pl.y) {
    ml.push(`${m.name}は引き寄せの魔法を唱えたが、障害物に阻まれた！`);
    return;
  }

  const fromX = pl.x;
  const fromY = pl.y;
  pl.x = destX;
  pl.y = destY;

  pushPlayerKnockbackAnim(fromX, fromY, pl.x, pl.y, -sgnX, -sgnY);
  ml.push(`${m.name}は引き寄せの魔法を唱えた！`);
  ml.push(`${plName(pl)}は${m.name}の目の前に引き寄せられた！`);

  // 睡眠・金縛りの解除
  if ((pl.sleepTurns || 0) > 0) {
    pl.sleepTurns = 0;
    ml.push("引き寄せられて目が覚めた！");
  }
  if ((pl.paralyzeTurns || 0) > 0) {
    pl.paralyzeTurns = 0;
    ml.push("引き寄せられて金縛りが解けた！");
  }
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

  const cells = getCaswackCells(monster, dungeon.map);
  monster._isCaswackCasting = true;
  monster.turnAttacks = monster.maxAttacks || 1;

  (dungeon.pendingCaswacks ||= []).push({
    id: uid(),
    sourceId: monster.id,
    sourceName: monster.name,
    originX: monster.x,
    originY: monster.y,
    source: monster,
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

    const source = dungeon.monsters?.find(m => m.id === caswack.sourceId || m === caswack.source);
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
          player.caswackTurns = 50;
          messages?.push(`不吉な死の呪気を受けた！カスワック状態になった！（50ターンの間に再び受けると即死する！）`);
        }
      }
    }

    // 他モンスターへの効果判定
    for (const mon of [...(dungeon.monsters || [])]) {
      if (mon === source || mon.hp <= 0) continue;
      const monHit = caswack.cells.some(c => monsterOccupiesCell(mon, c.x, c.y));
      if (monHit) {
        if (isStatusImmune(mon, messages, mon.name)) continue;
        const turns = statusTurns("caswack", { kind: "monster", target: mon });
        if ((mon.caswackTurns || 0) > 0) {
          mon.caswackTurns = 0;
          messages?.push(`${mon.name}はカスワックの呪いが重なり、即死した！`);
          killMonster(mon, dungeon, player, messages, lu, false, source);
        } else {
          mon.caswackTurns = turns;
          messages?.push(`${mon.name}はカスワック状態になった！（残り${turns}ターン）`);
        }
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
  m.turnAttacks = m.maxAttacks || 1;
  ml.push(`${m.name}のデストラップ！周囲に死の罠が炸裂した！`);
  pushAnim({ type: "deathTrap", x: m.x, y: m.y, color: "#d04070" });

  const cells = getCaswackCells(m, dg.map);

  // プレイヤーへの判定
  const playerHit = cells.some(c => c.x === pl.x && c.y === pl.y);
  if (playerHit && pl.hp > 0) {
    const pdef = calcPlayerDefense(pl);
    const dmg = Math.max(1, calcAtkDefDmg(m.atk, pdef, { defWeight: 1.5 }));
    pl.deathCause = `${m.name}のデストラップで`;
    pl.hp -= dmg;
    onPlayerHit?.(dmg, m);
    ml.push(`${m.name}のトラップが${plName(pl)}を襲う！${dmg}ダメージ！`);

    if (pl.hp > 0) {
      if (inMagicSealRoom(pl.x, pl.y, dg) || inMagicSealRoom(m.x, m.y, dg)) {
        ml.push("魔封じの魔方陣が金縛りを防いだ！");
      } else if (!isStatusImmune(pl, ml, "自分")) {
        const pTurns = statusTurns("paralyze", { kind: "player" });
        pl.paralyzeTurns = Math.max(pl.paralyzeTurns || 0, pTurns);
        ml.push(`${plName(pl)}は金縛りで動けなくなった！(${pTurns}ターン)`);
      }
    }
  }

  // 他モンスターへの判定
  for (const other of [...(dg.monsters || [])]) {
    if (other === m || other.hp <= 0) continue;
    const hit = cells.some(c => monsterOccupiesCell(other, c.x, c.y));
    if (hit) {
      const dmg = Math.max(1, calcAtkDefDmg(m.atk, other.def || 0, { defWeight: 1.0 }));
      other.hp -= dmg;
      ml.push(`${m.name}のトラップが${other.name}に直撃！${dmg}ダメージ！`);
      if (other.hp <= 0) {
        killMonster(other, dg, pl, ml, luFn, false, m);
      } else {
        applyMonsterParalyze(other, { ml, name: other.name });
      }
    }
  }
}
