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
  Object.freeze({ lines: Object.freeze([
    "革の鎧を3枚まとめると『腹持ちの胴』になるんだってさ。師匠から聞いた話だけど。",
    "やった！革の鎧を3枚合成したら『腹持ちの胴』になったんだ。空腹の進みが少し遅くなるぞ！",
    "そういえば、革の鎧3枚で『腹持ちの胴』ができるらしいよ。試すなら合成の大箱だね。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "鎖帷子は3枚まとめて合成すると『ミスリルの胴着』になるらしい。聞いた話だけどね。",
    "見てくれよ！鎖帷子を3枚合成したら『ミスリルの胴着』になったんだ。",
    "鎖帷子を集めてるなら捨てないほうがいいよ。3枚で『ミスリルの胴着』になるからさ。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "短剣を3本合成すると『猫の爪』になるんだって。昔、酒場で聞いた話だけど。",
    "短剣3本で『猫の爪』！　初めてできた時は思わず声が出たよ。",
    "あ、短剣を3本持ってたら合成してみなよ。『猫の爪』に変わるから。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "ゴブリンバットを3本合わせると『鬼棍棒』になるって聞いたよ。",
    "やったぞ！ゴブリンバット3本から『鬼棍棒』ができたんだ。",
    "ゴブリンバットって侮れないよ。3本合成すれば『鬼棍棒』になるんだ。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "ゾンビキラーは3本合成で『エクスカリバー』になるらしい。仲間から聞いた話だけど。",
    "ゾンビキラー3本で『エクスカリバー』！　あれは本当に驚いたなあ。",
    "もしゾンビキラーが3本そろったら、合成してみるといいよ。『エクスカリバー』になる。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "ドラゴンキラーを3本合成すると『鉄塊』になるってさ。信じるかは君次第だけど。",
    "本当だったよ！ドラゴンキラー3本が『鉄塊』になったんだ。",
    "ドラゴンキラーは3本残しておくといい。合成すれば『鉄塊』になるから。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "バードキラーを3本合成すると『スナイパー』になるらしいよ。",
    "バードキラー3本で『スナイパー』ができた時は、思わず拍手しちゃった。",
    "浮いてる敵に困ってるなら、バードキラーを3本合成して『スナイパー』にするといいよ。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "炎の剣を3本合成すると『フランベルジュ』になる、と古い冒険譚で読んだよ。",
    "炎の剣を3本集めて合成したら『フランベルジュ』になった！すごいだろ？",
    "炎の剣は3本そろえて合成。『フランベルジュ』になるからね。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "氷の剣を3本集めると『アイスソード』になるって聞いたことがある。",
    "氷の剣3本が『アイスソード』になったんだ。ひんやりしてて、いかにもって感じだよね。",
    "氷の剣が余ったら3本合成してみなよ。『アイスソード』になるよ。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "雷の剣を3本合成すると『千鳥』になるらしい。名前が格好いいよね。",
    "雷の剣を3本合成したら『千鳥』ができたんだ！あの時は興奮したなあ。",
    "雷の剣は3本まとめて合成。『千鳥』に変わるよ。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "三元の刃を3本集めると『アルテマソード』になるって、誰かが言ってたな。",
    "三元の刃3本で『アルテマソード』！　自分で見つけた時は鳥肌が立ったよ。",
    "三元の刃は3本まで取っておきな。合成すれば『アルテマソード』になるから。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "『万能キラー』を3本合成すると『全能キラー』になるらしい。名前からして強そうだね。",
    "本当にできたよ、『万能キラー』3本から『全能キラー』！　夢があるだろ？",
    "万能キラーが3本そろったら、合成して『全能キラー』を狙ってみるといい。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "『アサメ』を3本合成すると『マジックベーン』になるんだって。魔法使いの友人から聞いた。",
    "アサメ3本が『マジックベーン』に！　魔法の威力が上がって、あれは嬉しかったなあ。",
    "アサメを3本集めて合成すると『マジックベーン』。覚えておいて損はないよ。",
  ]) }),
  Object.freeze({ lines: Object.freeze([
    "ドラゴンメイルをベースに三属性の耐性をそろえると『元素王の鎧』になるらしいよ。",
    "氷竜のウロコをベースに炎・氷・雷の耐性を集めたら、『元素王の鎧』になったんだ！",
    "ドラゴンメイル・氷竜のウロコ・ゴムゴムの胴のどれかをベースにして、三属性の耐性をそろえると『元素王の鎧』だ。",
  ]) }),
]);

const WANDERING_ADVENTURER_SMALL_TALK = Object.freeze([
  "ああ、誰かと話すの久しぶりだなあ。魔物相手だと返事がないからね。",
  "この床、さっきから同じところを歩いてる気がするんだよね……気のせいかな。",
  "お腹すいたなあ。さっき食べたばかりなのに。",
  "靴に小石が入ってる気がする。ずっと気になってるんだ。",
  "この部屋、静かだね。こういう時のほうが、逆に落ち着かないな。",
  "いい匂いがする……いや、何も持ってなかった。気のせいか。",
  "独り言が多い？　誰かと話すのが久しぶりでさ。",
  "冒険者って普段なに食べてると思う？　今日の夕飯を考えてたんだ。",
  "髪が顔にかかって邪魔なんだ。戦う前に結んでおけばよかったよ。",
  "休憩って大事だね。あと一歩で倒れそうだったよ。……いや、今は大丈夫。",
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
  if (randomFn() < 0.20) {
    const previousChatter = monster?.lastAdventurerSmallTalkIndex;
    const chatterCandidates = WANDERING_ADVENTURER_SMALL_TALK
      .map((line, index) => ({ line, index }))
      .filter((entry) => entry.index !== previousChatter);
    const chatter = chatterCandidates[Math.min(chatterCandidates.length - 1,
      Math.floor(Math.max(0, randomFn()) * chatterCandidates.length))]
      || { line: WANDERING_ADVENTURER_SMALL_TALK[0], index: 0 };
    if (monster) monster.lastAdventurerSmallTalkIndex = chatter.index;
    return chatter.line;
  }

  const knowledge = assignWanderingAdventurerKnowledge(monster, randomFn);
  const previousLine = monster?.lastAdventurerLineIndex;
  const lineCandidates = knowledge.lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.index !== previousLine);
  const selected = lineCandidates[Math.min(lineCandidates.length - 1,
    Math.floor(Math.max(0, randomFn()) * lineCandidates.length))]
    || { line: knowledge.lines[0], index: 0 };
  if (monster) monster.lastAdventurerLineIndex = selected.index;
  return selected.line;
}
