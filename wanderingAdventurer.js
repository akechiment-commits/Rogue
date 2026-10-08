const ADVENTURER_FEMALE_GIVEN_NAMES = Object.freeze([
  "リーナ", "ミレイユ", "エミリア", "マリエル", "クロエ", "エステル", "サーシャ", "ニーナ",
  "アイリス", "フィオナ", "セリア", "リゼット", "ユノ", "カレン", "ミナ", "エルザ",
]);

const ADVENTURER_MALE_GIVEN_NAMES = Object.freeze([
  "アレン", "カイル", "フェリクス", "セシル", "ノエル", "レオン", "ロラン", "ユリアン",
  "ガイ", "ルカ", "フィン", "エドガー", "シオン", "テオ", "オスカー", "リオ",
]);

const ADVENTURER_GIVEN_NAMES = Object.freeze([
  ...ADVENTURER_FEMALE_GIVEN_NAMES,
  ...ADVENTURER_MALE_GIVEN_NAMES,
]);

const ADVENTURER_FAMILY_NAMES = Object.freeze([
  "アッシュフォード", "グレイウッド", "ヴァレン", "ノースウィンド", "クロス", "エルド",
  "フェルン", "ハイランド", "ベルモント", "シルヴァ", "レイヴン", "ブランシェ",
  "カーディナル", "ミスト", "ロックウェル", "アルベルト", "ウィンザー", "オルブライト",
  "リンドバーグ", "フロスト", "サザーランド", "ラングレー", "ヴェイル", "モーガン",
]);

