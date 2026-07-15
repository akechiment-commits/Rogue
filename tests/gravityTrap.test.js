import { describe, it, expect } from "vitest";
import { monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

describe("重力の魔方陣と敵の罠踏み", () => {
  it("未覚醒パトロールでも重力下では罠を踏む", () => {
    const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
    /* 部屋 (2,2)-(12,12) */
    const rooms = [{ x: 2, y: 2, w: 11, h: 11 }];
    const trap = {
      name: "矢の罠", effect: "arrow", tile: 26, id: "t1",
      x: 6, y: 5, revealed: false,
    };
    const mon = {
      name: "スライム", hp: 20, maxHp: 20, atk: 3, def: 0, exp: 1,
      x: 5, y: 5, speed: 1, baseSpeed: 1, turnAccum: 0,
      aware: false, dormant: false, float: false,
      dir: { x: 1, y: 0 }, lastPx: 5, lastPy: 5,
      patrolTarget: { x: 10, y: 5 }, monLevel: 1,
    };
    const dg = makeEmptyDg({
      map, rooms, monsters: [mon], traps: [trap],
      items: [], pentacles: [{
        kind: "gravity", name: "重力の魔方陣",
        x: 4, y: 4, blessed: false, cursed: false, id: "g1",
      }],
    });
    const pl = makePlayer({ x: 20, y: 20 }); /* 別の場所＝見えていない */
    const ml = [];
    monsterAI(mon, dg, pl, ml, { luFn: () => {} });
    expect(mon.x).toBe(6);
    expect(mon.y).toBe(5);
    expect(ml.some(m => m.includes("重力の力") && m.includes("踏んだ"))).toBe(true);
  });

  it("重力なしでは敵は罠を踏まない", () => {
    const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
    const rooms = [{ x: 2, y: 2, w: 11, h: 11 }];
    const trap = {
      name: "矢の罠", effect: "arrow", tile: 26, id: "t1",
      x: 6, y: 5, revealed: false,
    };
    const mon = {
      name: "スライム", hp: 20, maxHp: 20, atk: 3, def: 0, exp: 1,
      x: 5, y: 5, speed: 1, baseSpeed: 1, turnAccum: 0,
      aware: false, dormant: false, float: false,
      dir: { x: 1, y: 0 }, lastPx: 5, lastPy: 5,
      patrolTarget: { x: 10, y: 5 }, monLevel: 1,
    };
    const dg = makeEmptyDg({
      map, rooms, monsters: [mon], traps: [trap],
      items: [], pentacles: [],
    });
    const pl = makePlayer({ x: 20, y: 20 });
    const ml = [];
    monsterAI(mon, dg, pl, ml, { luFn: () => {} });
    expect(mon.x).toBe(6);
    expect(ml.some(m => m.includes("踏んだ"))).toBe(false);
  });
});
