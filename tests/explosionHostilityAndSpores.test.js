import { describe, it, expect } from "vitest";
import { doExplosion } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import "../monsters.js"; // registers monster runtime

describe("Explosion NPC Hostility and Mushroom Spores", () => {
  it("player explosion damages shopkeeper and angers them", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];

    const shopkeeper = {
      id: "shop1",
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

    doExplosion(3, 2, dg, p, ml, null, "爆発", null, () => {}, false, false, false, false, {
      projectileAtk: 10,
    });

    expect(shopkeeper.hp).toBeLessThan(200);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("killerMon explosion damages shopkeeper and triggers retaliation", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const killer = {
      id: "demon1",
      name: "爆弾魔",
      x: 5,
      y: 2,
      hp: 50,
      maxHp: 50,
    };
    const shopkeeper = {
      id: "shop2",
      name: "店主",
      type: "shopkeeper",
      x: 3,
      y: 2,
      hp: 200,
      maxHp: 200,
      def: 5,
      state: "neutral",
    };
    dg.monsters = [killer, shopkeeper];

    doExplosion(3, 2, dg, p, ml, null, "爆発", null, () => {}, false, false, false, false, {
      killerMon: killer,
      projectileAtk: 10,
    });

    expect(shopkeeper.hp).toBeLessThan(200);
    expect(shopkeeper._npcRetaliationTargetId).toBe("demon1");
    expect(ml.some(m => m.includes("店主が爆弾魔に怒った！"))).toBe(true);
  });

  it("explosion damages mushroom monster and triggers counter spores", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const mushroom = {
      id: "mush1",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 2,
    };
    dg.monsters = [mushroom];

    doExplosion(3, 2, dg, p, ml, null, "爆発", null, () => {}, false, false, false, false, {
      projectileAtk: 10,
    });

    expect(mushroom.hp).toBeLessThan(100);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("shopkeeper with barrier consumes barrier on explosion and gets angry", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const shopkeeper = {
      id: "shop3",
      name: "店主",
      type: "shopkeeper",
      x: 3,
      y: 2,
      hp: 200,
      maxHp: 200,
      def: 5,
      state: "neutral",
      barrier: 1,
    };
    dg.monsters = [shopkeeper];

    doExplosion(3, 2, dg, p, ml, null, "爆発", null, () => {}, false, false, false, false, {
      projectileAtk: 10,
    });

    expect(shopkeeper.hp).toBe(200);
    expect(shopkeeper.barrier).toBe(0);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("doGunpowderExplosion angers shopkeeper when triggered by player", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const shopkeeper = {
      id: "shop_gp",
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

    doExplosion(3, 2, dg, p, ml, null, "火薬壺", null, () => {}, false, false, false, false, {
      sourceIsPlayer: true,
    });

    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });
});
