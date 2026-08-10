import { describe, it, expect } from "vitest";
import {
  ITEMS,
  WANDS,
  RINGS,
  POTS,
  SPELLBOOKS,
  GEM_TYPES,
} from "../items.js";
import {
  LOOT_LUCK,
  MONSTER_RANDOM_DROP_RATE,
  RARITY_ORDER,
  RARITY_WEIGHT,
  monsterRandomDropChance,
  pickLootFromPool,
  pickWeighted,
} from "../lootRules.js";

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

  it("宝石は価格帯に応じた rarity / weight を持つ", () => {
    for (const gem of GEM_TYPES) {
      expect(gem.weight, gem.name).toBe(RARITY_WEIGHT[gem.rarity]);
    }
    expect(GEM_TYPES.find((gem) => gem.name === "アレキサンドライト").rarity).toBe("A");
    expect(GEM_TYPES.find((gem) => gem.name === "アレキサンドライト").weight).toBe(1);
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
    expect(LOOT_LUCK.shop_gem.chance).toBe(0);
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

  it("変化の祝福・呪いはアイテム変化の運枠だけを増減する", () => {
    const makeRng = () => {
      let n = 0;
      return () => (++n === 1 ? 0.2 : 0.0001);
    };
    expect(pickLootFromPool(pool, "change", makeRng()).name).toBe("e-item");
    expect(pickLootFromPool(pool, "change_blessed", makeRng()).name).toBe("c-item");
    expect(pickLootFromPool(pool, "change_cursed", makeRng()).name).toBe("e-item");
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
