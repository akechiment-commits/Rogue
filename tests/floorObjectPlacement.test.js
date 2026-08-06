import { describe, it, expect } from "vitest";
import { T } from "../utils.js";
/* T.SD / T.SU used for stair map updates */
import {
  isFloorOccupancyBlocked,
  pickFreeFloorObjectCell,
  canStepFloorObjectTo,
  stairRefAt,
  moveStairTo,
  pushStair,
} from "../floorObjectPlacement.js";
import { pushEntity } from "../items.js";

function makeDg() {
  const map = Array.from({ length: 10 }, () => Array(10).fill(T.FLOOR));
  for (let i = 0; i < 10; i++) {
    map[0][i] = T.WALL;
    map[9][i] = T.WALL;
    map[i][0] = T.WALL;
    map[i][9] = T.WALL;
  }
  return {
    map,
    rooms: [],
    monsters: [],
    items: [],
    traps: [],
    springs: [],
    bigboxes: [],
    pentacles: [],
    vents: [],
    oilyTiles: [],
    statues: [],
  };
}

describe("isFloorOccupancyBlocked", () => {
  it("空床は false", () => {
    const dg = makeDg();
    expect(isFloorOccupancyBlocked(dg, 3, 3, {})).toBe(false);
  });

  it("罠があると true（自身は無視）", () => {
    const dg = makeDg();
    const t = { x: 3, y: 3, name: "罠A" };
    dg.traps.push(t);
    expect(isFloorOccupancyBlocked(dg, 3, 3, {})).toBe(true);
    expect(isFloorOccupancyBlocked(dg, 3, 3, { ignore: t })).toBe(false);
  });

  it("魔方陣・風穴も占有", () => {
    const dg = makeDg();
    dg.pentacles.push({ x: 2, y: 2, kind: "sanctuary" });
    dg.vents.push({ x: 4, y: 4, type: "vent" });
    expect(isFloorOccupancyBlocked(dg, 2, 2, {})).toBe(true);
    expect(isFloorOccupancyBlocked(dg, 4, 4, {})).toBe(true);
  });
});

describe("pushEntity trap/vent no overlap", () => {
  it("罠は他オブジェクトの手前で止まる", () => {
    const dg = makeDg();
    const trap = { x: 2, y: 5, name: "矢の罠", effect: "arrow" };
    dg.traps.push(trap);
    dg.items.push({ x: 5, y: 5, name: "薬", type: "potion" });
    const p = { x: 1, y: 1, hp: 30, rings: [] };
    const res = pushEntity(dg, 2, 5, 1, 0, 10, [], "trap", trap, p, null);
    expect(res.x).toBe(4);
    expect(res.y).toBe(5);
    expect(trap.x).toBe(4);
    expect(trap.y).toBe(5);
  });

  it("魔方陣も同様に重ならない", () => {
    const dg = makeDg();
    const pc = { x: 2, y: 5, name: "聖域", kind: "sanctuary" };
    dg.pentacles.push(pc);
    dg.traps.push({ x: 6, y: 5, name: "罠" });
    const p = { x: 1, y: 1, hp: 30, rings: [] };
    pushEntity(dg, 2, 5, 1, 0, 10, [], "pentacle", pc, p, null);
    expect(pc.x).toBe(5);
    expect(pc.y).toBe(5);
  });
});

describe("pickFreeFloorObjectCell", () => {
  it("占有マスを避ける", () => {
    const dg = makeDg();
    dg.traps.push({ x: 3, y: 3 });
    const free = pickFreeFloorObjectCell(dg, null, { x: 1, y: 1 }, 3, 3);
    expect(free).toBeTruthy();
    expect(isFloorOccupancyBlocked(dg, free.x, free.y, {})).toBe(false);
  });
});

describe("canStepFloorObjectTo", () => {
  it("空床のみ true", () => {
    const dg = makeDg();
    expect(canStepFloorObjectTo(dg, 3, 3, null, null)).toBe(true);
    dg.vents.push({ x: 3, y: 3 });
    expect(canStepFloorObjectTo(dg, 3, 3, null, null)).toBe(false);
  });
});

describe("stairs", () => {
  it("stairRefAt / moveStairTo がマップと stairDown を更新する", () => {
    const dg = makeDg();
    dg.map[5][2] = T.SD;
    dg.stairDown = { x: 2, y: 5 };
    const st = stairRefAt(dg, 2, 5);
    expect(st.stairDir).toBe("down");
    expect(moveStairTo(dg, st, 4, 5)).toBe(true);
    expect(dg.map[5][2]).toBe(T.FLOOR);
    expect(dg.map[5][4]).toBe(T.SD);
    expect(dg.stairDown).toEqual({ x: 4, y: 5 });
  });

  it("階段はオブジェクト手前で止まる", () => {
    const dg = makeDg();
    dg.map[5][2] = T.SD;
    dg.stairDown = { x: 2, y: 5 };
    dg.items.push({ x: 6, y: 5, name: "薬" });
    const st = stairRefAt(dg, 2, 5);
    pushStair(dg, st, 1, 0, 10);
    expect(st.x).toBe(5);
    expect(dg.map[5][5]).toBe(T.SD);
    expect(dg.map[5][2]).toBe(T.FLOOR);
  });
});
