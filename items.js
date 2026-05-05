import { rng, pick, uid, clamp, MW, MH, T, TI, DRO, removeFloorItem, monsterAt, itemAt, removeMonster, getShops, hasAbility, hasGravityPentacle, hasCursedGravityPentacle, consumeBarrier, clampDmgFixed, shuffle } from './utils.js';
import { stageBigbox } from './DiscoveryTracker.js';
import { MONS, spawnMonsters, monLevelUp, monLevelDown, wakeIfDormant, _resolveBolt } from './monsters.js';
import { pushExplosionAnim, pushSplashAnim, pushHealAnim, pushItemArcAnim } from './animEvents.js';
import {
  RAW_FOODS, COOKED_FOODS_SAVORY, COOKED_FOODS_SWEET, COOKED_FOODS,
  FOOD_CAT_MAP, POT_CAT_BONUS,
  RAW_SIZES, COOKED_SIZES, FOOD_EFFECTS, FOOD_DESCS,
} from './foodData.js';
export { RAW_FOODS, COOKED_FOODS_SAVORY, COOKED_FOODS_SWEET, COOKED_FOODS, RAW_SIZES, COOKED_SIZES, FOOD_EFFECTS, FOOD_DESCS };

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
  pen:    ["朱色のペン","群青のペン","黄金のペン","翠色のペン","銀色のペン",
           "深紅のペン","琥珀のペン","碧色のペン","紫紺のペン","白銀のペン",
           "漆黒のペン","橙色のペン","茶色いペン","空色のペン","紺色のペン",
           "薔薇色のペン","苔色のペン"],
  pot:    ["丸い壺","四角い壺","細長い壺","平たい壺","瓢箪型の壺","古い壺",
           "新しい壺","大きな壺","小さな壺","模様入りの壺","光沢のある壺",
           "素焼きの壺","裂けた壺"],
  spellbook: ["赤い表紙の魔法書","青い表紙の魔法書","黄色い表紙の魔法書","緑の表紙の魔法書",
              "黒い表紙の魔法書","白い表紙の魔法書","紫の表紙の魔法書","橙色の表紙の魔法書",
              "金色の表紙の魔法書","銀色の表紙の魔法書","茶色い表紙の魔法書",
              "灰色の表紙の魔法書","桃色の表紙の魔法書","水色の表紙の魔法書",
              "深緑の表紙の魔法書","紺色の表紙の魔法書","真紅の表紙の魔法書"],
  ring:   ["銀色の指輪","金色の指輪","銅の指輪","鉄の指輪","宝石のついた指輪",
           "古びた指輪","光る指輪","曲がった指輪","彫刻のある指輪","紋章のある指輪",
           "太い指輪","細い指輪","黒い指輪","白い指輪","緑色の指輪",
           "赤い指輪","青い指輪","紫の指輪"],
};

export function getIdentKey(it) {
  if (!it) return null;
  if (it.type === 'potion') return `p:${it.effect}`;
  if (it.type === 'scroll' && it.effect !== 'blank') return `s:${it.effect}`;
  if (it.type === 'wand') return `w:${it.effect}`;
  if (it.type === 'pen') return `n:${it.effect}`;
  if (it.type === 'pot') return `o:${it.potEffect}`;
  if (it.type === 'spellbook' && it.spell) return `b:${it.spell}`;
  if (it.type === 'ring') return `r:${it.effect}`;
  return null;
}

export function generateBbFakeNames() {
  const shuffled = shuffle([...BB_FAKE_NAMES]);
  const bbFakeNames = {};
  BB_TYPES.forEach((bt, i) => { bbFakeNames[bt.kind] = shuffled[i % shuffled.length]; });
  return bbFakeNames;
}

