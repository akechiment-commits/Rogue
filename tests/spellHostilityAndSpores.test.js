import { describe, it, expect } from "vitest";
import { applySpellEffect, castSpellBolt } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import "../monsters.js"; // registers monster runtime

describe("Spell NPC Hostility and Mushroom Spores", () => {
  it("earthquake_magic damages mushroom monster, triggers counter spores, and angers shopkeeper", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];

    const mushroom = {
      id: "mush1",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 3,
      y: 2,
      hp: 50,
      maxHp: 50,
      def: 2,
      dormant: true,
    };
    const shopkeeper = {
      id: "shop1",
      name: "店主",
      type: "shopkeeper",
      x: 4,
      y: 2,
      hp: 200,
      maxHp: 200,
      def: 10,
      state: "neutral",
    };
    dg.monsters = [mushroom, shopkeeper];

    applySpellEffect("earthquake_magic", "self", null, 0, 0, dg, p, ml, () => {}, 1);

    expect(mushroom.hp).toBeLessThan(50);
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);

    expect(shopkeeper.hp).toBeLessThan(200);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("lightning_magic damages mushroom monster, triggers spores, and angers shopkeeper", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    dg.visible = Array.from({ length: 20 }, () => Array(40).fill(true));
    const ml = [];

    const mushroom = {
      id: "mush2",
      name: "ドクツルタケ",
      baseKind: "mushroom",
      monLevel: 2,
      x: 3,
      y: 2,
      hp: 60,
      maxHp: 60,
      def: 2,
      dormant: true,
    };
    const shopkeeper = {
      id: "shop2",
      name: "店主",
      type: "shopkeeper",
      x: 4,
      y: 2,
      hp: 200,
      maxHp: 200,
      def: 10,
      state: "neutral",
    };
    dg.monsters = [mushroom, shopkeeper];

    applySpellEffect("lightning_magic", "self", null, 0, 0, dg, p, ml, () => {}, 1);

    expect(mushroom.hp).toBeLessThan(60);
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("睡眠胞子を撒き散らした"))).toBe(true);

    expect(shopkeeper.hp).toBeLessThan(200);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("fire_bolt and ice_bolt and drain_hp trigger mushroom spores and anger shopkeeper", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });

    // Fire bolt on mushroom
    const ml1 = [];
    const mush1 = { id: "m1", name: "キノコ", baseKind: "mushroom", monLevel: 1, x: 3, y: 2, hp: 100, maxHp: 100 };
    applySpellEffect("fire_bolt", "monster", mush1, 1, 0, dg, p, ml1, () => {}, 1);
    expect(mush1.hp).toBeLessThan(100);
    expect(ml1.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);

    // Ice bolt on shopkeeper
    const ml2 = [];
    const shop1 = { id: "s1", name: "店主", type: "shopkeeper", x: 3, y: 2, hp: 200, maxHp: 200, state: "neutral" };
    applySpellEffect("ice_bolt", "monster", shop1, 1, 0, dg, p, ml2, () => {}, 1);
    expect(shop1.hp).toBeLessThan(200);
    expect(shop1.state).toBe("hostile");
    expect(ml2.some(m => m.includes("店主が怒った！"))).toBe(true);

    // Drain HP on shopkeeper
    const ml3 = [];
    const shop2 = { id: "s2", name: "店主", type: "shopkeeper", x: 3, y: 2, hp: 200, maxHp: 200, state: "neutral" };
    applySpellEffect("drain_hp", "monster", shop2, 1, 0, dg, p, ml3, () => {}, 1);
    expect(shop2.hp).toBeLessThan(200);
    expect(shop2.state).toBe("hostile");
    expect(ml3.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("status spells anger shopkeeper", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });

    for (const spellEff of ["sleep_bolt", "poison_bolt", "paralyze_magic", "teleport_other"]) {
      const ml = [];
      const shop = { id: "s_" + spellEff, name: "店主", type: "shopkeeper", x: 3, y: 2, hp: 200, maxHp: 200, state: "neutral" };
      applySpellEffect(spellEff, "monster", shop, 1, 0, dg, p, ml, () => {}, 1);
      expect(shop.state).toBe("hostile");
      expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
    }
  });

  it("castSpellBolt angers shopkeeper even if spell is reflected", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];
    const shop = {
      id: "s_reflect",
      name: "店主",
      type: "shopkeeper",
      x: 3,
      y: 2,
      hp: 200,
      maxHp: 200,
      state: "neutral",
      magicReflect: true,
    };
    dg.monsters = [shop];

    castSpellBolt(p, dg, { effect: "fire_bolt", range: 8 }, 1, 0, ml, () => {}, 1);
    expect(shop.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });
});
