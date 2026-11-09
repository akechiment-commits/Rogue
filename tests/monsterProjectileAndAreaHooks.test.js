import { describe, it, expect } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { kingDustStorm, monsterShootWaterGun } from "../monsters.js";

describe("Monster projectile & area attacks: dustStorm, watergun", () => {
  it("kingDustStorm hitting mushroom triggers counter spore, wakes dormant, and clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const king = {
      id: "king1",
      name: "デザートキング",
      x: 5,
      y: 5,
      atk: 40,
      bodySize: 2,
    };
    const mushroom = {
      id: "mush1",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 6,
      y: 7, // within king's storm radius
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [king, mushroom];

    kingDustStorm(king, dg, p, ml, null, null, null);

    expect(mushroom.hp).toBe(99); // clamped to 1 fixed damage
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("kingDustStorm respects victim barrier", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const king = {
      id: "king2",
      name: "デザートキング",
      x: 5,
      y: 5,
      atk: 40,
      bodySize: 2,
    };
    const barrierMon = {
      id: "bm1",
      name: "ゴーレム",
      x: 6,
      y: 7,
      hp: 50,
      maxHp: 50,
      barrier: 1,
    };
    dg.monsters = [king, barrierMon];

    kingDustStorm(king, dg, p, ml, null, null, null);

    expect(barrierMon.hp).toBe(50);
    expect(barrierMon.barrier).toBe(0);
  });

  it("monsterShootWaterGun hitting mushroom triggers counter spore, wakes dormant, and clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 2 });
    const ml = [];

    const shooter = {
      id: "w1",
      name: "わてり",
      x: 2,
      y: 2,
      atk: 30,
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
      def: 0,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [shooter, mushroom];

    monsterShootWaterGun(shooter, dg, p, ml);

    expect(mushroom.hp).toBe(49);
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("monsterShootWaterGun respects victim barrier", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 2 });
    const ml = [];

    const shooter = {
      id: "w2",
      name: "わてり",
      x: 2,
      y: 2,
      atk: 30,
    };
    const defender = {
      id: "def1",
      name: "ゴーレム",
      x: 4,
      y: 2,
      hp: 80,
      maxHp: 80,
      barrier: 1,
    };
    dg.monsters = [shooter, defender];

    monsterShootWaterGun(shooter, dg, p, ml);

    expect(defender.hp).toBe(80);
    expect(defender.barrier).toBe(0);
  });
});
