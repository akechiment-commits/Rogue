import { describe, expect, it } from "vitest";
import {
  allowsSameRoomNaturalSpawn,
  isMonsterSpawnCellAllowed,
  isMonsterSpawnSightAllowed,
  keepMonsterSpawnSightCells,
  ROOMLESS_MONSTER_SPAWN_FLOOR_TYPES,
  SAME_ROOM_SPAWN_MIN_DIST,
} from "../monsterSpawnRules.js";

describe("自動出現モンスターの配置場所", () => {
  it("部屋のあるフロアでは部屋内だけを許可する", () => {
    const dungeon = {
      floorType: "normal",
      rooms: [{ x: 2, y: 3, w: 4, h: 3 }],
    };

    expect(isMonsterSpawnCellAllowed(dungeon, 3, 4)).toBe(true);
    expect(isMonsterSpawnCellAllowed(dungeon, 1, 4)).toBe(false);
    expect(isMonsterSpawnCellAllowed(dungeon, 6, 4)).toBe(false);
  });

  it("廊下主体の特殊フロアでは廊下も許可する", () => {
    for (const floorType of ROOMLESS_MONSTER_SPAWN_FLOOR_TYPES) {
      expect(isMonsterSpawnCellAllowed({ floorType, rooms: [{ x: 5, y: 5, w: 3, h: 3 }] }, 1, 1)).toBe(true);
    }
  });

  it("部屋データのないフロアでは全床を許可する", () => {
    expect(isMonsterSpawnCellAllowed({ floorType: "unknown", rooms: [] }, 20, 20)).toBe(true);
    expect(isMonsterSpawnCellAllowed({ floorType: "unknown" }, 20, 20)).toBe(true);
  });
});

describe("単部屋フロアの自然発生", () => {
  const player = { x: 10, y: 10 };
  const visibleGrid = (w, h, fill) => Array.from({ length: h }, () => Array(w).fill(fill));

  it("大部屋・ミニルーム・通常部屋1つのフロアは同部屋湧きを許可する", () => {
    expect(allowsSameRoomNaturalSpawn({ isBigRoom: true, rooms: [{ x: 2, y: 2, w: 12, h: 8 }] })).toBe(true);
    expect(allowsSameRoomNaturalSpawn({ floorType: "miniRoom", isBigRoom: true, rooms: [{ x: 24, y: 11, w: 12, h: 8 }] })).toBe(true);
    expect(allowsSameRoomNaturalSpawn({
      rooms: [{ x: 4, y: 4, w: 20, h: 12 }],
      hiddenRooms: [{ x: 40, y: 4, w: 4, h: 3, hidden: true }],
    })).toBe(true);
  });

  it("通常部屋が2つ以上あるフロアは同部屋湧きしない", () => {
    expect(allowsSameRoomNaturalSpawn({
      rooms: [{ x: 2, y: 2, w: 6, h: 5 }, { x: 20, y: 2, w: 6, h: 5 }],
    })).toBe(false);
  });

  it("単部屋では視界内でも8マス以上離れていれば湧く", () => {
    const dungeon = {
      rooms: [{ x: 2, y: 2, w: 30, h: 20 }],
      visible: visibleGrid(60, 30, true),
    };
    expect(isMonsterSpawnSightAllowed(dungeon, 10, 10, player)).toBe(false);
    expect(isMonsterSpawnSightAllowed(dungeon, 10 + SAME_ROOM_SPAWN_MIN_DIST, 10, player)).toBe(true);
    expect(isMonsterSpawnSightAllowed(dungeon, 18, 10, player)).toBe(true);
  });

  it("複数部屋では視界内を禁止する", () => {
    const dungeon = {
      rooms: [{ x: 2, y: 2, w: 8, h: 6 }, { x: 20, y: 2, w: 8, h: 6 }],
      visible: visibleGrid(60, 30, false),
    };
    dungeon.visible[10][18] = true;
    expect(isMonsterSpawnSightAllowed(dungeon, 18, 10, player)).toBe(false);
    expect(isMonsterSpawnSightAllowed(dungeon, 22, 4, player)).toBe(true);
  });

  it("単部屋は視界外かつ8マス以上を優先し、全視界なら距離条件に落とす", () => {
    const dungeon = {
      rooms: [{ x: 2, y: 2, w: 30, h: 20 }],
      visible: visibleGrid(60, 30, true),
    };
    dungeon.visible[10][22] = false;
    const cells = [[12, 10], [18, 10], [22, 10]];
    expect(keepMonsterSpawnSightCells(dungeon, cells, player)).toEqual([[22, 10]]);

    dungeon.visible[10][22] = true;
    expect(keepMonsterSpawnSightCells(dungeon, cells, player)).toEqual([[18, 10], [22, 10]]);
  });

  it("8マス以上が無い単部屋は一番遠いマスへ湧く", () => {
    const dungeon = {
      isBigRoom: true,
      floorType: "miniRoom",
      rooms: [{ x: 8, y: 8, w: 5, h: 4 }],
      visible: visibleGrid(60, 30, true),
    };
    const cells = [
      [9, 9],
      [8, 8],
      [12, 11],
      [8, 11],
    ];
    expect(keepMonsterSpawnSightCells(dungeon, cells, player)).toEqual([[8, 8]]);
  });
});
