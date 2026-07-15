import { describe, it, expect } from "vitest";
import { monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function makePainter(x, y) {
  return {
    name: "ラクガキ魔", subtype: "pentaclePainter", baseKind: "rakugakima",
    x, y, hp: 22, maxHp: 22, atk: 9, def: 3, exp: 36,
    speed: 1, baseSpeed: 1, aware: true, dormant: false, sealed: false,
    lastPx: x, lastPy: y, turnAccum: 0, monLevel: 1, dir: { x: 0, y: 0 },
    turnAttacks: 0, maxAttacks: 1, _pentacleDrawReady: true,
  };
}

describe("ラクガキ魔の魔方陣描画", () => {
  it("空の床では描ける", () => {
    const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
    const m = makePainter(5, 5);
    const pl = makePlayer({ x: 7, y: 5 });
    const rooms = [{ x: 2, y: 2, w: 12, h: 12 }];
    const dg = makeEmptyDg({
      map, rooms, monsters: [m], items: [], traps: [], pentacles: [],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    const ml = [];
    monsterAI(m, dg, pl, ml, {});
    expect(dg.pentacles.length).toBe(1);
    expect(ml.some(msg => msg.includes("を描いた"))).toBe(true);
  });

  it("階段の上でも書こうとして失敗し、行動を消費する", () => {
    const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
    map[5][5] = T.SD;
    const m = makePainter(5, 5);
    const pl = makePlayer({ x: 6, y: 5 }); /* 隣接：失敗後に攻撃へ落ちないこと */
    const rooms = [{ x: 2, y: 2, w: 12, h: 12 }];
    const dg = makeEmptyDg({
      map, rooms, monsters: [m], items: [], traps: [], pentacles: [],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    const ml = [];
    monsterAI(m, dg, pl, ml, {});
    expect(dg.pentacles.length).toBe(0);
    expect(ml.some(msg => msg.includes("失敗"))).toBe(true);
    expect(m.turnAttacks).toBe(1);
    expect(ml.some(msg => msg.includes("攻撃"))).toBe(false);
  });

  it("アイテムの上でも書こうとして失敗する（無駄行動）", () => {
    const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
    const m = makePainter(5, 5);
    const pl = makePlayer({ x: 7, y: 5 });
    const rooms = [{ x: 2, y: 2, w: 12, h: 12 }];
    const dg = makeEmptyDg({
      map, rooms, monsters: [m],
      items: [{ name: "矢", type: "arrow", id: "a1", x: 5, y: 5, tile: 21 }],
      traps: [], pentacles: [],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    const ml = [];
    monsterAI(m, dg, pl, ml, {});
    expect(dg.pentacles.length).toBe(0);
    expect(ml.some(msg => msg.includes("失敗"))).toBe(true);
    expect(m.turnAttacks).toBe(1);
  });

  it("足元に物があっても描画予約は同じように立つ", () => {
    const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
    map[5][5] = T.SD;
    const m = makePainter(5, 5);
    delete m._pentacleDrawReady;
    const pl = makePlayer({ x: 8, y: 5 });
    const rooms = [{ x: 2, y: 2, w: 12, h: 12 }];
    const dg = makeEmptyDg({
      map, rooms, monsters: [m], items: [], traps: [], pentacles: [],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    /* moveOnly で予約抽選を何度か試す */
    let reserved = false;
    for (let i = 0; i < 80; i++) {
      m._pentacleDrawReady = false;
      m.turnAttacks = 0;
      monsterAI(m, dg, pl, [], { moveOnly: true });
      if (m._pentacleDrawReady) { reserved = true; break; }
    }
    expect(reserved).toBe(true);
  });
});
