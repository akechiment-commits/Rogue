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

export const WANDERING_ADVENTURER_KNOWLEDGE = Object.freeze([
  Object.freeze({ recipe: "革の鎧3枚を合成すると", result: "腹持ちの胴" }),
  Object.freeze({ recipe: "鎖帷子3枚を合成すると", result: "ミスリルの胴着" }),
  Object.freeze({ recipe: "短剣3本を合成すると", result: "猫の爪" }),
  Object.freeze({ recipe: "ゴブリンバット3本を合成すると", result: "鬼棍棒" }),
  Object.freeze({ recipe: "ゾンビキラー3本を合成すると", result: "エクスカリバー" }),
  Object.freeze({ recipe: "ドラゴンキラー3本を合成すると", result: "鉄塊" }),
  Object.freeze({ recipe: "バードキラー3本を合成すると", result: "スナイパー" }),
  Object.freeze({ recipe: "炎の剣3本を合成すると", result: "フランベルジュ" }),
  Object.freeze({ recipe: "氷の剣3本を合成すると", result: "アイスソード" }),
  Object.freeze({ recipe: "雷の剣3本を合成すると", result: "千鳥" }),
  Object.freeze({ recipe: "三元の刃3本を合成すると", result: "アルテマソード" }),
  Object.freeze({ recipe: "万能キラー3本を合成すると", result: "全能キラー" }),
  Object.freeze({ recipe: "アサメ3本を合成すると", result: "マジックベーン" }),
  Object.freeze({ recipe: "ドラゴンメイル・氷竜のウロコ・ゴムゴムの胴のいずれかをベースに三属性の耐性をそろえると", result: "元素王の鎧" }),
]);

const WANDERING_ADVENTURER_PERSONALITIES = Object.freeze([
  Object.freeze({
    key: "rumor_monger",
    infoLine: (fact, variant) => [
      `ねえ、聞いた話なんだけどさ、${fact.recipe}『${fact.result}』になるらしいよ。`,
      `酒場で耳にしたんだ。${fact.recipe}『${fact.result}』になるってさ。`,
      `師匠から聞いたんだけど、${fact.recipe}『${fact.result}』になるんだって。`,
    ][variant],
    smallTalk: Object.freeze([
      "この辺の石畳、昔はもっと白かったらしいよ。誰から聞いたかは忘れたけど。",
      "この部屋の隅、風が通るって噂だよ。……まあ、今は感じないけどさ。",
      "地下の食堂はスープがおいしいって聞いたんだ。どこにあるのかは知らないけど。",
      "この辺、静かだね。魔物も今日はおとなしいって話だよ。たぶんね。",
    ]),
  }),
  Object.freeze({
    key: "excited_discoverer",
    infoLine: (fact, variant) => [
      `聞いてくれ！${discoveredRecipePhrase(fact.recipe)}『${fact.result}』になったんだ。自分で見つけた時は声が出たよ！`,
      `やったぞ！${discoveredRecipePhrase(fact.recipe)}『${fact.result}』になったんだ！初めて知った時は興奮したなあ。`,
      `この発見、君にも伝えたかったんだ。${discoveredRecipePhrase(fact.recipe)}『${fact.result}』になったんだよ！`,
    ][variant],
    smallTalk: Object.freeze([
      "ああ、やっと人に会えた！魔物相手だと返事がないから、ちょっと嬉しいな。",
      "この部屋、なんだかいい感じだ！根拠はないけど、宝箱がありそうな気がする！",
      "さっきの足音、僕のじゃないと思うんだ。……えっ、君でもない？",
      "冒険って最高だよな！お腹が空くこと以外は、ほんとに最高！",
    ]),
  }),
  Object.freeze({
    key: "practical",
    infoLine: (fact, variant) => [
      `要点だけだ。${fact.recipe}『${fact.result}』になる。覚えておけよ。`,
      `無駄話は苦手なんだが、これは役立つ。${fact.recipe}『${fact.result}』だ。`,
      `忘れるな。${fact.recipe}『${fact.result}』になる。以上だ。`,
    ][variant],
    smallTalk: Object.freeze([
      "靴の紐がほどけてる。……ああ、俺のじゃない。君のだ。",
      "腹が減る前に何か食べておけよ。……いや、装備の話じゃない。夕飯の話だ。",
      "ここで立ち話をしてると冷えるな。先に進むぞ。",
      "休憩は大事だ。俺はもう少し歩いてからにする。",
    ]),
  }),
]);

