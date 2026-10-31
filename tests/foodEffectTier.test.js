import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFoodEffectsOnHit, burnFoodItem, rotFood, foodEffectTier } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("傷んだ食料の効果量", () => {
  it.each([10, 20, 35, 55, 80, 81, 100])("食料価値%sを焦がしても効果サイズの段階は変わらない", value => {
    const food = { type: "food", name: "パン", value, cooked: true };
    const tier = foodEffectTier(food);
    burnFoodItem(food, []);
    expect(foodEffectTier(food)).toBe(tier);
    expect(food.value).toBe(Math.max(1, Math.floor(value * 0.6)));
  });

  it.each(["player", "monster"])("%sへの食料命中は元の大サイズに対し1回だけ10%%化する", kind => {
    const food = { type: "food", name: "剛力のパン", effect: "power_food", value: 100, cooked: true };
    burnFoodItem(food, []);
    const player = makePlayer({ atk: 10 });
    const target = kind === "player" ? player : { name: "敵", hp: 100, maxHp: 100, atk: 10 };
    applyFoodEffectsOnHit(food, kind, target, makeEmptyDg(), player, [], () => {}, null, { skipHunger: true });
    expect(target.atk).toBeCloseTo(10.2);
  });

  it("焦げた回復食料の量も元サイズの10%になり、満腹回復量の減少とは独立する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const food = { type: "food", name: "癒しのパン", effect: "heal_food", value: 100, cooked: true };
    burnFoodItem(food, []);
    const player = makePlayer({ hp: 50 });
    applyFoodEffectsOnHit(food, "player", player, makeEmptyDg(), player, [], () => {}, null, { skipHunger: true });
    expect(player.hp).toBe(57); // 元の76〜86回復の10%。焦げた価値60の63〜73回復には落とさない。
    expect(food.value).toBe(60);
    expect(rotFood(food)).toBe("restored");
    expect(food.value).toBe(100);
    expect(foodEffectTier(food)).toBe(5);
  });
});
