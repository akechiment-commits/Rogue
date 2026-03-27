import { rng, pick, uid, clamp, MW, MH, T, TI, DRO, removeFloorItem, monsterAt, itemAt, removeMonster, getShops, hasAbility, hasGravityPentacle, hasCursedGravityPentacle, consumeBarrier, clampDmgFixed } from './utils.js';
import { MONS, spawnMonsters, monLevelUp, monLevelDown, wakeIfDormant } from './monsters.js';
import { pushExplosionAnim, pushSplashAnim, pushHealAnim, pushItemArcAnim } from './animEvents.js';

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

export function generateBbFakeNames() {
  const shuffled = [...BB_FAKE_NAMES].sort(() => Math.random() - 0.5);
  const bbFakeNames = {};
  BB_TYPES.forEach((bt, i) => { bbFakeNames[bt.kind] = shuffled[i % shuffled.length]; });
  return bbFakeNames;
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
/*
 * ────────────────────────────────────────────────────────────────
 * 新しいアイテムを追加する手順:
 *   【薬・巻物】
 *     1. ITEMS配列に { name, type, effect, value?, rarity, weight, sellPrice, desc, tile } を追加
 *     2. applyPotionEffect() の switch(eff) に case "effect名": { ... } を追加
 *        ※ 追加し忘れると console.warn が出て効果が発動しない
 *   【ペン】
 *     1. ITEMS配列に { name:"...のペン", type:"pen", effect, charges:2, ... } を追加
 *     2. Game.jsx のペン効果処理ブロックに effect 名を追加
 *   【杖】
 *     1. WANDS配列に { name, type:"wand", effect, charges, ... } を追加
 *     2. wands.js の applyWandEffect() の switch(eff) に case "effect名": { ... } を追加
 *        ※ 追加し忘れると console.warn が出て効果が発動しない
 *   【壺】
 *     1. POTS配列に { name, type:"pot", potEffect, capacity, ... } を追加
 *     2. applyPotEffect() に potEffect の処理を追加（if チェーン）
 * ────────────────────────────────────────────────────────────────
 */
export const ITEMS = [
  { name:"回復薬",           type:"potion", effect:"heal",      value:30,  rarity:"D", weight:12, sellPrice:100,  desc:"HPを30回復する。",                                               tile:16 },
  { name:"大回復薬",         type:"potion", effect:"heal",      value:60,  rarity:"B", weight:4,  sellPrice:350,  desc:"HPを60回復する。",                                               tile:17 },
  { name:"超回復薬",         type:"potion", effect:"superheal", value:100, rarity:"A", weight:2,  sellPrice:1200, desc:"HPを100回復する。満タンならHP最大値が3上昇。祝福で効果2倍。", tile:17 },
  { name:"毒薬",             type:"potion", effect:"poison",   value:15, rarity:"C", weight:8,  sellPrice:150,  desc:"毒の薬。投げると毒液が飛散する。", tile:16 },
  { name:"炎の薬",           type:"potion", effect:"fire",     value:20, rarity:"C", weight:8,  sellPrice:180,  desc:"揮発性の液体。投げると炎上する。", tile:17 },
  { name:"睡眠薬",           type:"potion", effect:"sleep",    value:4,  rarity:"C", weight:8,  sellPrice:150,  desc:"眠りのガスが入った瓶。",           tile:16 },
  { name:"力の薬",           type:"potion", effect:"power",    value:3,  rarity:"A", weight:2,  sellPrice:1500, desc:"飲むと力が湧いてくる。",           tile:17 },
  { name:"テレポートの巻物", type:"scroll", effect:"teleport",           rarity:"C", weight:8,  sellPrice:150,  desc:"ランダムな場所に飛ぶ。",                         tile:18 },
  { name:"マップの巻物",     type:"scroll", effect:"reveal",             rarity:"B", weight:4,  sellPrice:500,  desc:"フロア全体と罠が明らかになる。",                 tile:18 },
  { name:"武器強化の巻物",   type:"scroll", effect:"weapon_up",          rarity:"A", weight:2,  sellPrice:2000, desc:"装備中の武器の＋値を1上げる。",                  tile:18 },
  { name:"防具強化の巻物",   type:"scroll", effect:"armor_up",           rarity:"A", weight:2,  sellPrice:2000, desc:"装備中の防具の＋値を1上げる。",                  tile:18 },
  { name:"雷の巻物",         type:"scroll", effect:"thunder",            rarity:"B", weight:4,  sellPrice:500,  desc:"視界内の敵全てに雷ダメージを与える。",           tile:18 },
  { name:"回復の巻物",       type:"scroll", effect:"recovery",           rarity:"C", weight:8,  sellPrice:100,  desc:"自分と視界内の敵全てを回復する。",               tile:18 },
  { name:"道具寄せの巻物",   type:"scroll", effect:"item_gather",        rarity:"B", weight:4,  sellPrice:400,  desc:"フロアのアイテムを自分の周りに引き寄せる。",     tile:18 },
  { name:"眠りの巻物",       type:"scroll", effect:"sleep_scroll",       rarity:"B", weight:4,  sellPrice:600,  desc:"視界内の敵全てを眠らせる。",                     tile:18 },
  { name:"混乱の巻物",       type:"scroll", effect:"confusion",           rarity:"B", weight:4,  sellPrice:500,  desc:"視界内の敵全てを混乱させる。祝福でフロア全体。呪いで自分が混乱。",      tile:18 },
  { name:"炎の巻物",         type:"scroll", effect:"flame",               rarity:"B", weight:4,  sellPrice:550,  desc:"視界内の敵に炎ダメージ。油まみれの対象は2倍。祝福でフロア全体。呪いで自分も爆発ダメージ。", tile:18 },
  { name:"強化解除の巻物",   type:"scroll", effect:"debuff",              rarity:"B", weight:4,  sellPrice:600,  desc:"視界内の敵のバフを全て解除する。祝福でステータスも永続低下。呪いで自分の装備の強化値が下がる。", tile:18 },
  { name:"壁崩しの巻物",     type:"scroll", effect:"break_wall",          rarity:"C", weight:6,  sellPrice:300,  desc:"半径5の壁を全て壊す。祝福で半径10。呪いで周囲を壁に変える。",             tile:18 },
  { name:"金縛りの巻物",     type:"scroll", effect:"bind",                rarity:"B", weight:4,  sellPrice:600,  desc:"周囲8マスの敵を金縛りにする。祝福で視界内全体。呪いで自分が金縛り。",   tile:18 },
  { name:"聖域のペン",       type:"pen",    effect:"sanctuary",     charges:2, rarity:"A", weight:2,  sellPrice:3000, desc:"足元に聖域の魔方陣を描く。モンスターは通過・攻撃できなくなる。チャージ制。", tile:42 },
  { name:"脆弱のペン",       type:"pen",    effect:"vulnerability", charges:2, rarity:"B", weight:4,  sellPrice:500,  desc:"足元に脆弱の魔方陣を描く。同じ部屋にいる者全員の受けるダメージが2倍になる。チャージ制。", tile:42 },
  { name:"魔封じのペン",     type:"pen",    effect:"magic_seal",    charges:2, rarity:"B", weight:4,  sellPrice:800,  desc:"足元に魔封じの魔方陣を描く。部屋内では一切の魔法が無効になる。外からの魔法弾も消える。チャージ制。", tile:42 },
  { name:"雷のペン",         type:"pen",    effect:"thunder_trap",  charges:2, rarity:"C", weight:8,  sellPrice:250,  desc:"足元に雷の魔方陣を描く。真上にいると毎ターン25ダメージを受ける。チャージ制。", tile:42 },
  { name:"遠投のペン",       type:"pen",    effect:"farcast",       charges:2, rarity:"B", weight:4,  sellPrice:800,  desc:"足元に遠投の魔方陣を描く。部屋内で投げたものが壁まで貫通して飛ぶ。チャージ制。", tile:42 },
  { name:"明かりのペン",     type:"pen",    effect:"light",         charges:2, rarity:"C", weight:8,  sellPrice:300,  desc:"足元に明かりの魔方陣を描く。同じ部屋の地形・敵・アイテムが全て見える。祝福でフロア全体。呪いで視界1マスに。チャージ制。", tile:42 },
  { name:"テレポートのペン", type:"pen",    effect:"teleport_trap", charges:2, rarity:"B", weight:4,  sellPrice:500,  desc:"足元にテレポートの魔方陣を描く。描いた瞬間ランダムテレポート。同じ部屋にいると毎ターン確率でテレポート。祝福でフロア全体。呪いでフロアのテレポートを無効化。チャージ制。", tile:42 },
  { name:"罠のペン",         type:"pen",    effect:"trap_gen",      charges:2, rarity:"D", weight:12, sellPrice:100,  desc:"足元に罠の魔方陣を描く。毎ターン確率で部屋に罠が増える。祝福でフロア全体。呪いで毎ターン確率でフロアの罠が消える。チャージ制。", tile:42 },
  { name:"石飛ばしのペン",   type:"pen",    effect:"stone_throw",   charges:2, rarity:"C", weight:8,  sellPrice:350,  desc:"足元に石飛ばしの魔方陣を描く。部屋内のキャラに毎ターン確率で魔法の石が飛ぶ。祝福で2倍ダメージ。呪いで回復効果。チャージ制。", tile:42 },
  { name:"吹き飛ばしのペン", type:"pen",    effect:"knockback_aura",charges:2, rarity:"C", weight:8,  sellPrice:350,  desc:"足元に吹き飛ばしの魔方陣を描く。同じ部屋での近接攻撃を受けた者が5マス吹き飛ぶ。祝福で何かに当たるまで飛ぶ。呪いで1マスだけ。チャージ制。", tile:42 },
  { name:"爆発のペン",       type:"pen",    effect:"explosion",     charges:2, rarity:"A", weight:2,  sellPrice:2000, desc:"足元に爆発の魔方陣を描く。部屋内で倒された敵が爆発し周囲8マスに現HPの3/4ダメージ。壁・罠・大箱も破壊。祝福でフロア全体。呪いでフロアの炎・雷を不発にする。チャージ制。", tile:42 },
  { name:"ただのペン",       type:"pen",    effect:"plain",         charges:2, rarity:"D", weight:12, sellPrice:50,   desc:"何も起こらない魔方陣を描く。他のペンに合成してインクを補充することができる。チャージ制。", tile:42 },
  { name:"重力のペン",       type:"pen",    effect:"gravity",       charges:2, rarity:"B", weight:4,  sellPrice:800,  desc:"足元に重力の魔方陣を描く。部屋内では浮遊不可・敵が罠にかかる・吹き飛ばし/飛びつき無効。水上の浮遊系敵は弾き出される（逃げ場なし即死）。祝福でフロア全体。呪いで部屋内全員が浮遊状態になる。チャージ制。", tile:42 },
  { name:"みかわしのペン",   type:"pen",    effect:"dodge",         charges:2, rarity:"A", weight:2,  sellPrice:2000, desc:"足元にみかわしの魔方陣を描く。魔方陣のある部屋では投げたもの・矢・石が必ず外れる（魔法・炎は除く）。祝福でフロア全体。呪いで逆に投げたもの・矢・石が必ず命中するようになる。チャージ制。", tile:42 },
  { name:"等速のペン",       type:"pen",    effect:"equal_speed",   charges:2, rarity:"B", weight:4,  sellPrice:1000, desc:"足元に等速の魔方陣を描く。同じ部屋の全員が速度に関わらず1回しか行動できなくなる。祝福なら全員2回行動。呪いなら全員鈍足（2ターンに1回行動）。チャージ制。", tile:42 },
  { name:"回復のペン",       type:"pen",    effect:"heal_aura",     charges:2, rarity:"B", weight:4,  sellPrice:800,  desc:"足元に回復の魔方陣を描く。同じ部屋にいる者全員が毎ターン5HP回復する。祝福なら10HP回復。呪いなら逆に5ダメージ。アンデッドには回復と効果が逆になる。チャージ制。", tile:42 },
  { name:"短剣",             type:"weapon", atk:3,                       rarity:"D", weight:12, sellPrice:50,   desc:"軽いダガー。",                     tile:20 },
  { name:"ロングソード",     type:"weapon", atk:6,                       rarity:"C", weight:8,  sellPrice:300,  desc:"冒険者の定番武器。",               tile:20 },
  { name:"バトルアクス",     type:"weapon", atk:10,                      rarity:"B", weight:4,  sellPrice:1200, desc:"重厚な戦斧。",                     tile:20 },
  { name:"ドラゴンキラー",   type:"weapon", atk:8,  ability:"bane_dragon",   rarity:"A", weight:2,  sellPrice:2500, desc:"ドラゴン系に2倍ダメージを与える特効剣。",         tile:20 },
  { name:"ゾンビキラー",     type:"weapon", atk:6,  ability:"bane_undead",   rarity:"A", weight:2,  sellPrice:2000, desc:"アンデッド系に2倍ダメージを与える聖剣。",         tile:20 },
  { name:"バードキラー",     type:"weapon", atk:5,  ability:"bane_float",    rarity:"A", weight:2,  sellPrice:1500, desc:"浮遊している敵に2倍ダメージを与える槍。",         tile:20 },
  { name:"金の斧",           type:"weapon", atk:9,  ability:"no_degrade",    rarity:"A", weight:2,  sellPrice:2500, desc:"錆びず＋値が下がらない黄金の斧。",               tile:20 },
  { name:"戦神の斧",         type:"weapon", atk:8,  ability:"critical",      rarity:"A", weight:2,  sellPrice:2500, desc:"25%の確率で会心の一撃（2倍ダメージ）が出る斧。",  tile:20 },
  { name:"つるはし",         type:"weapon", atk:4,  ability:"pickaxe", durability:30, rarity:"C", weight:8, sellPrice:250, desc:"壁を掘れる。使い過ぎると壊れる。", tile:20 },
  { name:"影縫いの刃",       type:"weapon", atk:6,  ability:"inflict_immobile", rarity:"B", weight:4, sellPrice:1200, desc:"攻撃時25%の確率で敵の移動を2〜3ターン封じる。", tile:20 },
  { name:"炎の剣",           type:"weapon", atk:7,  ability:"fire_elem",     rarity:"B", weight:4,  sellPrice:1500, desc:"炎属性の剣。油まみれの敵や炎弱点の敵に2倍ダメージ。火ダルマには0.5倍。", tile:20 },
  { name:"氷の剣",           type:"weapon", atk:7,  ability:"ice_elem",      rarity:"B", weight:4,  sellPrice:1500, desc:"氷属性の剣。炎系の敵（火ダルマ・炎弱点の敵）に2倍ダメージ。",         tile:20 },
  { name:"雷の剣",           type:"weapon", atk:7,  ability:"thunder_elem",  rarity:"B", weight:4,  sellPrice:1500, desc:"雷属性の剣。氷・水系の敵（氷竜・わてり等）に2倍ダメージ。",           tile:20 },
  { name:"革の鎧",           type:"armor",  def:2,                       rarity:"D", weight:12, sellPrice:50,   desc:"軽い鎧。",                         tile:21 },
  { name:"鎖帷子",           type:"armor",  def:5,                       rarity:"C", weight:8,  sellPrice:300,  desc:"斬撃に強い鎧。",                   tile:21 },
  { name:"プレートメイル",   type:"armor",  def:8,                       rarity:"B", weight:4,  sellPrice:1200, desc:"最強の重装鎧。",                   tile:21 },
  { name:"腹持ちの胴",       type:"armor",  def:3,  ability:"slow_hunger",   rarity:"B", weight:4,  sellPrice:1500, desc:"装備すると空腹の進行が半分になる特製の胴鎧。",    tile:21 },
  { name:"ゴムゴムの胴",     type:"armor",  def:4,  ability:"lightning_resist", rarity:"B", weight:4, sellPrice:1000, desc:"雷ダメージを半減し、雷によるアイテム破壊を防ぐ。", tile:21 },
  { name:"ドラゴンメイル",   type:"armor",  def:8,  ability:"fire_resist",   rarity:"A", weight:2,  sellPrice:3000, desc:"竜の鱗製。炎ダメージを半減しアイテムを炎から守る。", tile:21 },
  { name:"刃の鎧",           type:"armor",  def:4,  ability:"thorn",         rarity:"B", weight:4,  sellPrice:900,  desc:"近接攻撃で受けたダメージの1/3を反射する。",       tile:21 },
  { name:"みかわしの服",     type:"armor",  def:2,  ability:"dodge",         rarity:"B", weight:4,  sellPrice:1200, desc:"軽くて動きやすく、25%の確率で攻撃を回避する。",   tile:21 },
  { name:"反射の鎧",         type:"armor",  def:5,  ability:"wand_reflect",  rarity:"A", weight:2,  sellPrice:3000, desc:"モンスターの杖魔法を反射する神秘の鎧。",          tile:21 },
  { name:"護盗の鎧",         type:"armor",  def:3,  ability:"anti_steal",    rarity:"C", weight:8,  sellPrice:500,  desc:"装備するとコソドロに所持品を盗まれなくなる。",    tile:21 },
  { name:"ゴールドメイル",   type:"armor",  def:6,  ability:"no_degrade",    rarity:"A", weight:2,  sellPrice:2500, desc:"錆びず＋値が下がらない黄金の鎧。",               tile:21 },
  { name:"氷竜のウロコ",     type:"armor",  def:5,  ability:"ice_resist",    rarity:"B", weight:4,  sellPrice:1500, desc:"氷竜の鱗製。氷ダメージを半減し、氷による移動封じ・鈍足を防ぐ。",  tile:21 },
  { name:"マナ回復薬",       type:"potion", effect:"mana",     value:20, rarity:"C", weight:8,  sellPrice:120,  desc:"MPを20回復する。",                 tile:16 },
  { name:"封印の薬",         type:"potion", effect:"seal",     value:0,  rarity:"C", weight:8,  sellPrice:200,  desc:"飲むとMP封印50ターン。祝福：さらに鈍足10ターン。呪い：MP封印を解除。投げると命中した敵を封印状態にする。", tile:16 },
  { name:"混乱の薬",         type:"potion", effect:"confuse",  value:5,  rarity:"C", weight:8,  sellPrice:180,  desc:"飲むと5ターン混乱する。投げると命中した敵を20ターン混乱させる。", tile:16 },
  { name:"暗闇の薬",         type:"potion", effect:"darkness",           rarity:"B", weight:4,  sellPrice:300,  desc:"飲むと視界が1マスになる(20ターン)。投げると命中した敵を50ターン暗闇状態にする。", tile:16 },
  { name:"惑わしの薬",       type:"potion", effect:"bewitch",            rarity:"B", weight:4,  sellPrice:300,  desc:"飲むと50ターン周囲の見た目が狂う。投げると命中した敵を50ターン逃走させる。", tile:16 },
  { name:"レベルアップの薬", type:"potion", effect:"levelup",            rarity:"S", weight:1,  sellPrice:5000, desc:"飲むとレベルが1上がる。祝福：2レベル上がる。投げると命中した敵が次の形態に変化する。", tile:17 },
  { name:"金貨",             type:"gold",   value:1,                     desc:"金貨。",                           tile:22 },
  { name:"識別の巻物", type:"scroll", effect:"identify",          rarity:"C", weight:8,  sellPrice:250,
    desc:"持ち物から1つ選んで識別する。祝福：全識別。呪い：識別を解除。", tile:18 },
  { name:"複製の巻物", type:"scroll", effect:"duplicate",         rarity:"S", weight:1,  sellPrice:6000,
    desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
  { name:"召喚の巻物", type:"scroll", effect:"summon",            rarity:"C", weight:8,  sellPrice:50,
    desc:"敵を4体召喚する。祝福：8体に囲まれる。呪い：部屋内の敵を別の部屋に飛ばす。", tile:18 },
  { name:"収納上手の巻物", type:"scroll", effect:"expand_inv",   rarity:"A", weight:2,  sellPrice:2000,
    desc:"最大所持数が1～3増える。祝福：2～6増える。呪い：1～3減る。", tile:18 },
  { name:"罠の巻物", type:"scroll", effect:"trap_scatter",        rarity:"D", weight:12, sellPrice:30,
    desc:"読むと同じフロアの部屋内に大量の罠が出現する。祝福：さらに多く出現。呪い：フロア内の全ての罠が消える。", tile:18 },
  { name:"爆弾矢", type:"arrow", atk:6, bombArrow:true, count:3,  rarity:"A", weight:2,  sellPrice:120,
    desc:"着弾点で爆発する矢。周囲8マスに地雷と同じ爆発効果を与える。99本まで束にできる。", tile:23 },
  { name:"毒矢",     type:"arrow", atk:4, poison:true, count:3,   rarity:"C", weight:8,  sellPrice:30,   desc:"毒を持つ矢。命中すると毒効果。99本まで束にできる。",           tile:23 },
  { name:"貫きの矢", type:"arrow", atk:4, pierce:true, count:3,   rarity:"B", weight:4,  sellPrice:60,   desc:"全てを貫通して飛ぶ矢。99本まで束にできる。", tile:23 },
];

export function getBlessMultiplier(it) {
  if (!it) return 1;
  if (it.blessed) return 1.5;
  if (it.cursed)  return 0.5;
  return 1;
}

export const CAT_CLAW_T     = { name:"猫の爪",       type:"weapon", atk:13, ability:"critical", desc:"短剣3つの合成で生まれる鋭い爪。25%の確率で会心の一撃。", tile:20 };
export const EXCALIBUR_T   = { name:"エクスカリバー", type:"weapon", atk:15, ability:"bane_undead", desc:"聖なる伝説の剣。アンデッド系に2倍ダメージ。", tile:20 };
export const TRIELEM_SWORD_T = { name:"三元の刃", type:"weapon", atk:12, ability:"fire_elem", abilities:["fire_elem","ice_elem","thunder_elem"], desc:"炎・氷・雷の三元素を宿した至高の剣。全属性弱点の敵に2倍ダメージ。火ダルマには0.5倍。", tile:20 };
export const TRIELEM_ARMOR_T = { name:"元素王の鎧", type:"armor", def:10, ability:"fire_resist", abilities:["fire_resist","ice_resist","lightning_resist"], desc:"炎・氷・雷すべてに耐性を持つ至高の鎧。全属性ダメージ半減・各種副作用も防ぐ。", tile:21 };
export const ALLBANE_SWORD_T  = { name:"全能キラー", type:"weapon", atk:11, ability:"bane_dragon", abilities:["bane_dragon","bane_undead","bane_float"], desc:"三種の特効剣が融合した究極の剣。竜・不死・浮遊の全種族に2倍ダメージ。", tile:20 };
export const DIVINE_SHIELD_T  = { name:"神盾の鎧",   type:"armor",  def:8,  ability:"thorn",      abilities:["thorn","dodge","wand_reflect"],           desc:"三種の守護防具が融合した究極の鎧。刃反射・みかわし・杖反射の三重防御。",       tile:21 };

export const ARROW_T        = { name:"矢",       type:"arrow", atk:4,                 rarity:"D", weight:12, sellPrice:10,  desc:"99本まで束にできる矢。",                 count:1, tile:23 };
export const POISON_ARROW_T = { name:"毒矢",     type:"arrow", atk:4, poison:true,     rarity:"C", weight:8,  sellPrice:30,  desc:"毒を持つ矢。99本まで束にできる。",        count:1, tile:23 };
export const PIERCING_ARROW_T={ name:"貫きの矢", type:"arrow", atk:4, pierce:true,     rarity:"B", weight:4,  sellPrice:60,  desc:"全てを貫通して飛ぶ矢。99本まで束にできる。", count:1, tile:23 };
export const STONE_T        = { name:"石",       type:"arrow", atk:3, stone:true,      rarity:"D", weight:12, sellPrice:5,   desc:"必ず3マス先に着弾する石。99個まで束にできる。遠投の魔方陣では消滅する。呪われた遠投では1マス先に着弾。",  count:1, tile:23 };
export const MAGIC_STONE_T  = { name:"魔法の石", type:"arrow", atk:5, magicStone:true, rarity:"C", weight:8,  sellPrice:30,  desc:"10マス以内の最も近い敵にホーミングして命中する石。99個まで束にできる。",                                    count:1, tile:23 };
export const BOMB_ARROW_T   = { name:"爆弾矢",   type:"arrow", atk:6, bombArrow:true,  rarity:"A", weight:2,  sellPrice:120, desc:"着弾点で爆発する矢。周囲8マスに地雷と同じ爆発効果を与える。99本まで束にできる。",                            count:1, tile:23 };
export const EMPTY_BOTTLE = { name:"空き瓶",      type:"bottle",                         rarity:"D", weight:12, sellPrice:5,    desc:"空の瓶。今のところ使い道はない。",         tile:16 };
export const WATER_BOTTLE = { name:"水", type:"potion", effect:"water", value:10,        rarity:"D", weight:12, sellPrice:5,    desc:"泉の水。飲むと少しHPが回復する。", tile:16 };
export const BLANK_SCROLL  = { name:"白紙の巻物",    type:"scroll", effect:"blank",      rarity:"B", weight:4,  sellPrice:400,  desc:"何も書かれていない。魔法のマーカーで書き込める。", tile:18 };
export const MAGIC_MARKER  = { name:"魔法のマーカー", type:"marker", charges:1,          rarity:"A", weight:2,  sellPrice:1500, desc:"白紙の巻物に好きな魔法を書き込める。充填の大箱で回数を増やせる。合成の大箱でマーカー同士を合成すると容量を合算できる。", tile:41 };

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

/* 料理名→カテゴリ マッピング（味付け壺のボーナス判定用） */
function _buildFoodCatMap() {
  const m = new Map();
  const _catSavory = [
    { cat: "italian", items: COOKED_FOODS_SAVORY.slice(0, COOKED_FOODS_SAVORY.indexOf("餃子")) },
    { cat: "chinese", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("餃子"), COOKED_FOODS_SAVORY.indexOf("ビビンバ")) },
    { cat: "korean", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("ビビンバ"), COOKED_FOODS_SAVORY.indexOf("フォー")) },
    { cat: "southeast_asian", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("フォー"), COOKED_FOODS_SAVORY.indexOf("ラタトゥイユ")) },
    { cat: "french", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("ラタトゥイユ"), COOKED_FOODS_SAVORY.indexOf("シュニッツェル")) },
    { cat: "german", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("シュニッツェル"), COOKED_FOODS_SAVORY.indexOf("寿司")) },
    { cat: "japanese", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("寿司"), COOKED_FOODS_SAVORY.indexOf("ステーキ")) },
    { cat: "american", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("ステーキ"), COOKED_FOODS_SAVORY.indexOf("パエリア")) },
    { cat: "spanish", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("パエリア"), COOKED_FOODS_SAVORY.indexOf("ケバブ")) },
    { cat: "middle_eastern", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("ケバブ"), COOKED_FOODS_SAVORY.indexOf("ナン")) },
    { cat: "indian", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("ナン"), COOKED_FOODS_SAVORY.indexOf("ピロシキ")) },
    { cat: "russian", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("ピロシキ"), COOKED_FOODS_SAVORY.indexOf("フォンデュ")) },
    { cat: "other", items: COOKED_FOODS_SAVORY.slice(COOKED_FOODS_SAVORY.indexOf("フォンデュ")) },
  ];
  const _catSweet = [
    { cat: "western_sweets", items: COOKED_FOODS_SWEET.slice(0, COOKED_FOODS_SWEET.indexOf("たい焼き")) },
    { cat: "japanese_sweets", items: COOKED_FOODS_SWEET.slice(COOKED_FOODS_SWEET.indexOf("たい焼き"), COOKED_FOODS_SWEET.indexOf("杏仁豆腐")) },
    { cat: "asian_sweets", items: COOKED_FOODS_SWEET.slice(COOKED_FOODS_SWEET.indexOf("杏仁豆腐"), COOKED_FOODS_SWEET.indexOf("バクラヴァ")) },
    { cat: "mideast_sweets", items: COOKED_FOODS_SWEET.slice(COOKED_FOODS_SWEET.indexOf("バクラヴァ")) },
  ];
  for (const { cat, items } of [..._catSavory, ..._catSweet]) {
    for (const name of items) m.set(name, cat);
  }
  return m;
}
const FOOD_CAT_MAP = _buildFoodCatMap();

