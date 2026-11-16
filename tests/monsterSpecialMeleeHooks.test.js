import { describe, it, expect } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { monsterAI } from "../monsters.js";
import { T } from "../utils.js";

describe("Monster special melee & rush attacks: charger, berserker, decoy clashes", () => {
  it("charger rush hitting mushroom triggers counter spore, wakes dormant, clamps fixed damage", () => {
    const dg = makeEmptyDg();
    dg.rooms = [{ x: 1, y: 1, w: 20, h: 10 }];
    const p = makePlayer({ x: 5, y: 2 });
    const ml = [];

    const charger = {
      id: "chg1",
      name: "突進猪",
      subtype: "charger",
      x: 2,
      y: 2,
      atk: 50,
      monLevel: 1,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      _rangedAttackThisTurn: true,
    };
    const mushroom = {
      id: "mush1",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [charger, mushroom];

    monsterAI(charger, dg, p, ml, { attackOnly: true });

    expect(mushroom.hp).toBe(99); // clamped to 1 fixed damage
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("berserker attacking mushroom triggers counter spore, wakes dormant, clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const berserker = {
      id: "ber1",
      name: "バーサーカー",
      subtype: "berserker",
      x: 3,
      y: 3,
      atk: 60,
      monLevel: 1,
      speed: 1,
      turnAttacks: 0,
      aware: true,
    };
    const mushroom = {
      id: "mush2",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 4,
      y: 3,
      hp: 50,
      maxHp: 50,
      def: 0,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [berserker, mushroom];

    monsterAI(berserker, dg, p, ml, { attackOnly: true });

    expect(mushroom.hp).toBe(49); // clamped to 1 fixed damage
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("charger and berserker respect enemy barrier", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const berserker = {
      id: "ber2",
      name: "バーサーカー",
      subtype: "berserker",
      x: 3,
      y: 3,
      atk: 60,
      monLevel: 1,
      speed: 1,
      turnAttacks: 0,
      aware: true,
    };
    const defender = {
      id: "def1",
      name: "ゴーレム",
      x: 4,
      y: 3,
      hp: 100,
      maxHp: 100,
      def: 5,
      barrier: 1,
    };
    dg.monsters = [berserker, defender];

    monsterAI(berserker, dg, p, ml, { attackOnly: true });

    expect(defender.hp).toBe(100);
    expect(defender.barrier).toBe(0);
  });

  it("decoy pentacle contest between monsters triggers counter spore, wakes dormant, clamps fixed damage", () => {
    const dg = makeEmptyDg();
    dg.rooms = [{ x: 1, y: 1, w: 20, h: 10 }];
    dg.pentacles = [{ kind: "decoy", name: "囮の魔方陣", x: 4, y: 4, blessed: true }];
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const monster = {
      id: "mon1",
      name: "オーク",
      x: 4,
      y: 4, // on decoy pentacle
      atk: 50,
      monLevel: 1,
      speed: 1,
      turnAttacks: 0,
      aware: true,
    };
    const mushroom = {
      id: "mush3",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 5,
      y: 4, // adjacent to decoy pentacle
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [monster, mushroom];

    monsterAI(monster, dg, p, ml, { attackOnly: true });

    expect(mushroom.hp).toBe(99);
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("enemy attack against player clone respects clone barrier", () => {
    const dg = makeEmptyDg();
    dg.rooms = [{ x: 1, y: 1, w: 20, h: 10 }];
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const enemy = {
      id: "en1",
      name: "コボルド",
      x: 3,
      y: 3,
      atk: 30,
      speed: 1,
      turnAttacks: 0,
      aware: true,
    };
    const clone = {
      id: "clone1",
      name: "分身",
      isPlayerClone: true,
      x: 4,
      y: 3,
      hp: 50,
      maxHp: 50,
      barrier: 1,
    };
    dg.monsters = [enemy, clone];

    monsterAI(enemy, dg, p, ml, { attackOnly: true });

    expect(clone.hp).toBe(50);
    expect(clone.barrier).toBe(0);
  });

  it("grounded charger stops before water tiles and does not charge onto water", () => {
    const dg = makeEmptyDg();
    dg.rooms = [{ x: 1, y: 1, w: 20, h: 10 }];
    dg.map[5][4] = T.WATER;
    dg.map[5][5] = T.WATER;
    const p = makePlayer({ x: 6, y: 5 });
    const ml = [];

    const charger = {
      id: "chg_water1",
      name: "猪突角獣",
      subtype: "charger",
      x: 2,
      y: 5,
      atk: 50,
      monLevel: 3,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      _rangedAttackThisTurn: true,
    };
    dg.monsters = [charger];

    // (2,5) -> (3,5) で水(4,5)の手前に止まり、水の上には乗らない
    monsterAI(charger, dg, p, ml, { attackOnly: true });
    expect(charger.x).toBe(3);
    expect(charger.y).toBe(5);
    expect(dg.map[charger.y][charger.x]).toBe(T.FLOOR);
    expect(p.hp).toBe(100);

    // 水の縁(3,5)で一直線上にいても、目の前が水なら無駄な突進予約をせず通常移動で迂回する
    charger.turnAttacks = 0;
    charger.alwaysUseSpecial = true;
    monsterAI(charger, dg, p, ml, { moveOnly: true });
    expect(charger._rangedAttackThisTurn).toBeFalsy();
    expect(dg.map[charger.y][charger.x]).not.toBe(T.WATER);
  });

  it("floating charger can rush across water tiles", () => {
    const dg = makeEmptyDg();
    dg.rooms = [{ x: 1, y: 1, w: 20, h: 10 }];
    dg.map[5][4] = T.WATER;
    dg.map[5][5] = T.WATER;
    const p = makePlayer({ x: 6, y: 5 });
    const ml = [];

    const charger = {
      id: "chg_float",
      name: "猪突角獣",
      subtype: "charger",
      x: 3,
      y: 5,
      atk: 50,
      monLevel: 3,
      floatTurns: 5,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      _rangedAttackThisTurn: true,
    };
    dg.monsters = [charger];

    monsterAI(charger, dg, p, ml, { attackOnly: true });
    expect(charger.x).toBe(5);
    expect(charger.y).toBe(5);
    expect(p.hp).toBeLessThan(100);
  });
});
