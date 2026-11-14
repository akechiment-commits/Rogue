import { describe, it, expect } from "vitest";
import { processPitfallBag } from "../render.js";
import { generateSessionFloor } from "../floorGeneration.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("落下によるフロア生成", () => {
  it.each(["intermediate", "advanced", "legend"])("%s冒険の下階を同じ種別で生成する", dungeonType => {
    const state = { dungeonType, maxDepth: 50, player: makePlayer({ depth: 4 }) };
    const floors = {};
    processPitfallBag([{ kind: "item", entity: { type: "arrow", name: "石" } }], floors, 4, state);
    expect(floors[5].dungeonType).toBe(dungeonType);
    expect(floors[5].isBossFloor).toBe(true);
    expect(floors[5]._preGenerated).toBe(true);
  });

  it("既に訪問済みとして保存されている階へ落とした場合は事前生成フラグを付けない", () => {
    const state = { dungeonType: "beginner", maxDepth: 10, player: makePlayer({ depth: 1 }) };
    const visitedFloor = makeEmptyDg({ rooms: [{ x: 2, y: 2, w: 4, h: 4 }] });
    const floors = { 2: visitedFloor };
    processPitfallBag([{ kind: "item", entity: { type: "arrow", name: "石" } }], floors, 1, state);
    expect(floors[2]).toBe(visitedFloor);
    expect(floors[2]._preGenerated).toBeUndefined();
  });
  it("最下層の下は先行生成でも宝部屋になり、最深階には目標アイテムがある", () => {
    const state = { dungeonType: "advanced", maxDepth: 30, player: makePlayer({ depth: 30 }) };
    const floors = {};
    processPitfallBag([{ kind: "item", entity: { type: "arrow", name: "石" } }], floors, 30, state);
    expect(floors[31].isTreasureRoom).toBe(true);
    expect(generateSessionFloor(state, 30).items.some(item => item.type === "goal")).toBe(true);
  });
  it("プレイヤーが既に下階へ移動していれば現在のフロアへ配置し、別コピーを作らない", () => {
    const item = { type: "arrow", name: "石" };
    const state = { player: makePlayer({ depth: 2 }), dungeon: makeEmptyDg({ rooms: [{ x: 2, y: 2, w: 4, h: 4 }] }), floors: {} };
    processPitfallBag([{ kind: "item", entity: item }], state.floors, 1, state);
    expect(state.dungeon.items).toContain(item);
    expect(state.floors[2]).toBeUndefined();
  });
});