/* 壺の味付けとカテゴリの相性マッピング */
const POT_CAT_BONUS = {
  miso:    ["japanese", "japanese_sweets"],
  spicy:   ["korean"],
  curry:   ["indian", "southeast_asian"],
  choco:   ["western_sweets", "asian_sweets", "mideast_sweets"],
  honey:   ["western_sweets", "japanese_sweets", "asian_sweets", "mideast_sweets"],
  olive:   ["italian", "spanish"],
  sesame:  ["chinese", "korean"],
  butter:  ["french", "american", "german"],
  yogurt:  ["middle_eastern", "russian"],
  coconut: ["southeast_asian", "asian_sweets"],
};

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
  { l:"癒しの",   e:"heal_food",     w:3, rarity:1, bonus: 30  },  // HP回復（一時的）
  { l:"力の",     e:"power_food",    w:1, rarity:3, bonus: 200 },  // 攻撃力UP（永続）
  { l:"速さの",   e:"speed_food",    w:2, rarity:2, bonus: 100 },  // 速度UP（一時的）
  { l:"守りの",   e:"def_food",      w:1, rarity:3, bonus: 200 },  // 防御UP（永続）
  { l:"活力の",   e:"vitality_food", w:1, rarity:3, bonus: 250 },  // 最大HP UP（永続）
  { l:"経験の",   e:"exp_food",      w:2, rarity:2, bonus: 80  },  // 経験値UP
  { l:"幸運の",   e:"luck_food",     w:2, rarity:2, bonus: 80  },  // 運・ゴールドUP
  { l:"透視の",   e:"reveal_food",   w:1, rarity:3, bonus: 150 },  // マップ全公開
  { l:"解毒の",   e:"antidote_food", w:2, rarity:2, bonus: 60  },  // 毒解除
  { l:"満腹の",   e:"satiate_food",  w:3, rarity:1, bonus: 20  },  // 満腹度大回復
  { l:"魔力の",   e:"mp_food",       w:2, rarity:2, bonus: 60  },  // MP回復
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

