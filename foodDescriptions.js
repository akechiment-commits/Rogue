import {
  RAW_FOODS,
  COOKED_FOODS,
  FOOD_CAT_MAP,
  FOOD_CAT_NAMES,
  FOOD_POT_EXTRA,
  POT_CAT_BONUS,
  POT_CAT_LABELS,
} from "./foodData.js";
import { FOOD_DESCRIPTION_OVERRIDES } from "./foodDescriptionOverrides.js";

/* 生食料は RAW_FOODS の章立てをそのまま説明用の分類として使う。 */
const RAW_GROUPS = [
  { label: "果物", start: "いちご", end: "かぼちゃ", detail: "生で食べる甘酸っぱい実。" },
  { label: "野菜・葉物", start: "かぼちゃ", end: "しいたけ", detail: "煮物や炒め物にも使う野菜。" },
  { label: "きのこ", start: "しいたけ", end: "くるみ", detail: "香りと食感を生かして料理するきのこ。" },
  { label: "木の実・豆・種", start: "くるみ", end: "しょうが", detail: "香ばしく食べられる木の実や種。" },
  { label: "ハーブ・香辛料", start: "しょうが", end: "昆布", detail: "料理の香りや辛味を加える香草・香辛料。" },
  { label: "海藻・水草", start: "昆布", end: "むかご", detail: "汁物や和え物にも使う海藻。" },
  { label: "芋・その他根菜", start: "むかご", end: "まぐろ", detail: "煮物や蒸し物に使う根菜・でんぷん作物。" },
  { label: "魚介", start: "まぐろ", end: "鶏肉", detail: "刺身や焼き物にする魚介。" },
  { label: "肉類・卵", start: "鶏肉", end: null, detail: "加熱して食べる肉や卵。" },
];

const _rawGroupRanges = RAW_GROUPS.map((group) => ({
  ...group,
  from: RAW_FOODS.indexOf(group.start),
  to: group.end == null ? RAW_FOODS.length : RAW_FOODS.indexOf(group.end),
}));

for (const group of _rawGroupRanges) {
  if (group.from < 0 || group.to <= group.from) {
    throw new Error(`生食料説明の分類範囲が不正: ${group.start}〜${group.end ?? "末尾"}`);
  }
}

function rawGroupFor(name) {
  const index = RAW_FOODS.indexOf(name);
  return _rawGroupRanges.find((group) => index >= group.from && index < group.to) || null;
}

const COOKED_REGION_BY_CATEGORY = {
  italian: "イタリアの",
  greek: "ギリシャの",
  chinese: "中国の",
  korean: "韓国の",
  southeast_asian: "東南アジアの",
  french: "フランスの",
  german: "ドイツの",
  japanese: "日本の",
  american: "アメリカの",
  caribbean: "カリブの",
  spanish: "スペインの",
  portuguese: "ポルトガルの",
  middle_eastern: "中東の",
  turkish: "トルコの",
  indian: "インドの",
  russian: "東欧・ロシアの",
  georgian: "ジョージアの",
  central_asian: "中央アジアの",
  other: "北欧などの",
  western_sweets: "洋菓子の",
  japanese_sweets: "日本の",
  asian_sweets: "アジア菓子の",
  mideast_sweets: "中東菓子の",
};

function cookedRegion(category) {
  return COOKED_REGION_BY_CATEGORY[category] || `${FOOD_CAT_NAMES[category] || "各地"}の`;
}

function sweetForm(name) {
  if (/(餅|大福|団子|まんじゅう|羊羹|きんつば|ぜんざい|あんこ|おはぎ|ぼた餅|最中|かるかん|しるこ)/.test(name)) {
    return "餡やもちを使う甘味。";
  }
  if (/(ゼリー|プリン|ムース|アイス|ジェラート|ソルベ|パフェ|クレープ|ケーキ|タルト|パイ|ワッフル|パンケーキ|フレンチトースト|ドーナツ)/.test(name)) {
    return "生地や果物、乳製品を使う菓子。";
  }
  if (/(焼き|揚げ|煎餅|かりんとう|けんぴ|ポップコーン|飴|あめ|わたあめ|サンド|パン)/.test(name)) {
    return "焼く・揚げるなどして作る菓子。";
  }
  return "甘味として食べられる菓子。";
}

