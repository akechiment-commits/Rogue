import { describe, it, expect } from "vitest";
import { fleeFromPlayerStep, getRoomExits, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

/** 小さい部屋＋右に廊下1本 */
function makeRoomWithCorridor() {
  const map = Array.from({ length: 30 }, () => Array(60).fill(T.WALL));
  /* 部屋 (2,2)-(8,8) 内 FLOOR */
  for (let y = 2; y <= 8; y++)
    for (let x = 2; x <= 8; x++) map[y][x] = T.FLOOR;
  /* 東側廊下 (9,5)-(15,5) */
  for (let x = 9; x <= 15; x++) map[5][x] = T.FLOOR;
  const rooms = [{ x: 2, y: 2, w: 7, h: 7 }];
  return { map, rooms };
}

describe("逃走AI fleeFromPlayerStep", () => {
  it("部屋の出口を検出する", () => {
    const { map, rooms } = makeRoomWithCorridor();
    const exits = getRoomExits(map, rooms[0], { map });
    expect(exits.some(e => e.x === 9 && e.y === 5)).toBe(true);
  });

  it("部屋の隅からでも出口方向へ1歩進む（プレイヤーに近づいても可）", () => {
    const { map, rooms } = makeRoomWithCorridor();
    /* プレイヤーは出口付近、逃走側は北西の隅 → 局所最適は隅に張り付くが、BFSは出口へ */
    const pl = makePlayer({ x: 8, y: 5 });
    const m = {
      name: "フクマル", x: 2, y: 2, subtype: "runner",
      hp: 11, maxHp: 11, atk: 0, def: 0, float: false,
    };
    const dg = makeEmptyDg({
      map, rooms, monsters: [m], items: [], traps: [], statues: [],
    });
    const step = fleeFromPlayerStep(m, dg, pl, false);
    expect(step).not.toBeNull();
    /* 隅(2,2)から出口(9,5)方面：xまたはyが増える方向へ */
    expect(step.x + step.y).toBeGreaterThan(2 + 2);
    /* 少なくとも部屋の内側へ動き出す（隅に留まるな） */
    expect(step.x === 2 && step.y === 2).toBe(false);
  });

  it("runner は認識中に隅で固まらず動く", () => {
    const { map, rooms } = makeRoomWithCorridor();
    const pl = makePlayer({ x: 8, y: 5 });
    const m = {
      name: "フクマル", x: 2, y: 2, subtype: "runner", baseKind: "runner",
      hp: 11, maxHp: 11, atk: 0, def: 0, exp: 50, speed: 2, baseSpeed: 2,
      float: false, aware: true, lastPx: 8, lastPy: 5,
      turnAccum: 0, monLevel: 1, sealed: false, dir: { x: 0, y: 0 },
    };
    const dg = makeEmptyDg({
      map, rooms, monsters: [m], items: [], traps: [], statues: [],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    const ml = [];
    monsterAI(m, dg, pl, ml, {});
    expect(m.x === 2 && m.y === 2).toBe(false);
  });

  it("プレイヤーの隣を通らずに逃げられる経路を優先する", () => {
    const map = Array.from({ length: 30 }, () => Array(60).fill(T.WALL));
    for (let y = 2; y <= 8; y++) {
      for (let x = 2; x <= 8; x++) map[y][x] = T.FLOOR;
    }
    for (let x = 2; x <= 8; x++) {
      map[1][x] = T.FLOOR;
      map[9][x] = T.FLOOR;
    }
    const pl = makePlayer({ x: 5, y: 5 });
    const m = { name: "フクマル", x: 5, y: 4, subtype: "runner", hp: 11, maxHp: 11, float: false, posHistory: [] };
    const dg = makeEmptyDg({ map, rooms: [{ x: 2, y: 2, w: 7, h: 7 }], monsters: [m], items: [], traps: [], statues: [] });
    const step = fleeFromPlayerStep(m, dg, pl, false);
    expect(step).not.toBeNull();
    expect(Math.max(Math.abs(step.x - pl.x), Math.abs(step.y - pl.y))).toBeGreaterThan(1);
  });

  it("直近のマスを避けて同じ場所の往復を抑える", () => {
    const { map, rooms } = makeRoomWithCorridor();
    const pl = makePlayer({ x: 8, y: 5 });
    const m = { name: "フクマル", x: 4, y: 4, subtype: "runner", hp: 11, maxHp: 11, float: false,
      posHistory: [{ x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 4 }] };
    const dg = makeEmptyDg({ map, rooms, monsters: [m], items: [], traps: [], statues: [] });
    const step = fleeFromPlayerStep(m, dg, pl, false);
    expect(step).not.toBeNull();
    expect(step.x === 4 && step.y === 3).toBe(false);
  });
});