export function generateFakeNames(items, pots, spellbooks = [], rings = []) {
  const fakeNames = {};
  const assign = (keys, pool) => {
    const shuffled = shuffle([...pool]);
    keys.forEach((k, i) => { fakeNames[k] = shuffled[i % shuffled.length]; });
  };
  const uniq = (arr) => [...new Set(arr)];
  assign(uniq(items.filter(i => i.type === 'potion' && i.effect !== 'water').map(i => `p:${i.effect}`)), _FAKE.potion.filter(n => n !== "透明な薬"));
  fakeNames['p:water'] = "透明な薬"; // 水は常に透明な薬
  assign(uniq(items.filter(i => i.type === 'scroll' && i.effect !== 'blank').map(i => `s:${i.effect}`)), _FAKE.scroll);
  assign(uniq(items.filter(i => i.type === 'wand').map(i => `w:${i.effect}`)), _FAKE.wand);
  assign(uniq(items.filter(i => i.type === 'pen').map(i => `n:${i.effect}`)), _FAKE.pen);
  assign(pots.map(p => `o:${p.potEffect}`), _FAKE.pot);
  assign(uniq(spellbooks.filter(sb => sb.spell).map(sb => `b:${sb.spell}`)), _FAKE.spellbook);
  assign(uniq(rings.filter(r => r.type === 'ring').map(r => `r:${r.effect}`)), _FAKE.ring);
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
  { name:"回復薬",           type:"potion", effect:"heal",      value:30,  rarity:"D", weight:12, sellPrice:100,  desc:"HPを30回復する。HP最大時は最大HP+1。\n祝福：回復量1.5倍+状態異常も回復。最大HP+2。\n呪い：反転して21ダメージ。",                                               tile:16 },
  { name:"大回復薬",         type:"potion", effect:"heal_big",  value:60,  rarity:"B", weight:4,  sellPrice:350,  desc:"HPを60回復する。HP最大時は最大HP+2。\n祝福：回復量1.5倍+状態異常も回復。最大HP+4。\n呪い：反転して42ダメージ。",                                               tile:17 },
  { name:"超回復薬",         type:"potion", effect:"superheal", value:100, rarity:"A", weight:2,  sellPrice:1200, desc:"HPを100回復する。HP最大時は最大HP+3。\n祝福：効果2倍(回復200、最大HP+6)。\n呪い：反転して50ダメージ。", tile:17 },
  { name:"毒薬",             type:"potion", effect:"poison",   value:15, rarity:"C", weight:8,  sellPrice:150,  desc:"飲むと毒状態になり攻撃力が徐々に低下。\n祝福：さらに即座に攻撃力-3。\n呪い：反転して解毒+攻撃力回復。\n投げると毒液が飛散する。", tile:16 },
  { name:"炎の薬",           type:"potion", effect:"fire",     value:20, rarity:"C", weight:8,  sellPrice:180,  desc:"飲むと炎ダメージを受ける。耐火装備で半減。\n祝福：ダメージ1.5倍。呪い：反転してHP回復。\n投げると炎上し周囲にダメージ。", tile:17 },
  { name:"睡眠薬",           type:"potion", effect:"sleep",    value:4,  rarity:"C", weight:8,  sellPrice:150,  desc:"飲むと6ターン眠る。\n祝福：12ターン強眠。呪い：反転して4ターン状態異常防止。\n投げると命中した敵を眠らせる。",           tile:16 },
  { name:"鈍足の薬",         type:"potion", effect:"slow",     value:0,  rarity:"C", weight:8,  sellPrice:150,  desc:"飲むと10ターン鈍足になる（速度×0.5）。\n祝福：20ターン鈍足（速度×0.25）。\n呪い：反転して10ターン加速（2倍速）。\n投げると命中した敵を鈍足にする。", tile:16 },
  { name:"金縛りの薬",       type:"potion", effect:"paralyze", value:0,  rarity:"C", weight:8,  sellPrice:180,  desc:"飲むと10ターン金縛りになる。\n祝福：20ターン金縛り＋2回アクション必要。\n呪い：反転して200ターン状態異常防止。\n投げると命中した敵を金縛りにする。", tile:16 },
  { name:"力の薬",           type:"potion", effect:"power",    value:3,  rarity:"A", weight:2,  sellPrice:1500, desc:"飲むと攻撃力+3。\n祝福：攻撃力+4。呪い：反転して攻撃力-1。",           tile:17 },
  { name:"テレポートの巻物", type:"scroll", effect:"teleport",           rarity:"D", weight:12, sellPrice:150,  desc:"ランダムな場所にテレポートする。\n祝福：テレポート先を選べる。\n呪い：好きな階層を選んで移動できる。",                         tile:18 },
  { name:"マップの巻物",     type:"scroll", effect:"reveal",             rarity:"B", weight:4,  sellPrice:500,  desc:"フロア全体と罠が明らかになる。\n祝福：さらにアイテム・敵の位置も常時表示。\n呪い：マップと罠の位置を全て忘れる。", tile:18 },
  { name:"武器強化の巻物",   type:"scroll", effect:"weapon_up",          rarity:"A", weight:4,  sellPrice:800,  desc:"選んだ武器・または＋値のつく指輪の＋値を1上げる。\n祝福：+2上がる。呪い：-1下がる。",  tile:18 },
  { name:"防具強化の巻物",   type:"scroll", effect:"armor_up",           rarity:"A", weight:4,  sellPrice:800,  desc:"選んだ防具・または＋値のつく指輪の＋値を1上げる。\n祝福：+2上がる。呪い：-1下がる。",  tile:18 },
  { name:"雷の巻物",         type:"scroll", effect:"thunder",            rarity:"B", weight:4,  sellPrice:500,  desc:"視界内の敵全てに雷ダメージ(30-40)。\n祝福：フロア全体。呪い：自分にも同ダメージ。", tile:18 },
  { name:"回復の巻物",       type:"scroll", effect:"recovery",           rarity:"C", weight:8,  sellPrice:100,  desc:"自分と視界内全員がHP+50回復。\n祝福：全員HP+100回復。\n呪い：自分含め視界内全員に35ダメージ。", tile:18 },
  { name:"道具寄せの巻物",   type:"scroll", effect:"item_gather",        rarity:"A", weight:4,  sellPrice:400,  desc:"フロアのアイテムを自分の周りに引き寄せる。\n祝福：直接インベントリに吸収。\n呪い：アイテムをフロアにランダム散布。",     tile:18 },
  { name:"眠りの巻物",       type:"scroll", effect:"sleep_scroll",       rarity:"B", weight:4,  sellPrice:600,  desc:"視界内の敵を6ターン眠らせる。\n祝福：フロア全体12ターン。\n呪い：自分含め視界内全員6ターン眠り。", tile:18 },
  { name:"混乱の巻物",       type:"scroll", effect:"confusion",           rarity:"B", weight:4,  sellPrice:500,  desc:"視界内の敵を20ターン混乱させる。\n祝福：フロア全体40ターン。\n呪い：自分5T＋視界内敵10T混乱。", tile:18 },
  { name:"炎の巻物",         type:"scroll", effect:"flame",               rarity:"B", weight:4,  sellPrice:550,  desc:"視界内の敵に炎ダメージ(30-40)。油まみれの対象は2倍。\n祝福：フロア全体。呪い：自分にも同ダメージ。", tile:18 },
  { name:"強化解除の巻物",   type:"scroll", effect:"debuff",              rarity:"C", weight:4,  sellPrice:600,  desc:"視界内の敵のバフを全て解除する。\n祝福：ステータスも永続低下。\n呪い：自分の攻撃力・防御力が50ターン半減する。", tile:18 },
  { name:"壁崩しの巻物",     type:"scroll", effect:"break_wall",          rarity:"C", weight:6,  sellPrice:300,  desc:"半径5の壁を全て壊す。\n祝福：半径10。呪い：周囲を壁に変える。",             tile:18 },
  { name:"金縛りの巻物",     type:"scroll", effect:"bind",                rarity:"B", weight:4,  sellPrice:600,  desc:"周囲8マスの敵を金縛りにする。\n祝福：視界内全体。呪い：自分が20ターン金縛り。", tile:18 },
  { name:"聖域のペン",       type:"pen",    effect:"sanctuary",     charges:2, rarity:"A", weight:2,  sellPrice:4000, desc:"足元に聖域の魔方陣を描く。\nモンスターは通過・攻撃できなくなる。\n祝福：さらに呪い攻撃も防ぐ。呪い：自分が弾き出され踏むと即死。", tile:42 },
  { name:"脆弱のペン",       type:"pen",    effect:"vulnerability", charges:2, rarity:"B", weight:4,  sellPrice:1200,  desc:"足元に脆弱の魔方陣を描く。\n同じ部屋にいる者全員の受けるダメージが2倍になる。\n祝福：4倍ダメージ。呪い：逆に半減。", tile:42 },
  { name:"魔封じのペン",     type:"pen",    effect:"magic_seal",    charges:2, rarity:"B", weight:4,  sellPrice:1500,  desc:"足元に魔封じの魔方陣を描く。\n部屋内では一切の魔法が無効になる。外からの魔法弾も消える。\n祝福：フロア全体。呪い：封じないが魔法ダメージ2倍。", tile:42 },
  { name:"雷のペン",         type:"pen",    effect:"thunder_trap",  charges:2, rarity:"C", weight:8,  sellPrice:600,  desc:"足元に雷の魔方陣を描く。真上にいると毎ターン25ダメージ。\n祝福：50ダメージ。呪い：逆に毎ターン25回復。", tile:42 },
  { name:"遠投のペン",       type:"pen",    effect:"farcast",       charges:2, rarity:"B", weight:4,  sellPrice:1500,  desc:"足元に遠投の魔方陣を描く。部屋内で投げたものが壁まで貫通して飛ぶ。\n祝福：フロア全体。呪い：射程が1マスになる。", tile:42 },
  { name:"明かりのペン",     type:"pen",    effect:"light",         charges:2, rarity:"C", weight:8,  sellPrice:700,  desc:"足元に明かりの魔方陣を描く。\n同じ部屋の地形・敵・アイテムが全て見える。\n祝福：フロア全体。呪い：視界1マスに。", tile:42 },
  { name:"テレポートのペン", type:"pen",    effect:"teleport_trap", charges:2, rarity:"B", weight:4,  sellPrice:1200,  desc:"足元にテレポートの魔方陣を描く。\n描いた瞬間ランダムテレポート。部屋内で毎ターン確率でTP。\n祝福：フロア全体。呪い：テレポート無効化。", tile:42 },
  { name:"罠のペン",         type:"pen",    effect:"trap_gen",      charges:2, rarity:"D", weight:12, sellPrice:300,  desc:"足元に罠の魔方陣を描く。\n毎ターン確率で部屋に罠が増える。\n祝福：フロア全体。呪い：毎ターン罠が消える。", tile:42 },
  { name:"石飛ばしのペン",   type:"pen",    effect:"stone_throw",   charges:2, rarity:"C", weight:8,  sellPrice:800,  desc:"足元に石飛ばしの魔方陣を描く。\n部屋内のキャラに毎ターン確率で魔法の石が飛ぶ。\n祝福：2倍ダメージ。呪い：回復効果。", tile:42 },
  { name:"吹き飛ばしのペン", type:"pen",    effect:"knockback_aura",charges:2, rarity:"A", weight:2,  sellPrice:3500,  desc:"足元に吹き飛ばしの魔方陣を描く。\n部屋内で近接攻撃を受けた者が5マス吹き飛ぶ。\n祝福：壁まで飛ぶ。呪い：1マスだけ。", tile:42 },
  { name:"爆発のペン",       type:"pen",    effect:"explosion",     charges:2, rarity:"B", weight:4,  sellPrice:1500, desc:"足元に爆発の魔方陣を描く。\n部屋内で倒された敵が爆発し周囲8マスにHP3/4ダメージ。壁・罠・大箱も破壊。\n祝福：フロア全体。呪い：炎・雷を不発に。", tile:42 },
  { name:"囮のペン",         type:"pen",    effect:"decoy",         charges:2, rarity:"A", weight:2,  sellPrice:4000,  desc:"足元に囮の魔方陣を描く。\n部屋内の敵がプレイヤーを無視して魔方陣に集まり、陣取ると動かなくなる。\n近づいた敵同士は互いに攻撃し合う。\n祝福：フロア全体。呪い：全敵がプレイヤーに集中。", tile:42 },
  { name:"ただのペン",       type:"pen",    effect:"plain",         charges:2, rarity:"D", weight:12, sellPrice:50,   desc:"何も起こらない魔方陣を描く。\n他のペンに合成してインクを補充できる。", tile:42 },
  { name:"重力のペン",       type:"pen",    effect:"gravity",       charges:2, rarity:"B", weight:4,  sellPrice:1500,  desc:"足元に重力の魔方陣を描く。\n部屋内：浮遊不可・敵が罠にかかる・吹飛ばし/飛びつき無効。\n水上の浮遊系敵は即死。\n祝福：フロア全体。呪い：全員浮遊状態。", tile:42 },
  { name:"みかわしのペン",   type:"pen",    effect:"dodge",         charges:2, rarity:"A", weight:2,  sellPrice:3500, desc:"足元にみかわしの魔方陣を描く。\n部屋内で投げ物・矢・石が必ず外れる(魔法・炎は除く)。\n祝福：フロア全体。呪い：逆に必ず命中。", tile:42 },
  { name:"等速のペン",       type:"pen",    effect:"equal_speed",   charges:2, rarity:"B", weight:4,  sellPrice:1800, desc:"足元に等速の魔方陣を描く。\n部屋内の全員が速度に関わらず1回行動になる。\n祝福：全員2回行動。呪い：全員鈍足。", tile:42 },
  { name:"回復のペン",       type:"pen",    effect:"heal_aura",     charges:2, rarity:"B", weight:4,  sellPrice:1500,  desc:"足元に回復の魔方陣を描く。\n部屋内の全員が毎ターン5HP回復。アンデッドには逆効果。\n祝福：10HP回復。呪い：逆に5ダメージ。", tile:42 },
  { name:"復活のペン",       type:"pen",    effect:"revival",       charges:2, rarity:"S", weight:1,  sellPrice:8000,  desc:"足元に復活の魔方陣を描く。\n魔方陣の上でHPがゼロになった者はHP全回復で復活する（敵味方問わず・使い捨て）。\n祝福：同じ部屋全域に効果。呪い：何も起きない。", tile:42 },
  { name:"短剣",             type:"weapon", atk:3,                       rarity:"D", weight:12, sellPrice:50,   desc:"軽いダガー。",                     tile:20 },
  { name:"ロングソード",     type:"weapon", atk:6,                       rarity:"C", weight:8,  sellPrice:300,  desc:"冒険者の定番武器。",               tile:20 },
  { name:"バトルアクス",     type:"weapon", atk:10,                      rarity:"B", weight:4,  sellPrice:1200, desc:"重厚な戦斧。",                     tile:20 },
  { name:"ドラゴンキラー",   type:"weapon", atk:8,  ability:"bane_dragon",   rarity:"A", weight:2,  sellPrice:2500, desc:"ドラゴン系に1.5倍ダメージを与える特効剣。",         tile:20 },
  { name:"ゾンビキラー",     type:"weapon", atk:6,  ability:"bane_undead",   rarity:"A", weight:2,  sellPrice:2000, desc:"アンデッド系に1.5倍ダメージを与える聖剣。", tile:20 },
  { name:"バードキラー",     type:"weapon", atk:5,  ability:"bane_float",    rarity:"A", weight:2,  sellPrice:1500, desc:"浮遊している敵に1.5倍ダメージを与える槍。",   tile:20 },
  { name:"戦神の斧",         type:"weapon", atk:8,  ability:"critical",      rarity:"A", weight:2,  sellPrice:2500, desc:"25%の確率で会心の一撃（2倍ダメージ）が出る斧。",  tile:20 },
  { name:"つるはし",         type:"weapon", atk:4,  ability:"pickaxe", durability:30, rarity:"C", weight:8, sellPrice:250, desc:"壁を掘れる。使い過ぎると壊れる。", tile:20 },
  { name:"影縫いの刃",       type:"weapon", atk:6,  ability:"inflict_immobile", rarity:"B", weight:4, sellPrice:1200, desc:"攻撃時25%の確率で敵の移動を2〜3ターン封じる。", tile:20 },
  { name:"炎の剣",           type:"weapon", atk:7,  ability:"fire_elem",     rarity:"B", weight:4,  sellPrice:1500, desc:"炎属性の剣。油まみれ・炎弱点の敵に1.5倍ダメージ。\n火ダルマには0.5倍。", tile:20 },
  { name:"氷の剣",           type:"weapon", atk:7,  ability:"ice_elem",      rarity:"B", weight:4,  sellPrice:1500, desc:"氷属性の剣。炎系の敵（火ダルマ・炎弱点の敵）に1.5倍ダメージ。",     tile:20 },
  { name:"雷の剣",           type:"weapon", atk:7,  ability:"thunder_elem",  rarity:"B", weight:4,  sellPrice:1500, desc:"雷属性の剣。氷・水系の敵（氷竜・わてり等）に1.5倍ダメージ。",             tile:20 },
  { name:"グラットンソード", type:"weapon", atk:7,  ability:"def_bonus",     rarity:"B", weight:4,  sellPrice:1800, desc:"装備中は防御力が5上がる重厚な剣。",                                   tile:20 },
  { name:"革の鎧",           type:"armor",  def:2,                       rarity:"D", weight:12, sellPrice:50,   desc:"軽い鎧。",                         tile:21 },
  { name:"鎖帷子",           type:"armor",  def:5,                       rarity:"C", weight:8,  sellPrice:300,  desc:"斬撃に強い鎧。", tile:21 },
  { name:"プレートメイル",   type:"armor",  def:8,                       rarity:"B", weight:4,  sellPrice:1200, desc:"最強の重装鎧。",                   tile:21 },
  { name:"腹持ちの胴",       type:"armor",  def:3,  ability:"slow_hunger",   rarity:"B", weight:4,  sellPrice:1500, desc:"装備すると空腹の進行が半分になる特製の胴鎧。",    tile:21 },
  { name:"ゴムゴムの胴",     type:"armor",  def:4,  ability:"lightning_resist", rarity:"B", weight:4, sellPrice:1000, desc:"雷ダメージを半減し、雷によるアイテム破壊を防ぐ。", tile:21 },
  { name:"ドラゴンメイル",   type:"armor",  def:8,  ability:"fire_resist",   rarity:"A", weight:2,  sellPrice:3000, desc:"竜の鱗製。炎ダメージを半減しアイテムを炎から守る。", tile:21 },
  { name:"刃の鎧",           type:"armor",  def:4,  ability:"thorn",         rarity:"B", weight:4,  sellPrice:900,  desc:"近接攻撃で受けたダメージの1/3を反射する。",       tile:21 },
  { name:"みかわしの服",     type:"armor",  def:2,  ability:"dodge",         rarity:"B", weight:4,  sellPrice:1200, desc:"軽くて動きやすく、25%の確率で攻撃を回避する。",   tile:21 },
  { name:"反射の鎧",         type:"armor",  def:5,  ability:"wand_reflect",  rarity:"A", weight:2,  sellPrice:3000, desc:"モンスターの杖魔法を反射する神秘の鎧。",          tile:21 },
  { name:"護盗の鎧",         type:"armor",  def:3,  ability:"anti_steal",    rarity:"C", weight:8,  sellPrice:500,  desc:"装備するとコソドロに所持品を盗まれなくなる。\n盗みの罠も無効化する。",    tile:21 },
  { name:"ゴールドメイル",   type:"armor",  def:6,  ability:"no_degrade",    rarity:"A", weight:2,  sellPrice:2500, desc:"錆びず＋値が下がらない黄金の鎧。",               tile:21 },
  { name:"氷竜のウロコ",     type:"armor",  def:5,  ability:"ice_resist",    rarity:"B", weight:4,  sellPrice:1500, desc:"氷竜の鱗製。氷ダメージを半減。\n氷による移動封じ・鈍足を防ぐ。",  tile:21 },
  { name:"マナ回復薬",       type:"potion", effect:"mana",     value:20, rarity:"C", weight:8,  sellPrice:120,  desc:"MPを20回復する。MP最大時は最大MP+1。\n祝福：回復量1.5倍、最大MP+2。\n呪い：反転してMP封印50ターン。\n投げると敵に特技常用化(呪：永続封印)。",                 tile:16 },
  { name:"封印の薬",         type:"potion", effect:"seal",     value:0,  rarity:"C", weight:8,  sellPrice:200,  desc:"飲むとMP封印50ターン。\n祝福：さらに鈍足10ターン。呪い：MP封印を解除。\n投げると命中した敵を封印状態にする。", tile:16 },
  { name:"混乱の薬",         type:"potion", effect:"confuse",  value:5,  rarity:"C", weight:8,  sellPrice:180,  desc:"飲むと5ターン混乱する。\n祝福：10ターン混乱。呪い：反転して混乱解消+必中100ターン。\n投げると敵を20ターン混乱(祝：40T、呪：混乱解除)。", tile:16 },
  { name:"暗闇の薬",         type:"potion", effect:"darkness",           rarity:"B", weight:4,  sellPrice:300,  desc:"飲むと視界が1マスになる(20ターン)。\n祝福：50ターン暗闇。呪い：反転してモンスター感知100ターン。\n投げると敵を50ターン暗闇に(祝：永続、呪：暗闇解除)。", tile:16 },
  { name:"惑わしの薬",       type:"potion", effect:"bewitch",            rarity:"B", weight:4,  sellPrice:300,  desc:"飲むと50ターン周囲の見た目が狂う。\n祝福：100ターン幻惑。呪い：反転してフロアの罠を全て看破。\n投げると敵を50ターン逃走させる(祝：永続、呪：逃走解除)。", tile:16 },
  { name:"レベルアップの薬", type:"potion", effect:"levelup",            rarity:"S", weight:1,  sellPrice:5000, desc:"飲むとレベルが1上がる。\n祝福：2レベル上がる。呪い：1階上にワープ。\n投げると敵がレベルアップ(祝：2段階、呪：レベルダウン)。", tile:17 },
  { name:"金貨",             type:"gold",   value:1,                     desc:"金貨。",                           tile:22 },
  { name:"識別の巻物", type:"scroll", effect:"identify",          rarity:"C", weight:8,  sellPrice:250,
    desc:"持ち物から1つ選んで識別する。\n祝福：全識別。呪い：識別を解除。", tile:18 },
  { name:"複製の巻物", type:"scroll", effect:"duplicate",         rarity:"S", weight:1,  sellPrice:6000,
    desc:"持ち物から1つ選んで複製する。\n祝福：複製品が祝福される。呪い：選んだものが消える。", tile:18 },
  { name:"売却の巻物", type:"scroll", effect:"sell_item",         rarity:"C", weight:4,  sellPrice:600,
    desc:"持ち物から1つ選んで換金する。\n祝福：2倍の金額。呪い：半額。", tile:18 },
  { name:"変換の巻物", type:"scroll", effect:"transform_item",    rarity:"B", weight:4,  sellPrice:700,
    desc:"持ち物から1つ選んで別のアイテムに変える。\n祝福：レアリティが高いものに変化。\n呪い：レアリティが低いものに変化。", tile:18 },
  { name:"錬成の巻物", type:"scroll", effect:"forge_item",        rarity:"A", weight:2,  sellPrice:2000,
    desc:"持ち物の武器か防具を1つ選んでランダムな能力を付与する。\n祝福：強力な能力。呪い：役に立たない能力。", tile:18 },
  { name:"召喚の巻物", type:"scroll", effect:"summon",            rarity:"D", weight:12, sellPrice:50,
    desc:"敵を4体召喚する。\n祝福：8体に囲まれる。\n呪い：部屋内の敵を別の部屋に飛ばす。", tile:18 },
  { name:"収納上手の巻物", type:"scroll", effect:"expand_inv",   rarity:"A", weight:4,  sellPrice:800,
    desc:"最大所持数が1～3増える。\n祝福：2～6増える。呪い：1～3減る。", tile:18 },
  { name:"罠の巻物", type:"scroll", effect:"trap_scatter",        rarity:"D", weight:12, sellPrice:30,
    desc:"読むと同じフロアの部屋内に大量の罠が出現する。\n祝福：さらに多く出現。呪い：フロア内の全ての罠が消える。", tile:18 },
  { name:"吸い出しの巻物", type:"scroll", effect:"pot_extract",   rarity:"B", weight:4,  sellPrice:600,
    desc:"選んだ壺の中身を割らずに足元にばらまく。油系は周囲8マスに油も飛散。火薬壺は壺無事のまま爆発。\n呪い：選んだ壺を割る。祝福：中身を吸い出したうえで容量+1。", tile:18 },
  { name:"自爆の巻物", type:"scroll", effect:"self_destruct",      rarity:"B", weight:4,  sellPrice:700,
    desc:"自分と周囲8マスに爆発が起き、自分のHPが1になる。範囲内の敵は炎無効でない限り即死。炎耐性ありなら自ダメ半減。\n祝福：爆発範囲が5×5に拡大。\n呪い：爆発は起きず自分のHPが全回復する。", tile:18 },
  { name:"バーサーカーの巻物", type:"scroll", effect:"berserker_scroll", rarity:"B", weight:4, sellPrice:600,
    desc:"部屋内の敵全員が50ターンのバーサーク状態になり、敵味方区別なく攻撃する。\n跳ね返った場合：自分が50ターン攻撃力1.5倍になる。\n祝福：効果範囲がフロア全体になる。\n呪い：部屋内の敵が20ターンの平和主義状態になる（攻撃不可）。跳ね返った場合も自分が平和主義状態になる。", tile:18 },
  { name:"爆弾矢", type:"arrow", atk:6, bombArrow:true, count:3,  rarity:"A", weight:2,  sellPrice:120,
    desc:"着弾点で爆発する矢。周囲8マスに地雷と同じ爆発効果。\n99本まで束にできる。", tile:23 },
  { name:"毒矢",     type:"arrow", atk:2, poison:true, count:3,   rarity:"C", weight:8,  sellPrice:30,   desc:"毒を持つ矢。命中すると毒効果。99本まで束にできる。",           tile:23 },
  { name:"貫きの矢", type:"arrow", atk:5, pierce:true, count:3,   rarity:"B", weight:4,  sellPrice:60,   desc:"全てを貫通して飛ぶ矢。99本まで束にできる。", tile:23 },
  { name:"強矢",     type:"arrow", atk:8, strong:true,   count:3,   rarity:"B", weight:4,  sellPrice:80,   desc:"攻撃力の高い強力な矢。99本まで束にできる。",                   tile:23 },
];

