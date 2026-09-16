import { describe, expect, it, vi, afterEach } from "vitest";
import {
  getMaxReachedFloor,
  getVisitedFloors,
  pickSpawnPoolFloor,
  resolveRuntimeSpawnPoolFloor,
} from "../utils.js";
import { pickMonsterDef, makeMonster } from "../monsters.js";
import { legendMonsterAllowed } from "../legendMonsterRules.js";
import { advancedMonsterAllowed } from "../advancedMonsterRules.js";
import { genTreasureRoom } from "../dungeon.js";

describe("pickSpawnPoolFloor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("beginner/intermediate は常に currentFloor", () => {
    expect(pickSpawnPoolFloor({
      dungeonType: "beginner",
      currentFloor: 3,
      maxReachedFloor: 10,
      maxFloors: 20,
    })).toBe(3);
    expect(pickSpawnPoolFloor({
      dungeonType: "intermediate",
      currentFloor: 5,
      maxReachedFloor: 12,
      maxFloors: 20,
    })).toBe(5);
  });

  it("advanced/legend で maxReached>current なら [current,maxReached] から選ぶ", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickSpawnPoolFloor({
      dungeonType: "advanced",
      currentFloor: 3,
      maxReachedFloor: 10,
      maxFloors: 30,
    })).toBe(3);
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(pickSpawnPoolFloor({
      dungeonType: "legend",
      currentFloor: 3,
      maxReachedFloor: 10,
      maxFloors: 50,
    })).toBe(10);
  });

  it("maxFloors で上限クランプ", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(pickSpawnPoolFloor({
      dungeonType: "advanced",
      currentFloor: 2,
      maxReachedFloor: 99,
      maxFloors: 8,
    })).toBe(8);
  });

  it("maxReached<=current なら current", () => {
    expect(pickSpawnPoolFloor({
      dungeonType: "advanced",
      currentFloor: 7,
      maxReachedFloor: 7,
      maxFloors: 30,
    })).toBe(7);
    expect(pickSpawnPoolFloor({
      dungeonType: "legend",
      currentFloor: 7,
      maxReachedFloor: 4,
      maxFloors: 50,
    })).toBe(4); // hi=min(4,50)=4, lo=min(7,4)=4
  });
});

describe("getMaxReachedFloor", () => {
  it("visited と session.maxReachedFloor の大きい方", () => {
    expect(getMaxReachedFloor({
      floors: { 1: {}, 5: {} },
      player: { depth: 3 },
      maxReachedFloor: 8,
    }, { maxFloors: 30 })).toBe(8);
    expect(getVisitedFloors({
      floors: { 1: {}, 5: {} },
      player: { depth: 3 },
    })).toEqual([1, 3, 5]);
  });

  it("maxFloors でクランプ（maxDepth と混同しない）", () => {
    expect(getMaxReachedFloor({
      floors: { 20: {} },
      player: { depth: 20 },
      maxDepth: 15, // 総階数フィールドは見ない
      maxReachedFloor: 20,
    }, { maxFloors: 15 })).toBe(15);
  });
});

describe("resolveRuntimeSpawnPoolFloor / pickMonsterDef poolFloor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("beginner は poolFloor 指定でも通常どおり現在階扱い（helperはcurrentを返す）", () => {
    const floor = resolveRuntimeSpawnPoolFloor({ dungeonType: "beginner", maxReachedFloor: 20, maxFloors: 20 }, 4);
    expect(floor).toBe(4);
  });

  it("legend: poolFloor を深い階にすると深いプールの敵を返し得る", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const deep = pickMonsterDef(0, "legend", false, { poolFloor: 40 });
    expect(legendMonsterAllowed(deep.base.baseKind, 40)).toBe(true);
    // 1階プールには出ない種族も含まれること（rat/bat/centipede以外が出る可能性）
    // 複数回ではなく、深い階で許可されることを確認
    const shallow = pickMonsterDef(0, "legend", false, { poolFloor: 1 });
    expect(legendMonsterAllowed(shallow.base.baseKind, 1)).toBe(true);
    expect(["rat", "bat", "centipede"]).toContain(shallow.base.baseKind);
  });

  it("advanced: poolFloor で深い階の定義を選べる", () => {
    const { base } = pickMonsterDef(2, "advanced", false, { poolFloor: 20 });
    expect(advancedMonsterAllowed(base.baseKind, 20)).toBe(true);
  });

  it("makeMonster も poolFloor を反映する", () => {
    const m = makeMonster(0, 1, 1, { dungeonType: "legend", poolFloor: 1 });
    expect(legendMonsterAllowed(m.baseKind, 1)).toBe(true);
  });
});

describe("treasure room noNaturalSpawn", () => {
  it("genTreasureRoom は noNaturalSpawn: true", () => {
    const room = genTreasureRoom(10);
    expect(room.isTreasureRoom).toBe(true);
    expect(room.noNaturalSpawn).toBe(true);
  });
});


describe("宝部屋の召喚用敵設定", () => {
  it("noNaturalSpawn でも dungeonType/spawnFloor が載る", () => {
    const dg = genTreasureRoom(30, "advanced");
    expect(dg.noNaturalSpawn).toBe(true);
    expect(dg.isTreasureRoom).toBe(true);
    expect(dg.monsters).toEqual([]);
    expect(dg.dungeonType).toBe("advanced");
    expect(dg.spawnFloor).toBe(30);
    expect(dg.maxFloors).toBe(30);
  });

  it("宝部屋 depth 超過でも resolveRuntime は最下層プール階を返す", () => {
    const dg = genTreasureRoom(50, "legend");
    // プレイヤー depth が 51 相当でも、spawnFloor=50 を使う
    expect(resolveRuntimeSpawnPoolFloor(dg, 51)).toBe(50);
  });

  it("宝部屋で spawnMonsters すると最下層帯の敵が出る", async () => {
    const { spawnMonsters } = await import("../monsters.js");
    const dg = genTreasureRoom(20, "legend");
    const p = { x: dg.rooms[0].cx, y: dg.rooms[0].cy, depth: 21 };
    const n = spawnMonsters(dg, 3, p.depth - 1, p.x, p.y, p, { aware: true });
    expect(n).toBeGreaterThan(0);
    expect(dg.monsters.length).toBe(n);
    for (const m of dg.monsters) {
      expect(legendMonsterAllowed(m.baseKind || m.kind, 20)).toBe(true);
    }
  });
});
