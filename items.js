import { rng, pick, uid, clamp, MW, MH, T, TI, DRO, removeFloorItem, monsterAt, itemAt, removeMonster } from './utils.js';
import { MONS, spawnMonsters, monLevelUp, monLevelDown } from './monsters.js';

/* wands.js に分離した関数を re-export（既存の import 元を維持） */
export { applyWandEffect, fireWandBolt, monsterFireLightning, breakWandAoE } from './wands.js';

/* ===== 状態異常防止チェックヘルパー ===== */
export function isStatusImmune(entity, ml, name = null) {
  if ((entity.statusImmune || 0) <= 0) return false;
  ml.push(name ? `${name}には効かなかった！(状態防止中)` : "状態防止中のため効かなかった！");
  return true;
}

/* ===== 金縛り弱体/解除ヘルパー ===== */
export function weakenOrClearParalysis(mon, ml) {
  if (!mon.paralyzed) return;
  if ((mon.paralyzeHits || 0) > 1) {
    mon.paralyzeHits--;
    ml.push(`${mon.name}の強い金縛りが弱まった！(あと1回で解除)`);
  } else {
    mon.paralyzed = false;
    mon.paralyzeHits = 0;
    ml.push(`${mon.name}の金縛りが解けた！`);
  }
}

/* ===== PITFALL BAG ===== */
/* Game.jsx が setPitfallBag でセットしておくと、落とし穴発動時に
   落下したアイテム/モンスターをここに蓄積し、後で次の階に配置する */
let _pitfallBag = null;
export function setPitfallBag(bag) { _pitfallBag = bag; }
export function clearPitfallBag() { _pitfallBag = null; }

/* ===== ITEM TILES ===== */
export const ITEM_TILES = {
  potion_heal: 16, potion_big: 17, scroll: 18, food: 19,
  weapon: 20, armor: 21, gold: 22, arrow: 23, wand: 24,
};

/* ===== UNIDENTIFIED SYSTEM ===== */
const _FAKE = {
  potion: ["赤い薬","青い薬","緑の薬","黄色い薬","紫の薬","白い薬","黒い薬",
           "透明な薬","橙の薬","桃色の薬","茶色い薬","銀色の薬","金色の薬"],
  scroll: ["渦巻き文字の巻物","点描の巻物","格子模様の巻物","縦縞の巻物",
           "古代文字の巻物","記号の巻物","逆文字の巻物","波模様の巻物",
           "星模様の巻物","魚拓の巻物","幾何学模様の巻物","解読不能の巻物"],
  wand:   ["カシの杖","バオバブの杖","ヒノキの杖","カエデの杖","マホガニーの杖",
           "ケヤキの杖","ブナの杖","クスノキの杖","ポプラの杖","イチョウの杖",
           "シラカバの杖","クリの杖","ナラの杖","スギの杖","ヤナギの杖"],
  pen:    ["朱色のペン","群青のペン","黄金のペン","翠色のペン","銀色のペン"],
  pot:    ["丸い壺","四角い壺","細長い壺","平たい壺","瓢箪型の壺","古い壺",
           "新しい壺","大きな壺","小さな壺","模様入りの壺","光沢のある壺",
           "素焼きの壺","裂けた壺"],
  spellbook: ["赤い表紙の魔法書","青い表紙の魔法書","黄色い表紙の魔法書","緑の表紙の魔法書",
              "黒い表紙の魔法書","白い表紙の魔法書","紫の表紙の魔法書","橙色の表紙の魔法書",
              "金色の表紙の魔法書","銀色の表紙の魔法書"],
};

export function getIdentKey(it) {
  if (!it) return null;
  if (it.type === 'potion') return `p:${it.effect}`;
  if (it.type === 'scroll' && it.effect !== 'blank') return `s:${it.effect}`;
  if (it.type === 'wand') return `w:${it.effect}`;
  if (it.type === 'pen') return `n:${it.effect}`;
  if (it.type === 'pot') return `o:${it.potEffect}`;
  if (it.type === 'spellbook' && it.spell) return `b:${it.spell}`;
  return null;
}

export function generateFakeNames(items, pots, spellbooks = []) {
  const fakeNames = {};
  const assign = (keys, pool) => {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    keys.forEach((k, i) => { fakeNames[k] = shuffled[i % shuffled.length]; });
  };
  const uniq = (arr) => [...new Set(arr)];
  assign(uniq(items.filter(i => i.type === 'potion' && i.effect !== 'water').map(i => `p:${i.effect}`)), _FAKE.potion);
  fakeNames['p:water'] = "透明な薬"; // 水は常に透明な薬
  assign(uniq(items.filter(i => i.type === 'scroll' && i.effect !== 'blank').map(i => `s:${i.effect}`)), _FAKE.scroll);
  assign(uniq(items.filter(i => i.type === 'wand').map(i => `w:${i.effect}`)), _FAKE.wand);
  assign(uniq(items.filter(i => i.type === 'pen').map(i => `n:${i.effect}`)), _FAKE.pen);
  assign(pots.map(p => `o:${p.potEffect}`), _FAKE.pot);
  assign(uniq(spellbooks.filter(sb => sb.spell).map(sb => `b:${sb.spell}`)), _FAKE.spellbook);
  return fakeNames;
}

