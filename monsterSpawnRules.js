/* 自動出現する敵の配置場所ルール。 */

/* これらは階段周辺の退避空間を内部的に rooms として持つが、
 * ゲーム上は部屋を持たない廊下主体フロアとして扱う。 */
export const ROOMLESS_MONSTER_SPAWN_FLOOR_TYPES = new Set([
  "corridorFloor",
  "ringCorridorFloor",
  "caveFloor",
]);

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