export const WANDERING_ADVENTURER_SPRITES = Object.freeze([
  Object.freeze({ tile: 226, gender: "female", style: "green-cloaked swordswoman" }),
  Object.freeze({ tile: 227, gender: "female", style: "blue-coated staff user" }),
  Object.freeze({ tile: 228, gender: "male", style: "red-scarfed swordsman" }),
  Object.freeze({ tile: 229, gender: "male", style: "teal-vested archer" }),
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
    label: "噂好き",
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
    label: "発見に興奮する",
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
    label: "実務的",
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
  Object.freeze({
    key: "cautious",
    label: "慎重派",
    infoLine: (fact, variant) => [
      `間違っていたらごめんね。${fact.recipe}『${fact.result}』らしいよ。私はまだ試せていないけど。`,
      `確かな話かは分からないんだけど……${fact.recipe}『${fact.result}』になるって聞いたの。`,
      `役に立つか分からないけど、${fact.recipe}『${fact.result}』みたい。念のため覚えておいて。`,
    ][variant],
    smallTalk: Object.freeze([
      "この先、床が崩れたりしないよね……？一応、端を歩こうかな。",
      "さっき何か聞こえた気がするの。気のせいだといいんだけど。",
      "地図を何度も確かめちゃうんだ。迷うよりはいいよね。",
      "ここで一息ついてから進もうよ。急いで転んだら大変だし。",
    ]),
  }),
  Object.freeze({
    key: "proud",
    label: "自信家",
    infoLine: (fact, variant) => [
      `ふふん、私が自分で確かめたよ。${fact.recipe}『${fact.result}』だ。`,
      `これを見つけるのに苦労したんだ。${fact.recipe}『${fact.result}』、覚えておくといい。`,
      `聞いて驚け。${fact.recipe}『${fact.result}』になる。私の調査に間違いはないよ。`,
    ][variant],
    smallTalk: Object.freeze([
      "この装備、なかなか似合ってると思わない？見る目があるね。",
      "さっきの魔物？軽くあしらってやったよ。……まあ、少し追いかけられたけど。",
      "道に迷ったことはないよ。迷ったんじゃなくて、寄り道してるだけさ。",
      "私の勘はよく当たるんだ。今は何も思いつかないけどね。",
    ]),
  }),
  Object.freeze({
    key: "scholar",
    label: "研究熱心",
    infoLine: (fact, variant) => [
      `記録によれば、${fact.recipe}『${fact.result}』となる。材料の数を間違えないように。`,
      `確認済みの手順だ。${fact.recipe}『${fact.result}』になる。`,
      `手帳にも書いておいたよ。${fact.recipe}『${fact.result}』だ。`,
    ][variant],
    smallTalk: Object.freeze([
      "この床の模様、区画ごとに少し違うんだ。記録しておこう。",
      "足音の間隔を数えてたんだけど、途中で自分の足音と混ざっちゃった。",
      "壁の傷が気になるなあ。誰が、何回くらい通った跡なんだろう。",
      "休憩の前に、今の発見を手帳へ書き留めておかなくちゃ。",
    ]),
  }),
  Object.freeze({
    key: "sleepy",
    label: "眠たがり",
    infoLine: (fact, variant) => [
      `ふあぁ……たしか、${fact.recipe}『${fact.result}』だったよ。たぶんね。`,
      `ん……起きてるよ。${fact.recipe}『${fact.result}』、それだけ伝えたかったんだ……。`,
      `眠くて頭が回らないけど……${fact.recipe}『${fact.result}』。忘れないうちに言えた……。`,
    ][variant],
    smallTalk: Object.freeze([
      "歩きながら寝る方法、誰か知らないかな……。",
      "この壁、背中を預けたら気持ちよさそう……いや、やっぱりやめとこう。",
      "さっきの魔物、夢に出てきそうだなあ……。",
      "あと少し歩いたら休もう……その『あと少し』が長いんだけど。",
    ]),
  }),
  Object.freeze({
    key: "optimistic",
    label: "楽天家",
    infoLine: (fact, variant) => [
      `いいこと教えるね！${fact.recipe}『${fact.result}』になるんだって。試すのが楽しみ！`,
      `これを知ったら冒険がもっと楽しくなるよ。${fact.recipe}『${fact.result}』だって！`,
      `大丈夫、きっと役に立つよ！${fact.recipe}『${fact.result}』になるんだ。`,
    ][variant],
    smallTalk: Object.freeze([
      "お腹が空いてきたけど、きっとこの先にいい食べ物があるよ！",
      "転んでも大丈夫！起き上がれば冒険の続きだもんね。",
      "ここ、なんだか運がよさそう！根拠はないけど、そういう日もあるよ。",
      "知らない道ってわくわくするね。帰り道はあとで考えよう！",
    ]),
  }),
  Object.freeze({
    key: "veteran",
    label: "ベテラン",
    infoLine: (fact, variant) => [
      `長く潜ってりゃ分かる。${fact.recipe}『${fact.result}』になるそうだ。準備は怠るなよ。`,
      `若い頃に聞いた話だが、${fact.recipe}『${fact.result}』になる。覚えておいて損はない。`,
      `焦らず試せ。${fact.recipe}『${fact.result}』だ。急ぐと素材を無駄にするぞ。`,
    ][variant],
    smallTalk: Object.freeze([
      "昔は今より暗い洞窟もあった。慣れたつもりでも油断は禁物だ。",
      "道具は手入れが大事だぞ。壊れてからじゃ遅いからな。",
      "若い冒険者は歩くのが速いな。こっちは景色も見てるんだ。",
      "経験を積んでも、腹が減るのだけはどうにもならん。",
    ]),
  }),
  Object.freeze({
    key: "poetic",
    label: "詩人気質",
    infoLine: (fact, variant) => [
      `風の便りに聞いたよ。${discoveredRecipePhrase(fact.recipe)}『${fact.result}』と。`,
      `素材が出会うと姿を変える。${fact.recipe}『${fact.result}』になるんだ。`,
      `剣にも鎧にも縁がある。${fact.recipe}『${fact.result}』と、私は覚えているよ。`,
    ][variant],
    smallTalk: Object.freeze([
      "松明のゆらぎを見ていると、炎も旅をしているように思えるね。",
      "足音が石の上で小さな歌になってる。君にも聞こえるかな。",
      "迷宮の風は、どこから来てどこへ行くんだろう。",
      "静かな部屋だね。言葉を使うのが少し惜しくなるよ。",
    ]),
  }),
  Object.freeze({
    key: "timid",
    label: "怖がり",
    infoLine: (fact, variant) => [
      `あ、あのね……${fact.recipe}『${fact.result}』になるらしいんだ。怖いけど、試す価値はあると思う。`,
      `小声で言うね。${fact.recipe}『${fact.result}』だって。魔物に聞かれないように……。`,
      `誰かに聞いたんだけど、${fact.recipe}『${fact.result}』になるそうだよ。たぶん大丈夫……だよね。`,
    ][variant],
    smallTalk: Object.freeze([
      "今の物音、君も聞いた？聞こえたよね……？",
      "背中を壁につけて歩くと、少し安心するんだ。",
      "ここに魔物はいないよね……いたら、すぐ教えてね。",
      "一緒にいると心強いな。はぐれないようにしよう。",
    ]),
  }),
]);

function discoveredRecipePhrase(recipe) {
  if (recipe.endsWith("すると")) return `${recipe.slice(0, -3)}したら`;
  if (recipe.endsWith("ると")) return `${recipe.slice(0, -2)}れば`;
  return recipe;
}

export function isWanderingNpc(monster) {
  return !!(monster?.isWanderingMerchant || monster?.isWanderingAdventurer);
}

export function createWanderingAdventurerName(randomFn = Math.random, gender = null) {
  const pick = (values) => values[Math.min(values.length - 1, Math.floor(Math.max(0, randomFn()) * values.length))];
  const givenNames = gender === "female"
    ? ADVENTURER_FEMALE_GIVEN_NAMES
    : gender === "male"
      ? ADVENTURER_MALE_GIVEN_NAMES
      : ADVENTURER_GIVEN_NAMES;
  return `${pick(givenNames)}・${pick(ADVENTURER_FAMILY_NAMES)}`;
}

export function createWanderingAdventurerIdentity(randomFn = Math.random) {
  const index = Math.min(WANDERING_ADVENTURER_SPRITES.length - 1,
    Math.floor(Math.max(0, randomFn()) * WANDERING_ADVENTURER_SPRITES.length));
  const sprite = WANDERING_ADVENTURER_SPRITES[index];
  return {
    name: createWanderingAdventurerName(randomFn, sprite.gender),
    tile: sprite.tile,
    adventurerSpriteIndex: index,
    adventurerGender: sprite.gender,
  };
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
