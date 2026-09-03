import { describe, it, expect } from "vitest";
import { clearDimensionalVaultItemCounter, createSeededRng, getShops, hasAbility, installPlayerHpReverseHook, isEvasionDisabledByStatus, pick, rng, shuffle, sortWarehouseItems } from "../utils.js";

describe("sortWarehouseItems", () => {
  it("種別順→名前順でソートする", () => {
    const items = [
      { name: "回復薬", type: "potion" },
      { name: "短剣", type: "weapon" },
      { name: "革の鎧", type: "armor" },
    ];
    const sorted = sortWarehouseItems(items);
    expect(sorted.map(i => i.type)).toEqual(["weapon", "armor", "potion"]);
  });
});

describe("hasAbility", () => {
  it("単体 ability と abilities 配列の両方を判定する", () => {
    expect(hasAbility({ ability: "fire_resist" }, "fire_resist")).toBe(true);
    expect(hasAbility({ abilities: ["thorn", "dodge"] }, "dodge")).toBe(true);
    expect(hasAbility({ ability: "thorn" }, "dodge")).toBe(false);
    expect(hasAbility(null, "thorn")).toBe(false);
  });
});

describe("isEvasionDisabledByStatus", () => {
  it("移動封じ・鈍足・金縛り・眠り・凍結では通常回避を無効にする", () => {
    for (const target of [
      { immobileTurns: 1 }, { slowTurns: 1 }, { paralyzeTurns: 1 },
      { paralyzed: true }, { sleepTurns: 1 }, { frozenTurns: 1 },
    ]) expect(isEvasionDisabledByStatus(target)).toBe(true);
    expect(isEvasionDisabledByStatus({})).toBe(false);
  });
});

describe("installPlayerHpReverseHook", () => {
  it("HPが0になった瞬間に行動阻害状態を解除する", () => {
    const player = {
      hp: 9,
      maxHp: 10,
      sleepTurns: 4,
      slowTurns: 5,
      slowSkip: true,
      confusedTurns: 3,
      poisoned: true,
      poisonedTurns: 2,
      atk: 4,
      poisonAtkLoss: 1,
    };
    installPlayerHpReverseHook(player);

    player.hp -= 9;

    expect(player.hp).toBe(0);
    expect(player.sleepTurns).toBe(0);
    expect(player.slowTurns).toBe(0);
    expect(player.slowSkip).toBe(false);
    expect(player.confusedTurns).toBe(0);
    expect(player.poisoned).toBe(false);
    expect(player.atk).toBe(5);
  });
});

describe("clearDimensionalVaultItemCounter", () => {
  it("拾った宝物から消滅カウントと宝物庫紐付けを消す", () => {
    const item = { name: "薬", dimensionalVaultId: "vault", vaultTurnsLeft: 7, rarity: "A" };
    expect(clearDimensionalVaultItemCounter(item)).toBe(item);
    expect(item).toEqual({ name: "薬", rarity: "A" });
  });
});

describe("getShops", () => {
  it("shops / shop / 空の順で正規化する", () => {
    const a = { shops: [{ x: 1 }, { x: 2 }] };
    const b = { shop: { x: 3 } };
    const c = {};
    expect(getShops(a)).toHaveLength(2);
    expect(getShops(b)).toEqual([{ x: 3 }]);
    expect(getShops(c)).toEqual([]);
  });
});

describe("seeded random helpers", () => {
  it("同じ seed なら同じ乱数列と抽選結果になる", () => {
    const first = createSeededRng("dungeon-42");
    const second = createSeededRng("dungeon-42");
    expect(Array.from({ length: 6 }, () => first())).toEqual(
      Array.from({ length: 6 }, () => second()),
    );

    const a = createSeededRng(42);
    const b = createSeededRng(42);
    expect(Array.from({ length: 8 }, () => pick(["a", "b", "c"], a))).toEqual(
      Array.from({ length: 8 }, () => pick(["a", "b", "c"], b)),
    );
  });

  it("rng と shuffle は注入された乱数関数を使える", () => {
    expect(rng(3, 8, () => 0)).toBe(3);
    expect(rng(3, 8, () => 0.9999)).toBe(8);
    const a = shuffle([1, 2, 3, 4], createSeededRng("shuffle"));
    const b = shuffle([1, 2, 3, 4], createSeededRng("shuffle"));
    expect(a).toEqual(b);
  });
});