function discoveredRecipePhrase(recipe) {
  if (recipe.endsWith("すると")) return `${recipe.slice(0, -3)}したら`;
  if (recipe.endsWith("ると")) return `${recipe.slice(0, -2)}えたら`;
  return recipe;
}

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

/** 知識は個体ごとに一つだけ割り当て、ロード済みの旧個体にも一度だけ付与する。 */
export function assignWanderingAdventurerKnowledge(monster, randomFn = Math.random) {
  if (!monster) return null;
  if (!Number.isInteger(monster.adventurerInfoIndex) ||
      monster.adventurerInfoIndex < 0 || monster.adventurerInfoIndex >= WANDERING_ADVENTURER_KNOWLEDGE.length) {
    monster.adventurerInfoIndex = Math.min(WANDERING_ADVENTURER_KNOWLEDGE.length - 1,
      Math.floor(Math.max(0, randomFn()) * WANDERING_ADVENTURER_KNOWLEDGE.length));
  }
  return WANDERING_ADVENTURER_KNOWLEDGE[monster.adventurerInfoIndex];
}

/** 個体ごとに話し方を固定し、雑談にも同じ性格を反映する。 */
export function assignWanderingAdventurerPersonality(monster, randomFn = Math.random) {
  if (!monster) return null;
  if (!Number.isInteger(monster.adventurerPersonalityIndex) ||
      monster.adventurerPersonalityIndex < 0 || monster.adventurerPersonalityIndex >= WANDERING_ADVENTURER_PERSONALITIES.length) {
    monster.adventurerPersonalityIndex = Math.min(WANDERING_ADVENTURER_PERSONALITIES.length - 1,
      Math.floor(Math.max(0, randomFn()) * WANDERING_ADVENTURER_PERSONALITIES.length));
  }
  return WANDERING_ADVENTURER_PERSONALITIES[monster.adventurerPersonalityIndex];
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

/** 一人一つの知識を、伝聞・発見談・雑談まじりの口調で返す。 */
export function nextWanderingAdventurerDialogue(monster, randomFn = Math.random) {
  const personality = assignWanderingAdventurerPersonality(monster, randomFn);
  if (!personality) return "……。";
  if (randomFn() < 0.20) {
    const previousChatter = monster?.lastAdventurerSmallTalkIndex;
    const chatterCandidates = personality.smallTalk
      .map((line, index) => ({ line, index }))
      .filter((entry) => entry.index !== previousChatter);
    const chatter = chatterCandidates[Math.min(chatterCandidates.length - 1,
      Math.floor(Math.max(0, randomFn()) * chatterCandidates.length))]
      || { line: personality.smallTalk[0], index: 0 };
    if (monster) monster.lastAdventurerSmallTalkIndex = chatter.index;
    return chatter.line;
  }

  const knowledge = assignWanderingAdventurerKnowledge(monster, randomFn);
  const previousLine = monster?.lastAdventurerLineIndex;
  const lineCandidates = [0, 1, 2]
    .map((index) => ({ index }))
    .filter((entry) => entry.index !== previousLine);
  const selected = lineCandidates[Math.min(lineCandidates.length - 1,
    Math.floor(Math.max(0, randomFn()) * lineCandidates.length))]
    || { index: 0 };
  if (monster) monster.lastAdventurerLineIndex = selected.index;
  return personality.infoLine(knowledge, selected.index);
}
