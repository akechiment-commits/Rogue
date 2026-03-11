import { rng, uid, clamp, MW, MH, T, TI, DRO } from './utils.js';
import { MONS } from './monsters.js';

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
  { name:"革の鎧",           type:"armor",  def:2,                       desc:"軽い鎧。",                         tile:21 },
  { name:"鎖帷子",           type:"armor",  def:5,                       desc:"斬撃に強い鎧。",                   tile:21 },
  { name:"プレートメイル",   type:"armor",  def:8,                       desc:"最強の重装鎧。",                   tile:21 },
  { name:"マナ回復薬",       type:"potion", effect:"mana",     value:20, desc:"MPを20回復する。",                 tile:16 },
  { name:"混乱の薬",         type:"potion", effect:"confuse",  value:5,  desc:"飲むと5ターン混乱する。投げると命中した敵を20ターン混乱させる。", tile:16 },
  { name:"暗闇の薬",         type:"potion", effect:"darkness",           desc:"飲むと視界が1マスになる(20ターン)。投げると命中した敵を50ターン暗闇状態にする。", tile:16 },
  { name:"惑わしの薬",       type:"potion", effect:"bewitch",            desc:"飲むと50ターン周囲の見た目が狂う。投げると命中した敵を50ターン逃走させる。", tile:16 },
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
  if (it.type === "weapon")   return 50 + (it.atk || 0) * 20;
  if (it.type === "armor")    return 60 + (it.def || 0) * 25;
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
  const fn = names[rng(0, names.length - 1)];
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
  { name:"金縛りの杖",   type:"wand", effect:"paralyze",  charges:5, desc:"振ると対象を金縛りにする。何かアクションを受けるまで動けなくなる。",               tile:24 },
  { name:"眠りの杖",     type:"wand", effect:"sleep",      charges:5, desc:"振ると対象を眠りに落とす。眠りの罠と同様の効果。",                                   tile:24 },
  { name:"祝福の杖",     type:"wand", effect:"bless_wand", charges:3, desc:"振ると対象のアイテムを祝福する。壊すと周囲のアイテム全てを祝福する。",                 tile:24 },
  { name:"呪いの杖",     type:"wand", effect:"curse_wand", charges:3, desc:"振ると対象のアイテムを呪う。壊すと周囲のアイテム全てを呪う。",                         tile:24 },
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
  const t = POTS[rng(0, POTS.length - 1)];
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
  { id:"knockback",     name:"吹き飛ばし",desc:"攻撃した敵を1マス吹き飛ばす" },
  { id:"critical",      name:"会心",      desc:"25%の確率でダメージ2倍のクリティカルヒット" },
];