/* ===== ITEMS ===== */
export const ITEMS = [
  { name:"回復薬",           type:"potion", effect:"heal",     value:15, desc:"HPを少し回復する。",               tile:16 },
  { name:"大回復薬",         type:"potion", effect:"heal",     value:35, desc:"HPを大幅に回復する。",             tile:17 },
  { name:"毒薬",             type:"potion", effect:"poison",   value:15, desc:"毒の薬。投げると毒液が飛散する。", tile:16 },
  { name:"炎の薬",           type:"potion", effect:"fire",     value:20, desc:"揮発性の液体。投げると炎上する。", tile:17 },
  { name:"睡眠薬",           type:"potion", effect:"sleep",    value:4,  desc:"眠りのガスが入った瓶。",           tile:16 },
  { name:"力の薬",           type:"potion", effect:"power",    value:3,  desc:"飲むと力が湧いてくる。",           tile:17 },
  { name:"テレポートの巻物", type:"scroll", effect:"teleport",           desc:"ランダムな場所に飛ぶ。",                         tile:18 },
  { name:"マップの巻物",     type:"scroll", effect:"reveal",             desc:"フロア全体と罠が明らかになる。",                 tile:18 },
  { name:"武器強化の巻物",   type:"scroll", effect:"weapon_up",          desc:"装備中の武器の＋値を1上げる。",                  tile:18 },
  { name:"防具強化の巻物",   type:"scroll", effect:"armor_up",           desc:"装備中の防具の＋値を1上げる。",                  tile:18 },
  { name:"雷の巻物",         type:"scroll", effect:"thunder",            desc:"視界内の敵全てに雷ダメージを与える。",           tile:18 },
  { name:"回復の巻物",       type:"scroll", effect:"recovery",           desc:"自分と視界内の敵全てを回復する。",               tile:18 },
  { name:"道具寄せの巻物",   type:"scroll", effect:"item_gather",        desc:"フロアのアイテムを自分の周りに引き寄せる。",     tile:18 },
  { name:"眠りの巻物",       type:"scroll", effect:"sleep_scroll",       desc:"視界内の敵全てを眠らせる。",                     tile:18 },
  { name:"聖域のペン",       type:"pen",    effect:"sanctuary",     charges:2, desc:"足元に聖域の魔方陣を描く。モンスターは通過・攻撃できなくなる。チャージ制。", tile:42 },
  { name:"脆弱のペン",       type:"pen",    effect:"vulnerability", charges:2, desc:"足元に脆弱の魔方陣を描く。同じ部屋にいる者全員の受けるダメージが2倍になる。チャージ制。", tile:42 },
  { name:"魔封じのペン",     type:"pen",    effect:"magic_seal",    charges:2, desc:"足元に魔封じの魔方陣を描く。部屋内では一切の魔法が無効になる。外からの魔法弾も消える。チャージ制。", tile:42 },
  { name:"雷のペン",         type:"pen",    effect:"thunder_trap",  charges:2, desc:"足元に雷の魔方陣を描く。真上にいると毎ターン25ダメージを受ける。チャージ制。", tile:42 },
  { name:"遠投のペン",       type:"pen",    effect:"farcast",       charges:2, desc:"足元に遠投の魔方陣を描く。部屋内で投げたものが壁まで貫通して飛ぶ。チャージ制。", tile:42 },
  { name:"短剣",             type:"weapon", atk:3,                       desc:"軽いダガー。",                     tile:20 },
  { name:"ロングソード",     type:"weapon", atk:6,                       desc:"冒険者の定番武器。",               tile:20 },
  { name:"バトルアクス",     type:"weapon", atk:10,                      desc:"重厚な戦斧。",                     tile:20 },
  { name:"ドラゴンキラー",   type:"weapon", atk:8,  ability:"bane_dragon",   desc:"ドラゴン系に2倍ダメージを与える特効剣。",         tile:20 },
  { name:"ゾンビキラー",     type:"weapon", atk:6,  ability:"bane_undead",   desc:"アンデッド系に2倍ダメージを与える聖剣。",         tile:20 },
  { name:"バードキラー",     type:"weapon", atk:5,  ability:"bane_float",    desc:"浮遊している敵に2倍ダメージを与える槍。",         tile:20 },
  { name:"金の斧",           type:"weapon", atk:9,  ability:"no_degrade",    desc:"錆びず＋値が下がらない黄金の斧。",               tile:20 },
  { name:"戦神の斧",         type:"weapon", atk:8,  ability:"critical",      desc:"25%の確率で会心の一撃（2倍ダメージ）が出る斧。",  tile:20 },
  { name:"つるはし",         type:"weapon", atk:4,  ability:"pickaxe", durability:30, desc:"壁を掘れる。使い過ぎると壊れる。",    tile:20 },
  { name:"革の鎧",           type:"armor",  def:2,                       desc:"軽い鎧。",                         tile:21 },
  { name:"鎖帷子",           type:"armor",  def:5,                       desc:"斬撃に強い鎧。",                   tile:21 },
  { name:"プレートメイル",   type:"armor",  def:8,                       desc:"最強の重装鎧。",                   tile:21 },
  { name:"腹持ちの胴",       type:"armor",  def:3,  ability:"slow_hunger",   desc:"装備すると空腹の進行が半分になる特製の胴鎧。",    tile:21 },
  { name:"ゴムゴムの胴",     type:"armor",  def:4,  ability:"lightning_resist", desc:"雷ダメージを半減し、雷によるアイテム破壊を防ぐ。", tile:21 },
  { name:"ドラゴンメイル",   type:"armor",  def:8,  ability:"fire_resist",   desc:"竜の鱗製。炎ダメージを半減しアイテムを炎から守る。", tile:21 },
  { name:"刃の鎧",           type:"armor",  def:4,  ability:"thorn",         desc:"近接攻撃で受けたダメージの1/3を反射する。",       tile:21 },
  { name:"みかわしの服",     type:"armor",  def:2,  ability:"dodge",         desc:"軽くて動きやすく、25%の確率で攻撃を回避する。",   tile:21 },
  { name:"反射の鎧",         type:"armor",  def:5,  ability:"wand_reflect",  desc:"モンスターの杖魔法を反射する神秘の鎧。",          tile:21 },
  { name:"護盗の鎧",         type:"armor",  def:3,  ability:"anti_steal",    desc:"装備するとコソドロに所持品を盗まれなくなる。",    tile:21 },
  { name:"ゴールドメイル",   type:"armor",  def:6,  ability:"no_degrade",    desc:"錆びず＋値が下がらない黄金の鎧。",               tile:21 },
  { name:"マナ回復薬",       type:"potion", effect:"mana",     value:20, desc:"MPを20回復する。",                 tile:16 },
  { name:"混乱の薬",         type:"potion", effect:"confuse",  value:5,  desc:"飲むと5ターン混乱する。投げると命中した敵を20ターン混乱させる。", tile:16 },
  { name:"暗闇の薬",         type:"potion", effect:"darkness",           desc:"飲むと視界が1マスになる(20ターン)。投げると命中した敵を50ターン暗闇状態にする。", tile:16 },
  { name:"惑わしの薬",       type:"potion", effect:"bewitch",            desc:"飲むと50ターン周囲の見た目が狂う。投げると命中した敵を50ターン逃走させる。", tile:16 },
  { name:"レベルアップの薬", type:"potion", effect:"levelup",            desc:"飲むとレベルが1上がる。祝福：2レベル上がる。投げると命中した敵が次の形態に変化する。", tile:17 },
  { name:"金貨",             type:"gold",   value:0,                     desc:"金貨。",                           tile:22 },
  { name:"識別の巻物", type:"scroll", effect:"identify",
    desc:"持ち物から1つ選んで識別する。祝福：全識別。呪い：識別を解除。", tile:18 },
  { name:"複製の巻物", type:"scroll", effect:"duplicate",
    desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
  { name:"召喚の巻物", type:"scroll", effect:"summon",
    desc:"敵を4体召喚する。祝福：8体に囲まれる。呪い：部屋内の敵を別の部屋に飛ばす。", tile:18 },
  { name:"収納上手の巻物", type:"scroll", effect:"expand_inv",
    desc:"最大所持数が1～3増える。祝福：2～6増える。呪い：1～3減る。", tile:18 },
  { name:"毒矢",     type:"arrow", atk:4, poison:true, count:3,  desc:"毒を持つ矢。命中すると毒効果。99本まで束にできる。",           tile:23 },
  { name:"貫きの矢", type:"arrow", atk:4, pierce:true, count:3,  desc:"全てを貫通して飛ぶ矢。99本まで束にできる。", tile:23 },
];

export function getBlessMultiplier(it) {
  if (!it) return 1;
  if (it.blessed) return 1.5;
  if (it.cursed)  return 0.5;
  return 1;
}

export const ARROW_T        = { name:"矢",       type:"arrow", atk:4,                 desc:"99本まで束にできる矢。",                 count:1, tile:23 };
export const POISON_ARROW_T = { name:"毒矢",     type:"arrow", atk:4, poison:true,     desc:"毒を持つ矢。99本まで束にできる。",        count:1, tile:23 };
export const PIERCING_ARROW_T={ name:"貫きの矢", type:"arrow", atk:4, pierce:true,     desc:"全てを貫通して飛ぶ矢。99本まで束にできる。", count:1, tile:23 };
export const EMPTY_BOTTLE = { name:"空き瓶",      type:"bottle",        desc:"空の瓶。今のところ使い道はない。",         tile:16 };
export const WATER_BOTTLE = { name:"水", type:"potion", effect:"water", value:10, desc:"泉の水。飲むと少しHPが回復する。", tile:16 };
export const BLANK_SCROLL  = { name:"白紙の巻物",    type:"scroll", effect:"blank",   desc:"何も書かれていない。魔法のマーカーで書き込める。", tile:18 };
export const MAGIC_MARKER  = { name:"魔法のマーカー", type:"marker", charges:1, desc:"白紙の巻物に好きな魔法を書き込める。充填の大箱で回数を増やせる。合成の大箱でマーカー同士を合成すると容量を合算できる。", tile:41 };

/* ===== FOOD SYSTEM ===== */
export const RAW_FOODS = [
  /* ── 果物 ── */
  "いちご","りんご","みかん","バナナ","ぶどう","もも","なし","すいか","メロン","キウイ",
  "マンゴー","パイナップル","さくらんぼ","ブルーベリー","ラズベリー","レモン","ライム",
  "グレープフルーツ","オレンジ","梅","あんず","ザクロ","ドリアン","ライチ",
  "パパイヤ","ココナッツ","プラム","デコポン","いちじく","ドラゴンフルーツ","スターフルーツ",
  "パッションフルーツ","グアバ","マンゴスチン","洋梨","アセロラ","ゆず","すだち","かぼす",
  "きんかん","ランブータン","サワーサップ","カラマンシー","フェイジョア","タマリンド",
  "ジャボチカバ","チェリモヤ","アテモヤ","クプアス","アサイー","カムカム","アロニア",
  "エルダーベリー","グースベリー","カラント","ナツメヤシ","サポテ",
  "ジャックフルーツ","ブレッドフルーツ","ビワ","ナツメ","カキノキの実","バオバブの実",
  "アフリカンチェリー","シーバックソーン","ゴジベリー","マキベリー","クランベリー",
  "ブラックベリー","ボイセンベリー","ハックルベリー","ムルベリー","アボカド",
  /* ── 野菜・葉物 ── */
  "かぼちゃ","トマト","きゅうり","にんじん","だいこん","かぶ","ごぼう","れんこん",
  "さつまいも","じゃがいも","ながいも","たけのこ","とうもろこし","えだまめ","そらまめ",
  "ピーマン","なす","ズッキーニ","セロリ","ブロッコリー","カリフラワー","キャベツ","レタス",
  "ほうれん草","小松菜","白菜","ねぎ","にら","たまねぎ","アスパラガス","オクラ","パセリ",
  "バジル","ミント","みょうが","しそ","春菊","クレソン","ルッコラ","チンゲン菜","もやし",
  "里芋","ビーツ","ケール","水菜","空心菜","あしたば","コールラビ","フェンネル","チコリ",
  "エンダイブ","パースニップ","アーティチョーク","ラディッキオ","ヤーコン","キクイモ","ラディッシュ",
  "むらさきいも","クワイ","つくし","わらび","ぜんまい","ふきのとう","こごみ","たらのめ",
  "ゆりね","シャロット","ポロネギ","セロリアック","アマランサスの葉",
  "モロヘイヤ","つるむらさき","ミズ","ウド","しゃくし菜","のびる","ぎぼうし","あかざ",
  "ハーブの芽","ナスタチウムの葉","ボリジの花","ビオラの葉","食用菊","まつばの芽",
  /* ── きのこ ── */
  "しいたけ","まつたけ","エリンギ","しめじ","えのき","なめこ","まいたけ","マッシュルーム",
  "トリュフ","ポルチーニ","きくらげ","ひらたけ","チャンテレル","モリーユ",
  "ハナビラタケ","アミタケ","スギタケ","ムキタケ","クリタケ","コウタケ","チチタケ",
  "ヌメリイグチ","ハタケシメジ","シロタモギタケ","ウスヒラタケ","タモギタケ",
  "サクラシメジ","クヌギタケ",
  /* ── 木の実・豆・種 ── */
  "くるみ","アーモンド","カシューナッツ","ピスタチオ","ヘーゼルナッツ","マカダミアナッツ",
  "ピーナッツ","栗","松の実","ひまわりの種","ペカン","ブラジルナッツ",
  "チアシード","ゴマ","かぼちゃの種","大豆","小豆","ひよこ豆","レンズ豆","緑豆",
  "黒豆","金時豆","白いんげん","インゲン豆","ライ豆","とちの実",
  "サチャインチ","フラックスシード","ヘンプシード","カカオニブ",
  /* ── ハーブ・香辛料（単体で食べられるもの） ── */
  "しょうが","にんにく","唐辛子","わさび","パクチー","ディル",
  "レモングラス","ガランガル","コブミカンの葉","よもぎ","どくだみ","フェヌグリーク",
  /* ── 海藻・水草 ── */
  "昆布","わかめ","もずく","ひじき","のり","めかぶ","アオサ","テングサ","ミル","アカモク",
  "カジメ","ガゴメ昆布","トサカのり","海ぶどう","ひとえぐさ","まつも","ふのり",
  /* ── 芋・その他根菜 ── */
  "むかご","タロイモ","ヤムイモ","キャッサバ","クズイモ","コンニャクイモ","サゴ",
  /* ── 生魚・魚介類 ── */
  "まぐろ","サーモン","ヒラメ","タイ","カレイ","サバ","アジ","イワシ","カツオ","ブリ",
  "カンパチ","ハマチ","メカジキ","シマアジ","イサキ","キンメダイ","マコガレイ","サワラ",
  "クエ","ノドグロ","スズキ","タチウオ","キジハタ","アマダイ","ソウダガツオ",
  "タコ","ヤリイカ","スルメイカ","ホタルイカ","コウイカ","ミズダコ",
  "甘エビ","ボタンエビ","車エビ","シャコ","毛ガニ","ズワイガニ","タラバガニ","渡りガニ",
  "牡蠣","ホタテ","ハマグリ","アサリ","シジミ","アワビ","サザエ","トコブシ",
  "ウニ","ナマコ","ホヤ","シラウオ","ワカサギ","アユ",
];

/* ── 料理（惣菜・ごはん系） ── */
export const COOKED_FOODS_SAVORY = [
  /* イタリア */
  "ボンゴレビアンコ","カルボナーラ","ペペロンチーノ","ボロネーゼ","アラビアータ",
  "ラザニア","ピザマルゲリータ","リゾット","ミネストローネ",
  "カプレーゼ","アクアパッツァ","ニョッキ","ラビオリ","フォカッチャ","ブルスケッタ","ジェノベーゼ",
  "ペスカトーレ","プッタネスカ","カチャトーラ","オッソブーコ","パルミジャーナ",
  "トルテリーニ","パッパルデッレ","フェットチーネアルフレード","スパゲッティネロ",
  "ブカティーニ","ヴォンゴレロッソ","アッリオエオーリオ","ポルチーニリゾット",
  "カッチョエペペ","グリッチャ","アマトリチャーナ","カルネアッラピッツァイオーラ",
  "ストロッツァプレーティ","リガトーニ","ペンネアラビアータ","オレキエッテ",
  "ヴィテッロトンナート","サルティンボッカ","ポルペッテ","カポナータ","トリッパ",
  "フォカッチャディレッコ","ピンサロマーナ","スキャッチャータ","ツィポッラタ",
  /* 中華 */
  "餃子","春巻き","小籠包","チャーハン","麻婆豆腐","酢豚","青椒肉絲","エビチリ","回鍋肉",
  "担々麺","油淋鶏","北京ダック","焼売","肉まん","ワンタン","棒棒鶏",
  "マーラータン","ビーフン","天津飯","中華丼","八宝菜","エビマヨ","宮保鶏丁","麻辣火鍋",
  "東坡肉","紅焼肉","獅子頭","干焼蝦仁","魚香肉絲","水煮魚","夫妻肺片","炸醤麺",
  "刀削麺","拉麺","ルーローハン","三杯鶏","塩水鶏","台湾ラーメン","蟹肉粥","皮蛋豆腐",
  "叉焼","腸粉","蒸し鶏のネギ油がけ","麻辣串","干鍋","紅油抄手","擂椒皮蛋","酸辣湯",
  /* 韓国 */
  "ビビンバ","チヂミ","サムゲタン","キムチチゲ","トッポギ","プルコギ","サムギョプサル",
  "チャプチェ","ナムル","キンパ","タッカルビ","スンドゥブ","カルビタン","ソルロンタン",
  "チーズダッカルビ","クッパ","テジカルビ","カルグクス","スジェビ","ヘムルタン",
  "カンジャンケジャン","ユッケジャン","チョングッチャン","コムタン","パジョン","ホットク",
  "ドトリムク","冷麺","プルタック","マンドゥグク","スンデグク","オデン","ポッサム",
  /* タイ・東南アジア */
  "フォー","トムヤムクン","グリーンカレー","ガパオライス","パッタイ","ソムタム","カオマンガイ",
  "ナシゴレン","ミーゴレン","サテー","ルンダン","ラクサ","マッサマンカレー","カオソーイ",
  "バインミー","生春巻き","フォーボー","ブンボーフエ","バインクオン","クイティオ","カオパット",
  "ガイヤーン","カオニャオ","バクテー","ナシルマ","アヤムゴレン","ミーアヤム","チャーゾー",
  "ロティ","クロックマライ","ラープ","ゲーンマッサマン","パッキーマオ","ヤムウンセン",
  "トムカーガイ","カオムーデーン","センレック","エーンヌーア","カオラームサラット",
  /* フランス */
  "ラタトゥイユ","ブイヤベース","ポトフ","ガレット","キッシュ",
  "エスカルゴ","フォアグラ","コンフィ","ムニエル","コックオーヴァン","ビーフブルギニョン",
  "タルティフレット","グラタンドーフィノワ","カスレ","ニソワーズサラダ","リヨン風サラダ",
  "ビシソワーズ","ブランダード","パテドカンパーニュ","テリーヌ","クネル","アンドゥイエット",
  "オニオングラタンスープ","プロヴァンス風ムール貝","タルタルステーキ","フリカッセ",
  "ソシソンブリオシュ","キャロットラペ","セロリレムラード","ウフマヨネーズ","クロックムッシュ",
  "クロワッサンオザマンド","ガルビュール","ポーフー","シヴェドリエーブル",
  /* ドイツ・東欧 */
  "シュニッツェル","プレッツェル","ブラートヴルスト","クヌーデル","シュペッツレ",
  "フリカデレ","ロールキャベツ","アイスバイン","グーラッシュ","ザワークラウト","レーバーケーゼ",
  "カリーヴルスト","フレクゼッパ","ダンプリング","ピエロギ","ビゴス","ハンガリー風グーラッシュ",
  "チェコ風豚の膝肉","スロバキア風ハルシュキー","ルーマニア風サルマーレ","ゴラブキ",
  /* 日本 */
  "寿司","刺身","味噌汁","豚汁","おでん","すき焼き","しゃぶしゃぶ","焼き鳥","唐揚げ","とんかつ",
  "天ぷら","親子丼","カツ丼","牛丼","天丼","海鮮丼","うな丼","ちらし寿司","茶碗蒸し","筑前煮",
  "きんぴらごぼう","卵焼き","お好み焼き","たこ焼き","もんじゃ焼き","焼きそば","ラーメン","うどん",
  "そば","つけ麺","おにぎり","炊き込みご飯","お茶漬け","雑炊","おかゆ","焼き魚","煮魚",
  "サバの味噌煮","ブリ大根","カキフライ","アジフライ","豚の角煮","鶏の照り焼き","焼き餃子",
  "かき揚げ","いなり寿司","太巻き","手巻き寿司","鍋焼きうどん","カレーうどん","冷やし中華",
  "ざるそば","レバニラ炒め","肉じゃが","ひじきの煮物","切り干し大根","あら汁","石狩鍋",
  "ちゃんこ鍋","あんこう鍋","カニ鍋","タラ鍋","もつ鍋","牛骨スープ","豚骨ラーメン",
  "醤油ラーメン","塩ラーメン","味噌ラーメン","まぜそば","かす汁","いしかり鍋","のっぺ汁",
  "ひつまぶし","鰻の蒲焼き","柳川鍋","どじょう鍋","博多水炊き","てっちり","かに雑炊",
  "牡蠣鍋","すっぽん鍋","どて煮","粕汁","なめろう","さんが焼き","じゃっぱ汁","けんちん汁",
  "せんべい汁","いちご煮","三平汁","かきたま汁","のっぺい汁","とん汁","さつま汁",
  "ひっぱりうどん","へぎそば","稲庭うどん","讃岐うどん","きしめん","ほうとう",
  "ほうれん草のおひたし","白和え","酢の物","漬物盛り","だし巻き卵","玉子豆腐",
  "ハンバーグ","コロッケ","メンチカツ","エビフライ","オムライス","カレーライス","ハヤシライス","ポテトサラダ","ビーフシチュー","クリームシチュー","ナポリタン","ドリア","グラタン",
  /* アメリカ */
  "ステーキ","ローストビーフ","フライドチキン","シーザーサラダ","クラブサンド","ホットドッグ","ハンバーガー",
  "ポークソテー","クラムチャウダー","ベーグル","サワードウ",
  "ジャンバラヤ","ガンボ","ケイジャンチキン","プルドポーク","バーベキューリブ","コーンブレッド",
  "チキンポットパイ","マカロニチーズ","ロブスターロール","クラブケーキ","バッファローウィング",
  "ミートローフ","ポットロースト","ボストンベイクドビーンズ","コブサラダ","シーザーラップ",
  "フィラデルフィアチーズステーキ","シカゴピザ","ニューヨークスライス","カリフォルニアロール",
  "エッグベネディクト","コーンドビーフハッシュ","タタキ風ツナサラダ","マカダミアホワイトフィッシュ",
  /* スペイン・中南米 */
  "パエリア","タコス","ブリトー","ナチョス","ケサディーヤ","エンチラーダ","ファヒータ","チリコンカン",
  "ガスパチョ","ソパデアホ","コシードマドリレーニョ","トルティーリャエスパニョーラ",
  "ガンバスアルアヒーリョ","チョリソー炒め","パンコントマテ","ピンチョス","タパス盛り",
  "セビーチェ","ロモサルタード","アレパ","ガジョピント","バンデハパイサ","モーレポブラーノ",
  "ポソレ","チレスレジェノス","タマレス","トスタダス","ソパスデリマ",
  /* 中東・アフリカ */
  "ケバブ","フムス","ファラフェル","シャクシュカ","タジン","クスクス","ムサカ","ドルマ",
  "ババガヌーシュ","タブーレ","キッベ","シャワルマ","コフタ","マンサフ","マクルーバ",
  "フール","ムジャッダラ","バルバリパン","ジョロフライス","エグシスープ","フフ","エグシ",
  "スクマウィキ","ウジ","ンゴジョ","ボフロット","ケジェヌ","チャクチュカ","ブリック",
  /* インド・南アジア */
  "ナン","チャパティ","サモサ","タンドリーチキン","バターチキンカレー","パラクパニール","ビリヤニ",
  "ダルカレー","アルゴビ","チキンティッカ","キーマカレー","フィッシュカレー","コルマ","ヴィンダルー",
  "ドーサ","イドリ","サンバル","ラッサム","ウタパム","チャナマサラ","ラジマ","マッターパニール",
  "ダールマカニ","ゴア風フィッシュカレー","ポハ","パーラク","ジェラビ風カレー","コルカタロール",
  "アチャール","ライタ","チャトニー","ハラーリ","ムルグマライカバブ","ハンディチキン",
  /* ロシア・東欧・ジョージア */
  "ピロシキ","ボルシチ","シャシュリク","ペリメニ","バレニキ",
  "オリヴィエサラダ","サリャンカ","ウハー","ラソリニク","ブリヌイ","ブリニ","クバン風肉煮込み",
  "セロジョドポドシュボイ","カシャ","ゴルブツィ","スチ","ハラーショ","グルジア風肉饅頭","ビーフストロガノフ",
  /* ジョージア */
  "ミサール","アジャプサンダリ","チャフカパリ","ロビアニ","ハシ","ムツヴァディ",
  /* その他（スイス・北欧ほか） */
  "フォンデュ","ラクレット","スモークサーモン","グラブラックス","ニシンのマリネ","スウェーデン風ミートボール",
  "アイリッシュシチュー","スコッチエッグ","サンデーロースト","プラウマン","ウェルシュラビット",
  "フィッシュパイ","コテージパイ","フィッシュアンドチップス","シェパーズパイ","ミートパイ","ローストチキン","カレーソーセージ","シュトルーデル（惣菜）","レクソー",
];

/* ── スイーツ ── */
export const COOKED_FOODS_SWEET = [
  /* 洋菓子 */
  "プリン","ショートケーキ","チーズケーキ","モンブラン","シュークリーム","ドーナツ",
  "パンナコッタ","ティラミス","チュロス","ブラウニー","アップルパイ","チェリーパイ","シフォンケーキ",
  "バウムクーヘン","フィナンシェ","マドレーヌ","カヌレ","クイニーアマン","クレームブリュレ",
  "マカロン","エクレア","ミルフィーユ","スフレ","クレープ","ガトーショコラ","タルトタタン",
  "クロカンブッシュ","オペラケーキ","フォレノワール","パリブレスト","サントノーレ",
  "ビュッシュドノエル","クグロフ","ストーレン","パネットーネ","チュイール","ラングドシャ",
  "サブレ","ガレットブルトンヌ","フロランタン","ダクワーズ","ジョコンド","ロールケーキ",
  "ザッハトルテ","リンツァートルテ","エスターハージートルテ","ドボシュトルテ",
  "フォンダンショコラ","チョコトリュフ","ガナッシュケーキ","プラリネタルト","ヌガー",
  "チョコレートムース","ベリームース","フルーツタルト","レモンタルト","アーモンドタルト",
  "バスクチーズケーキ","レアチーズケーキ","ベイクドチーズケーキ","スフレチーズケーキ",
  "スコーン","ショートブレッド","ビクトリアサンドイッチ","スティッキートフィープディング",
  "ライスプディング","ブレッドアンドバタープディング","トライフル","シャルロット",
  "サバラン","ムースオショコラ","ブランマンジェ","クレームカラメル","プチフール",
  "ミルフィーユフレーズ","フレジエ","ポワシエ","ムースマロン","バナナフォスター",
  "パンケーキ","ワッフル","フレンチトースト","エッグワッフル","リエージュワッフル",
  "アメリカンパンケーキ","ダッチベイビー","クレープシュゼット","ルコマデス",
  "アイスクリーム","ソルベ","ジェラート","パルフェ","アフォガート","ソフトクリーム",
  "シャーベット","かき氷","みぞれ","ミルクアイス","抹茶アイス","ストロベリーアイス",
  "バナナスプリット","ホットファッジサンデー","アイスクリームサンド","フルーツパフェ",
  "モンブランパフェ","抹茶パフェ","チョコバナナパフェ","苺パフェ","ミックスジェラート",
  "シナモンロール","デニッシュ","クロワッサン","パンオショコラ","クロワッサンアマンド","ブリオッシュ",
  "ニューヨークチーズケーキ","ピーカンパイ","キーライムパイ","レモンメレンゲパイ",
  "ブルーベリーパイ","さくらんぼパイ","ピーチコブラー","バナナプディング","ルートビアフロート",
  "チョコレートフォンデュ","スモア","ライスクリスピートリート","フロスティングカップケーキ",
  /* 和菓子 */
  "たい焼き","どら焼き","大福","羊羹","みたらし団子","わらび餅","カステラ","あんみつ","今川焼き",
  "桜餅","柏餅","水まんじゅう","葛切り","ぜんざい","お汁粉","栗きんとん","練り切り","落雁",
  "金平糖","雷おこし","八つ橋","揚げまんじゅう","ベビーカステラ","人形焼き","草餅",
  "うぐいす餅","三色団子","串団子","おはぎ","ぼた餅","芋羊羹","栗羊羹","水羊羹",
  "くず餅","ういろう","甘酒プリン","みつ豆","あんこ玉","黒蜜きなこ","わらびもち",
  "ずんだ餅","ちまき","花びら餅","嘉祥餅","有平糖","麩まんじゅう","夏柑糖","水信玄餅",
  "琥珀糖","道明寺","雪平","利久饅頭","蒸しようかん","切り羊羹","月見団子","菊花まんじゅう",
  "蕎麦ぼうろ","南部煎餅","薄皮饅頭","温泉まんじゅう","生八つ橋",
  "みかん大福","いちご大福","チョコ大福","きなこ大福","抹茶大福","塩大福","豆大福",
  "ドラ焼きアイス","たい焼きアイス","もちアイス","雪見だいふく風","わらびもちアイス",
  "紅芋タルト","ちんすこう","サーターアンダギー","ポーポー","からすみ餅","天ぷら饅頭",
  /* アジアのスイーツ */
  "杏仁豆腐","マンゴープリン","ゴマ団子","月餅","チェー","タピオカミルクティー",
  "トースターミルクティープリン","バナナフリッター","クレンダン","クエラピス","クエタラム",
  "チェンドル","パンダンケーキ","バタフライピーゼリー","ゴレンピサン","ンガクアク",
  "ルビーチェー","ハローハロー","ビベンカ","セリクマカ","プディンガドゥン","クエピトゥ",
  "カノムクロック","カノムモーゲーン","カノムタン","タンゴ","カルメン","サラベルンダ",
  "セイロン風ミルクティープリン","マレー風ケーキ","インドネシア風バナナケーキ",
  "ライスケーキ（甘口）","ヤムアロイ","ベトナム風チェー","フィリピン風ビビンカ",
  /* 中東・アフリカのスイーツ */
  "バクラヴァ","カダイフ","ハルヴァ","ラハットロクム","ムハラビア",
  "カタイフ","バスブーサ","クナーフェ","マアムール","シュアービエット","ウンムアリ",
  "モロッコ風アーモンドパスティリャ（甘）","チュニジア風デーツ菓子","エジプト風アシュラ",
];

/* genFood()後方互換用 — 両カテゴリを結合 */
export const COOKED_FOODS = [...COOKED_FOODS_SAVORY, ...COOKED_FOODS_SWEET];

export const RAW_SIZES = [
  { l:"特大",   v:80, w:1 },
  { l:"大きい", v:55, w:2 },
  { l:"普通の", v:35, w:4 },
  { l:"小さい", v:20, w:2 },
  { l:"極小の", v:10, w:1 },
];

export const COOKED_SIZES = [
  { l:"特盛り", v:80, w:1 },
  { l:"大盛り", v:55, w:2 },
  { l:"普通の", v:35, w:4 },
  { l:"小盛り", v:20, w:2 },
  { l:"一口",   v:10, w:1 },
];

export const FOOD_EFFECTS = [
  { l:"癒しの",   e:"heal_food",     w:3 },
  { l:"力の",     e:"power_food",    w:1 },
  { l:"速さの",   e:"speed_food",    w:2 },
  { l:"守りの",   e:"def_food",      w:1 },
  { l:"活力の",   e:"vitality_food", w:1 },
  { l:"経験の",   e:"exp_food",      w:2 },
  { l:"幸運の",   e:"luck_food",     w:2 },
  { l:"透視の",   e:"reveal_food",   w:1 },
  { l:"解毒の",   e:"antidote_food", w:2 },
  { l:"満腹の",   e:"satiate_food",  w:3 },
  { l:"魔力の",   e:"mp_food",       w:2 },
];

export const FOOD_DESCS = {
  heal_food:     "不思議と体が温まる。",
  power_food:    "力が漲る匂いがする。",
  speed_food:    "身が軽くなりそうだ。",
  def_food:      "体が頑丈になりそうだ。",
  vitality_food: "生命力を感じる。",
  exp_food:      "知恵が付きそうだ。",
  luck_food:     "金運が上がりそうだ。",
  reveal_food:   "目が冴えてきそうだ。",
  antidote_food: "体の毒が抜けそうだ。",
  satiate_food:  "とても腹持ちが良さそうだ。",
  mp_food:       "魔力が湧いてくる感じがする。",
};

export function itemPrice(it) {
  if (it.type === "potion") {
    if (it.effect === "heal") return it.value >= 30 ? 80 : 30;
    if (it.effect === "power") return 120;
    return 40;
  }
  if (it.type === "scroll")   return it.effect === "blank" ? 5 : it.effect === "reveal" ? 60 : 80;
  if (it.type === "weapon")   return 50 + (it.atk || 0) * 20 + (it.ability ? 150 : 0);
  if (it.type === "armor")    return 60 + (it.def || 0) * 25 + (it.ability ? 150 : 0);
  if (it.type === "food")     return Math.max(10, Math.floor((it.value || 20) * 0.6));
  if (it.type === "arrow")    return Math.max(10, (it.count || 1) * 5);
  if (it.type === "wand")     return 150 + (it.charges || 0) * 30;
  if (it.type === "marker")   return 100 + (it.charges || 0) * 40;
  if (it.type === "pen")      return 150 + (it.charges || 0) * 50;
  if (it.type === "pot")      return 120;
  if (it.type === "bottle")   return 5;
  if (it.type === "spellbook") return 200;
  return 30;
}

export function wPick(arr) {
  const tw = arr.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * tw;
  for (const x of arr) { r -= x.w; if (r <= 0) return x; }
  return arr[arr.length - 1];
}

export function genFood() {
  const cooked = Math.random() < 0.5;
  const names = cooked ? COOKED_FOODS : RAW_FOODS;
  const sizes = cooked ? COOKED_SIZES : RAW_SIZES;
  const fn = pick(names);
  const sz = wPick(sizes);
  const ef = wPick(FOOD_EFFECTS);
  const nm = ef.l + sz.l + fn;
  let hv = ef.e === "satiate_food" ? Math.floor(sz.v * 1.5) : sz.v;
  if (!cooked) hv = Math.max(1, Math.floor(hv / 2));
  return { name:nm, type:"food", effect:ef.e, value:hv, desc:FOOD_DESCS[ef.e], tile:19, cooked };
}

/* ===== WANDS ===== */
export const WANDS = [
  { name:"ふきとばしの杖", type:"wand", effect:"knockback", charges:5, desc:"振ると対象を吹き飛ばす。壊すと周囲全てを吹き飛ばす。",                           tile:24 },
  { name:"いかずちの杖",   type:"wand", effect:"lightning", charges:4, desc:"振ると雷撃が飛ぶ。壊すと周囲に落雷。",                                           tile:24 },
  { name:"鈍足の杖",       type:"wand", effect:"slow",      charges:6, desc:"振ると対象の速度を半減。壊すと周囲全てを鈍足に。",                               tile:24 },
  { name:"変化の杖",       type:"wand", effect:"transform", charges:4, desc:"振ると対象を別の何かに変える。壊すと周囲全てを変化。",                           tile:24 },
  { name:"場所替えの杖",   type:"wand", effect:"swap",      charges:5, desc:"振ると対象と位置を交換する。壊すと周囲をシャッフル。",                           tile:24 },
  { name:"穴掘りの杖",     type:"wand", effect:"dig",       charges:5, desc:"壁に当てると一直線上の壁を掘り進む。壊すと周囲の壁を消し足元に穴が開く。",       tile:24 },
  { name:"飛びつきの杖",   type:"wand", effect:"leap",      charges:5, desc:"振ると対象の目の前に瞬間移動する。壊しても何も起こらない。",                     tile:24 },
  { name:"テレポートの杖", type:"wand", effect:"warp",      charges:4, desc:"振ると対象をランダムな場所にテレポートさせる。壊すと周囲全員をテレポート。",     tile:24 },
  { name:"金縛りの杖",   type:"wand", effect:"paralyze",  charges:5, desc:"振ると対象を金縛りにする。何かアクションを受けるまで動けなくなる。祝福：2回アクションが必要な強金縛り。呪い：対象が200ターン状態異常（金縛り・眠り・鈍足）を防ぐ力を得る。",               tile:24 },
  { name:"眠りの杖",     type:"wand", effect:"sleep",      charges:5, desc:"振ると対象を眠りに落とす。眠りの罠と同様の効果。",                                   tile:24 },
  { name:"祝福の杖",     type:"wand", effect:"bless_wand", charges:3, desc:"振ると対象のアイテムを祝福する。壊すと周囲のアイテム全てを祝福する。",                 tile:24 },
  { name:"呪いの杖",     type:"wand", effect:"curse_wand", charges:3, desc:"振ると対象のアイテムを呪う。壊すと周囲のアイテム全てを呪う。",                         tile:24 },
  { name:"レベルアップの杖", type:"wand", effect:"levelup", charges:3, desc:"振ると対象をレベルアップさせる。自分に使えば1レベル上がる。敵に当てると次の形態に変化する。呪い：自分なら1階上へ飛ばされ、敵ならレベルダウンする。水の瓶に当てるとレベルアップの薬になる。", tile:24 },
  { name:"混乱の杖",     type:"wand", effect:"confuse",    charges:5, desc:"振ると対象を混乱させる。自分なら5ターン、敵なら20ターン混乱する。水の瓶に当てると混乱の薬になる。", tile:24 },
  { name:"暗闇の杖",    type:"wand", effect:"darkness",   charges:5, desc:"振ると対象を暗闇状態にする。自分なら視界が1マスになる(20ターン)。敵なら50ターンこちらを認識できず壁まで直進し途中の者を攻撃する。祝福：自分50ターン・敵永続。呪い：フロア全体が見えるようになる。水の瓶に当てると暗闇の薬になる。", tile:24 },
  { name:"惑わしの杖",  type:"wand", effect:"bewitch",    charges:4, desc:"振ると対象を幻惑状態にする。自分なら50ターン周囲の見た目が狂う。敵なら50ターン逃げ回る。祝福：自分100ターン・敵永続。呪い：フロアの罠が全て見えるようになる。水の瓶に当てると惑わしの薬になる。", tile:24 },
];

/* ===== BIG BOX TYPES ===== */
export const BB_TYPES = [
  { kind: "synthesis", name: "合成の大笥", cap: () => 2 },
  { kind: "change",    name: "変化の大箱", cap: () => rng(2, 4) },
  { kind: "enhance",   name: "強化の大箱", cap: () => rng(1, 2) },
  { kind: "satiety",   name: "満腹の大箱", cap: () => rng(2, 4) },
  { kind: "refill",    name: "充填の大箱", cap: () => rng(1, 3) },
];

/* ===== POTS ===== */
export const POTS = [
  { name:"チョコの壺",   type:"pot", potEffect:"choco",   capacity:3, desc:"食料を入れるとチョコがけになる。",     tile:32 },
  { name:"唐辛子の壺",   type:"pot", potEffect:"spicy",   capacity:3, desc:"食料を入れると激辛になる。",           tile:32 },
  { name:"蜂蜜の壺",     type:"pot", potEffect:"honey",   capacity:3, desc:"食料を入れるとはちみつ漬けになる。",   tile:32 },
  { name:"保存の壺",     type:"pot", potEffect:"none",    capacity:5, desc:"アイテムを安全に保管できる。",         tile:32 },
  { name:"強化の壺",     type:"pot", potEffect:"enhance", capacity:2, desc:"装備品の性能が上がる。",               tile:32 },
  { name:"弱化の壺",     type:"pot", potEffect:"weaken",  capacity:3, desc:"入れた装備品が劣化する呪いの壺。",     tile:32 },
  { name:"カレーの壺",   type:"pot", potEffect:"curry",   capacity:3, desc:"食料を入れるとカレー味になる。",       tile:32 },
  { name:"味噌の壺",     type:"pot", potEffect:"miso",    capacity:3, desc:"食料を入れると味噌漬けになる。",       tile:32 },
  { name:"燻製の壺",     type:"pot", potEffect:"smoke",   capacity:3, desc:"未調理の食料を燻製にできる。",         tile:32 },
  { name:"祝福の壺",     type:"pot", potEffect:"bless_pot", capacity:3, desc:"入れたアイテムを祝福する。",           tile:32 },
  { name:"呪いの壺",     type:"pot", potEffect:"curse_pot", capacity:3, desc:"入れたアイテムを呪う。",               tile:32 },
  { name:"加熱の壺",     type:"pot", potEffect:"boil",      capacity:3, desc:"薬を入れると部屋中に薬効が広がる。生の食料を入れると焼いた状態になる。その他のものは保管できる。", tile:32 },
];

export const POT_FOOD_PREFIX = {
  choco: "チョコがけ",
  spicy: "激辛",
  honey: "はちみつ",
  curry: "カレー味の",
  miso:  "味噌漬けの",
  smoke: "燻製",
};

export const POT_FOOD_DESCS = {
  choco: "甘い香りがする。",
  spicy: "辛さで活力が戻る。",
  honey: "甘くて元気が出る。",
  curry: "スパイスが効いている。",
  miso:  "深い味わいがある。",
  smoke: "香ばしい匂いがする。",
};

export function applyPotEffect(pot, item, ml, nameFn = null) {
  const _in = nameFn ? nameFn(item) : item.name;
  const _pn = nameFn ? nameFn(pot) : pot.name;
  const pe = pot.potEffect;
  if (pe === "none") { ml.push(`${_in}を${_pn}に入れた。`); return; }
  if (pe === "boil") { /* 実効果はGame.jsx側で処理 */ return; }
  if (pe === "enhance") {
    if (item.type === "weapon" || item.type === "armor") {
      const _g = rng(1, 2);
      item.plus = (item.plus || 0) + _g;
      ml.push(`${item.name}が強化された！(+${item.plus})`);
      return;
    }
    ml.push(`${_in}を${_pn}に入れた。効果はなかった。`);
    return;
  }
  if (pe === "weaken") {
    if (item.type === "weapon" || item.type === "armor") {
      const _d = rng(1, 2);
      item.plus = (item.plus || 0) - _d;
      const _ps = item.plus;
      ml.push(`${item.name}が劣化した！(${_ps >= 0 ? "+" : ""}${_ps})`);
      return;
    }
    ml.push(`${_in}を${_pn}に入れた。`);
    return;
  }
  if (pe === "bless_pot") {
    item.blessed = true;
    item.cursed  = false;
    item.bcKnown = true;
    ml.push(`${_in}が祝福された！【祝】`);
    return;
  }
  if (pe === "curse_pot") {
    if (item.type === "arrow") { ml.push(`${_in}は呪いを受け付けない。`); return; }
    item.cursed  = true;
    item.blessed = false;
    item.bcKnown = true;
    ml.push(`${_in}が呪われた！【呪】`);
    return;
  }
  if (pe === "smoke") {
    if (item.type === "food" && !item.cooked) {
      item.value = item.value * 2;
      item.cooked = true;
      item.name = "燻製" + item.name;
      item.desc = POT_FOOD_DESCS.smoke;
      ml.push(`${item.name}になった！`);
      return;
    }
    if (item.type === "food") { ml.push(`${item.name}は既に調理済みだ。`); return; }
  }
  const pfx = POT_FOOD_PREFIX[pe];
  if (pfx && item.type === "food") {
    item.name = pfx + item.name;
    item.value = Math.floor(item.value * 1.3);
    item.desc = POT_FOOD_DESCS[pe] || item.desc;
    ml.push(`${item.name}になった！(満腹度UP)`);
    return;
  }
  ml.push(`${_in}を${_pn}に入れた。`);
}

export function makePot() {
  const t = pick(POTS);
  return { ...t, id:uid(), contents:[] };
}

export function scatterPotContents(pot, dg, px, py, p, ml, luFn, nameFn = null) {
  const _pn = nameFn ? nameFn(pot) : pot.name;
  if (!pot.contents || pot.contents.length === 0) {
    ml.push(`${_pn}は割れた！（中は空だった）`);
    return;
  }
  ml.push(`${_pn}が割れて中身が飛び出した！`);
  const ft = new Set();
  for (const item of pot.contents) { placeItemAt(dg, px, py, item, ml, ft); }
}

/* ===== WEAPON / ARMOR ABILITIES ===== */
export const WEAPON_ABILITIES = [
  { id:"reach",         name:"長柄",      desc:"2マス先の敵まで攻撃できる" },
  { id:"bane_beast",    name:"獣特効",    desc:"獣系の敵(ネズミ・大蛇)に2倍ダメージ" },
  { id:"bane_undead",   name:"聖属性",    desc:"不死系の敵(スケルトン・ゾンビ・ヴァンパイア)に2倍ダメージ" },
  { id:"bane_humanoid", name:"人特効",    desc:"人型の敵(コボルド・ゴブリン・オーク・トロル)に2倍ダメージ" },
  { id:"bane_dragon",   name:"竜特効",    desc:"竜系の敵(ドラゴン)に2倍ダメージ" },
  { id:"bane_float",    name:"浮遊特効",  desc:"浮遊している敵(インプ・ガーゴイル・ヴァンパイア・デーモン)に2倍ダメージ" },
  { id:"knockback",     name:"吹き飛ばし",desc:"攻撃した敵を1マス吹き飛ばす" },
  { id:"critical",      name:"会心",      desc:"25%の確率でダメージ2倍のクリティカルヒット" },
  { id:"no_degrade",    name:"不錆",      desc:"錆の罠や泉に落ちても＋値が下がらない" },
  { id:"pickaxe",       name:"穴掘り",    desc:"装備して壁に体当たりすると壁を掘れる（耐久制）" },
];

export const ARMOR_ABILITIES = [
  { id:"fire_resist",      name:"耐火",     desc:"炎のダメージを半減しアイテムを炎から守る" },
  { id:"slow_hunger",      name:"節食",     desc:"空腹の進行が半分になる" },
  { id:"regen",            name:"回復",     desc:"毎ターン追加でHP+1回復する" },
  { id:"sleep_proof",      name:"眠れず",   desc:"睡眠効果を無効化する" },
  { id:"thorn",            name:"刃反射",   desc:"近接攻撃を受けた時にダメージの1/3を反射する" },
  { id:"lightning_resist", name:"雷耐性",   desc:"雷のダメージを半減しアイテムが雷で壊れなくなる" },
  { id:"dodge",            name:"みかわし", desc:"25%の確率で攻撃を完全回避する" },
  { id:"wand_reflect",     name:"魔法反射", desc:"モンスターの杖魔法を反射する" },
  { id:"anti_steal",       name:"護盗",     desc:"コソドロに所持品を盗まれなくなる" },
  { id:"no_degrade",       name:"不錆",     desc:"錆の罠や泉に落ちても＋値が下がらない" },
];

/* ===== TRAPS ===== */
export const TRAPS = [
  { name:"地雷",           effect:"explode",      tile:25 },
  { name:"矢の罠",         effect:"arrow_trap",   tile:26 },
  { name:"落とし穴",       effect:"pitfall",      tile:27 },
  { name:"錆の罠",         effect:"rust",         tile:28 },
  { name:"回転板",         effect:"spin",         tile:29 },
  { name:"睡眠ガスの罠",   effect:"sleep",        tile:30 },
  { name:"毒矢の罠",       effect:"poison_arrow", tile:45 },
  { name:"召喚の罠",       effect:"summon_trap",  tile:46 },
  { name:"鈍足の罠",       effect:"slow_trap",    tile:47 },
  { name:"封印の罠",       effect:"seal_trap",    tile:48 },
  { name:"盗みの罠",       effect:"steal_trap",   tile:49 },
  { name:"空腹の罠",       effect:"hunger_trap",  tile:50 },
  { name:"吹き飛ばしの罠", effect:"blowback_trap",tile:51 },
];

let _fireTrapDepth = 0;
export function fireTrapItem(trap, item, dg, tx, ty, ml, ft, p = null, nameFn = null) {
  if (_fireTrapDepth > 5) return "stop";
  _fireTrapDepth++;
  try {
  switch (trap.effect) {
    case "explode": {
      ml.push(`${trap.name}が発動！${nameFn ? nameFn(item) : item.name}は爆発で消し飛んだ！`);
      dg.monsters.forEach(m => {
        if (Math.abs(m.x - tx) <= 1 && Math.abs(m.y - ty) <= 1) {
          m.hp -= 15;
          ml.push(`爆風で${m.name}に15ダメージ！`);
        }
      });
      dg.monsters = dg.monsters.filter(m => m.hp > 0);
      if (p && Math.abs(p.x - tx) <= 1 && Math.abs(p.y - ty) <= 1) {
        const _epd = rng(8, 15);
        p.deathCause = "アイテムの爆発の罠の爆風により";
        p.hp -= _epd;
        ml.push(`爆風で${_epd}ダメージを受けた！`);
      }
      const blasted = new Set();
      for (let ddx = -1; ddx <= 1; ddx++) {
        for (let ddy = -1; ddy <= 1; ddy++) {
          if (ddx === 0 && ddy === 0) continue;
          const ax = tx + ddx, ay = ty + ddy;
          for (const it of dg.items.filter(i => i !== item && i.x === ax && i.y === ay)) {
            if (it.type === "scroll") {
              blasted.add(it);
              ml.push(`巻物「${nameFn ? nameFn(it) : it.name}」が燃えてなくなった！`);
            } else if (it.type === "potion") {
              blasted.add(it);
              ml.push(`薬「${nameFn ? nameFn(it) : it.name}」が割れてなくなった！`);
            } else if (it.type === "food") {
              if (!it.cooked) { it.value *= 2; it.cooked = true; it.name = "焼いた" + it.name; ml.push(`${it.name}になった！`); }
              else { burnFoodItem(it, ml); }
            } else if (it.type === "pot") {
              blasted.add(it);
              if (it.contents && it.contents.length > 0) {
                const ft2 = new Set([trap.id]);
                for (const ci of it.contents) placeItemAt(dg, ax, ay, ci, ml, ft2);
                ml.push(`壺「${nameFn ? nameFn(it) : it.name}」が爆発で割れ、中身が飛び出した！`);
              } else {
                ml.push(`壺「${nameFn ? nameFn(it) : it.name}」が爆発で割れた！`);
              }
            }
          }
        }
      }
      if (blasted.size > 0) dg.items = dg.items.filter(it => !blasted.has(it));
      return "destroyed";
    }
    case "pitfall": {
      const _pfm = monsterAt(dg, tx, ty);
      if (_pfm) {
        removeMonster(dg, _pfm);
        if (_pitfallBag) {
          _pitfallBag.push({ kind: 'monster', entity: _pfm });
          ml.push(`${_pfm.name}も穴に落ちて次の階へ落下した！`);
        } else {
          ml.push(`${_pfm.name}も穴に落ちて消えた！`);
        }
      }
      if (_pitfallBag) {
        _pitfallBag.push({ kind: 'item', entity: item });
        ml.push(`${trap.name}が発動！${nameFn ? nameFn(item) : item.name}は穴に落ちて次の階へ落下した！`);
      } else {
        ml.push(`${trap.name}が発動！${nameFn ? nameFn(item) : item.name}は穴に落ちて消えた！`);
      }
      if (p && p.x === tx && p.y === ty) return "pitfall_player";
      return "destroyed";
    }
    case "rust": {
      if (item.type === "weapon" || item.type === "armor") {
        const _op2 = item.plus || 0;
        item.plus = _op2 - 1;
        const _fp2 = v => v > 0 ? "+" + v : v === 0 ? "無印" : "" + v;
        ml.push(`${trap.name}が発動！${item.name}が錆びた！(${_fp2(_op2)}→${_fp2(item.plus)})`);
      } else {
        ml.push(`${trap.name}が発動！`);
      }
      const _rm = monsterAt(dg, tx, ty);
      if (_rm) {
        _rm.atk = Math.max(1, (_rm.atk || 1) - 1);
        if (_rm.def !== undefined) _rm.def = Math.max(0, _rm.def - 1);
        ml.push(`${_rm.name}が錆びて弱くなった！`);
      }
      if (p && p.x === tx && p.y === ty) {
        const _peq = p.weapon || p.armor;
        if (_peq) {
          if (_peq.ability === "no_degrade" || _peq.abilities?.includes("no_degrade")) {
            ml.push(`${_peq.name}は金でできているので錆びなかった！`);
          } else {
            const _pop = _peq.plus || 0;
            _peq.plus = _pop - 1;
            const _pfp = v => v > 0 ? "+" + v : v === 0 ? "無印" : "" + v;
            ml.push(`${_peq.name}も錆びた！(${_pfp(_pop)}→${_pfp(_peq.plus)})`);
          }
        }
      }
      return "restart";
    }
    case "arrow_trap": {
      ml.push(`${trap.name}が発動！`);
      let wx = tx;
      while (wx > 0 && dg.map[ty][wx - 1] !== T.WALL && dg.map[ty][wx - 1] !== T.BWALL) wx--;
      wx = Math.max(0, wx - 1);
      const ar = makeArrow(1);
      let hit = false, ex = wx;
      for (let fx = wx + 1; fx < MW; fx++) {
        if (dg.map[ty][fx] === T.WALL || dg.map[ty][fx] === T.BWALL) { ex = fx - 1; break; }
        const m = monsterAt(dg, fx, ty);
        if (m) {
          const d = ar.atk + rng(0, 3);
          m.hp -= d;
          ml.push(`矢が${m.name}に命中！${d}ダメージ！`);
          if (m.hp <= 0) {
            ml.push(`${m.name}は倒れた！`);
            monsterDrop(m, dg, ml, p);
            removeMonster(dg, m);
          }
          hit = true;
          break;
        }
        if (p && p.x === fx && p.y === ty) {
          const d = ar.atk + rng(0, 3);
          p.deathCause = "アイテムの矢の罠により";
          p.hp -= d;
          ml.push(`矢の罠の矢が命中！${d}ダメージ！`);
          hit = true;
          break;
        }
        ex = fx;
      }
      if (!hit) placeItemAt(dg, ex, ty, ar, ml, ft);
      return "restart";
    }
    case "spin": {
      ml.push(`${trap.name}が発動！${item.name}はどこかへ吹き飛んだ！`);
      const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
      const nx = rng(rm.x, rm.x + rm.w - 1);
      const ny = rng(rm.y, rm.y + rm.h - 1);
      placeItemAt(dg, nx, ny, item, ml, ft);
      const _spm = monsterAt(dg, tx, ty);
      if (_spm) {
        const _spr = dg.rooms[rng(0, dg.rooms.length - 1)];
        _spm.x = rng(_spr.x, _spr.x + _spr.w - 1);
        _spm.y = rng(_spr.y, _spr.y + _spr.h - 1);
        ml.push(`${_spm.name}も吹き飛ばされた！`);
      }
      if (p && p.x === tx && p.y === ty) {
        const _psr = dg.rooms[rng(0, dg.rooms.length - 1)];
        p.x = rng(_psr.x, _psr.x + _psr.w - 1);
        p.y = rng(_psr.y, _psr.y + _psr.h - 1);
        ml.push(`吹き飛ばされた！`);
      }
      return "destroyed";
    }
    case "sleep": {
      ml.push(`${trap.name}が発動！`);
      const _slm = monsterAt(dg, tx, ty);
      if (_slm) {
        _slm.sleepTurns = (_slm.sleepTurns || 0) + rng(3, 6);
        ml.push(`${_slm.name}が眠りに落ちた！`);
      }
      if (p && p.x === tx && p.y === ty) {
        if (p.armor?.ability === "sleep_proof") {
          ml.push(`しかし眠れなかった！(耐眠)`);
        } else {
          p.sleepTurns = (p.sleepTurns || 0) + rng(3, 6);
          ml.push(`眠りに落ちた...`);
        }
      }
      return "restart";
    }
    case "poison_arrow": {
      ml.push(`${trap.name}が発動！`);
      let _pawx = tx;
      while (_pawx > 0 && dg.map[ty][_pawx - 1] !== T.WALL && dg.map[ty][_pawx - 1] !== T.BWALL) _pawx--;
      _pawx = Math.max(0, _pawx - 1);
      const _par = makePoisonArrow(1);
      let _pahit = false, _paex = _pawx;
      for (let fx = _pawx + 1; fx < MW; fx++) {
        if (dg.map[ty][fx] === T.WALL || dg.map[ty][fx] === T.BWALL) { _paex = fx - 1; break; }
        const m = monsterAt(dg, fx, ty);
        if (m) {
          const d = _par.atk + rng(0, 3);
          m.hp -= d;
          m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
          ml.push(`毒矢が${m.name}に命中！${d}ダメージ！攻撃力が半減した！`);
          if (m.hp <= 0) { ml.push(`${m.name}は倒れた！`); monsterDrop(m, dg, ml, p); removeMonster(dg, m); }
          _pahit = true; break;
        }
        if (p && p.x === fx && p.y === ty) {
          const d = _par.atk + rng(0, 3);
          p.deathCause = `${trap.name}により`;
          p.hp -= d;
          p.poisoned = true;
          ml.push(`毒矢が命中！${d}ダメージ！毒を受けた！`);
          _pahit = true; break;
        }
        _paex = fx;
      }
      if (!_pahit) placeItemAt(dg, _paex, ty, _par, ml, ft);
      return "restart";
    }
    case "summon_trap": {
      ml.push(`${trap.name}が発動！`);
      const _sumDepth = (p ? p.depth : 1) || 1;
      const _sumCount = rng(2, 4);
      const _sumSpawned = spawnMonsters(dg, _sumCount, _sumDepth + 1, tx, ty, p, { aware: true, immediateAct: true });
      ml.push(`${_sumSpawned}体の敵が現れた！`);
      return "restart";
    }
    case "slow_trap": {
      ml.push(`${trap.name}が発動！`);
      const _slwm = monsterAt(dg, tx, ty);
      if (_slwm) { _slwm.speed = Math.max(0.25, _slwm.speed * 0.5); ml.push(`${_slwm.name}が鈍足になった！`); }
      if (p && p.x === tx && p.y === ty) { p.slowTurns = (p.slowTurns || 0) + 10; ml.push(`体が重くなった...(鈍足10ターン)`); }
      return "restart";
    }
    case "seal_trap": {
      ml.push(`${trap.name}が発動！`);
      const _seam = monsterAt(dg, tx, ty);
      if (_seam) { _seam.sealed = true; ml.push(`${_seam.name}の特技が封印された！`); }
      if (p && p.x === tx && p.y === ty) { p.sealedTurns = (p.sealedTurns || 0) + 50; ml.push(`魔法が封印された！(50ターン)`); }
      return "restart";
    }
    case "steal_trap": {
      ml.push(`${trap.name}が発動！`);
      const _stm = monsterAt(dg, tx, ty);
      if (_stm) {
        const _stNewItem = { ...pick(ITEMS), id: uid() };
        const _stFtm = new Set();
        const _stRoomm = dg.rooms[rng(0, dg.rooms.length - 1)];
        const _stXm = rng(_stRoomm.x, _stRoomm.x + _stRoomm.w - 1);
        const _stYm = rng(_stRoomm.y, _stRoomm.y + _stRoomm.h - 1);
        placeItemAt(dg, _stXm, _stYm, _stNewItem, ml, _stFtm);
        ml.push(`フロアのどこかにアイテムが出現した！`);
      }
      if (p && p.x === tx && p.y === ty && p.inventory && p.inventory.length > 0) {
        const _stIdx = rng(0, p.inventory.length - 1);
        const _stItem = p.inventory.splice(_stIdx, 1)[0];
        const _stFt = new Set();
        const _stRoom = dg.rooms[rng(0, dg.rooms.length - 1)];
        const _stX = rng(_stRoom.x, _stRoom.x + _stRoom.w - 1);
        const _stY = rng(_stRoom.y, _stRoom.y + _stRoom.h - 1);
        placeItemAt(dg, _stX, _stY, _stItem, ml, _stFt);
        ml.push(`${nameFn ? nameFn(_stItem) : _stItem.name}がどこかへ飛んでいった！`);
      }
      return "restart";
    }
    case "hunger_trap": {
      ml.push(`${trap.name}が発動！`);
      const _hngm = monsterAt(dg, tx, ty);
      if (_hngm) { _hngm.atk = Math.max(1, Math.floor((_hngm.atk || 1) / 2)); ml.push(`${_hngm.name}の攻撃力が半減した！`); }
      if (p && p.x === tx && p.y === ty) { p.hunger = Math.max(0, p.hunger - Math.floor((p.maxHunger || 100) * 0.1)); ml.push(`急に空腹を感じた！満腹度が10%下がった。`); }
      return "restart";
    }
    case "blowback_trap": {
      ml.push(`${trap.name}が発動！`);
      const _bbm = monsterAt(dg, tx, ty);
      if (_bbm) {
        const _bbd = _bbm.dir || { x: 1, y: 0 };
        const _bbdx = -(_bbd.x || 0), _bbdy = -(_bbd.y || 0);
        if (_bbdx !== 0 || _bbdy !== 0) {
          let _bbHitWall = false, _bbHitOther = null;
          for (let i = 0; i < 10; i++) {
            const _bnx = _bbm.x + _bbdx, _bny = _bbm.y + _bbdy;
            if (_bnx < 0 || _bnx >= MW || _bny < 0 || _bny >= MH || dg.map[_bny][_bnx] === T.WALL || dg.map[_bny][_bnx] === T.BWALL) { _bbHitWall = true; break; }
            const _bom = dg.monsters.find(o => o !== _bbm && o.x === _bnx && o.y === _bny);
            if (_bom) { _bbHitOther = _bom; break; }
            _bbm.x = _bnx; _bbm.y = _bny;
          }
          ml.push(`${_bbm.name}が吹き飛ばされた！`);
          if (_bbHitWall) { _bbm.hp -= 10; ml.push(`${_bbm.name}が壁に激突！10ダメージ！`); }
          if (_bbHitOther) { _bbm.hp -= 10; _bbHitOther.hp -= 10; ml.push(`${_bbm.name}が${_bbHitOther.name}に激突！お互いに10ダメージ！`); }
          dg.monsters = dg.monsters.filter(m => m.hp > 0);
        }
      }
      if (p && p.x === tx && p.y === ty) {
        const _pfd = p.facing || { dx: 0, dy: 1 };
        const _pbdx = -(_pfd.dx || 0), _pbdy = -(_pfd.dy || 0);
        let _pHitWall = false, _pHitMon = null;
        for (let i = 0; i < 10; i++) {
          const _pnx = p.x + _pbdx, _pny = p.y + _pbdy;
          if (_pnx < 0 || _pnx >= MW || _pny < 0 || _pny >= MH || dg.map[_pny][_pnx] === T.WALL || dg.map[_pny][_pnx] === T.BWALL) { _pHitWall = true; break; }
          const _pm = monsterAt(dg, _pnx, _pny);
          if (_pm) { _pHitMon = _pm; break; }
          p.x = _pnx; p.y = _pny;
        }
        ml.push(`向いていた方向と逆に吹き飛ばされた！`);
        if (_pHitWall) { p.deathCause = `${trap.name}による壁への衝突により`; p.hp -= 10; ml.push("壁に激突！10ダメージ！"); }
        if (_pHitMon) { p.hp -= 10; _pHitMon.hp -= 10; ml.push(`${_pHitMon.name}に激突！お互いに10ダメージ！`); dg.monsters = dg.monsters.filter(m => m.hp > 0); }
      }
      return "restart";
    }
    default:
      ml.push(`${trap.name}が発動！`);
      return "restart";
  }
  } finally { _fireTrapDepth--; }
}

export function makeArrow(c = 1) {
  return { ...ARROW_T, id:uid(), count:Math.min(99, c) };
}

export function makePoisonArrow(c = 1) {
  return { ...POISON_ARROW_T, id:uid(), count:Math.min(99, c) };
}

export function makePiercingArrow(c = 1) {
  return { ...PIERCING_ARROW_T, id:uid(), count:Math.min(99, c) };
}

export function addArrowsInv(inv, c, poison = false, pierce = false, maxInv = 30) {
  let r = c;
  for (const i of inv) {
    if (i.type === "arrow" && !!i.poison === poison && !!i.pierce === pierce && i.count < 99) {
      const a = Math.min(r, 99 - i.count);
      i.count += a;
      r -= a;
      if (r <= 0) return true;
    }
  }
  while (r > 0) {
    if (inv.length >= maxInv) return false;
    const n = Math.min(r, 99);
    inv.push(pierce ? makePiercingArrow(n) : poison ? makePoisonArrow(n) : makeArrow(n));
    r -= n;
  }
  return true;
}

export function applyPotionEffect(eff, val, kind, target, dg, p, ml, luFn, blessed = false, cursed = false) {
  const _monKill = (mon) => {
    if (mon.hp <= 0) killMonster(mon, dg, p, ml, luFn);
  };
  const _fireResist = (pl) =>
    pl.armor?.ability === "fire_resist" || !!pl.armor?.abilities?.includes("fire_resist");
  switch (eff) {
    case "water": // 水は通常のhealと同じ挙動
    case "heal":
      if (cursed) {
        // 反転→ダメージ
        const d = Math.max(1, Math.round(val * 0.7));
        if (kind === "monster") { target.hp -= d; ml.push(`${target.name}は変な薬を浴びた！${d}ダメージ！`); _monKill(target); }
        if (kind === "player") { p.deathCause = "呪われた回復薬の飛散により"; p.hp -= d; ml.push(`変な薬を浴びた！${d}ダメージ！【呪】`); }
      } else {
        const _mult = blessed ? 1.5 : 1;
        if (kind === "monster") { const h = Math.min(Math.round(val * _mult), target.maxHp - target.hp); if (h > 0) { target.hp += h; ml.push(`${target.name}のHPが${h}回復した！`); } }
        if (kind === "player") { const h = Math.min(Math.round(val * _mult), p.maxHp - p.hp); if (h > 0) { p.hp += h; ml.push(`HPが${h}回復した！${blessed ? "(祝福)" : ""}`); } }
      }
      break;
    case "poison": {
      if (kind === "monster") {
        if (cursed) {
          // 反転→モンスター回復
          const h = Math.min(Math.round(val * 0.5), target.maxHp - target.hp);
          if (h > 0) { target.hp += h; ml.push(`${target.name}は変な薬で回復した！${h}HP`); }
        } else {
          const dmg = Math.max(1, Math.round((val + rng(-3, 3)) * (blessed ? 1.5 : 1)));
          target.hp -= dmg;
          ml.push(`${target.name}は毒を浴びた！${dmg}ダメージ！${blessed ? "(強毒)" : ""}`);
          _monKill(target);
        }
      }
      if (kind === "player") {
        if (cursed) {
          // 反転→解毒
          if (p.poisoned) {
            p.poisoned = false;
            if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
            ml.push("毒が体から消えた！攻撃力も回復！【呪→解毒】");
          } else {
            ml.push("変な味がするが…毒はかかっていなかった。【呪→解毒】");
          }
        } else {
          p.poisoned = true;
          if (blessed) {
            const extraLoss = Math.min(3, p.atk - 1);
            p.atk -= extraLoss;
            p.poisonAtkLoss = (p.poisonAtkLoss || 0) + extraLoss;
            ml.push(`強烈な毒を浴びた！毒状態になり攻撃力が${extraLoss}下がった！(強毒)`);
          } else {
            ml.push("毒状態になった！攻撃力が徐々に下がっていく…");
          }
        }
      }
      break;
    }
    case "fire": {
      if (cursed) {
        // 反転→回復
        if (kind === "monster") { const h = Math.min(Math.round(val * 0.5), target.maxHp - target.hp); if (h > 0) { target.hp += h; ml.push(`${target.name}は炎の薬で温まった！${h}HP回復`); } }
        if (kind === "player") { const h = Math.min(val, p.maxHp - p.hp); p.hp += h; ml.push(`体が温まりHP+${h}回復した！【呪→回復】`); }
      } else {
        const dmg = val + rng(-5, 5);
        if (kind === "monster") {
          const d = Math.max(1, Math.round(dmg * (blessed ? 1.5 : 1)));
          target.hp -= d;
          ml.push(`${target.name}は炎に包まれた！${d}ダメージ！${blessed ? "(強炎)" : ""}`);
          _monKill(target);
        }
        if (kind === "player") {
          const rd = Math.max(1, Math.round(dmg * (blessed ? 1.5 : 1)));
          const fd = _fireResist(p) ? Math.floor(rd / 2) : rd;
          p.deathCause = "炎の薬の飛散により";
          p.hp -= fd;
          ml.push(`炎に包まれた！${fd}ダメージ！${_fireResist(p) ? "(耐火)" : ""}${blessed ? "(強炎)" : ""}`);
          applyLightningToInventory(p, dg, ml, luFn);
        }
      }
      break;
    }
    case "sleep": {
      if (cursed) {
        // 反転→覚醒（眠り解消 / プレイヤーは2倍速）
        if (kind === "monster") { target.sleepTurns = 0; ml.push(`${target.name}が目を覚ました！(覚醒)`); }
        if (kind === "player") { p.sleepTurns = 0; p.hasteTurns = (p.hasteTurns || 0) + 5; ml.push("眠気が吹き飛んだ！体が覚醒した！(2倍速5ターン)【呪→覚醒】"); }
      } else {
        const t = Math.max(1, Math.round((val + rng(-1, 1)) * (blessed ? 2 : 1)));
        if (kind === "monster") {
          if (!isStatusImmune(target, ml, target.name)) { target.sleepTurns = (target.sleepTurns || 0) + t; ml.push(`${target.name}は眠りに落ちた！${blessed ? "(強眠)" : ""}`); }
        }
        if (kind === "player") {
          if (!isStatusImmune(p, ml)) { p.sleepTurns = (p.sleepTurns || 0) + t; ml.push(`眠りに落ちた...(${t}ターン)${blessed ? "(強眠)" : ""}`); }
        }
      }
      break;
    }
    case "power":
      if (cursed) {
        // 反転→攻撃力減少
        if (kind === "monster") { const _pv = Math.max(1, Math.round(val * 0.5)); target.atk = Math.max(1, target.atk - _pv); ml.push(`${target.name}の攻撃力が下がった！`); }
        if (kind === "player") { const _pv = Math.max(1, Math.round(val * 0.5)); p.atk = Math.max(1, p.atk - _pv); ml.push(`力が抜けた...攻撃力-${_pv}【呪】`); }
      } else {
        const _pv = Math.max(1, Math.round(val * (blessed ? 1.5 : 1)));
        if (kind === "monster") { target.atk += _pv; ml.push(`${target.name}の攻撃力が上がった！`); }
        if (kind === "player") { p.atk += _pv; ml.push(`攻撃力が${_pv}上がった！${blessed ? "(祝福)" : ""}`); }
      }
      break;
    case "slow":
      if (cursed) {
        // 反転→加速
        if (kind === "monster") { target.speed = Math.min(2, (target.speed || 1) * 1.5); ml.push(`${target.name}は素早くなった！(覚醒)`); }
        if (kind === "player") { p.hasteTurns = (p.hasteTurns || 0) + 10; ml.push("体が軽くなった！(2倍速10ターン)【呪→加速】"); }
      } else {
        if (kind === "monster") { target.speed = Math.max(0.25, target.speed * (blessed ? 0.25 : 0.5)); ml.push(`${target.name}は鈍足になった！${blessed ? "(強鈍足)" : ""}`); }
        if (kind === "player") { const _st = blessed ? 20 : 10; p.slowTurns = (p.slowTurns || 0) + _st; ml.push(`体が重くなった...(鈍足${_st}ターン)${blessed ? "(強鈍足)" : ""}`); }
      }
      break;
    case "paralyze":
      if (cursed) {
        // 呪い→状態異常防止200ターン
        if (kind === "monster") { target.statusImmune = (target.statusImmune || 0) + 200; ml.push(`${target.name}は状態異常を防ぐ力を得た！(200ターン)`); }
        if (kind === "player")  { p.statusImmune = (p.statusImmune || 0) + 200; ml.push("状態異常を防ぐ力が宿った！(200ターン)【呪→状態防止】"); }
      } else {
        if (kind === "monster") {
          if (isStatusImmune(target, ml, target.name)) break;
          target.paralyzed = true;
          if (blessed) { target.paralyzeHits = 2; ml.push(`${target.name}は強い金縛りになった！2回アクションが必要！`); }
          else ml.push(`${target.name}は金縛りになった！`);
        }
        if (kind === "player") {
          if (isStatusImmune(p, ml)) break;
          const _pt = blessed ? 20 : 10;
          p.paralyzeTurns = _pt;
          ml.push(`金縛りになった！(${_pt}ターン)${blessed ? "(強金縛り)" : ""}`);
        }
      }
      break;
    case "confuse":
      if (cursed) {
        // 呪い→混乱解消 + 必中100ターン（攻撃・投擲が外れなくなる。未実装中は予約のみ）
        if (kind === "monster") { target.confusedTurns = 0; ml.push(`${target.name}の混乱が解けた！`); }
        if (kind === "player") {
          p.confusedTurns = 0;
          p.sureHitTurns = (p.sureHitTurns || 0) + 100;
          ml.push("頭が冴えた！混乱が消え、必中状態になった！(100ターン)【呪→必中】");
        }
      } else {
        if (kind === "monster") { const _ct = blessed ? 40 : 20; target.confusedTurns = (target.confusedTurns || 0) + _ct; ml.push(`${target.name}が混乱した！(${target.confusedTurns}ターン)${blessed ? "(強混乱)" : ""}`); }
        if (kind === "player") { const _ct = blessed ? 10 : 5; p.confusedTurns = (p.confusedTurns || 0) + _ct; ml.push(`混乱した！(${p.confusedTurns}ターン)${blessed ? "(強混乱)" : ""}`); }
      }
      break;
    case "mana":
      if (kind === "player") {
        if (cursed) {
          // 反転→MP封印
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 10;
          ml.push("魔力が封じられた！(MP封印10ターン)【呪】");
        } else if ((p.mpCooldownTurns || 0) > 0) {
          ml.push(`MPが封印中のため回復できない！(残り${p.mpCooldownTurns}ターン)`);
        } else {
          const add = Math.min(Math.round(val * (blessed ? 1.5 : 1)), (p.maxMp || 20) - (p.mp || 0));
          p.mp = (p.mp || 0) + add;
          if (add > 0) ml.push(`MPが${add}回復した！${blessed ? "(祝福)" : ""}`);
        }
      }
      break;
    case "darkness":
      if (kind === "player") {
        if (cursed) {
          p.monsterSenseTurns = (p.monsterSenseTurns || 0) + 100;
          ml.push("呪われた薬！フロアのモンスターが感知できる！(100ターン)【呪→感知】");
        } else {
          const _dt = blessed ? 50 : 20;
          p.darknessTurns = (p.darknessTurns || 0) + _dt;
          ml.push(`暗闇に包まれた！視界が1マスになる！(${p.darknessTurns}ターン)${blessed ? "(祝福)" : ""}`);
        }
      }
      if (kind === "monster") {
        if (cursed) {
          target.darknessTurns = 0;
          target.darkDir = null;
          ml.push(`${target.name}の暗闇が晴れた！【呪→解除】`);
        } else {
          target.darknessTurns = blessed ? 9999 : 50;
          target.darkDir = null;
          target.aware = false;
          ml.push(`${target.name}は暗闇に包まれた！${blessed ? "(永続)" : "(50ターン)"}`);
        }
      }
      break;
    case "bewitch":
      if (kind === "player") {
        if (cursed) {
          dg.traps.forEach(t => t.revealed = true);
          ml.push("呪われた薬！フロアの罠が全て見えた！【呪→罠看破】");
        } else {
          const _bt = blessed ? 100 : 50;
          p.bewitchedTurns = (p.bewitchedTurns || 0) + _bt;
          ml.push(`幻惑された！周囲の見た目がおかしくなった！(${p.bewitchedTurns}ターン)${blessed ? "(祝福)" : ""}`);
        }
      }
      if (kind === "monster") {
        if (cursed) {
          target.fleeingTurns = 0;
          ml.push(`${target.name}の幻惑が解けた！【呪→解除】`);
        } else {
          target.fleeingTurns = blessed ? 9999 : 50;
          ml.push(`${target.name}は幻惑状態になり逃げ出した！${blessed ? "(永続)" : "(50ターン)"}`);
        }
      }
      break;
    case "levelup":
      if (kind === "player") {
        if (cursed) {
          // 呪い：1階上へワープ（フラグ経由でGame.jsx側が処理）
          p._pendingWarpUp = true;
          ml.push("呪われたレベルアップの薬！天井を突き破って上の階へ飛ばされた！【呪】");
        } else {
          const _times = blessed ? 2 : 1;
          for (let _i = 0; _i < _times; _i++) {
            p.exp = p.nextExp;
            if (luFn) luFn(p, ml);
          }
          if (!blessed) ml.push("レベルアップの薬を飲んだ！");
        }
      }
      if (kind === "monster") {
        if (cursed) {
          monLevelDown(target, dg, ml);
        } else {
          const _times2 = blessed ? 2 : 1;
          for (let _i = 0; _i < _times2; _i++) {
            monLevelUp(target, dg, ml);
          }
        }
      }
      break;
  }
}

export const POTION_FOOD_PREFIX = {
  // 通常/祝福
  heal:     "回復の",
  poison:   "猛毒の",
  fire:     "焼いた",  // special-cased
  sleep:    "睡眠の",
  power:    "強化の",
  confuse:  "混乱の",
  mana:     "魔力の",
  slow:     "鈍足の",
  darkness: "暗闇の",
  bewitch:  "幻惑の",
  paralyze: "金縛りの",
  levelup:  "経験の",
  // 呪い（食べた時の効果が反転）
  c_heal:     "猛毒の",
  c_poison:   "解毒の",
  // c_fire = 通常と同じ（焼いた、special-cased）
  c_sleep:    "覚醒の",
  c_power:    "弱化の",
  c_mana:     "封印の",
  c_confuse:  "必中の",
  c_slow:     "加速の",
  c_darkness: "感知の",
  c_bewitch:   "看破の",
  c_paralyze:  "予防の",
  c_levelup:   "退化の",
};

/** 調理済み食糧をさらに加熱して「焦げた」状態にする共通ヘルパー */
export function burnFoodItem(item, ml) {
  if (item.burnt) { ml.push(`${item.name}はこれ以上焦げられない。`); return; }
  if (item.name.startsWith("焼いた")) {
    item.name = "焦げた" + item.name.slice("焼いた".length);
  } else {
    item.name = "焦げた" + item.name;
  }
  item.value = Math.max(1, Math.floor(item.value / 2));
  item.burnt = true;
  ml.push(`${item.name}になった！`);
}

export function applyPotionToItem(eff, val, item, dg, ml, cursed = false, dnFn = null) {
  const _dn = dnFn ? dnFn(item) : item.name;
  if (item.type === "spellbook") {
    if (eff === "fire") {
      ml.push(`魔法書「${_dn}」が燃えてなくなった！`);
      return "burn";
    }
    if (item.spell) {
      const oldName = _dn; /* 名前変更前に取得 */
      item.name = "白紙の魔法書";
      item.spell = null;
      item.desc = "魔法が消えてしまった。魔法のマーカー(5回分)で好きな魔法書に変えられる。";
      ml.push(`魔法書「${oldName}」の文字が消えた！→白紙の魔法書`);
    } else {
      ml.push("白紙の魔法書だ。これ以上変化しない。");
    }
    return;
  }
  if (item.type === "scroll") {
    if (eff === "fire") {
      ml.push(`巻物「${_dn}」が炎で燃えてなくなった！`);
      return "burn";
    }
    if (item.effect !== "blank") {
      const oldName = _dn; /* 名前変更前に取得 */
      item.name = "白紙の巻物";
      item.effect = "blank";
      item.desc = "何も書かれていない。魔法のマーカーで書き込める。";
      ml.push(`巻物「${oldName}」の文字が消えた！→白紙の巻物`);
    } else {
      ml.push("白紙の巻物だ。これ以上変化しない。");
    }
    return;
  }
  if (item.type !== "food") return;
  if (!item.potionEffects) item.potionEffects = [];
  if (eff === "fire") {
    // 呪いでも通常でも同じ（焼き調理）
    if (!item.cooked) {
      item.value = item.value * 2;
      item.cooked = true;
      item.name = "焼いた" + item.name;
      ml.push(`${item.name}になった！`);
    } else {
      burnFoodItem(item, ml);
    }
    return;
  }
  const key = cursed ? `c_${eff}` : eff;
  const pf = POTION_FOOD_PREFIX[key];
  if (!pf) return;
  if (item.potionEffects.includes(key)) {
    ml.push(`${item.name}は既に${pf}効果を持っている。`);
    return;
  }
  item.potionEffects.push(key);
  item.name = pf + item.name;
  ml.push(`${item.name}になった！`);
}

export function splashPotion(dg, cx, cy, eff, val, p, ml, luFn, blessed = false, cursed = false, dnFn = null) {
  ml.push("瓶が割れて中身が飛び散った！");
  const tiles = [];
  for (let dy2 = -1; dy2 <= 1; dy2++)
    for (let dx2 = -1; dx2 <= 1; dx2++) {
      const tx = cx + dx2, ty = cy + dy2;
      if (tx >= 0 && tx < MW && ty >= 0 && ty < MH && dg.map[ty][tx] !== T.WALL && dg.map[ty][tx] !== T.BWALL)
        tiles.push({ x:tx, y:ty });
    }
  for (const { x, y } of tiles) {
    const mon = monsterAt(dg, x, y);
    if (mon) {
      weakenOrClearParalysis(mon, ml);
      applyPotionEffect(eff, val, "monster", mon, dg, p, ml, luFn, blessed, cursed);
    }
    if (x === p.x && y === p.y) applyPotionEffect(eff, val, "player", p, dg, p, ml, luFn, blessed, cursed);
    const trap = dg.traps.find(t => t.x === x && t.y === y);
    if (trap) {
      dg.traps = dg.traps.filter(t => t !== trap);
      trap.revealed = true;
      ml.push(`${trap.name}は薬液で壊れた！`);
    }
    const _splPc = dg.pentacles?.find(pc => pc.x === x && pc.y === y);
    if (_splPc) {
      dg.pentacles = dg.pentacles.filter(pc => pc !== _splPc);
      ml.push(`${_splPc.name}が薬液で消えた！`);
    }
    const it = itemAt(dg, x, y);
    if (it) {
      const br = applyPotionToItem(eff, val, it, dg, ml, cursed, dnFn);
      if (br === "burn") {
        removeFloorItem(dg, it);
        chargeShopItem(it, dg, ml);
      }
    }
  }
}

/* 祝福・呪いの水を投擲：着弾点のアイテム1つのみに祝呪効果（周囲8マス無効） */
export function applyWaterSplash(dg, cx, cy, blessed, cursed, ml) {
  ml.push("瓶が割れた！");
  const it = itemAt(dg, cx, cy);
  if (!it) { if (blessed || cursed) ml.push("着弾点にアイテムがなかった…"); return; }
  if (it.type === "pot") {
    if (blessed) {
      it.capacity = (it.capacity || 1) + 1;
      ml.push(`${it.name}が祝福の水を浴びた！(容量+1 → ${it.capacity})【祝】`);
    } else if (cursed) {
      const _nc = Math.max(0, (it.capacity || 1) - 1);
      if ((it.contents?.length || 0) > _nc) {
        const _fts = new Set();
        for (const _ci of (it.contents || [])) placeItemAt(dg, cx, cy, _ci, ml, _fts);
        removeFloorItem(dg, it);
        ml.push(`${it.name}が呪いの水を浴びて割れた！中身が飛び出した！【呪】`);
      } else {
        it.capacity = _nc;
        ml.push(`${it.name}が呪いの水を浴びた！(容量-1 → ${it.capacity})【呪】`);
      }
    }
  } else if (it.type !== "gold" && it.type !== "arrow") {
    if (blessed) {
      it.blessed = true; it.cursed = false; it.bcKnown = true;
      ml.push(`${it.name}が祝福の水を浴びた！【祝】`);
    } else if (cursed) {
      it.cursed = true; it.blessed = false; it.bcKnown = true;
      ml.push(`${it.name}が呪いの水を浴びた！【呪】`);
    }
  }
}

export function soakItemIntoSpring(spr, item, ml, dg = null, dnFn = null) {
  const _dn = (it) => dnFn ? dnFn(it) : it.name;
  spr.contents = spr.contents || [];
  if (item.type === "bottle") {
    const wb = { ...WATER_BOTTLE, id:uid() };
    if (item.blessed) { wb.blessed = true; wb.bcKnown = true; }
    else if (item.cursed) { wb.cursed = true; wb.bcKnown = true; }
    const _wbSuffix = item.blessed ? "【祝】" : item.cursed ? "【呪】" : "";
    ml.push(_dn(item) + "が泉に落ちて水になった！" + _wbSuffix);
    spr.contents.push(wb);
  } else if (item.type === "weapon") {
    let _wNote = "";
    if (item.cursed) { item.cursed = false; _wNote += " 呪いが解けた！"; }
    if (item.ability === "no_degrade" || item.abilities?.includes("no_degrade")) {
      ml.push(_dn(item) + "が泉に落ちたが金でできているので錆びなかった！" + _wNote);
    } else {
      const _fp = v => v > 0 ? "+" + v : v === 0 ? "無印" : "" + v;
      const _op = item.plus || 0;
      item.plus = _op - 1;
      ml.push(_dn(item) + "が泉に落ちた...錆びた！(" + _fp(_op) + "→" + _fp(item.plus) + ")" + _wNote);
    }
    spr.contents.push(item);
  } else if (item.type === "armor") {
    let _aNote = "";
    if (item.cursed) { item.cursed = false; _aNote += " 呪いが解けた！"; }
    if (item.ability === "no_degrade" || item.abilities?.includes("no_degrade")) {
      ml.push(_dn(item) + "が泉に落ちたが金でできているので錆びなかった！" + _aNote);
    } else {
      const _fp = v => v > 0 ? "+" + v : v === 0 ? "無印" : "" + v;
      const _op = item.plus || 0;
      item.plus = _op - 1;
      ml.push(_dn(item) + "が泉に落ちた...錆びた！(" + _fp(_op) + "→" + _fp(item.plus) + ")" + _aNote);
    }
    spr.contents.push(item);
  } else if (item.type === "scroll") {
    if (item.effect !== "blank") {
      const oldName = _dn(item); /* 名前変更前に取得 */
      item.name = "白紙の巻物";
      item.effect = "blank";
      item.desc = "何も書かれていない。魔法のマーカーで書き込める。";
      ml.push(`巻物「${oldName}」が泉に落ちた...文字が消えた！`);
    } else {
      ml.push("白紙の巻物が泉に落ちた。");
    }
    spr.contents.push(item);
  } else if (item.type === "spellbook") {
    if (item.spell) {
      const oldName = _dn(item); /* 名前変更前に取得 */
      item.name = "白紙の魔法書";
      item.spell = null;
      item.desc = "魔法が消えてしまった。魔法のマーカー(5回分)で好きな魔法書に変えられる。";
      ml.push(`魔法書「${oldName}」が泉に落ちた...文字が消えた！`);
    } else {
      ml.push("白紙の魔法書が泉に落ちた。");
    }
    spr.contents.push(item);
  } else {
    ml.push(_dn(item) + "が泉に落ちた。");
    spr.contents.push(item);
  }
  /* 5個目が入ったら泉が干上がる（容量4） */
  if (dg && spr.contents.length >= 5) {
    ml.push("泉が干上がった！中のアイテムが飛び出した！");
    const _ft = new Set();
    for (const _ci of spr.contents) {
      placeItemAt(dg, spr.x, spr.y, _ci, ml, _ft);
    }
    dg.springs = dg.springs.filter(s => s !== spr);
  }
}

export function placeItemAt(dg, tx, ty, item, ml, ft, dep = 0, p = null) {
  if (dep > 30) { ml.push(`${item.name}は消えてしまった！`); return false; }
  for (const [dx, dy] of DRO) {
    const cx = tx + dx, cy = ty + dy;
    if (cx < 0 || cx >= MW || cy < 0 || cy >= MH ||
        dg.map[cy][cx] === T.WALL || dg.map[cy][cx] === T.BWALL || dg.map[cy][cx] === T.SD || dg.map[cy][cx] === T.SU) continue;
    const trap = dg.traps.find(t => t.x === cx && t.y === cy && !ft.has(t.id));
    if (trap) {
      ft.add(trap.id);
      trap.revealed = true;
      const r = fireTrapItem(trap, item, dg, cx, cy, ml, ft, p);
      if (Math.random() < 0.3) {
        dg.traps = dg.traps.filter(t => t !== trap);
        ml.push(`${trap.name}は壊れた。`);
      }
      if (r === "destroyed") return false;
      if (r === "pitfall_player") return "pitfall_player";
      if (r === "restart") return placeItemAt(dg, cx, cy, item, ml, ft, dep + 1, p);
      continue;
    }
    if (dg.traps.some(t => t.x === cx && t.y === cy)) continue;
    if (dg.springs?.some(s => s.x === cx && s.y === cy)) continue;
    if (dg.bigboxes?.some(b => b.x === cx && b.y === cy)) continue;
    if (dg.pentacles?.some(pc => pc.x === cx && pc.y === cy)) continue;
    if (dg.items.some(i => i.x === cx && i.y === cy)) continue;
    item.x = cx;
    item.y = cy;
    dg.items.push(item);
    if (item.shopPrice) {
      const _allS = dg.shops || (dg.shop ? [dg.shop] : []);
      const _iShop = _allS.find(s => s.id === item._shopId && s.unpaidTotal > 0) ||
                     _allS.find(s => s.unpaidTotal > 0);
      if (_iShop) {
        const r = _iShop.room;
        if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) {
          _iShop.unpaidTotal = Math.max(0, _iShop.unpaidTotal - item.shopPrice);
          if (_iShop.unpaidTotal === 0) {
            const sk = dg.monsters.find(m => m.id === _iShop.shopkeeperId && m.state === "blocking");
            if (sk) { sk.state = "friendly"; sk.x = sk.homePos.x; sk.y = sk.homePos.y; }
            if (ml) ml.push("残高がゼロになった。店主が入り口を開けた。");
          }
        }
      }
    }
    return true;
  }
  ml.push(`${item.name}は消えてしまった！`);
  return false;
}

