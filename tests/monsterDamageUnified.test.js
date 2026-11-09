import { describe, it, expect } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { applyDamageToMonster } from "../monsterDamage.js";
import "../monsters.js"; // register runtime

describe("Unified monster damage helper: applyDamageToMonster", () => {
  it("consumes barrier without applying HP damage and notifies hostility", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 1, y: 1 });
    const ml = [];

    const shopkeeper = {
      id: "shop1",
      name: "店主",
      type: "shopkeeper",
      state: "friendly",
      x: 3,
      y: 3,
      hp: 100,
      maxHp: 100,
      barrier: 1,
    };
    dg.monsters = [shopkeeper];

    const res = applyDamageToMonster(shopkeeper, 50, {
      dungeon: dg,
      player: p,
      messages: ml,
      sourceIsPlayer: true,
    });

    expect(res.blocked).toBe(true);
    expect(res.damage).toBe(0);
    expect(shopkeeper.hp).toBe(100);
    expect(shopkeeper.barrier).toBe(0);
    expect(shopkeeper.state).toBe("hostile");
  });

  it("clamps physical damage for fixedDamageOnly targets and wakes dormant", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 1, y: 1 });
    const ml = [];

    const slime = {
      id: "slime1",
      name: "水晶スライム",
      x: 2,
      y: 2,
      hp: 50,
      maxHp: 50,
      fixedDamageOnly: true,
      dormant: true,
    };
    dg.monsters = [slime];

    const res = applyDamageToMonster(slime, 40, {
      isPhysical: true,
      dungeon: dg,
      player: p,
      messages: ml,
    });

    expect(res.blocked).toBe(false);
    expect(res.damage).toBe(1);
    expect(slime.hp).toBe(49);
    expect(slime.dormant).toBe(false);
  });

  it("does not clamp non-physical damage for fixedDamageOnly targets", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 1, y: 1 });
    const ml = [];

    const slime = {
      id: "slime2",
      name: "水晶スライム",
      x: 2,
      y: 2,
      hp: 50,
      maxHp: 50,
      fixedDamageOnly: true,
    };
    dg.monsters = [slime];

    const res = applyDamageToMonster(slime, 25, {
      isPhysical: false,
      dungeon: dg,
      player: p,
      messages: ml,
    });

    expect(res.damage).toBe(25);
    expect(slime.hp).toBe(25);
  });

  it("clears paralysis and triggers mushroom counter spores on damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 1, y: 1 });
    const ml = [];

    const mushroom = {
      id: "mush1",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 3,
      y: 3,
      hp: 50,
      maxHp: 50,
      paralyzed: true,
      paralyzeTurns: 3,
    };
    dg.monsters = [mushroom];

    const res = applyDamageToMonster(mushroom, 10, {
      dungeon: dg,
      player: p,
      messages: ml,
      sourceIsPlayer: true,
    });

    expect(res.damage).toBe(10);
    expect(mushroom.hp).toBe(40);
    expect(mushroom.paralyzed).toBe(false);
    expect(mushroom.paralyzeTurns).toBe(0);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("triggers NPC retaliation when attacked by another monster", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const attacker = {
      id: "atk1",
      name: "ゴブリン",
      x: 2,
      y: 3,
      hp: 30,
      maxHp: 30,
    };
    const shopkeeper = {
      id: "shop2",
      name: "店主",
      type: "shopkeeper",
      state: "friendly",
      x: 3,
      y: 3,
      hp: 100,
      maxHp: 100,
    };
    dg.monsters = [attacker, shopkeeper];

    const res = applyDamageToMonster(shopkeeper, 15, {
      attacker,
      dungeon: dg,
      player: p,
      messages: ml,
      sourceIsPlayer: false,
    });

    expect(res.damage).toBe(15);
    expect(shopkeeper.hp).toBe(85);
    expect(shopkeeper._npcRetaliationTargetId).toBe("atk1");
    expect(ml.some(m => m.includes("店主がゴブリンに怒った！"))).toBe(true);
  });

  it("calls killMonster when damage reduces HP to zero or below", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 1, y: 1 });
    const ml = [];

    const target = {
      id: "mon1",
      name: "コボルド",
      x: 2,
      y: 2,
      hp: 10,
      maxHp: 10,
    };
    dg.monsters = [target];

    const res = applyDamageToMonster(target, 20, {
      dungeon: dg,
      player: p,
      messages: ml,
      sourceIsPlayer: true,
      killIfDead: true,
    });

    expect(res.killed).toBe(true);
    expect(target.hp).toBeLessThanOrEqual(0);
    expect(dg.monsters.includes(target)).toBe(false);
  });
});
