import { describe, it, expect } from "vitest";
import {
  RAW_FOODS,
  COOKED_FOODS_SAVORY,
  COOKED_FOODS_SWEET,
  COOKED_FOODS,
  FOOD_CAT_MAP,
  foodMatchesPotCategory,
} from "../foodData.js";

const dup = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);

describe("foodData", () => {
  it("リスト内に重複がない", () => {
    expect(dup(RAW_FOODS)).toEqual([]);
    expect(dup(COOKED_FOODS_SAVORY)).toEqual([]);
    expect(dup(COOKED_FOODS_SWEET)).toEqual([]);
  });

  it("生食材と調理済みで名前が被らない", () => {
    expect(RAW_FOODS.filter((n) => COOKED_FOODS.includes(n))).toEqual([]);
    expect(COOKED_FOODS_SAVORY.filter((n) => COOKED_FOODS_SWEET.includes(n))).toEqual([]);
  });

  it("危険・誤分類だった食材を除去・修正している", () => {
    const removedRaw = [
      "とちの実", "キャッサバ", "コンニャクイモ", "どくだみ", "アフリカンチェリー", "サワーサップ",
    ];
    for (const name of removedRaw) expect(RAW_FOODS).not.toContain(name);

    expect(RAW_FOODS).toContain("サワーソップ");
    expect(RAW_FOODS).toContain("コンニャク");

    const removedSavory = [
      "ジェラビ風カレー", "シュトルーデル（惣菜）", "ボフロット", "ハムシソーセージ", "ンゴジョ",
    ];
    for (const name of removedSavory) expect(COOKED_FOODS_SAVORY).not.toContain(name);

    expect(COOKED_FOODS_SAVORY).toContain("チキョフテ");
    expect(COOKED_FOODS_SAVORY).toContain("ンシマ");

    expect(COOKED_FOODS_SWEET).toContain("アップルシュトルーデル");
    expect(COOKED_FOODS_SWEET).toContain("ボフロット");
    expect(COOKED_FOODS_SWEET).toContain("しろ氷");
    expect(COOKED_FOODS_SWEET).not.toContain("みぞれ");
    expect(COOKED_FOODS_SWEET).toContain("ジャレビ");
  });

  it("調理済み料理はすべて FOOD_CAT_MAP に登録される", () => {
    const unmapped = COOKED_FOODS.filter((n) => !FOOD_CAT_MAP.has(n));
    expect(unmapped).toEqual([]);
  });

  it("ジョージア・中央アジア料理に専用カテゴリが付く", () => {
    expect(FOOD_CAT_MAP.get("チャフカパリ")).toBe("georgian");
    expect(FOOD_CAT_MAP.get("ヒンカリ")).toBe("georgian");
    expect(FOOD_CAT_MAP.get("プロフ")).toBe("central_asian");
    expect(FOOD_CAT_MAP.get("マンティ")).toBe("central_asian");
    expect(FOOD_CAT_MAP.get("ボフロット")).toBe("mideast_sweets");
  });

  it("調理済み料理名に「風」が含まれない", () => {
    const withFu = COOKED_FOODS.filter((n) => n.includes("風"));
    expect(withFu).toEqual([]);
  });

  it("括弧付きや誤表記だった料理名を修正している", () => {
    const removed = [
      "クバン肉のシチュー", "ボボラピスン", "ケークバス", "チェーボー", "マクルート", "ライスケーキ（甘口）",
    ];
    for (const name of removed) expect(COOKED_FOODS).not.toContain(name);

    expect(COOKED_FOODS_SAVORY).toContain("クバンボルシチ");
    expect(COOKED_FOODS_SWEET).toContain("ピサンゴレン");
    expect(COOKED_FOODS_SWEET).toContain("ケークバサー");
    expect(COOKED_FOODS_SWEET).toContain("チェバマウ");
    expect(COOKED_FOODS_SWEET).toContain("マクルード");
    expect(COOKED_FOODS_SWEET).toContain("ライスケーキ");

    const withParen = COOKED_FOODS.filter((n) => /[（(].+[）)]/.test(n));
    expect(withParen).toEqual([]);
  });

  it("各地域の料理が追加されている", () => {
    expect(RAW_FOODS).toContain("柿");
    expect(COOKED_FOODS_SAVORY).toContain("味噌カツ");
    expect(COOKED_FOODS_SAVORY).toContain("そうめん");
    expect(COOKED_FOODS_SAVORY).toContain("焼肉");
    expect(COOKED_FOODS_SWEET).toContain("カレーパン");
  });

  it("壺相性が直感的なカテゴリで判定される", () => {
    const mk = (base, foodCat) => ({ type: "food", _foodBase: base, foodCat });
    expect(foodMatchesPotCategory(mk("餃子", "chinese"), "soy")).toBe(true);
    expect(foodMatchesPotCategory(mk("麻辣火鍋", "chinese"), "spicy")).toBe(true);
    expect(foodMatchesPotCategory(mk("カレーライス", "japanese"), "curry")).toBe(true);
    expect(foodMatchesPotCategory(mk("寿司", "japanese"), "curry")).toBe(false);
    expect(foodMatchesPotCategory(mk("ハンバーグ", "japanese"), "butter")).toBe(true);
    expect(foodMatchesPotCategory(mk("味噌汁", "japanese"), "miso")).toBe(true);
  });

  it("日式中華は中華欄に入る", () => {
    const chukaStart = COOKED_FOODS_SAVORY.indexOf("餃子");
    const chukaEnd = COOKED_FOODS_SAVORY.indexOf("ビビンバ");
    const chuka = COOKED_FOODS_SAVORY.slice(chukaStart, chukaEnd);
    const jpStart = COOKED_FOODS_SAVORY.indexOf("寿司");
    const jpEnd = COOKED_FOODS_SAVORY.indexOf("ステーキ");
    const japanese = COOKED_FOODS_SAVORY.slice(jpStart, jpEnd);
    for (const name of ["焼き餃子", "冷やし中華", "レバニラ炒め", "しゅうまい", "ホイコーロー", "タンメン", "皿うどん", "カニ玉"]) {
      expect(chuka).toContain(name);
      expect(japanese).not.toContain(name);
    }
    expect(COOKED_FOODS_SAVORY).toContain("チュチュワラ");
    expect(COOKED_FOODS_SAVORY).toContain("エスコビッチ");
    expect(COOKED_FOODS_SAVORY).toContain("パニプリ");
    expect(COOKED_FOODS_SWEET).toContain("メロンパン");
    expect(COOKED_FOODS_SWEET).toContain("パティビンス");
    expect(COOKED_FOODS_SWEET).toContain("カルフィ");
  });
});