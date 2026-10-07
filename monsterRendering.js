import { monsterBodySize, monsterBodyCells } from './monsterGeometry.js';

export function monsterDrawBounds(monster, px, py, tileSize) {
  const size = monsterBodySize(monster), offset = Math.floor((size - 1) / 2) * tileSize;
  return { x: px - offset, y: py - offset, size: tileSize * size };
}

export function monsterVisible(dungeon, monster, x = monster.x, y = monster.y) {
  return monsterBodyCells(monster, x, y).some(cell => dungeon.visible?.[cell.y]?.[cell.x]);
}

/** 一体の画像を大きく描く。視界外の体のマスは描画しない。 */
export function drawLargeMonster(ctx, monster, dungeon, sx, sy, tileSize, draw) {
  if (!monsterVisible(dungeon, monster)) return false;
  ctx.save();
  ctx.beginPath();
  for (const cell of monsterBodyCells(monster)) {
    if (dungeon.visible?.[cell.y]?.[cell.x]) ctx.rect((cell.x - sx) * tileSize, (cell.y - sy) * tileSize, tileSize, tileSize);
  }
  ctx.clip();
  draw((monster.x - sx) * tileSize, (monster.y - sy) * tileSize);
  ctx.restore();
  return true;
}
