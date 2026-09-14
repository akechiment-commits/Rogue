import { describe, expect, it } from "vitest";
import { POTION_FOOD_PREFIX } from "../items.js";
import {
  FOOD_POTION_EFFECT_LABELS,
  foodPotionEffectLabel,
} from "../foodData.js";

describe("食料に付与された薬効果の表示名", () => {
  it("薬効果の内部キーをゲーム内へ表示しない", () => {
    for (const effect of Object.keys(POTION_FOOD_PREFIX)) {
      if (effect === "fire" || effect === "c_fire") continue;
      expect(FOOD_POTION_EFFECT_LABELS[effect], effect).toBeTruthy();
      expect(foodPotionEffectLabel(effect)).not.toMatch(/[A-Za-z_]/);
    }
  });

  it("未登録の効果も内部キーではなく日本語の汎用名を表示する", () => {
    expect(foodPotionEffectLabel("future_effect")).toBe("特殊効果");
  });
});