export function monsterDrop(m, dg, ml, p = null) {
  const drops = [];
  /* Fixed drops for item-using enemy subtypes */
  if (m.subtype === "archer") {
    drops.push(makeArrow(rng(3, 8)));
  }
  if (m.subtype === "wanduser") {
    const _wt = pick(WANDS);
    drops.push({ ..._wt, id: uid(), charges: Math.max(1, rng(1, _wt.charges)) });
  }
  /* ランナー（コロポックル等）：必ずアイテムを1つドロップ */
  if (m.subtype === "runner") {
    const _pool = [...ITEMS.filter(i => i.type !== "gold"), ...WANDS];
    const _t = pick(_pool);
    const _di = { ..._t, id: uid() };
    if (_di.type === "pen")  _di.charges = rng(2, 3);
    else if (_di.type === "wand") _di.charges = Math.max(1, _di.charges + rng(-1, 1));
    drops.push(_di);
  }
  /* 5% ランダムドロップ（一般モンスター） */
  if (Math.random() < 0.05) {
    const _pool = [...ITEMS.filter(i => i.type !== "gold"), ...WANDS];
    const _t = pick(_pool);
    const _di = { ..._t, id: uid() };
    if (_di.type === "pen")  _di.charges = rng(2, 3);
    else if (_di.type === "wand") _di.charges = Math.max(1, _di.charges + rng(-1, 1));
    drops.push(_di);
  }
  if (drops.length === 0) return;
  const _ft = new Set();
  for (const _drop of drops) {
    const _spr = dg.springs?.find(s => s.x === m.x && s.y === m.y);
    if (_spr) {
      soakItemIntoSpring(_spr, _drop, ml, dg);
    } else {
      placeItemAt(dg, m.x, m.y, _drop, ml, _ft, 0, p);
    }
  }
}