function savoryForm(name) {
  if (/(丼|重|ご飯|飯|ライス|チャーハン|炒飯|ピラフ|パエリア|リゾット)/.test(name)) {
    return "ご飯と具材を合わせた料理。";
  }
  if (/(うどん|そば|ラーメン|パスタ|スパゲッティ|フォー|麺|ビーフン|そうめん|ひやむぎ|ニョッキ|焼きそば)/.test(name)) {
    return "麺と具材を合わせた料理。";
  }
  if (/(ナーラ|ネーゼ|ペペロンチーノ|アラビアータ|ペスカトーレ|プッタネスカ|ジェノベーゼ|アルフレード|オーリオ|トルテリーニ|パッパルデッレ|フェットチーネ|ブカティーニ|リガトーニ|オレキエッテ|ラビオリ|マカロニ)/.test(name)) {
    return "パスタ料理。";
  }
  if (/(スープ|汁|シチュー|ボルシチ|チャウダー|ミネストローネ|ポトフ|ガンボ|ファソラダ|おでん)/.test(name)) {
    return "具材を煮込んだ汁料理。";
  }
  if (/(鍋|火鍋|フォンデュ|しゃぶ|すき焼き)/.test(name)) {
    return "具材を煮ながら食べる鍋料理。";
  }
  if (/(サラダ|和え|マリネ|カプレーゼ|セビーチェ|ガスパチョ)/.test(name)) {
    return "野菜や具材を和えた料理。";
  }
  if (/(揚げ|フライ|カツ|コロッケ|天ぷら|チップス)/.test(name)) {
    return "具材を油で揚げた料理。";
  }
  if (/(蒸し|シュウマイ|焼売|小籠包|餃子|包子|春巻き|春巻|肉まん|ワンタン|ピロシキ|巻き)/.test(name)) {
    return "具材を皮で包んだ料理。";
  }
  if (/(パイ|ピザ|フォカッチャ|ブルスケッタ|パン)/.test(name)) {
    return "生地に具材を合わせて焼く料理。";
  }
  if (/(カポナータ|ラタトゥイユ|アクアパッツァ|ドルマ|ファバ|豆煮|豆料理)/.test(name)) {
    return "野菜や豆などを煮込んだ料理。";
  }
  if (/(焼き|グリル|ロースト|ステーキ|ソテー|照り焼き|塩焼き|炙り|トースト)/.test(name)) {
    return "具材を焼き上げた料理。";
  }
  if (/(炒め|炒|チャンプルー)/.test(name)) {
    return "具材を炒め合わせた料理。";
  }
  if (/(煮|煮込み|煮浸し|煮っころがし)/.test(name)) {
    return "具材を煮込んだ料理。";
  }
  if (/(パン|サンド|バーガー|ベーグル)/.test(name)) {
    return "パンと具材を合わせた料理。";
  }
  if (/(オムレツ|卵|玉子|目玉焼き)/.test(name)) {
    return "卵を使った料理。";
  }
  if (/(ソーセージ|フランクフルト|ハンバーグ|肉団子|つくね|ねぎま|手羽)/.test(name)) {
    return "肉を加工・調理した料理。";
  }
  return "その土地で親しまれる郷土料理。";
}

function cookedDescription(name) {
  const category = FOOD_CAT_MAP.get(name);
  if (!category) throw new Error(`調理済み食料の分類が見つかりません: ${name}`);
  const region = cookedRegion(category);
  const detail = category.endsWith("_sweets") ? sweetForm(name) : savoryForm(name);
  return `${region}${name}。${detail}`;
}

function buildFoodDescriptions() {
  const allFoods = [...RAW_FOODS, ...COOKED_FOODS];
  const missing = allFoods.filter((name) => !FOOD_DESCRIPTION_OVERRIDES[name]);
  if (missing.length) throw new Error(`個別食料説明が未設定: ${missing.join(", ")}`);
  return Object.fromEntries(allFoods.map((name) => [name, FOOD_DESCRIPTION_OVERRIDES[name]]));
}

export const FOOD_DESCRIPTIONS = buildFoodDescriptions();

const POT_LABEL_BY_EFFECT = {
  miso: "味噌", spicy: "唐辛子", curry: "カレー", choco: "チョコ", honey: "蜂蜜",
  olive: "オリーブ", sesame: "ごま油", butter: "バター", yogurt: "ヨーグルト",
  coconut: "ココナッツ", soy: "醤油", garlic: "にんにく", lemon: "レモン",
};

export function foodPotEffects(name) {
  const category = FOOD_CAT_MAP.get(name);
  const categories = new Set([category, ...(FOOD_POT_EXTRA[name] || [])].filter(Boolean));
  return Object.entries(POT_CAT_BONUS)
    .filter(([, acceptedCategories]) => acceptedCategories.some((accepted) => categories.has(accepted)))
    .map(([effect]) => effect);
}

export function foodPotLabels(name) {
  return foodPotEffects(name).map((effect) => POT_LABEL_BY_EFFECT[effect] || POT_CAT_LABELS[effect] || effect);
}

export function foodDescriptionCategory(name) {
  return rawGroupFor(name)?.label || FOOD_CAT_NAMES[FOOD_CAT_MAP.get(name)] || "料理";
}

export function foodGuideDetails(name) {
  const pots = foodPotLabels(name);
  return `分類：${foodDescriptionCategory(name)}\n壺相性：${pots.length ? pots.join("・") : "なし"}（相性時は満腹度2倍）`;
}

export function foodGuideDescription(name) {
  const description = FOOD_DESCRIPTIONS[name];
  if (!description) throw new Error(`食料説明が見つかりません: ${name}`);
  return `${description}\n${foodGuideDetails(name)}`;
}

const _allFoods = [...RAW_FOODS, ...COOKED_FOODS];
const _missingDescriptions = _allFoods.filter((name) => !FOOD_DESCRIPTIONS[name]);
if (_missingDescriptions.length) {
  throw new Error(`食料説明が未設定: ${_missingDescriptions.join(", ")}`);
}
