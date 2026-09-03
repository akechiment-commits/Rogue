import { describe, expect, it } from "vitest";
import {
  DIMENSIONAL_VAULT_ITEM_TURNS,
  DIMENSIONAL_VAULT_TURNS_BY_RARITY,
  dimensionalVaultItemTurns,
  altarCategoryWeights,
  activateDimensionalVaults,
  advanceDimensionalVaults,
  altarRarityWeights,
  pickAltarRewardTemplate,
  DEBUG_SPECIAL_FIXTURE_RATES,
  SPECIAL_FIXTURE_RATES,
  specialFixtureRate,
} from "../specialFixtures.js";
import { T } from "../utils.js";

describe("special fixtures", () => {
  it("宝物庫は入室したターンには減らさず、次のターンから数える", () => {
    const dungeon = {
      floorTurns: 1,
      items: [{ id: "item", name: "薬", dimensionalVaultId: "vault" }],
      dimensionalVaults: [{ id: "vault", room: { x: 2, y: 2, w: 3, h: 3 }, active: false }],
    };
    const player = { x: 3, y: 3 };
    const messages = [];
    const activated = activateDimensionalVaults(dungeon, player, messages);
    expect(activated.has("vault")).toBe(true);
    expect(dungeon.items[0].vaultTurnsLeft).toBe(DIMENSIONAL_VAULT_ITEM_TURNS);
    advanceDimensionalVaults(dungeon, messages, { skipVaultIds: activated });
    expect(dungeon.items).toHaveLength(1);
    advanceDimensionalVaults(dungeon, messages);
    expect(dungeon.items[0].vaultTurnsLeft).toBe(DIMENSIONAL_VAULT_ITEM_TURNS - 1);
  });

  it("宝物庫のカウントが0になるとアイテムを消す", () => {
    const dungeon = {
      items: [{ id: "item", name: "薬", dimensionalVaultId: "vault", vaultTurnsLeft: 1 }],
      dimensionalVaults: [{ id: "vault", room: { x: 0, y: 0, w: 2, h: 2 }, active: true }],
    };
    const messages = [];
    advanceDimensionalVaults(dungeon, messages);
    expect(dungeon.items).toEqual([]);
    expect(messages.join(" ")).toContain("次元の彼方");
  });

  it("宝物が尽きると発動時の壁と水を消す", () => {
    const dungeon = {
      map: Array.from({ length: 5 }, () => Array(5).fill(T.FLOOR)),
      items: [{ id: "last", dimensionalVaultId: "vault", vaultTurnsLeft: 1 }],
      dimensionalVaults: [{
        id: "vault", room: { x: 1, y: 1, w: 3, h: 3 }, active: true,
        treasureItemIds: ["last"], walls: [{ x: 0, y: 1 }], water: [{ x: 4, y: 1 }],
      }],
    };
    dungeon.map[1][0] = T.WALL;
    dungeon.map[1][4] = T.WATER;
    const messages = [];
    advanceDimensionalVaults(dungeon, messages);
    expect(dungeon.map[1][0]).toBe(T.FLOOR);
    expect(dungeon.map[1][4]).toBe(T.FLOOR);
    expect(dungeon.dimensionalVaults).toEqual([]);
    expect(messages).toContain("宝物庫は次元の彼方へ消えた。");
  });

  it("宝物庫はレア度が高い品ほど短い初期カウントになる", () => {
    expect(dimensionalVaultItemTurns({ rarity: "E" })).toBe(DIMENSIONAL_VAULT_TURNS_BY_RARITY.E);
    expect(dimensionalVaultItemTurns({ rarity: "D" })).toBeGreaterThan(dimensionalVaultItemTurns({ rarity: "C" }));
    expect(dimensionalVaultItemTurns({ rarity: "C" })).toBeGreaterThan(dimensionalVaultItemTurns({ rarity: "B" }));
    expect(dimensionalVaultItemTurns({ rarity: "B" })).toBeGreaterThan(dimensionalVaultItemTurns({ rarity: "A" }));
    expect(dimensionalVaultItemTurns({ rarity: "A" })).toBeGreaterThan(dimensionalVaultItemTurns({ rarity: "S" }));
  });

  it("祭壇は奉納回数が増えるほど高レア度の重みが上がる", () => {
    const first = altarRarityWeights(0);
    const later = altarRarityWeights(5);
    expect(later.A).toBeGreaterThan(first.A);
    expect(later.S).toBeGreaterThan(first.S);
    const result = pickAltarRewardTemplate([{ name: "A", rarity: "A" }], 0, () => 0);
    expect(result.name).toBe("A");
  });

  it("祭壇は序盤に薬・巻物・矢を優先し、奉納数で他カテゴリと高レアを増やす", () => {
    const early = altarCategoryWeights(1);
    const middle = altarCategoryWeights(6);
    const late = altarCategoryWeights(10);
    expect(early.potion).toBeGreaterThan(middle.potion);
    expect(early.scroll).toBeGreaterThan(late.scroll);
    expect(early.arrow).toBeGreaterThan(late.arrow);
    expect(early.other).toBeLessThan(late.other);
    expect(altarRarityWeights(1).A).toBeLessThan(altarRarityWeights(10).A);
    expect(altarRarityWeights(1).S).toBeLessThan(altarRarityWeights(10).S);
  });

  it("デバッグダンジョンでは3ギミックの抽選率を大幅に上げる", () => {
    for (const key of ["dimensionalVault", "wanderingMerchant", "altar"]) {
      expect(specialFixtureRate(key, { floorType: "debugDungeon" })).toBe(DEBUG_SPECIAL_FIXTURE_RATES[key]);
      expect(specialFixtureRate(key, { dungeonType: "beginner" })).toBe(SPECIAL_FIXTURE_RATES[key]);
    }
  });
});
