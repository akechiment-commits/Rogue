import { describe, it, expect, vi } from "vitest";
import { monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T, hasGravityPentacle } from "../utils.js";
import { fireTrapPlayer } from "../traps.js";

describe("重力の魔方陣と敵の罠踏み", () => {
  it("未覚醒パトロールでも重力下では罠を踏む", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
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
    try {
      monsterAI(mon, dg, pl, ml, { luFn: () => {} });
      expect(mon.x).toBe(6);
      expect(mon.y).toBe(5);
      expect(ml.some(m => m.includes("重力の力") && m.includes("踏んだ"))).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  it("重力なしでは敵は罠を踏まない", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
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
    try {
      monsterAI(mon, dg, pl, ml, { luFn: () => {} });
      expect(mon.x).toBe(6);
      expect(ml.some(m => m.includes("踏んだ"))).toBe(false);
    } finally {
      random.mockRestore();
    }
  });

  it("重力下の既知罠は checkTrap だけで1回作動する（ダッシュ二重発動防止）", () => {
    /* ダッシュは checkTrap のあと「既知罠」ブロックへ進む。
     * checkTrap は重力下で既知罠も fireTrapPlayer するため、
     * 既知罠ブロックで再 fire すると二重発動になる。再 fire しないことを契約として固定する。 */
    const map = Array.from({ length: 10 }, () => Array(10).fill(T.FLOOR));
    const trap = {
      name: "鈍足の罠", effect: "slow_trap", tile: 26, id: "t1",
      x: 3, y: 3, revealed: true,
    };
    const dg = makeEmptyDg({
      map,
      rooms: [{ x: 1, y: 1, w: 6, h: 6 }],
      monsters: [],
      traps: [trap],
      items: [],
      pentacles: [{ kind: "gravity", name: "重力の魔方陣", x: 3, y: 3 }],
    });
    const pl = makePlayer({ x: 3, y: 3 });
    expect(hasGravityPentacle(dg, 3, 3)).toBe(true);
    const ml = [];
    fireTrapPlayer(trap, pl, dg, ml);
    expect(ml.filter((m) => String(m).includes("発動")).length).toBe(1);
  });

  it("罠を作動させる重力の力は床アイテムにならない", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
    const mon = {
      name: "スライム", hp: 20, maxHp: 20, atk: 3, def: 0, exp: 1,
      x: 5, y: 5, speed: 1, baseSpeed: 1, turnAccum: 0,
      aware: false, dormant: false, float: false,
      dir: { x: 1, y: 0 }, lastPx: 5, lastPy: 5,
      patrolTarget: { x: 10, y: 5 }, monLevel: 1,
    };
    const dg = makeEmptyDg({
      map,
      rooms: [{ x: 2, y: 2, w: 11, h: 11 }],
      monsters: [mon],
      traps: [{ name: "回転板", effect: "spin", id: "spin", x: 6, y: 5 }],
      items: [],
      pentacles: [{ kind: "gravity", name: "重力の魔方陣", x: 4, y: 4 }],
    });

    try {
      monsterAI(mon, dg, makePlayer({ x: 20, y: 20 }), [], { luFn: () => {} });
      expect(dg.items.some((item) => item.name === "重力の力")).toBe(false);
    } finally {
      random.mockRestore();
    }
  });
});
