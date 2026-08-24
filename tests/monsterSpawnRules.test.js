import { describe, expect, it } from "vitest";
import {
  isMonsterSpawnCellAllowed,
  ROOMLESS_MONSTER_SPAWN_FLOOR_TYPES,
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
