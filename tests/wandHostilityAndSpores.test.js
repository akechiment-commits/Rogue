import { describe, expect, it } from "vitest";
import { applyWandEffect, triggerWandBreakEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import "../monsters.js"; // registers monster runtime

describe("wand NPC hostility and mushroom counter spore", () => {
  it("プレイヤーの杖（雷）のダメージで店主が敵対化する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const shopkeeper = {
      id: "shopkeeper1",
      type: "shopkeeper",
      name: "店主",
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 0,
      state: "neutral",
    };
    dg.monsters = [shopkeeper];
    const ml = [];

    applyWandEffect("lightning", "monster", shopkeeper, 1, 0, dg, p, ml, null, null, 1, null, 0, null, null, true);

    expect(shopkeeper.hp).toBeLessThan(100);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("敵モンスターの杖（雷）のダメージで店主がその敵に報復する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    const enemy = { id: "mage1", name: "風魔道士", x: 1, y: 2, hp: 50, maxHp: 50 };
    const shopkeeper = {
      id: "shopkeeper2",
      type: "shopkeeper",
      name: "店主",
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 0,
      state: "neutral",
    };
    dg.monsters = [enemy, shopkeeper];
    const ml = [];

    applyWandEffect("lightning", "monster", shopkeeper, 1, 0, dg, p, ml, null, null, 1, null, 0, enemy, null, false);

    expect(shopkeeper.hp).toBeLessThan(100);
    expect(shopkeeper._npcRetaliationTargetId).toBe(enemy.id);
  });

  it("杖ダメージでキノコモンスターのカウンター胞子が発動する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 1, y: 1 });
    const mushroom = {
      id: "shroom1",
      name: "毒キノコ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 2,
      y: 2,
      hp: 50,
      maxHp: 50,
      def: 0,
    };
    dg.monsters = [mushroom];
    const ml = [];

    applyWandEffect("fire_wand", "monster", mushroom, 1, 0, dg, p, ml, null, null, 1, null, 0, null, null, true);

    expect(mushroom.hp).toBeLessThan(50);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("プレイヤーの杖の自壊爆発で店主が敵対化する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const shopkeeper = {
      id: "shopkeeper3",
      type: "shopkeeper",
      name: "店主",
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 0,
      state: "neutral",
    };
    dg.monsters = [shopkeeper];
    const wand = { id: "wand1", name: "穴掘りの杖", type: "wand", effect: "dig", charges: 1 };
    const ml = [];

    triggerWandBreakEffect(wand, shopkeeper.x, shopkeeper.y, dg, p, ml, null, { sourceIsPlayer: true });

    expect(shopkeeper.hp).toBeLessThan(100);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("杖の状態異常（鈍足・睡眠等）でも店主が敵対化する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const shopkeeper = {
      id: "shopkeeper4",
      type: "shopkeeper",
      name: "店主",
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 0,
      state: "neutral",
    };
    dg.monsters = [shopkeeper];
    const ml = [];

    applyWandEffect("slow", "monster", shopkeeper, 1, 0, dg, p, ml, null, null, 1, null, 0, null, null, true);

    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });
});