/* ===== 宝石 ===== */
export const GEM_TYPES = [
  { name: "ルビー",       type: "gem", rarity: "B", weight: 8,  basePrice: 500,  tile: 88,  desc: "深紅の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "サファイア",   type: "gem", rarity: "B", weight: 8,  basePrice: 600,  tile: 89,  desc: "深青の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "エメラルド",   type: "gem", rarity: "B", weight: 8,  basePrice: 550,  tile: 90,  desc: "緑の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "トパーズ",     type: "gem", rarity: "C", weight: 12, basePrice: 300,  tile: 91,  desc: "黄色の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "アメジスト",   type: "gem", rarity: "C", weight: 12, basePrice: 280,  tile: 92,  desc: "紫の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "アクアマリン", type: "gem", rarity: "C", weight: 10, basePrice: 320,  tile: 87,  desc: "青緑の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "ダイヤモンド", type: "gem", rarity: "A", weight: 3,  basePrice: 1200, tile: 101, desc: "無色透明の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "オパール",     type: "gem", rarity: "A", weight: 3,  basePrice: 1000, tile: 102, desc: "虹色の宝石。買った店から遠い階の店で売ると高値がつく。" },
];

/* 宝石の売値を計算する（originDepth から currentDepth の距離に応じて上昇） */
export function gemSellPrice(gem, currentDepth) {
  const dist = Math.abs(currentDepth - (gem.originDepth ?? currentDepth));
  return Math.round((gem.basePrice || 100) * (1 + dist * 0.2));
}

export function itemPrice(it) {
  // sellPrice が設定されている場合はそれを基準にする
  if (it.sellPrice != null) {
    const base = it.sellPrice;
    // 武器・防具は強化値に応じて加算
    if (it.type === "weapon" || it.type === "armor") {
      const plus = it.plus || 0;
      return base + plus * 100;
    }
    // 杖・ペン・マーカーはチャージ数に応じて加算（1チャージあたりbase×10%、最低100G）
    if (it.type === "wand" || it.type === "pen" || it.type === "marker") {
      const charges = it.charges || 0;
      const perCharge = Math.max(100, Math.floor(base * 0.1));
      return base + charges * perCharge;
    }
    // 矢は個数に応じて加算（sellPriceは1個あたりの価値）
    if (it.type === "arrow") {
      return Math.max(base, Math.floor(base * (it.count || 1) / 3));
    }
    // 壺は容量・中身の合計価格を加算（1容量あたりbase×10%）
    if (it.type === "pot") {
      const contentsValue = (it.contents || []).reduce((s, c) => s + itemPrice(c), 0);
      const capBonus = (it.capacity || 0) * Math.floor(base * 0.1);
      return base + contentsValue + capBonus;
    }
    return base;
  }
  // sellPrice未設定のアイテム用フォールバック
  if (it.type === "potion") {
    if (it.effect === "superheal") return 400;
    if (it.effect === "heal") return it.value >= 60 ? 200 : 100;
    if (it.effect === "power") return 120;
    return 40;
  }
  if (it.type === "scroll")   return it.effect === "blank" ? 5 : it.effect === "reveal" ? 60 : 80;
  if (it.type === "weapon")   return 50 + (it.atk || 0) * 20 + (it.ability ? 150 : 0);
  if (it.type === "armor")    return 60 + (it.def || 0) * 25 + (it.ability ? 150 : 0);
  if (it.type === "food") {
    const satietyBase = Math.floor((it.value || 20) * 2.5);
    const effectEntry = it.effect ? FOOD_EFFECTS.find(f => f.e === it.effect) : null;
    const effectBonus = effectEntry ? effectEntry.bonus : 0;
    return Math.max(10, satietyBase + effectBonus);
  }
  if (it.type === "arrow")    return Math.max(10, (it.count || 1) * 5);
  if (it.type === "wand")     return 150 + (it.charges || 0) * 30;
  if (it.type === "marker")   return 100 + (it.charges || 0) * 40;
  if (it.type === "pen")      return 150 + (it.charges || 0) * 50;
  if (it.type === "pot") {
    const contentsValue = (it.contents || []).reduce((s, c) => s + itemPrice(c), 0);
    return 120 + contentsValue;
  }
  if (it.type === "gem")      return it.basePrice || 100;
  if (it.type === "bottle")   return 5;
  if (it.type === "spellbook") return 200;
  if (it.type === "ring") {
    const ringBase = it.sellPrice ?? 100;
    if (it.effect === "power_ring" || it.effect === "defense_ring" || it.effect === "life_ring") return ringBase + (it.plus || 0) * 100;
    return ringBase;
  }
  return 30;
}

/* weight フィールドを使った重み付き抽選 */
export function pickWeighted(arr) {
  const pool = arr.filter(x => (x.weight ?? 1) > 0);
  if (pool.length === 0) return arr[Math.floor(Math.random() * arr.length)];
  const total = pool.reduce((s, x) => s + (x.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const x of pool) { r -= (x.weight ?? 1); if (r <= 0) return x; }
  return pool[pool.length - 1];
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
  /* 「普通の」は名前に表示しない */
  const nm = sz.l === "普通の" ? ef.l + fn : ef.l + sz.l + fn;
  let hv = ef.e === "satiate_food" ? Math.floor(sz.v * 1.5) : sz.v;
  if (!cooked) hv = Math.max(1, Math.floor(hv / 2));
  const foodCat = FOOD_CAT_MAP.get(fn) || null;
  return { name:nm, type:"food", effect:ef.e, value:hv, desc:FOOD_DESCS[ef.e], tile: cooked ? 66 : 19, cooked, foodCat, sizeLabel: sz.l, _foodBase: fn, _foodEfLabel: ef.l };
}

/* ===== WANDS ===== */
export const WANDS = [
  { name:"ふきとばしの杖", type:"wand", effect:"knockback", charges:5, rarity:"C", weight:8,  sellPrice:300,  desc:"振ると対象を吹き飛ばす。壊すと周囲全てを吹き飛ばす。",                           tile:24 },
  { name:"いかずちの杖",   type:"wand", effect:"lightning", charges:4, rarity:"B", weight:4,  sellPrice:700,  desc:"振ると雷撃が飛ぶ。壊すと周囲に落雷。",                                           tile:24 },
  { name:"鈍足の杖",       type:"wand", effect:"slow",      charges:6, rarity:"C", weight:8,  sellPrice:300,  desc:"振ると対象の速度を半減。壊すと周囲全てを鈍足に。",                               tile:24 },
  { name:"変化の杖",       type:"wand", effect:"transform", charges:4, rarity:"B", weight:4,  sellPrice:600,  desc:"振ると対象を別の何かに変える。壊すと周囲全てを変化。",                           tile:24 },
  { name:"場所替えの杖",   type:"wand", effect:"swap",      charges:5, rarity:"B", weight:4,  sellPrice:500,  desc:"振ると対象と位置を交換する。壊すと周囲をシャッフル。",                           tile:24 },
  { name:"穴掘りの杖",     type:"wand", effect:"dig",       charges:5, rarity:"B", weight:4,  sellPrice:600,  desc:"壁に当てると一直線上の壁を掘り進む。壊すと周囲の壁を消し足元に穴が開く。",       tile:24 },
  { name:"飛びつきの杖",   type:"wand", effect:"leap",      charges:5, rarity:"C", weight:8,  sellPrice:250,  desc:"振ると対象の目の前に瞬間移動する。壊しても何も起こらない。",                     tile:24 },
  { name:"テレポートの杖", type:"wand", effect:"warp",      charges:4, rarity:"B", weight:4,  sellPrice:500,  desc:"振ると対象をランダムな場所にテレポートさせる。壊すと周囲全員をテレポート。",     tile:24 },
  { name:"金縛りの杖",     type:"wand", effect:"paralyze",  charges:5, rarity:"A", weight:2,  sellPrice:4000, desc:"振ると対象を金縛りにする。何かアクションを受けるまで動けなくなる。祝福：2回アクションが必要な強金縛り。呪い：対象が200ターン状態異常（金縛り・眠り・鈍足）を防ぐ力を得る。",               tile:24 },
  { name:"眠りの杖",       type:"wand", effect:"sleep",     charges:5, rarity:"C", weight:8,  sellPrice:400,  desc:"振ると対象を眠りに落とす。眠りの罠と同様の効果。",                                   tile:24 },
  { name:"祝福の杖",       type:"wand", effect:"bless_wand",charges:3, rarity:"S", weight:1,  sellPrice:8000, desc:"振ると対象のアイテムを祝福する。壊すと周囲のアイテム全てを祝福する。",                 tile:24 },
  { name:"呪いの杖",       type:"wand", effect:"curse_wand",charges:3, rarity:"B", weight:4,  sellPrice:1500, desc:"振ると対象のアイテムを呪う。壊すと周囲のアイテム全てを呪う。",                         tile:24 },
  { name:"レベルアップの杖", type:"wand", effect:"levelup", charges:3, rarity:"A", weight:2,  sellPrice:12000, desc:"振ると対象をレベルアップさせる。自分に使えば1レベル上がる。敵に当てると次の形態に変化する。呪い：自分なら1階上へ飛ばされ、敵ならレベルダウンする。水の瓶に当てるとレベルアップの薬になる。", tile:24 },
  { name:"混乱の杖",       type:"wand", effect:"confuse",   charges:5, rarity:"C", weight:8,  sellPrice:300,  desc:"振ると対象を混乱させる。自分なら5ターン、敵なら20ターン混乱する。水の瓶に当てると混乱の薬になる。", tile:24 },
  { name:"暗闇の杖",       type:"wand", effect:"darkness",  charges:5, rarity:"B", weight:4,  sellPrice:500,  desc:"振ると対象を暗闇状態にする。自分なら視界が1マスになる(20ターン)。敵なら50ターンこちらを認識できず壁まで直進し途中の者を攻撃する。祝福：自分50ターン・敵永続。呪い：フロア全体が見えるようになる。水の瓶に当てると暗闇の薬になる。", tile:24 },
  { name:"惑わしの杖",     type:"wand", effect:"bewitch",   charges:4, rarity:"B", weight:4,  sellPrice:600,  desc:"振ると対象を幻惑状態にする。自分なら50ターン周囲の見た目が狂う。敵なら50ターン逃げ回る。祝福：自分100ターン・敵永続。呪い：フロアの罠が全て見えるようになる。水の瓶に当てると惑わしの薬になる。", tile:24 },
  { name:"封印の杖",       type:"wand", effect:"seal",      charges:5, rarity:"C", weight:8,  sellPrice:350,  desc:"振ると対象を封印状態にする。自分に当たるとMP封印50ターン。祝福：敵に鈍足も付与、自分は鈍足10ターンも追加。呪い：敵の特技使用率が100%に、自分はMP封印が治る。水の瓶に当てると封印の薬になる。", tile:24 },
  { name:"軟化の杖",       type:"wand", effect:"soften",    charges:5, rarity:"B", weight:4,  sellPrice:700,  desc:"振ると対象の防御力を半減する（祝福：4分の1）。アイテム・罠・大箱に当てると破壊。壁に当てると1マスがランダムな食料に変化。呪い：1マス先に壊せる壁を生成する。", tile:24 },
  { name:"炎の杖",         type:"wand", effect:"fire_wand", charges:5, rarity:"B", weight:4,  sellPrice:600,  desc:"振ると炎の弾が飛ぶ。油まみれの対象には2倍ダメージ、火ダルマは回復。自分に当たると炎でアイテム損傷抽選。床のアイテムに当たると魔法書・巻物・薬は破壊、食料は焼ける。祝福：2倍ダメージ。呪い：対象を回復。", tile:24 },
  { name:"氷の杖",         type:"wand", effect:"ice_wand",      charges:5, rarity:"B", weight:4,  sellPrice:600,  desc:"振ると氷の弾が飛ぶ。対象に氷属性ダメージ+5ターン移動封じ。火ダルマには2倍ダメージ。祝福：2倍ダメージ+移動封じ10ターン。呪い：対象を回復し移動封じ状態なら解除。", tile:24 },
  { name:"体力交換の杖",   type:"wand", effect:"vitality_swap", charges:4, rarity:"B", weight:4,  sellPrice:800,  desc:"振ると相手と現在HPを入れ替える。祝福：交換後に相手のHPを1に。呪い：交換後に自分のHPを1に。自分に振っても交換は起きないが祝福・呪いの効果は出る。壊すと隣接する最大HPのモンスターとHP交換。", tile:24 },
  { name:"物知りの杖",     type:"wand", effect:"sage",          charges:4, rarity:"B", weight:4,  sellPrice:700,  desc:"アイテム・大箱に当てると識別する。壁に跳ね返って自分に当たると手持ちから1個ランダム識別。呪い：対象が未識別に戻る。敵や罠には効果なし。", tile:24 },
];

/* ===== BIG BOX TYPES ===== */
export const BB_TYPES = [
  { kind: "synthesis", name: "合成の大笥", cap: () => 2,         desc: "2つのアイテムを合成する。武器同士・防具同士なら能力を引き継ぐ。杖同士ならチャージを合算。ペン同士なら合算。杖と武器・防具の組み合わせでは装備に杖の能力が宿る異種合成もある。組み合わせによっては別のアイテムに変化する特殊合成が発生することもある。" },
  { kind: "change",    name: "変化の大箱", cap: () => rng(2, 4), desc: "入れたアイテムがランダムな別のアイテムに変化する。何に変わるかは開けるまで不明。キーアイテムは変化しない。" },
  { kind: "enhance",   name: "強化の大箱", cap: () => rng(1, 2), desc: "武器・防具の＋値を1上げる。力・守り・命の指輪の＋値も増やせる。壺の容量を1増やす。他のアイテムには効果がない。" },
  { kind: "satiety",   name: "満腹の大箱", cap: () => rng(2, 4), desc: "食料のサイズを1段階大きくする。生なら最大で超特大、調理済みなら最大で爆盛りになる。食料以外には効果がない。" },
  { kind: "refill",    name: "充填の大箱", cap: () => rng(1, 3), desc: "杖・ペン・魔法のマーカーの使用回数をランダムに回復する。" },
  { kind: "identify",  name: "鑑定の大箱", cap: () => rng(3, 5), desc: "入れたアイテムを識別する。薬・巻物・杖の見た目名が判明し、武器・防具の呪い状態も分かる。" },
  { kind: "split",     name: "分裂の大箱", cap: () => 1, rare: true, desc: "【レア】入れたアイテムを複製する。＋値・矢の数は半減する。金貨とキーアイテムは分裂しない。" },
  { kind: "bless",     name: "祝福の大箱", cap: () => rng(1, 2), rare: true, desc: "【レア】入れたアイテムを祝福する。壺は祝福ではなく容量が1増える。キーアイテムには効果がない。" },
  { kind: "curse",     name: "呪いの大箱", cap: () => rng(1, 2), desc: "入れたアイテムを呪う。壺は容量が1減る。食料は腐る。金貨・キーアイテムには効果がない。" },
  { kind: "scatter",   name: "拡散の大箱", cap: () => rng(3, 6), desc: "入れたアイテムを同じ部屋にいる全員に投げつけ消滅させる。薬・杖・壺・矢は各種効果発動。使うたびに容量が減り壊れる。" },
  { kind: "trash",     name: "ゴミ箱",     cap: () => rng(5, 10), desc: "入れたアイテムが消滅する。使うたびに容量が減り壊れる。" },
];

export const BB_FAKE_NAMES = [
  "古びた大箱", "黒い大箱", "赤茶けた大箱", "青い大箱", "緑の大箱",
  "金色の大箱", "銀色の大箱", "木製の大箱", "鉄製の大箱", "石造りの大箱",
  "重そうな大箱", "軽そうな大箱", "模様入りの大箱", "紋章付きの大箱", "彫刻入りの大箱",
  "光る大箱", "くすんだ大箱", "冷たい大箱", "温かい大箱", "ざらざらした大箱",
  "滑らかな大箱", "丸みのある大箱", "角ばった大箱", "蔦の絡まった大箱", "焦げた大箱",
];

/* ===== POTS ===== */
export const POTS = [
  { name:"チョコの壺",         type:"pot", potEffect:"choco",     capacity:3, rarity:"C", weight:8,  sellPrice:600,  desc:"食料を入れるとチョコがけになる。食べるとHP回復。",  tile:32 },
  { name:"唐辛子の壺",         type:"pot", potEffect:"spicy",     capacity:3, rarity:"B", weight:4,  sellPrice:900,  desc:"食料を入れると激辛になる。食べると攻撃力UP。",     tile:32 },
  { name:"蜂蜜の壺",           type:"pot", potEffect:"honey",     capacity:3, rarity:"C", weight:8,  sellPrice:550,  desc:"食料を入れるとはちみつ漬けになる。",   tile:32 },
  { name:"保存の壺",           type:"pot", potEffect:"none",      capacity:5, rarity:"C", weight:8,  sellPrice:1500, desc:"アイテムを安全に保管できる。",         tile:32 },
  { name:"強化の壺",           type:"pot", potEffect:"enhance",   capacity:2, rarity:"S", weight:1,  sellPrice:9000, desc:"装備品の性能が上がる。",               tile:32 },
  { name:"弱化の壺",           type:"pot", potEffect:"weaken",    capacity:3, rarity:"C", weight:8,  sellPrice:150,  desc:"入れた装備品が劣化する呪いの壺。",     tile:32 },
  { name:"カレーの壺",         type:"pot", potEffect:"curry",     capacity:3, rarity:"C", weight:8,  sellPrice:500,  desc:"食料を入れるとカレー味になる。",       tile:32 },
  { name:"味噌の壺",           type:"pot", potEffect:"miso",      capacity:3, rarity:"C", weight:8,  sellPrice:500,  desc:"食料を入れると味噌漬けになる。",       tile:32 },
  { name:"燻製の壺",           type:"pot", potEffect:"smoke",     capacity:3, rarity:"B", weight:4,  sellPrice:1000, desc:"食料を燻製にする。食べると最大満腹度が上がる。", tile:32 },
  { name:"祝福の壺",           type:"pot", potEffect:"bless_pot", capacity:3, rarity:"S", weight:1,  sellPrice:9000, desc:"入れたアイテムを祝福する。",           tile:32 },
  { name:"呪いの壺",           type:"pot", potEffect:"curse_pot", capacity:3, rarity:"C", weight:8,  sellPrice:800,  desc:"入れたアイテムを呪う。",               tile:32 },
  { name:"加熱の壺",           type:"pot", potEffect:"boil",      capacity:3, rarity:"B", weight:4,  sellPrice:800,  desc:"薬を入れると部屋中に薬効が広がる。生の食料を入れると焼いた状態になる。その他のものは保管できる。", tile:32 },
  { name:"火薬壺",             type:"pot", potEffect:"gunpowder", capacity:3, rarity:"B", weight:4,  sellPrice:700,  desc:"割れると周囲8マスを巻き込む爆発を起こす。炎・雷・爆発でも誘爆する。泉に浸すと保存の壺に変化する。中身は爆発で消える。", tile:32 },
  { name:"オリーブオイルの壺", type:"pot", potEffect:"olive",     capacity:3, rarity:"C", weight:8,  sellPrice:550,  desc:"食料を入れるとオリーブオイル漬けになる。満タンでない状態で割れると周囲8マスに油が飛散し、油まみれの床と油状態(100T)を付与。油まみれなら炎ダメージ2倍。", tile:32 },
  { name:"ごま油の壺",         type:"pot", potEffect:"sesame",    capacity:3, rarity:"C", weight:8,  sellPrice:550,  desc:"食料を入れるとごま油風味になる。満タンでない状態で割れると周囲8マスに油が飛散し、油まみれの床と油状態(100T)を付与。油まみれなら炎ダメージ2倍。",         tile:32 },
  { name:"バターの壺",         type:"pot", potEffect:"butter",    capacity:3, rarity:"C", weight:8,  sellPrice:550,  desc:"食料を入れるとバター風味になる。満タンでない状態で割れると周囲8マスに油が飛散し、油まみれの床と油状態(100T)を付与。油まみれなら炎ダメージ2倍。",         tile:32 },
  { name:"ヨーグルトの壺",     type:"pot", potEffect:"yogurt",    capacity:3, rarity:"C", weight:8,  sellPrice:500,  desc:"食料を入れるとヨーグルト漬けになる。",   tile:32 },
  { name:"ココナッツの壺",     type:"pot", potEffect:"coconut",   capacity:3, rarity:"C", weight:8,  sellPrice:500,  desc:"食料を入れるとココナッツ風味になる。",   tile:32 },
];

export const POT_FOOD_PREFIX = {
  choco:   "チョコがけ",
  spicy:   "激辛",
  honey:   "はちみつ",
  curry:   "カレー味の",
  miso:    "味噌漬けの",
  smoke:   "燻製",
  olive:   "オリーブオイル漬けの",
  sesame:  "ごま油風味の",
  butter:  "バター風味の",
  yogurt:  "ヨーグルト漬けの",
  coconut: "ココナッツ風味の",
};

export const POT_FOOD_DESCS = {
  choco:   "甘い香りがする。",
  spicy:   "辛さで活力が戻る。",
  honey:   "甘くて元気が出る。",
  curry:   "スパイスが効いている。",
  miso:    "深い味わいがある。",
  smoke:   "香ばしい匂いがする。",
  olive:   "オリーブの香りが広がる。",
  sesame:  "ごまの風味が香ばしい。",
  butter:  "バターのコクが加わった。",
  yogurt:  "さわやかな酸味がある。",
  coconut: "南国の甘い香りがする。",
};

export function applyPotEffect(pot, item, ml, nameFn = null) {
  const _in = nameFn ? nameFn(item) : item.name;
  const _pn = nameFn ? nameFn(pot) : pot.name;
  const pe = pot.potEffect;
  if (pe === "none") { ml.push(`${_in}を${_pn}に入れた。`); return; }
  if (pe === "boil") { /* 実効果はGame.jsx側で処理 */ return; }
  if (pe === "enhance") {
    if (item.type === "weapon" || item.type === "armor" || (item.type === "ring" && ["power_ring", "defense_ring", "life_ring"].includes(item.effect))) {
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
    if (item.type === "food") {
      if (item.smoked) { ml.push(`${item.name}は既に燻製だ。`); return; }
      if (!item.cooked) {
        item.value = item.value * 2;
        cookFoodMeta(item);
      }
      item.smoked = true;
      item.name = "燻製" + item.name;
      item.desc = POT_FOOD_DESCS.smoke;
      ml.push(`${item.name}になった！(食べると最大満腹度UP)`);
      return;
    }
  }
  const pfx = POT_FOOD_PREFIX[pe];
  if (pfx && item.type === "food") {
    if (!item.potFlavors) item.potFlavors = [];
    item.potFlavors.push(pe);
    item.name = pfx + item.name;
    item.value = Math.max(1, Math.floor(item.value * 0.8));
    const _catBonus = POT_CAT_BONUS[pe];
    const _catMatch = _catBonus && item.foodCat && _catBonus.includes(item.foodCat);
    const _potMul = _catMatch ? 2.0 : 1.3;
    item.value = Math.floor(item.value * _potMul);
    item.desc = POT_FOOD_DESCS[pe] || item.desc;
    ml.push(_catMatch
      ? `${item.name}になった！(相性抜群！満腹度大幅UP)`
      : `${item.name}になった！(満腹度UP)`);
    return;
  }
  ml.push(`${_in}を${_pn}に入れた。`);
}

export function randPotCapacity(potEffect) {
  if (potEffect === "none") return rng(4, 6);
  if (potEffect === "enhance" || potEffect === "bless_pot" || potEffect === "curse_pot") return rng(1, 2);
  return rng(3, 5);
}

export function makePot() {
  const t = pick(POTS);
  return { ...t, id:uid(), contents:[], capacity: randPotCapacity(t.potEffect) };
}

export function scatterPotContents(pot, dg, px, py, p, ml, luFn, nameFn = null) {
  const _pn = nameFn ? nameFn(pot) : pot.name;
  /* 火薬壺は割れると爆発（中身も消える） */
  if (pot.potEffect === "gunpowder") {
    doGunpowderExplosion(px, py, dg, p, ml, luFn, _pn);
    return;
  }
  /* 油系壺：満タンでない場合は周囲8マスに油が飛散 */
  const _oilEffects = { olive: "オリーブオイル", sesame: "ごま油", butter: "バター" };
  if (_oilEffects[pot.potEffect] && (pot.contents?.length || 0) < (pot.capacity || 3)) {
    ml.push(`${_pn}が割れて${_oilEffects[pot.potEffect]}が飛び散った！`);
    pushSplashAnim(px, py, "#ccaa44");
    dg.oilyTiles = dg.oilyTiles || [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = px + dx, ty = py + dy;
        if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) continue;
        if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) continue;
        if (!dg.oilyTiles.some(t => t.x === tx && t.y === ty))
          dg.oilyTiles.push({ x: tx, y: ty });
        const mon = monsterAt(dg, tx, ty);
        if (mon) { mon.oilyTurns = (mon.oilyTurns || 0) + 100; ml.push(`${mon.name}は油まみれになった！(100ターン)`); }
        if (tx === p.x && ty === p.y) { p.oilyTurns = (p.oilyTurns || 0) + 100; ml.push("油を浴びた！炎ダメージが2倍になる！(100ターン)"); }
      }
    }
    if (pot.contents?.length > 0) {
      const ft = new Set();
      for (const item of pot.contents) { placeItemAt(dg, px, py, item, ml, ft); }
    }
    return;
  }
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
  { id:"inflict_slow",    name:"鈍足付与",  desc:"攻撃時10%の確率で敵を鈍足にする" },
  { id:"inflict_paralyze",name:"金縛り付与",desc:"攻撃時10%の確率で敵を金縛りにする" },
  { id:"inflict_sleep",   name:"睡眠付与",  desc:"攻撃時10%の確率で敵を眠らせる" },
  { id:"inflict_darkness",name:"暗闇付与",  desc:"攻撃時10%の確率で敵を暗闇にする" },
  { id:"inflict_confuse", name:"混乱付与",  desc:"攻撃時10%の確率で敵を混乱させる" },
  { id:"inflict_bewitch", name:"惑わし付与",desc:"攻撃時10%の確率で敵を幻惑にする" },
  { id:"inflict_seal",    name:"封印付与",  desc:"攻撃時10%の確率で敵を封印する" },
  { id:"inflict_immobile",name:"影縫い",    desc:"攻撃時25%の確率で敵の移動を2〜3ターン封じる" },
  { id:"fire_elem",       name:"炎属性",    desc:"油まみれの敵に2倍ダメージ、火ダルマには0.5倍ダメージ" },
  { id:"ice_elem",        name:"氷属性",    desc:"炎属性の敵(火ダルマ・氷竜以外の炎系)に2倍ダメージ" },
  { id:"thunder_elem",    name:"雷属性",    desc:"氷・水系の敵(氷竜・わてり)に2倍ダメージ" },
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
  { id:"slow_proof",       name:"耐鈍足",   desc:"鈍足効果を無効化する" },
  { id:"paralyze_proof",   name:"耐金縛り", desc:"金縛り効果を無効化する" },
  { id:"darkness_proof",   name:"耐暗闇",   desc:"暗闇効果を無効化する" },
  { id:"confuse_proof",    name:"耐混乱",   desc:"混乱効果を無効化する" },
  { id:"bewitch_proof",    name:"耐惑わし", desc:"幻惑効果を無効化する" },
  { id:"seal_proof",       name:"耐封印",   desc:"封印効果を無効化する" },
  { id:"ice_resist",       name:"耐氷",     desc:"氷のダメージを半減する" },
];

/* ===== TRAPS ===== */
export const TRAPS = [
  { name:"地雷",           effect:"explode",       tile:25 },
  { name:"矢の罠",         effect:"arrow_trap",    tile:26 },
  { name:"落とし穴",       effect:"pitfall",       tile:27 },
  { name:"錆の罠",         effect:"rust",          tile:28 },
  { name:"回転板",         effect:"spin",          tile:29 },
  { name:"睡眠ガスの罠",   effect:"sleep",         tile:30 },
  { name:"毒矢の罠",       effect:"poison_arrow",  tile:45 },
  { name:"召喚の罠",       effect:"summon_trap",   tile:46 },
  { name:"鈍足の罠",       effect:"slow_trap",     tile:47 },
  { name:"封印の罠",       effect:"seal_trap",     tile:48 },
  { name:"盗みの罠",       effect:"steal_trap",    tile:49 },
  { name:"空腹の罠",       effect:"hunger_trap",   tile:50 },
  { name:"吹き飛ばしの罠", effect:"blowback_trap", tile:51 },
  { name:"影ぬいの罠",     effect:"shadow_stitch", tile:71 },
  { name:"落石の罠",       effect:"rockfall",      tile:72 },
  { name:"時限爆弾の罠",   effect:"time_bomb",     tile:73 },
  { name:"惑わしの罠",     effect:"bewitch_trap",  tile:84 },
  { name:"暗闇の罠",       effect:"darkness_trap", tile:85 },
  { name:"腐敗の罠",       effect:"rot_trap",      tile:94 },
];

/**
 * 爆発共通処理 (地雷・爆弾矢などから呼ぶ)
 * cx, cy: 爆発の中心。周囲8マス＋中心の計9マスを処理する。
 * excludeItem: アイテム破壊から除外するアイテム（罠を踏んだアイテム自身など）
 * mineExplosion: true のとき地雷モード（炎無効でない敵は消滅＋範囲内地雷を連鎖爆発）
 */
