import { monsterBodySize, monsterBodyCells } from './monsterGeometry.js';
import { T } from './utils.js';

function monsterCellVisible(dungeon, cell) {
  const tile = dungeon.map?.[cell.y]?.[cell.x];
  return dungeon.visible?.[cell.y]?.[cell.x] && tile !== T.WALL && tile !== T.BWALL;
}

export function monsterDrawBounds(monster, px, py, tileSize) {
  const size = monsterBodySize(monster), offset = Math.floor((size - 1) / 2) * tileSize;
  return { x: px - offset, y: py - offset, size: tileSize * size };
}

export function monsterVisible(dungeon, monster, x = monster.x, y = monster.y) {
  return monsterBodyCells(monster, x, y).some(cell => monsterCellVisible(dungeon, cell));
}

/** 一体の画像を大きく描く。視界外の体のマスは描画しない。 */
export function drawLargeMonster(ctx, monster, dungeon, sx, sy, tileSize, draw) {
  if (!monsterVisible(dungeon, monster)) return false;
  ctx.save();
  ctx.beginPath();
  for (const cell of monsterBodyCells(monster)) {
    if (monsterCellVisible(dungeon, cell)) ctx.rect((cell.x - sx) * tileSize, (cell.y - sy) * tileSize, tileSize, tileSize);
  }
  ctx.clip();
  draw((monster.x - sx) * tileSize, (monster.y - sy) * tileSize);
  ctx.restore();
  return true;
}