/** プレイヤーがモンスターを倒した時の共通処理 */
export function killMonster(mon, dg, p, ml, luFn) {
  ml.push(`${mon.name}を倒した！(+${mon.exp}exp)`);
  p.exp += mon.exp;
  monsterDrop(mon, dg, ml, p);
  removeMonster(dg, mon);
  if (luFn) luFn(p, ml);
}

export function pushEntity(dg, x, y, dx, dy, dist, ml, kind, entity, p, luFn) {
  let cx = x, cy = y;
  for (let i = 0; i < dist; i++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= MW || ny < 0 || ny >= MH || dg.map[ny][nx] === T.WALL || dg.map[ny][nx] === T.BWALL) {
      if (kind === "monster") { entity.hp -= 5; ml.push(`${entity.name}は壁に叩きつけられた！5ダメージ！`); }
      if (kind === "player")  { p.deathCause = "吹き飛ばされての壁への激突により"; p.hp -= 5; ml.push("壁に叩きつけられた！5ダメージ！"); }
      break;
    }
    if (kind === "item") {
      if (entity.type === "potion") {
        const mon = monsterAt(dg, nx, ny);
        if (mon) return { x:nx, y:ny, consumed:true, splash:true };
        const trap = dg.traps.find(t => t.x === nx && t.y === ny);
        if (trap) return { x:nx, y:ny, consumed:true, splash:true };
        const spr = dg.springs?.find(s => s.x === nx && s.y === ny);
        if (spr) return { x:nx, y:ny, consumed:true, spring:spr };
        const bbP = dg.bigboxes?.find(b => b.x === nx && b.y === ny);
        if (bbP) return { x:nx, y:ny, consumed:true, bigbox:bbP };
      } else {
        const mon = monsterAt(dg, nx, ny);
        if (mon) {
          weakenOrClearParalysis(mon, ml);
          const dmg = rng(3, 8);
          mon.hp -= dmg;
          ml.push(`飛んできた${entity.name}が${mon.name}に命中！${dmg}ダメージ！`);
          if (mon.hp <= 0) {
            ml.push(`${mon.name}を倒した！(+${mon.exp}exp)`);
            if (p) p.exp += mon.exp;
            monsterDrop(mon, dg, ml, p);
            removeMonster(dg, mon);
            if (luFn && p) luFn(p, ml);
          }
          return { x:cx, y:cy, consumed:true };
        }
        const trap = dg.traps.find(t => t.x === nx && t.y === ny);
        if (trap) {
          trap.revealed = true;
          const ft = new Set();
          ft.add(trap.id);
          const r = fireTrapItem(trap, entity, dg, nx, ny, ml, ft, p);
          if (Math.random() < 0.3) {
            dg.traps = dg.traps.filter(t => t !== trap);
            ml.push(`${trap.name}は壊れた。`);
          }
          if (r === "destroyed") return { x:cx, y:cy, consumed:true };
          return { x:nx, y:ny, consumed:false };
        }
        const sprI = dg.springs?.find(s => s.x === nx && s.y === ny);
        if (sprI) return { x:nx, y:ny, consumed:true, spring:sprI };
        const bbI = dg.bigboxes?.find(b => b.x === nx && b.y === ny);
        if (bbI) return { x:nx, y:ny, consumed:true, bigbox:bbI };
      }
    }
    if (kind === "monster" && dg.monsters.some(m => m !== entity && m.x === nx && m.y === ny)) break;
    cx = nx; cy = ny;
  }
  if (kind === "monster" || kind === "player") { entity.x = cx; entity.y = cy; }
  else if (kind === "trap") { entity.x = cx; entity.y = cy; }
  return { x:cx, y:cy, consumed:false };
}

