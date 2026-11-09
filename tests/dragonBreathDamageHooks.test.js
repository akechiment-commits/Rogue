import { describe, it, expect } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { monsterDragonFire, monsterIceBreath } from "../monsters.js";

describe("Dragon breath damage hooks: barrier, spore, dormant, paralysis, fixed damage", () => {
  it("dragon fire breath hitting mushroom triggers counter spore, wakes dormant, and clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 2 });
    const ml = [];

    const dragon = {
      id: "drag1",
      name: "ドラゴン",
      x: 2,
      y: 2,
      atk: 40,
      monLevel: 1,
    };
    const mushroom = {
      id: "mush1",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 4,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [dragon, mushroom];

    monsterDragonFire(dragon, dg, p, ml);

    expect(mushroom.hp).toBe(99); // clamped to 1 fixed damage
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("dragon fire breath respects monster barrier and player barrier", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 2, hp: 50, maxHp: 50, barrier: 1 });
    const ml = [];

    const dragon = {
      id: "drag2",
      name: "ドラゴン",
      x: 2,
      y: 2,
      atk: 40,
      monLevel: 1,
    };
    const barrierMon = {
      id: "bm1",
      name: "ゴーレム",
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      barrier: 1,
    };
    dg.monsters = [dragon, barrierMon];

    // Hits barrierMon first
    monsterDragonFire(dragon, dg, p, ml);
    expect(barrierMon.hp).toBe(100);
    expect(barrierMon.barrier).toBe(0);

    // Now remove barrierMon, fire reaches player
    dg.monsters = [dragon];
    monsterDragonFire(dragon, dg, p, ml);
    expect(p.hp).toBe(50);
    expect(p.barrier).toBe(0);
  });

  it("ice dragon breath hitting mushroom triggers counter spore, wakes dormant, and clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 2 });
    const ml = [];

    const icedragon = {
      id: "icedrag1",
      name: "氷竜",
      x: 2,
      y: 2,
      atk: 40,
      monLevel: 1,
    };
    const mushroom = {
      id: "mush2",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 4,
      y: 2,
      hp: 50,
      maxHp: 50,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [icedragon, mushroom];

    monsterIceBreath(icedragon, dg, p, ml);

    expect(mushroom.hp).toBe(49); // clamped to 1 fixed damage
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("ice dragon breath hitting sleeping/paralyzed player wakes sleep, weakens paralysis, and consumes barrier", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 4, y: 2, hp: 50, maxHp: 50, sleepTurns: 3, paralyzeTurns: 2, barrier: 1 });
    const ml = [];

    const icedragon = {
      id: "icedrag2",
      name: "氷竜",
      x: 2,
      y: 2,
      atk: 40,
      monLevel: 1,
    };
    dg.monsters = [icedragon];

    // Player with barrier consumes barrier without losing HP
    monsterIceBreath(icedragon, dg, p, ml);
    expect(p.hp).toBe(50);
    expect(p.barrier).toBe(0);

    // Next hit without barrier wakes sleep and clears paralysis
    monsterIceBreath(icedragon, dg, p, ml);
    expect(p.hp).toBeLessThan(50);
    expect(p.sleepTurns).toBe(0);
    expect(p.paralyzeTurns).toBe(0);
    expect(ml.some(m => m.includes("寒さで目が覚めた！"))).toBe(true);
    expect(ml.some(m => m.includes("金縛りが解けた！"))).toBe(true);
  });
});
