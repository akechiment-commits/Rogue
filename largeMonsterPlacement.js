import { T } from './utils.js';
import { monsterBodySize, monsterBodyCells, monsterBodiesOverlap } from './monsterGeometry.js';

/** 初期生成は移動と同じ基準マス地形・全身キャラ判定を使い、入場する階段も覆わない。 */
export function canSpawnLargeMonsterAt(dungeon, monster, x, y) {
  const tile = dungeon.map[y]?.[x];
  if (!tile || tile === T.WALL || tile === T.BWALL) return false;
  if (tile === T.WATER && !monster.float && !monster.waterWalker && !monster.waterOnly) return false;
  if ((dungeon.monsters || []).some(other => other !== monster &&
      monsterBodiesOverlap(monster, other, x, y))) return false;
  return monsterBodyCells(monster, x, y).every(cell => {
    const bodyTile = dungeon.map[cell.y]?.[cell.x];
    return bodyTile != null && bodyTile !== T.SU && bodyTile !== T.SD &&
      ![dungeon.stairUp, dungeon.stairDown].some(stair => stair?.x === cell.x && stair?.y === cell.y);
  });
}

/** 既存の通常敵は動かさず、重なった巨大雑魚だけを最も近い空き基準マスへ配置し直す。 */
export function settleLargeMonsterSpawns(dungeon) {
  for (const monster of [...(dungeon.monsters || [])]) {
    if (monsterBodySize(monster) === 1 || monster.isBoss) continue;
    if (canSpawnLargeMonsterAt(dungeon, monster, monster.x, monster.y)) continue;
    let destination = null, bestDistance = Infinity;
    for (let y = 1; y < dungeon.map.length - 1; y++) {
      for (let x = 1; x < dungeon.map[y].length - 1; x++) {
        const distance = Math.max(Math.abs(x - monster.x), Math.abs(y - monster.y));
        if (distance >= bestDistance || !canSpawnLargeMonsterAt(dungeon, monster, x, y)) continue;
        destination = { x, y }; bestDistance = distance;
      }
    }
    if (destination) {
      monster.x = destination.x; monster.y = destination.y;
      monster.lastPx = monster.x; monster.lastPy = monster.y;
    } else {
      // 埋まった配置を返さず、その個体の初期生成だけを取り消す。
      dungeon.monsters = dungeon.monsters.filter(other => other !== monster);
    }
  }
  return dungeon;
}
