import { describe, it, expect } from "vitest";
import {
  pickLootFromPool,
  pickWeighted,
  LOOT_UNIFORM_CHANCE,
  MONSTER_RANDOM_DROP_RATE,
  monsterRandomDropChance,
  ITEMS,
  WANDS,
} from "../items.js";

describe("pickLootFromPool", () => {
  const pool = [
    { name: "common", weight: 1000 },
    { name: "rare", weight: 1 },
  ];

  it("全 context で均等枠は 0（常に weight）", () => {
    expect(LOOT_UNIFORM_CHANCE.floor).toBe(0);
    expect(LOOT_UNIFORM_CHANCE.shop).toBe(0);
    expect(LOOT_UNIFORM_CHANCE.change).toBe(0);
    expect(LOOT_UNIFORM_CHANCE.drop).toBe(0);
  });

  it("floor / shop / change とも重み抽選", () => {
    for (const ctx of ["floor", "shop", "change", "drop"]) {
      let common = 0;
      for (let i = 0; i < 40; i++) {
        const t = pickLootFromPool(pool, ctx, () => 0.0001);
        if (t.name === "common") common++;
      }
      expect(common).toBe(40);
    }
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
