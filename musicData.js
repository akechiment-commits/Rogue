/** ゲームとサウンドテストの共通カタログ。 */
export {
  BGM_DUNGEON_SHALLOW, BGM_DUNGEON_DEEP, BGM_MONSTER_HOUSE, BGM_SHOP,
  BGM_BOSS, BGM_GAMEOVER, BGM_GAMECLEAR, ALL_BGM_TRACKS,
} from './musicCompositions.js';

/** All available SE IDs and their labels for sound test */
export const ALL_SE_LIST = [
  { id: "hit", name: "攻撃ヒット", desc: "通常攻撃が敵に命中した時" },
  { id: "crit", name: "会心の一撃", desc: "クリティカル・強打が発動した時" },
  { id: "miss", name: "空振り", desc: "攻撃が外れた時" },
  { id: "playerDamage", name: "被ダメージ", desc: "プレイヤーがダメージを受けた時" },
  { id: "defeat", name: "敵撃破", desc: "モンスターを倒した時" },
  { id: "levelUp", name: "レベルアップ", desc: "プレイヤーのレベルが上がった時" },
  { id: "stairs", name: "階段", desc: "フロアを降りた時" },
  { id: "pickup", name: "アイテム拾う", desc: "足元のアイテムを拾った時" },
  { id: "useItem", name: "アイテム使用", desc: "薬を飲む・巻物を読む時" },
  { id: "eat", name: "食べる", desc: "食料を食べた時" },
  { id: "throw", name: "投げる", desc: "アイテムや矢を投げた時" },
  { id: "shatter", name: "割れる", desc: "壺や瓶が割れた時" },
  { id: "trap", name: "罠発動", desc: "罠を踏んで作動した時" },
  { id: "magic", name: "魔法・杖", desc: "杖を振る・魔法書を使った時" },
  { id: "gold", name: "ゴールド", desc: "お金を拾った時" },
  { id: "cursor", name: "カーソル移動", desc: "メニューで選択肢を動かした時" },
  { id: "select", name: "決定", desc: "メニュー項目を決定した時" },
  { id: "cancel", name: "キャンセル", desc: "メニューを閉じた時" },
  { id: "alert", name: "ピンチ警告", desc: "HP低下・空腹ダメージ警告" },
];