export function getBlessMultiplier(it) {
  if (!it) return 1;
  if (it.blessed) return 1.5;
  if (it.cursed)  return 0.5;
  return 1;
}

export const CAT_CLAW_T     = { name:"猫の爪",         type:"weapon", atk:13, ability:"critical",    sellPrice:3000, desc:"鋭い爪の形をした武器。25%の確率で会心の一撃。", tile:20 };
export const SOBURO_T       = { name:"ソボロ助広",     type:"weapon", atk:8,  ability:"double_strike", sellPrice:3000, desc:"連撃の刀。", tile:20 };
export const EXCALIBUR_T   = { name:"エクスカリバー", type:"weapon", atk:15, ability:"bane_undead_2", sellPrice:5000, desc:"聖なる伝説の剣。アンデッド系に2倍ダメージ（上位特効）。", tile:20 };
export const GOLDEN_AXE_T  = { name:"ゴールデンアクス", type:"weapon", atk:10, ability:"no_degrade", sellPrice:2500, desc:"錆びず＋値が下がらない黄金の斧。", tile:20 };
export const TRIELEM_SWORD_T = { name:"三元の刃", type:"weapon", atk:12, ability:"fire_elem", abilities:["fire_elem","ice_elem","thunder_elem"], sellPrice:9000, desc:"炎・氷・雷の三元素を宿した至高の剣。\n全属性弱点の敵に1.5倍ダメージ。火ダルマには0.5倍。", tile:20 };
export const FLAMBERGE_T    = { name:"フランベルジュ", type:"weapon", atk:13, ability:"fire_elem_2",    sellPrice:9000, desc:"炎の剣3本の合成。炎弱点・油まみれの敵に2倍ダメージ（上位特効）。火ダルマには0.5倍。", tile:20 };
export const ICESWORD_T     = { name:"アイスソード",   type:"weapon", atk:13, ability:"ice_elem_2",     sellPrice:9000, desc:"氷の剣3本の合成。炎系の敵に2倍ダメージ（上位特効）。", tile:20 };
export const CHIDORI_T      = { name:"千鳥",           type:"weapon", atk:13, ability:"thunder_elem_2", sellPrice:9000, desc:"雷の剣3本の合成。氷・水系の敵に2倍ダメージ（上位特効）。", tile:20 };
export const ULTIMA_SWORD_T = { name:"アルテマソード", type:"weapon", atk:20, ability:"fire_elem_2", abilities:["fire_elem_2","ice_elem_2","thunder_elem_2"], sellPrice:25000, desc:"三元の刃3本の合成。全属性弱点の敵に2倍ダメージ（上位特効）。火ダルマには0.5倍。", tile:20 };
export const TRIELEM_ARMOR_T  = { name:"元素王の鎧",     type:"armor", def:10, ability:"fire_resist", abilities:["fire_resist","ice_resist","lightning_resist"], sellPrice:15000, desc:"炎・氷・雷すべてに耐性を持つ至高の鎧。\n全属性ダメージ半減・各種副作用も防ぐ。", tile:21 };
export const MITHRIL_ARMOR_T  = { name:"ミスリルの胴着", type:"armor", def:13, sellPrice:10000,       desc:"硬くて軽い幻のミスリル製鎧。", tile:21 };
export const ALLBANE_SWORD_T  = { name:"万能キラー", type:"weapon", atk:11, ability:"bane_dragon", abilities:["bane_dragon","bane_undead","bane_float"], sellPrice:10000, desc:"三種の特効剣が融合した剣。竜・不死・浮遊の全種族に1.5倍ダメージ。", tile:20 };
export const IRONMASS_T       = { name:"鉄塊",       type:"weapon", atk:16, ability:"bane_dragon_2",  sellPrice:10000, desc:"ドラゴンキラー3本の合成。ドラゴン系に2倍ダメージ（上位特効）。", tile:20 };
export const SNIPER_T         = { name:"スナイパー", type:"weapon", atk:12, ability:"bane_float_2",   sellPrice:10000, desc:"バードキラー3本の合成。浮遊している敵に2倍ダメージ（上位特効）。", tile:20 };
export const GODBANE_SWORD_T  = { name:"全能キラー", type:"weapon", atk:18, ability:"bane_dragon_2", abilities:["bane_dragon_2","bane_undead_2","bane_float_2"], sellPrice:30000, desc:"万能キラー3本の合成。竜・不死・浮遊の全種族に2倍ダメージ（上位特効）。", tile:20 };
export const DIVINE_SHIELD_T  = { name:"神盾の鎧",   type:"armor",  def:8,  ability:"thorn",      abilities:["thorn","dodge","wand_reflect"],           sellPrice:15000, desc:"三種の守護防具が融合した究極の鎧。\n刃反射・みかわし・杖反射の三重防御。",       tile:21 };
export const GODSPARKWAND_T   = { name:"ゴッドスパークの杖", type:"wand", effect:"godsparkwand", charges:3, rarity:"S", sellPrice:15000, desc:"炎・雷・氷の三杖を合成して生まれた究極の杖。\n振ると100ダメージ。祝福：200ダメージ。呪い：100回復。", tile:24 };
export const GOBLIN_BAT_T     = { name:"ゴブリンバット", type:"weapon", atk:4, rarity:"D", sellPrice:80, desc:"ゴブリンが持っている粗削りな鈍器。3本合成で鬼棍棒に変化する。", tile:20 };
export const ONI_CLUB_T       = { name:"鬼棍棒",       type:"weapon", atk:8, ability:"critical", sellPrice:1200, desc:"ゴブリンバット3本の合成。25%の確率で会心の一撃。", tile:20 };

export const ARROW_T         = { name:"矢",       type:"arrow", atk:3,                 rarity:"D", weight:12, sellPrice:10,  desc:"99本まで束にできる矢。",                 count:1, tile:23 };
export const POISON_ARROW_T  = { name:"毒矢",     type:"arrow", atk:2, poison:true,     rarity:"C", weight:8,  sellPrice:30,  desc:"毒を持つ矢。99本まで束にできる。",        count:1, tile:23 };
export const PIERCING_ARROW_T= { name:"貫きの矢", type:"arrow", atk:5, pierce:true,     rarity:"B", weight:4,  sellPrice:60,  desc:"全てを貫通して飛ぶ矢。99本まで束にできる。", count:1, tile:23 };
export const STRONG_ARROW_T  = { name:"強矢",     type:"arrow", atk:8, strong:true,       rarity:"B", weight:4,  sellPrice:80,  desc:"攻撃力の高い強力な矢。99本まで束にできる。", count:1, tile:23 };
export const STONE_T        = { name:"石",       type:"arrow", atk:3, stone:true,      rarity:"D", weight:12, sellPrice:5,   desc:"必ず3マス先に着弾する石。99個まで束にできる。遠投の魔方陣では消滅する。呪われた遠投では1マス先に着弾。",  count:1, tile:23 };
export const MAGIC_STONE_T  = { name:"魔法の石", type:"arrow", atk:5, magicStone:true, rarity:"C", weight:8,  sellPrice:30,  desc:"10マス以内の最も近い敵にホーミングして命中する石。99個まで束にできる。",                                    count:1, tile:23 };
export const BOMB_ARROW_T   = { name:"爆弾矢",   type:"arrow", atk:6, bombArrow:true,  rarity:"A", weight:2,  sellPrice:120, desc:"着弾点で爆発する矢。周囲8マスに地雷と同じ爆発効果。\n99本まで束にできる。",                            count:1, tile:23 };
export const EMPTY_BOTTLE = { name:"空き瓶",      type:"bottle",                         rarity:"D", weight:12, sellPrice:5,    desc:"空の瓶。今のところ使い道はない。",         tile:16 };
export const WATER_BOTTLE = { name:"水", type:"potion", effect:"water", value:10,        rarity:"D", weight:12, sellPrice:5,    desc:"泉の水。飲むと満腹度+3。投げると着弾点のアイテムに祝福(祝)/呪い(呪)を付与。壺に当たると容量変化。", tile:16 };
export const BLANK_SCROLL  = { name:"白紙の巻物",    type:"scroll", effect:"blank",      rarity:"B", weight:4,  sellPrice:400,  desc:"何も書かれていない。魔法の筆で書き込める。", tile:18 };
export const MAGIC_MARKER  = { name:"魔法の筆", type:"marker", charges:1,          rarity:"A", weight:2,  sellPrice:1500, desc:"白紙の巻物に好きな魔法を書き込める。\n充填の大箱で回数を増やせる。筆同士の合成で容量合算。", tile:41 };


