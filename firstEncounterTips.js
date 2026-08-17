const MAIN_DUNGEON_TYPES = new Set(["beginner", "intermediate", "advanced", "legend"]);

export const FIRST_ENCOUNTER_TIPS = Object.freeze({
  unidentified_item: {
    title: "正体不明の道具",
    text: [
      "薬・巻物・杖などは、冒険ごとに見た目と正体の対応が変わる。",
      "使うか鑑定すると正体が判明し、同じ見た目の道具も識別される。",
    ],
  },
  trap: {
    title: "隠れた罠",
    text: [
      "罠は普段見えず、踏むと作動して姿を現す。発見済みの罠は通常歩行では作動しない。",
      "Sキー（モバイルは「罠探し」）で周囲の罠を探せる。怪しい場所では立ち止まって調べよう。",
    ],
  },
  shop: {
    title: "ダンジョン内の店",
    text: [
      "商品は拾った時点では未払い。店の出口を守る店主に代金を払う必要がある。",
      "未払いのまま店の外へ出ると泥棒扱いになる。自分の道具を店内に置けば売却もできる。",
    ],
  },
  spring: {
    title: "泉",
    text: [
      "泉では水を飲むか、持ち物を浸せる。結果は道具の種類によって変わる。",
      "利用するたびに泉が干上がることがあるので、何に使うか考えよう。",
    ],
  },
  bigbox: {
    title: "大箱",
    text: [
      "大箱へ道具を投げ入れると、箱の種類に応じた効果が起きる。",
      "中身は直接取り出せない。さらに入れて容量オーバーさせるか、箱を壊して回収する。",
    ],
  },
  monster_house: {
    title: "モンスターハウス",
    text: [
      "部屋の敵が一斉に目覚めた。囲まれたまま戦うのは危険だ。",
      "入口へ戻って一対一にするか、杖・巻物などでまとめて対処しよう。逃げる判断も有効だ。",
    ],
  },
  goal_item: {
    title: "目標アイテム",
    text: [
      "目標アイテムは拾っただけではクリアにならない。",
      "来た道をB1Fまで戻り、上り階段から地上へ持ち帰ろう。",
    ],
  },
});

export function getFirstEncounterTip(key, dungeonType, seenTips = []) {
  if (!MAIN_DUNGEON_TYPES.has(dungeonType)) return null;
  if (seenTips instanceof Set ? seenTips.has(key) : seenTips.includes(key)) return null;
  const tip = FIRST_ENCOUNTER_TIPS[key];
  return tip ? { key, ...tip } : null;
}

const IDENTIFIED_TYPES = new Set(["potion", "scroll", "wand", "ring", "pen", "spellbook", "pot"]);

export function isUnidentifiedEncounterItem(item, ident, allBcKnown = false) {
  if (!item || allBcKnown || item.fullIdent || !IDENTIFIED_TYPES.has(item.type)) return false;
  let identKey = null;
  if (item.type === "potion") identKey = `p:${item.effect}`;
  else if (item.type === "scroll" && item.effect !== "blank") identKey = `s:${item.effect}`;
  else if (item.type === "wand") identKey = `w:${item.effect}`;
  else if (item.type === "ring") identKey = `r:${item.effect}`;
  else if (item.type === "pen") identKey = `n:${item.effect}`;
  else if (item.type === "pot") identKey = `o:${item.potEffect}`;
  else if (item.type === "spellbook" && item.spell) identKey = `b:${item.spell}`;
  if (!identKey || identKey.endsWith(":undefined")) return false;
  return !(ident instanceof Set ? ident.has(identKey) : (ident || []).includes(identKey));
}
