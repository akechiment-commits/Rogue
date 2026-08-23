/** 好きな食べ物（初期食料の元になる名前）まわり */
import { uid } from "./utils.js";
import { FOOD_DESCS } from "./foodData.js";
import { FOOD_DESCRIPTIONS } from "./foodDescriptions.js";

export const FAVORITE_FOOD_MIN = 1;
export const FAVORITE_FOOD_MAX = 12;
export const DEFAULT_FAVORITE_FOOD = "おにぎり";

/**
 * 表示用。未設定時はデフォルト名。
 * @param {string|null|undefined} food
 */
export function favoriteFoodLabel(food) {
  const s = food != null ? String(food).trim() : "";
  return s || DEFAULT_FAVORITE_FOOD;
}

/**
 * 入力を正規化して検証する。
 * @returns {{ ok: true, name: string } | { ok: false, error: string }}
 */
export function normalizeFavoriteFood(raw) {
  if (raw == null) return { ok: false, error: "好きな食べ物を入力してください。" };
  const name = String(raw).replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "好きな食べ物を入力してください。" };
  if ([...name].length < FAVORITE_FOOD_MIN) {
    return { ok: false, error: "好きな食べ物を入力してください。" };
  }
  if ([...name].length > FAVORITE_FOOD_MAX) {
    return { ok: false, error: `好きな食べ物は${FAVORITE_FOOD_MAX}文字以内にしてください。` };
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, error: "使えない文字が含まれています。" };
  }
  return { ok: true, name };
}

/**
 * セーブに好きな食べ物を書き込む。
 * @returns {{ ok: true, save: object } | { ok: false, error: string }}
 */
export function applyFavoriteFoodToSave(save, rawFood) {
  const n = normalizeFavoriteFood(rawFood);
  if (!n.ok) return n;
  return {
    ok: true,
    save: {
      ...save,
      favoriteFood: n.name,
    },
  };
}

/**
 * 好きな食べ物から初期所持の満腹・特盛り食料を生成する。
 * 従来の「満腹の特盛りおにぎり」(value 120) と同じスペック。
 */
export function makeStarterFoodItem(favoriteFood, { uidFn = uid } = {}) {
  const n = normalizeFavoriteFood(favoriteFood);
  const base = n.ok ? n.name : DEFAULT_FAVORITE_FOOD;
  return {
    name: `満腹の特盛り${base}`,
    type: "food",
    effect: "satiate_food",
    value: 120,
    desc: [FOOD_DESCRIPTIONS[base], FOOD_DESCS.satiate_food || "とても腹持ちが良さそうだ。", "あなたの好物だ！"]
      .filter(Boolean).join("\n"),
    tile: 66,
    cooked: true,
    sizeLabel: "特盛り",
    _foodBase: base,
    _foodEfLabel: "満腹の",
    id: uidFn(),
  };
}