/* ===== 宝石 ===== */
export const GEM_TYPES = [
  { name: "ルビー",       type: "gem", rarity: "B", weight: 8,  basePrice: 1500, tile: 88,  desc: "深紅の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "サファイア",   type: "gem", rarity: "B", weight: 8,  basePrice: 2500, tile: 89,  desc: "深青の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "エメラルド",   type: "gem", rarity: "B", weight: 8,  basePrice: 2000, tile: 90,  desc: "緑の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "トパーズ",     type: "gem", rarity: "C", weight: 12, basePrice: 800,  tile: 91,  desc: "黄色の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "アメジスト",   type: "gem", rarity: "C", weight: 12, basePrice: 500,  tile: 92,  desc: "紫の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "アクアマリン", type: "gem", rarity: "C", weight: 10, basePrice: 1100, tile: 87,  desc: "青緑の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "ダイヤモンド", type: "gem", rarity: "A", weight: 3,  basePrice: 8000, tile: 101, desc: "無色透明の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "オパール",     type: "gem", rarity: "A", weight: 3,  basePrice: 5000, tile: 102, desc: "虹色の宝石。買った店から遠い階の店で売ると高値がつく。" },
];

/* 宝石の売値を計算する（originDepth から currentDepth の距離に応じて上昇） */
export function gemSellPrice(gem, currentDepth) {
  const dist = Math.abs(currentDepth - (gem.originDepth ?? currentDepth));
  return Math.round((gem.basePrice || 100) * (1 + dist * 0.35));
}

export function itemPrice(it) {
  const _bcMult = it.type === "gem"
    ? (it.blessed ? 1.5 : it.cursed ? 0.5 : 1)
    : (it.blessed ? 1.1 : it.cursed ? 0.9 : 1);
  // sellPrice が設定されている場合はそれを基準にする
  if (it.sellPrice != null) {
    const base = it.sellPrice;
    // 武器・防具は強化値に応じて加算
    if (it.type === "weapon" || it.type === "armor") {
      const plus = it.plus || 0;
      return Math.max(1, Math.round((base + plus * 100) * _bcMult));
    }
    // 杖・ペン・マーカーはチャージ数に応じて加算（1チャージあたりbase×10%、最低100G）
    if (it.type === "wand" || it.type === "pen" || it.type === "marker") {
      const charges = it.charges || 0;
      const perCharge = Math.max(100, Math.floor(base * 0.1));
      return Math.round((base + charges * perCharge) * _bcMult);
    }
    // 矢は個数に応じて加算（sellPriceは1個あたりの価値）
    if (it.type === "arrow") {
      return Math.max(base, Math.floor(base * (it.count || 1) / 3));
    }
    // 壺は容量・中身の合計価格を加算（1容量あたりbase×10%）
    if (it.type === "pot") {
      const contentsValue = (it.contents || []).reduce((s, c) => s + itemPrice(c), 0);
      const capBonus = (it.capacity || 0) * Math.floor(base * 0.1);
      return Math.round((base + contentsValue + capBonus) * _bcMult);
    }
    return Math.round(base * _bcMult);
  }
  // sellPrice未設定のアイテム用フォールバック
  if (it.type === "potion") {
    if (it.effect === "superheal") return Math.round(400 * _bcMult);
    if (it.effect === "heal_big") return Math.round(200 * _bcMult);
    if (it.effect === "heal") return Math.round(100 * _bcMult);
    if (it.effect === "power") return Math.round(120 * _bcMult);
    return Math.round(40 * _bcMult);
  }
  if (it.type === "scroll")   return Math.round((it.effect === "blank" ? 5 : it.effect === "reveal" ? 60 : 80) * _bcMult);
  if (it.type === "weapon")   return Math.round((50 + (it.atk || 0) * 20 + (it.ability ? 150 : 0)) * _bcMult);
  if (it.type === "armor")    return Math.round((60 + (it.def || 0) * 25 + (it.ability ? 150 : 0)) * _bcMult);
  if (it.type === "food") {
    const satietyBase = Math.floor((it.value || 20) * 2.5);
    const effectEntry = it.effect ? FOOD_EFFECTS.find(f => f.e === it.effect) : null;
    const effectBonus = effectEntry ? effectEntry.bonus : 0;
    return Math.round(Math.max(10, satietyBase + effectBonus) * _bcMult);
  }
  if (it.type === "arrow")    return Math.max(10, (it.count || 1) * 5);
  if (it.type === "wand")     return Math.round((150 + (it.charges || 0) * 30) * _bcMult);
  if (it.type === "marker")   return Math.round((100 + (it.charges || 0) * 40) * _bcMult);
  if (it.type === "pen")      return Math.round((150 + (it.charges || 0) * 50) * _bcMult);
  if (it.type === "pot") {
    const contentsValue = (it.contents || []).reduce((s, c) => s + itemPrice(c), 0);
    return Math.round((120 + contentsValue) * _bcMult);
  }
  if (it.type === "gem")      return Math.round((it.basePrice || 100) * _bcMult);
  if (it.type === "bottle")   return 5;
  if (it.type === "spellbook") return Math.round(200 * _bcMult);
  if (it.type === "ring") {
    const ringBase = it.sellPrice ?? 100;
    if (it.effect === "power_ring" || it.effect === "defense_ring" || it.effect === "life_ring") return Math.max(1, Math.round((ringBase + (it.plus || 0) * 100) * _bcMult));
    return Math.round(ringBase * _bcMult);
  }
  return Math.round(30 * _bcMult);
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
  { name:"雷の杖",         type:"wand", effect:"lightning", charges:4, rarity:"C", weight:8,  sellPrice:700,  desc:"振ると雷撃が飛ぶ。壊すと周囲に落雷。",                                           tile:24 },
  { name:"鈍足の杖",       type:"wand", effect:"slow",      charges:6, rarity:"B", weight:4,  sellPrice:300,  desc:"振ると対象の速度を半減。壊すと周囲全てを鈍足に。\n水の瓶→鈍足の薬。",  tile:24 },
  { name:"変化の杖",       type:"wand", effect:"transform", charges:4, rarity:"B", weight:4,  sellPrice:600,  desc:"振ると対象を別の何かに変える。壊すと周囲全てを変化。",                           tile:24 },
  { name:"場所替えの杖",   type:"wand", effect:"swap",      charges:5, rarity:"B", weight:4,  sellPrice:500,  desc:"振ると対象と位置を交換する。壊すと周囲をシャッフル。",                           tile:24 },
  { name:"穴掘りの杖",     type:"wand", effect:"dig",       charges:5, rarity:"B", weight:4,  sellPrice:600,  desc:"壁に当てると一直線上の壁を掘り進む。\n壊すと周囲の壁を消し足元に穴が開く。",       tile:24 },
  { name:"飛びつきの杖",   type:"wand", effect:"leap",      charges:5, rarity:"C", weight:8,  sellPrice:250,  desc:"振ると対象の目の前に瞬間移動する。壊しても何も起こらない。",                     tile:24 },
  { name:"テレポートの杖", type:"wand", effect:"warp",      charges:4, rarity:"B", weight:4,  sellPrice:500,  desc:"振ると対象をランダムな場所にテレポートさせる。壊すと周囲全員をテレポート。",     tile:24 },
  { name:"金縛りの杖",     type:"wand", effect:"paralyze",  charges:5, rarity:"A", weight:2,  sellPrice:500, desc:"振ると対象を金縛りにする。何かアクションを受けるまで動けなくなる。\n祝福：2回アクション必要な強金縛り。\n呪い：対象が200T状態異常防止を得る。\n水の瓶に当てると金縛りの薬になる。", tile:24 },
  { name:"眠りの杖",       type:"wand", effect:"sleep",     charges:5, rarity:"B", weight:4,  sellPrice:400,  desc:"振ると対象を眠りに落とす。眠りの罠と同様の効果。",                                   tile:24 },
  { name:"祝福の杖",       type:"wand", effect:"bless_wand",charges:1, rarity:"S", weight:1,  sellPrice:8000, desc:"振ると対象のアイテムを祝福する。壊すと周囲のアイテム全てを祝福する。",                 tile:24 },
  { name:"呪いの杖",       type:"wand", effect:"curse_wand",charges:1, rarity:"A", weight:2,  sellPrice:1500, desc:"振ると対象のアイテムを呪う。壊すと周囲のアイテム全てを呪う。",                         tile:24 },
  { name:"レベルアップの杖", type:"wand", effect:"levelup", charges:3, rarity:"A", weight:2,  sellPrice:12000, desc:"振ると対象をレベルアップさせる。\n自分：1レベルUP。敵：次の形態に変化。\n呪い：自分は1階上へワープ、敵はレベルダウン。\n水の瓶→レベルアップの薬。", tile:24 },
  { name:"混乱の杖",       type:"wand", effect:"confuse",   charges:5, rarity:"C", weight:8,  sellPrice:300,  desc:"振ると対象を混乱させる。\n自分：5ターン、敵：20ターン混乱。\n水の瓶→混乱の薬。", tile:24 },
  { name:"暗闇の杖",       type:"wand", effect:"darkness",  charges:5, rarity:"B", weight:4,  sellPrice:500,  desc:"振ると対象を暗闇状態にする。\n自分：視界1マス(20T)。敵：50T認識不可で壁まで直進。\n祝福：自分50T・敵永続。呪い：フロア全体が見える。\n水の瓶→暗闇の薬。", tile:24 },
  { name:"惑わしの杖",     type:"wand", effect:"bewitch",   charges:4, rarity:"B", weight:4,  sellPrice:600,  desc:"振ると対象を幻惑状態にする。\n自分：50T見た目が狂う。敵：50T逃げ回る。\n祝福：自分100T・敵永続。呪い：罠が全て見える。\n水の瓶→惑わしの薬。", tile:24 },
  { name:"封印の杖",       type:"wand", effect:"seal",      charges:5, rarity:"C", weight:8,  sellPrice:350,  desc:"振ると対象を封印状態にする。自分：MP封印50T。\n祝福：敵に鈍足も付与、自分は鈍足10Tも追加。\n呪い：敵の特技100%化、自分はMP封印解除。\n水の瓶→封印の薬。", tile:24 },
  { name:"軟化の杖",       type:"wand", effect:"soften",    charges:5, rarity:"B", weight:4,  sellPrice:700,  desc:"振ると対象の防御力を半減する(祝福：1/4)。\nアイテム・罠・大箱に当てると破壊。壁→食料に変化。\n呪い：1マス先に壊せる壁を生成。", tile:24 },
  { name:"炎の杖",         type:"wand", effect:"fire_wand", charges:5, rarity:"C", weight:8,  sellPrice:600,  desc:"振ると炎の弾が飛ぶ。油まみれは2倍、火ダルマは回復。\n自分：炎でアイテム損傷抽選。床：魔法書等は破壊、食料は焼ける。\n祝福：2倍ダメージ。呪い：対象を回復。", tile:24 },
  { name:"氷の杖",         type:"wand", effect:"ice_wand",      charges:5, rarity:"C", weight:8,  sellPrice:600,  desc:"振ると氷の弾が飛ぶ。氷属性ダメージ+5T移動封じ。\n火ダルマには2倍ダメージ。\n祝福：2倍ダメージ+移動封じ10T。呪い：対象を回復。", tile:24 },
  { name:"体力交換の杖",   type:"wand", effect:"vitality_swap", charges:4, rarity:"B", weight:4,  sellPrice:800,  desc:"振ると相手と現在HPを入れ替える。\n祝福：交換後に相手のHPを1に。呪い：自分のHPを1に。\n自分に振ると交換なしだが祝福・呪い効果は発動。\n壊すと隣接する最大HPの敵とHP交換。", tile:24 },
  { name:"物知りの杖",     type:"wand", effect:"sage",          charges:4, rarity:"C", weight:8,  sellPrice:700,  desc:"アイテム・大箱に当てると識別。敵：HP・攻撃力・防御力を表示。\n壁に跳ね返り自分に当たると手持ち1個ランダム識別。\n呪い：対象が未識別に戻る。", tile:24 },
];

/* ===== BIG BOX TYPES ===== */
export const BB_TYPES = [
  { kind: "synthesis", name: "合成の大箱", cap: () => 2,          weight: 2, desc: "2つのアイテムを合成する。\n武器/防具同士→能力引継ぎ。杖/ペン同士→チャージ合算。\n杖+装備→異種合成で杖の能力が宿る。\n特定の組み合わせで特殊合成が発生することもある。" },
  { kind: "change",    name: "変化の大箱", cap: () => rng(2, 4),  weight: 1, desc: "入れたアイテムがランダムな別のアイテムに変化する。\n何に変わるかは開けるまで不明。キーアイテムは変化しない。" },
  { kind: "enhance",   name: "強化の大箱", cap: () => rng(1, 2),  weight: 1, desc: "武器・防具の＋値を1上げる。\n力・守り・命の指輪の＋値も増やせる。壺の容量+1。\n他のアイテムには効果がない。" },
  { kind: "satiety",   name: "満腹の大箱", cap: () => rng(2, 4),  weight: 1, desc: "食料のサイズを1段階大きくする。\n生→最大で超特大、調理済み→最大で爆盛り。\n食料以外には効果がない。" },
  { kind: "refill",    name: "充填の大箱", cap: () => rng(1, 3),  weight: 1, desc: "杖・ペン・魔法の筆の使用回数をランダムに回復する。" },
  { kind: "identify",  name: "鑑定の大箱", cap: () => rng(3, 5),  weight: 1, desc: "入れたアイテムを識別する。\n薬・巻物・杖の見た目名が判明し、武器・防具の呪い状態も分かる。" },
  { kind: "split",     name: "分裂の大箱", cap: () => 1,          weight: 1, rare: true, desc: "【レア】入れたアイテムを複製する。\n＋値・矢の数は半減する。金貨・キーアイテムは分裂しない。" },
  { kind: "bless",     name: "祝福の大箱", cap: () => rng(1, 2),  weight: 1, rare: true, desc: "【レア】入れたアイテムを祝福する。\n壺は祝福ではなく容量+1。キーアイテムには効果がない。" },
  { kind: "curse",     name: "呪いの大箱", cap: () => rng(1, 2),  weight: 1, rare: true, desc: "【レア】入れたアイテムを呪う。\n壺は容量-1。食料は腐る。金貨・キーアイテムには効果がない。" },
  { kind: "scatter",   name: "拡散の大箱", cap: () => rng(3, 6),  weight: 1, desc: "入れたアイテムを部屋内の全員に投げつけ消滅させる。\n薬・杖・壺・矢は各種効果発動。使うたびに容量が減る。" },
  { kind: "trash",     name: "ゴミ箱",     cap: () => rng(5, 10), weight: 1, desc: "入れたアイテムが消滅する。使うたびに容量が減り壊れる。" },
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
  { name:"チョコの壺",         type:"pot", potEffect:"choco",     capacity:3, rarity:"C", weight:8,  sellPrice:600,  desc:"食料を入れるとチョコがけになる。食べるとHP35回復＋状態異常回復。",  tile:32 },
  { name:"唐辛子の壺",         type:"pot", potEffect:"spicy",     capacity:3, rarity:"B", weight:4,  sellPrice:900,  desc:"食料を入れると激辛になる。食べると直接攻撃・矢ダメージ1.5倍(50ターン)。",     tile:32 },
  { name:"蜂蜜の壺",           type:"pot", potEffect:"honey",     capacity:3, rarity:"C", weight:8,  sellPrice:550,  desc:"食料を入れるとはちみつ漬けになる。食べると毎ターンHP+2自然回復(80ターン)。",   tile:32 },
  { name:"保存の壺",           type:"pot", potEffect:"none",      capacity:5, rarity:"C", weight:8,  sellPrice:1500, desc:"アイテムを安全に保管できる。",         tile:32 },
  { name:"強化の壺",           type:"pot", potEffect:"enhance",   capacity:2, rarity:"A", weight:2,  sellPrice:4000, desc:"装備品の性能が上がる。",               tile:32 },
  { name:"弱化の壺",           type:"pot", potEffect:"weaken",    capacity:3, rarity:"C", weight:8,  sellPrice:150,  desc:"入れた装備品が劣化する呪いの壺。",     tile:32 },
  { name:"カレーの壺",         type:"pot", potEffect:"curry",     capacity:3, rarity:"C", weight:8,  sellPrice:500,  desc:"食料を入れるとカレー味になる。食べると炎ダメージ半減(100ターン)。",       tile:32 },
  { name:"味噌の壺",           type:"pot", potEffect:"miso",      capacity:3, rarity:"C", weight:8,  sellPrice:500,  desc:"食料を入れると味噌漬けになる。食べると防御力+8(100ターン)。",       tile:32 },
  { name:"燻製の壺",           type:"pot", potEffect:"smoke",     capacity:3, rarity:"B", weight:4,  sellPrice:1000, desc:"食料を燻製にする。食べると最大満腹度が上がる。", tile:32 },
  { name:"祝福の壺",           type:"pot", potEffect:"bless_pot", capacity:3, rarity:"S", weight:1,  sellPrice:9000, desc:"入れたアイテムを祝福する。",           tile:32 },
  { name:"呪いの壺",           type:"pot", potEffect:"curse_pot", capacity:3, rarity:"A", weight:8,  sellPrice:2000, desc:"入れたアイテムを呪う。",               tile:32 },
  { name:"加熱の壺",           type:"pot", potEffect:"boil",      capacity:3, rarity:"B", weight:4,  sellPrice:800,  desc:"薬を入れると部屋中に薬効が広がる。\n生の食料を入れると焼いた状態になる。\nその他のものは保管できる。", tile:32 },
  { name:"火薬壺",             type:"pot", potEffect:"gunpowder", capacity:3, rarity:"B", weight:4,  sellPrice:700,  desc:"割れると5×5マスを巻き込む大爆発を起こす。\n炎・雷・爆発でも誘爆する。泉に浸すと保存の壺に変化。\n中身は爆発で消える。", tile:32 },
  { name:"オリーブオイルの壺", type:"pot", potEffect:"olive",     capacity:3, rarity:"C", weight:8,  sellPrice:550,  desc:"食料を入れるとオリーブオイル漬けになる。\n食べると被攻撃15%回避(80ターン)。\n割れると周囲に油飛散→油まみれで炎ダメ2倍。", tile:32 },
  { name:"ごま油の壺",         type:"pot", potEffect:"sesame",    capacity:3, rarity:"C", weight:8,  sellPrice:550,  desc:"食料を入れるとごま油風味になる。\n食べると会心率UP(80ターン)。\n割れると周囲に油飛散→油まみれで炎ダメ2倍。",         tile:32 },
  { name:"バターの壺",         type:"pot", potEffect:"butter",    capacity:3, rarity:"C", weight:8,  sellPrice:550,  desc:"食料を入れるとバター風味になる。\n食べると満腹度減少速度半減(100ターン)。\n割れると周囲に油飛散→油まみれで炎ダメ2倍。",         tile:32 },
  { name:"ヨーグルトの壺",     type:"pot", potEffect:"yogurt",    capacity:3, rarity:"C", weight:8,  sellPrice:500,  desc:"食料を入れるとヨーグルト漬けになる。食べると毒・混乱免疫(100ターン)。",   tile:32 },
  { name:"ココナッツの壺",     type:"pot", potEffect:"coconut",   capacity:3, rarity:"C", weight:8,  sellPrice:500,  desc:"食料を入れるとココナッツ風味になる。食べるとMP+10回復。",   tile:32 },
  { name:"強欲な壺",           type:"pot", potEffect:"greed",    capacity:4, rarity:"B", weight:4,  sellPrice:1200, desc:"アイテムを入れても何も起きない。割ると中身に加え残り容量の数だけランダムなアイテムが飛び出す。", tile:32 },
  { name:"回復の壺",           type:"pot", potEffect:"heal_pot", capacity:3, rarity:"B", weight:4,  sellPrice:2000, desc:"アイテムを入れると消滅するが、プレイヤーのHPが100回復する。容量分だけ使える。", tile:32 },
  { name:"醤油の壺",           type:"pot", potEffect:"soy",      capacity:3, rarity:"C", weight:8,  sellPrice:500,  desc:"食料を入れると醤油味になる。食べると経験値1.3倍(100ターン)。", tile:32 },
  { name:"にんにくの壺",       type:"pot", potEffect:"garlic",   capacity:3, rarity:"B", weight:4,  sellPrice:800,  desc:"食料を入れるとにんにく風味になる。食べると攻撃時に固定追加ダメージ+5(80ターン)。", tile:32 },
  { name:"レモンの壺",         type:"pot", potEffect:"lemon",    capacity:3, rarity:"B", weight:4,  sellPrice:800,  desc:"食料を入れるとレモン風味になる。食べると投擲ダメージ1.5倍(80ターン)。", tile:32 },
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
  soy:     "醤油味の",
  garlic:  "にんにく風味の",
  lemon:   "レモン風味の",
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
  soy:     "醤油の深い風味がする。",
  garlic:  "にんにくの香りが漂う。",
  lemon:   "爽やかなレモンの香り。",
};

export function applyPotEffect(pot, item, ml, nameFn = null) {
  const _in = nameFn ? nameFn(item) : item.name;
  const _pn = nameFn ? nameFn(pot) : pot.name;
  const pe = pot.potEffect;
  if (pe === "none" || pe === "greed") { ml.push(`${_in}を${_pn}に入れた。`); return; }
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
    if (item.potFlavors.includes(pe)) { ml.push(`${_in}は既に${pfx.replace(/の$/, "")}味だ。`); return; }
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
  if (potEffect === "none") return rng(7, 10);
  if (potEffect === "greed") return rng(3, 5);
  if (potEffect === "enhance" || potEffect === "bless_pot" || potEffect === "curse_pot") return rng(1, 2);
  return rng(3, 5);
}

export function makePot() {
  const t = pick(POTS);
  return { ...t, id:uid(), contents:[], capacity: randPotCapacity(t.potEffect) };
}

export function scatterPotContents(pot, dg, px, py, p, ml, luFn, nameFn = null) {
  const _pn = nameFn ? nameFn(pot) : pot.name;
  /* 強欲な壺：中身＋残り容量分のランダムアイテムを出す */
  if (pot.potEffect === "greed") {
    const _remaining = Math.max(0, (pot.capacity || 4) - (pot.contents?.length || 0));
    ml.push(`${_pn}が割れた！`);
    const ft = new Set();
    for (const item of (pot.contents || [])) { placeItemAt(dg, px, py, item, ml, ft); }
    if (_remaining > 0) {
      ml.push(`${_remaining}個のランダムなアイテムが飛び出した！`);
      for (let i = 0; i < _remaining; i++) {
        const _ri = { ...pickWeighted(ITEMS), id: uid() };
        if (_ri.type === 'gold') _ri.value = rng(20, 80);
        placeItemAt(dg, px, py, _ri, ml, ft);
      }
    }
    return;
  }
  /* 回復の壺：命中した対象を回復（アンデッドはダメージ） */
  if (pot.potEffect === "heal_pot") {
    const _hpAmt = Math.max(0, (pot.capacity || 3) - (pot.contents?.length || 0)) * 100;
    ml.push(`${_pn}が割れた！`);
    if (_hpAmt > 0) {
      const _hm = monsterAt(dg, px, py);
      if (_hm) {
        if (_hm.kind === "undead") {
          _hm.hp -= _hpAmt;
          ml.push(`回復の光が${_hm.name}に${_hpAmt}ダメージを与えた！`);
          if (_hm.hp <= 0) killMonster(_hm, dg, p, ml, luFn);
        } else {
          const _prev = _hm.hp;
          _hm.hp = Math.min(_hm.maxHp, _hm.hp + _hpAmt);
          ml.push(`${_hm.name}のHPが${_hm.hp - _prev}回復した！`);
        }
      }
      if (p && p.x === px && p.y === py) {
        const _prevHp = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + _hpAmt);
        if (p.hp > _prevHp) ml.push(`HPが${p.hp - _prevHp}回復した！`);
      }
    }
    return;
  }
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
        /* 油がかかったマスの非永続罠を消滅 */
        const _oilTrap = dg.traps?.find(t => t.x === tx && t.y === ty && !t.permanent);
        if (_oilTrap) { dg.traps = dg.traps.filter(t => t !== _oilTrap); ml.push(`油で${_oilTrap.name}が消えた！`); }
      }
    }
    /* 油がかかったマスの魔方陣を消滅 */
    if (dg.pentacles?.length > 0) {
      const _oiledPcs = dg.pentacles.filter(pc => dg.oilyTiles.some(t => t.x === pc.x && t.y === pc.y));
      if (_oiledPcs.length > 0) {
        dg.pentacles = dg.pentacles.filter(pc => !_oiledPcs.includes(pc));
        for (const _opc of _oiledPcs) ml.push(`油が${_opc.name}を消した！`);
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

/* 吸い出しの巻物：壺を割らずに中身を吸い出して足元にばらまく
 * cursed=true の場合は壺を割って中身を散らかし、壺をインベントリから削除する。
 * 戻り値: { potRemovedAt: number|null }（cursedで壺を削除した場合のインベントリindex、それ以外はnull）。
 *   呼び出し側は scrollIdx 等の補正に使う。 */
export function extractPotContents(pot, dg, px, py, p, ml, luFn, blessed, cursed = false) {
  if (cursed) {
    scatterPotContents(pot, dg, px, py, p, ml, luFn);
    const _idx = p?.inventory ? p.inventory.indexOf(pot) : -1;
    if (_idx !== -1) p.inventory.splice(_idx, 1);
    ml.push("【呪】");
    return { potRemovedAt: _idx !== -1 ? _idx : null };
  }
  if (pot.potEffect === "gunpowder") {
    ml.push(`${pot.name}から火薬が吸い出され爆発した！`);
    doGunpowderExplosion(px, py, dg, p, ml, luFn, pot.name);
    return { potRemovedAt: null };
  }
  const _oilEffects = { olive: "オリーブオイル", sesame: "ごま油", butter: "バター" };
  if (_oilEffects[pot.potEffect] && (pot.contents?.length || 0) < (pot.capacity || 3)) {
    ml.push(`${pot.name}から${_oilEffects[pot.potEffect]}が溢れ出た！`);
    pushSplashAnim(px, py, "#ccaa44");
    dg.oilyTiles = dg.oilyTiles || [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = px + dx, ty = py + dy;
        if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) continue;
        if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) continue;
        if (!dg.oilyTiles.some(t => t.x === tx && t.y === ty)) dg.oilyTiles.push({ x: tx, y: ty });
        const _om = monsterAt(dg, tx, ty);
        if (_om) { _om.oilyTurns = (_om.oilyTurns || 0) + 100; ml.push(`${_om.name}は油まみれになった！(100ターン)`); }
        if (tx === p.x && ty === p.y) { p.oilyTurns = (p.oilyTurns || 0) + 100; ml.push("油を浴びた！炎ダメージが2倍になる！(100ターン)"); }
        const _ot = dg.traps?.find(t => t.x === tx && t.y === ty && !t.permanent);
        if (_ot) { dg.traps = dg.traps.filter(t => t !== _ot); ml.push(`油で${_ot.name}が消えた！`); }
      }
    }
    if (dg.pentacles?.length > 0) {
      const _opc = dg.pentacles.filter(pc => dg.oilyTiles.some(t => t.x === pc.x && t.y === pc.y));
      if (_opc.length > 0) { dg.pentacles = dg.pentacles.filter(pc => !_opc.includes(pc)); for (const _op of _opc) ml.push(`油が${_op.name}を消した！`); }
    }
  }
  const ft = new Set();
  if ((pot.contents?.length || 0) > 0) {
    ml.push(`${pot.name}から中身が飛び出した！`);
    for (const item of [...pot.contents]) { placeItemAt(dg, px, py, item, ml, ft); }
    pot.contents = [];
  } else {
    ml.push(`${pot.name}は空だった。`);
  }
  if (blessed) {
    pot.capacity = (pot.capacity || 1) + 1;
    ml.push(`${pot.name}の容量が1増えた！(${pot.capacity})【祝】`);
  }
  return { potRemovedAt: null };
}

