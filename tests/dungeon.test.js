import { describe, it, expect } from "vitest";
import { genDungeon, genTutorialFloor, prepareLastFloor, GOAL_ITEMS } from "../dungeon.js";
import { T, MW, MH } from "../utils.js";

describe("genTutorialFloor", () => {
  it("1階は看板と初期装備がある", () => {
    const floor = genTutorialFloor(1);
    expect(floor.floorType).toBe("tutorialFloor");
    expect(floor.tutorialFloor).toBe(1);
    expect(floor.map.length).toBe(MH);
    expect(floor.map[0].length).toBe(MW);
    expect(floor.items.some(i => i.type === "sign")).toBe(true);
    expect(floor.items.some(i => i.name === "短剣")).toBe(true);
    expect(floor.items.some(i => i.name === "革の鎧")).toBe(true);
    expect(floor.map[floor.stairUp.y][floor.stairUp.x]).toBe(T.SU);
    expect(floor.map[floor.stairDown.y][floor.stairDown.x]).toBe(T.SD);
  });

  it("4階以降は4部屋構成になる", () => {
    const f3 = genTutorialFloor(3);
    const f4 = genTutorialFloor(4);
    expect(f3.rooms.length).toBe(3);
    expect(f4.rooms.length).toBe(4);
  });
});

describe("genDungeon", () => {
  it("通常フロアはマップと階段を持つ", () => {
    const dg = genDungeon(0, "beginner");
    expect(dg.map.length).toBe(MH);
    expect(dg.dungeonType).toBe("beginner");
    expect(dg.stairUp).toBeTruthy();
    expect(dg.stairDown).toBeTruthy();
    expect(dg.rooms.length).toBeGreaterThanOrEqual(2);
  });

  it("ボスフロア（depth=4）はモンスターを含む", () => {
    const dg = genDungeon(4, "intermediate");
    expect(dg.monsters.length).toBeGreaterThan(0);
  });
});

describe("prepareLastFloor", () => {
  it("最下層にゴールアイテムを配置し下り階段を除去する", () => {
    const dg = genDungeon(9, "beginner");
    prepareLastFloor(dg, "beginner");
    expect(dg.stairDown).toBeNull();
    expect(dg.items.some(i => i.type === "goal" && i.name === GOAL_ITEMS.beginner.name)).toBe(true);
  });
});