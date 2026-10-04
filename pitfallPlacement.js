import { isFloorOccupancyBlocked } from "./floorObjectPlacement.js";
import { markItemIdentifiedForDungeon } from "./items.js";
import { uid } from "./utils.js";

function syncFallenMonster(entity, actionTime) {
  entity.actionTime = actionTime;
  entity.absentSince = actionTime;
  entity.waitDuringAbsence = false;
  entity._phaseActionCount = 0;
  entity._movesMadeThisPhase = 0;
  entity.turnAttacks = 0;
  delete entity._movedThisTurn;
}

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
  while (pending.length) {
    const entry = pending.shift();
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
      if (!entry.fromBrokenPot && entity.type === "pot") {
        /* 落下破損では火薬・油などの特殊効果を出さず、中身だけ配置する。
         * 中に入っていた薬・壺は直接落ちた品ではないので追加で割らない。 */
        const contents = (entity.contents || []).map(item => ({ kind: "item", entity: item, fromBrokenPot: true }));
        entity.contents = [];
        for (const snapshot of entity.confinedMonsters || []) {
          const monster = { ...snapshot, id: uid(), aware: true, dormant: false, lastPx: player?.x ?? cell.x, lastPy: player?.y ?? cell.y };
          for (const key of ["_defHalfMagicReady", "_pentacleDrawReady", "_mimicReady", "_mimicSourceId", "_dreamEaterStrikeReady", "_krakInkReady"]) delete monster[key];
          contents.push({ kind: "monster", entity: monster });
        }
        if (entity.confinedMonsters) entity.confinedMonsters = [];
        pending.unshift(...contents);
        cells.unshift(cell);
      } else if (!entry.fromBrokenPot && entity.type === "potion") {
        /* 瓶と薬液は消滅する。下階の敵・道具への薬効は発生させない。 */
        cells.unshift(cell);
      } else {
        dungeon.items.push(entity);
      }
    } else if (kind === "monster") {
      syncFallenMonster(entity, actionTime);
      dungeon.monsters.push(entity);
    }
  }
}
