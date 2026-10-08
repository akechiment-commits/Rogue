const ADVENTURER_GIVEN_NAMES = Object.freeze([
  "アレン", "リーナ", "カイル", "ミレイユ", "フェリクス", "セシル", "ノエル", "レオン",
  "エミリア", "ロラン", "マリエル", "ユリアン", "クロエ", "ガイ", "エステル", "ルカ",
  "フィン", "サーシャ", "エドガー", "ニーナ", "シオン", "テオ", "アイリス", "オスカー",
]);

const ADVENTURER_FAMILY_NAMES = Object.freeze([
  "アッシュフォード", "グレイウッド", "ヴァレン", "ノースウィンド", "クロス", "エルド",
  "フェルン", "ハイランド", "ベルモント", "シルヴァ", "レイヴン", "ブランシェ",
  "カーディナル", "ミスト", "ロックウェル", "アルベルト", "ウィンザー", "オルブライト",
  "リンドバーグ", "フロスト", "サザーランド", "ラングレー", "ヴェイル", "モーガン",
]);

export const WANDERING_ADVENTURER_HINTS = Object.freeze([
  "革の鎧を3枚続けて合成すると、空腹に強い『腹持ちの胴』になる。",
  "鎖帷子を3枚合成すると、防御力と軽減能力を持つ『ミスリルの胴着』になる。",
  "短剣を3本まとめると、連撃向きの『猫の爪』になるらしい。",
  "ゴブリンバットを3本合成すると、会心の出やすい『鬼棍棒』ができる。",
  "ゾンビキラーを3本合成すれば『エクスカリバー』、ドラゴンキラーなら『鉄塊』、バードキラーなら『スナイパー』だ。",
  "同じ属性の剣を3本合成すると、その属性を極めた剣に変わる。",
  "三元の刃を3本集めると、三属性を極めた『アルテマソード』になる。",
  "『万能キラー』を3本合成すると、三種族に強い『全能キラー』になる。",
  "魔法強化の能力を持つ『アサメ』を3本合成すると、『マジックベーン』が作れる。",
  "ドラゴンメイル・氷竜のウロコ・ゴムゴムの胴のどれかをベースに、炎・氷・雷の耐性を揃えると『元素王の鎧』になる。",
]);

export function isWanderingNpc(monster) {
  return !!(monster?.isWanderingMerchant || monster?.isWanderingAdventurer);
}

export function createWanderingAdventurerName(randomFn = Math.random) {
  const pick = (values) => values[Math.min(values.length - 1, Math.floor(Math.max(0, randomFn()) * values.length))];
  return `${pick(ADVENTURER_GIVEN_NAMES)}・${pick(ADVENTURER_FAMILY_NAMES)}`;
}

export function isWanderingAdventurerName(name) {
  const parts = typeof name === "string" ? name.split("・") : [];
  return parts.length === 2 && ADVENTURER_GIVEN_NAMES.includes(parts[0]) && ADVENTURER_FAMILY_NAMES.includes(parts[1]);
}

/** 階層と3段階の実力抽選から、毎回少し異なる冒険者の能力値を作る。 */
export function rollWanderingAdventurerStats(depth = 0, randomFn = Math.random) {
  const randomInt = (min, max) => min + Math.min(max - min, Math.floor(Math.max(0, randomFn()) * (max - min + 1)));
  const floor = Math.max(0, Math.floor(Number(depth) || 0));
  const rank = randomInt(0, 2); // 弱手・標準・手練れ
  const hp = randomInt(20, 40) + floor * 2 + rank * 20;
  const atk = randomInt(7, 15) + Math.floor(floor * 0.6) + rank * 7;
  const def = randomInt(0, 3) + Math.floor(floor * 0.25) + rank * 4;
  const exp = 10 + floor * 2 + rank * 10;
  return { hp, atk, def, exp };
}

/** 同じ助言が連続しないように、実装済みの隠し合成から一つ選ぶ。 */
export function nextWanderingAdventurerHint(monster, randomFn = Math.random) {
  const previous = monster?.lastAdventurerHintIndex;
  const candidates = WANDERING_ADVENTURER_HINTS
    .map((hint, index) => ({ hint, index }))
    .filter((entry) => entry.index !== previous);
  const selected = candidates[Math.min(candidates.length - 1,
    Math.floor(Math.max(0, randomFn()) * candidates.length))] || { hint: WANDERING_ADVENTURER_HINTS[0], index: 0 };
  if (monster) monster.lastAdventurerHintIndex = selected.index;
  return selected.hint;
}
