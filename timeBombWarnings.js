export const TIME_BOMB_BLAST_RADIUS = 2;

/** The time-bomb explosion uses the same square 5x5 footprint as this warning. */
export function timeBombBlastCells(bomb) {
  if (!Number.isFinite(bomb?.x) || !Number.isFinite(bomb?.y)) return [];
  const cells = [];
  const radius = TIME_BOMB_BLAST_RADIUS;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      cells.push({ x: bomb.x + dx, y: bomb.y + dy });
    }
  }
  return cells;
}

export function drawTimeBombWarnings(ctx, dungeon, sx, sy, tileSize) {
  if (!ctx || !dungeon?.pendingBombs?.length) return;
  const warnings = new Map();
  for (const bomb of dungeon.pendingBombs) {
    for (const cell of timeBombBlastCells(bomb)) {
      if (!dungeon.visible?.[cell.y]?.[cell.x]) continue;
      const key = `${cell.x},${cell.y}`;
      const previous = warnings.get(key);
      if (!previous || bomb.turnsLeft < previous.turnsLeft) warnings.set(key, bomb);
    }
  }
  if (!warnings.size) return;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.max(9, Math.round(tileSize * 0.45))}px monospace`;
  for (const [key, bomb] of warnings) {
    const [x, y] = key.split(",").map(Number);
    const px = (x - sx) * tileSize;
    const py = (y - sy) * tileSize;
    const color = bomb.turnsLeft <= 1 ? "#ff3020" : bomb.turnsLeft <= 2 ? "#ff8800" : "#ffe040";
    ctx.fillStyle = `${color}30`;
    ctx.fillRect(px, py, tileSize, tileSize);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, tileSize * 0.05);
    ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#201830";
    ctx.lineWidth = Math.max(2, tileSize * 0.08);
    ctx.strokeText(String(Math.max(1, bomb.turnsLeft)), px + tileSize / 2, py + tileSize / 2);
    ctx.fillText(String(Math.max(1, bomb.turnsLeft)), px + tileSize / 2, py + tileSize / 2);
  }
  ctx.restore();
}
