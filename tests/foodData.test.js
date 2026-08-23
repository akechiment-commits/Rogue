import { describe, it, expect } from "vitest";
import {
  RAW_FOODS,
  COOKED_FOODS_SAVORY,
  COOKED_FOODS_SWEET,
  COOKED_FOODS,
  FOOD_CAT_MAP,
  POT_CAT_BONUS,
  FOOD_POT_EXTRA,
  foodMatchesPotCategory,
} from "../foodData.js";
import { FOOD_DESCRIPTIONS, foodGuideDescription } from "../foodDescriptions.js";

const dup = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);

const canonicalFoodAliases = [
  ["すもも", "プラム"],
  ["柿", "カキノキの実"],
  ["回鍋肉", "ホイコーロー"],
  ["焼売", "しゅうまい"],
  ["豚汁", "とん汁"],
  ["石狩鍋", "いしかり鍋"],
  ["のっぺ汁", "のっぺい汁"],
  ["グーラッシュ", "グラーシュ"],
  ["わらび餅", "わらびもち"],
  ["マッサマンカレー", "ゲーンマッサマン"],
  ["おはぎ", "ぼた餅"],
  ["カリーヴルスト", "カレーソーセージ"],
  ["ブリニ", "ブリヌイ"],
  ["ビビンカ", "ビベンカ"],
  ["カダイフ", "カタイフ"],
];

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

  it("1500種すべてに個別説明があり、ゲーム内説明へ壺相性を混ぜない", () => {
    const allFoods = [...RAW_FOODS, ...COOKED_FOODS];
    expect(Object.keys(FOOD_DESCRIPTIONS).sort()).toEqual([...allFoods].sort());
    expect(new Set(Object.values(FOOD_DESCRIPTIONS)).size).toBe(allFoods.length);
    for (const name of allFoods) {
      expect(FOOD_DESCRIPTIONS[name], name).toMatch(/。/);
      expect(FOOD_DESCRIPTIONS[name], name).not.toMatch(/壺|相性/);
    }
    expect(FOOD_DESCRIPTIONS["うな重"]).toBe("重箱にご飯を詰め、うなぎの蒲焼きを並べてタレをかけた料理。");
    expect(foodGuideDescription("目玉焼き")).toContain("壺相性：");
    expect(foodGuideDescription("目玉焼き")).toContain("味噌");
  });

  it("同一料理の表記揺れを別の食料として登録しない", () => {
    for (const [canonical, alias] of canonicalFoodAliases) {
      const all = [...RAW_FOODS, ...COOKED_FOODS];
      expect(all).toContain(canonical);
      expect(all).not.toContain(alias);
    }
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

  it("重複整理後の目標数に揃い、新規料理の相性も個別設定される", () => {
    expect(RAW_FOODS).toHaveLength(400);
    expect(COOKED_FOODS).toHaveLength(1100);
    expect(FOOD_CAT_MAP.get("バインセオ")).toBe("southeast_asian");
    expect(FOOD_CAT_MAP.get("チョリソー")).toBe("spanish");
    expect(FOOD_CAT_MAP.get("パブロバ")).toBe("western_sweets");
    expect(foodMatchesPotCategory({ _foodBase: "カイザーシュマーレン", foodCat: "western_sweets" }, "butter")).toBe(true);
    expect(COOKED_FOODS).toContain("目玉焼き");
    expect(COOKED_FOODS).toContain("煮込みハンバーグ");
    expect(COOKED_FOODS).toContain("しるこサンド");
    expect(COOKED_FOODS).not.toContain("カップヌードル");
    expect(COOKED_FOODS).not.toContain("ポッキー");
    expect(FOOD_CAT_MAP.get("目玉焼き")).toBe("japanese");
    expect(foodMatchesPotCategory({ _foodBase: "目玉焼き", foodCat: FOOD_CAT_MAP.get("目玉焼き") }, "miso")).toBe(true);
    expect(foodMatchesPotCategory({ _foodBase: "目玉焼き", foodCat: FOOD_CAT_MAP.get("目玉焼き") }, "lemon")).toBe(false);
    expect(foodMatchesPotCategory({ _foodBase: "味噌煮込みうどん", foodCat: FOOD_CAT_MAP.get("味噌煮込みうどん") }, "miso")).toBe(true);
    expect(foodMatchesPotCategory({ _foodBase: "ドライカレー", foodCat: FOOD_CAT_MAP.get("ドライカレー") }, "curry")).toBe(true);
    expect(foodMatchesPotCategory({ _foodBase: "ミルクレープ", foodCat: FOOD_CAT_MAP.get("ミルクレープ") }, "butter")).toBe(true);
    expect(foodMatchesPotCategory({ _foodBase: "きなこ餅", foodCat: FOOD_CAT_MAP.get("きなこ餅") }, "sesame")).toBe(true);
  });

  it("ブランド商品を調理済み食料から除外する", () => {
    const brandFoods = [
      "カップヌードル", "チキンラーメン", "ペヤング", "赤いきつね", "緑のたぬき", "どん兵衛",
      "じゃがりこ", "プリングルズ", "ドリトス", "かっぱえびせん", "ベビースターラーメン",
      "ハッピーターン", "柿の種", "サッポロポテト", "カール", "ピザポテト", "チップスター",
      "ビッグマック", "チキンマックナゲット", "ケンタッキーフライドチキン",
      "ポッキー", "ブラックサンダー", "キットカット", "チョコパイ", "コアラのマーチ",
      "きのこの山", "たけのこの里", "カントリーマアム", "アルフォート", "パイの実",
      "トッポ", "ルマンド", "ハーゲンダッツ", "ガリガリ君", "あずきバー", "パピコ",
      "チロルチョコ", "ハイチュウ", "ぷっちょ", "ミルキー", "ブルボンプチ",
      "ビスコ", "たべっ子どうぶつ", "プリッツ", "エッセルスーパーカップ",
    ];
    expect(COOKED_FOODS.filter((name) => brandFoods.includes(name))).toEqual([]);
  });

  it("全食料に少なくとも1つの調味料相性がある", () => {
    const potTags = Object.values(POT_CAT_BONUS).flat();
    for (const name of RAW_FOODS) {
      const tags = FOOD_POT_EXTRA[name] || [];
      expect(tags.length, name).toBeGreaterThan(0);
      expect(tags.some(tag => potTags.includes(tag)), name).toBe(true);
    }
    for (const name of COOKED_FOODS) {
      const category = FOOD_CAT_MAP.get(name);
      expect(Object.values(POT_CAT_BONUS).some(tags => tags.includes(category)), name).toBe(true);
    }
  });

  it("FOOD_POT_EXTRA の料理名はすべてリストに存在する", () => {
    for (const name of Object.keys(FOOD_POT_EXTRA)) {
      expect([...RAW_FOODS, ...COOKED_FOODS]).toContain(name);
    }
  });

  it("壺相性が直感的なカテゴリで判定される", () => {
    const mk = (base, foodCat) => ({ type: "food", _foodBase: base, foodCat });
    expect(foodMatchesPotCategory(mk("餃子", "chinese"), "soy")).toBe(true);
    expect(foodMatchesPotCategory(mk("餃子", "chinese"), "garlic")).toBe(true);
    expect(foodMatchesPotCategory(mk("麻辣火鍋", "chinese"), "spicy")).toBe(true);
    expect(foodMatchesPotCategory(mk("カレーライス", "japanese"), "curry")).toBe(true);
    expect(foodMatchesPotCategory(mk("寿司", "japanese"), "curry")).toBe(false);
    expect(foodMatchesPotCategory(mk("ハンバーグ", "japanese"), "butter")).toBe(true);
    expect(foodMatchesPotCategory(mk("味噌汁", "japanese"), "miso")).toBe(true);
    expect(foodMatchesPotCategory(mk("トムヤムクン", "southeast_asian"), "spicy")).toBe(true);
    expect(foodMatchesPotCategory(mk("フォー", "southeast_asian"), "spicy")).toBe(false);
    expect(foodMatchesPotCategory(mk("カレーパン", "japanese_sweets"), "curry")).toBe(true);
    expect(foodMatchesPotCategory(mk("冷奴", "japanese"), "sesame")).toBe(true);
    expect(foodMatchesPotCategory(mk("ゴマ団子", "asian_sweets"), "sesame")).toBe(true);
    expect(foodMatchesPotCategory(mk("ライタ", "indian"), "yogurt")).toBe(true);
    expect(foodMatchesPotCategory(mk("セビーチェ", "spanish"), "lemon")).toBe(true);
    expect(foodMatchesPotCategory(mk("チョコ大福", "japanese_sweets"), "choco")).toBe(true);
    expect(foodMatchesPotCategory(mk("バターチキンカレー", "indian"), "butter")).toBe(true);
    expect(foodMatchesPotCategory(mk("アドボ", "southeast_asian"), "soy")).toBe(true);
  });

  it("日式中華は中華欄に入る", () => {
    const chukaStart = COOKED_FOODS_SAVORY.indexOf("餃子");
    const chukaEnd = COOKED_FOODS_SAVORY.indexOf("ビビンバ");
    const chuka = COOKED_FOODS_SAVORY.slice(chukaStart, chukaEnd);
    const jpStart = COOKED_FOODS_SAVORY.indexOf("寿司");
    const jpEnd = COOKED_FOODS_SAVORY.indexOf("ステーキ");
    const japanese = COOKED_FOODS_SAVORY.slice(jpStart, jpEnd);
    for (const name of ["焼き餃子", "冷やし中華", "レバニラ炒め", "タンメン", "皿うどん", "カニ玉"]) {
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