/* ===== WEAPON / ARMOR ABILITIES ===== */
export const WEAPON_ABILITIES = [
  { id:"reach",         name:"長柄",      desc:"2マス先の敵まで攻撃できる" },
  { id:"bane_beast",    name:"獣特効",    desc:"獣系の敵(ネズミ・大蛇)に1.5倍ダメージ" },
  { id:"bane_undead",   name:"聖属性",    desc:"不死系の敵(スケルトン・ゾンビ・ヴァンパイア)に1.5倍ダメージ" },
  { id:"bane_undead_2", name:"上位聖属性",  desc:"不死系の敵(スケルトン・ゾンビ・ヴァンパイア)に2倍ダメージ（上位特効）" },
  { id:"bane_dragon_2", name:"上位竜特効",  desc:"竜系の敵(ドラゴン)に2倍ダメージ（上位特効）" },
  { id:"bane_float_2",  name:"上位浮遊特効",desc:"浮遊している敵(インプ・ガーゴイル・ヴァンパイア・デーモン)に2倍ダメージ（上位特効）" },
  { id:"bane_humanoid", name:"人特効",    desc:"人型の敵(コボルド・ゴブリン・オーク・トロル)に1.5倍ダメージ" },
  { id:"bane_dragon",   name:"竜特効",    desc:"竜系の敵(ドラゴン)に1.5倍ダメージ" },
  { id:"bane_float",    name:"浮遊特効",  desc:"浮遊している敵(インプ・ガーゴイル・ヴァンパイア・デーモン)に1.5倍ダメージ" },
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
  { id:"fire_elem",       name:"炎属性",      desc:"油まみれ・炎弱点の敵に1.5倍ダメージ、火ダルマには0.5倍ダメージ" },
  { id:"ice_elem",        name:"氷属性",      desc:"炎属性の敵(火ダルマ・氷竜以外の炎系)に1.5倍ダメージ" },
  { id:"thunder_elem",    name:"雷属性",      desc:"氷・水系の敵(氷竜・わてり)に1.5倍ダメージ" },
  { id:"fire_elem_2",     name:"上位炎属性",  desc:"油まみれ・炎弱点の敵に2倍ダメージ（上位特効）、火ダルマには0.5倍ダメージ" },
  { id:"ice_elem_2",      name:"上位氷属性",  desc:"炎属性の敵(火ダルマ・炎弱点の敵)に2倍ダメージ（上位特効）" },
  { id:"thunder_elem_2",  name:"上位雷属性",  desc:"氷・水系の敵(氷竜・わてり)に2倍ダメージ（上位特効）" },
  { id:"def_bonus",       name:"防御強化",  desc:"装備中、防御力が5上がる" },
  /* 呪い専用デメリット能力 */
  { id:"recoil",          name:"反動",      desc:"攻撃するたびに自分も2〜4ダメージを受ける",        curseOnly:true },
  { id:"gluttony",        name:"大食い",    desc:"装備中、空腹の進みが2倍になる",                  curseOnly:true },
  /* 祝福専用強力能力 */
  { id:"lifesteal",       name:"吸血",      desc:"攻撃時、与えたダメージの30%をHP回復する",        blessedOnly:true },
  { id:"double_strike",   name:"連撃",      desc:"通常攻撃が2回になる（2回目は威力60%）",          blessedOnly:true },
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
  /* 呪い専用デメリット能力 */
  { id:"frail",            name:"脆弱",     desc:"近接攻撃を受けた時、ダメージが+3増加する",         curseOnly:true },
  { id:"noisy",            name:"騒音",     desc:"部屋に入るたびに同部屋の敵が全員目を覚ます",       curseOnly:true },
  /* 祝福専用強力能力 */
  { id:"all_resist",       name:"万能耐性", desc:"炎・氷・雷のダメージをすべて半減する",             blessedOnly:true },
  { id:"aura",             name:"闘気",     desc:"毎ターン、隣接する敵全員に2ダメージを与える",       blessedOnly:true },
];

