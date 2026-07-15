import { describe, it, expect } from "vitest";
import {
  pickLootFromPool,
  pickWeighted,
  LOOT_LUCK,
  LOOT_UNIFORM_CHANCE,
  MONSTER_RANDOM_DROP_RATE,
  monsterRandomDropChance,
  ITEMS,
  WANDS,
} from "../items.js";

describe("pickLootFromPool", () => {
  const pool = [
    { name: "d-item", rarity: "D", weight: 100 },
    { name: "b-item", rarity: "B", weight: 10 },
    { name: "s-wish", rarity: "S", weight: 0.05 },
  ];

  it("均等枠は廃止（0）", () => {
    expect(LOOT_UNIFORM_CHANCE.shop).toBe(0);
    expect(LOOT_UNIFORM_CHANCE.change).toBe(0);
    expect(LOOT_UNIFORM_CHANCE.drop).toBe(0);
  });

  it("LOOT_LUCK: 店・変化は B/A/S、ドロップは C 以上", () => {
    expect(LOOT_LUCK.shop.chance).toBe(0.18);
    expect(LOOT_LUCK.shop.rarities).toEqual(["B", "A", "S"]);
    expect(LOOT_LUCK.change.chance).toBe(0.18);
    expect(LOOT_LUCK.drop.chance).toBe(0.10);
    expect(LOOT_LUCK.drop.rarities).toContain("C");
    expect(LOOT_LUCK.floor.chance).toBe(0);
  });

  it("floor は運枠なしで重み抽選", () => {
    const t = pickLootFromPool(pool, "floor", () => 0.0001);
    expect(t.name).toBe("d-item");
  });

  it("shop 運枠ヒット時は B/A/S のみ（帯内は weight）", () => {
    let n = 0;
    const rngFn = () => {
      n++;
      if (n === 1) return 0.0; /* luck hit */
      return 0.0001; /* pickWeighted → heaviest in B/A/S = b-item */
    };
    const t = pickLootFromPool(pool, "shop", rngFn);
    expect(t.name).toBe("b-item");
    expect(t.rarity).not.toBe("D");
  });

  it("shop 運枠外れは全体 weight（D が選ばれる）", () => {
    let n = 0;
    const rngFn = () => {
      n++;
      if (n === 1) return 0.99; /* no luck */
      return 0.0001; /* full pool → d-item */
    };
    const t = pickLootFromPool(pool, "shop", rngFn);
    expect(t.name).toBe("d-item");
  });

  it("運枠でも超低 weight の S は帯内で出にくい（b が優先）", () => {
    /* luck hit + weight roll favors b-item over s-wish */
    let n = 0;
    const rngFn = () => {
      n++;
      if (n === 1) return 0.0;
      return 0.0001;
    };
    const t = pickLootFromPool(pool, "change", rngFn);
    expect(t.name).toBe("b-item");
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

  it("monsterRandomDropChance が特技なし/分裂は2%、特技持ちは5%", () => {
    expect(monsterRandomDropChance({})).toBe(MONSTER_RANDOM_DROP_RATE.plainOrSplitter);
    expect(monsterRandomDropChance({ subtype: null })).toBe(0.02);
    expect(monsterRandomDropChance({ subtype: "splitter" })).toBe(0.02);
    expect(monsterRandomDropChance({ subtype: "archer" })).toBe(0.05);
    expect(monsterRandomDropChance({ subtype: "wanduser" })).toBe(0.05);
  });
});
