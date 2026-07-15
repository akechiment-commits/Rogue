import { describe, it, expect } from "vitest";
import { monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function openMap() {
  return Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
}

describe("からめ鬼は動かない", () => {
  it("未覚醒からめ鬼はパトロールしない", () => {
    const map = openMap();
    const rooms = [{ x: 2, y: 2, w: 10, h: 10 }, { x: 20, y: 2, w: 8, h: 8 }];
    const m = {
      name: "からめ鬼", subtype: "grabber", baseKind: "grabber",
      x: 5, y: 5, hp: 55, maxHp: 55, atk: 22, def: 10, exp: 55,
      speed: 1, baseSpeed: 1, aware: false, dormant: false,
      lastPx: 5, lastPy: 5, turnAccum: 0, monLevel: 1, dir: { x: 0, y: 0 },
    };
    const pl = makePlayer({ x: 25, y: 5 });
    const dg = makeEmptyDg({ map, rooms, monsters: [m], items: [], traps: [] });
    for (let i = 0; i < 8; i++) monsterAI(m, dg, pl, [], {});
    expect(m.x).toBe(5);
    expect(m.y).toBe(5);
  });

  it("追跡AIのスワップ対象になってもからめ鬼は動かない", () => {
    const map = openMap();
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 60; x++)
        if (y !== 5) map[y][x] = T.WALL;
    const grabber = {
      name: "からめ鬼", subtype: "grabber", baseKind: "grabber",
      x: 10, y: 5, hp: 55, maxHp: 55, atk: 22, def: 10, exp: 55,
      speed: 1, baseSpeed: 1, aware: false, dormant: false,
      lastPx: 10, lastPy: 5, turnAccum: 0, monLevel: 1, dir: { x: 0, y: 0 },
    };
    const chaser = {
      name: "スライム", baseKind: "slime",
      x: 9, y: 5, hp: 20, maxHp: 20, atk: 5, def: 0, exp: 5,
      speed: 1, baseSpeed: 1, aware: true, dormant: false,
      lastPx: 15, lastPy: 5, turnAccum: 0, monLevel: 1, dir: { x: 1, y: 0 },
    };
    const pl = makePlayer({ x: 15, y: 5 });
    const dg = makeEmptyDg({
      map, rooms: [], monsters: [grabber, chaser], items: [], traps: [],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    const gx = grabber.x, gy = grabber.y;
    for (let i = 0; i < 5; i++) {
      monsterAI(chaser, dg, pl, [], { moveOnly: true });
      monsterAI(grabber, dg, pl, [], { moveOnly: true });
    }
    expect(grabber.x).toBe(gx);
    expect(grabber.y).toBe(gy);
  });
});

describe("詰まり脱出", () => {
  it("プレイヤー隣接中は詰まり脱出で動かない", () => {
    const map = openMap();
    const m = {
      name: "スライム", baseKind: "slime",
      x: 10, y: 10, hp: 20, maxHp: 20, atk: 5, def: 0, exp: 5,
      speed: 1, baseSpeed: 1, aware: true, dormant: false,
      lastPx: 10, lastPy: 10, turnAccum: 0, monLevel: 1, dir: { x: 0, y: 0 },
      _idleStuck: 10,
      posHistory: [
        { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 },
        { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 },
      ],
    };
    const pl = makePlayer({ x: 11, y: 10 }); /* 隣接 */
    const dg = makeEmptyDg({
      map,
      rooms: [{ x: 5, y: 5, w: 15, h: 15 }],
      monsters: [m],
      items: [], traps: [],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    monsterAI(m, dg, pl, [], { moveOnly: true });
    expect(m.x).toBe(10);
    expect(m.y).toBe(10);
  });

  it("同マスに4ターン停滞したら空きマスへ動く", () => {
    const map = openMap();
    /* 目標方向を塞ぎ、周囲は開いている */
    const wallMon = {
      name: "障害", baseKind: "slime",
      x: 12, y: 10, hp: 999, maxHp: 999, atk: 0, def: 99, exp: 1,
      speed: 1, baseSpeed: 1, aware: true, dormant: false, immobileTurns: 999,
      lastPx: 12, lastPy: 10, turnAccum: 0, monLevel: 1, dir: { x: 0, y: 0 },
    };
    const m = {
      name: "フクマル", subtype: "runner", baseKind: "runner",
      x: 10, y: 10, hp: 11, maxHp: 11, atk: 0, def: 0, exp: 50,
      speed: 2, baseSpeed: 2, aware: true, dormant: false, sealed: false,
      lastPx: 20, lastPy: 10, turnAccum: 0, monLevel: 1, dir: { x: 0, y: 0 },
      /* 既に停滞扱いに近づける */
      _idleStuck: 3,
      posHistory: [
        { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 },
        { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 },
      ],
    };
    const pl = makePlayer({ x: 20, y: 10 });
    const dg = makeEmptyDg({
      map,
      rooms: [{ x: 5, y: 5, w: 20, h: 15 }],
      monsters: [m, wallMon],
      items: [], traps: [],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    /* flee が出口へ動く可能性もあるが、少なくとも同マス固定はしない */
    const before = { x: m.x, y: m.y };
    monsterAI(m, dg, pl, [], { moveOnly: true });
    /* _idleStuck が 3→4 で unstick、または flee で移動 */
    expect(m.x !== before.x || m.y !== before.y).toBe(true);
  });
});
