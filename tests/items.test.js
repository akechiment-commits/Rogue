import { describe, it, expect } from "vitest";
import { getIdentKey, itemPrice, applyPotionEffect, getBlessMultiplier, gemSellPrice, rotFood } from "../items.js";

describe("getIdentKey", () => {
  it("種別ごとに識別キーを返す", () => {
    expect(getIdentKey({ type: "potion", effect: "heal" })).toBe("p:heal");
    expect(getIdentKey({ type: "scroll", effect: "teleport" })).toBe("s:teleport");
    expect(getIdentKey({ type: "scroll", effect: "blank" })).toBeNull();
    expect(getIdentKey({ type: "wand", effect: "sleep" })).toBe("w:sleep");
    expect(getIdentKey({ type: "gold" })).toBeNull();
  });
});

describe("itemPrice", () => {
  it("sellPrice を基準に価格を計算する", () => {
    expect(itemPrice({ type: "potion", effect: "heal", sellPrice: 100 })).toBe(100);
  });

  it("武器は強化値で加算する", () => {
    expect(itemPrice({ type: "weapon", sellPrice: 50, plus: 2 })).toBe(250);
  });

  it("祝福品は価格が上がる", () => {
    expect(itemPrice({ type: "potion", sellPrice: 100, blessed: true })).toBe(110);
  });
});

describe("getBlessMultiplier", () => {
  it("祝福・呪い・通常の倍率を返す", () => {
    expect(getBlessMultiplier({ blessed: true })).toBe(1.5);
    expect(getBlessMultiplier({ cursed: true })).toBe(0.5);
    expect(getBlessMultiplier({})).toBe(1);
    expect(getBlessMultiplier(null)).toBe(1);
  });
});

describe("gemSellPrice", () => {
  it("階層の距離に応じて売値が上がる", () => {
    const gem = { basePrice: 100, originDepth: 5 };
    expect(gemSellPrice(gem, 5)).toBe(100);
    expect(gemSellPrice(gem, 10)).toBe(275);
  });
});

describe("applyPotionEffect", () => {
  const dg = { monsters: [], items: [], pentacles: [] };

  it("回復薬でプレイヤーHPが回復する", () => {
    const p = { hp: 50, maxHp: 100, x: 1, y: 1, inventory: [] };
    const ml = [];
    applyPotionEffect("heal", 30, "player", null, dg, p, ml, () => {});
    expect(p.hp).toBe(80);
    expect(ml.some(m => m.includes("回復"))).toBe(true);
  });

  it("祝福の回復薬は1.5倍回復する", () => {
    const p = { hp: 50, maxHp: 100, x: 1, y: 1, inventory: [] };
    const ml = [];
    applyPotionEffect("heal", 30, "player", null, dg, p, ml, () => {}, true, false);
    expect(p.hp).toBe(95);
  });

  it("呪われた回復薬はダメージになる", () => {
    const p = { hp: 50, maxHp: 100, x: 1, y: 1, inventory: [] };
    const ml = [];
    applyPotionEffect("heal", 30, "player", null, dg, p, ml, () => {}, false, true);
    expect(p.hp).toBe(29);
    expect(ml.some(m => m.includes("ダメージ"))).toBe(true);
  });

  it("アンデッドへの回復薬はダメージになる", () => {
    const mon = { name: "ゾンビ", kind: "undead", hp: 40, maxHp: 40, x: 2, y: 2, atk: 5 };
    const p = { hp: 100, maxHp: 100, x: 1, y: 1, inventory: [] };
    const ml = [];
    applyPotionEffect("heal", 30, "monster", mon, dg, p, ml, () => {});
    expect(mon.hp).toBe(10);
  });
});

describe("rotFood", () => {
  it("腐敗時に祝福・特殊効果・壺味を除去し大きさは残す", () => {
    const food = {
      type: "food",
      name: "カレー味の満腹の特盛りおにぎり",
      _foodBase: "おにぎり",
      sizeLabel: "特盛り",
      effect: "satiate_food",
      blessed: true,
      cursed: false,
      bcKnown: true,
      potFlavors: ["curry"],
      value: 120,
    };
    rotFood(food);
    expect(food.rotten).toBe(true);
    expect(food.name).toBe("腐った特盛りおにぎり");
    expect(food.sizeLabel).toBe("特盛り");
    expect(food.value).toBe(120);
    expect(food.blessed).toBeUndefined();
    expect(food.cursed).toBeUndefined();
    expect(food.effect).toBeUndefined();
    expect(food.potFlavors).toBeUndefined();
  });

  it("腐った食料はヤバイ化でエンチャントだけ除去し大きさは残す", () => {
    const food = {
      type: "food",
      name: "腐った特盛りおにぎり",
      _foodBase: "おにぎり",
      sizeLabel: "特盛り",
      rotten: true,
      blessed: true,
      effect: "heal_food",
      value: 80,
    };
    expect(rotFood(food)).toBe("yabai");
    expect(food.yabai).toBe(true);
    expect(food.name).toBe("ヤバイ特盛りおにぎり");
    expect(food.sizeLabel).toBe("特盛り");
    expect(food.blessed).toBeUndefined();
    expect(food.effect).toBeUndefined();
    expect(food.value).toBe(80);
  });
});