import { describe, it, expect } from "vitest";
import { shootArrow, applyThrownItemToMonster, reflectMagicStoneToPlayer } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import "../monsters.js"; // registers monster runtime

describe("Arrow and Thrown Item NPC Hostility", () => {
  it("shootArrow hits shopkeeper and angers them", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2, inventory: [{ id: "a1", type: "arrow", count: 5, atk: 6, name: "木の矢" }] });
    const ml = [];

    const shopkeeper = {
      id: "shop1",
      name: "店主",
      type: "shopkeeper",
      x: 4,
      y: 2,
      hp: 200,
      maxHp: 200,
      def: 5,
      state: "neutral",
    };
    dg.monsters = [shopkeeper];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});

    expect(shopkeeper.hp).toBeLessThan(200);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("shootArrow hits shopkeeper with barrier, consumes barrier and angers them", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2, inventory: [{ id: "a2", type: "arrow", count: 5, atk: 6, name: "木の矢" }] });
    const ml = [];

    const shopkeeper = {
      id: "shop2",
      name: "店主",
      type: "shopkeeper",
      x: 4,
      y: 2,
      hp: 200,
      maxHp: 200,
      def: 5,
      state: "neutral",
      barrier: 1,
    };
    dg.monsters = [shopkeeper];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});

    expect(shopkeeper.hp).toBe(200);
    expect(shopkeeper.barrier || 0).toBe(0);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("shootArrow reflected by shopkeeper angers them", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2, inventory: [{ id: "a3", type: "arrow", count: 5, atk: 6, name: "木の矢" }] });
    const ml = [];

    const shopkeeper = {
      id: "shop3",
      name: "店主",
      type: "shopkeeper",
      x: 4,
      y: 2,
      hp: 200,
      maxHp: 200,
      def: 5,
      state: "neutral",
      subtype: "reflector",
    };
    dg.monsters = [shopkeeper];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});

    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("applyThrownItemToMonster angers shopkeeper when thrown by player", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];

    const shopkeeper = {
      id: "shop4",
      name: "店主",
      type: "shopkeeper",
      x: 3,
      y: 2,
      hp: 200,
      maxHp: 200,
      def: 5,
      state: "neutral",
    };
    dg.monsters = [shopkeeper];

    const stone = { id: "st1", type: "stone", name: "石", atk: 5 };
    applyThrownItemToMonster(stone, shopkeeper, dg, p, ml, () => {});

    expect(shopkeeper.hp).toBeLessThan(200);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("applyThrownItemToMonster triggers retaliation when thrown by enemy monster", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];

    const enemy = {
      id: "orc1",
      name: "オーク",
      x: 5,
      y: 2,
      hp: 50,
      maxHp: 50,
    };
    const shopkeeper = {
      id: "shop5",
      name: "店主",
      type: "shopkeeper",
      x: 3,
      y: 2,
      hp: 200,
      maxHp: 200,
      def: 5,
      state: "neutral",
    };
    dg.monsters = [enemy, shopkeeper];

    const stone = { id: "st2", type: "stone", name: "石", atk: 5 };
    applyThrownItemToMonster(stone, shopkeeper, dg, p, ml, () => {}, { killerMon: enemy });

    expect(shopkeeper.hp).toBeLessThan(200);
    expect(shopkeeper._npcRetaliationTargetId).toBe("orc1");
    expect(ml.some(m => m.includes("店主がオークに怒った！"))).toBe(true);
  });

  it("reflectMagicStoneToPlayer angers shopkeeper reflector", () => {
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];

    const shopkeeper = {
      id: "shop6",
      name: "店主",
      type: "shopkeeper",
      x: 3,
      y: 2,
      hp: 200,
      maxHp: 200,
      state: "neutral",
      subtype: "reflector",
    };

    reflectMagicStoneToPlayer(p, shopkeeper, "魔法の石", 5, ml);

    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });
});
