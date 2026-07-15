import { describe, it, expect } from "vitest";
import {
  pickLootFromPool,
  pickWeighted,
  LOOT_LUCK,
  RARITY_WEIGHT,
  RARITY_ORDER,
  ITEMS,
  WANDS,
  RINGS,
  POTS,
  SPELLBOOKS,
  MONSTER_RANDOM_DROP_RATE,
  monsterRandomDropChance,
} from "../items.js";

describe("レア度 = weight", () => {
  it("全アイテムで rarity と weight が RARITY_WEIGHT と一致", () => {
    const all = [...ITEMS, ...WANDS, ...RINGS, ...POTS, ...SPELLBOOKS];
    for (const i of all) {
      if (!i.rarity || i.type === "gold") continue;
      expect(RARITY_WEIGHT[i.rarity], i.name).toBe(i.weight);
    }
  });

  it("RARITY_ORDER は E→S", () => {
    expect(RARITY_ORDER).toEqual(["E", "D", "C", "B", "A", "S"]);
  });
});

describe("pickLootFromPool", () => {
  const pool = [
    { name: "e-item", rarity: "E", weight: 12 },
    { name: "c-item", rarity: "C", weight: 4 },
    { name: "s-wish", rarity: "S", weight: 0.05 },
  ];

  it("LOOT_LUCK: 店は C 以上", () => {
    expect(LOOT_LUCK.shop.chance).toBe(0.18);
    expect(LOOT_LUCK.shop.rarities).toEqual(["C", "B", "A", "S"]);
    expect(LOOT_LUCK.drop.rarities).toEqual(["D", "C", "B", "A", "S"]);
  });

  it("floor は運枠なしで重み抽選", () => {
    const t = pickLootFromPool(pool, "floor", () => 0.0001);
    expect(t.name).toBe("e-item");
  });

  it("shop 運枠ヒット時は C 以上のみ", () => {
    let n = 0;
    const rngFn = () => {
      n++;
      if (n === 1) return 0.0;
      return 0.0001;
    };
    const t = pickLootFromPool(pool, "shop", rngFn);
    expect(t.name).toBe("c-item");
  });

  it("空プールは null", () => {
    expect(pickLootFromPool([], "floor")).toBeNull();
  });

  it("pickWeighted と floor が同趣旨", () => {
    const a = pickWeighted(ITEMS.filter((i) => i.type === "potion"), () => 0.01);
    const b = pickLootFromPool(ITEMS.filter((i) => i.type === "potion"), "floor", () => 0.01);
    expect(a.name).toBe(b.name);
  });

  it("WANDS でも動く", () => {
    const t = pickLootFromPool(WANDS, "drop");
    expect(t?.type || t?.name).toBeTruthy();
  });

  it("monsterRandomDropChance", () => {
    expect(monsterRandomDropChance({})).toBe(MONSTER_RANDOM_DROP_RATE.plainOrSplitter);
    expect(monsterRandomDropChance({ subtype: "archer" })).toBe(0.05);
  });
});