let _mineExplosionDepth = 0;
export function doExplosion(cx, cy, dg, p, ml, nameFn = null, srcLabel = "爆発", excludeItem = null, luFn = null, proportional = false, ringExplosion = false, mineExplosion = false, noExpKills = false) {
  if (mineExplosion) {
    if (_mineExplosionDepth > 4) return;
    _mineExplosionDepth++;
  }
  pushExplosionAnim(cx, cy);
  /* プレイヤーへのダメージ（中心含む1タイル以内） */
  if (p && Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)) <= 1) {
    const _hasFireR = ringExplosion && hasAbility(p.armor, "fire_resist");
    const rawDmg = ringExplosion ? Math.max(1, Math.floor(p.hp * 3 / 4))
                 : proportional  ? Math.max(1, Math.floor(p.hp / 2))
                 : rng(10, 20);
    const dmg = _hasFireR ? Math.max(1, Math.floor(rawDmg / 2)) : rawDmg;
    p.deathCause = `${srcLabel}により`;
    p.hp -= dmg;
    ml.push(`${srcLabel}！${dmg}ダメージ！${_hasFireR ? "（耐火半減）" : ""}`);
    /* 指輪爆発：炎によるアイテム損傷（耐火なし時） */
    if (ringExplosion && !_hasFireR) applyLightningToInventory(p, dg, ml, luFn, null, true);
  }
  const blasted = new Set();
  const _killed = new Set();
  for (let ddx = -1; ddx <= 1; ddx++) {
    for (let ddy = -1; ddy <= 1; ddy++) {
      const ax = cx + ddx, ay = cy + ddy;
      if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
      /* 壁の破壊 */
      if ((dg.map[ay][ax] === T.BWALL || dg.map[ay][ax] === T.WALL) &&
          ax > 0 && ax < MW - 1 && ay > 0 && ay < MH - 1) {
        const _wi = dg.items.find(i => i.x === ax && i.y === ay && i.wallEmbedded);
        if (_wi) { delete _wi.wallEmbedded; _wi.discovered = true; }
        dg.map[ay][ax] = T.FLOOR;
        if (dg.explored?.[ay]?.[ax] !== undefined) dg.explored[ay][ax] = true;
        if (dg.visible?.[ay]?.[ax] !== undefined) dg.visible[ay][ax] = true;
        ml.push("爆風で壁が崩れた！");
        wallBreakDrop(dg, ax, ay);
        continue; /* 壁タイルにキャラ・アイテムはいない */
      }
      /* モンスターダメージ */
      const _hasExPentacle = dg.pentacles?.some(pc => pc.kind === "explosion" && !pc.cursed) ?? false;
      for (const m of [...dg.monsters.filter(m => m.x === ax && m.y === ay)]) {
        if (_killed.has(m)) continue;
        wakeIfDormant(m, ml);
        /* 火ダルマ：爆発で分裂 */
        if (m.baseKind === "firedemon") {
          ml.push(`${m.name}が爆発を受けて分裂した！`);
          const _sd8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
          for (const [_sx, _sy] of _sd8) {
            const _nx = ax + _sx, _ny = ay + _sy;
            if (_nx < 0 || _nx >= MW || _ny < 0 || _ny >= MH) continue;
            if (dg.map[_ny][_nx] === T.WALL || dg.map[_ny][_nx] === T.BWALL) continue;
            if (dg.monsters.some(o => o.x === _nx && o.y === _ny)) continue;
            if (p && _nx === p.x && _ny === p.y) continue;
            dg.monsters.push({ ...m, id: uid(), x: _nx, y: _ny, hp: m.hp, turnAccum: 0, aware: true });
            break;
          }
          continue;
        }
        if (_hasExPentacle || ringExplosion || mineExplosion) {
          /* 爆発の魔方陣 or 指輪爆発 or 地雷：炎無効でない敵は消滅（ボスは現在HPの4分の1ダメージ） */
          if (consumeBarrier(m, ml)) continue;
          if (m.isBoss) {
            const _bd = Math.max(1, Math.floor(m.hp / 4));
            m.hp -= _bd;
            ml.push(`爆発で${m.name}は${_bd}ダメージ！`);
            if (m.hp <= 0) { _killed.add(m); killMonster(m, dg, p, ml, luFn, noExpKills || ringExplosion); }
            continue;
          }
          m.hp = 0;
          _killed.add(m); killMonster(m, dg, p, ml, luFn, noExpKills || ringExplosion);
        } else {
          if (consumeBarrier(m, ml)) continue;
          let md = proportional ? Math.max(1, Math.floor(m.hp / 2)) : rng(8, 15);
          m.hp -= md;
          ml.push(`爆風で${m.name}に${md}ダメージ！`);
          if (m.hp <= 0) { _killed.add(m); killMonster(m, dg, p, ml, luFn, noExpKills); }
        }
      }
      /* アイテム破壊 */
      for (const it of dg.items.filter(i => i !== excludeItem && i.x === ax && i.y === ay)) {
        if (it.type === "scroll") {
          blasted.add(it); ml.push(`巻物「${nameFn ? nameFn(it) : it.name}」が燃えてなくなった！`);
        } else if (it.type === "spellbook") {
          blasted.add(it); ml.push(`魔法書「${nameFn ? nameFn(it) : it.name}」が燃えてなくなった！`);
        } else if (it.type === "potion") {
          blasted.add(it); ml.push(`薬「${nameFn ? nameFn(it) : it.name}」が割れてなくなった！`);
        } else if (it.type === "food") {
          if (!it.cooked) { it.value *= 2; cookFoodMeta(it); it.name = "焼いた" + it.name; ml.push(`${it.name}になった！`); }
          else { burnFoodItem(it, ml); }
        } else if (it.type === "pot") {
          blasted.add(it);
          if (it.potEffect === "gunpowder") {
            /* 火薬壺：後で連鎖爆発 */
          } else if (it.contents?.length > 0) {
            const ft2 = new Set();
            for (const ci of it.contents) placeItemAt(dg, ax, ay, ci, ml, ft2);
            ml.push(`壺「${nameFn ? nameFn(it) : it.name}」が爆発で割れ、中身が飛び出した！`);
          } else { ml.push(`壺「${nameFn ? nameFn(it) : it.name}」が爆発で割れた！`); }
        }
      }
    }
  }
  /* 爆発範囲内の大箱を破壊 */
  const _blastedBB = [];
  for (let ddx = -1; ddx <= 1; ddx++) {
    for (let ddy = -1; ddy <= 1; ddy++) {
      const ax = cx + ddx, ay = cy + ddy;
      if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
      const _hitBBs = (dg.bigboxes || []).filter(b => b.x === ax && b.y === ay);
      for (const _hbb of _hitBBs) {
        if (_blastedBB.includes(_hbb)) continue;
        _blastedBB.push(_hbb);
        ml.push(`${_hbb.name}が爆発で壊れた！`);
        const ft = new Set();
        for (const ci of (_hbb.contents || [])) placeItemAt(dg, _hbb.x, _hbb.y, ci, ml, ft);
      }
    }
  }
  if (_blastedBB.length > 0) dg.bigboxes = dg.bigboxes.filter(b => !_blastedBB.includes(b));
  if (blasted.size > 0) dg.items = dg.items.filter(it => !blasted.has(it));
  dg.monsters = dg.monsters.filter(m => m.hp > 0);
  /* 破壊された火薬壺の連鎖爆発 */
  for (const _gp of [...blasted].filter(it => it.type === "pot" && it.potEffect === "gunpowder")) {
    doGunpowderExplosion(_gp.x, _gp.y, dg, p, ml, luFn, _gp.name);
  }
  /* 地雷モード：範囲内の他の地雷・時限爆弾を連鎖爆発 */
  if (mineExplosion) {
    const _chainMines = (dg.traps || []).filter(t =>
      t.effect === "explode" &&
      Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= 1
    );
    if (_chainMines.length > 0) {
      dg.traps = dg.traps.filter(t => !_chainMines.includes(t));
      for (const _cm of _chainMines) {
        doExplosion(_cm.x, _cm.y, dg, p, ml, nameFn, _cm.name, null, luFn, true, false, true);
      }
    }
    /* 範囲内の時限爆弾トラップを即爆発 */
    const _chainTimeBombs = (dg.traps || []).filter(t =>
      t.effect === "time_bomb" &&
      Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= 1
    );
    if (_chainTimeBombs.length > 0) {
      dg.traps = dg.traps.filter(t => !_chainTimeBombs.includes(t));
      for (const _ctb of _chainTimeBombs) {
        ml.push(`${_ctb.name}が誘爆した！`);
        doTimeBombExplosion(_ctb.x, _ctb.y, dg, p, ml, luFn, nameFn);
      }
    }
    /* 範囲内のpendingBombs（作動済み時限爆弾）も即爆発 */
    if (dg.pendingBombs?.length > 0) {
      const _chainPending = dg.pendingBombs.filter(pb =>
        Math.max(Math.abs(pb.x - cx), Math.abs(pb.y - cy)) <= 1
      );
      if (_chainPending.length > 0) {
        dg.pendingBombs = dg.pendingBombs.filter(pb => !_chainPending.includes(pb));
        for (const _cpb of _chainPending) {
          ml.push(`時限爆弾の罠が誘爆した！`);
          doTimeBombExplosion(_cpb.x, _cpb.y, dg, p, ml, luFn, nameFn);
        }
      }
    }
    _mineExplosionDepth--;
  }
}

/** 火薬壺の爆発処理。中心＋周囲8マスを対象にする。連鎖爆発あり。 */
let _gunpowderDepth = 0;
export function doGunpowderExplosion(cx, cy, dg, p, ml, luFn, srcLabel = "火薬壺") {
  if (_gunpowderDepth > 5) return;
  if (hasCursedExplosionPentacle(dg)) { ml.push(`呪われた爆発の魔方陣が${srcLabel}の爆発を打ち消した！`); return; }
  _gunpowderDepth++;
  try {
    pushExplosionAnim(cx, cy);
    ml.push(`${srcLabel}が爆発した！周囲8マスに爆風！`);
    for (let ddx = -1; ddx <= 1; ddx++) {
      for (let ddy = -1; ddy <= 1; ddy++) {
        const ax = cx + ddx, ay = cy + ddy;
        if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
        /* 壁の破壊 */
        if ((dg.map[ay][ax] === T.BWALL || dg.map[ay][ax] === T.WALL) &&
            ax > 0 && ax < MW - 1 && ay > 0 && ay < MH - 1) {
          const _wi = dg.items.find(i => i.x === ax && i.y === ay && i.wallEmbedded);
          if (_wi) { delete _wi.wallEmbedded; _wi.discovered = true; }
          dg.map[ay][ax] = T.FLOOR;
          if (dg.explored?.[ay]?.[ax] !== undefined) dg.explored[ay][ax] = true;
          if (dg.visible?.[ay]?.[ax] !== undefined) dg.visible[ay][ax] = true;
          ml.push("爆風で壁が崩れた！");
          wallBreakDrop(dg, ax, ay);
          continue;
        }
        /* プレイヤー：現HPの3/4ダメージ＋炎アイテム損傷 */
        if (p && p.x === ax && p.y === ay) {
          const _hasFireR = hasAbility(p.armor, "fire_resist");
          const rawDmg = Math.max(1, Math.floor(p.hp * 3 / 4));
          const dmg = _hasFireR ? Math.floor(rawDmg / 2) : rawDmg;
          p.deathCause = `${srcLabel}の爆発により`;
          p.hp -= dmg;
          ml.push(`${srcLabel}の爆発を受けた！${dmg}ダメージ！${_hasFireR ? "(耐火半減)" : ""}`);
          if (!_hasFireR) applyLightningToInventory(p, dg, ml, luFn, null, true);
        }
        /* モンスター：即死（火ダルマは分裂、ボスは現在HPの4分の1ダメージ） */
        for (const m of [...dg.monsters]) {
          if (m.x === ax && m.y === ay) {
            if (m.baseKind === "firedemon") {
              ml.push(`${srcLabel}の爆発で${m.name}が分裂した！`);
              const _fd8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
              for (const [_sx, _sy] of _fd8) {
                const _nx = m.x + _sx, _ny = m.y + _sy;
                if (_nx < 0 || _nx >= MW || _ny < 0 || _ny >= MH) continue;
                if (dg.map[_ny][_nx] === T.WALL || dg.map[_ny][_nx] === T.BWALL) continue;
                if (dg.monsters.some(o => o.x === _nx && o.y === _ny)) continue;
                if (p && _nx === p.x && _ny === p.y) continue;
                dg.monsters.push({ ...m, id: uid(), x: _nx, y: _ny, hp: m.hp, turnAccum: 0, aware: true });
                break;
              }
              continue;
            }
            if (m.isBoss) {
              const _bd = Math.max(1, Math.floor(m.hp / 4));
              m.hp -= _bd;
              ml.push(`${srcLabel}の爆発で${m.name}は${_bd}ダメージ！`);
              if (m.hp <= 0) killMonster(m, dg, p, ml, luFn);
              continue;
            }
            ml.push(`${srcLabel}の爆発で${m.name}は消し飛んだ！`);
            m.hp = 0;
            killMonster(m, dg, p, ml, luFn);
          }
        }
      }
    }
    /* 範囲内の床上アイテムへの爆発ダメージ（火薬壺以外） */
    const _blasted = new Set();
    for (const it of dg.items) {
      if (Math.max(Math.abs(it.x - cx), Math.abs(it.y - cy)) > 1) continue;
      if (it.type === "pot" && it.potEffect === "gunpowder") continue; /* 火薬壺は後で連鎖処理 */
      if (it.type === "scroll" || it.type === "spellbook") {
        _blasted.add(it); ml.push(`巻物「${it.name}」が爆風で燃えてなくなった！`);
      } else if (it.type === "potion") {
        _blasted.add(it); ml.push(`薬「${it.name}」が爆風で割れてなくなった！`);
      } else if (it.type === "food") {
        if (!it.cooked) { it.value *= 2; cookFoodMeta(it); it.name = "焼いた" + it.name; ml.push(`${it.name}になった！`); }
        else { burnFoodItem(it, ml); _blasted.add(it); }
      } else if (it.type === "pot") {
        _blasted.add(it);
        if (it.contents?.length > 0) {
          const _ft2 = new Set();
          for (const ci of it.contents) placeItemAt(dg, it.x, it.y, ci, ml, _ft2);
          ml.push(`壺「${it.name}」が爆発で割れ、中身が飛び出した！`);
        } else { ml.push(`壺「${it.name}」が爆発で割れた！`); }
      }
    }
    if (_blasted.size > 0) dg.items = dg.items.filter(i => !_blasted.has(i));
    /* 範囲内の大箱を破壊 */
    const _gpBlastedBB = [];
    for (let _gbbdx = -1; _gbbdx <= 1; _gbbdx++) {
      for (let _gbbdy = -1; _gbbdy <= 1; _gbbdy++) {
        const _gbax = cx + _gbbdx, _gbay = cy + _gbbdy;
        if (_gbax < 0 || _gbax >= MW || _gbay < 0 || _gbay >= MH) continue;
        const _hitBBs = (dg.bigboxes || []).filter(b => b.x === _gbax && b.y === _gbay);
        for (const _hbb of _hitBBs) {
          if (_gpBlastedBB.includes(_hbb)) continue;
          _gpBlastedBB.push(_hbb);
          ml.push(`${_hbb.name}が爆発で壊れた！`);
          const _gpft = new Set();
          for (const ci of (_hbb.contents || [])) placeItemAt(dg, _hbb.x, _hbb.y, ci, ml, _gpft);
        }
      }
    }
    if (_gpBlastedBB.length > 0) dg.bigboxes = dg.bigboxes.filter(b => !_gpBlastedBB.includes(b));
    /* 範囲内の床上 火薬壺 を先に除去してから連鎖爆発 */
    const _chainPots = dg.items.filter(it =>
      it.type === "pot" && it.potEffect === "gunpowder" &&
      Math.max(Math.abs(it.x - cx), Math.abs(it.y - cy)) <= 1
    );
    if (_chainPots.length > 0) {
      dg.items = dg.items.filter(i => !_chainPots.includes(i));
      for (const _gp of _chainPots) doGunpowderExplosion(_gp.x, _gp.y, dg, p, ml, luFn, _gp.name);
    }
  } finally {
    _gunpowderDepth--;
  }
}

/**
 * 時限爆弾の罠の大爆発処理。
 * 中心から半径2マス（5×5=25マス）を対象にする。
 * 炎無効(火ダルマ)以外の敵は消滅。プレイヤーはHPが1になり炎アイテム損傷。
 * 地雷・火薬壺を連鎖爆発させる。
 */
export function doTimeBombExplosion(cx, cy, dg, p, ml, luFn, nameFn = null) {
  const R = 2;
  pushExplosionAnim(cx, cy);
  ml.push(`時限爆弾の罠が大爆発した！5×5マスに爆風が吹き荒れる！`);
  const blasted = new Set();
  const _killed = new Set();
  for (let ddx = -R; ddx <= R; ddx++) {
    for (let ddy = -R; ddy <= R; ddy++) {
      const ax = cx + ddx, ay = cy + ddy;
      if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
      /* 壁の破壊 */
      if ((dg.map[ay][ax] === T.BWALL || dg.map[ay][ax] === T.WALL) &&
          ax > 0 && ax < MW - 1 && ay > 0 && ay < MH - 1) {
        const _wi = dg.items.find(i => i.x === ax && i.y === ay && i.wallEmbedded);
        if (_wi) { delete _wi.wallEmbedded; _wi.discovered = true; }
        dg.map[ay][ax] = T.FLOOR;
        if (dg.explored?.[ay]?.[ax] !== undefined) dg.explored[ay][ax] = true;
        if (dg.visible?.[ay]?.[ax] !== undefined) dg.visible[ay][ax] = true;
        ml.push("爆風で壁が崩れた！");
        wallBreakDrop(dg, ax, ay);
        continue;
      }
      /* プレイヤー：HPが1になる＋炎アイテム損傷（耐火時は半減ダメージのみ） */
      if (p && p.x === ax && p.y === ay) {
        const _hasFireR = hasAbility(p.armor, "fire_resist");
        p.deathCause = "時限爆弾の罠の大爆発により";
        if (_hasFireR) {
          const dmg = Math.max(1, Math.floor(p.hp / 2));
          p.hp -= dmg;
          ml.push(`大爆発！${dmg}ダメージ！(耐火半減)`);
        } else {
          p.hp = 1;
          ml.push(`大爆発！HPが1になった！`);
          applyLightningToInventory(p, dg, ml, luFn, nameFn, true);
        }
      }
      /* モンスター：炎無効(火ダルマ)以外は消滅（ボスは現在HPの4分の1ダメージ） */
      for (const m of [...dg.monsters.filter(mm => mm.x === ax && mm.y === ay)]) {
        if (_killed.has(m)) continue;
        wakeIfDormant(m, ml);
        if (m.baseKind === "firedemon") {
          ml.push(`${m.name}が爆発を受けて分裂した！`);
          const _sd8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
          for (const [_sx, _sy] of _sd8) {
            const _nx = ax + _sx, _ny = ay + _sy;
            if (_nx < 0 || _nx >= MW || _ny < 0 || _ny >= MH) continue;
            if (dg.map[_ny][_nx] === T.WALL || dg.map[_ny][_nx] === T.BWALL) continue;
            if (dg.monsters.some(o => o.x === _nx && o.y === _ny)) continue;
            if (p && _nx === p.x && _ny === p.y) continue;
            dg.monsters.push({ ...m, id: uid(), x: _nx, y: _ny, hp: m.hp, turnAccum: 0, aware: true });
            break;
          }
          continue;
        }
        if (m.isBoss) {
          const _bd = Math.max(1, Math.floor(m.hp / 4));
          m.hp -= _bd;
          ml.push(`爆発で${m.name}は${_bd}ダメージ！`);
          if (m.hp <= 0) { _killed.add(m); killMonster(m, dg, p, ml, luFn); }
          continue;
        }
        m.hp = 0;
        _killed.add(m);
        killMonster(m, dg, p, ml, luFn);
      }
      /* アイテム破壊 */
      for (const it of dg.items.filter(i => i.x === ax && i.y === ay)) {
        if (it.type === "pot" && it.potEffect === "gunpowder") continue; /* 後で連鎖 */
        if (it.type === "scroll") {
          blasted.add(it); ml.push(`巻物「${nameFn ? nameFn(it) : it.name}」が燃えてなくなった！`);
        } else if (it.type === "spellbook") {
          blasted.add(it); ml.push(`魔法書「${nameFn ? nameFn(it) : it.name}」が燃えてなくなった！`);
        } else if (it.type === "potion") {
          blasted.add(it); ml.push(`薬「${nameFn ? nameFn(it) : it.name}」が割れてなくなった！`);
        } else if (it.type === "food") {
          if (!it.cooked) { it.value *= 2; cookFoodMeta(it); it.name = "焼いた" + it.name; ml.push(`${it.name}になった！`); }
          else { burnFoodItem(it, ml); blasted.add(it); }
        } else if (it.type === "pot") {
          blasted.add(it);
          if (it.contents?.length > 0) {
            const ft2 = new Set();
            for (const ci of it.contents) placeItemAt(dg, ax, ay, ci, ml, ft2);
            ml.push(`壺「${nameFn ? nameFn(it) : it.name}」が爆発で割れ、中身が飛び出した！`);
          } else { ml.push(`壺「${nameFn ? nameFn(it) : it.name}」が爆発で割れた！`); }
        }
      }
    }
  }
  if (blasted.size > 0) dg.items = dg.items.filter(i => !blasted.has(i));
  dg.monsters = dg.monsters.filter(m => m.hp > 0);
  /* 範囲内の地雷を連鎖爆発 */
  const _chainMines = (dg.traps || []).filter(t =>
    t.effect === "explode" && Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= R
  );
  if (_chainMines.length > 0) {
    dg.traps = dg.traps.filter(t => !_chainMines.includes(t));
    for (const _cm of _chainMines) {
      doExplosion(_cm.x, _cm.y, dg, p, ml, nameFn, _cm.name, null, luFn, true, false, true);
    }
  }
  /* 範囲内の火薬壺を連鎖爆発 */
  const _chainPots = dg.items.filter(it =>
    it.type === "pot" && it.potEffect === "gunpowder" &&
    Math.max(Math.abs(it.x - cx), Math.abs(it.y - cy)) <= R
  );
  if (_chainPots.length > 0) {
    dg.items = dg.items.filter(i => !_chainPots.includes(i));
    for (const _gp of _chainPots) doGunpowderExplosion(_gp.x, _gp.y, dg, p, ml, luFn, _gp.name);
  }
}

/** 壁破壊時の石ドロップ共通処理。方法を問わず 10%で石、1%で魔法の石 */
export function wallBreakDrop(dg, x, y) {
  const r = Math.random();
  let drop = null;
  if (r < 0.01) drop = makeMagicStone(1);
  else if (r < 0.11) drop = makeStone(1);
  if (!drop) return;
  drop.x = x; drop.y = y;
  dg.items.push(drop);
}

