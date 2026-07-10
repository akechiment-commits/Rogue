import { describe, it, expect } from "vitest";
import { getIdentKey, itemPrice, applyPotionEffect, getBlessMultiplier, gemSellPrice, rotFood, isFireExplosionNullified, announceFireExplosionNullified, doExplosion, hasFireResist, hasLightningResist, applyLightningToInventory, reduceFireDamage, reduceLightningDamage, reduceIceDamage, imprisonPotRemainingCapacity, potOccupancyCount, canConfineMonsterInImprisonPot, confinePlayerInImprisonPot, confineMonsterInImprisonPot, releaseConfinedMonstersFromPot, scatterPotContents, resolveImprisonPotExit } from "../items.js";
import { MW, MH, T } from "../utils.js";

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

describe("isFireExplosionNullified", () => {
  it("呪われた爆発の魔方陣があると炎・爆発が不発になる", () => {
    const dg = { pentacles: [{ kind: "explosion", cursed: true }] };
    expect(isFireExplosionNullified(dg, { fireExplosionNullTurns: 0 })).toBe(true);
  });

  it("自爆の巻物【呪】バフ中は炎・爆発が不発になる", () => {
    const dg = { pentacles: [] };
    expect(isFireExplosionNullified(dg, { fireExplosionNullTurns: 200 })).toBe(true);
    expect(isFireExplosionNullified(dg, { fireExplosionNullTurns: 0 })).toBe(false);
  });

  it("雷の魔方陣だけでは炎・爆発は不発にならない", () => {
    const dg = { pentacles: [{ kind: "thunder_trap", cursed: true }] };
    expect(isFireExplosionNullified(dg, null)).toBe(false);
  });
});

describe("doExplosion", () => {
  it("地雷爆発は耐火でダメージ軽減される", () => {
    const dg = { pentacles: [], monsters: [], items: [], map: Array.from({ length: 21 }, () => Array(33).fill(1)), explored: [], visible: [], traps: [] };
    const p = { x: 5, y: 5, hp: 100, maxHp: 100, armor: { ability: "fire_resist" }, inventory: [] };
    const ml = [];
    doExplosion(5, 5, dg, p, ml, null, "地雷", null, null, true, false, true);
    expect(p.hp).toBe(67);
    expect(ml.some(m => m.includes("耐火"))).toBe(true);
  });

  it("地雷爆発は油まみれでダメージ2倍になる", () => {
    const dg = { pentacles: [], monsters: [], items: [], map: Array.from({ length: 21 }, () => Array(33).fill(1)), explored: [], visible: [], traps: [] };
    const p = { x: 5, y: 5, hp: 100, maxHp: 100, oilyTurns: 10, inventory: [] };
    const ml = [];
    doExplosion(5, 5, dg, p, ml, null, "地雷", null, null, true, false, true);
    expect(p.hp).toBe(0);
    expect(ml.some(m => m.includes("油まみれ×2"))).toBe(true);
  });

  it("地雷爆発は油まみれと耐火の両方が適用される", () => {
    const dg = { pentacles: [], monsters: [], items: [], map: Array.from({ length: 21 }, () => Array(33).fill(1)), explored: [], visible: [], traps: [] };
    const p = { x: 5, y: 5, hp: 100, maxHp: 100, oilyTurns: 10, armor: { ability: "fire_resist" }, inventory: [] };
    const ml = [];
    doExplosion(5, 5, dg, p, ml, null, "地雷", null, null, true, false, true);
    expect(p.hp).toBe(34);
    expect(ml.some(m => m.includes("油まみれ×2"))).toBe(true);
    expect(ml.some(m => m.includes("耐火"))).toBe(true);
  });

  it("炎・爆発不発時は爆発せずメッセージを出す", () => {
    const dg = { pentacles: [], monsters: [], items: [], map: Array.from({ length: 21 }, () => Array(33).fill(1)), explored: [], visible: [] };
    const p = { x: 5, y: 5, hp: 50, maxHp: 100, fireExplosionNullTurns: 42, inventory: [] };
    const ml = [];
    doExplosion(5, 5, dg, p, ml, null, "地雷");
    expect(ml.some(m => m.includes("不発") && m.includes("42"))).toBe(true);
    expect(ml.some(m => m === "爆発！")).toBe(false);
  });
});

describe("reduceFireDamage / reduceLightningDamage / reduceIceDamage", () => {
  it("個別のみ・万能のみは2/3、個別+万能は半減", () => {
    expect(reduceFireDamage(30, { armor: { ability: "fire_resist" } })).toBe(20);
    expect(reduceFireDamage(30, { armor: { ability: "all_resist" } })).toBe(20);
    expect(reduceFireDamage(30, { armor: { ability: "fire_resist", abilities: ["all_resist"] } })).toBe(15);
    expect(reduceLightningDamage(30, { armor: { abilities: ["lightning_resist", "all_resist"] } })).toBe(15);
    expect(reduceIceDamage(30, { armor: { ability: "ice_resist" } })).toBe(20);
    expect(reduceFireDamage(30, { armor: { ability: "regen" } })).toBe(30);
  });
});

