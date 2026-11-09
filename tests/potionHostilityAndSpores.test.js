import { describe, it, expect } from "vitest";
import { applyPotionEffect, splashPotion } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import "../monsters.js"; // registers monster runtime

describe("Potion NPC Hostility and Mushroom Spores", () => {
  it("fire potion splash on mushroom triggers counter spores", () => {
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
      hp: 100,
      maxHp: 100,
      def: 2,
    };
    dg.monsters = [mushroom];

    applyPotionEffect("fire", 50, "monster", mushroom, dg, p, ml, () => {});

    expect(mushroom.hp).toBeLessThan(100);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("fire potion splash on shopkeeper angers shopkeeper when thrown by player", () => {
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
      state: "neutral",
    };
    dg.monsters = [shopkeeper];

    applyPotionEffect("fire", 50, "monster", shopkeeper, dg, p, ml, () => {});

    expect(shopkeeper.hp).toBeLessThan(200);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("potion splash on shopkeeper triggers retaliation against killerMon", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];

    const killer = {
      id: "orc1",
      name: "オーク",
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
      state: "neutral",
    };
    dg.monsters = [killer, shopkeeper];

    applyPotionEffect("poison", 20, "monster", shopkeeper, dg, p, ml, () => {}, false, false, killer);

    expect(shopkeeper.hp).toBeLessThan(200);
    expect(shopkeeper._npcRetaliationTargetId).toBe("orc1");
    expect(ml.some(m => m.includes("店主がオークに怒った！"))).toBe(true);
  });

  it("harmful status potions (sleep, slow, confuse) anger shopkeeper without dealing HP damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });

    for (const eff of ["sleep", "slow", "confuse", "darkness", "bewitch", "seal", "paralyze"]) {
      const ml = [];
      const shopkeeper = {
        id: "shop_" + eff,
        name: "店主",
        type: "shopkeeper",
        x: 3,
        y: 2,
        hp: 200,
        maxHp: 200,
        state: "neutral",
      };
      dg.monsters = [shopkeeper];

      applyPotionEffect(eff, 10, "monster", shopkeeper, dg, p, ml, () => {});

      expect(shopkeeper.state).toBe("hostile");
      expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
    }
  });

  it("positive potion (normal heal) does not anger shopkeeper", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];

    const shopkeeper = {
      id: "shop_heal",
      name: "店主",
      type: "shopkeeper",
      x: 3,
      y: 2,
      hp: 150,
      maxHp: 200,
      state: "neutral",
    };
    dg.monsters = [shopkeeper];

    applyPotionEffect("heal", 50, "monster", shopkeeper, dg, p, ml, () => {});

    expect(shopkeeper.hp).toBe(200);
    expect(shopkeeper.state).toBe("neutral");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(false);
  });
});