let _fireTrapDepth = 0;
export function fireTrapItem(trap, item, dg, tx, ty, ml, ft, p = null, nameFn = null, luFn = null) {
  if (_fireTrapDepth > 5) return "stop";
  _fireTrapDepth++;
  try {
  switch (trap.effect) {
    case "explode": {
      ml.push(`${trap.name}が発動！${nameFn ? nameFn(item) : item.name}は爆発で消し飛んだ！`);
      dg.traps = dg.traps.filter(t => t !== trap);
      doExplosion(tx, ty, dg, p, ml, nameFn, trap.name, item, luFn, true, false, true);
      return "destroyed";
    }
    case "pitfall": {
      const _pfm = monsterAt(dg, tx, ty);
      if (_pfm) {
        if (_pfm.isBoss) {
          /* ボス：落とし穴は無効、現在HPの4分の1ダメージ */
          const _bd = Math.max(1, Math.floor(_pfm.hp / 4));
          _pfm.hp -= _bd;
          ml.push(`${_pfm.name}は落とし穴をものともしなかった！${_bd}ダメージ！`);
          if (_pfm.hp <= 0) killMonster(_pfm, dg, p, ml, luFn);
        } else {
          removeMonster(dg, _pfm);
          if (_pitfallBag) {
            _pitfallBag.push({ kind: 'monster', entity: _pfm });
            ml.push(`${_pfm.name}も穴に落ちて次の階へ落下した！`);
          } else {
            ml.push(`${_pfm.name}も穴に落ちて消えた！`);
          }
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
          if (hasAbility(_peq, "no_degrade")) {
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
      if (dg.rooms?.length) {
        const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
        const nx = rng(rm.x, rm.x + rm.w - 1);
        const ny = rng(rm.y, rm.y + rm.h - 1);
        placeItemAt(dg, nx, ny, item, ml, ft);
        const _spinTpBlock = hasCursedTeleportPentacle(dg);
        const _spm = monsterAt(dg, tx, ty);
        if (_spm) {
          if (_spinTpBlock) { ml.push(`呪われたテレポートの魔方陣に阻まれて${_spm.name}は吹き飛ばなかった！`); }
          else {
            const _spr = dg.rooms[rng(0, dg.rooms.length - 1)];
            _spm.x = rng(_spr.x, _spr.x + _spr.w - 1);
            _spm.y = rng(_spr.y, _spr.y + _spr.h - 1);
            ml.push(`${_spm.name}も吹き飛ばされた！`);
          }
        }
        if (p && p.x === tx && p.y === ty) {
          if (_spinTpBlock) { ml.push("呪われたテレポートの魔方陣に阻まれて吹き飛ばなかった！"); }
          else {
            const _psr = dg.rooms[rng(0, dg.rooms.length - 1)];
            p.x = rng(_psr.x, _psr.x + _psr.w - 1);
            p.y = rng(_psr.y, _psr.y + _psr.h - 1);
            ml.push(`吹き飛ばされた！`);
            if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("吹き飛ばされて移動封じが解けた！"); }
          }
        }
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
          if (hasRingEffect(p, "antidote_ring")) {
            ml.push(`毒矢が命中！${d}ダメージ！しかし指輪が毒を消した！`);
          } else {
            p.poisoned = true;
            ml.push(`毒矢が命中！${d}ダメージ！毒を受けた！`);
          }
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
      const _sumSpawned = spawnMonsters(dg, _sumCount, _sumDepth - 1, tx, ty, p, { aware: true, immediateAct: true });
      ml.push(`${_sumSpawned}体の敵が現れた！`);
      return "restart";
    }
    case "slow_trap": {
      ml.push(`${trap.name}が発動！`);
      const _slwm = monsterAt(dg, tx, ty);
      if (_slwm) { _slwm.speed = Math.max(0.25, _slwm.speed * 0.5); ml.push(`${_slwm.name}が鈍足になった！`); }
      if (p && p.x === tx && p.y === ty) {
        if (hasAbility(p.armor, "slow_proof")) { ml.push(`しかし防具が鈍足を防いだ！(耐鈍足)`); }
        else { p.slowTurns = (p.slowTurns || 0) + 10; ml.push(`体が重くなった...(鈍足10ターン)`); }
      }
      return "restart";
    }
    case "seal_trap": {
      ml.push(`${trap.name}が発動！`);
      const _seam = monsterAt(dg, tx, ty);
      if (_seam) { _seam.sealed = true; ml.push(`${_seam.name}の特技が封印された！`); }
      if (p && p.x === tx && p.y === ty) {
        if (hasAbility(p.armor, "seal_proof")) { ml.push(`しかし防具が封印を防いだ！(耐封印)`); }
        else { p.sealedTurns = (p.sealedTurns || 0) + 50; ml.push(`魔法が封印された！(50ターン)`); }
      }
      return "restart";
    }
    case "steal_trap": {
      ml.push(`${trap.name}が発動！`);
      const _stm = monsterAt(dg, tx, ty);
      if (_stm) {
        const _stNewItem = { ...pick(ITEMS.filter(i => i.type !== 'gold')), id: uid() };
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
    case "shadow_stitch": {
      ml.push(`${trap.name}が発動！`);
      const _ssm = monsterAt(dg, tx, ty);
      if (_ssm) { _ssm.immobileTurns = (_ssm.immobileTurns || 0) + 5; ml.push(`${_ssm.name}が影に縫い付けられ動けなくなった！(5ターン移動封じ)`); }
      if (p && p.x === tx && p.y === ty) {
        p.immobileTurns = (p.immobileTurns || 0) + 5;
        ml.push(`影に縫い付けられた！(5ターン移動不能)`);
      }
      return "restart";
    }
    case "rockfall": {
      ml.push(`${trap.name}が発動！岩が降ってきた！`);
      const _rfm = monsterAt(dg, tx, ty);
      if (_rfm) {
        const _rfd2 = rng(15, 25);
        _rfm.hp -= _rfd2;
        ml.push(`${_rfm.name}に岩が命中！${_rfd2}ダメージ！`);
        if (_rfm.hp <= 0) { monsterDrop(_rfm, dg, ml, p); removeMonster(dg, _rfm); }
      }
      if (p && p.x === tx && p.y === ty) {
        const _rfd3 = rng(15, 25);
        p.deathCause = `${trap.name}により`;
        p.hp -= _rfd3;
        ml.push(`${_rfd3}ダメージ！`);
      }
      return "restart";
    }
    case "time_bomb": {
      /* アイテムが時限爆弾を作動させる：トラップ除去してpendingBombsへ */
      dg.traps = dg.traps.filter(t => t !== trap);
      dg.pendingBombs = dg.pendingBombs || [];
      dg.pendingBombs.push({ x: trap.x, y: trap.y, turnsLeft: 4, nameFn });
      ml.push(`${trap.name}が発動！4ターン後に大爆発が起きる！`);
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
        else if (_pHitMon) { p.hp -= 10; _pHitMon.hp -= 10; ml.push(`${_pHitMon.name}に激突！お互いに10ダメージ！`); dg.monsters = dg.monsters.filter(m => m.hp > 0); }
        else if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("吹き飛ばされて移動封じが解けた！"); }
      }
      return "restart";
    }
    case "bewitch_trap": {
      ml.push(`${trap.name}が発動！`);
      const _bwtm = monsterAt(dg, tx, ty);
      if (_bwtm) { _bwtm.fleeingTurns = (_bwtm.fleeingTurns || 0) + 50; ml.push(`${_bwtm.name}が幻惑された！(50ターン)`); }
      if (p && p.x === tx && p.y === ty) {
        if (hasAbility(p.armor, "bewitch_proof")) { ml.push("しかし防具が幻惑を防いだ！(耐惑わし)"); }
        else { p.bewitchedTurns = (p.bewitchedTurns || 0) + 50; ml.push("幻惑された！周囲の見た目がおかしくなった！(50ターン)"); }
      }
      return "restart";
    }
    case "darkness_trap": {
      ml.push(`${trap.name}が発動！`);
      const _dktm = monsterAt(dg, tx, ty);
      if (_dktm) { _dktm.darknessTurns = (_dktm.darknessTurns || 0) + 20; _dktm.darkDir = null; _dktm.aware = false; ml.push(`${_dktm.name}が暗闇に包まれた！(20ターン)`); }
      if (p && p.x === tx && p.y === ty) {
        if (hasAbility(p.armor, "darkness_proof")) { ml.push("しかし防具が暗闇を防いだ！(耐暗闇)"); }
        else { p.darknessTurns = (p.darknessTurns || 0) + 20; ml.push("暗闇に包まれた！視界が1マスになる！(20ターン)"); }
      }
      return "restart";
    }
    case "rot_trap": {
      ml.push(`${trap.name}が発動！`);
      /* 踏んだアイテム自体が食料なら腐らせる */
      if (item && item.type === "food" && !item.rotten) {
        const _itOrigName = item.name;
        rotFood(item);
        ml.push(`${_itOrigName}が腐ってしまった！`);
      }
      const _rtm = monsterAt(dg, tx, ty);
      if (_rtm) {
        dg.monsters = dg.monsters.filter(m => m !== _rtm);
        const _rotFoodItem = { ...genFood(), id: uid() };
        rotFood(_rotFoodItem);
        /* 罠と重ならないよう空きマスに配置（DROで中心を除いた広域探索） */
        let _rfx = tx, _rfy = ty;
        for (const [_rdx, _rdy] of DRO) {
          if (_rdx === 0 && _rdy === 0) continue;
          const _cx = tx + _rdx, _cy = ty + _rdy;
          if (_cx < 0 || _cx >= MW || _cy < 0 || _cy >= MH) continue;
          if (dg.map[_cy][_cx] === T.WALL || dg.map[_cy][_cx] === T.BWALL) continue;
          if (dg.items.some(i => i.x === _cx && i.y === _cy)) continue;
          if (dg.traps.some(t => t.x === _cx && t.y === _cy)) continue;
          _rfx = _cx; _rfy = _cy; break;
        }
        _rotFoodItem.x = _rfx; _rotFoodItem.y = _rfy;
        dg.items.push(_rotFoodItem);
        ml.push(`${_rtm.name}が腐敗に飲み込まれ${_rotFoodItem.name}に変わった！`);
      }
      if (p && p.x === tx && p.y === ty && p.inventory) {
        const _rFoods = p.inventory.filter(i => i.type === "food" && !i.rotten);
        if (_rFoods.length > 0) {
          const _rTarget = _rFoods[rng(0, _rFoods.length - 1)];
          const _rOrigName = _rTarget.name;
          rotFood(_rTarget);
          ml.push(`${_rOrigName}が腐ってしまった！`);
        } else {
          ml.push("腐らせるものがなかった。");
        }
      }
      return "restart";
    }
    case "bone": {
      /* 吹き飛ばした骨が何かにぶつかった時のダメージ */
      const _boneM = monsterAt(dg, tx, ty);
      if (_boneM) {
        const _boneDmg = rng(5, 12);
        _boneM.hp -= _boneDmg;
        ml.push(`骨が${_boneM.name}に激突！${_boneDmg}ダメージ！`);
        if (_boneM.hp <= 0) killMonster(_boneM, dg, p, ml, luFn);
      } else if (p && p.x === tx && p.y === ty) {
        const _boneDmg = rng(5, 12);
        p.deathCause = "飛んできた骨に激突して";
        p.hp -= _boneDmg;
        ml.push(`骨が自分に激突！${_boneDmg}ダメージ！`);
      }
      dg.traps = dg.traps.filter(t => t !== trap);
      return "destroyed";
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

export function makeStone(c = 1) {
  return { ...STONE_T, id:uid(), count:Math.min(99, c) };
}

export function makeBombArrow(c = 1) {
  return { ...BOMB_ARROW_T, id:uid(), count:Math.min(99, c) };
}

export function makeMagicStone(c = 1) {
  return { ...MAGIC_STONE_T, id:uid(), count:Math.min(99, c) };
}

export function addStonesInv(inv, c, isMagic = false, maxInv = 30) {
  let r = c;
  for (const i of inv) {
    if (i.type === "arrow" && !!i.stone === !isMagic && !!i.magicStone === isMagic && i.count < 99) {
      const a = Math.min(r, 99 - i.count);
      i.count += a;
      r -= a;
      if (r <= 0) return true;
    }
  }
  while (r > 0) {
    if (inv.length >= maxInv) return false;
    const n = Math.min(r, 99);
    inv.push(isMagic ? makeMagicStone(n) : makeStone(n));
    r -= n;
  }
  return true;
}

export function addArrowsInv(inv, c, poison = false, pierce = false, maxInv = 30, bomb = false) {
  let r = c;
  for (const i of inv) {
    if (i.type === "arrow" && !i.stone && !i.magicStone && !!i.poison === poison && !!i.pierce === pierce && !!i.bombArrow === bomb && i.count < 99) {
      const a = Math.min(r, 99 - i.count);
      i.count += a;
      r -= a;
      if (r <= 0) return true;
    }
  }
  while (r > 0) {
    if (inv.length >= maxInv) return false;
    const n = Math.min(r, 99);
    inv.push(bomb ? makeBombArrow(n) : pierce ? makePiercingArrow(n) : poison ? makePoisonArrow(n) : makeArrow(n));
    r -= n;
  }
  return true;
}

export function applyPotionEffect(eff, val, kind, target, dg, p, ml, luFn, blessed = false, cursed = false) {
  if (kind === "monster") wakeIfDormant(target, ml);
  const _monKill = (mon) => {
    if (mon.hp <= 0) killMonster(mon, dg, p, ml, luFn);
  };
  const _fireResist = (pl) =>
    hasAbility(pl.armor, "fire_resist");
  switch (eff) {
    case "water": // 水は通常のhealと同じ挙動
    case "heal":
      if (cursed) {
        // 反転→ダメージ
        const d = Math.max(1, Math.round(val * 0.7));
        if (kind === "monster") { if (!consumeBarrier(target, ml)) { target.hp -= d; ml.push(`${target.name}は変な薬を浴びた！${d}ダメージ！`); _monKill(target); } }
        if (kind === "player") { p.deathCause = "呪われた回復薬の飛散により"; p.hp -= d; ml.push(`変な薬を浴びた！${d}ダメージ！【呪】`); }
      } else {
        const _mult = blessed ? 1.5 : 1;
        if (kind === "monster") {
          if (target.kind === "undead") {
            const _ud = Math.max(1, Math.round(val * _mult));
            target.hp -= _ud; ml.push(`${target.name}はアンデッドのため${_ud}ダメージを受けた！`); _monKill(target);
          } else {
            const h = Math.min(Math.round(val * _mult), target.maxHp - target.hp);
            if (h > 0) { target.hp += h; ml.push(`${target.name}のHPが${h}回復した！`); pushHealAnim(target.x, target.y); }
            else if (eff === "heal") { const _up = Math.round(val / 30) * (blessed ? 2 : 1); target.maxHp += _up; target.hp += _up; ml.push(`${target.name}のHP最大値が${_up}上昇した！`); pushHealAnim(target.x, target.y); }
          }
        }
        if (kind === "player") {
          const h = Math.min(Math.round(val * _mult), p.maxHp - p.hp);
          if (h > 0) { p.hp += h; ml.push(`HPが${h}回復した！${blessed ? "(祝福)" : ""}`); pushHealAnim(p.x, p.y); }
          else if (eff === "heal") { const _up = Math.round(val / 30) * (blessed ? 2 : 1); p.maxHp += _up; p.hp += _up; ml.push(`HPが満タンだったのでHP最大値が${_up}上昇した！${blessed ? "(祝福)" : ""}`); pushHealAnim(p.x, p.y); }
        }
      }
      break;
    case "superheal": {
      const _shMult = blessed ? 2 : 1;
      if (cursed) {
        // 呪い：回復するはずだった量の半分のダメージ
        const _shd = Math.max(1, Math.round(val * 0.5));
        if (kind === "monster") { target.hp -= _shd; ml.push(`${target.name}は変な薬を浴びた！${_shd}ダメージ！`); _monKill(target); }
        if (kind === "player") { p.deathCause = "呪われた超回復薬の飛散により"; p.hp -= _shd; ml.push(`変な薬を浴びた！${_shd}ダメージ！【呪】`); }
      } else if (kind === "monster") {
        if (target.kind === "undead") {
          const _shUd = Math.max(1, Math.round(val * _shMult));
          target.hp -= _shUd; ml.push(`${target.name}はアンデッドのため${_shUd}ダメージを受けた！`); _monKill(target);
        } else {
          const _shHeal = Math.round(val * _shMult);
          const _shh = Math.min(_shHeal, target.maxHp - target.hp);
          if (_shh > 0) { target.hp += _shh; ml.push(`${target.name}のHPが${_shh}回復した！${blessed ? "(祝福)" : ""}`); pushHealAnim(target.x, target.y); }
          else { const _shUp = blessed ? 6 : 3; target.maxHp += _shUp; target.hp += _shUp; ml.push(`${target.name}のHP最大値が${_shUp}上昇した！`); pushHealAnim(target.x, target.y); }
        }
      } else if (kind === "player") {
        const _shHeal = Math.round(val * _shMult);
        const _shh = Math.min(_shHeal, p.maxHp - p.hp);
        if (_shh > 0) { p.hp += _shh; ml.push(`HPが${_shh}回復した！${blessed ? "(祝福)" : ""}`); pushHealAnim(p.x, p.y); }
        else { const _shUp = blessed ? 6 : 3; p.maxHp += _shUp; p.hp += _shUp; ml.push(`HPが満タンだったのでHP最大値が${_shUp}上昇した！${blessed ? "(祝福)" : ""}`); pushHealAnim(p.x, p.y); }
      }
      break;
    }
    case "poison": {
      if (kind === "monster") {
        if (cursed) {
          // 反転→モンスター回復（アンデッドはさらに反転してダメージ）
          const _ph = Math.max(1, Math.round(val * 0.5));
          if (target.kind === "undead") {
            target.hp -= _ph; ml.push(`${target.name}はアンデッドのため${_ph}ダメージを受けた！`); _monKill(target);
          } else {
            const h = Math.min(_ph, target.maxHp - target.hp);
            if (h > 0) { target.hp += h; ml.push(`${target.name}は変な薬で回復した！${h}HP`); }
          }
        } else {
          const dmg = Math.max(1, Math.round((val + rng(-3, 3)) * (blessed ? 1.5 : 1)));
          target.hp -= dmg;
          const _poisonTurns = blessed ? 8 : 5;
          const _poisonDmg = blessed ? 4 : 3;
          target.poisonedTurns = Math.max(target.poisonedTurns || 0, _poisonTurns);
          target.poisonDmg = Math.max(target.poisonDmg || 0, _poisonDmg);
          ml.push(`${target.name}は毒を浴びた！${dmg}ダメージ！毒状態になった！${blessed ? "(強毒)" : ""}`);
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
        } else if (hasRingEffect(p, "antidote_ring")) {
          ml.push("毒を浴びたが指輪が毒を消した！");
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
      /* 呪われた爆発の魔方陣：炎を不発にする */
      if (!cursed && hasCursedExplosionPentacle(dg)) {
        ml.push("呪われた爆発の魔方陣が炎を打ち消した！");
        break;
      }
      if (cursed) {
        // 反転→回復
        if (kind === "monster") { const h = Math.min(Math.round(val * 0.5), target.maxHp - target.hp); if (h > 0) { target.hp += h; ml.push(`${target.name}は炎の薬で温まった！${h}HP回復`); } }
        if (kind === "player") { const h = Math.min(val, p.maxHp - p.hp); p.hp += h; ml.push(`体が温まりHP+${h}回復した！【呪→回復】`); }
      } else {
        const dmg = val + rng(-5, 5);
        const _oilyCheck = (char) => (char.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === char.x && t.y === char.y);
        if (kind === "monster") {
          /* 火ダルマは炎で回復 */
          if (target.baseKind === "firedemon") {
            const _fheal = Math.min(Math.round(dmg * (blessed ? 1.5 : 1)), target.maxHp - target.hp);
            if (_fheal > 0) { target.hp += _fheal; ml.push(`炎を受けた${target.name}が回復した！(+${_fheal}HP)`); }
            else ml.push(`${target.name}は炎を吸収した！`);
            break;
          }
          const _oilyMult = _oilyCheck(target) ? 2 : 1;
          const d = Math.max(1, Math.round(dmg * (blessed ? 1.5 : 1) * _oilyMult));
          target.hp -= d;
          ml.push(`${target.name}は炎に包まれた！${d}ダメージ！${blessed ? "(強炎)" : ""}${_oilyMult > 1 ? "(油まみれ×2)" : ""}`);
          _monKill(target);
        }
        if (kind === "player") {
          const _oilyMult = _oilyCheck(p) ? 2 : 1;
          const rd = Math.max(1, Math.round(dmg * (blessed ? 1.5 : 1) * _oilyMult));
          const fd = _fireResist(p) ? Math.floor(rd / 2) : rd;
          p.deathCause = "炎の薬の飛散により";
          p.hp -= fd;
          ml.push(`炎に包まれた！${fd}ダメージ！${_fireResist(p) ? "(耐火)" : ""}${blessed ? "(強炎)" : ""}${_oilyMult > 1 ? "(油まみれ×2)" : ""}`);
          applyLightningToInventory(p, dg, ml, luFn, null, true);
        }
      }
      break;
    }
    case "sleep": {
      if (cursed) {
        // 反転→覚醒（モンスター）/ フロア中全敵透視（プレイヤー）
        if (kind === "monster") { target.sleepTurns = 0; ml.push(`${target.name}が目を覚ました！(覚醒)`); }
        if (kind === "player") { dg.monsterSenseActive = true; ml.push("幻覚が見える...フロアの敵が全て見え続ける！【呪→透視】"); }
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
        if (kind === "monster") { if (target.isBoss && target._preSlowSpeed === undefined) target._preSlowSpeed = target.speed; target.speed = Math.max(0.25, target.speed * (blessed ? 0.25 : 0.5)); if (target.isBoss) target.bossSlowTurns = (target.bossSlowTurns || 0) + 10; ml.push(`${target.name}は鈍足になった！${blessed ? "(強鈍足)" : ""}`); }
        if (kind === "player") {
          if (hasAbility(p.armor, "slow_proof")) { ml.push("鈍足効果を受けたが防具が防いだ！(耐鈍足)"); }
          else { const _st = blessed ? 20 : 10; p.slowTurns = (p.slowTurns || 0) + _st; ml.push(`体が重くなった...(鈍足${_st}ターン)${blessed ? "(強鈍足)" : ""}`); }
        }
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
          if (target.isBoss) target.paralyzeTurns = Math.max(target.paralyzeTurns||0, blessed ? 20 : 10);
          if (blessed) { target.paralyzeHits = 2; ml.push(`${target.name}は強い金縛りになった！2回アクションが必要！`); }
          else ml.push(`${target.name}は金縛りになった！`);
        }
        if (kind === "player") {
          if (isStatusImmune(p, ml)) break;
          if (hasAbility(p.armor, "paralyze_proof")) { ml.push("金縛り効果を受けたが防具が防いだ！(耐金縛り)"); }
          else {
            const _pt = blessed ? 20 : 10;
            p.paralyzeTurns = _pt;
            ml.push(`金縛りになった！(${_pt}ターン)${blessed ? "(強金縛り)" : ""}`);
          }
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
        if (kind === "player") {
          if (hasAbility(p.armor, "confuse_proof")) { ml.push("混乱効果を受けたが防具が防いだ！(耐混乱)"); }
          else { const _ct = blessed ? 10 : 5; p.confusedTurns = (p.confusedTurns || 0) + _ct; ml.push(`混乱した！(${p.confusedTurns}ターン)${blessed ? "(強混乱)" : ""}`); }
        }
      }
      break;
    case "mana":
      if (kind === "player") {
        if (cursed) {
          // 反転→MP封印50ターン
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
          ml.push("魔力が封じられた！(MP封印50ターン)【呪】");
        } else if ((p.mpCooldownTurns || 0) > 0) {
          ml.push(`MPが封印中のため回復できない！(残り${p.mpCooldownTurns}ターン)`);
        } else {
          const add = Math.min(Math.round(val * (blessed ? 1.5 : 1)), (p.maxMp || 20) - (p.mp || 0));
          if (add <= 0) {
            const _maxMpGain = blessed ? 2 : 1;
            p.maxMp = (p.maxMp || 20) + _maxMpGain;
            p.mp = (p.mp || 0) + _maxMpGain;
            ml.push(`MPが最大なので最大MP+${_maxMpGain}！${blessed ? "(祝福)" : ""}`);
          } else {
            p.mp = (p.mp || 0) + add;
            ml.push(`MPが${add}回復した！${blessed ? "(祝福)" : ""}`);
          }
        }
      }
      if (kind === "monster") {
        if (cursed) {
          // 呪い：封印（ボスは有限ターン）
          target.sealed = true;
          target.sealedTurns = Math.max(target.sealedTurns||0, target.isBoss ? 20 : 9999);
          target.mpCooldownTurns = target.isBoss ? 20 : 9999;
          ml.push(target.isBoss ? `${target.name}は封印された！` : `${target.name}は永続的に封印された！【呪→永続封印】`);
        } else {
          // 通常/祝福：特技使用率100%
          target.alwaysUseSpecial = true;
          ml.push(`${target.name}は魔力が高まり特技を必ず使うようになった！`);
        }
      }
      break;
    case "darkness":
      if (kind === "player") {
        if (cursed) {
          p.monsterSenseTurns = (p.monsterSenseTurns || 0) + 100;
          ml.push("呪われた薬！フロアのモンスターが感知できる！(100ターン)【呪→感知】");
        } else {
          if (hasAbility(p.armor, "darkness_proof")) {
            ml.push("暗闇効果を受けたが防具が防いだ！(耐暗闇)");
          } else {
            const _dt = blessed ? 50 : 20;
            p.darknessTurns = (p.darknessTurns || 0) + _dt;
            ml.push(`暗闇に包まれた！視界が1マスになる！(${p.darknessTurns}ターン)${blessed ? "(祝福)" : ""}`);
          }
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
          if (hasAbility(p.armor, "bewitch_proof")) {
            ml.push("幻惑効果を受けたが防具が防いだ！(耐惑わし)");
          } else {
            const _bt = blessed ? 100 : 50;
            p.bewitchedTurns = (p.bewitchedTurns || 0) + _bt;
            ml.push(`幻惑された！周囲の見た目がおかしくなった！(${p.bewitchedTurns}ターン)${blessed ? "(祝福)" : ""}`);
          }
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
    case "seal":
      if (kind === "monster") {
        if (cursed) {
          // 呪い：特技使用率100%
          target.alwaysUseSpecial = true;
          ml.push(`${target.name}の特技使用率が100%になった！【呪】`);
        } else {
          // 通常/祝福：封印状態（祝福：さらに鈍足）
          target.sealed = true;
          target.sealedTurns = Math.max(target.sealedTurns||0, target.isBoss ? 20 : 9999);
          ml.push(`${target.name}は封印された！`);
          if (blessed) {
            if (target.isBoss && target._preSlowSpeed === undefined) target._preSlowSpeed = target.speed;
            target.speed = Math.max(0.25, (target.speed || 1) * 0.5);
            if (target.isBoss) target.bossSlowTurns = (target.bossSlowTurns || 0) + 10;
            ml.push(`さらに${target.name}は鈍足になった！(祝福)`);
          }
        }
      }
      if (kind === "player") {
        if (cursed) {
          // 呪い：MP封印解除
          p.mpCooldownTurns = 0;
          ml.push("MP封印が解けた！【呪→解封】");
        } else {
          // 通常/祝福：MP封印50ターン（祝福：さらに鈍足10ターン）
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
          ml.push(`魔力が封じられた！(MP封印50ターン)${blessed ? "(祝福)" : ""}`);
          if (blessed) {
            if (hasAbility(p.armor, "slow_proof")) {
              ml.push("鈍足効果を受けたが防具が防いだ！(耐鈍足)");
            } else {
              p.slowTurns = (p.slowTurns || 0) + 10;
              ml.push("さらに鈍足10ターン！");
            }
          }
        }
      }
      break;
    default:
      /* 未登録の effect が渡された場合は警告 (items.js ITEMS への追加を忘れずに) */
      console.warn(`[applyPotionEffect] 未登録の effect: "${eff}" — applyPotionEffect の switch に case を追加してください`);
  }
}

export const POTION_FOOD_PREFIX = {
  // 通常/祝福
  heal:      "回復の",
  superheal: "回復の",
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
  seal:     "封魔の",
  // 呪い（食べた時の効果が反転）
  c_heal:      "猛毒の",
  c_superheal: "猛毒の",
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
  c_seal:      "解封の",
};

/** 生の食料を調理済みにする共通ヘルパー（cooked/tile/sizeLabel を更新） */
const _RAW_TO_COOK_SZ = new Map([
  ["極小の","一口"],["小さい","小盛り"],["普通の","普通の"],
  ["大きい","大盛り"],["特大","特盛り"],["超特大","爆盛り"],
]);
export function cookFoodMeta(item) {
  item.cooked = true;
  item.tile = 66;
  if (item.sizeLabel !== undefined) {
    const cl = _RAW_TO_COOK_SZ.get(item.sizeLabel);
    if (cl !== undefined) item.sizeLabel = cl;
  }
}

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
  /* 火薬壺は炎で誘爆 */
  if (item.type === "pot" && item.potEffect === "gunpowder" && eff === "fire") return "gunpowder_explode";
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
  // 超回復薬は食べ物への効果が回復薬と同じ
  const _foodEff = eff === "superheal" ? "heal" : eff;
  if (_foodEff !== eff) eff = _foodEff;
  if (eff === "fire") {
    // 呪いでも通常でも同じ（焼き調理）
    if (!item.cooked) {
      item.value = item.value * 2;
      cookFoodMeta(item);
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
  item.value = Math.max(1, Math.floor(item.value * 0.8));
  ml.push(`${item.name}になった！`);
}

export function splashPotion(dg, cx, cy, eff, val, p, ml, luFn, blessed = false, cursed = false, dnFn = null) {
  ml.push("瓶が割れて中身が飛び散った！");
  pushSplashAnim(cx, cy, "#88ccff");
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
      if (!trap.permanent) {
        dg.traps = dg.traps.filter(t => t !== trap);
        ml.push(`${trap.name}は薬液で壊れた！`);
      }
      trap.revealed = true;
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
      } else if (br === "gunpowder_explode") {
        removeFloorItem(dg, it);
        doGunpowderExplosion(x, y, dg, p, ml, luFn, it.name);
      }
    }
  }
}

/* 祝福・呪いの水を投擲：着弾点のアイテム1つのみに祝呪効果（周囲8マス無効） */
export function applyWaterSplash(dg, cx, cy, blessed, cursed, ml) {
  ml.push("瓶が割れた！");
  pushSplashAnim(cx, cy, blessed ? "#aaddff" : cursed ? "#aa88ff" : "#88ccff");
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
    /* 特殊変化：ロングソード→エクスカリバー(5%)、バトルアクス/戦神の斧→金の斧(20%) */
    if (item.name === "ロングソード" && Math.random() < 0.05) {
      const _oldPlus = item.plus || 0;
      const _oldAbs = [...new Set([...(item.abilities || []), ...(item.ability ? [item.ability] : [])])].filter(Boolean);
      Object.assign(item, { ...EXCALIBUR_T, id: item.id, plus: _oldPlus });
      const _newAbs = [...new Set([..._oldAbs, EXCALIBUR_T.ability])];
      item.abilities = _newAbs; item.ability = _newAbs[0];
      ml.push("ロングソードが泉の中で聖なる光を放ち...エクスカリバーに変化した！");
    } else if ((item.name === "バトルアクス" || item.name === "戦神の斧") && Math.random() < 0.20) {
      const _oldName = item.name;
      const _oldPlus = item.plus || 0;
      const _oldAbs = [...new Set([...(item.abilities || []), ...(item.ability ? [item.ability] : [])])].filter(Boolean);
      const _goldAxe = ITEMS.find(i => i.name === "金の斧");
      Object.assign(item, { ..._goldAxe, id: item.id, plus: _oldPlus });
      const _newAbs = [...new Set([..._oldAbs, _goldAxe.ability])];
      item.abilities = _newAbs; item.ability = _newAbs[0];
      ml.push(_oldName + "が泉の中で黄金の輝きを放ち...金の斧に変化した！");
    } else if (hasAbility(item, "no_degrade")) {
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
    if (hasAbility(item, "no_degrade")) {
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
  } else if (item.type === "pot" && item.potEffect === "gunpowder") {
    /* 火薬壺を泉に浸す/投げ入れると保存の壺に変化（中身保持） */
    const _savedContents = item.contents || [];
    const _preserveTpl = POTS.find(pp => pp.potEffect === "none");
    const _origCap = item.capacity;
    Object.assign(item, { name: _preserveTpl.name, potEffect: _preserveTpl.potEffect,
      capacity: Math.max(_origCap, _savedContents.length),
      desc: _preserveTpl.desc, tile: _preserveTpl.tile });
    item.contents = _savedContents;
    ml.push(`火薬壺が泉に浸され、保存の壺に変化した！中身は保たれている。`);
    spr.contents.push(item);
  } else {
    let _elseNote = "";
    if (item.cursed) { item.cursed = false; _elseNote = " 呪いが解けた！"; }
    ml.push(_dn(item) + "が泉に落ちた。" + _elseNote);
    spr.contents.push(item);
  }
  /* 5個目が入ったら泉が干上がる（容量4） */
  if (dg && spr.contents.length >= 5) {
    ml.push("泉が干上がった！中のアイテムが飛び出した！");
    const _ft = new Set();
    dg.springs = dg.springs.filter(s => s !== spr);
    for (const _ci of spr.contents) {
      placeItemAt(dg, spr.x, spr.y, _ci, ml, _ft);
    }
  }
}

function soakItem(item) {
  /* 水没時のアイテム劣化：巻物→白紙の巻物、魔法書→白紙の魔法書 */
  if (item.type === "scroll") return { ...item, effect: "blank", name: "白紙の巻物" };
  if (item.type === "spellbook") { const { spell, ...rest } = item; return { ...rest, name: "白紙の魔法書" }; }
  return item;
}

export function placeItemAt(dg, tx, ty, item, ml, ft, dep = 0, p = null, _ox = null, _oy = null) {
  if (dep > 30) { ml.push(`${item.name}は消えてしまった！`); return false; }
  /* アニメーション用の出発地点（null の場合は tx,ty を使う） */
  const _animOx = _ox ?? tx, _animOy = _oy ?? ty;
  /* 着地点が水タイルなら沈没（同マスに既存アイテムがない場合のみ、ある場合はDROで代替地を探す） */
  if (dg.map[ty]?.[tx] === T.WATER) {
    dg.waterItems = dg.waterItems || [];
    if (!dg.waterItems.some(wi => wi.x === tx && wi.y === ty)) {
      const sunk = soakItem({ ...item, x: tx, y: ty });
      dg.waterItems.push({ x: tx, y: ty, item: sunk });
      ml.push(sunk.name !== item.name ? `${item.name}が水に濡れて白紙になった！` : `${item.name}が水に沈んだ！`);
      pushItemArcAnim(_animOx, _animOy, tx, ty, item.tile, dep + 1);
      return false;
    }
    /* 既に埋まっている水タイル→DROで隣接地を探す（後続処理へ） */
  }
  for (const [dx, dy] of DRO) {
    const cx = tx + dx, cy = ty + dy;
    if (cx < 0 || cx >= MW || cy < 0 || cy >= MH ||
        dg.map[cy][cx] === T.WALL || dg.map[cy][cx] === T.BWALL || dg.map[cy][cx] === T.SD || dg.map[cy][cx] === T.SU) continue;
    /* 水タイルに落ちる場合：同マスに既に沈没アイテムがなければ沈没 */
    if (dg.map[cy][cx] === T.WATER) {
      dg.waterItems = dg.waterItems || [];
      if (dg.waterItems.some(wi => wi.x === cx && wi.y === cy)) continue;
      const sunk = soakItem({ ...item, x: cx, y: cy });
      dg.waterItems.push({ x: cx, y: cy, item: sunk });
      ml.push(sunk.name !== item.name ? `${item.name}が水に濡れて白紙になった！` : `${item.name}が水に沈んだ！`);
      pushItemArcAnim(_animOx, _animOy, cx, cy, item.tile, dep + 1);
      return false;
    }
    const trap = dg.traps.find(t => t.x === cx && t.y === cy && !ft.has(t.id));
    if (trap) {
      /* 罠座標まで飛んでくるアーク（seq = dep+1）を先に登録 */
      pushItemArcAnim(_animOx, _animOy, cx, cy, item.tile, dep + 1);
      ft.add(trap.id);
      trap.revealed = true;
      const r = fireTrapItem(trap, item, dg, cx, cy, ml, ft, p);
      const _itBreakChance = (trap.effect === "steal_trap" || trap.effect === "summon_trap") ? 0.5 : 0.25;
      if (trap.effect !== "explode" && !trap.permanent && Math.random() < _itBreakChance) {
        dg.traps = dg.traps.filter(t => t !== trap);
        ml.push(`${trap.name}は壊れた。`);
      }
      if (r === "destroyed") return false;
      if (r === "pitfall_player") return "pitfall_player";
      /* restart: 罠座標を新しい出発地点として再帰（seq が一段上がる） */
      if (r === "restart") return placeItemAt(dg, cx, cy, item, ml, ft, dep + 1, p, cx, cy);
      continue;
    }
    if (dg.traps.some(t => t.x === cx && t.y === cy)) continue;
    if (dg.springs?.some(s => s.x === cx && s.y === cy)) {
      const _spr = dg.springs.find(s => s.x === cx && s.y === cy);
      soakItemIntoSpring(_spr, item, ml, dg, it => it.name);
      pushItemArcAnim(_animOx, _animOy, cx, cy, item.tile, dep + 1);
      return true;
    }
    if (dg.bigboxes?.some(b => b.x === cx && b.y === cy)) continue;
    if (dg.pentacles?.some(pc => pc.x === cx && pc.y === cy)) continue;
    if (dg.items.some(i => i.x === cx && i.y === cy)) continue;
    item.x = cx;
    item.y = cy;
    dg.items.push(item);
    /* itemRef を渡すことで flyingItemsRef はこのアイテム固有オブジェクトのみ隠す */
    pushItemArcAnim(_animOx, _animOy, cx, cy, item.tile, dep + 1, item);
    if (item.shopPrice) {
      const _allS = getShops(dg);
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
  /* ===== ボスドロップ（通常ドロップをスキップして専用報酬を散布） ===== */
  if (m.isBoss) {
    const _tier = m.bossTier || 1;
    const _ft = new Set();
    /* 金 */
    const _gv = [600, 1500, 3000, 6000][_tier - 1] + rng(0, 100 * _tier);
    placeItemAt(dg, m.x, m.y, { name: "ボスの財宝", type: "gold", value: _gv, tile: 1, id: uid() }, ml, _ft, 0, p);
    /* 強化武器 (+tier+1) */
    const _wpPool = ITEMS.filter(i => i.type === "weapon" && ["B","A","S"].includes(i.rarity));
    placeItemAt(dg, m.x, m.y,
      { ...pick(_wpPool.length ? _wpPool : ITEMS.filter(i => i.type === "weapon")), plus: _tier + 1, id: uid() },
      ml, _ft, 0, p);
    /* 強化防具 (+tier、tier2+) */
    if (_tier >= 2) {
      const _arPool = ITEMS.filter(i => i.type === "armor" && ["B","A","S"].includes(i.rarity));
      placeItemAt(dg, m.x, m.y,
        { ...pick(_arPool.length ? _arPool : ITEMS.filter(i => i.type === "armor")), plus: _tier, id: uid() },
        ml, _ft, 0, p);
    }
    /* 高レア巻物 (A/Sランク、tier数分) */
    const _scPool = ITEMS.filter(i => i.type === "scroll" && ["A","S"].includes(i.rarity));
    const _scFallback = ITEMS.filter(i => i.type === "scroll" && i.rarity !== "D");
    for (let _si = 0; _si < _tier; _si++) {
      placeItemAt(dg, m.x, m.y,
        { ...pick(_scPool.length ? _scPool : _scFallback), id: uid() },
        ml, _ft, 0, p);
    }
    /* 強化の薬 (tier2+) */
    if (_tier >= 2) {
      const _enhPot = POTS.find(pt => pt.potEffect === "enhance");
      if (_enhPot) placeItemAt(dg, m.x, m.y, { ..._enhPot, id: uid() }, ml, _ft, 0, p);
    }
    /* 杖 (tier3+) */
    if (_tier >= 3) {
      placeItemAt(dg, m.x, m.y,
        { ...pick(WANDS), id: uid(), charges: rng(3, 5) },
        ml, _ft, 0, p);
    }
    /* リング (tier4) */
    if (_tier >= 4) {
      const _rPool = RINGS.filter(r => ["A","B"].includes(r.rarity));
      placeItemAt(dg, m.x, m.y,
        { ...pick(_rPool.length ? _rPool : RINGS), id: uid() },
        ml, _ft, 0, p);
    }
    ml.push(`★ ${m.name}を倒した！豪華な戦利品が現れた！`);
    return;
  }

  const drops = [];
  /* ゼラチンキューブ：取り込んでいたアイテムを全てその場にばらまく */
  if (m.baseKind === "gelcube" && m.heldItems?.length > 0) {
    const _ft = new Set();
    for (const it of m.heldItems) {
      const _spr = dg.springs?.find(s => s.x === m.x && s.y === m.y);
      if (_spr) { soakItemIntoSpring(_spr, it, ml, dg); }
      else { placeItemAt(dg, m.x, m.y, it, ml, _ft, 0, p); }
    }
    m.heldItems = [];
  }
  /* 盗投士：盗んで持っていたアイテムをその場にばらまく */
  if (m.baseKind === "stealthrower" && m.heldItems?.length > 0) {
    const _ft = new Set();
    for (const it of m.heldItems) { placeItemAt(dg, m.x, m.y, it, ml, _ft, 0, p); }
    m.heldItems = [];
  }
  /* 合成獣：synthBoxの中身を全てその場にばらまく */
  if (m.baseKind === "synthmonster" && m.synthBox?.contents?.length > 0) {
    const _ft = new Set();
    for (const it of m.synthBox.contents) {
      const _spr = dg.springs?.find(s => s.x === m.x && s.y === m.y);
      if (_spr) { soakItemIntoSpring(_spr, it, ml, dg); }
      else { placeItemAt(dg, m.x, m.y, it, ml, _ft, 0, p); }
    }
    m.synthBox.contents = [];
  }
  /* Fixed drops for item-using enemy subtypes */
  if (m.subtype === "archer") {
    drops.push(makeArrow(rng(3, 8)));
  }
  if (m.subtype === "stonethrow") {
    const lvl = m.monLevel || 1;
    drops.push(lvl >= 3 ? makeMagicStone(rng(1, 3)) : makeStone(rng(2, 5)));
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

/* フロアに呪われた爆発の魔方陣があるか */
export function hasCursedExplosionPentacle(dg) {
  return dg.pentacles?.some(pc => pc.kind === "explosion" && pc.cursed) ?? false;
}

export function hasCursedTeleportPentacle(dg) {
  return dg.pentacles?.some(pc => pc.kind === "teleport_trap" && pc.cursed) ?? false;
}

/* 爆発の魔方陣：死亡したモンスターの位置で爆発を起こす */
let _explosionDepth = 0;
function _triggerExplosionPentacle(mx, my, dg, p, ml, luFn) {
  if (_explosionDepth > 4 || !dg.pentacles?.length) return;
  /* 呪われた爆発の魔方陣がある場合は爆発を起こさない */
  if (hasCursedExplosionPentacle(dg)) return;
  _explosionDepth++;
  try {
    const mRoom = dg.rooms?.find(r => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h);
    const exPc = dg.pentacles.find(pc =>
      pc.kind === "explosion" && !pc.cursed &&
      (pc.blessed || dg.rooms?.find(r => pc.x >= r.x && pc.x < r.x + r.w && pc.y >= r.y && pc.y < r.y + r.h) === mRoom)
    );
    if (!exPc) return;
    ml.push(`${exPc.name}の力で爆発した！`);
    const blasted = new Set();
    for (let ddx = -1; ddx <= 1; ddx++) {
      for (let ddy = -1; ddy <= 1; ddy++) {
        const ax = mx + ddx, ay = my + ddy;
        if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
        /* 壁の破壊 */
        if ((dg.map[ay][ax] === T.BWALL || dg.map[ay][ax] === T.WALL) && ax > 0 && ax < MW-1 && ay > 0 && ay < MH-1) {
          dg.map[ay][ax] = T.FLOOR;
          if (dg.explored?.[ay]?.[ax] !== undefined) dg.explored[ay][ax] = true;
          if (dg.visible?.[ay]?.[ax] !== undefined) dg.visible[ay][ax] = true;
          ml.push("爆発で壁が崩れた！");
          wallBreakDrop(dg, ax, ay);
          continue;
        }
        /* モンスターへのダメージ（即死→連鎖爆発） */
        for (const m of [...dg.monsters]) {
          if (m.x === ax && m.y === ay) {
            wakeIfDormant(m, ml);
            if (m.baseKind === "firedemon") {
              ml.push(`${m.name}が爆発を受けて分裂した！`);
              const _ep8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
              for (const [_sx, _sy] of _ep8) {
                const _nx = ax + _sx, _ny = ay + _sy;
                if (_nx < 0 || _nx >= MW || _ny < 0 || _ny >= MH) continue;
                if (dg.map[_ny][_nx] === T.WALL || dg.map[_ny][_nx] === T.BWALL) continue;
                if (dg.monsters.some(o => o.x === _nx && o.y === _ny)) continue;
                if (p && _nx === p.x && _ny === p.y) continue;
                dg.monsters.push({ ...m, id: uid(), x: _nx, y: _ny, hp: m.hp, turnAccum: 0, aware: true });
                break;
              }
            } else if (m.isBoss) {
              const _bd = Math.max(1, Math.floor(m.hp / 4));
              m.hp -= _bd;
              ml.push(`爆発で${m.name}は${_bd}ダメージ！`);
              if (m.hp <= 0) killMonster(m, dg, p, ml, luFn);
            } else {
              ml.push(`爆発で${m.name}は即死した！`);
              m.hp = 0;
              killMonster(m, dg, p, ml, luFn);
            }
          }
        }
        /* プレイヤーへのダメージ（現HP3/4）＋インベントリ損傷 */
        if (p && p.x === ax && p.y === ay) {
          const _hasFireR = hasAbility(p.armor, "fire_resist");
          const rawDmg = Math.max(1, Math.floor(p.hp * 3 / 4));
          const dmg = _hasFireR ? Math.floor(rawDmg / 2) : rawDmg;
          p.deathCause = `${exPc.name}の爆発により`;
          p.hp -= dmg;
          ml.push(`${exPc.name}の爆発を受けた！${dmg}ダメージ！${_hasFireR ? "(耐火半減)" : ""}`);
          if (!_hasFireR) applyLightningToInventory(p, dg, ml, luFn, null, true);
        }
        /* アイテム破壊（巻物・薬・壺） */
        for (const it of dg.items.filter(i => i.x === ax && i.y === ay)) {
          if (it.type === "scroll") { blasted.add(it); ml.push(`巻物「${it.name}」が燃えてなくなった！`); }
          else if (it.type === "potion") { blasted.add(it); ml.push(`薬「${it.name}」が割れてなくなった！`); }
          else if (it.type === "spellbook") { blasted.add(it); ml.push(`魔法書「${it.name}」が燃えてなくなった！`); }
          else if (it.type === "pot") {
            blasted.add(it);
            if (it.potEffect !== "gunpowder") ml.push(`壺「${it.name}」が爆発で割れた！`);
          }
        }
        /* 罠の破壊（永続回転板は爆発でも壊れない） */
        const ti = dg.traps.findIndex(t => t.x === ax && t.y === ay && !t.permanent);
        if (ti >= 0) { ml.push("罠が爆発で壊れた！"); dg.traps.splice(ti, 1); }
        /* 大箱の破壊 */
        if (dg.bigboxes) {
          const bi = dg.bigboxes.findIndex(b => b.x === ax && b.y === ay);
          if (bi >= 0) { ml.push("大箱が爆発で壊れた！"); dg.bigboxes.splice(bi, 1); }
        }
      }
    }
    dg.items = dg.items.filter(i => !blasted.has(i));
    /* 破壊された火薬壺の連鎖爆発 */
    for (const _gp of [...blasted].filter(it => it.type === "pot" && it.potEffect === "gunpowder")) {
      doGunpowderExplosion(_gp.x, _gp.y, dg, p, ml, luFn, _gp.name);
    }
  } finally {
    _explosionDepth--;
  }
}

/* 炎によるインベントリ損傷（巻物・薬・魔法書のどれか1つをランダムに消去） */
export function applyFireInventoryDamage(p, ml) {
  const burnables = p.inventory.filter(i => i.type === "scroll" || i.type === "potion" || i.type === "spellbook");
  if (burnables.length === 0) return;
  const victim = burnables[Math.floor(Math.random() * burnables.length)];
  p.inventory = p.inventory.filter(i => i !== victim);
  const verb = victim.type === "potion" ? "割れてなくなった" : "燃えてなくなった";
  ml.push(`爆発の熱で所持していた「${victim.name}」が${verb}！`);
}

/** プレイヤーがモンスターを倒した時の共通処理。
 *  killerMon を渡すとモンスター同士の撃破扱い（経験値はプレイヤーに入らずkillerMonがレベルアップ） */
export function killMonster(mon, dg, p, ml, luFn, noExp = false, killerMon = null) {
  const mx = mon.x, my = mon.y;
  if (killerMon) {
    ml.push(`${mon.name}は${killerMon.name}に倒された！`);
  } else if (noExp || !p) {
    ml.push(`${mon.name}は消し飛んだ！(経験値なし)`);
  } else {
    ml.push(`${mon.name}を倒した！(+${mon.exp}exp)`);
    p.exp += mon.exp;
  }
  monsterDrop(mon, dg, ml, p);
  removeMonster(dg, mon);
  /* スケルトン：50%で骨を残し5ターン後に復活 */
  if (mon.baseKind === "skeleton" && Math.random() < 0.5) {
    dg.traps.push({
      id: uid(), name: "骨", effect: "bone", tile: 107,
      x: mx, y: my, revealed: true, permanent: false,
      reviveIn: 5,
      monData: { baseKind: mon.baseKind, name: mon.name, hp: mon.maxHp, maxHp: mon.maxHp,
        atk: mon.atk, def: mon.def, exp: mon.exp, speed: mon.speed ?? 1, tile: mon.tile,
        kind: mon.kind, monLevel: mon.monLevel || 1, levels: mon.levels }
    });
    ml.push(`${mon.name}の骨が残った...5ターン後に復活するかもしれない。`);
  }
  /* からめ鬼が死んだ場合：捕獲状態を解除 */
  if (mon.subtype === "grabber" && p && p.capturedBy === mon.id) {
    p.capturedBy = null;
    ml.push("捕獲から解放された！");
  }
  if (killerMon) {
    monLevelUp(killerMon, dg, ml);
  } else if (luFn && p) {
    luFn(p, ml);
  }
  _triggerExplosionPentacle(mx, my, dg, p, ml, luFn);
}

export function pushEntity(dg, x, y, dx, dy, dist, ml, kind, entity, p, luFn, collisionAtk = 0) {
  let cx = x, cy = y;
  for (let i = 0; i < dist; i++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= MW || ny < 0 || ny >= MH || dg.map[ny][nx] === T.WALL || dg.map[ny][nx] === T.BWALL) {
      if (kind === "monster") { entity.hp -= 5; ml.push(`${entity.name}は壁に叩きつけられた！5ダメージ！`); }
      if (kind === "player")  { p.deathCause = "吹き飛ばされての壁への激突により"; p.hp -= 5; ml.push("壁に叩きつけられた！5ダメージ！"); }
      break;
    }
    /* 飛んでいる罠がキャラクターに命中 → 呼び出し元でfireTrapを処理できるよう即返却 */
    if (kind === "trap") {
      if (p && p.x === nx && p.y === ny) {
        entity.x = nx; entity.y = ny;
        return { x: nx, y: ny, hitPlayer: true };
      }
      const _trapM = monsterAt(dg, nx, ny);
      if (_trapM) {
        entity.x = nx; entity.y = ny;
        return { x: nx, y: ny, hitMonster: _trapM };
      }
    }
    if (kind === "item") {
      if (entity.type === "potion") {
        if (p && p.x === nx && p.y === ny) return { x:nx, y:ny, consumed:true, splash:true };
        const mon = monsterAt(dg, nx, ny);
        if (mon) return { x:nx, y:ny, consumed:true, splash:true };
        const trap = dg.traps.find(t => t.x === nx && t.y === ny);
        if (trap) return { x:nx, y:ny, consumed:true, splash:true };
        const spr = dg.springs?.find(s => s.x === nx && s.y === ny);
        if (spr) return { x:nx, y:ny, consumed:true, spring:spr };
        const bbP = dg.bigboxes?.find(b => b.x === nx && b.y === ny);
        if (bbP) return { x:nx, y:ny, consumed:true, bigbox:bbP };
      } else {
        if (p && p.x === nx && p.y === ny) {
          const dmg = rng(3, 8);
          p.deathCause = `飛んできた${entity.name}に`;
          p.hp -= dmg;
          ml.push(`飛んできた${entity.name}がプレイヤーに命中！${dmg}ダメージ！`);
          return { x:nx, y:ny, consumed:true, hitPlayer:true };
        }
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
          return { x:cx, y:cy, consumed:true, hitMonster:mon };
        }
        const trap = dg.traps.find(t => t.x === nx && t.y === ny);
        if (trap) {
          trap.revealed = true;
          const ft = new Set();
          ft.add(trap.id);
          const r = fireTrapItem(trap, entity, dg, nx, ny, ml, ft, p);
          const _entBreakChance = (trap.effect === "steal_trap" || trap.effect === "summon_trap") ? 0.5 : 0.25;
          if (trap.effect !== "explode" && !trap.permanent && Math.random() < _entBreakChance) {
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
    if (kind === "monster") {
      /* プレイヤーとの衝突 */
      if (p && p.x === nx && p.y === ny) {
        if (collisionAtk > 0) {
          entity.hp -= collisionAtk;
          p.deathCause = `${entity.name}との衝突により`;
          p.hp -= collisionAtk;
          ml.push(`${entity.name}がプレイヤーに激突！お互いに${collisionAtk}ダメージ！`);
        }
        break;
      }
      /* 別モンスターとの衝突 */
      const _colM = dg.monsters.find(m => m !== entity && m.x === nx && m.y === ny);
      if (_colM) {
        if (collisionAtk > 0) {
          entity.hp -= collisionAtk;
          _colM.hp -= collisionAtk;
          ml.push(`${entity.name}が${_colM.name}に激突！お互いに${collisionAtk}ダメージ！`);
        }
        break;
      }
    }
    if (kind === "player") {
      /* モンスターとの衝突 */
      const _pColM = monsterAt(dg, nx, ny);
      if (_pColM) {
        if (collisionAtk > 0) {
          p.hp -= collisionAtk;
          p.deathCause = `${_pColM.name}との衝突により`;
          _pColM.hp -= collisionAtk;
          ml.push(`${_pColM.name}に激突！お互いに${collisionAtk}ダメージ！`);
        }
        break;
      }
    }
    cx = nx; cy = ny;
  }
  if (kind === "monster" || kind === "player") { entity.x = cx; entity.y = cy; }
  else if (kind === "trap") { entity.x = cx; entity.y = cy; }
  return { x:cx, y:cy, consumed:false };
}

export function chargeShopItem(item, dg, ml) {
  if (!item.shopPrice) return;
  const _allS = getShops(dg);
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

export function shootArrow(p, dg, idx, dx, dy, ml, luFn, bbFn, animFn = null, outgoingBolt = null) {
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
      /* ── reflector（ミラーゴーレム等）：矢をプレイヤーへ跳ね返す ── */
      if (!_pierceMode && m.subtype === "reflector") {
        ml.push(`${_arName}が${m.name}に弾き返された！`);
        const _rdx = Math.sign(p.x - tx), _rdy = Math.sign(p.y - ty);
        let _rx = tx, _ry = ty, _rHit = false;
        for (let _ri = 1; _ri <= 20; _ri++) {
          const _rnx = _rx + _rdx, _rny = _ry + _rdy;
          if (_rnx < 0 || _rnx >= MW || _rny < 0 || _rny >= MH) break;
          if (dg.map[_rny][_rnx] === T.WALL || dg.map[_rny][_rnx] === T.BWALL) break;
          if (_rnx === p.x && _rny === p.y) { _rHit = true; break; }
          _rx = _rnx; _ry = _rny;
        }
        const _rToX = _rHit ? p.x : _rx, _rToY = _rHit ? p.y : _ry;
        if (animFn && (_rToX !== tx || _rToY !== ty)) {
          /* 往路アニメの逆再生：同じ色・同じ距離 */
          const _retColor = outgoingBolt?.color ?? (_isPierce ? "#ff8844" : _isPoison ? "#60d060" : "#d0a050");
          const _retFromX = outgoingBolt?.toX ?? tx, _retFromY = outgoingBolt?.toY ?? ty;
          const _retToX   = outgoingBolt?.fromX ?? _rToX, _retToY = outgoingBolt?.fromY ?? _rToY;
          animFn({ type: "projectileReturn", fromX: _retFromX, fromY: _retFromY, toX: _retToX, toY: _retToY, color: _retColor });
        }
        if (_rHit) {
          p.hp -= dmg;
          if (_isPoison && !hasRingEffect(p, "antidote_ring")) {
            p.poisoned = true;
            ml.push(`跳ね返された${_arName}がプレイヤーに命中！${dmg}ダメージ！毒を受けた！`);
          } else if (_isPoison) {
            ml.push(`跳ね返された${_arName}がプレイヤーに命中！${dmg}ダメージ！しかし指輪が毒を消した！`);
          } else {
            ml.push(`跳ね返された${_arName}がプレイヤーに命中！${dmg}ダメージ！消滅した。`);
          }
        } else if (_rx !== tx || _ry !== ty) {
          const _rft = new Set();
          placeItemAt(dg, _rx, _ry, _dropItem(), ml, _rft);
        }
        hit = true; break;
      }
      if (consumeBarrier(m, ml)) { hit = true; break; }
      const _arDmg = clampDmgFixed(m, dmg, true);
      m.hp -= _arDmg;
      if (_isPoison) m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
      ml.push(`${_arName}が${m.name}に命中！${_arDmg}ダメージ！${_isPoison ? "攻撃力が半減した！" : ""}`);
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
  const shops = getShops(dg);
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
  {id:"fire_bolt",      name:"炎の魔法",         mpCost:10, effect:"fire_bolt",       damage:25, range:10, needsDir:true,  desc:"炎の弾を撃ち、着弾点で爆発。周囲8マスにも爆風ダメージ。MP:10"},
  {id:"ice_bolt",       name:"氷の魔法",          mpCost:10, effect:"ice_bolt",        damage:18, range:10, needsDir:true,  desc:"氷の弾で敵を凍らせスロー。MP:10"},
  {id:"lightning_magic",name:"雷の魔法",          mpCost:12, effect:"lightning_magic", damage:28,           needsDir:false, desc:"視界内の全ての敵に雷ダメージを与える。MP:12"},
  {id:"sleep_bolt",     name:"眠りの魔法",        mpCost:7,  effect:"sleep_bolt",                 range:10, needsDir:true,  desc:"眠りの霧を飛ばす。MP:7"},
  {id:"teleport_magic", name:"テレポート",        mpCost:8,  effect:"teleport_magic",              needsDir:false, desc:"ランダムな場所に飛ぶ。MP:8"},
  {id:"teleport_other", name:"テレポートアザー",  mpCost:8,  effect:"teleport_other",  range:10,  needsDir:true,  desc:"方向を選び、その先の敵をランダムにテレポートさせる。MP:8"},
  {id:"poison_bolt",    name:"毒の魔法",          mpCost:8,  effect:"poison_bolt",     range:10,  needsDir:true,  desc:"方向を選び敵を毒状態にする。ターン毎にダメージ。MP:8"},
  {id:"invisible_magic",name:"透明の魔法",        mpCost:10, effect:"invisible_magic",            needsDir:false, desc:"しばらく透明になり敵に見えなくなる。MP:10"},
  {id:"wallwalk_magic", name:"壁抜けの魔法",      mpCost:12, effect:"wallwalk_magic",             needsDir:false, desc:"しばらく壁を通り抜けられる。効果切れ時に壁中にいると押し出される。MP:12"},
  {id:"heal_magic",     name:"回復の魔法",        mpCost:15, effect:"heal_magic",                 needsDir:false, desc:"HPを回復する。MP:15"},
  {id:"drain_hp",       name:"HP吸収の魔法",      mpCost:12, effect:"drain_hp",        range:10,  needsDir:true,  desc:"方向を選び敵のHPを吸い取って自分が回復する。MP:12"},
  {id:"paralyze_magic", name:"金縛りの魔法",      mpCost:10, effect:"paralyze_magic",  range:10,  needsDir:true,  desc:"方向を選び敵を金縛りにする。MP:10"},
  {id:"food_create",    name:"食料生成の魔法",    mpCost:8,  effect:"food_create",                needsDir:false, desc:"ランダムな食料をひとつ生成する。MP:8"},
  {id:"transform_magic",name:"変化の魔法",        mpCost:10, effect:"transform_magic", range:10,  needsDir:true,  desc:"対象を変化させる。MP:10"},
  {id:"identify_magic", name:"識別の魔法",        mpCost:5,  effect:"identify_magic",             needsDir:false, desc:"持ち物から1つ選んで識別する。MP:5"},
  {id:"bless_magic",    name:"祝福の魔法",        mpCost:18, effect:"bless_magic",                needsDir:false, desc:"アイテムを1つ選んで祝福する。MP:18"},
  {id:"curse_magic",    name:"呪いの魔法",        mpCost:5,  effect:"curse_magic",                needsDir:false, desc:"アイテムを1つ選んで呪う。MP:5"},
  {id:"debug_summon_mon", name:"[debug]敵召喚",   mpCost:0,  fixedMpCost:true, effect:"debug_summon_mon",  needsDir:false, debug:true, desc:"任意の敵を1体選んで呼び出す。MP:0"},
  {id:"debug_get_item",   name:"[debug]アイテム取得",mpCost:0,fixedMpCost:true,effect:"debug_get_item",   needsDir:false, debug:true, desc:"任意のアイテムを1個選んで入手する。MP:0"},
  {id:"debug_create_trap",name:"[debug]罠生成",   mpCost:0,  fixedMpCost:true, effect:"debug_create_trap", needsDir:false, debug:true, desc:"任意の罠を1つ選んで足元に作る。MP:0"},
  {id:"debug_summon_bb",  name:"[debug]大箱召喚", mpCost:0,  fixedMpCost:true, effect:"debug_summon_bb",   needsDir:false, debug:true, desc:"任意の大箱を1つ選んで呼び出す。MP:0"},
];
export const SPELLBOOKS=[
  {name:"炎の魔法書",       type:"spellbook",spell:"fire_bolt",       rarity:"B", weight:4,  sellPrice:2500,  desc:"炎の魔法を習得できる。火に弱い。",tile:43},
  {name:"氷の魔法書",       type:"spellbook",spell:"ice_bolt",        rarity:"B", weight:4,  sellPrice:2500,  desc:"氷の魔法を習得できる。火に弱い。",tile:43},
  {name:"雷の魔法書",       type:"spellbook",spell:"lightning_magic", rarity:"B", weight:4,  sellPrice:3000,  desc:"雷の魔法を習得できる。火に弱い。",tile:43},
  {name:"眠りの魔法書",     type:"spellbook",spell:"sleep_bolt",      rarity:"B", weight:4,  sellPrice:2500,  desc:"眠りの魔法を習得できる。火に弱い。",tile:43},
  {name:"テレポートの魔法書",type:"spellbook",spell:"teleport_magic", rarity:"A", weight:2,  sellPrice:5000,  desc:"テレポートの魔法を習得できる。火に弱い。",tile:43},
  {name:"テレポートアザーの魔法書",type:"spellbook",spell:"teleport_other",rarity:"A", weight:2,  sellPrice:5000,  desc:"テレポートアザーの魔法を習得できる。火に弱い。",tile:43},
  {name:"毒の魔法書",            type:"spellbook",spell:"poison_bolt",   rarity:"B", weight:4,  sellPrice:2500,  desc:"毒の魔法を習得できる。火に弱い。",tile:43},
  {name:"透明の魔法書",          type:"spellbook",spell:"invisible_magic",rarity:"A", weight:2,  sellPrice:6000,  desc:"透明の魔法を習得できる。火に弱い。",tile:43},
  {name:"壁抜けの魔法書",        type:"spellbook",spell:"wallwalk_magic", rarity:"A", weight:2,  sellPrice:8000,  desc:"壁抜けの魔法を習得できる。火に弱い。",tile:43},
  {name:"回復の魔法書",       type:"spellbook",spell:"heal_magic",       rarity:"A", weight:2,  sellPrice:5000,  desc:"回復の魔法を習得できる。火に弱い。",tile:43},
  {name:"HP吸収の魔法書",    type:"spellbook",spell:"drain_hp",         rarity:"B", weight:4,  sellPrice:3000,  desc:"HP吸収の魔法を習得できる。火に弱い。",tile:43},
  {name:"金縛りの魔法書",    type:"spellbook",spell:"paralyze_magic",   rarity:"B", weight:4,  sellPrice:2500,  desc:"金縛りの魔法を習得できる。火に弱い。",tile:43},
  {name:"食料生成の魔法書",  type:"spellbook",spell:"food_create",       rarity:"B", weight:4,  sellPrice:2000,  desc:"食料生成の魔法を習得できる。火に弱い。",tile:43},
  {name:"変化の魔法書",      type:"spellbook",spell:"transform_magic",  rarity:"B", weight:4,  sellPrice:2500,  desc:"変化の魔法を習得できる。火に弱い。",tile:43},
  {name:"識別の魔法書",     type:"spellbook",spell:"identify_magic",  rarity:"A", weight:2,  sellPrice:3500,  desc:"識別の魔法を習得できる。火に弱い。",tile:43},
  {name:"祝福の魔法書",     type:"spellbook",spell:"bless_magic",     rarity:"S", weight:1,  sellPrice:10000, desc:"祝福の魔法を習得できる。火に弱い。",tile:43},
  {name:"呪いの魔法書",     type:"spellbook",spell:"curse_magic",     rarity:"B", weight:4,  sellPrice:2000,  desc:"呪いの魔法を習得できる。火に弱い。",tile:43},];
export function burnInventorySpellbooks(p,ml){const burned=p.inventory.filter(i=>i.type==="spellbook"&&Math.random()<0.5);if(burned.length>0){p.inventory=p.inventory.filter(i=>!burned.includes(i));burned.forEach(b=>ml.push(`所持していた「${b.name}」が燃えてなくなった！`));}}

/* 雷・炎ダメージを受けたとき所持品1つにランダムで影響を与える */
export function applyLightningToInventory(p, dg, ml, luFn, nameFn = null, isFireContext = false) {
  if (p.inventory.length === 0) return;
  const dn = (it) => nameFn ? nameFn(it) : it.name;
  const idx = Math.floor(Math.random() * p.inventory.length);
  const victim = p.inventory[idx];
  if (victim.type === "pot") {
    p.inventory = p.inventory.filter((_, i) => i !== idx);
    ml.push(isFireContext ? `所持していた「${dn(victim)}」が熱で割れた！` : `所持していた「${dn(victim)}」が雷で割れた！`);
    scatterPotContents(victim, dg, p.x, p.y, p, ml, luFn);
  } else if (victim.type === "scroll" || victim.type === "potion" || victim.type === "spellbook") {
    p.inventory = p.inventory.filter((_, i) => i !== idx);
    const verb = victim.type === "potion" ? "割れてなくなった" : "燃えてなくなった";
    ml.push(`所持していた「${dn(victim)}」が${verb}！`);
  } else {
    ml.push(isFireContext ? `所持していた「${dn(victim)}」は炎に当たったが無事だった。` : `所持していた「${dn(victim)}」に雷が走ったが無事だった。`);
  }
}
export function applySpellEffect(eff, kind, target, dx, dy, dg, p, ml, luFn, lv = 1) {
  if (kind === "monster") {
    wakeIfDormant(target, ml);
    if (consumeBarrier(target, ml)) return;
  }
  const _cmsBoost = kind === "monster" && inCursedMagicSealRoom(target.x, target.y, dg) ? 2 : 1;
  const _lvF = 1 + (lv - 1) * 0.2;
  switch (eff) {
    case "fire_bolt": {
      if (hasCursedExplosionPentacle(dg)) { ml.push("呪われた爆発の魔方陣が炎の魔法を打ち消した！"); break; }
      const _fbOilyMult = kind === "monster" && ((target.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === target.x && t.y === target.y)) ? 2 : 1;
      const dmg = Math.round(rng(20, 30) * _lvF) * _cmsBoost * _fbOilyMult;
      if (kind === "monster") {
        /* 火ダルマは炎の魔法で回復 */
        if (target.baseKind === "firedemon") {
          const _fheal = Math.min(dmg, target.maxHp - target.hp);
          if (_fheal > 0) { target.hp += _fheal; ml.push(`炎の魔法が${target.name}に当たった！炎を吸収して回復した！(+${_fheal}HP)`); }
          else ml.push(`炎の魔法が${target.name}に当たった！しかし炎を吸収した！`);
          break;
        }
        target.hp -= dmg; ml.push(`炎の魔法が${target.name}に命中！${dmg}ダメージ！${_fbOilyMult > 1 ? "(油まみれ×2)" : ""}`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
      }
      if (kind === "item" && target.type === "pot" && target.potEffect === "gunpowder") {
        removeFloorItem(dg, target);
        ml.push(`炎の魔法が${target.name}に当たり誘爆した！`);
        doGunpowderExplosion(target.x, target.y, dg, p, ml, luFn, target.name);
      } break;
    }
    case "ice_bolt": {
      const dmg = Math.round(rng(15, 22) * _lvF) * _cmsBoost;
      const _iceFreeze = Math.round(3 * _lvF);
      if (kind === "monster") {
        target.hp -= dmg;
        target.immobileTurns = (target.immobileTurns || 0) + _iceFreeze;
        ml.push(`氷の魔法が${target.name}に命中！${dmg}ダメージ！${_iceFreeze}ターン移動封じ！`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
      } break;
    }
    case "lightning_magic": {
      if (hasCursedExplosionPentacle(dg)) { ml.push("呪われた爆発の魔方陣が雷の魔法を打ち消した！"); break; }
      if (kind === "self") {
        /* 視界内の全ての敵に雷ダメージ */
        const _ltTargets = dg.monsters.filter(m => dg.visible?.[m.y]?.[m.x]);
        if (_ltTargets.length === 0) { ml.push("雷が走るが、視界に敵はいない。"); break; }
        for (const _lm of _ltTargets) {
          if (_lm.hp <= 0) continue;
          if (consumeBarrier(_lm, ml)) continue;
          const _lcmsB = inCursedMagicSealRoom(_lm.x, _lm.y, dg) ? 2 : 1;
          const _ld = Math.round(rng(22, 32) * _lvF) * _lcmsB;
          _lm.hp -= _ld;
          ml.push(`雷の魔法が${_lm.name}に命中！${_ld}ダメージ！`);
          if (_lm.hp <= 0) killMonster(_lm, dg, p, ml, luFn);
        }
      }
      if (kind === "monster") {
        /* 後方互換（他から直接呼ばれた場合） */
        const dmg = Math.round(rng(22, 32) * _lvF) * _cmsBoost;
        target.hp -= dmg; ml.push(`雷の魔法が${target.name}に命中！${dmg}ダメージ！`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
      }
      if (kind === "item") {
        if (target.type === "pot" && target.potEffect === "gunpowder") {
          removeFloorItem(dg, target);
          ml.push(`雷の魔法が${target.name}に当たり誘爆した！`);
          doGunpowderExplosion(target.x, target.y, dg, p, ml, luFn, target.name);
        } else if (target.type === "potion" || target.type === "scroll" || target.type === "spellbook") { removeFloorItem(dg, target); ml.push(`${target.name}は雷の魔法で焼けた！`); }
      } break;
    }
    case "sleep_bolt": {
      if (kind === "monster") { const t = Math.round(rng(3, 6) * _lvF); target.sleepTurns = (target.sleepTurns || 0) + t; ml.push(`眠りの魔法が${target.name}に命中！${t}ターン眠りについた！`); }
      break;
    }
    case "transform_magic": {
      if (kind === "monster") {
        if (target.isBoss) { ml.push(`${target.name}には変化の魔法が効かなかった！`); break; }
        const nt = pick(MONS); const prevName = target.name; const ox = target.x, oy = target.y;
        Object.assign(target, { ...nt, id: target.id, x: ox, y: oy, maxHp: nt.hp, turnAccum: 0, aware: target.aware, dir: target.dir, lastPx: target.lastPx, lastPy: target.lastPy, subtype: nt.subtype, wandEffect: nt.wandEffect, wallWalker: nt.wallWalker });
        ml.push(`${prevName}は${target.name}に変化した！`);
      } break;
    }
    case "teleport_other": {
      if (kind === "monster") {
        if (hasCursedTeleportPentacle(dg)) { ml.push("呪われたテレポートの魔方陣に阻まれてテレポートできない！"); break; }
        const _tof = [];
        for (let _ty = 0; _ty < MH; _ty++)
          for (let _tx = 0; _tx < MW; _tx++)
            if (dg.map[_ty][_tx] === T.FLOOR && !dg.monsters.some(m => m.x === _tx && m.y === _ty) && !(p.x === _tx && p.y === _ty))
              _tof.push({ x: _tx, y: _ty });
        if (_tof.length === 0) { ml.push("テレポートに失敗した。"); break; }
        const _tod = pick(_tof);
        target.x = _tod.x; target.y = _tod.y;
        ml.push(`テレポートアザーの魔法が${target.name}に命中！どこかへ吹き飛んだ！`);
      } break;
    }
    case "poison_bolt": {
      if (kind === "monster") {
        target.poisonedTurns = (target.poisonedTurns || 0) + Math.round(10 * _lvF);
        target.poisonDmg = Math.round(3 * _lvF);
        ml.push(`毒の魔法が${target.name}に命中！毒に侵された！`);
      } break;
    }
    case "invisible_magic": {
      if (kind === "self") {
        const _invT = 10 + (lv - 1) * 5;
        p.invisibleTurns = (p.invisibleTurns || 0) + _invT;
        ml.push(`体が透明になった！しばらく敵に見えなくなる。(${_invT}ターン)`);
      } break;
    }
    case "wallwalk_magic": {
      if (kind === "self") {
        const _wwT = 10 + (lv - 1) * 5;
        p.wallWalkTurns = (p.wallWalkTurns || 0) + _wwT;
        ml.push(`体が半透明になった！壁を通り抜けられる。(${_wwT}ターン)`);
      } break;
    }
    case "teleport_magic": {
      if (kind === "self") {
        if (hasCursedTeleportPentacle(dg)) { ml.push("呪われたテレポートの魔方陣に阻まれてテレポートできない！"); break; }
        const _tmf = [];
        for (let _ty = 0; _ty < MH; _ty++)
          for (let _tx = 0; _tx < MW; _tx++)
            if (dg.map[_ty][_tx] === T.FLOOR && !(p.x === _tx && p.y === _ty) &&
                !dg.monsters.some(m => m.x === _tx && m.y === _ty))
              _tmf.push({ x: _tx, y: _ty });
        if (_tmf.length === 0) { ml.push("テレポートに失敗した。"); break; }
        const _tmd = pick(_tmf);
        p.x = _tmd.x; p.y = _tmd.y;
        ml.push("ランダムな場所にテレポートした！");
      } break;
    }
    case "heal_magic": {
      if (kind === "self") {
        const _hamt = Math.round(rng(25, 35) * _lvF);
        p.hp = Math.min(p.maxHp, p.hp + _hamt);
        ml.push(`回復の魔法を唱えた！HPが${_hamt}回復した！`);
      } break;
    }
    case "drain_hp": {
      if (kind === "monster") {
        const _drainAmt = Math.min(target.hp, Math.round(rng(15, 25) * _lvF) * _cmsBoost);
        target.hp -= _drainAmt;
        const _healAmt = Math.min(_drainAmt, p.maxHp - p.hp);
        p.hp += _healAmt;
        ml.push(`HP吸収の魔法が${target.name}に命中！${_drainAmt}ダメージ吸収、${_healAmt}HP回復！`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
      } break;
    }
    case "paralyze_magic": {
      if (kind === "monster") {
        if (!isStatusImmune(target, ml, target.name)) {
          target.paralyzed = true;
          if (target.isBoss) target.paralyzeTurns = Math.max(target.paralyzeTurns||0, Math.round(10 * _lvF));
          ml.push(`金縛りの魔法が${target.name}に命中！金縛りになった！`);
        }
      } break;
    }
    case "food_create": {
      if (kind === "self") {
        if (p.inventory.length >= (p.maxInventory || 30)) {
          ml.push("食料生成の魔法を唱えた！しかし荷物がいっぱいで持てない！足元に落とした。");
          const _food = { ...genFood(), id: uid() };
          dg.items.push({ ..._food, x: p.x, y: p.y });
        } else {
          const _food = { ...genFood(), id: uid() };
          p.inventory.push(_food);
          ml.push(`食料生成の魔法を唱えた！「${_food.name}」が現れた！`);
        }
      } break;
    }
    default: ml.push("魔法弾は効果なく消えた。");
  }
}
export function castSpellBolt(p, dg, spell, dx, dy, ml, luFn, lv = 1) {
  let _lx = p.x, _ly = p.y;
  for (let d = 1; d <= spell.range; d++) {
    const tx = p.x + dx * d, ty = p.y + dy * d;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
    if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) {
      ml.push("魔法弾は壁に消えた。");
      return { x: _lx, y: _ly, hitType: "wall" };
    }
    if (inMagicSealRoom(tx, ty, dg)) {
      ml.push("魔法弾が魔封じの魔方陣で消えた！");
      return { x: tx, y: ty, hitType: "sealed" };
    }
    const mon = monsterAt(dg, tx, ty);
    if (mon) { applySpellEffect(spell.effect, "monster", mon, dx, dy, dg, p, ml, luFn, lv); return { x: tx, y: ty, hitType: "monster" }; }
    if (tx === p.x && ty === p.y) continue;
    const it = itemAt(dg, tx, ty);
    if (it) { applySpellEffect(spell.effect, "item", it, dx, dy, dg, p, ml, luFn, lv); return { x: tx, y: ty, hitType: "item" }; }
    _lx = tx; _ly = ty;
  }
  ml.push("魔法弾は虚空に消えた。");
  return { x: _lx, y: _ly, hitType: "void" };
}

/* ===== RINGS ===== */
export const RINGS = [
  { name: "力の指輪",       type:"ring", effect:"power_ring",   plus:0, rarity:"C", weight:3, sellPrice:1000, tile:60, desc:"装備中、＋値の分だけ攻撃力が増える。合成や強化で＋値を上げられる。" },
  { name: "守りの指輪",     type:"ring", effect:"defense_ring", plus:0, rarity:"C", weight:3, sellPrice:1000, tile:60, desc:"装備中、＋値の分だけ防御力が増える。合成や強化で＋値を上げられる。" },
  { name: "命の指輪",       type:"ring", effect:"life_ring",    plus:0, rarity:"C", weight:3, sellPrice:1200, tile:60, desc:"装備中、＋値×5だけ最大HPが増える。合成や強化で＋値を上げられる。" },
  { name: "遠投の指輪",     type:"ring", effect:"farcast_ring",         rarity:"C", weight:2, sellPrice:600,  tile:60, desc:"装備中、常に遠投状態で物を投げられる。" },
  { name: "浮遊の指輪",     type:"ring", effect:"float_ring",           rarity:"C", weight:2, sellPrice:1500, tile:60, desc:"装備中、罠にかからなくなる。ただし階段を降りられなくなる。" },
  { name: "毒消しの指輪",   type:"ring", effect:"antidote_ring",        rarity:"C", weight:2, sellPrice:800,  tile:60, desc:"装備中、毒が無効になる。" },
  { name: "値切りの指輪",   type:"ring", effect:"bargain_ring",         rarity:"B", weight:2, sellPrice:2500, tile:60, desc:"装備中、店のアイテムが3割引で買える。" },
  { name: "魔物呼びの指輪", type:"ring", effect:"spawn_ring",           rarity:"C", weight:2, sellPrice:30,   tile:60, desc:"装備中、敵が現れやすくなる。" },
  { name: "下手投げの指輪", type:"ring", effect:"miss_throw_ring",      rarity:"C", weight:2, sellPrice:20,   tile:60, desc:"装備中、投げたものが必ず外れるようになる。" },
  { name: "回復の指輪",     type:"ring", effect:"regen_ring",           rarity:"B", weight:2, sellPrice:1200, tile:60, desc:"装備中、お腹の減り方と自然回復の量が倍になる。" },
  { name: "爆発の指輪",     type:"ring", effect:"explode_ring",         rarity:"C", weight:1, sellPrice:80,   tile:60, desc:"装備時に自分が爆発する。装備中もたまに爆発する。" },
  { name: "松明の指輪",     type:"ring", effect:"torch_ring",           rarity:"B", weight:2, sellPrice:700,  tile:60, desc:"装備中、視界範囲が1マス広がる。2つ装備すれば2マス広がる。" },
];

export function hasRingEffect(p, effect) {
  return p.rings?.some(r => r.effect === effect) ?? false;
}

/* ===== 食料の腐敗 ===== */
/* food アイテムに「腐った」接頭語を付け、rotten:true フラグを立てる */
/* 既に腐っている場合は何もしない。食料以外には適用しない。 */
export function rotFood(item) {
  if (item.type !== "food" || item.rotten) return false;
  item.rotten = true;
  if (!item.name.startsWith("腐った")) item.name = "腐った" + item.name;
  return true;
}

/* プレイヤーが浮遊状態か判定（呪い重力は強制浮遊、通常重力は浮遊抑制） */
export function isPlayerFloating(p, dg) {
  if (dg && hasCursedGravityPentacle(dg, p.x, p.y)) return true;
  const _hasFloat = hasRingEffect(p, "float_ring") || (p.floatTurns || 0) > 0;
  if (!_hasFloat) return false;
  if (dg && hasGravityPentacle(dg, p.x, p.y)) return false;
  return true;
}
