/** x/y は移動用の基準マス。3×3は中心、2×2は左上を基準にする。 */
export function monsterBodySize(monster) {
  const size = Number(monster?.bodySize ?? 1);
  return size === 2 || size === 3 ? size : 1;
}

export function monsterBounds(monster, x = monster.x, y = monster.y) {
  const size = monsterBodySize(monster);
  const offset = Math.floor((size - 1) / 2);
  return { x: x - offset, y: y - offset, width: size, height: size };
}

export function monsterOccupiesCell(monster, x, y) {
  if (monsterBodySize(monster) === 1) return monster.x === x && monster.y === y;
  const bounds = monsterBounds(monster);
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
}

export function monsterBodyCells(monster, x = monster.x, y = monster.y) {
  const bounds = monsterBounds(monster, x, y);
  const cells = [];
  for (let cy = bounds.y; cy < bounds.y + bounds.height; cy++) {
    for (let cx = bounds.x; cx < bounds.x + bounds.width; cx++) cells.push({ x: cx, y: cy });
  }
  return cells;
}

export function monsterPointDistance(monster, x, y) {
  const b = monsterBounds(monster);
  return Math.max(Math.max(b.x - x, 0, x - (b.x + b.width - 1)),
    Math.max(b.y - y, 0, y - (b.y + b.height - 1)));
}

export function monsterAreaHitCount(monster, x, y, width, height = width) {
  const b = monsterBounds(monster);
  return Math.max(0, Math.min(b.x + b.width, x + width) - Math.max(b.x, x)) *
    Math.max(0, Math.min(b.y + b.height, y + height) - Math.max(b.y, y));
}

/** 範囲効果は重なった体のマスごとに処理する。単体の弾・通常攻撃とは別。 */
export function monsterAreaTargets(monsters, containsCell) {
  return monsters.flatMap(monster => monsterBodyCells(monster)
    .filter(cell => containsCell(cell.x, cell.y)).map(() => monster));
}

export function monsterDistance(first, second) {
  const a = monsterBounds(first), b = monsterBounds(second);
  return Math.max(0, a.x - (b.x + b.width - 1), b.x - (a.x + a.width - 1),
    a.y - (b.y + b.height - 1), b.y - (a.y + a.height - 1));
}

export function monsterBodiesOverlap(first, second, x = first.x, y = first.y) {
  const a = monsterBounds(first, x, y), b = monsterBounds(second);
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** 体の端は壁をまたげるが、キャラクターの体同士は重ねない。 */
export function canPlaceMonsterBody(dungeon, monster, x, y, player = null) {
  const candidate = { ...monster, x, y };
  if (player && monsterOccupiesCell(candidate, player.x, player.y)) return false;
  return !(dungeon.monsters || []).some(other => other !== monster && !other.disguisedAsItem && monsterBodiesOverlap(candidate, other));
}
