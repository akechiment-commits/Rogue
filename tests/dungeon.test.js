import { describe, it, expect, vi, afterEach } from "vitest";
import { genDungeon, genDebugDungeon, genTutorialFloor, genCorridorFloor, genMiniRoom, prepareLastFloor, GOAL_ITEMS, populateHiddenRoom, chooseNormalLayout, applyGeneratedBlessCurse } from "../dungeon.js";
import { pickMonsterDef } from "../monsters.js";
import { T, MW, MH } from "../utils.js";

function makeHiddenRoomMap(hr) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  for (let dy = 0; dy < hr.h; dy++)
    for (let dx = 0; dx < hr.w; dx++)
      map[hr.y + dy][hr.x + dx] = T.FLOOR;
  return map;
}

describe("genTutorialFloor", () => {
  it("1階は移動・装備・戦闘を試せる", () => {
    const floor = genTutorialFloor(1);
    expect(floor.floorType).toBe("tutorialFloor");
    expect(floor.tutorialFloor).toBe(1);
    expect(floor.map.length).toBe(MH);
    expect(floor.map[0].length).toBe(MW);
    expect(floor.items.some(i => i.type === "sign")).toBe(true);
    expect(floor.items.some(i => i.name === "ロングソード")).toBe(true);
    expect(floor.items.some(i => i.name === "鎖帷子")).toBe(true);
    expect(floor.rooms.every(r => r.w <= 9 && r.h <= 6)).toBe(true);
    expect(floor.monsters.some(m => m.baseKind === "rat")).toBe(true);
    expect(floor.tutorialObjective).toContain("装備");
    expect(floor.map[floor.stairUp.y][floor.stairUp.x]).toBe(T.SU);
    expect(floor.map[floor.stairDown.y][floor.stairDown.x]).toBe(T.SD);
  });

  it("2階は強敵に杖か迂回で対処できる4部屋構成", () => {
    const floor = genTutorialFloor(2);
    expect(floor.rooms.length).toBe(4);
    expect(floor.rooms.every(r => r.w <= 9 && r.h <= 6)).toBe(true);
    expect(floor.monsters.some(m => m.baseKind === "goblin")).toBe(true);
    expect(floor.items.some(i => i.type === "wand" && i.effect === "sleep" && i.preIdent)).toBe(true);
    expect(floor.tutorialObjective).toContain("迂回");
  });

  it("3階は訓練の証を取って引き返す最深部", () => {
    const floor = genTutorialFloor(3);
    expect(floor.rooms.length).toBe(4);
    expect(floor.rooms.every(r => r.w <= 9 && r.h <= 6)).toBe(true);
    expect(floor.isLastFloor).toBe(true);
    expect(floor.stairDown).toBeNull();
    expect(floor.items.some(i => i.type === "goal" && i.name === GOAL_ITEMS.tutorial.name)).toBe(true);
    const signText = floor.items
      .filter(i => i.type === "sign")
      .flatMap(i => i.text || [])
      .join(" ");
    expect(signText).toContain("容量オーバー");
    expect(signText).toContain("中身を回収");
    expect(floor.items.some(i => i.type === "potion" && !i.preIdent)).toBe(true);
    expect(floor.bigboxes.some(b => b.kind === "identify" && b.revealed)).toBe(true);
    const arrowTrap = floor.traps.find(t => t.effect === "arrow_trap");
    expect(arrowTrap?.revealed).toBe(false);
    expect(arrowTrap?.permanent).toBe(true);
    const trapSign = floor.items.find(i => i.type === "sign" && i.text?.some(line => line.includes("見えない罠")));
    expect(trapSign).toMatchObject({ x: arrowTrap.x, y: arrowTrap.y - 1 });
    expect(signText).toContain("見えない罠");
    expect(signText).toContain("歩いて通っても作動しない");
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

  it("アイテムモドキを除外した敵抽選では選ばれない", () => {
    for (let i = 0; i < 40; i++) {
      const { base } = pickMonsterDef(10, "intermediate", false, { excludeItemMimic: true });
      expect(base.baseKind).not.toBe("itemMimic");
    }
  });
});

describe("applyGeneratedBlessCurse", () => {
  it("壺の祝呪をフラグではなく容量へ変換する", () => {
    const blessedPot = { type: "pot", capacity: 3, blessed: true };
    applyGeneratedBlessCurse(blessedPot, 0.10, 0.25, () => 0.05);
    expect(blessedPot).toMatchObject({ capacity: 4 });
    expect(blessedPot.blessed).toBeUndefined();
    expect(blessedPot.cursed).toBeUndefined();

    const cursedPot = { type: "pot", capacity: 3, cursed: true };
    applyGeneratedBlessCurse(cursedPot, 0.10, 0.25, () => 0.20);
    expect(cursedPot).toMatchObject({ capacity: 2 });
    expect(cursedPot.blessed).toBeUndefined();
    expect(cursedPot.cursed).toBeUndefined();
  });

  it("壺以外は祝呪フラグを付ける", () => {
    const weapon = { type: "weapon" };
    applyGeneratedBlessCurse(weapon, 0.10, 0.25, () => 0.05);
    expect(weapon).toMatchObject({ blessed: true, cursed: false });
  });
});

describe("genDebugDungeon", () => {
  it("B1Fにカラペンを配置し、敵部屋へ到達できる", () => {
    const floor = genDebugDungeon();
    const karapen = floor.monsters.find((m) => m.name === "カラペン");
    expect(karapen).toBeTruthy();

    const passable = (x, y) => x >= 0 && x < MW && y >= 0 && y < MH && floor.map[y][x] !== T.WALL;
    const seen = new Set([`${floor.stairUp.x},${floor.stairUp.y}`]);
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
    expect(seen.has(`${karapen.x},${karapen.y}`)).toBe(true);
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
    const originalStairDown = { ...dg.stairDown };
    prepareLastFloor(dg, "beginner");
    expect(dg.stairDown).toBeNull();
    const goal = dg.items.find(i => i.type === "goal" && i.name === GOAL_ITEMS.beginner.name);
    expect(goal).toBeTruthy();
    expect(goal).toMatchObject(originalStairDown);
    expect(dg.lastFloorGoalPos).toEqual(originalStairDown);
  });
});
