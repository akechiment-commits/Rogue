import { describe, it, expect, vi, afterEach } from "vitest";
import { genDungeon, genTutorialFloor, genCorridorFloor, genMiniRoom, prepareLastFloor, GOAL_ITEMS, populateHiddenRoom, chooseNormalLayout } from "../dungeon.js";
import { T, MW, MH } from "../utils.js";

function makeHiddenRoomMap(hr) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  for (let dy = 0; dy < hr.h; dy++)
    for (let dx = 0; dx < hr.w; dx++)
      map[hr.y + dy][hr.x + dx] = T.FLOOR;
  return map;
}

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

  it("通常フロアの変則レイアウト抽選は標準を含む", () => {
    expect(chooseNormalLayout(0.00)).toBe("centralCross");
    expect(chooseNormalLayout(0.12)).toBe("courtyard");
    expect(chooseNormalLayout(0.23)).toBe("wideRooms");
    expect(chooseNormalLayout(0.38)).toBe("standard");
  });

  it("変則レイアウトも特殊フロア扱いにならない", () => {
    const dg = genDungeon(0, "beginner");
    expect(["standard", "centralCross", "courtyard", "wideRooms"]).toContain(dg.layoutVariant);
    expect(dg.floorType).toBeUndefined();
  });

  it("ボスフロア（depth=4）はモンスターを含む", () => {
    const dg = genDungeon(4, "intermediate");
    expect(dg.monsters.length).toBeGreaterThan(0);
  });
});

describe("genCorridorFloor", () => {
  it("分岐と行き止まりを持つ迷路になり、階段同士が接続される", () => {
    const floor = genCorridorFloor(8, "intermediate");
    const passable = (x, y) => x >= 0 && x < MW && y >= 0 && y < MH && floor.map[y][x] !== T.WALL;
    let junctions = 0;
    let deadEnds = 0;

    for (let y = 1; y < MH - 1; y++) {
      for (let x = 1; x < MW - 1; x++) {
        if (!passable(x, y)) continue;
        const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .filter(([dx, dy]) => passable(x + dx, y + dy)).length;
        if (exits >= 3) junctions++;
        if (exits === 1) deadEnds++;
      }
    }

    const startKey = `${floor.stairUp.x},${floor.stairUp.y}`;
    const goalKey = `${floor.stairDown.x},${floor.stairDown.y}`;
    const seen = new Set([startKey]);
    const queue = [floor.stairUp];
    for (let i = 0; i < queue.length; i++) {
      const { x, y } = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (passable(nx, ny) && !seen.has(key)) {
          seen.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }

    expect(floor.floorType).toBe("corridorFloor");
    expect(junctions).toBeGreaterThan(40);
    expect(deadEnds).toBeGreaterThan(15);
    expect(seen.has(goalKey)).toBe(true);
  });
});

describe("genMiniRoom", () => {
  it("超小型1部屋フロアは12×8マス程度に収まる", () => {
    const floor = genMiniRoom(8, "intermediate");

    expect(floor.floorType).toBe("miniRoom");
    expect(floor.rooms).toHaveLength(1);
    expect(floor.rooms[0]).toMatchObject({ w: 12, h: 8 });
    expect(floor.map[floor.stairUp.y][floor.stairUp.x]).toBe(T.SU);
    expect(floor.map[floor.stairDown.y][floor.stairDown.x]).toBe(T.SD);
  });
});

describe("populateHiddenRoom", () => {
  afterEach(() => vi.restoreAllMocks());

  it("宝物庫でも回転板を必ず1枚配置する", () => {
    const hr = { x: 10, y: 10, w: 5, h: 4 };
    const map = makeHiddenRoomMap(hr);
    const items = [], bigboxes = [], springs = [], traps = [];
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    populateHiddenRoom(hr, map, 5, items, bigboxes, springs, traps);

    expect(hr.isTreasureVault).toBe(true);
    expect(traps.filter(t => t.effect === "spin").length).toBe(1);
  });

  it("通常の隠し部屋でも回転板を必ず1枚配置する", () => {
    const hr = { x: 10, y: 10, w: 5, h: 4 };
    const map = makeHiddenRoomMap(hr);
    const items = [], bigboxes = [], springs = [], traps = [];
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    populateHiddenRoom(hr, map, 5, items, bigboxes, springs, traps);

    expect(hr.isTreasureVault).toBeUndefined();
    expect(traps.filter(t => t.effect === "spin").length).toBe(1);
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
