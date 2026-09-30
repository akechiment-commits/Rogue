import { isFloorOccupancyBlocked } from "./floorObjectPlacement.js";
import { markItemIdentifiedForDungeon } from "./items.js";

/** 空き床へ落下物を配置する。空きがなければフロア内の待機リストに残す。 */
export function placeFallenEntities(dungeon, entries = [], { player = null, actionTime = 0, random = Math.random } = {}) {
  const pending = [...(dungeon.pendingPitfalls || []), ...entries];
  dungeon.pendingPitfalls = [];
  if (!pending.length) return;
  const cells = [];
  for (let y = 1; y < dungeon.map.length - 1; y++) {
    for (let x = 1; x < dungeon.map[y].length - 1; x++) {
      if (isFloorOccupancyBlocked(dungeon, x, y, { p: player })) continue;
      if (dungeon.pendingBombs?.some(bomb => bomb.x === x && bomb.y === y)) continue;
      cells.push({ x, y, inRoom: dungeon.rooms?.some(room => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) });
    }
  }
  for (const entry of pending) {
    if (!cells.length) { dungeon.pendingPitfalls.push(entry); continue; }
    const roomCells = cells.filter(cell => cell.inRoom);
    const pool = roomCells.length ? roomCells : cells;
    const cell = pool[Math.floor(random() * pool.length)];
    cells.splice(cells.indexOf(cell), 1);
    const { kind, entity } = entry;
    entity.x = cell.x;
    entity.y = cell.y;
    if (kind === "item") {
      markItemIdentifiedForDungeon(entity, dungeon);
      dungeon.items.push(entity);
    } else if (kind === "monster") {
      entity.actionTime = actionTime;
      entity.absentSince = actionTime;
      entity.waitDuringAbsence = false;
      entity._phaseActionCount = 0;
      entity._movesMadeThisPhase = 0;
      entity.turnAttacks = 0;
      delete entity._movedThisTurn;
      dungeon.monsters.push(entity);
    }
  }
}
