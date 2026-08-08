import { describe, it, expect } from "vitest";
import {
  normalizeFavoriteFood,
  applyFavoriteFoodToSave,
  makeStarterFoodItem,
  favoriteFoodLabel,
  FAVORITE_FOOD_MAX,
  DEFAULT_FAVORITE_FOOD,
} from "../favoriteFood.js";

describe("normalizeFavoriteFood", () => {
  it("前後空白を除去する", () => {
    const r = normalizeFavoriteFood("  カレー  ");
    expect(r.ok).toBe(true);
    expect(r.name).toBe("カレー");
  });

  it("空は拒否", () => {
    expect(normalizeFavoriteFood("").ok).toBe(false);
    expect(normalizeFavoriteFood("   ").ok).toBe(false);
  });

  it("最大文字数を超えると拒否", () => {
    expect(normalizeFavoriteFood("あ".repeat(FAVORITE_FOOD_MAX + 1)).ok).toBe(false);
  });
});

describe("applyFavoriteFoodToSave", () => {
  it("favoriteFood を書き込む", () => {
    const r = applyFavoriteFoodToSave({ playerName: "A", favoriteFood: "" }, "おにぎり");
    expect(r.ok).toBe(true);
    expect(r.save.favoriteFood).toBe("おにぎり");
    expect(r.save.playerName).toBe("A");
  });
});

describe("makeStarterFoodItem", () => {
  it("好きな食べ物から満腹特盛りの初期食料を作る", () => {
    const it = makeStarterFoodItem("カレー", { uidFn: () => "id1" });
    expect(it.name).toBe("満腹の特盛りカレー");
    expect(it.type).toBe("food");
    expect(it.effect).toBe("satiate_food");
    expect(it.value).toBe(120);
    expect(it.cooked).toBe(true);
    expect(it._foodBase).toBe("カレー");
    expect(it.id).toBe("id1");
  });

  it("不正値はデフォルト名を使う", () => {
    const it = makeStarterFoodItem("", { uidFn: () => "x" });
    expect(it.name).toBe(`満腹の特盛り${DEFAULT_FAVORITE_FOOD}`);
  });
});

describe("favoriteFoodLabel", () => {
  it("未設定はデフォルト", () => {
    expect(favoriteFoodLabel("")).toBe(DEFAULT_FAVORITE_FOOD);
    expect(favoriteFoodLabel(null)).toBe(DEFAULT_FAVORITE_FOOD);
  });
});
