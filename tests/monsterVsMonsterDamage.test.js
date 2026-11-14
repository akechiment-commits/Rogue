import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { monsterAI } from "../monsters.js";

beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());

describe("Monster vs Monster combat: spore, dormant, paralysis, fixed damage", () => {
  it("clone attack against mushroom triggers counter spore, wakes dormant, and clamps physical damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];

    const clone = {
      id: "clone1",
      name: "分身",
      isPlayerClone: true,
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      atk: 50,
      speed: 1,
      turnAttacks: 0,
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
    dg.monsters = [clone, mushroom];

    monsterAI(clone, dg, p, ml, { attackOnly: true });

    expect(mushroom.hp).toBe(99); // clamped to 1 fixed damage
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("retaliating shopkeeper attacking mushroom triggers counter spore, wakes dormant, clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const shopkeeper = {
      id: "shop1",
      name: "店主",
      type: "shopkeeper",
      state: "hostile",
      _npcRetaliationTargetId: "mush2",
      x: 3,
      y: 2,
      hp: 200,
      maxHp: 200,
      atk: 100,
      speed: 1,
      turnAttacks: 0,
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
    dg.monsters = [shopkeeper, mushroom];

    monsterAI(shopkeeper, dg, p, ml, { attackOnly: true });

    expect(mushroom.hp).toBe(49); // clamped to 1 fixed damage
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("clone attack respects enemy barrier", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];

    const clone = {
      id: "clone2",
      name: "分身",
      isPlayerClone: true,
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      atk: 50,
      speed: 1,
      turnAttacks: 0,
    };
    const target = {
      id: "t1",
      name: "ゴーレム",
      x: 4,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 5,
      barrier: 1,
    };
    dg.monsters = [clone, target];

    monsterAI(clone, dg, p, ml, { attackOnly: true });

    expect(target.hp).toBe(100);
    expect(target.barrier).toBe(0);
  });
});