export function chargeShopItem(item, dg, ml) {
  if (!item.shopPrice) return;
  const _allS = dg.shops || (dg.shop ? [dg.shop] : []);
  const _shop = _allS.find(s => s.id === item._shopId) || _allS[0];
  if (!_shop) return;
  _shop.unpaidTotal += item.shopPrice;
  const sk = dg.monsters.find(m => m.id === _shop.shopkeeperId && m.state === "friendly");
  if (sk) sk.state = "blocking";
  ml.push(`${item.name}(${item.shopPrice}G)の代金が請求された！`);
}

export function inMagicSealRoom(x, y, dg) {
  if (!dg.pentacles?.length || !dg.rooms) return false;
  /* 祝福された魔封じの魔方陣があればフロア全体に効果 */
  if (dg.pentacles.some(pc => pc.kind === "magic_seal" && pc.blessed)) return true;
  /* 呪われた魔封じは封じない（代わりに魔法ダメージ2倍） */
  /* 通常の魔封じ：部屋全体 */
  const room = dg.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  if (!room) return false;
  return dg.pentacles.some(pc => pc.kind === "magic_seal" && !pc.cursed &&
    pc.x >= room.x && pc.x < room.x + room.w && pc.y >= room.y && pc.y < room.y + room.h);
}

/* 呪われた魔封じの魔方陣：部屋内で魔法ダメージ2倍 */
export function inCursedMagicSealRoom(x, y, dg) {
  if (!dg.pentacles?.length || !dg.rooms) return false;
  const room = dg.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  if (!room) return false;
  return dg.pentacles.some(pc => pc.kind === "magic_seal" && pc.cursed &&
    pc.x >= room.x && pc.x < room.x + room.w && pc.y >= room.y && pc.y < room.y + room.h);
}