/* ===== TRAPS ===== */
export const TRAPS = [
  { name:"地雷",           effect:"explode",       tile:25, desc:"踏むと周囲8マスが大爆発。敵は即死、プレイヤーはHP半減。\n壁・罠・大箱・床のアイテムも破壊される。" },
  { name:"矢の罠",         effect:"arrow_trap",    tile:26, desc:"踏むと壁から矢が飛んでくる。\nダメージは小さいが序盤は注意。矢が落ちる。" },
  { name:"落とし穴",       effect:"pitfall",       tile:27, desc:"踏むと次のフロアに落ちる。\nアイテムも一緒に落ちる。" },
  { name:"錆の罠",         effect:"rust",          tile:28, desc:"踏むと装備中の武器or防具の＋値が-1される。\n金属製装備が対象。" },
  { name:"回転板",         effect:"spin",          tile:29, desc:"踏むとランダムな場所に吹き飛ばされる。\n飛んだ先の罠も発動する。" },
  { name:"睡眠ガスの罠",   effect:"sleep",         tile:30, desc:"踏むと6ターン眠る。\n耐眠の防具で防げる。" },
  { name:"毒矢の罠",       effect:"poison_arrow",  tile:45, desc:"踏むと壁から毒矢が飛んでくる。\nダメージ+毒状態。毒消しの指輪で毒は防げる。" },
  { name:"召喚の罠",       effect:"summon_trap",   tile:46, desc:"踏むと周囲に2～4体の敵が出現する。\n出現した敵は即座にこちらを認識している。" },
  { name:"鈍足の罠",       effect:"slow_trap",     tile:47, desc:"踏むと10ターン鈍足になる(速度半減)。\n耐鈍足の防具で防げる。" },
  { name:"封印の罠",       effect:"seal_trap",     tile:48, desc:"踏むと50ターン魔法が封印される。\n巻物・魔法・杖が使えなくなる。耐封印の防具で防げる。" },
  { name:"盗みの罠",       effect:"steal_trap",    tile:49, desc:"踏むと所持品が1つランダムにフロアのどこかへ飛ばされる。\nキーアイテムは盗まれない。" },
  { name:"空腹の罠",       effect:"hunger_trap",   tile:50, desc:"踏むと満腹度が最大の10%減少する。" },
  { name:"吹き飛ばしの罠", effect:"blowback_trap", tile:51, desc:"踏むと向いていた方向と逆に最大10マス吹き飛ぶ。\n壁に激突すると10ダメージ。敵に当たると5ダメージ。" },
  { name:"影ぬいの罠",     effect:"shadow_stitch", tile:71, desc:"踏むと5ターン移動不能になる。\n攻撃やアイテム使用は可能。" },
  { name:"落石の罠",       effect:"rockfall",      tile:72, desc:"踏むと岩が降ってきて15～25ダメージ。" },
  { name:"時限爆弾の罠",   effect:"time_bomb",     tile:73, desc:"踏むと4ターン後に大爆発が起きる。\n爆発は地雷と同じ威力。離れれば回避できる。\n作動済みの爆心地に薬液をかけると消火可能。\n作動済みは爆心地にカウントダウン表示。" },
  { name:"惑わしの罠",     effect:"bewitch_trap",  tile:84, desc:"踏むと50ターン幻惑状態。\n周囲の見た目が狂う。耐惑わしの防具で防げる。" },
  { name:"暗闇の罠",       effect:"darkness_trap", tile:85, desc:"踏むと20ターン暗闇状態。\n視界が1マスになる。耐暗闇の防具で防げる。" },
  { name:"腐敗の罠",       effect:"rot_trap",      tile:94, desc:"踏むと所持品の食料が1つランダムに腐る。\n腐った食料は満腹回復が0.3倍に。" },
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
  if (_blastedBB.length > 0) { _blastedBB.forEach(stageBigbox); dg.bigboxes = dg.bigboxes.filter(b => !_blastedBB.includes(b)); }
  if (blasted.size > 0) dg.items = dg.items.filter(it => !blasted.has(it));
  dg.monsters = dg.monsters.filter(m => m.hp > 0);
  /* 爆発範囲内の魔方陣を消滅 */
  if (dg.pentacles?.length > 0) {
    const _blastPcs = dg.pentacles.filter(pc =>
      Math.max(Math.abs(pc.x - cx), Math.abs(pc.y - cy)) <= 1
    );
    if (_blastPcs.length > 0) {
      dg.pentacles = dg.pentacles.filter(pc => !_blastPcs.includes(pc));
      for (const _bpc of _blastPcs) ml.push(`爆発で${_bpc.name}が消えた！`);
    }
  }
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

/** 火薬壺の爆発処理。中心から半径2マス（5×5=25マス）を対象にする。連鎖爆発あり。 */
let _gunpowderDepth = 0;
export function doGunpowderExplosion(cx, cy, dg, p, ml, luFn, srcLabel = "火薬壺") {
  if (_gunpowderDepth > 5) return;
  if (hasCursedExplosionPentacle(dg)) { ml.push(`呪われた爆発の魔方陣が${srcLabel}の爆発を打ち消した！`); return; }
  _gunpowderDepth++;
  try {
    pushExplosionAnim(cx, cy);
    ml.push(`${srcLabel}が爆発した！5×5マスに爆風！`);
    for (let ddx = -2; ddx <= 2; ddx++) {
      for (let ddy = -2; ddy <= 2; ddy++) {
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
      if (Math.max(Math.abs(it.x - cx), Math.abs(it.y - cy)) > 2) continue;
      if (it.type === "pot" && it.potEffect === "gunpowder") continue; /* 火薬壺は後で連鎖処理 */
      if (it.type === "scroll" || it.type === "spellbook") {
        _blasted.add(it); ml.push(`巻物「${it.name}」が爆風で燃えてなくなった！`);
      } else if (it.type === "potion") {
        _blasted.add(it); ml.push(`薬「${it.name}」が爆風で割れてなくなった！`);
      } else if (it.type === "food") {
        if (!it.cooked) { it.value *= 2; cookFoodMeta(it); it.name = "焼いた" + it.name; ml.push(`${it.name}になった！`); }
        else { burnFoodItem(it, ml); }
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
    for (let _gbbdx = -2; _gbbdx <= 2; _gbbdx++) {
      for (let _gbbdy = -2; _gbbdy <= 2; _gbbdy++) {
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
      Math.max(Math.abs(it.x - cx), Math.abs(it.y - cy)) <= 2
    );
    if (_chainPots.length > 0) {
      dg.items = dg.items.filter(i => !_chainPots.includes(i));
      for (const _gp of _chainPots) doGunpowderExplosion(_gp.x, _gp.y, dg, p, ml, luFn, _gp.name);
    }
    /* 爆発範囲内の魔方陣を消滅 */
    if (dg.pentacles?.length > 0) {
      const _blastPcs = dg.pentacles.filter(pc => Math.max(Math.abs(pc.x - cx), Math.abs(pc.y - cy)) <= 2);
      if (_blastPcs.length > 0) {
        dg.pentacles = dg.pentacles.filter(pc => !_blastPcs.includes(pc));
        for (const _bpc of _blastPcs) ml.push(`爆発で${_bpc.name}が消えた！`);
      }
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
          else { burnFoodItem(it, ml); }
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
  /* 爆発範囲内の魔方陣を消滅 */
  if (dg.pentacles?.length > 0) {
    const _blastPcs = dg.pentacles.filter(pc => Math.max(Math.abs(pc.x - cx), Math.abs(pc.y - cy)) <= R);
    if (_blastPcs.length > 0) {
      dg.pentacles = dg.pentacles.filter(pc => !_blastPcs.includes(pc));
      for (const _bpc of _blastPcs) ml.push(`爆発で${_bpc.name}が消えた！`);
    }
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
        _slm.sleepTurns = (_slm.sleepTurns || 0) + 6;
        ml.push(`${_slm.name}が眠りに落ちた！`);
      }
      if (p && p.x === tx && p.y === ty) {
        if (p.armor?.ability === "sleep_proof") {
          ml.push(`しかし眠れなかった！(耐眠)`);
        } else {
          p.sleepTurns = (p.sleepTurns || 0) + 6;
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
        const _stFinal = (_stItem.name === "ロングソード" && Math.random() < 0.10) ? { ...SOBURO_T, id: uid(), plus: _stItem.plus || 0 } : _stItem;
        placeItemAt(dg, _stX, _stY, _stFinal, ml, _stFt);
        ml.push(`${nameFn ? nameFn(_stItem) : _stItem.name}がどこかへ飛んでいった！${_stFinal !== _stItem ? "なぜかソボロ助広に変化した…！" : ""}`);
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
      /* 踏んだアイテム自体が食料なら腐らせる（既に腐っていればヤバイに） */
      if (item && item.type === "food" && !item.yabai) {
        const _itOrigName = item.name;
        const _itResult = rotFood(item);
        if (_itResult === "yabai") ml.push(`${_itOrigName}がヤバイことになった！`);
        else ml.push(`${_itOrigName}が腐ってしまった！`);
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
        const _rAllFoods = p.inventory.filter(i => i.type === "food" && !i.yabai);
        if (_rAllFoods.length > 0) {
          const _rTarget = _rAllFoods[rng(0, _rAllFoods.length - 1)];
          const _rOrigName = _rTarget.name;
          const _rRes = rotFood(_rTarget);
          if (_rRes === "yabai") ml.push(`${_rOrigName}がヤバイことになった！`);
          else ml.push(`${_rOrigName}が腐ってしまった！`);
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

export function makeStrongArrow(c = 1) {
  return { ...STRONG_ARROW_T, id:uid(), count:Math.min(99, c) };
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

export function addArrowsInv(inv, c, poison = false, pierce = false, maxInv = 30, bomb = false, strong = false) {
  let r = c;
  for (const i of inv) {
    if (i.type === "arrow" && !i.stone && !i.magicStone && !!i.poison === poison && !!i.pierce === pierce && !!i.bombArrow === bomb && !!i.strong === strong && i.count < 99) {
      const a = Math.min(r, 99 - i.count);
      i.count += a;
      r -= a;
      if (r <= 0) return true;
    }
  }
  while (r > 0) {
    if (inv.length >= maxInv) return false;
    const n = Math.min(r, 99);
    inv.push(bomb ? makeBombArrow(n) : pierce ? makePiercingArrow(n) : poison ? makePoisonArrow(n) : strong ? makeStrongArrow(n) : makeArrow(n));
    r -= n;
  }
  return true;
}

export function applyPotionEffect(eff, val, kind, target, dg, p, ml, luFn, blessed = false, cursed = false, killerMon = null) {
  if (kind === "monster") wakeIfDormant(target, ml);
  const _monKill = (mon) => {
    if (mon.hp <= 0) killMonster(mon, dg, p, ml, luFn, false, killerMon);
  };
  const _fireResist = (pl) =>
    hasAbility(pl.armor, "fire_resist");
  switch (eff) {
    case "water": // 水は通常のhealと同じ挙動
    case "heal_big":
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
            else if (eff === "heal" || eff === "heal_big") { const _up = (eff === "heal_big" ? 2 : 1) * (blessed ? 2 : 1); target.maxHp += _up; target.hp += _up; ml.push(`${target.name}のHP最大値が${_up}上昇した！`); pushHealAnim(target.x, target.y); }
          }
        }
        if (kind === "player") {
          const h = Math.min(Math.round(val * _mult), p.maxHp - p.hp);
          if (h > 0) { p.hp += h; ml.push(`HPが${h}回復した！${blessed ? "(祝福)" : ""}`); pushHealAnim(p.x, p.y); }
          else if (eff === "heal" || eff === "heal_big") { const _up = (eff === "heal_big" ? 2 : 1) * (blessed ? 2 : 1); p.maxHp += _up; p.hp += _up; ml.push(`HPが満タンだったのでHP最大値が${_up}上昇した！${blessed ? "(祝福)" : ""}`); pushHealAnim(p.x, p.y); }
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
          target.poisonedTurns = Math.max(target.poisonedTurns || 0, _poisonTurns);
          if (!target.poisonHalfAtk) {
            target.poisonOrigAtk = target.atk;
            target.atk = Math.max(1, Math.floor(target.atk / 2));
            target.poisonHalfAtk = true;
          }
          ml.push(`${target.name}は毒を浴びた！${dmg}ダメージ！毒状態になり攻撃力が半減した！${blessed ? "(強毒)" : ""}`);
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
        const t = blessed ? 12 : 6;
        if (kind === "monster") {
          if (!isStatusImmune(target, ml, target.name)) { target.sleepTurns = (target.sleepTurns || 0) + t; ml.push(`${target.name}は眠りに落ちた！(${t}ターン)${blessed ? "(強眠)" : ""}`); }
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
        // 呪い→混乱解消 + 必中100ターン（攻撃・投擲が外れなくなる）
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

/** 調理済み食糧をさらに加熱して「焦げた」またはヤバイ状態にする共通ヘルパー */
export function burnFoodItem(item, ml) {
  if (item.yabai) { return false; }
  if (item.burnt) {
    _upgradeToYabai(item);
    ml.push(`${item.name}になった！`);
    return "yabai";
  }
  if (item.name.startsWith("焼いた")) {
    item.name = "焦げた" + item.name.slice("焼いた".length);
  } else {
    item.name = "焦げた" + item.name;
  }
  item.value = Math.max(1, Math.floor(item.value / 2));
  item.burnt = true;
  ml.push(`${item.name}になった！`);
  return true;
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
      item.desc = "魔法が消えてしまった。魔法の筆(5回分)で好きな魔法書に変えられる。";
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
      item.desc = "何も書かれていない。魔法の筆で書き込める。";
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

export function splashPotion(dg, cx, cy, eff, val, p, ml, luFn, blessed = false, cursed = false, dnFn = null, killerMon = null) {
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
      applyPotionEffect(eff, val, "monster", mon, dg, p, ml, luFn, blessed, cursed, killerMon);
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
    /* 作動済み時限爆弾を薬液で消火 */
    if (dg.pendingBombs?.length > 0) {
      const _pbI = dg.pendingBombs.findIndex(pb => pb.x === x && pb.y === y);
      if (_pbI >= 0) {
        dg.pendingBombs.splice(_pbI, 1);
        ml.push("時限爆弾の罠が薬液で消火された！");
      }
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
    /* 特殊変化：ロングソード→エクスカリバー(5%)、短剣→猫の爪(5%)、バトルアクス/戦神の斧→ゴールデンアクス(20%) */
    if (item.name === "ロングソード" && Math.random() < 0.05) {
      const _oldPlus = item.plus || 0;
      const _oldAbs = [...new Set([...(item.abilities || []), ...(item.ability ? [item.ability] : [])])].filter(Boolean);
      Object.assign(item, { ...EXCALIBUR_T, id: item.id, plus: Math.max(0, _oldPlus) });
      const _newAbs = [...new Set([..._oldAbs, EXCALIBUR_T.ability])];
      item.abilities = _newAbs; item.ability = _newAbs[0];
      ml.push("ロングソードが泉の中で聖なる光を放ち...エクスカリバーに変化した！");
    } else if (item.name === "短剣" && Math.random() < 0.05) {
      const _oldPlus = item.plus || 0;
      const _oldAbs = [...new Set([...(item.abilities || []), ...(item.ability ? [item.ability] : [])])].filter(Boolean);
      Object.assign(item, { ...CAT_CLAW_T, id: item.id, plus: Math.max(0, _oldPlus) });
      const _newAbs = [...new Set([..._oldAbs, CAT_CLAW_T.ability])];
      item.abilities = _newAbs; item.ability = _newAbs[0];
      ml.push("短剣が泉の中で鋭い輝きを放ち...猫の爪に変化した！");
    } else if ((item.name === "バトルアクス" || item.name === "戦神の斧") && Math.random() < 0.20) {
      const _oldName = item.name;
      const _oldPlus = item.plus || 0;
      const _oldAbs = [...new Set([...(item.abilities || []), ...(item.ability ? [item.ability] : [])])].filter(Boolean);
      Object.assign(item, { ...GOLDEN_AXE_T, id: item.id, plus: Math.max(0, _oldPlus) });
      const _newAbs = [...new Set([..._oldAbs, GOLDEN_AXE_T.ability])];
      item.abilities = _newAbs; item.ability = _newAbs[0];
      ml.push(_oldName + "が泉の中で黄金の輝きを放ち...ゴールデンアクスに変化した！");
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
      item.desc = "何も書かれていない。魔法の筆で書き込める。";
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
      item.desc = "魔法が消えてしまった。魔法の筆(5回分)で好きな魔法書に変えられる。";
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
          /* チャージを消費した分は返金しない（0回でも基本価値分は返金） */
          let _refundVal = item.shopPrice;
          if (item._origCharges != null && item.charges != null && item._origCharges > 0 && item.charges < item._origCharges) {
            const _priceOrig = itemPrice({ ...item, charges: item._origCharges });
            const _priceCur  = itemPrice({ ...item, charges: item.charges });
            _refundVal = _priceOrig > 0 ? Math.max(0, Math.round(item.shopPrice * (_priceCur / _priceOrig))) : 0;
            item.shopPrice = _refundVal; /* 次に拾われた時の値段を更新 */
          }
          _iShop.unpaidTotal = Math.max(0, _iShop.unpaidTotal - _refundVal);
          if (_iShop.unpaidTotal === 0) {
            const sk = dg.monsters.find(m => m.id === _iShop.shopkeeperId && m.state === "blocking");
            if (sk) moveShopkeeperHome(sk, _iShop, dg);
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
    placeItemAt(dg, m.x, m.y, { name: "ボスの財宝", type: "gold", value: _gv, tile: 22, id: uid() }, ml, _ft, 0, p);
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
    /* 高レア巻物 (A/Sランク、tier数分) S確率15% */
    const _scAPool = ITEMS.filter(i => i.type === "scroll" && i.rarity === "A");
    const _scSPool = ITEMS.filter(i => i.type === "scroll" && i.rarity === "S");
    const _scFallback = ITEMS.filter(i => i.type === "scroll" && i.rarity !== "D");
    for (let _si = 0; _si < _tier; _si++) {
      const _useS = _scSPool.length > 0 && _scAPool.length > 0 && Math.random() < 0.15;
      const _scPick = _useS ? pick(_scSPool) : pick(_scAPool.length ? _scAPool : _scFallback);
      placeItemAt(dg, m.x, m.y, { ..._scPick, id: uid() }, ml, _ft, 0, p);
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
    /* 収納上手の巻物（tier1=5階ボスのみ確定） */
    if (_tier === 1) {
      const _expandScroll = ITEMS.find(i => i.effect === "expand_inv");
      if (_expandScroll) placeItemAt(dg, m.x, m.y, { ..._expandScroll, id: uid() }, ml, _ft, 0, p);
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
  /* レプラコーン：盗んでいたゴールドをその場に落とす */
  if (m.baseKind === "leprechaun" && (m.heldGold || 0) > 0) {
    const _ft = new Set();
    placeItemAt(dg, m.x, m.y, { name: "金貨", type: "gold", value: m.heldGold, tile: 22, id: uid() }, ml, _ft, 0, p);
    ml.push(`${m.name}が持っていた金貨${m.heldGold}枚が転がり出た！`);
    m.heldGold = 0;
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
  /* 矢・石・杖は5%でドロップ */
  if (m.subtype === "archer" && Math.random() < 0.05) {
    const _aLv = m.monLevel || 1;
    drops.push(_aLv >= 3 ? makePiercingArrow(rng(2, 5)) : _aLv >= 2 ? makeStrongArrow(rng(3, 6)) : makeArrow(rng(3, 8)));
  }
  if (m.subtype === "stonethrow" && Math.random() < 0.05) {
    const lvl = m.monLevel || 1;
    drops.push(lvl >= 3 ? makeMagicStone(rng(1, 3)) : makeStone(rng(2, 5)));
  }
  if (m.subtype === "wanduser" && Math.random() < 0.05) {
    const _wt = pick(WANDS);
    drops.push({ ..._wt, id: uid(), charges: Math.max(1, rng(1, _wt.charges)) });
  }
  /* ゴブリン系：15%でゴブリンバットをドロップ */
  if (m.baseKind === "goblin" && Math.random() < 0.15) {
    drops.push({ ...GOBLIN_BAT_T, id: uid() });
  }
  /* ランナー（コロポックル等）：必ずアイテムを1つドロップ */
  if (m.subtype === "runner") {
    const _pool = [...ITEMS.filter(i => i.type !== "gold"), ...WANDS, ...RINGS];
    const _t = pick(_pool);
    const _di = { ..._t, id: uid() };
    if (_di.type === "pen")  _di.charges = rng(2, 3);
    else if (_di.type === "wand") _di.charges = Math.max(1, _di.charges + rng(-1, 1));
    drops.push(_di);
  }
  /* 5% ランダムドロップ（一般モンスター） */
  if (Math.random() < 0.05) {
    const _pool = [...ITEMS.filter(i => i.type !== "gold"), ...WANDS, ...RINGS];
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
  /* 復活の魔方陣チェック：魔方陣上/同部屋内でHPゼロになったら全回復で復活（使い捨て） */
  if (dg.pentacles?.length > 0) {
    const _revPc = dg.pentacles.find(pc => {
      if (pc.kind !== "revival" || pc.cursed) return false;
      if (pc.x === mx && pc.y === my) return true;
      if (pc.blessed) {
        const _pr = dg.rooms?.find(r => pc.x >= r.x && pc.x < r.x + r.w && pc.y >= r.y && pc.y < r.y + r.h);
        return _pr && mx >= _pr.x && mx < _pr.x + _pr.w && my >= _pr.y && my < _pr.y + _pr.h;
      }
      return false;
    });
    if (_revPc) {
      mon.hp = mon.maxHp;
      ml.push(`${mon.name}は復活の魔方陣の力でHP全回復！`);
      return;
    }
  }
  if (killerMon) {
    ml.push(`${mon.name}は${killerMon.name}に倒された！`);
  } else if (noExp || !p) {
    ml.push(`${mon.name}は消し飛んだ！(経験値なし)`);
  } else {
    const _soyMul = (p.soyExpTurns || 0) > 0 ? 1.3 : 1;
    const _expGain = Math.floor(mon.exp * _soyMul);
    ml.push(`${mon.name}を倒した！(+${_expGain}exp${_soyMul > 1 ? " 醤油効果!" : ""})`);
    p.exp += _expGain;
  }
  monsterDrop(mon, dg, ml, p);
  removeMonster(dg, mon);
  /* スケルトン：50%で骨を残し5ターン後に復活 */
  if (mon.baseKind === "skeleton" && Math.random() < 0.5) {
    /* 骨の配置先：アイテム・罠・階段・大箱・泉と重ならないマスをDRO(24マス)で探す */
    const _boneBlocked = (bx, by) => {
      const _tile = dg.map[by]?.[bx];
      if (!_tile || _tile === T.WALL || _tile === T.BWALL) return true;
      if (_tile === T.SD || _tile === T.SU) return true;
      if (dg.items.some(i => i.x === bx && i.y === by)) return true;
      if (dg.traps.some(t => t.x === bx && t.y === by)) return true;
      if (dg.bigboxes?.some(b => b.x === bx && b.y === by)) return true;
      if (dg.springs?.some(s => s.x === bx && s.y === by)) return true;
      if (dg.oilyTiles?.some(t => t.x === bx && t.y === by)) return true;
      return false;
    };
    /* 足元が空いていればその場、塞がっていれば DRO 順で最初の空きマス */
    let _bx = null, _by = null;
    for (const [dx, dy] of DRO) {
      if (!_boneBlocked(mx + dx, my + dy)) { _bx = mx + dx; _by = my + dy; break; }
    }
    if (_bx === null) {
      ml.push(`${mon.name}の骨は行き場がなく消えた。`);
      return;
    }
    dg.traps.push({
      id: uid(), name: "骨", effect: "bone", tile: 107,
      x: _bx, y: _by, revealed: true, permanent: false,
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

/* ===== 直線投擲の共通処理（公開API） =====
 * shooter: 投擲元 ({x, y, name, hp?, atk?})。hp未定義の場合は仮想射手扱いで反射時のダメージを適用しない（押し出し用）
 * item: 投げられるアイテム（type別に命中時挙動が分岐：potion→splash、pot→中身散乱、wand→効果発動、他→投擲ダメージ）
 * range: 飛距離（壁・敵・スプリング等で停止）
 * 戻り値: {x, y, consumed, splash?, spring?, bigbox?, hitMonster?, hitPlayer?}
 *   shop chargeなどの post-processing は呼び出し側で行う
 *
 * 用途例:
 *   - 吹き飛ばしの杖でアイテム飛翔
 *   - 弾き師(itemblast)が所持品を弾く
 *   - 盗投士(stealthrower)が盗んだアイテムを投げる
 *   - 将来: 落ちているアイテムを投げてくる敵
 *   - 将来: アイテム飛翔系の新規杖
 */
export function throwItemAlongLine(shooter, dg, item, dx, dy, range, ml, p, luFn, opts = {}) {
  const {
    bbFn = null,
    nameFn = (it) => it.name,
    applyWandFn = null,
    killerMon = null,
    reflectorRange = range,
    animColor = item.type === "potion" ? "#88ccff" : "#ffdd44",
    monHitMsg = (target, dmg) => `飛んできた${nameFn(item)}が${target.name}に命中！${dmg}ダメージ！`,
    plHitMsg = (dmg) => `飛んできた${nameFn(item)}がプレイヤーに命中！${dmg}ダメージ！`,
    potHitMsg = (target, dmg) => `飛んできた${nameFn(item)}が${target.name}に当たって割れた！${dmg}ダメージ！`,
    potPlHitMsg = (dmg) => `飛んできた${nameFn(item)}がプレイヤーに当たって割れた！${dmg}ダメージ！`,
    /* 薬瓶/杖の命中前置きメッセージ（splash/applyWandの前に push される） */
    potionHitMsg = null,         /* (target) => string|null */
    potionPlHitMsg = null,       /* () => string|null */
    wandHitMsg = null,           /* (target) => string|null */
    wandPlHitMsg = null,         /* () => string|null */
    /* 着弾位置別メッセージ（指定があれば push） */
    springLandMsg = null,        /* (spr, lx, ly) => string|null */
    bigboxLandMsg = null,        /* (bb, lx, ly) => string|null */
    noHitLandMsg = null,         /* (lx, ly, item) => string|null（壁/末端で何にも当たらず着地時） */
    deathCausePhrase = `飛んできた${item.name}に`,
  } = opts;

  const _isPotion = item.type === "potion";
  const _isPot = item.type === "pot";
  const _isWand = item.type === "wand";
  const _isBombArrow = item.type === "arrow" && item.bombArrow;
  const _isPierceArrow = item.type === "arrow" && item.pierce;
  const _itemName = nameFn(item);
  const res = { x: shooter.x, y: shooter.y, consumed: false };

  /* 通常投擲ダメージ計算（武器は+値含む、それ以外は3+rng(0,3)） */
  const _projDmg = () => Math.max(1, (item.type === "weapon" ? (item.atk || 3) + (item.plus || 0) : 3) + rng(0, 3));
  /* 壺投擲ダメージ（破損衝撃） */
  const _potDmg = () => Math.max(1, 3 + rng(0, 3));

  _resolveBolt(shooter, dg, p, ml, luFn, {
    dx, dy,
    baseRange: range,
    reflectorRange,
    boltName: _itemName,
    animColor,
    pierce: _isPierceArrow,
    onMonHit: (mon, mlx) => {
      if (_isPotion) {
        if (potionHitMsg) { const _m = potionHitMsg(mon); if (_m) mlx.push(_m); }
        res.consumed = true; res.splash = true; res.x = mon.x; res.y = mon.y; res.hitMonster = mon;
        return;
      }
      if (_isWand) {
        if (wandHitMsg) { const _m = wandHitMsg(mon); if (_m) mlx.push(_m); }
        res.consumed = true; res.x = mon.x; res.y = mon.y; res.hitMonster = mon;
        return;
      }
      weakenOrClearParalysis(mon, mlx);
      const dmg = _isPot ? _potDmg() : _projDmg();
      mon.hp -= dmg;
      mlx.push(_isPot ? potHitMsg(mon, dmg) : monHitMsg(mon, dmg));
      /* ヤバイ食料：追加ダメ+状態異常複合 */
      if (item.type === "food" && item.yabai && mon.hp > 0) {
        const _yDmg = rng(15, 25);
        mon.hp -= _yDmg;
        mlx.push(`ヤバイ食料が${mon.name}に食べさせられた！さらに${_yDmg}ダメージ！`);
        if (mon.hp > 0) {
          mon.poisoned = true;
          mon.confusedTurns = (mon.confusedTurns || 0) + 5;
          mon.fleeingTurns = (mon.fleeingTurns || 0) + 10;
          mon.slowTurns = (mon.slowTurns || 0) + 10;
          mlx.push(`${mon.name}は毒・混乱・幻惑・鈍足状態になった！`);
        }
      }
      /* 腐/焦げ食料（非ヤバイ）：攻撃力半減 */
      if (item.type === "food" && (item.rotten || item.burnt) && !item.yabai && mon.hp > 0) {
        mon.atk = Math.max(1, Math.floor((mon.atk || 1) / 2));
        mlx.push(`${item.rotten ? "腐った" : "焦げた"}食料を食べさせられた${mon.name}の攻撃力が半減した！`);
      }
      if (mon.hp <= 0) killMonster(mon, dg, p, mlx, luFn, false, killerMon);
      res.consumed = true; res.x = mon.x; res.y = mon.y; res.hitMonster = mon;
    },
    customPlHit: (mlx) => {
      if (_isPotion) {
        if (potionPlHitMsg) { const _m = potionPlHitMsg(); if (_m) mlx.push(_m); }
        res.consumed = true; res.splash = true; res.x = p.x; res.y = p.y; res.hitPlayer = true;
        return;
      }
      if (_isWand) {
        if (wandPlHitMsg) { const _m = wandPlHitMsg(); if (_m) mlx.push(_m); }
        res.consumed = true; res.x = p.x; res.y = p.y; res.hitPlayer = true;
        return;
      }
      const dmg = _isPot ? _potDmg() : _projDmg();
      p.deathCause = deathCausePhrase;
      p.hp -= dmg;
      mlx.push(_isPot ? potPlHitMsg(dmg) : plHitMsg(dmg));
      if (p.sleepTurns > 0) { p.sleepTurns = 0; mlx.push("衝撃で目が覚めた！"); }
      /* ヤバイ食料：追加ダメ+状態異常複合 */
      if (item.type === "food" && item.yabai) {
        const _yDmg = rng(15, 25);
        p.hp -= _yDmg;
        p.deathCause = "跳ね返されたヤバイ食料に当たって";
        mlx.push(`ヤバイ食料がぶつかって食べさせられた！さらに${_yDmg}ダメージ！`);
        if (hasRingEffect(p, "antidote_ring")) {
          mlx.push("毒消しの指輪が毒を防いだ！");
        } else {
          p.poisoned = true;
          mlx.push("食中毒になった！毒状態になった！");
        }
        p.confusedTurns = (p.confusedTurns || 0) + 5;
        p.slowTurns = (p.slowTurns || 0) + 10;
        mlx.push("混乱・鈍足状態になった！");
      } else if (item.type === "food" && item.rotten && !item.yabai) {
        if (hasRingEffect(p, "antidote_ring")) {
          mlx.push("毒消しの指輪が毒を防いだ！");
        } else {
          p.poisoned = true;
          mlx.push("腐った食料がぶつかった！毒状態になった！");
        }
      }
      res.consumed = true; res.x = p.x; res.y = p.y; res.hitPlayer = true;
    },
    onSpring: (spr, lx, ly, mlx) => {
      if (springLandMsg) { const _m = springLandMsg(spr, lx, ly); if (_m) mlx.push(_m); }
      res.consumed = true; res.spring = spr; res.x = lx; res.y = ly;
    },
    onBigbox: (bb, lx, ly, mlx) => {
      if (bigboxLandMsg) { const _m = bigboxLandMsg(bb, lx, ly); if (_m) mlx.push(_m); }
      res.consumed = true; res.bigbox = bb; res.x = lx; res.y = ly;
    },
    onTrap: (trap, lx, ly, mlx) => {
      if (_isPotion) {
        res.consumed = true; res.splash = true; res.x = lx; res.y = ly;
        return "destroyed";
      }
      trap.revealed = true;
      const ft = new Set(); ft.add(trap.id);
      const r = fireTrapItem(trap, item, dg, lx, ly, mlx, ft, p);
      const _entBreakChance = (trap.effect === "steal_trap" || trap.effect === "summon_trap") ? 0.5 : 0.25;
      if (trap.effect !== "explode" && !trap.permanent && Math.random() < _entBreakChance) {
        dg.traps = dg.traps.filter(t => t !== trap);
        mlx.push(`${trap.name}は壊れた。`);
      }
      if (r === "destroyed") { res.consumed = true; return "destroyed"; }
      res.x = lx; res.y = ly; res.consumed = false;
    },
    onWallStop: (lx, ly) => { res.x = lx; res.y = ly; },
    onFlyOff: (lx, ly) => { res.x = lx; res.y = ly; },
  });

  /* 着弾後のアイテム種別ごとの処理 */
  /* noHitLandMsg：何も命中せず着地（壁/末端）した時のメッセージ。spring/bigbox は専用msg利用、対象命中時は不要 */
  const _noHit = !res.spring && !res.bigbox && !res.hitMonster && !res.hitPlayer;
  if (res.spring) {
    soakItemIntoSpring(res.spring, item, ml, dg, nameFn);
  } else if (res.bigbox) {
    if (bbFn) bbFn(res.bigbox, item, dg, ml);
    else { const ft = new Set(); placeItemAt(dg, res.x, res.y, item, ml, ft); }
  } else if (_isPotion) {
    if (_noHit && noHitLandMsg) { const _m = noHitLandMsg(res.x, res.y, item); if (_m) ml.push(_m); }
    splashPotion(dg, res.x, res.y, item.effect, item.value || 0, p, ml, luFn, item.blessed || false, item.cursed || false, nameFn, killerMon);
  } else if (_isPot) {
    if (_noHit && noHitLandMsg) { const _m = noHitLandMsg(res.x, res.y, item); if (_m) ml.push(_m); }
    scatterPotContents(item, dg, res.x, res.y, p, ml, luFn, nameFn);
  } else if (_isWand) {
    if ((res.hitMonster || res.hitPlayer) && applyWandFn) {
      const wbm = item.blessed ? 1.5 : item.cursed ? 0.5 : 1;
      if (res.hitMonster) applyWandFn(item.effect, "monster", res.hitMonster, dx, dy, dg, p, ml, luFn, bbFn, wbm, nameFn);
      else if (res.hitPlayer) applyWandFn(item.effect, "player", p, dx, dy, dg, p, ml, luFn, bbFn, wbm, nameFn);
    } else {
      if (_noHit && noHitLandMsg) { const _m = noHitLandMsg(res.x, res.y, item); if (_m) ml.push(_m); }
      const ft = new Set();
      placeItemAt(dg, res.x, res.y, item, ml, ft);
    }
  } else if (_isBombArrow) {
    /* 爆弾矢：着弾点で爆発（呪われた爆発の魔方陣でない場合） */
    if (hasCursedExplosionPentacle(dg)) {
      ml.push("呪われた爆発の魔方陣が爆弾矢の爆発を打ち消した！");
    } else {
      ml.push("爆発！");
      doExplosion(res.x, res.y, dg, p, ml, nameFn, "爆弾矢の爆発", null, luFn);
    }
  } else if (_isPierceArrow) {
    /* 貫きの矢：終端で消滅（床に置かない） */
    if (_noHit && noHitLandMsg) { const _m = noHitLandMsg(res.x, res.y, item); if (_m) ml.push(_m); }
  } else if (!res.consumed) {
    if (_noHit && noHitLandMsg) { const _m = noHitLandMsg(res.x, res.y, item); if (_m) ml.push(_m); }
    const ft = new Set();
    placeItemAt(dg, res.x, res.y, item, ml, ft);
  }

  return res;
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
    /* kind === "item" は throwItemAlongLine() に移行済み（呼び出し側で直接呼ぶ） */
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

/* 飛び道具ダメージ計算（近接と同じ式、武器ATKの代わりに矢/石ATKを参照） */
export function calcProjectileDmg(p, arAtk, def = 0) {
  const _ringBonus = (p.rings || []).reduce((s, r) => r.effect === "power_ring" ? s + (r.plus || 0) : s, 0);
  const ap = Math.max(1, Math.floor(
    (p.atk + arAtk + _ringBonus)
    * ((p.spicyAtkTurns || 0) > 0 ? 1.5 : 1)
    * ((p.atkDebuffTurns || 0) > 0 ? 0.5 : 1)
    * ((p.lemonThrowTurns || 0) > 0 ? 1.5 : 1)
  ));
  return Math.max(1, Math.floor(ap * ap / (ap + def)) + rng(-2, 2));
}

export function shootArrow(p, dg, idx, dx, dy, ml, luFn, bbFn, animFn = null, outgoingBolt = null) {
  const st = p.inventory[idx];
  if (!st || st.type !== "arrow") return;
  st.count--;
  if (st.count <= 0) p.inventory.splice(idx, 1);
  const _isPoison = !!st.poison;
  const _isPierce = !!st.pierce;
  const _arAtk = st.atk || 3;
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
          const _refDmg = calcProjectileDmg(p, _arAtk, 0);
          p.hp -= _refDmg;
          if (_isPoison && !hasRingEffect(p, "antidote_ring")) {
            p.poisoned = true;
            ml.push(`跳ね返された${_arName}がプレイヤーに命中！${_refDmg}ダメージ！毒を受けた！`);
          } else if (_isPoison) {
            ml.push(`跳ね返された${_arName}がプレイヤーに命中！${_refDmg}ダメージ！しかし指輪が毒を消した！`);
          } else {
            ml.push(`跳ね返された${_arName}がプレイヤーに命中！${_refDmg}ダメージ！消滅した。`);
          }
        } else if (_rx !== tx || _ry !== ty) {
          const _rft = new Set();
          placeItemAt(dg, _rx, _ry, _dropItem(), ml, _rft);
        }
        hit = true; break;
      }
      if (consumeBarrier(m, ml)) { hit = true; break; }
      const _arDmg = clampDmgFixed(m, calcProjectileDmg(p, _arAtk, m.def), true);
      m.hp -= _arDmg;
      if (_isPoison) {
        if (m.isBoss) {
          if (!m.bossPoisonHalfAtk) { m.bossPoisonOrigAtk = m.atk; m.bossPoisonHalfAtk = true; m.bossPoisonHalfAtkTurns = 10; }
          m.atk = Math.max(1, Math.floor(m.atk / 2));
        } else {
          m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
        }
      }
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

/* 支払い後に店主を空きマスへ戻す（homePos が塞がっている場合は店内の別フロアタイルへ） */
export function moveShopkeeperHome(sk, shop, dg) {
  sk.state = "friendly";
  const hp = sk.homePos;
  const occ = (x, y) => dg.monsters.some(m => m !== sk && m.x === x && m.y === y);
  if (!occ(hp.x, hp.y)) { sk.x = hp.x; sk.y = hp.y; return; }
  const r = shop.room;
  for (let ry = r.y; ry < r.y + r.h; ry++)
    for (let rx = r.x; rx < r.x + r.w; rx++)
      if (dg.map[ry]?.[rx] === T.FLOOR && !occ(rx, ry)) { sk.x = rx; sk.y = ry; return; }
  sk.x = hp.x; sk.y = hp.y; /* フォールバック */
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
    if (target.magicImmune) { ml.push(`魔法は${target.name}に効かない！`); return; }
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
          const _lweak = _lm.elemWeak === "thunder" ? 1.5 : 1;
          const _ld = Math.round(rng(22, 32) * _lvF * _lweak) * _lcmsB;
          _lm.hp -= _ld;
          ml.push(`雷の魔法が${_lm.name}に命中！${_ld}ダメージ！${_lweak > 1 ? "雷弱点！" : ""}`);
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
      if (kind === "monster") { const t = 5 + lv; target.sleepTurns = (target.sleepTurns || 0) + t; ml.push(`眠りの魔法が${target.name}に命中！${t}ターン眠りについた！`); }
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
    if (mon) {
      wakeIfDormant(mon, ml);
      if (mon.magicImmune) {
        ml.push(`魔法は${mon.name}に効かない！`);
      } else if (mon.subtype === "magicreflect") {
        ml.push(`${mon.name}が魔法を跳ね返した！`);
        const _rfLvF = 1 + (lv - 1) * 0.2;
        switch (spell.effect) {
          case "fire_bolt": { const _rd = Math.round(rng(20, 30) * _rfLvF); p.hp -= _rd; p.deathCause = "反射された炎の魔法で"; ml.push(`炎の魔法が跳ね返ってきた！${_rd}ダメージ！`); break; }
          case "ice_bolt": { const _rd = Math.round(rng(15, 22) * _rfLvF); p.hp -= _rd; p.deathCause = "反射された氷の魔法で"; ml.push(`氷の魔法が跳ね返ってきた！${_rd}ダメージ！`); break; }
          case "lightning_magic": { const _rd = Math.round(rng(22, 32) * _rfLvF); p.hp -= _rd; p.deathCause = "反射された雷の魔法で"; ml.push(`雷の魔法が跳ね返ってきた！${_rd}ダメージ！`); break; }
          case "sleep_bolt": {
            const _rt = 5 + lv;
            if ((p.statusImmune || 0) > 0) { ml.push("眠りの魔法が跳ね返ってきた！しかし状態防止中のため効かなかった！"); }
            else if (hasAbility(p.armor, "sleep_proof")) { ml.push("眠りの魔法が跳ね返ってきた！しかし防具が防いだ！(耐眠)"); }
            else { p.sleepTurns = (p.sleepTurns || 0) + _rt; ml.push(`眠りの魔法が跳ね返ってきた！${_rt}ターン眠った！`); }
            break;
          }
          case "poison_bolt": {
            if (hasRingEffect(p, "antidote_ring")) { ml.push("毒の魔法が跳ね返ってきたが指輪が毒を消した！"); }
            else { p.poisonedTurns = (p.poisonedTurns || 0) + Math.round(10 * _rfLvF); p.poisoned = true; ml.push("毒の魔法が跳ね返ってきた！毒に侵された！"); }
            break;
          }
          case "paralyze_magic": {
            if ((p.statusImmune || 0) > 0) { ml.push("金縛りの魔法が跳ね返ってきた！しかし状態防止中のため効かなかった！"); }
            else if (hasAbility(p.armor, "paralyze_proof")) { ml.push("金縛りの魔法が跳ね返ってきた！しかし防具が防いだ！(耐金縛り)"); }
            else { p.paralyzed = true; p.paralyzeTurns = (p.paralyzeTurns || 0) + 10; ml.push("金縛りの魔法が跳ね返ってきた！金縛りになった！(10ターン)"); }
            break;
          }
          case "teleport_other": { const _rtf = []; for (let _rty = 0; _rty < MH; _rty++) for (let _rtx = 0; _rtx < MW; _rtx++) if (dg.map[_rty][_rtx] === T.FLOOR && !(p.x === _rtx && p.y === _rty) && !dg.monsters.some(m => m.x === _rtx && m.y === _rty)) _rtf.push({ x: _rtx, y: _rty }); if (_rtf.length > 0) { const _rtd = pick(_rtf); p.x = _rtd.x; p.y = _rtd.y; ml.push("テレポートの魔法が跳ね返ってきた！どこかへ飛ばされた！"); } break; }
          case "drain_hp": { const _rd = Math.round(rng(15, 25) * _rfLvF); p.hp -= _rd; p.deathCause = "反射されたHP吸収の魔法で"; ml.push(`HP吸収の魔法が跳ね返ってきた！${_rd}ダメージ！`); break; }
          case "transform_magic": { const _th = rng(-10, 10); p.hp += _th; if (_th < 0) p.deathCause = "反射された変化の魔法で"; ml.push(`変化の魔法が跳ね返ってきた！${_th >= 0 ? `体に変化が...HP+${_th}` : `体に異変が...HP${_th}`}`); break; }
          default: ml.push("魔法が跳ね返ってきた！しかし効果はなかった。"); break;
        }
      } else {
        applySpellEffect(spell.effect, "monster", mon, dx, dy, dg, p, ml, luFn, lv);
      }
      return { x: tx, y: ty, hitType: "monster" };
    }
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
  { name: "力の指輪",       type:"ring", effect:"power_ring",   plus:0, rarity:"D", weight:5, sellPrice:1000, tile:60, desc:"装備中、＋値の分だけ攻撃力が増える。合成や強化で＋値を上げられる。" },
  { name: "守りの指輪",     type:"ring", effect:"defense_ring", plus:0, rarity:"D", weight:5, sellPrice:1000, tile:60, desc:"装備中、＋値の分だけ防御力が増える。合成や強化で＋値を上げられる。" },
  { name: "命の指輪",       type:"ring", effect:"life_ring",    plus:0, rarity:"D", weight:5, sellPrice:1200, tile:60, desc:"装備中、＋値×5だけ最大HPが増える。合成や強化で＋値を上げられる。" },
  { name: "遠投の指輪",     type:"ring", effect:"farcast_ring",         rarity:"C", weight:2, sellPrice:1500, tile:60, desc:"装備中、常に遠投状態で物を投げられる。" },
  { name: "浮遊の指輪",     type:"ring", effect:"float_ring",           rarity:"B", weight:2, sellPrice:1500, tile:60, desc:"装備中、罠にかからなくなる。\nただし階段を降りられなくなる。" },
  { name: "毒消しの指輪",   type:"ring", effect:"antidote_ring",        rarity:"C", weight:2, sellPrice:1000, tile:60, desc:"装備中、毒が無効になる。" },
  { name: "値切りの指輪",   type:"ring", effect:"bargain_ring",         rarity:"B", weight:2, sellPrice:2500, tile:60, desc:"装備中、店のアイテムが3割引で買える。" },
  { name: "魔物呼びの指輪", type:"ring", effect:"spawn_ring",           rarity:"C", weight:2, sellPrice:500,  tile:60, desc:"装備中、敵が現れやすくなる。" },
  { name: "下手投げの指輪", type:"ring", effect:"miss_throw_ring",      rarity:"C", weight:2, sellPrice:500,  tile:60, desc:"装備中、投げたものが必ず外れるようになる。" },
  { name: "回復の指輪",     type:"ring", effect:"regen_ring",           rarity:"B", weight:2, sellPrice:1200, tile:60, desc:"装備中、お腹の減り方と自然回復の量が倍になる。" },
  { name: "爆発の指輪",     type:"ring", effect:"explode_ring",         rarity:"C", weight:1, sellPrice:2000, tile:60, desc:"装備時に自分が爆発する。装備中もたまに爆発する。" },
  { name: "松明の指輪",     type:"ring", effect:"torch_ring",           rarity:"B", weight:2, sellPrice:3000, tile:60, desc:"装備中、視界範囲が1マス広がる。2つ装備すれば2マス広がる。" },
  { name: "腹持ちの指輪",   type:"ring", effect:"stomach_ring",          rarity:"A", weight:1, sellPrice:5000, tile:60, desc:"装備中、満腹度の減りが半分になる。" },
  { name: "透視の指輪",     type:"ring", effect:"clairvoyance_ring",      rarity:"S", weight:2, sellPrice:10000, tile:60, desc:"装備中、壁越しでもモンスターの位置が見え続ける。" },
  { name: "感知の指輪",     type:"ring", effect:"detect_ring",            rarity:"S", weight:2, sellPrice:10000, tile:60, desc:"装備中、フロア全体の落ちているアイテムの位置が見え続ける。" },
  { name: "吸血の指輪",     type:"ring", effect:"vampire_ring",           rarity:"A", weight:2, sellPrice:3000, tile:60, desc:"装備中、近接攻撃で与えたダメージの8分の1だけHPを吸収する。" },
  { name: "背水の指輪",     type:"ring", effect:"desperation_ring",       rarity:"B", weight:2, sellPrice:3500, tile:60, desc:"装備中、HPが低いほど会心率が上昇する。\nHP75%以下から発動し、HP20%以下で必ず会心になる。" },
  { name: "射撃の指輪",     type:"ring", effect:"shoot_ring",             rarity:"B", weight:2, sellPrice:4000, tile:60, desc:"装備中、近接攻撃時に装備中の矢を1本消費して追加発射する。\n2個装備で2本発射。" },
];

export function hasRingEffect(p, effect) {
  return p.rings?.some(r => r.effect === effect) ?? false;
}

/* ===== 食料の腐敗 ===== */
/* food アイテムに「腐った」接頭語を付け、rotten:true フラグを立てる */
/* 既に腐っている場合はヤバイに昇格する。食料以外には適用しない。 */
function _upgradeToYabai(item) {
  let baseName = item.name;
  for (const pfx of ["腐った", "焦げた", "焼いた"]) {
    if (baseName.startsWith(pfx)) { baseName = baseName.slice(pfx.length); break; }
  }
  item.name = "ヤバイ" + baseName;
  item.yabai = true;
  item.rotten = true;
  item.burnt = true;
  item.value = 1;
}

export function rotFood(item) {
  if (item.type !== "food") return false;
  if (item.yabai) return false;
  if (item.rotten) {
    _upgradeToYabai(item);
    return "yabai";
  }
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
