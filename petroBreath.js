import { uid } from './utils.js';
import { inMagicSealRoom } from './items.js';
import { monsterOccupiesCell, monsterBounds } from './monsterGeometry.js';
import { isStatusImmune } from './statusImmunity.js';
import { blockLargeMonsterStatus, startLargeMonsterStatusCooldown } from './largeMonsterStatus.js';
import { pushAnim } from './animEvents.js';

export function canCastPetroBreath(monster, dungeon) {
  return !monster.sealed &&
    (monster.sleepTurns || 0) <= 0 &&
    !monster.paralyzed &&
    (monster.paralyzeTurns || 0) <= 0 &&
    (monster.petrifiedTurns || 0) <= 0 &&
    (monster.frozenTurns || 0) <= 0 &&
    (monster.knockdownTurns || 0) <= 0 &&
    !dungeon.pendingPetroBreaths?.some(b => b.sourceId === monster.id);
}

/**
 * プレイヤーの位置に応じてバタリングラムの前方2マス×横幅倍（2マス幅）のブレス範囲を計算する。
 */
export function getPetroBreathCells(monster, player, map) {
  const bounds = monsterBounds(monster);
  const minX = bounds.x;
  const maxX = bounds.x + bounds.width - 1;
  const minY = bounds.y;
  const maxY = bounds.y + bounds.height - 1;

  const cx = bounds.x + (bounds.width - 1) / 2;
  const cy = bounds.y + (bounds.height - 1) / 2;
  const pdx = player.x - cx;
  const pdy = player.y - cy;

  const rawCells = [];

  // 1. 純粋な左右判定（プレイヤーのYがボスの高さ範囲内にある、または水平差が垂直差の1.5倍超）
  if (Math.abs(pdx) > Math.abs(pdy) * 1.5 || (player.y >= minY && player.y <= maxY)) {
    const dx = Math.sign(pdx) || 1;
    const startX = dx > 0 ? maxX + 1 : minX - 1;
    for (let step = 0; step < 2; step++) {
      const bx = startX + dx * step;
      for (let by = minY; by <= maxY; by++) {
        rawCells.push({ x: bx, y: by });
      }
    }
  }
  // 2. 純粋な上下判定（プレイヤーのXがボスの幅範囲内にある、または垂直差が水平差の1.5倍超）
  else if (Math.abs(pdy) > Math.abs(pdx) * 1.5 || (player.x >= minX && player.x <= maxX)) {
    const dy = Math.sign(pdy) || 1;
    const startY = dy > 0 ? maxY + 1 : minY - 1;
    for (let step = 0; step < 2; step++) {
      const by = startY + dy * step;
      for (let bx = minX; bx <= maxX; bx++) {
        rawCells.push({ x: bx, y: by });
      }
    }
  }
  // 3. 斜め判定（プレイヤーのいる角から、前方2マス×幅2マスの扇状に広がる）
  else {
    const dx = Math.sign(pdx) || 1;
    const dy = Math.sign(pdy) || 1;
    const cornerX = dx > 0 ? maxX : minX;
    const cornerY = dy > 0 ? maxY : minY;

    // 1歩目（3マス：斜め直撃と両脇）
    rawCells.push({ x: cornerX + dx, y: cornerY + dy });
    rawCells.push({ x: cornerX + dx, y: cornerY });
    rawCells.push({ x: cornerX, y: cornerY + dy });

    // 2歩目（3マス：2マス斜めと外側）
    rawCells.push({ x: cornerX + 2 * dx, y: cornerY + 2 * dy });
    rawCells.push({ x: cornerX + 2 * dx, y: cornerY + dy });
    rawCells.push({ x: cornerX + dx, y: cornerY + 2 * dy });
  }

  // 重複除去およびマップ範囲内（壁以外）の抽出
  const mapW = map?.[0]?.length || 60;
  const mapH = map?.length || 30;
  const seen = new Set();
  const validCells = [];

  for (const c of rawCells) {
    if (c.x < 0 || c.x >= mapW || c.y < 0 || c.y >= mapH) continue;
    const key = `${c.x},${c.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    validCells.push(c);
  }

  return validCells;
}

/**
 * バタリングラムからプレイヤーの方向へ攻撃予約を行う。
 */
export function castPetroBreath(monster, dungeon, player, messages) {
  if (!canCastPetroBreath(monster, dungeon)) return false;

  const cells = getPetroBreathCells(monster, player, dungeon.map);

  monster._isPetroBreathing = true;

  (dungeon.pendingPetroBreaths ||= []).push({
    id: uid(),
    sourceId: monster.id,
    sourceName: monster.name,
    originX: monster.x,
    originY: monster.y,
    source: monster,
    turnsLeft: 1,
    cells,
  });

  messages?.push(`${monster.name}は息を大きく吸い込んだ！前方広範囲に石化ブレスの予兆！`);
  return true;
}

/**
 * 敵移動後・敵攻撃前のフロア時計で予約ブレスを進め、発射または中断を解決する。
 */
export function advancePetroBreaths(dungeon, player, messages, lu, worldTicks = 1) {
  if (worldTicks <= 0 || (dungeon.timeStopTurns || 0) > 0) return;

  for (const breath of [...(dungeon.pendingPetroBreaths || [])]) {
    if (player.hp <= 0) break;
    breath.turnsLeft -= worldTicks;
    if (breath.turnsLeft > 0) continue;

    // 発射前にリストから除外
    dungeon.pendingPetroBreaths = dungeon.pendingPetroBreaths.filter(pending => pending !== breath);

    // 予兆の中断判定：本体が不在・死亡・封印・行動不能・強制移動（位置ズレ）しているなら中断
    const source = dungeon.monsters?.find(m => m.id === breath.sourceId || m === breath.source);
    if (source) {
      delete source._isPetroBreathing;
    }

    const isInterrupted = !source || source.hp <= 0 ||
      source.sealed ||
      (source.sleepTurns || 0) > 0 ||
      source.paralyzed ||
      (source.paralyzeTurns || 0) > 0 ||
      (source.petrifiedTurns || 0) > 0 ||
      (source.frozenTurns || 0) > 0 ||
      (source.knockdownTurns || 0) > 0 ||
      source.x !== breath.originX ||
      source.y !== breath.originY;

    if (isInterrupted) {
      messages?.push(`${breath.sourceName}の石化ブレスは中断された！`);
      continue;
    }

    messages?.push(`${breath.sourceName}のペトロブレスが放たれた！`);

    // ブレス着弾エフェクトを効果範囲の全マスに発行
    for (const cell of breath.cells || []) {
      pushAnim({ type: "petroBreath", x: cell.x, y: cell.y, color: "#c8b888" });
    }

    for (const cell of breath.cells || []) {
      // 1. プレイヤーへの命中判定
      if (player.x === cell.x && player.y === cell.y) {
        const onBlessedSanc = !inMagicSealRoom(player.x, player.y, dungeon) &&
          dungeon.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === player.x && pc.y === player.y);

        if (onBlessedSanc) {
          messages?.push(`祝福された聖域の加護が${breath.sourceName}の石化ブレスを防いだ！`);
        } else if (isStatusImmune(player, messages, "自分")) {
          // isStatusImmune 内でメッセージ出力済み
        } else {
          player.petrifiedTurns = 4;
          messages?.push("石化ブレスを浴びてしまった！体が石のように固まり動けない！(4ターン)");
        }
      }

      // 2. モンスターへの命中判定（敵味方無差別）
      for (const monster of [...(dungeon.monsters || [])]) {
        if (monster.hp <= 0 || !dungeon.monsters.includes(monster) || monster.disguisedAsItem) continue;
        if (!monsterOccupiesCell(monster, cell.x, cell.y)) continue;

        if (blockLargeMonsterStatus(monster, "petrify", messages)) {
          continue;
        }

        monster.petrifiedTurns = 4;
        startLargeMonsterStatusCooldown(monster, "petrify");
        messages?.push(`${monster.name}は石化してしまった！(4ターン)`);
      }
    }
  }
}

/**
 * 予約ブレスマスの警告描画（メテオと同じく残りターン数を中央に表示）
 */
export function drawPetroBreathWarnings(ctx, dungeon, sx, sy, tileSize) {
  if (!dungeon.pendingPetroBreaths?.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(9, Math.round(tileSize * 0.45))}px sans-serif`;

  for (const breath of dungeon.pendingPetroBreaths) {
    const turnsLabel = String(Math.max(1, breath.turnsLeft));
    for (const cell of breath.cells || []) {
      if (!dungeon.visible?.[cell.y]?.[cell.x]) continue;
      const px = (cell.x - sx) * tileSize;
      const py = (cell.y - sy) * tileSize;

      ctx.fillStyle = breath.turnsLeft <= 1 ? 'rgba(210, 180, 110, 0.48)' : 'rgba(180, 160, 120, 0.35)';
      ctx.fillRect(px, py, tileSize, tileSize);

      ctx.strokeStyle = '#e0c060';
      ctx.lineWidth = Math.max(1, tileSize * 0.06);
      ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#403010';
      ctx.lineWidth = Math.max(2, tileSize * 0.08);
      ctx.strokeText(turnsLabel, px + tileSize / 2, py + tileSize / 2);
      ctx.fillText(turnsLabel, px + tileSize / 2, py + tileSize / 2);
    }
  }
  ctx.restore();
}
