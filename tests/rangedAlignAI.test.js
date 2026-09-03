import { describe, it, expect } from "vitest";
import { monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function openBattlefield(monster) {
  const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
  return makeEmptyDg({
    map,
    rooms: [{ x: 1, y: 1, w: 20, h: 14 }],
    monsters: [monster],
    visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
  });
}

function makeRanged(subtype, x, y) {
  return {
    name: subtype,
    subtype,
    baseKind: subtype,
    x, y,
    hp: 30, maxHp: 30, atk: 10, def: 3, exp: 10,
    speed: 1, baseSpeed: 1,
    aware: true, lastPx: 10, lastPy: 5,
    turnAccum: 0, turnAttacks: 0, monLevel: 1,
    sealed: false, dir: { x: 0, y: 0 },
  };
}

describe("遠距離敵の移動", () => {
  it("アーチャーは射線合わせせずプレイヤーへ近づく", () => {
    const m = makeRanged("archer", 6, 8);
    const pl = makePlayer({ x: 10, y: 5 });
    const dg = openBattlefield(m);
    const before = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
    monsterAI(m, dg, pl, [], { moveOnly: true });
    const after = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
    expect(after).toBeLessThan(before);
    expect({ x: m.x, y: m.y }).toEqual({ x: 7, y: 7 });
  });

  it("杖使いも射線合わせせずプレイヤーへ近づく", () => {
    const m = makeRanged("wanduser", 6, 8);
    m.wandEffect = "lightning";
    const pl = makePlayer({ x: 10, y: 5 });
    const dg = openBattlefield(m);
    monsterAI(m, dg, pl, [], { moveOnly: true });
    expect({ x: m.x, y: m.y }).toEqual({ x: 7, y: 7 });
  });

  it("わてりは水上で射線合わせを優先する", () => {
    const m = makeRanged("watergunner", 6, 8);
    m.waterOnly = true;
    m.baseKind = "wateri";
    const pl = makePlayer({ x: 10, y: 5 });
    const dg = openBattlefield(m);
    for (let y = 5; y <= 10; y++) {
      for (let x = 4; x <= 10; x++) dg.map[y][x] = T.WATER;
    }
    monsterAI(m, dg, pl, [], { moveOnly: true });
    const dx = pl.x - m.x, dy = pl.y - m.y;
    expect(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)).toBe(true);
    expect({ x: m.x, y: m.y }).not.toEqual({ x: 7, y: 7 });
  });

  it("シオンは距離2を保とうとする", () => {
    const m = {
      name: "シオン・ザ・ダークブレット",
      subtype: null,
      baseKind: "boss_darkbullet",
      x: 10, y: 5,
      hp: 300, maxHp: 300, atk: 35, def: 23, exp: 1200,
      speed: 1, baseSpeed: 1,
      aware: true, lastPx: 10, lastPy: 6,
      turnAccum: 0, turnAttacks: 0, monLevel: 1,
      sealed: false, dir: { x: 0, y: 0 }, isBoss: true,
    };
    const pl = makePlayer({ x: 10, y: 6 });
    const dg = openBattlefield(m);
    monsterAI(m, dg, pl, [], { moveOnly: true });
    const dist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
    expect(dist).toBeGreaterThan(1);
  });
});
