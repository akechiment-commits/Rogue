import { uid } from './utils.js';
import { inMagicSealRoom } from './items.js';
import { monsterOccupiesCell, monsterBounds } from './monsterGeometry.js';
import { isStatusImmune } from './statusImmunity.js';
import { blockLargeMonsterStatus, startLargeMonsterStatusCooldown } from './largeMonsterStatus.js';

export function canCastPetroBreath(monster, dungeon) {
  return !monster.sealed && !dungeon.pendingPetroBreaths?.some(b => b.sourceId === monster.id);
}

/**
 * バタリングラムからプレイヤーの方向へ前方2マスを攻撃予約する。
 */
export function castPetroBreath(monster, dungeon, player, messages) {
  if (!canCastPetroBreath(monster, dungeon)) return false;

  const bounds = monsterBounds(monster);
  const nearX = Math.max(bounds.x, Math.min(player.x, bounds.x + bounds.width - 1));
  const nearY = Math.max(bounds.y, Math.min(player.y, bounds.y + bounds.height - 1));

  let dx = Math.sign(player.x - nearX);
  let dy = Math.sign(player.y - nearY);
  if (dx === 0 && dy === 0) {
    dx = Math.sign(player.x - (monster.x + 0.5));
    dy = Math.sign(player.y - (monster.y + 0.5));
  }
  if (dx === 0 && dy === 0) dx = 1; // フォールバック

  const cells = [];
  for (let dist = 1; dist <= 2; dist++) {
    const cx = nearX + dx * dist;
    const cy = nearY + dy * dist;
    if (cx >= 0 && cx < (dungeon.map?.[0]?.length || 60) && cy >= 0 && cy < (dungeon.map?.length || 30)) {
      cells.push({ x: cx, y: cy });
    }
  }

  (dungeon.pendingPetroBreaths ||= []).push({
    id: uid(),
    sourceId: monster.id,
    sourceName: monster.name,
    turnsLeft: 1,
    cells,
  });

  messages?.push(`${monster.name}は息を大きく吸い込んだ！前方2マスに石化ブレスの予兆！`);
  return true;
}

/**
 * 敵移動後・敵攻撃前のフロア時計で予約ブレスを進め、0ターンで敵味方無差別に石化ブレスを発射する。
 */
export function advancePetroBreaths(dungeon, player, messages, lu, worldTicks = 1) {
  if (worldTicks <= 0 || (dungeon.timeStopTurns || 0) > 0) return;

  for (const breath of [...(dungeon.pendingPetroBreaths || [])]) {
    if (player.hp <= 0) break;
    breath.turnsLeft -= worldTicks;
    if (breath.turnsLeft > 0) continue;

    // 発射前にリストから除外
    dungeon.pendingPetroBreaths = dungeon.pendingPetroBreaths.filter(pending => pending !== breath);
    messages?.push(`${breath.sourceName}のペトロブレスが放たれた！`);

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
          // 耐性ありまたは状態防止中
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
 * 予約ブレスマスの警告描画
 */
export function drawPetroBreathWarnings(ctx, dungeon, sx, sy, tileSize) {
  if (!dungeon.pendingPetroBreaths?.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(9, Math.round(tileSize * 0.45))}px sans-serif`;

  for (const breath of dungeon.pendingPetroBreaths) {
    for (const cell of breath.cells || []) {
      if (!dungeon.visible?.[cell.y]?.[cell.x]) continue;
      const px = (cell.x - sx) * tileSize;
      const py = (cell.y - sy) * tileSize;

      ctx.fillStyle = 'rgba(180, 160, 120, 0.45)';
      ctx.fillRect(px, py, tileSize, tileSize);

      ctx.strokeStyle = '#e0c060';
      ctx.lineWidth = Math.max(1, tileSize * 0.06);
      ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#403010';
      ctx.lineWidth = Math.max(2, tileSize * 0.08);
      ctx.strokeText('石', px + tileSize / 2, py + tileSize / 2);
      ctx.fillText('石', px + tileSize / 2, py + tileSize / 2);
    }
  }
  ctx.restore();
}