export const ARMOR_ABILITIES = [
  { id:"fire_resist", name:"耐火",   desc:"炎のダメージを半減する" },
  { id:"slow_hunger", name:"節食",   desc:"空腹の進行が半分になる" },
  { id:"regen",       name:"回復",   desc:"毎ターン追加でHP+1回復する" },
  { id:"sleep_proof", name:"眠れず", desc:"睡眠効果を無効化する" },
  { id:"thorn",       name:"反射",   desc:"攻撃を受けた時にダメージの1/3を反射する" },
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

export function fireTrapItem(trap, item, dg, tx, ty, ml, ft, p = null, nameFn = null) {
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
            } else if (it.type === "food" && !it.cooked) {
              it.value *= 2;
              it.cooked = true;
              it.name = "焼いた" + it.name;
              ml.push(`${it.name}になった！`);
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
      const _pfm = dg.monsters.find(m => m.x === tx && m.y === ty);
      if (_pfm) {
        dg.monsters = dg.monsters.filter(m => m !== _pfm);
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
      const _rm = dg.monsters.find(m => m.x === tx && m.y === ty);
      if (_rm) {
        _rm.atk = Math.max(1, (_rm.atk || 1) - 1);
        if (_rm.def !== undefined) _rm.def = Math.max(0, _rm.def - 1);
        ml.push(`${_rm.name}が錆びて弱くなった！`);
      }
      if (p && p.x === tx && p.y === ty) {
        const _peq = p.weapon || p.armor;
        if (_peq) {
          const _pop = _peq.plus || 0;
          _peq.plus = _pop - 1;
          const _pfp = v => v > 0 ? "+" + v : v === 0 ? "無印" : "" + v;
          ml.push(`${_peq.name}も錆びた！(${_pfp(_pop)}→${_pfp(_peq.plus)})`);
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
        const m = dg.monsters.find(m2 => m2.x === fx && m2.y === ty);
        if (m) {
          const d = ar.atk + rng(0, 3);
          m.hp -= d;
          ml.push(`矢が${m.name}に命中！${d}ダメージ！`);
          if (m.hp <= 0) {
            ml.push(`${m.name}は倒れた！`);
            monsterDrop(m, dg, ml, p);
            dg.monsters = dg.monsters.filter(m2 => m2 !== m);
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
      const _spm = dg.monsters.find(m => m.x === tx && m.y === ty);
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
      const _slm = dg.monsters.find(m => m.x === tx && m.y === ty);
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
        const m = dg.monsters.find(m2 => m2.x === fx && m2.y === ty);
        if (m) {
          const d = _par.atk + rng(0, 3);
          m.hp -= d;
          m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
          ml.push(`毒矢が${m.name}に命中！${d}ダメージ！攻撃力が半減した！`);
          if (m.hp <= 0) { ml.push(`${m.name}は倒れた！`); monsterDrop(m, dg, ml, p); dg.monsters = dg.monsters.filter(m2 => m2 !== m); }
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
      let _sumSpawned = 0;
      const _dirs8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      for (const [_dy, _dx] of _dirs8) {
        if (_sumSpawned >= _sumCount) break;
        const _nx = tx + _dx, _ny = ty + _dy;
        if (dg.map[_ny]?.[_nx] === T.FLOOR && !dg.monsters.some(m => m.x === _nx && m.y === _ny) && (!p || _nx !== p.x || _ny !== p.y)) {
          const _mt = MONS[clamp(rng(0, _sumDepth + 1), 0, MONS.length - 1)];
          dg.monsters.push({ ..._mt, id: uid(), x: _nx, y: _ny, maxHp: _mt.hp, turnAccum: -(_mt.speed || 1), aware: true, dir: { x: 0, y: 0 }, lastPx: tx, lastPy: ty, patrolTarget: null });
          _sumSpawned++;
        }
      }
      if (_sumSpawned < _sumCount) {
        for (let _si = _sumSpawned; _si < _sumCount; _si++) {
          for (let _att = 0; _att < 30; _att++) {
            const _sr = dg.rooms[rng(0, dg.rooms.length - 1)];
            const _sx = rng(_sr.x + 1, _sr.x + _sr.w - 2);
            const _sy = rng(_sr.y + 1, _sr.y + _sr.h - 2);
            if (dg.map[_sy]?.[_sx] === T.FLOOR && !dg.monsters.some(m => m.x === _sx && m.y === _sy) && (!p || _sx !== p.x || _sy !== p.y)) {
              const _mt = MONS[clamp(rng(0, _sumDepth + 1), 0, MONS.length - 1)];
              dg.monsters.push({ ..._mt, id: uid(), x: _sx, y: _sy, maxHp: _mt.hp, turnAccum: -(_mt.speed || 1), aware: false, dir: { x: 0, y: 0 }, lastPx: 0, lastPy: 0, patrolTarget: null });
              _sumSpawned++; break;
            }
          }
        }
      }
      ml.push(`${_sumSpawned}体の敵が現れた！`);
      return "restart";
    }
    case "slow_trap": {
      ml.push(`${trap.name}が発動！`);
      const _slwm = dg.monsters.find(m => m.x === tx && m.y === ty);
      if (_slwm) { _slwm.speed = Math.max(0.25, _slwm.speed * 0.5); ml.push(`${_slwm.name}が鈍足になった！`); }
      if (p && p.x === tx && p.y === ty) { p.slowTurns = (p.slowTurns || 0) + 10; ml.push(`体が重くなった...(鈍足10ターン)`); }
      return "restart";
    }
    case "seal_trap": {
      ml.push(`${trap.name}が発動！`);
      const _seam = dg.monsters.find(m => m.x === tx && m.y === ty);
      if (_seam) { _seam.sealed = true; ml.push(`${_seam.name}の特技が封印された！`); }
      if (p && p.x === tx && p.y === ty) { p.sealedTurns = (p.sealedTurns || 0) + 50; ml.push(`魔法が封印された！(50ターン)`); }
      return "restart";
    }
    case "steal_trap": {
      ml.push(`${trap.name}が発動！`);
      const _stm = dg.monsters.find(m => m.x === tx && m.y === ty);
      if (_stm) {
        const _stNewItem = { ...ITEMS[rng(0, ITEMS.length - 1)], id: uid() };
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
      const _hngm = dg.monsters.find(m => m.x === tx && m.y === ty);
      if (_hngm) { _hngm.atk = Math.max(1, Math.floor((_hngm.atk || 1) / 2)); ml.push(`${_hngm.name}の攻撃力が半減した！`); }
      if (p && p.x === tx && p.y === ty) { p.hunger = Math.max(0, p.hunger - Math.floor((p.maxHunger || 100) * 0.1)); ml.push(`急に空腹を感じた！満腹度が10%下がった。`); }
      return "restart";
    }
    case "blowback_trap": {
      ml.push(`${trap.name}が発動！`);
      const _bbm = dg.monsters.find(m => m.x === tx && m.y === ty);
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
          const _pm = dg.monsters.find(m => m.x === _pnx && m.y === _pny);
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
    if (mon.hp <= 0) {
      ml.push(`${mon.name}を倒した！(+${mon.exp}exp)`);
      p.exp += mon.exp;
      monsterDrop(mon, dg, ml, p);
      dg.monsters = dg.monsters.filter(m => m !== mon);
      if (luFn) luFn(p, ml);
    }
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
          const burnedBooks = p.inventory.filter(i => i.type === "spellbook" && Math.random() < 0.5);
          if (burnedBooks.length > 0) {
            p.inventory = p.inventory.filter(i => !burnedBooks.includes(i));
            burnedBooks.forEach(b => ml.push(`所持していた「${b.name}」が燃えてなくなった！`));
          }
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
        if (kind === "monster") { target.sleepTurns = (target.sleepTurns || 0) + t; ml.push(`${target.name}は眠りに落ちた！${blessed ? "(強眠)" : ""}`); }
        if (kind === "player") { p.sleepTurns = (p.sleepTurns || 0) + t; ml.push(`眠りに落ちた...(${t}ターン)${blessed ? "(強眠)" : ""}`); }
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
        // 反転→金縛り解消
        if (kind === "monster") { target.paralyzed = false; ml.push(`${target.name}の金縛りが解けた！`); }
        if (kind === "player") { p.paralyzeTurns = 0; ml.push("体がすっきりした。金縛りが解けた！【呪→解金縛り】"); }
      } else {
        if (kind === "monster") { target.paralyzed = true; ml.push(`${target.name}は金縛りになった！${blessed ? "(強力)" : ""}`); }
        if (kind === "player") { const _pt = blessed ? 20 : 10; p.paralyzeTurns = _pt; ml.push(`金縛りになった！(${_pt}ターン)${blessed ? "(強力)" : ""}`); }
      }
      break;
    case "confuse":
      if (cursed) {
        // 反転→混乱解消
        if (kind === "monster") { target.confusedTurns = 0; ml.push(`${target.name}の混乱が解けた！`); }
        if (kind === "player") { p.confusedTurns = 0; ml.push("頭が冷えた！混乱が解けた！【呪→解混乱】"); }
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
          for (let _ry = 0; _ry < MH; _ry++) for (let _rx = 0; _rx < MW; _rx++) dg.explored[_ry][_rx] = true;
          ml.push("呪われた薬！フロア全体が見えた！【呪→透視】");
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
  }
}

export const POTION_FOOD_PREFIX = {
  heal:   "回復の",
  poison: "猛毒の",
  fire:   "焼いた",
  sleep:  "睡眠の",
  power:  "強化の",
  confuse:"混乱の",
  mana:   "魔力の",
};

export function applyPotionToItem(eff, val, item, dg, ml) {
  if (item.type === "spellbook") {
    if (eff === "fire") {
      ml.push(`魔法書「${item.name}」が燃えてなくなった！`);
      return "burn";
    }
    if (item.spell) {
      const oldName = item.name;
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
      ml.push(`巻物「${item.name}」が炎で燃えてなくなった！`);
      return "burn";
    }
    if (item.effect !== "blank") {
      const oldName = item.name;
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
    if (!item.cooked) {
      item.value = item.value * 2;
      item.cooked = true;
      item.name = "焼いた" + item.name;
      ml.push(`${item.name}になった！`);
    } else {
      ml.push(`${item.name}は既に調理済みだ。`);
    }
    return;
  }
  const pf = POTION_FOOD_PREFIX[eff];
  if (!pf) return;
  if (item.potionEffects.includes(eff)) {
    ml.push(`${item.name}は既に${pf}効果を持っている。`);
    return;
  }
  item.potionEffects.push(eff);
  item.name = pf + item.name;
  ml.push(`${item.name}になった！`);
}

export function splashPotion(dg, cx, cy, eff, val, p, ml, luFn, blessed = false, cursed = false) {
  ml.push("瓶が割れて中身が飛び散った！");
  const tiles = [];
  for (let dy2 = -1; dy2 <= 1; dy2++)
    for (let dx2 = -1; dx2 <= 1; dx2++) {
      const tx = cx + dx2, ty = cy + dy2;
      if (tx >= 0 && tx < MW && ty >= 0 && ty < MH && dg.map[ty][tx] !== T.WALL && dg.map[ty][tx] !== T.BWALL)
        tiles.push({ x:tx, y:ty });
    }
  for (const { x, y } of tiles) {
    const mon = dg.monsters.find(m => m.x === x && m.y === y);
    if (mon) {
      if (mon.paralyzed) { mon.paralyzed = false; ml.push(`${mon.name}の金縛りが解けた！`); }
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
    const it = dg.items.find(i => i.x === x && i.y === y);
    if (it) {
      const br = applyPotionToItem(eff, val, it, dg, ml);
      if (br === "burn") {
        dg.items = dg.items.filter(i => i !== it);
        chargeShopItem(it, dg, ml);
      }
    }
  }
}

/* 祝福・呪いの水を投擲：着弾点のアイテム1つのみに祝呪効果（周囲8マス無効） */
export function applyWaterSplash(dg, cx, cy, blessed, cursed, ml) {
  ml.push("瓶が割れた！");
  const it = dg.items.find(i => i.x === cx && i.y === cy);
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
        dg.items = dg.items.filter(i => i !== it);
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

export function soakItemIntoSpring(spr, item, ml, dg = null) {
  spr.contents = spr.contents || [];
  if (item.type === "bottle") {
    const wb = { ...WATER_BOTTLE, id:uid() };
    if (item.blessed) { wb.blessed = true; wb.bcKnown = true; }
    else if (item.cursed) { wb.cursed = true; wb.bcKnown = true; }
    const _wbSuffix = item.blessed ? "【祝】" : item.cursed ? "【呪】" : "";
    ml.push(item.name + "が泉に落ちて水になった！" + _wbSuffix);
    spr.contents.push(wb);
  } else if (item.type === "weapon") {
    let _wNote = "";
    if (item.cursed) { item.cursed = false; _wNote += " 呪いが解けた！"; }
    if (item.atk > 1) {
      item.atk = Math.max(1, item.atk - rng(1, 2));
      ml.push(item.name + "が泉に落ちた...錆びた！(攻撃力" + item.atk + ")" + _wNote);
    } else {
      ml.push(item.name + "が泉に落ちたがこれ以上錆びない。" + _wNote);
    }
    spr.contents.push(item);
  } else if (item.type === "armor") {
    let _aNote = "";
    if (item.cursed) { item.cursed = false; _aNote += " 呪いが解けた！"; }
    if (item.def > 1) {
      item.def = Math.max(1, item.def - rng(1, 2));
      ml.push(item.name + "が泉に落ちた...錆びた！(防御力" + item.def + ")" + _aNote);
    } else {
      ml.push(item.name + "が泉に落ちたがこれ以上錆びない。" + _aNote);
    }
    spr.contents.push(item);
  } else if (item.type === "scroll") {
    if (item.effect !== "blank") {
      const oldName = item.name;
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
      const oldName = item.name;
      item.name = "白紙の魔法書";
      item.spell = null;
      item.desc = "魔法が消えてしまった。魔法のマーカー(5回分)で好きな魔法書に変えられる。";
      ml.push(`魔法書「${oldName}」が泉に落ちた...文字が消えた！`);
    } else {
      ml.push("白紙の魔法書が泉に落ちた。");
    }
    spr.contents.push(item);
  } else {
    ml.push(item.name + "が泉に落ちた。");
    spr.contents.push(item);
  }
  /* 11個目が入ったら泉が干上がる */
  if (dg && spr.contents.length >= 11) {
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
    if (item.shopPrice && dg.shop && dg.shop.unpaidTotal > 0) {
      const r = dg.shop.room;
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) {
        dg.shop.unpaidTotal = Math.max(0, dg.shop.unpaidTotal - item.shopPrice);
        if (dg.shop.unpaidTotal === 0) {
          const sk = dg.monsters.find(m => m.type === "shopkeeper" && m.state === "blocking");
          if (sk) { sk.state = "friendly"; sk.x = sk.homePos.x; sk.y = sk.homePos.y; }
          if (ml) ml.push("残高がゼロになった。店主が入り口を開けた。");
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
    const _wt = WANDS[rng(0, WANDS.length - 1)];
    drops.push({ ..._wt, id: uid(), charges: Math.max(1, rng(1, _wt.charges)) });
  }
  /* 50% random drop from general item pool */
  if (Math.random() < 0.5) {
    const _pool = [...ITEMS.filter(i => i.type !== "gold"), ...WANDS];
    const _t = _pool[rng(0, _pool.length - 1)];
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
        const mon = dg.monsters.find(m => m.x === nx && m.y === ny);
        if (mon) return { x:nx, y:ny, consumed:true, splash:true };
        const trap = dg.traps.find(t => t.x === nx && t.y === ny);
        if (trap) return { x:nx, y:ny, consumed:true, splash:true };
        const spr = dg.springs?.find(s => s.x === nx && s.y === ny);
        if (spr) return { x:nx, y:ny, consumed:true, spring:spr };
        const bbP = dg.bigboxes?.find(b => b.x === nx && b.y === ny);
        if (bbP) return { x:nx, y:ny, consumed:true, bigbox:bbP };
      } else {
        const mon = dg.monsters.find(m => m.x === nx && m.y === ny);
        if (mon) {
          if (mon.paralyzed) { mon.paralyzed = false; ml.push(`${mon.name}の金縛りが解けた！`); }
          const dmg = rng(3, 8);
          mon.hp -= dmg;
          ml.push(`飛んできた${entity.name}が${mon.name}に命中！${dmg}ダメージ！`);
          if (mon.hp <= 0) {
            ml.push(`${mon.name}を倒した！(+${mon.exp}exp)`);
            if (p) p.exp += mon.exp;
            monsterDrop(mon, dg, ml, p);
            dg.monsters = dg.monsters.filter(m2 => m2 !== mon);
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

function chargeShopItem(item, dg, ml) {
  if (!item.shopPrice || !dg.shop) return;
  dg.shop.unpaidTotal += item.shopPrice;
  const sk = dg.monsters.find(m => m.type === "shopkeeper" && m.state === "friendly");
  if (sk) sk.state = "blocking";
  ml.push(`${item.name}(${item.shopPrice}G)の代金が請求された！`);
}

export function applyWandEffect(eff, kind, target, dx, dy, dg, p, ml, luFn, bbFn, blMult = 1, nameFn = null) {
  /* 地面のアイテムは未識別名で表示するため、呼び出し元から nameFn を受け取る */
  const _dname_item = (t) => (nameFn && kind === "item") ? nameFn(t) : t.name;
  /* ── big box pre-handler ── */
  if (kind === "bigbox") {
    if (eff === "swap") {
      if (blMult < 1) {
        // 呪い：プレイヤーが大箱の1マス手前に引き寄せられる
        const _lpx = target.x - dx, _lpy = target.y - dy;
        if (_lpx >= 0 && _lpx < MW && _lpy >= 0 && _lpy < MH &&
            dg.map[_lpy][_lpx] !== T.WALL && dg.map[_lpy][_lpx] !== T.BWALL &&
            !dg.monsters.some(m => m.x === _lpx && m.y === _lpy)) {
          p.x = _lpx; p.y = _lpy;
          ml.push(`${target.name}に引き寄せられた！`);
        } else {
          ml.push("引き寄せられなかった。");
        }
        return;
      }
      const [ox, oy] = [p.x, p.y];
      p.x = target.x; p.y = target.y;
      target.x = ox;  target.y = oy;
      ml.push(`${target.name}と位置が入れ替わった！`);
      return;
    }
    if (eff === "warp") {
      if (blMult < 1) {
        // 呪い：振った方向に1マス移動（障害物があれば失敗）
        const _w1x = target.x + dx, _w1y = target.y + dy;
        if (_w1x >= 0 && _w1x < MW && _w1y >= 0 && _w1y < MH &&
            dg.map[_w1y][_w1x] !== T.WALL && dg.map[_w1y][_w1x] !== T.BWALL &&
            dg.map[_w1y][_w1x] !== T.SD && dg.map[_w1y][_w1x] !== T.SU &&
            !dg.bigboxes?.some(b => b !== target && b.x === _w1x && b.y === _w1y) &&
            !dg.monsters.some(m => m.x === _w1x && m.y === _w1y) &&
            !dg.items.some(i => i.x === _w1x && i.y === _w1y) &&
            !dg.traps.some(t => t.x === _w1x && t.y === _w1y) &&
            !dg.springs?.some(s => s.x === _w1x && s.y === _w1y) &&
            !dg.pentacles?.some(pc => pc.x === _w1x && pc.y === _w1y)) {
          target.x = _w1x; target.y = _w1y;
          ml.push(`${target.name}が少し動いた。`);
        } else {
          ml.push(`${target.name}は動けなかった。`);
        }
        return;
      }
      if (blMult > 1) {
        // 祝福：下り階段の隣の空きマスへ
        let _stx = -1, _sty = -1;
        for (let fy = 0; fy < MH; fy++)
          for (let fx = 0; fx < MW; fx++)
            if (dg.map[fy][fx] === T.SD) { _stx = fx; _sty = fy; }
        if (_stx >= 0) {
          const _bbAdj = [];
          for (const [_ax, _ay] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
            const _nx = _stx + _ax, _ny = _sty + _ay;
            if (_nx >= 0 && _nx < MW && _ny >= 0 && _ny < MH && dg.map[_ny][_nx] === T.FLOOR &&
                !dg.bigboxes?.some(b => b.x === _nx && b.y === _ny) &&
                !dg.monsters.some(m => m.x === _nx && m.y === _ny) &&
                !dg.items.some(i => i.x === _nx && i.y === _ny) &&
                !dg.traps.some(t => t.x === _nx && t.y === _ny) &&
                !dg.springs?.some(s => s.x === _nx && s.y === _ny) &&
                !dg.pentacles?.some(pc => pc.x === _nx && pc.y === _ny))
              _bbAdj.push({ x: _nx, y: _ny });
          }
          if (_bbAdj.length > 0) {
            const _bd = _bbAdj[rng(0, _bbAdj.length - 1)];
            target.x = _bd.x; target.y = _bd.y;
            ml.push(`${target.name}は階段の隣にテレポートした！【祝】`);
          } else {
            // 隣に空きがない場合はランダムテレポート（以下の通常処理へ fall-through しない）
            const _wbf2 = [];
            for (let fy = 0; fy < MH; fy++)
              for (let fx = 0; fx < MW; fx++)
                if (dg.map[fy][fx] === T.FLOOR &&
                    !dg.bigboxes?.find(b => b.x === fx && b.y === fy) &&
                    !dg.monsters.find(m => m.x === fx && m.y === fy) &&
                    !dg.items.some(i => i.x === fx && i.y === fy) &&
                    !dg.traps.some(t => t.x === fx && t.y === fy) &&
                    !dg.springs?.some(s => s.x === fx && s.y === fy) &&
                    !dg.pentacles?.some(pc => pc.x === fx && pc.y === fy))
                  _wbf2.push({ x:fx, y:fy });
            if (_wbf2.length > 0) {
              const _wbd2 = _wbf2[rng(0, _wbf2.length - 1)];
              target.x = _wbd2.x; target.y = _wbd2.y;
              ml.push(`${target.name}はどこかへテレポートした！`);
            } else {
              ml.push("テレポートに失敗した。");
            }
          }
        } else {
          ml.push("テレポートに失敗した。");
        }
        return;
      }
      const wbf = [];
      for (let fy = 0; fy < MH; fy++)
        for (let fx = 0; fx < MW; fx++)
          if (dg.map[fy][fx] === T.FLOOR &&
              !dg.bigboxes?.find(b => b.x === fx && b.y === fy) &&
              !dg.monsters.find(m => m.x === fx && m.y === fy) &&
              !dg.items.some(i => i.x === fx && i.y === fy) &&
              !dg.traps.some(t => t.x === fx && t.y === fy) &&
              !dg.springs?.some(s => s.x === fx && s.y === fy) &&
              !dg.pentacles?.some(pc => pc.x === fx && pc.y === fy))
            wbf.push({ x:fx, y:fy });
      if (wbf.length > 0) {
        const wbd = wbf[rng(0, wbf.length - 1)];
        target.x = wbd.x; target.y = wbd.y;
        ml.push(`${target.name}はどこかへテレポートした！`);
      } else {
        ml.push("テレポートに失敗した。");
      }
      return;
    }
    if (eff === "knockback") {
      let bbx = target.x, bby = target.y, bbroke = false;
      for (let i = 0; i < 5; i++) {
        const nx = bbx + dx, ny = bby + dy;
        if (nx < 0 || nx >= MW || ny < 0 || ny >= MH || dg.map[ny][nx] === T.WALL || dg.map[ny][nx] === T.BWALL) {
          bbroke = true; break;
        }
        // アイテム・罠・泉・魔方陣・階段と重ならないよう手前で止まる
        if (dg.map[ny][nx] === T.SD || dg.map[ny][nx] === T.SU ||
            dg.items.some(i => i.x === nx && i.y === ny) ||
            dg.traps.some(t => t.x === nx && t.y === ny) ||
            dg.springs?.some(s => s.x === nx && s.y === ny) ||
            dg.pentacles?.some(pc => pc.x === nx && pc.y === ny)) break;
        bbx = nx; bby = ny;
      }
      if (bbroke) {
        dg.bigboxes = dg.bigboxes?.filter(b => b !== target);
        if (target.contents?.length > 0) {
          const fts = new Set();
          for (const ci of target.contents) placeItemAt(dg, bbx, bby, ci, ml, fts);
          ml.push(`${target.name}は壁に叩きつけられて壊れた！中身が飛び出した！`);
        } else {
          ml.push(`${target.name}は壁に叩きつけられて壊れた！`);
        }
      } else {
        target.x = bbx; target.y = bby;
        ml.push(`${target.name}が吹き飛んだ！`);
      }
      return;
    }
    if (eff === "leap") {
      if (blMult < 1) {
        // 呪い：大箱をランダムワープ
        const _lbf = [];
        for (let fy = 0; fy < MH; fy++)
          for (let fx = 0; fx < MW; fx++)
            if (dg.map[fy][fx] === T.FLOOR &&
                !dg.bigboxes?.some(b => b.x === fx && b.y === fy) &&
                !dg.monsters.some(m => m.x === fx && m.y === fy) &&
                !dg.items.some(i => i.x === fx && i.y === fy) &&
                !dg.traps.some(t => t.x === fx && t.y === fy) &&
                !dg.springs?.some(s => s.x === fx && s.y === fy) &&
                !dg.pentacles?.some(pc => pc.x === fx && pc.y === fy))
              _lbf.push({ x:fx, y:fy });
        if (_lbf.length > 0) {
          const _lbd = _lbf[rng(0, _lbf.length - 1)];
          target.x = _lbd.x; target.y = _lbd.y;
          ml.push(`${target.name}はどこかへランダムにテレポートした！【呪】`);
        } else {
          ml.push("テレポートに失敗した。");
        }
      } else {
        ml.push("効果がなかった。");
      }
      return;
    }
    if (eff === "slow" || eff === "paralyze" || eff === "sleep") {
      ml.push("効果がなかった。");
      return;
    }
    if (eff === "transform") {
      const others = BB_TYPES.filter(t => t.kind !== target.kind);
      const nt = others[rng(0, others.length - 1)];
      const oldName = target.name;
      target.kind = nt.kind;
      target.name = nt.name;
      target.capacity = nt.cap();
      ml.push(`${oldName}は${target.name}に変化した！`);
      return;
    }
    /* default: break and scatter (dig, lightning, etc.) */
    dg.bigboxes = dg.bigboxes?.filter(b => b !== target);
    if (target.contents?.length > 0) {
      const fts = new Set();
      for (const ci of target.contents) placeItemAt(dg, target.x, target.y, ci, ml, fts);
      ml.push(`${target.name}が壊れて中身が飛び出した！`);
    } else {
      ml.push(`${target.name}が壊れた！`);
    }
    return;
  }

  /* any wand bolt hitting a monster clears its paralysis */
  if (kind === "monster" && target.paralyzed) {
    target.paralyzed = false;
    ml.push(`${target.name}の金縛りが解けた！`);
  }

  switch (eff) {
    case "knockback": {
      const _blessed = blMult > 1, _cursed = blMult < 1;
      if (_cursed) {
        /* 呪い：引き寄せ（方向を逆にして目の前まで引っ張る） */
        if (kind === "monster") {
          const _pullX = p.x + dx, _pullY = p.y + dy;
          if (_pullX >= 0 && _pullX < MW && _pullY >= 0 && _pullY < MH &&
              dg.map[_pullY][_pullX] !== T.WALL && dg.map[_pullY][_pullX] !== T.BWALL &&
              !dg.monsters.some(m2 => m2 !== target && m2.x === _pullX && m2.y === _pullY)) {
            target.x = _pullX; target.y = _pullY;
            ml.push(`${target.name}を引き寄せた！`);
          } else {
            ml.push(`${target.name}を引き寄せようとしたが失敗した。`);
          }
          break;
        }
        if (kind === "player") {
          ml.push("引き寄せの力が自分に！");
          break;
        }
        if (kind === "item") {
          /* アイテムを目の前に引き寄せる */
          const _pullIx = p.x + dx, _pullIy = p.y + dy;
          if (_pullIx >= 0 && _pullIx < MW && _pullIy >= 0 && _pullIy < MH && dg.map[_pullIy][_pullIx] !== T.WALL && dg.map[_pullIy][_pullIx] !== T.BWALL) {
            dg.items = dg.items.filter(i => i !== target);
            const ft = new Set();
            placeItemAt(dg, _pullIx, _pullIy, target, ml, ft);
            ml.push(`${target.name}を引き寄せた！`);
          }
          break;
        }
        break;
      }
      const d = _blessed ? 50 : 5; /* 祝福：壁まで飛ばす */
      const _kbDmgBase = _blessed ? 10 : 5; /* 祝福：ダメ2倍 */
      if (kind === "monster") {
        const _kbDmg = _kbDmgBase;
        ml.push(`${target.name}は吹き飛ばされた！`);
        target.hp -= _kbDmg;
        pushEntity(dg, target.x, target.y, dx, dy, d, ml, "monster", target, p, luFn);
        /* 聖域の上に強制移動した敵は即死（壁激突によるHP0チェックより先に判定） */
        if (dg.monsters.includes(target) &&
            dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === target.x && pc.y === target.y)) {
          ml.push(`${target.name}は聖域に吹き飛ばされ消滅した！(+${target.exp}exp)`);
          p.exp += target.exp;
          monsterDrop(target, dg, ml, p);
          dg.monsters = dg.monsters.filter(m => m !== target);
          luFn(p, ml);
        } else if (target.hp <= 0) {
          ml.push(`${target.name}を倒した！(+${target.exp}exp)`);
          p.exp += target.exp;
          monsterDrop(target, dg, ml, p);
          dg.monsters = dg.monsters.filter(m => m !== target);
          luFn(p, ml);
        }
        break;
      }
      if (kind === "player") {
        ml.push("自分が吹き飛ばされた！");
        p.hp -= _kbDmgBase;
        pushEntity(dg, p.x, p.y, dx, dy, d, ml, "player", p, p, luFn);
        break;
      }
      if (kind === "item") {
        ml.push(`${target.name}が吹き飛んだ！`);
        dg.items = dg.items.filter(i => i !== target);
        const res = pushEntity(dg, target.x, target.y, dx, dy, d, ml, "item", target, p, luFn);
        if (target.shopPrice && dg.shop) {
          const r = dg.shop.room;
          const inShop = res.x >= r.x && res.x < r.x + r.w && res.y >= r.y && res.y < r.y + r.h;
          if (!inShop) chargeShopItem(target, dg, ml);
        }
        if (res.spring) {
          soakItemIntoSpring(res.spring, target, ml, dg);
        } else if (res.bigbox) {
          if (bbFn) bbFn(res.bigbox, target, dg, ml);
          else { const ft = new Set(); placeItemAt(dg, res.x, res.y, target, ml, ft); }
        } else if (target.type === "potion") {
          splashPotion(dg, res.x, res.y, target.effect, target.value || 0, p, ml, luFn, target.blessed || false, target.cursed || false);
        } else if (target.type === "pot") {
          scatterPotContents(target, dg, res.x, res.y, p, ml, luFn);
        } else if (!res.consumed) {
          const ft = new Set();
          placeItemAt(dg, res.x, res.y, target, ml, ft);
        }
        break;
      }
      if (kind === "trap") {
        ml.push(`${target.name}が吹き飛んだ！`);
        pushEntity(dg, target.x, target.y, dx, dy, d, ml, "trap", target, p, luFn);
        break;
      }
      break;
    }
    case "lightning": {
      const _lCursed = blMult < 1;
      if (_lCursed) {
        /* 呪い：25回復 */
        if (kind === "monster") {
          const _lheal = Math.min(25, target.maxHp - target.hp);
          if (_lheal > 0) { target.hp += _lheal; ml.push(`${target.name}のHPが${_lheal}回復した！`); }
          else ml.push(`${target.name}には効果がなかった。`);
          break;
        }
        if (kind === "player") {
          const _lheal = Math.min(25, p.maxHp - p.hp);
          if (_lheal > 0) { p.hp += _lheal; ml.push(`癒しの光に包まれた！HP+${_lheal}`); }
          else ml.push("HPは既に満タンだ。");
          break;
        }
      }
      /* 祝福：ダメ2倍 (blMult=1.5→×2にオーバーライド) */
      const _lBlessMult = blMult > 1 ? 2 : 1;
      let dmg = Math.max(1, Math.round(rng(15, 25) * _lBlessMult));
      if (kind === "monster" && inCursedMagicSealRoom(target.x, target.y, dg)) dmg *= 2;
      if (kind === "monster") {
        target.hp -= dmg;
        ml.push(`雷撃が${target.name}に命中！${dmg}ダメージ！`);
        if (target.hp <= 0) {
          ml.push(`${target.name}を倒した！(+${target.exp}exp)`);
          p.exp += target.exp;
          monsterDrop(target, dg, ml, p);
          dg.monsters = dg.monsters.filter(m => m !== target);
          luFn(p, ml);
        }
        break;
      }
      if (kind === "player") {
        if (inCursedMagicSealRoom(p.x, p.y, dg)) dmg *= 2;
        p.deathCause = "雷の杖の魔法により";
        p.hp -= dmg;
        ml.push(`雷撃が自分に命中！${dmg}ダメージ！`);
        const burnedBooks2 = p.inventory.filter(i => i.type === "spellbook" && Math.random() < 0.5);
        if (burnedBooks2.length > 0) {
          p.inventory = p.inventory.filter(i => !burnedBooks2.includes(i));
          burnedBooks2.forEach(b => ml.push(`所持していた「${b.name}」が雷で燃えてなくなった！`));
        }
        break;
      }
      if (kind === "item") {
        if (target.type === "potion" || target.type === "scroll") {
          dg.items = dg.items.filter(i => i !== target);
          chargeShopItem(target, dg, ml);
          ml.push(`${target.name}は雷で焼けた！`);
        } else if (target.type === "pot") {
          dg.items = dg.items.filter(i => i !== target);
          chargeShopItem(target, dg, ml);
          ml.push(`雷撃で${_dname_item(target)}が割れた！`);
          scatterPotContents(target, dg, target.x, target.y, p, ml, luFn, nameFn);
        } else if (target.type === "bottle") {
          dg.items = dg.items.filter(i => i !== target);
          chargeShopItem(target, dg, ml);
          ml.push(`${target.name}が雷撃で砕けた！`);
        } else if (target.type === "food") {
          if (!target.cooked) {
            target.value *= 2;
            target.cooked = true;
            target.name = "焼いた" + target.name;
            ml.push(`${target.name}になった！`);
          } else {
            ml.push(`${target.name}は既に調理済みだ。`);
          }
        } else {
          ml.push(`雷撃が${target.name}に落ちた！`);
        }
        break;
      }
      if (kind === "trap") {
        dg.traps = dg.traps.filter(t => t !== target);
        ml.push(`雷撃で${target.name}が破壊された！`);
        break;
      }
      break;
    }
    case "slow": {
      const _sBless = blMult > 1, _sCurse = blMult < 1;
      if (_sCurse) {
        /* 呪い：2倍速にする */
        if (kind === "monster") {
          target.speed = Math.min(4, target.speed * 2);
          ml.push(`${target.name}は2倍速になった！`);
          break;
        }
        if (kind === "player") {
          p.hasteTurns = (p.hasteTurns || 0) + 10;
          ml.push("体が軽くなった！(2倍速10ターン)");
          break;
        }
      } else {
        if (kind === "monster") {
          target.speed = Math.max(0.25, target.speed * 0.5);
          ml.push(`${target.name}は鈍足になった！`);
          if (_sBless) {
            /* 祝福：金縛りも追加 */
            target.paralyzed = true;
            ml.push(`さらに${target.name}は金縛りになった！`);
          }
          break;
        }
        if (kind === "player") {
          p.slowTurns = (p.slowTurns || 0) + 10;
          ml.push("体が重くなった...(鈍足10ターン)");
          if (_sBless) {
            p.paralyzeTurns = Math.max(p.paralyzeTurns || 0, 10);
            ml.push("さらに金縛りになった！(10ターン)");
          }
          break;
        }
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "transform": {
      if (kind === "monster") {
        const nt = MONS[rng(0, MONS.length - 1)];
        ml.push(`${target.name}は${nt.name}に変化した！`);
        const ox = target.x, oy = target.y;
        Object.assign(target, { ...nt, id:target.id, x:ox, y:oy, maxHp:nt.hp,
          turnAccum:0, aware:target.aware, dir:target.dir,
          lastPx:target.lastPx, lastPy:target.lastPy,
          subtype:nt.subtype, wandEffect:nt.wandEffect, wallWalker:nt.wallWalker });
        break;
      }
      if (kind === "player") {
        const h = rng(-10, 10);
        p.hp += h;
        ml.push(`h>=0?体に変化が...HP+${h}:体に異変が...HP${h}`);
        break;
      }
      if (kind === "item") {
        const nt = ITEMS[rng(0, ITEMS.length - 2)];
        const ox = target.x, oy = target.y;
        dg.items = dg.items.filter(i => i !== target);
        chargeShopItem(target, dg, ml);
        const ni = { ...nt, id:uid(), x:ox, y:oy };
        if (ni.type === "gold") ni.value = rng(5, 50);
        dg.items.push(ni);
        ml.push(`${_dname_item(target)}は${nameFn ? nameFn(ni) : ni.name}に変化した！`);
        break;
      }
      if (kind === "trap") {
        const nt = TRAPS[rng(0, TRAPS.length - 1)];
        ml.push(`${target.name}は${nt.name}に変化した！`);
        Object.assign(target, { ...nt, id:target.id, x:target.x, y:target.y, revealed:true });
        break;
      }
      break;
    }
    case "swap": {
      const _swBless = blMult > 1, _swCurse = blMult < 1;
      if (_swCurse) {
        /* 呪い：飛びつきの杖と同じ効果（fireWandBolt内のleap処理で対応不可なのでここで実装） */
        /* 対象の1マス手前に移動 */
        if (kind === "monster") {
          const _leapX = target.x - dx, _leapY = target.y - dy;
          if (_leapX >= 0 && _leapX < MW && _leapY >= 0 && _leapY < MH &&
              dg.map[_leapY][_leapX] !== T.WALL && dg.map[_leapY][_leapX] !== T.BWALL &&
              !dg.monsters.some(m2 => m2 !== target && m2.x === _leapX && m2.y === _leapY) &&
              !(_leapX === p.x && _leapY === p.y)) {
            p.x = _leapX; p.y = _leapY;
            ml.push(`${target.name}の前に飛びついた！`);
          } else {
            ml.push("飛びつけなかった。");
          }
        } else if (kind === "item" || kind === "trap") {
          const _leapX = target.x - dx, _leapY = target.y - dy;
          if (_leapX >= 0 && _leapX < MW && _leapY >= 0 && _leapY < MH && dg.map[_leapY][_leapX] !== T.WALL && dg.map[_leapY][_leapX] !== T.BWALL) {
            p.x = _leapX; p.y = _leapY;
            ml.push(`${target.name}の前に飛びついた！`);
          }
        }
        break;
      }
      if (kind === "monster") {
        const [ox, oy] = [p.x, p.y];
        p.x = target.x; p.y = target.y;
        target.x = ox;  target.y = oy;
        ml.push(`${target.name}と位置が入れ替わった！`);
        /* 聖域の上に強制移動した敵は即死 */
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === target.x && pc.y === target.y)) {
          ml.push(`${target.name}は聖域に踏み込み消滅した！(+${target.exp}exp)`);
          p.exp += target.exp;
          monsterDrop(target, dg, ml, p);
          dg.monsters = dg.monsters.filter(m => m !== target);
          luFn(p, ml);
        } else if (_swBless) {
          /* 祝福：入れ替わった先で金縛り */
          target.paralyzed = true;
          ml.push(`${target.name}は金縛りになった！`);
        }
        break;
      }
      if (kind === "player") { ml.push("何も起こらなかった。"); break; }
      if (kind === "item" || kind === "trap") {
        const [ox, oy] = [p.x, p.y];
        ml.push(`${target.name}と位置が入れ替わった！`);
        p.x = target.x; p.y = target.y;
        target.x = ox;  target.y = oy;
        break;
      }
      break;
    }
    case "dig": {
      const _digBlessMult = blMult > 1 ? 2 : 1; /* 祝福：ダメージ2倍 */
      let dmg = Math.max(1, Math.round(rng(10, 18) * _digBlessMult));
      if (kind === "monster") {
        if (inCursedMagicSealRoom(target.x, target.y, dg)) dmg *= 2;
        target.hp -= dmg;
        ml.push(`穴掘りの魔法弾が${target.name}に命中！${dmg}ダメージ！`);
        if (target.hp <= 0) {
          ml.push(`${target.name}を倒した！(+${target.exp}exp)`);
          p.exp += target.exp;
          monsterDrop(target, dg, ml, p);
          dg.monsters = dg.monsters.filter(m => m !== target);
          luFn(p, ml);
        }
      }
      if (kind === "player") {
        if (inCursedMagicSealRoom(p.x, p.y, dg)) dmg *= 2;
        p.deathCause = "穴掘りの魔法弾により";
        p.hp -= dmg;
        ml.push(`穴掘りの魔法弾が自分に命中！${dmg}ダメージ！`);
      }
      if (kind === "item") {
        dg.items = dg.items.filter(i => i !== target);
        chargeShopItem(target, dg, ml);
        if (target.type === "pot") {
          if (target.contents && target.contents.length > 0) {
            const ft = new Set();
            for (const ci of target.contents) placeItemAt(dg, target.x, target.y, ci, ml, ft);
            ml.push(`${target.name}が壊れて中身が飛び出した！`);
          } else {
            ml.push(`${target.name}は壊れた！`);
          }
        } else {
          ml.push(`${target.name}は破壊された！`);
        }
      }
      if (kind === "trap") {
        dg.traps = dg.traps.filter(t => t !== target);
        ml.push(`穴掘りの魔法弾で${target.name}が壊れた！`);
      }
      break;
    }
    case "leap": {
      if (blMult < 1) {
        // 呪い：対象をランダムワープ
        const _lpf = [];
        for (let ly = 0; ly < MH; ly++)
          for (let lx = 0; lx < MW; lx++)
            if (dg.map[ly][lx] === T.FLOOR && !dg.monsters.some(m => m.x === lx && m.y === ly))
              _lpf.push({ x:lx, y:ly });
        if (_lpf.length === 0) { ml.push("テレポートに失敗した。"); break; }
        const _lpd = _lpf[rng(0, _lpf.length - 1)];
        if (kind === "monster") { target.x = _lpd.x; target.y = _lpd.y; ml.push(`${target.name}はどこかへテレポートした！【呪】`); }
        else if (kind === "item") { target.x = _lpd.x; target.y = _lpd.y; ml.push(`${_dname_item(target)}はどこかへ飛んだ！【呪】`); }
        else if (kind === "trap") { target.x = _lpd.x; target.y = _lpd.y; ml.push(`${target.name}はどこかへ飛んだ！【呪】`); }
        else if (kind === "player") { p.x = _lpd.x; p.y = _lpd.y; ml.push("ランダムにテレポートした！【呪】"); }
      }
      break;
    }
    case "warp": {
      const _wCursed = blMult < 1, _wBlessed = blMult > 1;
      if (_wCursed) {
        /* 呪い：1マスだけテレポート（振った方向に1歩移動） */
        const _w1x = (kind === "monster" ? target.x : p.x) + dx;
        const _w1y = (kind === "monster" ? target.y : p.y) + dy;
        if (_w1x >= 0 && _w1x < MW && _w1y >= 0 && _w1y < MH &&
            dg.map[_w1y][_w1x] !== T.WALL && dg.map[_w1y][_w1x] !== T.BWALL &&
            !dg.monsters.some(m => m.x === _w1x && m.y === _w1y) &&
            !(kind === "monster" && p.x === _w1x && p.y === _w1y)) {
          if (kind === "monster") { target.x = _w1x; target.y = _w1y; ml.push(`${target.name}が少しだけテレポートした。`); }
          else if (kind === "player") { p.x = _w1x; p.y = _w1y; ml.push("少しだけテレポートした。"); }
          else if (kind === "item") { target.x = _w1x; target.y = _w1y; ml.push(`${target.name}が少し移動した。`); }
          else if (kind === "trap") { target.x = _w1x; target.y = _w1y; ml.push(`${target.name}が少し移動した。`); }
        } else {
          ml.push("テレポートに失敗した。");
        }
        break;
      }
      if (_wBlessed) {
        /* 祝福：下り階段の位置にテレポート＋金縛り */
        let stairsX = -1, stairsY = -1;
        for (let fy = 0; fy < MH; fy++)
          for (let fx = 0; fx < MW; fx++)
            if (dg.map[fy][fx] === T.SD) { stairsX = fx; stairsY = fy; }
        if (stairsX >= 0) {
          if (kind === "monster") {
            target.x = stairsX; target.y = stairsY;
            target.paralyzed = true;
            ml.push(`${target.name}は階段の上にテレポートし、金縛りになった！`);
          } else if (kind === "player") {
            p.x = stairsX; p.y = stairsY;
            p.paralyzeTurns = 10;
            ml.push("階段の上にテレポートした！しかし金縛りになった！(10ターン)");
          } else if (kind === "item" || kind === "trap") {
            // 下り階段の隣の空きマスへ
            const _wbAdj = [];
            for (const [_ax, _ay] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
              const _nx = stairsX + _ax, _ny = stairsY + _ay;
              if (_nx >= 0 && _nx < MW && _ny >= 0 && _ny < MH && dg.map[_ny][_nx] === T.FLOOR &&
                  !dg.bigboxes?.some(b => b.x === _nx && b.y === _ny) &&
                  !dg.monsters.some(m => m.x === _nx && m.y === _ny) &&
                  !dg.items.some(i => i !== target && i.x === _nx && i.y === _ny) &&
                  !dg.traps.some(t => t !== target && t.x === _nx && t.y === _ny) &&
                  !dg.springs?.some(s => s.x === _nx && s.y === _ny) &&
                  !dg.pentacles?.some(pc => pc.x === _nx && pc.y === _ny))
                _wbAdj.push({ x: _nx, y: _ny });
            }
            if (_wbAdj.length > 0) {
              const _wd = _wbAdj[rng(0, _wbAdj.length - 1)];
              target.x = _wd.x; target.y = _wd.y;
              ml.push(`${target.name}は階段の隣に飛んだ！`);
            } else {
              // 隣に空きがない場合はランダムテレポート
              const _wf = [];
              for (let fy = 0; fy < MH; fy++)
                for (let fx = 0; fx < MW; fx++)
                  if (dg.map[fy][fx] === T.FLOOR && !dg.monsters.find(m => m.x === fx && m.y === fy))
                    _wf.push({ x:fx, y:fy });
              if (_wf.length > 0) {
                const _wd2 = _wf[rng(0, _wf.length - 1)];
                target.x = _wd2.x; target.y = _wd2.y;
                ml.push(`${target.name}はどこかへ飛んだ！`);
              }
            }
          }
        } else {
          ml.push("テレポートに失敗した。");
        }
        break;
      }
      /* 通常テレポート */
      const floors = [];
      for (let fy = 0; fy < MH; fy++)
        for (let fx = 0; fx < MW; fx++)
          if (dg.map[fy][fx] === T.FLOOR && !dg.monsters.find(m => m.x === fx && m.y === fy))
            floors.push({ x:fx, y:fy });
      if (floors.length === 0) { ml.push("テレポートに失敗した。"); break; }
      const dest = floors[rng(0, floors.length - 1)];
      if (kind === "monster") { target.x = dest.x; target.y = dest.y; ml.push(`${target.name}はどこかへテレポートした！`); }
      if (kind === "player")  { p.x = dest.x; p.y = dest.y; ml.push("テレポートした！"); }
      if (kind === "item")    { target.x = dest.x; target.y = dest.y; ml.push(`${target.name}はどこかへ飛んだ！`); }
      if (kind === "trap")    { target.x = dest.x; target.y = dest.y; ml.push(`${target.name}はどこかへ飛んだ！`); }
      break;
    }
    case "paralyze": {
      if (kind === "monster") {
        target.paralyzed = true;
        ml.push(`${target.name}は金縛りになった！動けない！`);
        break;
      }
      if (kind === "player") {
        p.paralyzeTurns = 10;
        ml.push("金縛りになった！(10ターン)");
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "sleep": {
      const st = rng(3, 6);
      if (kind === "monster") {
        target.sleepTurns = (target.sleepTurns || 0) + st;
        ml.push(`${target.name}は眠りに落ちた！(${st}ターン)`);
        break;
      }
      if (kind === "player") {
        if (p.armor?.ability === "sleep_proof") {
          ml.push("しかし眠れなかった！(耐眠)");
        } else {
          p.sleepTurns = (p.sleepTurns || 0) + st;
          ml.push(`眠りに落ちた...(${st}ターン)`);
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "bless_wand": {
      const _bwBlessed = blMult > 1;
      const _bwCursed  = blMult < 1;
      if (kind === "item") {
        if (_bwCursed) {
          // 呪われた祝福の杖→落ちてるアイテムを呪う
          if (target.type === "pot") {
            const _newCap = Math.max(0, (target.capacity || 1) - 1);
            if ((target.contents?.length || 0) > _newCap) {
              dg.items = dg.items.filter(i => i !== target);
              const _fts = new Set();
              for (const _ci of (target.contents || [])) placeItemAt(dg, target.x, target.y, _ci, ml, _fts);
              ml.push(`${_dname_item(target)}が呪いで割れた！中身が飛び出した！`);
            } else {
              target.capacity = _newCap;
              ml.push(`${_dname_item(target)}が呪いで容量が減った！(容量-1 → ${target.capacity})【呪】`);
            }
          } else {
            target.cursed = true; target.blessed = false; target.bcKnown = true;
            ml.push(`${_dname_item(target)}が呪われた！【呪】`);
          }
          break;
        }
        if (target.type === "pot") {
          const _potGain = _bwBlessed ? 2 : 1;
          target.capacity = (target.capacity || 1) + _potGain;
          ml.push(`${_dname_item(target)}が祝福の光を受け容量が増えた！(容量+${_potGain} → ${target.capacity})${_bwBlessed ? "【祝】" : ""}`);
        } else {
          target.blessed = true; target.cursed = false; target.bcKnown = true;
          ml.push(`${_dname_item(target)}が祝福された！【祝】`);
        }
        break;
      }
      if (kind === "bigbox") {
        if (_bwCursed) {
          // 呪われた祝福の杖→大箱の容量を1減らす
          const _newCap = Math.max(0, (target.capacity || 1) - 1);
          if ((target.contents?.length || 0) > _newCap) {
            const _fts = new Set();
            for (const _ci of (target.contents || [])) placeItemAt(dg, target.x, target.y, _ci, ml, _fts);
            dg.bigboxes = dg.bigboxes.filter(b => b !== target);
            ml.push(`${target.name}が呪いで壊れた！中身が飛び出した！【呪】`);
          } else {
            target.capacity = _newCap;
            ml.push(`${target.name}が呪われた！(容量-1 → ${target.capacity})【呪】`);
          }
        } else {
          const _gain = _bwBlessed ? 2 : 1;
          target.capacity = (target.capacity || 0) + _gain;
          ml.push(`${target.name}が祝福された！(容量+${_gain} → ${target.capacity})${_bwBlessed ? "【祝】" : ""}`);
        }
        break;
      }
      if (kind === "monster") {
        if (_bwCursed) {
          // 呪われた祝福の杖→敵を鈍足にする
          target.speed = Math.max(0.25, (target.speed || 1) * 0.5);
          ml.push(`${target.name}が呪いで鈍足になった！【呪】`);
        } else {
          const _bh = Math.round(rng(10, 20) * blMult);
          target.hp = Math.min(target.maxHp, target.hp + _bh);
          ml.push(`${target.name}は祝福の光を浴び、HPが${_bh}回復した！${_bwBlessed ? "（祝福）" : ""}`);
        }
        break;
      }
      if (kind === "player") {
        const _inv = (p.inventory || []).filter(i => i.type !== "gold" && i.type !== "arrow");
        if (_bwCursed) {
          // 呪われた祝福の杖→所持品を1つ呪う
          if (_inv.length === 0) { ml.push("所持品がないので効果がなかった。"); break; }
          const _t = _inv[rng(0, _inv.length - 1)];
          _t.cursed = true; _t.blessed = false; _t.bcKnown = true;
          ml.push(`${_t.name}が呪われた！【呪】`);
        } else {
          // 通常→1つ祝福、祝福→2つ祝福
          if (_inv.length === 0) { ml.push("所持品がないので効果がなかった。"); break; }
          const _count = _bwBlessed ? 2 : 1;
          const _pool = [..._inv].sort(() => Math.random() - 0.5).slice(0, _count);
          for (const _t of _pool) { _t.blessed = true; _t.cursed = false; _t.bcKnown = true; ml.push(`${_t.name}が祝福された！【祝】`); }
          if (_bwBlessed) ml.push("（祝福の杖の力で2つ祝福された！）");
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "curse_wand": {
      const _cwBlessed = blMult > 1;
      const _cwCursed  = blMult < 1;
      if (kind === "item") {
        if (_cwCursed) {
          // 呪われた呪いの杖→落ちてるアイテムを祝福する（反転）
          if (target.type === "pot") {
            target.capacity = (target.capacity || 1) + 1;
            ml.push(`${_dname_item(target)}が呪いの反動で容量が増えた！(容量+1 → ${target.capacity})【呪→祝】`);
          } else {
            target.blessed = true; target.cursed = false; target.bcKnown = true;
            ml.push(`${_dname_item(target)}が祝福された！【呪→祝】`);
          }
          break;
        }
        if (target.type === "arrow") { ml.push("矢には呪いが効かない。"); break; }
        if (target.type === "pot") {
          const _potLoss = _cwBlessed ? 2 : 1;
          const _newCap = Math.max(0, (target.capacity || 1) - _potLoss);
          if ((target.contents?.length || 0) > _newCap) {
            dg.items = dg.items.filter(i => i !== target);
            const _fts = new Set();
            for (const _ci of (target.contents || [])) placeItemAt(dg, target.x, target.y, _ci, ml, _fts);
            ml.push(`${_dname_item(target)}が呪いで割れた！中身が飛び出した！${_cwBlessed ? "【祝】" : ""}`);
          } else {
            target.capacity = _newCap;
            ml.push(`${_dname_item(target)}が呪いで容量が減った！(容量-${_potLoss} → ${target.capacity})${_cwBlessed ? "【祝】" : ""}`);
          }
        } else {
          target.cursed = true; target.blessed = false; target.bcKnown = true;
          ml.push(`${_dname_item(target)}が呪われた！【呪】`);
        }
        break;
      }
      if (kind === "monster") {
        if (_cwCursed) {
          // 呪われた呪いの杖→敵を回復する（反転）
          const _ch = rng(10, 20);
          target.hp = Math.min(target.maxHp, target.hp + _ch);
          ml.push(`${target.name}は呪いの魔法で回復した！${_ch}HP【呪→回復】`);
        } else {
          target.speed = Math.max(0.25, (target.speed || 1) * 0.5);
          ml.push(`${target.name}が呪いで鈍足になった！`);
        }
        break;
      }
      if (kind === "bigbox") {
        if (_cwCursed) {
          // 呪われた呪いの杖→大箱の容量を+1（反転）
          target.capacity = (target.capacity || 0) + 1;
          ml.push(`${target.name}が祝福された！(容量+1 → ${target.capacity})【呪→祝】`);
        } else {
          // 通常→-1、祝福された呪いの杖→-2
          const _loss = _cwBlessed ? 2 : 1;
          const _newCap = Math.max(0, (target.capacity || 1) - _loss);
          if ((target.contents?.length || 0) > _newCap) {
            const _fts = new Set();
            for (const _ci of (target.contents || [])) placeItemAt(dg, target.x, target.y, _ci, ml, _fts);
            dg.bigboxes = dg.bigboxes.filter(b => b !== target);
            ml.push(`${target.name}が呪いで壊れた！中身が飛び出した！${_cwBlessed ? "【祝】" : ""}`);
          } else {
            target.capacity = _newCap;
            ml.push(`${target.name}が呪われた！(容量-${_loss} → ${target.capacity})${_cwBlessed ? "【祝】" : ""}`);
          }
        }
        break;
      }
      if (kind === "player") {
        const _inv = (p.inventory || []).filter(i => i.type !== "gold" && i.type !== "arrow");
        if (_cwCursed) {
          // 呪われた呪いの杖→所持品を1つ祝福（反転）
          if (_inv.length === 0) { ml.push("所持品がないので効果がなかった。"); break; }
          const _t = _inv[rng(0, _inv.length - 1)];
          _t.blessed = true; _t.cursed = false; _t.bcKnown = true;
          ml.push(`${_t.name}が祝福された！【呪→祝】`);
        } else {
          // 通常→1つ呪う、祝福→2つ呪う
          if (_inv.length === 0) { ml.push("所持品がないので効果がなかった。"); break; }
          const _count = _cwBlessed ? 2 : 1;
          const _pool = [..._inv].sort(() => Math.random() - 0.5).slice(0, _count);
          for (const _t of _pool) { _t.cursed = true; _t.blessed = false; _t.bcKnown = true; ml.push(`${_t.name}が呪われた！【呪】`); }
          if (_cwBlessed) ml.push("（祝福された呪いの杖の力で2つ呪われた！）");
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "confuse": {
      if (kind === "monster") {
        target.confusedTurns = (target.confusedTurns || 0) + 20;
        ml.push(`${target.name}が混乱した！(${target.confusedTurns}ターン)`);
        break;
      }
      if (kind === "player") {
        p.confusedTurns = (p.confusedTurns || 0) + 5;
        ml.push(`混乱した！(${p.confusedTurns}ターン)`);
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "darkness": {
      const _dkBlessed = blMult > 1, _dkCursed = blMult < 1;
      if (_dkCursed) {
        for (let _ry = 0; _ry < MH; _ry++) for (let _rx = 0; _rx < MW; _rx++) dg.explored[_ry][_rx] = true;
        if (kind === "player") ml.push("呪われた暗闇の杖！フロア全体が見えた！【呪→透視】");
        else ml.push("呪われた魔法弾がフロアを照らした！【呪→透視】");
        break;
      }
      if (kind === "monster") {
        target.darknessTurns = _dkBlessed ? 9999 : 50;
        target.darkDir = null;
        target.aware = false;
        ml.push(`${target.name}は暗闇に包まれた！${_dkBlessed ? "(永続)" : "(50ターン)"}`);
        break;
      }
      if (kind === "player") {
        p.darknessTurns = (p.darknessTurns || 0) + (_dkBlessed ? 50 : 20);
        ml.push(`暗闇に包まれた！視界が1マスになる！(${p.darknessTurns}ターン)${_dkBlessed ? "(祝福)" : ""}`);
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "bewitch": {
      const _bwBlessed = blMult > 1, _bwCursed = blMult < 1;
      if (_bwCursed) {
        dg.traps.forEach(t => t.revealed = true);
        ml.push("呪われた惑わしの杖！フロアの罠が全て見えた！【呪→罠看破】");
        break;
      }
      if (kind === "monster") {
        target.fleeingTurns = _bwBlessed ? 9999 : 50;
        ml.push(`${target.name}は幻惑状態になり逃げ出した！${_bwBlessed ? "(永続)" : "(50ターン)"}`);
        break;
      }
      if (kind === "player") {
        p.bewitchedTurns = (p.bewitchedTurns || 0) + (_bwBlessed ? 100 : 50);
        ml.push(`幻惑された！周囲の見た目がおかしくなった！(${p.bewitchedTurns}ターン)${_bwBlessed ? "(祝福)" : ""}`);
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
  }
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

export function fireWandBolt(p, dg, eff, dx, dy, ml, luFn, bbFn, blMult = 1, nameFn = null) {
  /* 呪われた穴掘り：1マス先に壊せる壁を生成（敵がいたらダメージのみ） */
  if (eff === "dig" && blMult < 1) {
    const wx = p.x + dx, wy = p.y + dy;
    if (wx >= 0 && wx < MW && wy >= 0 && wy < MH && !(p.x === wx && p.y === wy)) {
      const _mon = dg.monsters.find(m => m.x === wx && m.y === wy);
      if (_mon) {
        const _dmg = rng(5, 15);
        _mon.hp -= _dmg;
        ml.push(`壁の魔法が${_mon.name}に${_dmg}ダメージ！`);
        if (_mon.hp <= 0) { luFn(_mon, ml); dg.monsters = dg.monsters.filter(m => m !== _mon); }
      } else if (dg.map[wy][wx] === T.FLOOR) {
        dg.map[wy][wx] = T.BWALL;
        ml.push("壊せる壁が出現した！");
      } else {
        ml.push("魔法弾は消えた。");
      }
    } else {
      ml.push("魔法弾は消えた。");
    }
    return;
  }
  /* 呪われた吹きとばし：魔法弾は飛ばず、プレイヤー自身が逆方向に吹き飛ぶ */
  if (eff === "knockback" && blMult < 1) {
    ml.push("自分が逆方向に吹き飛ばされた！【呪】");
    applyWandEffect("knockback", "player", p, -dx, -dy, dg, p, ml, luFn, bbFn, 1);
    return;
  }
  let lastX = p.x, lastY = p.y;
  for (let d = 1; d < 20; d++) {
    const tx = p.x + dx * d, ty = p.y + dy * d;
    if (inMagicSealRoom(tx, ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); return; }
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty]?.[tx] === T.BWALL) {
      if (eff === "dig") {
        const _digMax = blMult > 1 ? 20 : 10; /* 祝福：2倍距離 */
        let dug = 0, cx = tx, cy = ty;
        while (dug < _digMax && cx >= 0 && cx < MW && cy >= 0 && cy < MH && (dg.map[cy][cx] === T.WALL || dg.map[cy][cx] === T.BWALL)) {
          dg.map[cy][cx] = T.FLOOR; dug++; cx += dx; cy += dy;
        }
        ml.push(dug > 0 ? `穴掘りの魔法弾が壁を${dug}マス掘り進んだ！` : "魔法弾は壁に消えた。");
        return;
      }
      if (eff === "leap") {
        if (blMult >= 1) { p.x = lastX; p.y = lastY; ml.push("壁の前に飛びついた！"); return; }
        // 呪い：跳ね返って自分に当たる → プレイヤーがランダムテレポート
        ml.push("魔法弾が跳ね返って自分に当たった！【呪】");
        applyWandEffect(eff, "player", p, -dx, -dy, dg, p, ml, luFn, bbFn, blMult);
        return;
      }
      ml.push("魔法弾は壁に跳ね返った！");
      applyWandEffect(eff, "player", p, -dx, -dy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    const mon = dg.monsters.find(m => m.x === tx && m.y === ty);
    if (mon) {
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push(`${mon.name}の前に飛びついた！`); return; }
      applyWandEffect(eff, "monster", mon, dx, dy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    const it = dg.items.find(i => i.x === tx && i.y === ty);
    if (it) {
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push(`${it.name}の前に飛びついた！`); return; }
      /* water bottle → matching potion */
      const BOTTLE_XFORM = { slow:"鈍足の薬", paralyze:"金縛りの薬", sleep:"眠りの薬", confuse:"混乱の薬", darkness:"暗闇の薬", bewitch:"惑わしの薬" };
      if (it.effect === "water" && BOTTLE_XFORM[eff]) {
        const nm = BOTTLE_XFORM[eff];
        Object.assign(it, { name: nm, effect: eff, value: eff === "sleep" ? 4 : 0 });
        ml.push(`水が${nm}に変化した！`);
        return;
      }
      applyWandEffect(eff, "item", it, dx, dy, dg, p, ml, luFn, bbFn, blMult, nameFn);
      return;
    }
    const trap = dg.traps.find(t => t.x === tx && t.y === ty);
    if (trap) {
      trap.revealed = true;
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push(`${trap.name}の前に飛びついた！`); return; }
      applyWandEffect(eff, "trap", trap, dx, dy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    const bb = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
    if (bb) {
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push(`${bb.name}の前に飛びついた！`); return; }
      applyWandEffect(eff, "bigbox", bb, dx, dy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    lastX = tx; lastY = ty;
  }
  if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push("虚空の先に飛びついた！"); return; }
  ml.push("魔法弾は虚空に消えた。");
}

/* ===== MONSTER LIGHTNING WAND (fires from cx,cy, checks player position) ===== */
export function monsterFireLightning(cx, cy, dg, pl, dx, dy, ml, luFn, bbFn, monName = "モンスター") {
  for (let d = 1; d < 20; d++) {
    const tx = cx + dx * d, ty = cy + dy * d;
    if (inMagicSealRoom(tx, ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); return; }
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) {
      ml.push("魔法弾は壁に消えた。");
      return;
    }
    if (tx === pl.x && ty === pl.y) {
      /* 祝福された聖域の魔方陣は飛び道具（雷撃）を防ぐ */
      const _lBlessedSanc = dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
      if (_lBlessedSanc) { ml.push("祝福された聖域の加護が雷撃を防いだ！"); return; }
      let dmg = rng(15, 25);
      if (inCursedMagicSealRoom(pl.x, pl.y, dg)) dmg *= 2;
      pl.deathCause = `${monName}の雷撃により`;
      pl.hp -= dmg;
      ml.push(`雷撃が命中！${dmg}ダメージ！`);
      if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
      if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
      return;
    }
    const mon = dg.monsters.find(m => m.x === tx && m.y === ty);
    if (mon) {
      applyWandEffect("lightning", "monster", mon, dx, dy, dg, pl, ml, luFn, bbFn);
      return;
    }
    const it = dg.items.find(i => i.x === tx && i.y === ty);
    if (it) {
      applyWandEffect("lightning", "item", it, dx, dy, dg, pl, ml, luFn, bbFn);
      return;
    }
    const trap = dg.traps.find(t => t.x === tx && t.y === ty);
    if (trap) {
      trap.revealed = true;
      applyWandEffect("lightning", "trap", trap, dx, dy, dg, pl, ml, luFn, bbFn);
      return;
    }
    const bb = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
    if (bb) {
      applyWandEffect("lightning", "bigbox", bb, dx, dy, dg, pl, ml, luFn, bbFn);
      return;
    }
  }
  ml.push("魔法弾は虚空に消えた。");
}

export function breakWandAoE(p, dg, eff, ml, luFn, blMult = 1) {
  if (eff === "leap") { ml.push("杖が壊れたが何も起こらなかった。"); return; }
  if (eff === "dig") {
    if (blMult < 1) {
      /* 呪われた穴掘りの杖を壊した：周囲8方向を壊せる壁で囲む（敵がいたらダメージのみ） */
      const digDirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
      let walled = 0;
      for (const [adx, ady] of digDirs) {
        const wx = p.x + adx, wy = p.y + ady;
        if (wx >= 0 && wx < MW && wy >= 0 && wy < MH) {
          const _mon = dg.monsters.find(m => m.x === wx && m.y === wy);
          if (_mon) {
            const _dmg = rng(5, 15);
            _mon.hp -= _dmg;
            ml.push(`壁の魔法が${_mon.name}に${_dmg}ダメージ！`);
            if (_mon.hp <= 0) { luFn(_mon, ml); dg.monsters = dg.monsters.filter(m => m !== _mon); }
          } else if (dg.map[wy][wx] === T.FLOOR) {
            dg.map[wy][wx] = T.BWALL;
            walled++;
          }
        }
      }
      ml.push(walled > 0 ? "壊せる壁に囲まれた！" : "杖が壊れたが何も起こらなかった。");
      return;
    }
    let dmg = rng(8, 15);
    if (inCursedMagicSealRoom(p.x, p.y, dg)) dmg *= 2;
    p.deathCause = "穴掘りの杖の自壊爆発により";
    p.hp -= dmg;
    ml.push(`穴掘りの杖が壊れた！爆発で${dmg}ダメージ！`);
    const digDirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    for (const [adx, ady] of digDirs) {
      const wx = p.x + adx, wy = p.y + ady;
      if (wx >= 0 && wx < MW && wy >= 0 && wy < MH && (dg.map[wy][wx] === T.WALL || dg.map[wy][wx] === T.BWALL))
        dg.map[wy][wx] = T.FLOOR;
    }
    const _pfBlocked =
      dg.traps.find(t => t.x === p.x && t.y === p.y) ||
      dg.items.some(i => i.x === p.x && i.y === p.y) ||
      dg.springs?.some(s => s.x === p.x && s.y === p.y) ||
      dg.bigboxes?.some(b => b.x === p.x && b.y === p.y) ||
      dg.pentacles?.some(pc => pc.x === p.x && pc.y === p.y) ||
      dg.map[p.y][p.x] === T.SD || dg.map[p.y][p.x] === T.SU;
    if (!_pfBlocked) {
      dg.traps.push({ name:"落とし穴", effect:"pitfall", tile:27, id:uid(), x:p.x, y:p.y, revealed:true });
      ml.push("足元に落とし穴ができた！");
    }
    return;
  }
  if (eff === "warp") {
    const wDirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    const ox = p.x, oy = p.y;
    const wTargets = [];
    for (const [adx, ady] of wDirs) {
      const ax = ox + adx, ay = oy + ady;
      if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
      const wm = dg.monsters.find(m => m.x === ax && m.y === ay);
      if (wm) { wTargets.push({ kind:"monster", t:wm }); continue; }
      const wi = dg.items.find(i => i.x === ax && i.y === ay);
      if (wi) { wTargets.push({ kind:"item", t:wi }); continue; }
      const wt = dg.traps.find(t2 => t2.x === ax && t2.y === ay);
      if (wt) { wTargets.push({ kind:"trap", t:wt }); continue; }
      const wb = dg.bigboxes?.find(b => b.x === ax && b.y === ay);
      if (wb) wTargets.push({ kind:"bigbox", t:wb });
    }
    applyWandEffect(eff, "player", p, 0, 0, dg, p, ml, luFn);
    for (const { kind, t } of wTargets) applyWandEffect(eff, kind, t, 0, 0, dg, p, ml, luFn);
    return;
  }
  const dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  const rd = dirs[rng(0, dirs.length - 1)];
  applyWandEffect(eff, "player", p, rd[0], rd[1], dg, p, ml, luFn);
  const targets = [];
  for (const [adx, ady] of dirs) {
    const ax = p.x + adx, ay = p.y + ady;
    if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
    const mon = dg.monsters.find(m => m.x === ax && m.y === ay);
    if (mon) { targets.push({ kind:"monster", t:mon, dx:adx, dy:ady }); continue; }
    const it = dg.items.find(i => i.x === ax && i.y === ay);
    if (it)  { targets.push({ kind:"item", t:it, dx:adx, dy:ady }); continue; }
    const trap = dg.traps.find(t2 => t2.x === ax && t2.y === ay);
    if (trap) { trap.revealed = true; targets.push({ kind:"trap", t:trap, dx:adx, dy:ady }); continue; }
    const bb = dg.bigboxes?.find(b => b.x === ax && b.y === ay);
    if (bb) targets.push({ kind:"bigbox", t:bb, dx:adx, dy:ady });
  }
  for (const { kind, t, dx, dy } of targets) applyWandEffect(eff, kind, t, dx, dy, dg, p, ml, luFn, null, blMult);
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
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
    const m = dg.monsters.find(m2 => m2.x === tx && m2.y === ty);
    if (m) {
      m.hp -= dmg;
      if (_isPoison) m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
      ml.push(`${_arName}が${m.name}に命中！${dmg}ダメージ！${_isPoison ? "攻撃力が半減した！" : ""}`);
      if (m.hp <= 0) {
        ml.push(`${m.name}を倒した！(+${m.exp}exp)`);
        p.exp += m.exp;
        monsterDrop(m, dg, ml, p);
        dg.monsters = dg.monsters.filter(m2 => m2 !== m);
        luFn(p, ml);
      }
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
  if (!dg || !dg.shop || p.isThief || dg.shop.unpaidTotal <= 0) return;
  const inShop = p.x >= dg.shop.room.x && p.x < dg.shop.room.x + dg.shop.room.w &&
                 p.y >= dg.shop.room.y && p.y < dg.shop.room.y + dg.shop.room.h;
  if (!inShop) {
    p.isThief = true;
    const sk = dg.monsters.find(m => m.type === "shopkeeper");
    if (sk) { sk.state = "hostile"; sk.aware = true; sk.lastPx = p.x; sk.lastPy = p.y; }
    ml.push("商品を持ったまま店を出た！泥棒扱いになった！");
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
  {name:"炎の魔法書",type:"spellbook",spell:"fire_bolt",desc:"炎の魔法を習得できる。火に弱い。",tile:18},
  {name:"氷の魔法書",type:"spellbook",spell:"ice_bolt",desc:"氷の魔法を習得できる。火に弱い。",tile:18},
  {name:"雷の魔法書",type:"spellbook",spell:"lightning_magic",desc:"雷の魔法を習得できる。火に弱い。",tile:18},
  {name:"眠りの魔法書",type:"spellbook",spell:"sleep_bolt",desc:"眠りの魔法を習得できる。火に弱い。",tile:18},
  {name:"テレポートの魔法書",type:"spellbook",spell:"teleport_magic",desc:"テレポートの魔法を習得できる。火に弱い。",tile:18},
  {name:"回復の魔法書",type:"spellbook",spell:"heal_magic",desc:"回復の魔法を習得できる。火に弱い。",tile:18},
  {name:"変化の魔法書",type:"spellbook",spell:"transform_magic",desc:"変化の魔法を習得できる。火に弱い。",tile:18},
  {name:"識別の魔法書",type:"spellbook",spell:"identify_magic",desc:"識別の魔法を習得できる。火に弱い。",tile:18},
  {name:"祝福の魔法書",type:"spellbook",spell:"bless_magic",desc:"祝福の魔法を習得できる。火に弱い。",tile:18},
  {name:"呪いの魔法書",type:"spellbook",spell:"curse_magic",desc:"呪いの魔法を習得できる。火に弱い。",tile:18},];
export function burnInventorySpellbooks(p,ml){const burned=p.inventory.filter(i=>i.type==="spellbook"&&Math.random()<0.5);if(burned.length>0){p.inventory=p.inventory.filter(i=>!burned.includes(i));burned.forEach(b=>ml.push(`所持していた「${b.name}」が燃えてなくなった！`));}}
export function applySpellEffect(eff, kind, target, dx, dy, dg, p, ml, luFn) {
  const _cmsBoost = kind === "monster" && inCursedMagicSealRoom(target.x, target.y, dg) ? 2 : 1;
  switch (eff) {
    case "fire_bolt": {
      const dmg = rng(20, 30) * _cmsBoost;
      if (kind === "monster") {
        target.hp -= dmg; ml.push(`炎の魔法が${target.name}に命中！${dmg}ダメージ！`);
        if (target.hp <= 0) { ml.push(`${target.name}を倒した！(+${target.exp}exp)`); p.exp += target.exp; monsterDrop(target, dg, ml, p); dg.monsters = dg.monsters.filter(m => m !== target); luFn(p, ml); }
      } break;
    }
    case "ice_bolt": {
      const dmg = rng(15, 22) * _cmsBoost;
      if (kind === "monster") {
        target.hp -= dmg; target.speed = Math.max(0.25, target.speed * 0.5);
        ml.push(`氷の魔法が${target.name}に命中！${dmg}ダメージ！動きが鈍くなった！`);
        if (target.hp <= 0) { ml.push(`${target.name}を倒した！(+${target.exp}exp)`); p.exp += target.exp; monsterDrop(target, dg, ml, p); dg.monsters = dg.monsters.filter(m => m !== target); luFn(p, ml); }
      } break;
    }
    case "lightning_magic": {
      const dmg = rng(22, 32) * _cmsBoost;
      if (kind === "monster") {
        target.hp -= dmg; ml.push(`雷の魔法が${target.name}に命中！${dmg}ダメージ！`);
        if (target.hp <= 0) { ml.push(`${target.name}を倒した！(+${target.exp}exp)`); p.exp += target.exp; monsterDrop(target, dg, ml, p); dg.monsters = dg.monsters.filter(m => m !== target); luFn(p, ml); }
      }
      if (kind === "item") {
        if (target.type === "potion" || target.type === "scroll" || target.type === "spellbook") { dg.items = dg.items.filter(i => i !== target); ml.push(`${target.name}は雷の魔法で焼けた！`); }
      } break;
    }
    case "sleep_bolt": {
      if (kind === "monster") { const t = rng(3, 6); target.sleepTurns = (target.sleepTurns || 0) + t; ml.push(`眠りの魔法が${target.name}に命中！${t}ターン眠りについた！`); }
      break;
    }
    case "transform_magic": {
      if (kind === "monster") {
        const nt = MONS[rng(0, MONS.length - 1)]; const prevName = target.name; const ox = target.x, oy = target.y;
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
    const mon = dg.monsters.find(m => m.x === tx && m.y === ty);
    if (mon) { applySpellEffect(spell.effect, "monster", mon, dx, dy, dg, p, ml, luFn); return; }
    if (tx === p.x && ty === p.y) continue;
    const it = dg.items.find(i => i.x === tx && i.y === ty);
    if (it) { applySpellEffect(spell.effect, "item", it, dx, dy, dg, p, ml, luFn); return; }
  }
  ml.push("魔法弾は虚空に消えた。");
}
