/* 自動出現する敵の配置場所ルール。 */

/* これらは階段周辺の退避空間を内部的に rooms として持つが、
 * ゲーム上は部屋を持たない廊下主体フロアとして扱う。 */
export const ROOMLESS_MONSTER_SPAWN_FLOOR_TYPES = new Set([
  "corridorFloor",
  "ringCorridorFloor",
  "caveFloor",
]);

/** プレイヤーと同部屋へ湧かせるときのマンハッタン距離下限（大部屋と同じ）。 */
export const SAME_ROOM_SPAWN_MIN_DIST = 8;

export function publicRoomCount(dungeon) {
  const rooms = Array.isArray(dungeon?.rooms) ? dungeon.rooms : [];
  return rooms.filter((room) => room && !room.hidden).length;
}

/**
 * プレイヤーのいる部屋にも自然発生させてよいか。
 * 大部屋フラグ、または通常部屋が1つ以下（残りは隠し部屋のみ）のフロア。
 * 部屋全体が見える仕様のため、距離で「十分離れた視界外」を担保する。
 */
export function allowsSameRoomNaturalSpawn(dungeon) {
  if (!dungeon) return false;
  if (dungeon.isBigRoom) return true;
  if (ROOMLESS_MONSTER_SPAWN_FLOOR_TYPES.has(dungeon.floorType)) return false;
  return publicRoomCount(dungeon) <= 1;
}

/**
 * 自動出現する敵を指定座標へ置いてよいか判定する。
 * 部屋のあるフロアでは部屋内だけ、部屋なしフロアでは全床を許可する。
 */
export function isMonsterSpawnCellAllowed(dungeon, x, y) {
  if (!dungeon) return false;
  if (ROOMLESS_MONSTER_SPAWN_FLOOR_TYPES.has(dungeon.floorType)) return true;

  const rooms = Array.isArray(dungeon.rooms) ? dungeon.rooms : [];
  if (rooms.length === 0) return true;
  return rooms.some((room) => (
    x >= room.x && x < room.x + room.w &&
    y >= room.y && y < room.y + room.h
  ));
}

function manhattanDist(x, y, player) {
  return Math.abs(x - player.x) + Math.abs(y - player.y);
}

function isFarEnoughForSameRoomSpawn(x, y, player) {
  return manhattanDist(x, y, player) >= SAME_ROOM_SPAWN_MIN_DIST;
}

function farthestSpawnCells(cells, player) {
  let maxDist = -1;
  const farthest = [];
  for (const cell of cells) {
    const dist = manhattanDist(cell[0], cell[1], player);
    if (dist > maxDist) {
      maxDist = dist;
      farthest.length = 0;
      farthest.push(cell);
    } else if (dist === maxDist) {
      farthest.push(cell);
    }
  }
  return farthest;
}

/**
 * 視界・距離の追加フィルタ。
 * 通常フロアは視界内禁止（部屋全体が見えるため実質プレイヤー部屋には湧かない）。
 * 単部屋／大部屋は8マス以上かつ視界外を優先し、部屋全体が見えているときだけ距離条件に落とす。
 */
export function isMonsterSpawnSightAllowed(dungeon, x, y, player) {
  if (!dungeon || !player) return false;
  if (allowsSameRoomNaturalSpawn(dungeon)) {
    return isFarEnoughForSameRoomSpawn(x, y, player);
  }
  return !dungeon.visible?.[y]?.[x];
}

export function keepMonsterSpawnSightCells(dungeon, cells, player) {
  if (!dungeon || !player || !Array.isArray(cells)) return [];
  if (allowsSameRoomNaturalSpawn(dungeon)) {
    const far = cells.filter(([x, y]) => isFarEnoughForSameRoomSpawn(x, y, player));
    const unseen = far.filter(([x, y]) => !dungeon.visible?.[y]?.[x]);
    if (unseen.length > 0) return unseen;
    if (far.length > 0) return far;
    /* ミニルームなど8マス以上が取れないときは、一番遠いマスへ湧かせる。 */
    return farthestSpawnCells(cells, player);
  }
  return cells.filter(([x, y]) => !dungeon.visible?.[y]?.[x]);
}