describe("hasFireResist / hasLightningResist", () => {
  it("耐火・雷耐性と万能耐性を判定する", () => {
    expect(hasFireResist({ armor: { ability: "fire_resist" } })).toBe(true);
    expect(hasFireResist({ armor: { ability: "all_resist" } })).toBe(true);
    expect(hasFireResist({ armor: { ability: "lightning_resist" } })).toBe(false);
    expect(hasLightningResist({ armor: { abilities: ["lightning_resist"] } })).toBe(true);
    expect(hasLightningResist({ armor: { ability: "all_resist" } })).toBe(true);
  });
});

describe("applyLightningToInventory", () => {
  const dg = { pentacles: [] };

  it("耐火防具で炎による所持品破壊を防ぐ", () => {
    const p = { inventory: [{ type: "scroll", name: "テスト巻物" }], armor: { ability: "fire_resist" } };
    const ml = [];
    applyLightningToInventory(p, dg, ml, () => {}, null, true);
    expect(p.inventory).toHaveLength(1);
    expect(ml).toHaveLength(0);
  });

  it("雷耐性防具で雷による所持品破壊を防ぐ", () => {
    const p = { inventory: [{ type: "potion", name: "テスト薬" }], armor: { ability: "lightning_resist" } };
    const ml = [];
    applyLightningToInventory(p, dg, ml, () => {}, null, false);
    expect(p.inventory).toHaveLength(1);
    expect(ml).toHaveLength(0);
  });

  it("耐性なしなら所持品が壊れる", () => {
    const p = { inventory: [{ type: "scroll", name: "テスト巻物" }], armor: { ability: "regen" } };
    const ml = [];
    applyLightningToInventory(p, dg, ml, () => {}, null, true);
    expect(p.inventory).toHaveLength(0);
    expect(ml.some(m => m.includes("燃えて"))).toBe(true);
  });
});

describe("imprison pot", () => {
  it("残り容量は閉じ込めた敵の数で減る", () => {
    const pot = { type: "pot", potEffect: "imprison", capacity: 3, confinedMonsters: [{ name: "スライム" }] };
    expect(imprisonPotRemainingCapacity(pot)).toBe(2);
    expect(potOccupancyCount(pot)).toBe(1);
  });

  it("入れると残り容量×10ターン動けなくなる", () => {
    const pot = { type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [] };
    const p = {};
    const ml = [];
    expect(confinePlayerInImprisonPot(pot, p, ml)).toBe(true);
    expect(p.potConfinedTurns).toBe(30);
    expect(ml.some(m => m.includes("30"))).toBe(true);
  });

  it("敵を閉じ込めて割れると放出される", () => {
    const pot = { type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [] };
    const mon = { id: "m1", name: "スライム", hp: 10, maxHp: 10, x: 5, y: 5, atk: 3 };
    const dg = { monsters: [mon], map: Array.from({ length: MH }, () => Array(MW).fill(1)) };
    const ml = [];
    confineMonsterInImprisonPot(pot, mon, dg, ml);
    expect(dg.monsters).toHaveLength(0);
    expect(pot.confinedMonsters).toHaveLength(1);
    scatterPotContents(pot, dg, 5, 5, null, ml, () => {});
    expect(dg.monsters).toHaveLength(1);
    expect(pot.confinedMonsters).toHaveLength(0);
    expect(ml.some(m => m.includes("割れた"))).toBe(true);
  });

  it("閉じ込め不可の敵を判定する", () => {
    expect(canConfineMonsterInImprisonPot({ type: "shopkeeper" })).toBe(false);
    expect(canConfineMonsterInImprisonPot({ isBoss: true })).toBe(false);
    expect(canConfineMonsterInImprisonPot({ baseKind: "firedemon" })).toBe(false);
    expect(canConfineMonsterInImprisonPot({ baseKind: "synthmonster" })).toBe(false);
    expect(canConfineMonsterInImprisonPot({ name: "スライム" })).toBe(true);
  });

  it("敵が入った状態で入ると出たとき壺が割れる", () => {
    const pot = { id: "pot1", type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [{ name: "ゴブリン", hp: 8, maxHp: 8, atk: 2 }] };
    const p = { x: 4, y: 4, inventory: [pot] };
    const dg = { monsters: [], map: Array.from({ length: MH }, () => Array(MW).fill(1)) };
    const ml = [];
    confinePlayerInImprisonPot(pot, p, ml);
    expect(p.potConfinedBreakOnExit).toBe(true);
    resolveImprisonPotExit(p, dg, ml, () => {});
    expect(p.inventory).toHaveLength(0);
    expect(dg.monsters).toHaveLength(1);
    expect(p.potConfinedBreakOnExit).toBeUndefined();
  });
});

describe("announceFireExplosionNullified", () => {
  it("魔方陣とバフで異なるメッセージを出す", () => {
    const ml1 = [];
    announceFireExplosionNullified({ pentacles: [{ kind: "explosion", cursed: true }] }, null, ml1, "炎の魔法");
    expect(ml1[0]).toContain("魔方陣");

    const ml2 = [];
    announceFireExplosionNullified({ pentacles: [] }, { fireExplosionNullTurns: 10 }, ml2, "爆発");
    expect(ml2[0]).toContain("不発");
    expect(ml2[0]).toContain("10");
  });
});