/* 遠投の魔方陣判定: "farcast"|"cursed"|false */
export function getFarcastMode(x, y, dg) {
  if (!dg.pentacles?.length || !dg.rooms) return false;
  /* 祝福された遠投の魔方陣があればフロア全体 */
  const blessedFc = dg.pentacles.find(pc => pc.kind === "farcast" && pc.blessed);
  if (blessedFc) return "farcast";
  /* 呪われた遠投の魔方陣が部屋内にあれば1マス */
  const room = dg.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  if (!room) return false;
  const fcPent = dg.pentacles.find(pc => pc.kind === "farcast" &&
    pc.x >= room.x && pc.x < room.x + room.w && pc.y >= room.y && pc.y < room.y + room.h);
  if (!fcPent) return false;
  return fcPent.cursed ? "cursed" : "farcast";
}

export function shootArrow(p, dg, idx, dx, dy, ml, luFn, bbFn) {
  const st = p.inventory[idx];
  if (!st || st.type !== "arrow") return;
  st.count--;
  if (st.count <= 0) p.inventory.splice(idx, 1);
  const _isPoison = !!st.poison;
  const _isPierce = !!st.pierce;
  const dmg = (st.atk || 4) + rng(1, 4);
  const _fc = getFarcastMode(p.x, p.y, dg);
  const _isFc = _fc === "farcast";
  const _pierceMode = _isPierce || _isFc;
  const _maxR = _fc === "cursed" ? 1 : _pierceMode ? 50 : 10;
  const _arName = st.name || "矢";
  const _dropItem = () => _isPierce ? makePiercingArrow(1) : _isPoison ? makePoisonArrow(1) : makeArrow(1);
  let lx = p.x, ly = p.y, hit = false;
  for (let d = 1; d <= _maxR; d++) {
    const tx = p.x + dx * d, ty = p.y + dy * d;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
    if (!_pierceMode && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
    const m = monsterAt(dg, tx, ty);
    if (m) {
      m.hp -= dmg;
      if (_isPoison) m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
      ml.push(`${_arName}が${m.name}に命中！${dmg}ダメージ！${_isPoison ? "攻撃力が半減した！" : ""}`);
      if (m.hp <= 0) killMonster(m, dg, p, ml, luFn);
      if (!_pierceMode) { hit = true; break; }
    }
    if (!_pierceMode) {
      const bb = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
      if (bb) {
        ml.push(`${_arName}を射った。`);
        const _ar = _dropItem();
        if (bbFn) bbFn(bb, _ar, dg, ml);
        else { const ft = new Set(); placeItemAt(dg, tx, ty, _ar, ml, ft); }
        hit = true; break;
      }
    }
    lx = tx; ly = ty;
  }
  if (_pierceMode || _fc === "cursed") {
    ml.push(`${_arName}を射った。矢は消滅した。`);
  } else if (!hit) {
    ml.push(`${_arName}を射った。`);
    const ft = new Set();
    placeItemAt(dg, lx, ly, _dropItem(), ml, ft);
  }
}

export function checkShopTheft(p, dg, ml) {
  if (!dg || p.isThief) return;
  const shops = dg.shops || (dg.shop ? [dg.shop] : []);
  for (const s of shops) {
    if (s.unpaidTotal <= 0) continue;
    const inShop = p.x >= s.room.x && p.x < s.room.x + s.room.w &&
                   p.y >= s.room.y && p.y < s.room.y + s.room.h;
    if (!inShop) {
      p.isThief = true;
      const sk = dg.monsters.find(m => m.id === s.shopkeeperId);
      if (sk) { sk.state = "hostile"; sk.aware = true; sk.lastPx = p.x; sk.lastPy = p.y; }
      ml.push("商品を持ったまま店を出た！泥棒扱いになった！");
      return;
    }
  }
}

export const SPELLS=[
  {id:"fire_bolt",name:"炎の魔法",mpCost:8,effect:"fire_bolt",damage:25,range:10,needsDir:true,desc:"炎の弾を撃つ。MP:8"},
  {id:"ice_bolt",name:"氷の魔法",mpCost:10,effect:"ice_bolt",damage:18,range:8,needsDir:true,desc:"氷の弾で敵を凍らせスロー。MP:10"},
  {id:"lightning_magic",name:"雷の魔法",mpCost:12,effect:"lightning_magic",damage:28,range:10,needsDir:true,desc:"強力な雷撃を放つ。MP:12"},
  {id:"sleep_bolt",name:"眠りの魔法",mpCost:6,effect:"sleep_bolt",range:8,needsDir:true,desc:"眠りの霧を飛ばす。MP:6"},
  {id:"teleport_magic",name:"テレポート",mpCost:5,effect:"teleport_magic",needsDir:false,desc:"ランダムな場所に飛ぶ。MP:5"},
  {id:"heal_magic",name:"回復の魔法",mpCost:15,effect:"heal_magic",needsDir:false,desc:"HPを25〜35回復する。MP:15"},
  {id:"transform_magic",name:"変化の魔法",mpCost:12,effect:"transform_magic",range:8,needsDir:true,desc:"対象を変化させる。MP:12"},
  {id:"identify_magic",name:"識別の魔法",mpCost:1,fixedMpCost:true,effect:"identify_magic",needsDir:false,desc:"持ち物から1つ選んで識別する。MP:1"},
  {id:"bless_magic",name:"祝福の魔法",mpCost:1,fixedMpCost:true,effect:"bless_magic",needsDir:false,desc:"アイテムを1つ選んで祝福する。MP:1"},
  {id:"curse_magic",name:"呪いの魔法",mpCost:1,fixedMpCost:true,effect:"curse_magic",needsDir:false,desc:"アイテムを1つ選んで呪う。MP:1"},];
export const SPELLBOOKS=[
  {name:"炎の魔法書",type:"spellbook",spell:"fire_bolt",desc:"炎の魔法を習得できる。火に弱い。",tile:43},
  {name:"氷の魔法書",type:"spellbook",spell:"ice_bolt",desc:"氷の魔法を習得できる。火に弱い。",tile:43},
  {name:"雷の魔法書",type:"spellbook",spell:"lightning_magic",desc:"雷の魔法を習得できる。火に弱い。",tile:43},
  {name:"眠りの魔法書",type:"spellbook",spell:"sleep_bolt",desc:"眠りの魔法を習得できる。火に弱い。",tile:43},
  {name:"テレポートの魔法書",type:"spellbook",spell:"teleport_magic",desc:"テレポートの魔法を習得できる。火に弱い。",tile:43},
  {name:"回復の魔法書",type:"spellbook",spell:"heal_magic",desc:"回復の魔法を習得できる。火に弱い。",tile:43},
  {name:"変化の魔法書",type:"spellbook",spell:"transform_magic",desc:"変化の魔法を習得できる。火に弱い。",tile:43},
  {name:"識別の魔法書",type:"spellbook",spell:"identify_magic",desc:"識別の魔法を習得できる。火に弱い。",tile:43},
  {name:"祝福の魔法書",type:"spellbook",spell:"bless_magic",desc:"祝福の魔法を習得できる。火に弱い。",tile:43},
  {name:"呪いの魔法書",type:"spellbook",spell:"curse_magic",desc:"呪いの魔法を習得できる。火に弱い。",tile:43},];
export function burnInventorySpellbooks(p,ml){const burned=p.inventory.filter(i=>i.type==="spellbook"&&Math.random()<0.5);if(burned.length>0){p.inventory=p.inventory.filter(i=>!burned.includes(i));burned.forEach(b=>ml.push(`所持していた「${b.name}」が燃えてなくなった！`));}}

/* 雷・炎ダメージを受けたとき所持品1つにランダムで影響を与える */
export function applyLightningToInventory(p, dg, ml, luFn, nameFn = null) {
  if (p.inventory.length === 0) return;
  const dn = (it) => nameFn ? nameFn(it) : it.name;
  const idx = Math.floor(Math.random() * p.inventory.length);
  const victim = p.inventory[idx];
  if (victim.type === "pot") {
    p.inventory = p.inventory.filter((_, i) => i !== idx);
    ml.push(`所持していた「${dn(victim)}」が雷で割れた！`);
    scatterPotContents(victim, dg, p.x, p.y, p, ml, luFn);
  } else if (victim.type === "scroll" || victim.type === "potion" || victim.type === "spellbook") {
    p.inventory = p.inventory.filter((_, i) => i !== idx);
    const verb = victim.type === "potion" ? "割れてなくなった" : "燃えてなくなった";
    ml.push(`所持していた「${dn(victim)}」が${verb}！`);
  } else {
    ml.push(`所持していた「${dn(victim)}」に雷が走ったが無事だった。`);
  }
}
export function applySpellEffect(eff, kind, target, dx, dy, dg, p, ml, luFn) {
  const _cmsBoost = kind === "monster" && inCursedMagicSealRoom(target.x, target.y, dg) ? 2 : 1;
  switch (eff) {
    case "fire_bolt": {
      const dmg = rng(20, 30) * _cmsBoost;
      if (kind === "monster") {
        target.hp -= dmg; ml.push(`炎の魔法が${target.name}に命中！${dmg}ダメージ！`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
      } break;
    }
    case "ice_bolt": {
      const dmg = rng(15, 22) * _cmsBoost;
      if (kind === "monster") {
        target.hp -= dmg; target.speed = Math.max(0.25, target.speed * 0.5);
        ml.push(`氷の魔法が${target.name}に命中！${dmg}ダメージ！動きが鈍くなった！`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
      } break;
    }
    case "lightning_magic": {
      const dmg = rng(22, 32) * _cmsBoost;
      if (kind === "monster") {
        target.hp -= dmg; ml.push(`雷の魔法が${target.name}に命中！${dmg}ダメージ！`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
      }
      if (kind === "item") {
        if (target.type === "potion" || target.type === "scroll" || target.type === "spellbook") { removeFloorItem(dg, target); ml.push(`${target.name}は雷の魔法で焼けた！`); }
      } break;
    }
    case "sleep_bolt": {
      if (kind === "monster") { const t = rng(3, 6); target.sleepTurns = (target.sleepTurns || 0) + t; ml.push(`眠りの魔法が${target.name}に命中！${t}ターン眠りについた！`); }
      break;
    }
    case "transform_magic": {
      if (kind === "monster") {
        const nt = pick(MONS); const prevName = target.name; const ox = target.x, oy = target.y;
        Object.assign(target, { ...nt, id: target.id, x: ox, y: oy, maxHp: nt.hp, turnAccum: 0, aware: target.aware, dir: target.dir, lastPx: target.lastPx, lastPy: target.lastPy, subtype: nt.subtype, wandEffect: nt.wandEffect, wallWalker: nt.wallWalker });
        ml.push(`${prevName}は${target.name}に変化した！`);
      } break;
    }
    default: ml.push("魔法弾は効果なく消えた。");
  }
}
export function castSpellBolt(p, dg, spell, dx, dy, ml, luFn) {
  for (let d = 1; d <= spell.range; d++) {
    const tx = p.x + dx * d, ty = p.y + dy * d;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) {
      ml.push("魔法弾は壁に消えた。");
      return;
    }
    if (inMagicSealRoom(tx, ty, dg)) {
      ml.push("魔法弾が魔封じの魔方陣で消えた！");
      return;
    }
    const mon = monsterAt(dg, tx, ty);
    if (mon) { applySpellEffect(spell.effect, "monster", mon, dx, dy, dg, p, ml, luFn); return; }
    if (tx === p.x && ty === p.y) continue;
    const it = itemAt(dg, tx, ty);
    if (it) { applySpellEffect(spell.effect, "item", it, dx, dy, dg, p, ml, luFn); return; }
  }
  ml.push("魔法弾は虚空に消えた。");
}
