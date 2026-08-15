import { rng, pick, uid, clamp, MW, MH, T, TI, DRO, removeFloorItem, destroyItemMimicFloorItem, ensureItemMimicFloorItems, monsterAt, itemAt, removeMonster, getShops, hasAbility, hasGravityPentacle, hasCursedGravityPentacle, consumeBarrier, clampDmgFixed, shuffle, randomTeleportDest, getDodgePentacleMode, isEvasionDisabledByStatus, calcAtkDefDmg, stepProjectile } from './utils.js';
import { materializeFakeStair, tryBreakStatueAt, hitStatueWithAction } from './fixtures.js';
import { findFixedPortalPair, statueAt } from './fixtureQueries.js';
import { stageBigbox } from './DiscoveryTracker.js';
import {
  findMonsterRoom as findRoom,
  pickTransformMonsterDef,
  monLevelDown,
  monLevelUp,
  monsterFireDamageLabel as monFireDmgLabel,
  resolveMonsterBolt as _resolveBolt,
  scaleMonsterFireDamage as scaleMonFireDmg,
  spawnMonsters,
  wakeIfDormant,
} from './monsterRuntime.js';
import { pushAnim, pushExplosionAnim, pushSplashAnim, pushHealAnim, pushItemArcAnim, pushPlayerTeleportAnim, pushPlayerKnockbackAnim } from './animEvents.js';
import {
  LOOT_LUCK, LOOT_UNIFORM_CHANCE, MONSTER_RANDOM_DROP_RATE, RARITY_ORDER, RARITY_RANK, RARITY_WEIGHT,
  isRarityAtLeast, monsterRandomDropChance, pickByWeight, pickLootFromPool, pickWeighted, rarityAtLeast,
} from './lootRules.js';
import { statusTurns, PERMANENT_TURNS, isPermanentTurns, applyMonsterParalyze, applyPlayerPoison, clearPlayerPoison } from './statusDuration.js';
import {
  monEffectiveMagicImmune, monReflectsProjectiles, monReflectsMagic, monEffectiveFloat,
  monEffectiveFixedDamageOnly,
} from './monTraits.js';
import { pl } from './playerLabel.js';
import { isRevivalSuppressedAt, REVIVAL_SUPPRESS_MSG } from './revivalRules.js';
import { isFloorOccupancyBlocked } from './floorObjectPlacement.js';

export {
  LOOT_LUCK, LOOT_UNIFORM_CHANCE, MONSTER_RANDOM_DROP_RATE, RARITY_ORDER, RARITY_RANK, RARITY_WEIGHT,
  isRarityAtLeast, monsterRandomDropChance, pickLootFromPool, pickWeighted, rarityAtLeast,
} from './lootRules.js';

export function getFixtureItemDeps() {
  return {
    traps: TRAPS,
    items: ITEMS,
    wands: WANDS,
    pickTrap,
    pickLootFromPool,
    resolveItemName,
  };
}

/* ポータルの魔方陣の別フロア参照（Game.jsx から getter を登録） */
let _portalFloorsGetter = () => null;
export function setPortalFloorsGetter(fn) { _portalFloorsGetter = fn; }

/* 未識別の罠などが種別識別セットに触るための getter（Game.jsx から登録） */
let _trapIdentGetter = () => null;
export function setTrapIdentGetter(fn) { _trapIdentGetter = fn; }
export function getTrapIdentSet() { return _trapIdentGetter?.() || null; }

/* ポータル着地時の転送ヘルパー：成功時は placeItemAt の結果、対象なし/失敗時は null */
function _tryItemPortalWarp(dg, portal, item, ml, ft, dep, p) {
  /* 固定転送：ペアのみ（ペンポータルと非接続） */
  if (portal.kind === "fixed_portal") {
    const _pair = findFixedPortalPair(dg, portal);
    if (!_pair) return null;
    if (dg.monsters?.some(m => m.x === _pair.x && m.y === _pair.y)) return null;
    ml.push(`${resolveItemName(item)}が${portal.name}に吸い込まれて対の転送陣から出てきた！`);
    return placeItemAt(dg, _pair.x, _pair.y, item, ml, ft, dep + 1, p, _pair.x, _pair.y, true);
  }
  if (portal.cursed) {
    const _rd = randomTeleportDest(dg, portal.x, portal.y);
    if (_rd) {
      ml.push(`${resolveItemName(item)}が${portal.name}に飲み込まれて飛んだ！【呪】`);
      return placeItemAt(dg, _rd.x, _rd.y, item, ml, ft, dep + 1, p, _rd.x, _rd.y, true);
    }
    return null;
  }
  const _hasGoal = p?.inventory?.some(i => i.type === "goal");
  const _cycle = [{ portal, dg, depth: portal.floor }];
  for (const _pc of dg.pentacles) {
    if (_pc !== portal && _pc.kind === "portal" && !_pc.cursed && !_pc.fixed) {
      _cycle.push({ portal: _pc, dg, depth: portal.floor });
    }
  }
  const _allFloors = _portalFloorsGetter();
  if (!_hasGoal && _allFloors) {
    for (const [_dStr, _fdg] of Object.entries(_allFloors)) {
      if (!_fdg.pentacles) continue;
      for (const _pc of _fdg.pentacles) {
        if (_pc.kind !== "portal" || _pc.cursed || _pc.fixed || _pc.kind === "fixed_portal") continue;
        if (!(portal.blessed && _pc.blessed)) continue;
        _cycle.push({ portal: _pc, dg: _fdg, depth: parseInt(_dStr) });
      }
    }
  }
  if (_cycle.length < 2) return null;
  _cycle.sort((a, b) => (a.portal.drawOrder || 0) - (b.portal.drawOrder || 0));
  const _idx = _cycle.findIndex(e => e.portal === portal);
  for (let _off = 1; _off < _cycle.length; _off++) {
    const _next = _cycle[(_idx + _off) % _cycle.length];
    if (_next.dg.monsters?.some(m => m.x === _next.portal.x && m.y === _next.portal.y)) continue;
    const _crossFloor = _next.dg !== dg;
    ml.push(_crossFloor
      ? `${resolveItemName(item)}が${portal.name}に吸い込まれて地下${_next.depth}階の${_next.portal.name}から出てきた！`
      : `${resolveItemName(item)}が${portal.name}に吸い込まれて${_next.portal.name}から出てきた！`);
    return placeItemAt(_next.dg, _next.portal.x, _next.portal.y, item, ml, ft, dep + 1, p, _next.portal.x, _next.portal.y, true);
  }
  return null;
}
import {
  RAW_FOODS, COOKED_FOODS_SAVORY, COOKED_FOODS_SWEET, COOKED_FOODS,
  FOOD_CAT_MAP, POT_CAT_BONUS, foodMatchesPotCategory,
  RAW_SIZES, COOKED_SIZES, FOOD_EFFECTS, FOOD_DESCS,
} from './foodData.js';
export { RAW_FOODS, COOKED_FOODS_SAVORY, COOKED_FOODS_SWEET, COOKED_FOODS, RAW_SIZES, COOKED_SIZES, FOOD_EFFECTS, FOOD_DESCS };

/* wands.js に分離した関数を re-export（既存の import 元を維持） */
let _wandBreakEffectHandler = null;
export function setWandBreakEffectHandler(handler) {
  _wandBreakEffectHandler = handler;
}

function _triggerWandBreakEffect(...args) {
  if (!_wandBreakEffectHandler) {
    throw new Error("杖破壊効果のhandlerが未登録です");
  }
  return _wandBreakEffectHandler(...args);
}

/* ===== 状態異常防止チェックヘルパー ===== */
export function isStatusImmune(entity, ml, name = null) {
  if ((entity.statusImmune || 0) <= 0) return false;
  if (ml) ml.push(name ? `${name}には効かなかった！(状態防止中)` : "状態防止中のため効かなかった！");
  return true;
}

/**
 * プレイヤーへの状態異常を防ぐ（statusImmune → 防具耐性）。
 * @returns {boolean} true = 防いだ
 */
export function blockPlayerStatus(p, ml, { proofAbility = null, proofMsg = null } = {}) {
  if (!p) return false;
  if (isStatusImmune(p, ml)) return true;
  if (proofAbility && hasAbility(p.armor, proofAbility)) {
    if (ml) ml.push(proofMsg || "しかし防具が防いだ！");
    return true;
  }
  return false;
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

/**
 * プレイヤー向けアイテム表示名。未識別は偽名。
 * nameFn があれば優先、なければ Game が登録する __rogueItemNameFn を使う。
 * （fixtures 等の循環 import 回避用）
 */
export function resolveItemName(it, nameFn = null) {
  if (!it) return "?";
  if (typeof nameFn === "function") {
    try { return nameFn(it); } catch (_) { /* fall through */ }
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.__rogueItemNameFn === "function") {
    try { return globalThis.__rogueItemNameFn(it); } catch (_) { /* fall through */ }
  }
  return it.name || "?";
}

/**
 * 売却の巻物の結果メッセージ。未識別アイテムは、確定処理で識別状態を
 * 変える前に渡された表示名解決関数で表示する。
 */
export function formatSoldItemMessage(item, earned, blessed = false, cursed = false, nameFn = null) {
  const name = resolveItemName(item, nameFn);
  if (blessed) return `${name}を${earned}Gで換金した！（2倍）【祝】`;
  if (cursed) return `${name}を${earned}Gで換金した…（半額）【呪】`;
  return `${name}を${earned}Gで換金した！`;
}

/**
 * 種別の未識別（偽名）はないが、インスタンス単位で祝呪の既知/不明があるタイプ。
 * 武器・防具・食料は getIdentKey が null でも fullIdent/bcKnown で祝呪表示を制御する。
 */
export function isBcInstanceType(it) {
  return !!it && (it.type === "weapon" || it.type === "armor" || it.type === "food");
}

/** 祝呪（と装備の完全識別）が判明しているか */
export function itemBcKnown(it) {
  return !!(it && (it.fullIdent || it.bcKnown));
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
  { name:"回復薬",           type:"potion", effect:"heal",      value:30,  rarity:"E", weight:12, sellPrice:100,  desc:"HPを30回復する。HP最大時は最大HP+1。\n呪い：反転して21ダメージ。",                                               tile:16 },
  { name:"大回復薬",         type:"potion", effect:"heal_big",  value:60,  rarity:"C", weight:4,  sellPrice:350,  desc:"HPを60回復する。HP最大時は最大HP+2。\n呪い：反転して42ダメージ。",                                               tile:17 },
  { name:"超回復薬",         type:"potion", effect:"superheal", value:100, rarity:"B", weight:2,  sellPrice:1200, desc:"HPを100回復する。HP最大時は最大HP+3。\n呪い：反転して50ダメージ。", tile:17 },
  { name:"毒薬",             type:"potion", effect:"poison",   value:15, rarity:"D", weight:8,  sellPrice:150,  desc:"飲むと攻撃力が下がり、毒の間は自然回復せず毎ターンHPが減る。\n呪い：反転して解毒+攻撃力回復。\n投げると毒液が飛散する。", tile:16 },
  { name:"炎の薬",           type:"potion", effect:"fire",     value:20, rarity:"D", weight:8,  sellPrice:180,  desc:"飲むと炎ダメージを受ける。耐火装備で軽減（個別or万能2/3・両方半減）。\n呪い：反転してHP回復。\n投げると炎上し周囲にダメージ。", tile:17 },
  { name:"睡眠薬",           type:"potion", effect:"sleep",    value:4,  rarity:"D", weight:8,  sellPrice:150,  desc:"飲むと6ターン眠る。\n投げると命中した敵を眠らせる。",           tile:16 },
  { name:"鈍足の薬",         type:"potion", effect:"slow",     value:0,  rarity:"D", weight:8,  sellPrice:150,  desc:"飲むと10ターン鈍足になる（速度×0.5）。\n投げると命中した敵を鈍足にする。", tile:16 },
  { name:"金縛りの薬",       type:"potion", effect:"paralyze", value:0,  rarity:"D", weight:8,  sellPrice:180,  desc:"飲むと10ターン金縛りになる。\n投げると命中した敵を金縛りにする。", tile:16 },
  { name:"力の薬",           type:"potion", effect:"power",    value:3,  rarity:"B", weight:2,  sellPrice:1500, desc:"飲むと攻撃力+3。",           tile:17 },
  { name:"テレポートの巻物", type:"scroll", effect:"teleport",           rarity:"D", weight:8, sellPrice:150,  desc:"ランダムな場所にテレポートする。\n呪い：この冒険で訪れた階層を選んで移動できる。",                         tile:18 },
  { name:"マップの巻物",     type:"scroll", effect:"reveal",             rarity:"C", weight:4,  sellPrice:500,  desc:"フロア全体と罠が明らかになる。\n呪い：マップと罠の位置を全て忘れる。", tile:18 },
  { name:"武器強化の巻物",   type:"scroll", effect:"weapon_up",          rarity:"B", weight:2,  sellPrice:800,  desc:"選んだ武器・または＋値のつく指輪の＋値を1上げる。",  tile:18 },
  { name:"防具強化の巻物",   type:"scroll", effect:"armor_up",           rarity:"B", weight:2,  sellPrice:800,  desc:"選んだ防具・または＋値のつく指輪の＋値を1上げる。",  tile:18 },
  { name:"雷の巻物",         type:"scroll", effect:"thunder",            rarity:"C", weight:4,  sellPrice:500,  desc:"視界内の敵全てに雷ダメージ(30-40)。\n呪い：自分にも同ダメージ。", tile:18 },
  { name:"回復の巻物",       type:"scroll", effect:"recovery",           rarity:"D", weight:8,  sellPrice:100,  desc:"自分と視界内全員がHP+50回復。\n呪い：自分含め視界内全員に35ダメージ。", tile:18 },
  { name:"道具寄せの巻物",   type:"scroll", effect:"item_gather",        rarity:"C", weight:4,  sellPrice:400,  desc:"フロアのアイテムを自分の周りに引き寄せる。\n呪い：アイテムをフロアにランダム散布。",     tile:18 },
  { name:"眠りの巻物",       type:"scroll", effect:"sleep_scroll",       rarity:"C", weight:4,  sellPrice:600,  desc:"視界内の敵を6ターン眠らせる。", tile:18 },
  { name:"混乱の巻物",       type:"scroll", effect:"confusion",           rarity:"C", weight:4,  sellPrice:500,  desc:"視界内の敵を20ターン混乱させる。", tile:18 },
  { name:"炎の巻物",         type:"scroll", effect:"flame",               rarity:"C", weight:4,  sellPrice:550,  desc:"視界内の敵に炎ダメージ(30-40)。油まみれの対象は2倍。\n呪い：自分にも同ダメージ。", tile:18 },
  { name:"強化解除の巻物",   type:"scroll", effect:"debuff",              rarity:"C", weight:4,  sellPrice:600,  desc:"視界内の敵のバフを全て解除する。", tile:18 },
  { name:"壁崩しの巻物",     type:"scroll", effect:"break_wall",          rarity:"C", weight:4,  sellPrice:300,  desc:"半径5の壁を全て壊す。\n呪い：周囲を壁に変える。",             tile:18 },
  { name:"金縛りの巻物",     type:"scroll", effect:"bind",                rarity:"C", weight:4,  sellPrice:600,  desc:"周囲8マスの敵を金縛りにする。", tile:18 },
  { name:"聖域のペン",       type:"pen",    effect:"sanctuary",     charges:2, rarity:"A", weight:1,  sellPrice:4000, desc:"足元に聖域の魔方陣を描く。\nモンスターは通過・攻撃できなくなる。\n呪い：自分が弾き出され踏むと即死。", tile:42 },
  { name:"脆弱のペン",       type:"pen",    effect:"vulnerability", charges:2, rarity:"C", weight:4,  sellPrice:1200,  desc:"足元に脆弱の魔方陣を描く。\n同じ部屋にいる者全員の受けるダメージが2倍になる。", tile:42 },
  { name:"魔封じのペン",     type:"pen",    effect:"magic_seal",    charges:2, rarity:"C", weight:4,  sellPrice:1500,  desc:"足元に魔封じの魔方陣を描く。\n部屋内では一切の魔法が無効になる。外からの魔法弾も消える。", tile:42 },
  { name:"雷のペン",         type:"pen",    effect:"thunder_trap",  charges:2, rarity:"D", weight:8,  sellPrice:600,  desc:"足元に雷の魔方陣を描く。真上にいると毎ターン25ダメージ。\n呪い：逆に毎ターン25回復。", tile:42 },
  { name:"遠投のペン",       type:"pen",    effect:"farcast",       charges:2, rarity:"C", weight:4,  sellPrice:1500,  desc:"足元に遠投の魔方陣を描く。部屋内で投げたものが壁まで貫通して飛ぶ。\n呪い：射程が1マスになる。", tile:42 },
  { name:"明かりのペン",     type:"pen",    effect:"light",         charges:2, rarity:"C", weight:4,  sellPrice:700,  desc:"足元に明かりの魔方陣を描く。\n同じ部屋の地形・敵・アイテムが全て見える。\n呪い：視界1マスに。", tile:42 },
  { name:"テレポートのペン", type:"pen",    effect:"teleport_trap", charges:2, rarity:"C", weight:4,  sellPrice:1200,  desc:"足元にテレポートの魔方陣を描く。\n描いた瞬間ランダムテレポート。部屋内で毎ターン確率でTP。\n呪い：テレポート無効化。", tile:42 },
  { name:"罠のペン",         type:"pen",    effect:"trap_gen",      charges:2, rarity:"C", weight:4, sellPrice:300,  desc:"足元に罠の魔方陣を描く。\n毎ターン確率で部屋に罠が増える（別部屋でも発動）。\n呪い：毎ターン高確率で罠が消える。", tile:42 },
  { name:"石飛ばしのペン",   type:"pen",    effect:"stone_throw",   charges:2, rarity:"C", weight:4,  sellPrice:800,  desc:"足元に石飛ばしの魔方陣を描く。\n部屋内のキャラに毎ターン25%で魔法の石が飛ぶ（命中100%）。\n回避はみかわし魔方陣・みかわしの服・オリーブ油のみ。\n呪い：回復効果。", tile:42 },
  { name:"吹き飛ばしのペン", type:"pen",    effect:"knockback_aura",charges:2, rarity:"B", weight:2,  sellPrice:3500,  desc:"足元に吹き飛ばしの魔方陣を描く。\n部屋内で近接攻撃を受けた者が5マス吹き飛ぶ。\n呪い：1マスだけ。", tile:42 },
  { name:"爆発のペン",       type:"pen",    effect:"explosion",     charges:2, rarity:"C", weight:4,  sellPrice:1500, desc:"足元に爆発の魔方陣を描く。\n部屋内で倒された敵が爆発し周囲8マスにHP3/4ダメージ。壁・罠・大箱・魔方陣も破壊。\n呪い：炎・雷を不発に。", tile:42 },
  { name:"囮のペン",         type:"pen",    effect:"decoy",         charges:2, rarity:"A", weight:1,  sellPrice:4000,  desc:"足元に囮の魔方陣を描く。\n部屋内の敵がプレイヤーを無視して魔方陣に集まり、陣取ると動かなくなる。\n近づいた敵同士は互いに攻撃し合う。", tile:42 },
  { name:"ただのペン",       type:"pen",    effect:"plain",         charges:2, rarity:"E", weight:12, sellPrice:50,   desc:"何も起こらない魔方陣を描く。\n他のペンに合成してインクを補充できる。", tile:42 },
  { name:"重力のペン",       type:"pen",    effect:"gravity",       charges:2, rarity:"C", weight:4,  sellPrice:1500,  desc:"足元に重力の魔方陣を描く。\n部屋内：浮遊不可・敵が罠にかかる・吹飛ばし/飛びつき無効。\n水上の浮遊系敵は即死。\n呪い：全員浮遊状態。", tile:42 },
  { name:"みかわしのペン",   type:"pen",    effect:"dodge",         charges:2, rarity:"B", weight:2,  sellPrice:3500, desc:"足元にみかわしの魔方陣を描く。\n部屋内で投げ物・矢・石が必ず外れる(魔法・炎は除く)。\n呪い：逆に必ず命中。", tile:42 },
  { name:"等速のペン",       type:"pen",    effect:"equal_speed",   charges:2, rarity:"C", weight:4,  sellPrice:1800, desc:"足元に等速の魔方陣を描く。\n部屋内の全員が速度に関わらず1回行動になる。\n呪い：全員鈍足。", tile:42 },
  { name:"回復のペン",       type:"pen",    effect:"heal_aura",     charges:2, rarity:"C", weight:4,  sellPrice:1500,  desc:"足元に回復の魔方陣を描く。\n部屋内の全員が毎ターン5HP回復。アンデッドには逆効果。\n呪い：逆に5ダメージ。", tile:42 },
  { name:"復活のペン",       type:"pen",    effect:"revival",       charges:2, rarity:"A", weight:1,  sellPrice:8000,  desc:"足元に復活の魔方陣を描く。\n魔方陣の上でHPがゼロになった者はHP全回復で復活する（敵味方問わず・使い捨て）。\n呪い：同じ部屋での蘇りをすべて封じる（MP復活・復活魔方陣・骨からの復活など）。", tile:42 },
  { name:"ポータルのペン",   type:"pen",    effect:"portal",        charges:2, rarity:"B", weight:2,  sellPrice:3500,  desc:"足元にポータルの魔方陣を描く。\n同じフロアに2個書くと魔方陣同士が繋がりワープできる。\n上に投げたものも反対側から出てくる。\n呪い：ランダムワープになる。", tile:42 },
  { name:"短剣",             type:"weapon", atk:3,                       rarity:"E", weight:12, sellPrice:50,   desc:"軽いダガー。",                     tile:20 },
  { name:"ロングソード",     type:"weapon", atk:6,                       rarity:"D", weight:8,  sellPrice:300,  desc:"冒険者の定番武器。",               tile:20 },
  { name:"バトルアクス",     type:"weapon", atk:10,                      rarity:"C", weight:4,  sellPrice:1200, desc:"重厚な戦斧。",                     tile:20 },
  { name:"ドラゴンキラー",   type:"weapon", atk:8,  ability:"bane_dragon",   rarity:"B", weight:2,  sellPrice:2500, desc:"ドラゴン系に1.5倍ダメージを与える特効剣。",         tile:20 },
  { name:"ゾンビキラー",     type:"weapon", atk:6,  ability:"bane_undead",   rarity:"B", weight:2,  sellPrice:2000, desc:"アンデッド系に1.5倍ダメージを与える聖剣。", tile:20 },
  { name:"バードキラー",     type:"weapon", atk:5,  ability:"bane_float",    rarity:"B", weight:2,  sellPrice:1500, desc:"浮遊している敵に1.5倍ダメージを与える槍。",   tile:20 },
  { name:"戦神の斧",         type:"weapon", atk:8,  ability:"critical",      rarity:"B", weight:2,  sellPrice:2500, desc:"25%の確率で会心の一撃（2倍ダメージ）が出る斧。",  tile:20 },
  { name:"つるはし",         type:"weapon", atk:4,  ability:"pickaxe", durability:30, rarity:"D", weight:8, sellPrice:250, desc:"壁を掘れる。使い過ぎると壊れる。", tile:20 },
  { name:"影縫いの刃",       type:"weapon", atk:6,  ability:"inflict_immobile", rarity:"C", weight:4, sellPrice:1200, desc:"攻撃時25%の確率で敵の移動を2〜3ターン封じる。", tile:20 },
  { name:"炎の剣",           type:"weapon", atk:7,  ability:"fire_elem",     rarity:"C", weight:4,  sellPrice:1500, desc:"炎属性の剣。油まみれ・炎弱点の敵に1.5倍ダメージ。", tile:20 },
  { name:"氷の剣",           type:"weapon", atk:7,  ability:"ice_elem",      rarity:"C", weight:4,  sellPrice:1500, desc:"氷属性の剣。氷弱点の敵に1.5倍ダメージ。",     tile:20 },
  { name:"雷の剣",           type:"weapon", atk:7,  ability:"thunder_elem",  rarity:"C", weight:4,  sellPrice:1500, desc:"雷属性の剣。雷弱点の敵に1.5倍ダメージ。",             tile:20 },
  { name:"グラットンソード", type:"weapon", atk:7,  ability:"def_bonus",     rarity:"C", weight:4,  sellPrice:1800, desc:"装備中は防御力が5上がる重厚な剣。",                                   tile:20 },
  { name:"革の鎧",           type:"armor",  def:2,                       rarity:"E", weight:12, sellPrice:50,   desc:"軽い鎧。",                         tile:21 },
  { name:"鎖帷子",           type:"armor",  def:5,                       rarity:"D", weight:8,  sellPrice:300,  desc:"斬撃に強い鎧。", tile:21 },
  { name:"プレートメイル",   type:"armor",  def:10,                      rarity:"B", weight:2,  sellPrice:1200, desc:"最強の重装鎧。",                   tile:21 },
  { name:"ゴムゴムの胴",     type:"armor",  def:4,  ability:"lightning_resist", rarity:"C", weight:4, sellPrice:1000, desc:"雷ダメージを2/3に軽減（万能耐性併用で半減）。雷によるアイテム破壊を防ぐ。", tile:21 },
  { name:"ドラゴンメイル",   type:"armor",  def:8,  ability:"fire_resist",   rarity:"B", weight:2,  sellPrice:3000, desc:"竜の鱗製。炎ダメージを2/3に軽減（万能耐性併用で半減）。アイテムを炎から守る。", tile:21 },
  { name:"刃の鎧",           type:"armor",  def:4,  ability:"thorn",         rarity:"C", weight:4,  sellPrice:900,  desc:"近接攻撃で受けたダメージの1/3を反射する。",       tile:21 },
  { name:"みかわしの服",     type:"armor",  def:2,  ability:"dodge",         rarity:"C", weight:4,  sellPrice:1200, desc:"軽くて動きやすく、25%の確率で攻撃を回避する。",   tile:21 },
  { name:"反射の鎧",         type:"armor",  def:5,  ability:"wand_reflect",  rarity:"B", weight:2,  sellPrice:3000, desc:"モンスターの杖魔法を反射する神秘の鎧。",          tile:21 },
  { name:"護盗の鎧",         type:"armor",  def:3,  ability:"anti_steal",    rarity:"C", weight:4,  sellPrice:500,  desc:"装備するとコソドロに所持品を盗まれなくなる。\n盗みの罠も無効化する。",    tile:21 },
  { name:"ゴールドメイル",   type:"armor",  def:6,  ability:"no_degrade",    rarity:"B", weight:2,  sellPrice:2500, desc:"錆びず＋値が下がらない黄金の鎧。",               tile:21 },
  { name:"氷竜のウロコ",     type:"armor",  def:5,  ability:"ice_resist",    rarity:"C", weight:4,  sellPrice:1500, desc:"氷竜の鱗製。氷ダメージを2/3に軽減（万能耐性併用で半減）。\n氷による移動封じ・鈍足を防ぐ。",  tile:21 },
  { name:"アーマーガッパ",   type:"armor",  def:4,  ability:"water_proof",   rarity:"C", weight:4,  sellPrice:1400, desc:"河童の甲羅を模した鎧。水鉄砲・ずぶ濡れを無効化する。\n所持品が水で白紙化・縮小・インク減りしない。", tile:21 },
  { name:"マナ回復薬",       type:"potion", effect:"mana",     value:20, rarity:"D", weight:8,  sellPrice:120,  desc:"MPを20回復する。MP最大時は最大MP+1。\n投げると敵に特技常用化(呪：永続封印)。",                 tile:16 },
  { name:"封印の薬",         type:"potion", effect:"seal",     value:0,  rarity:"D", weight:8,  sellPrice:200,  desc:"飲むとMP封印50ターン。\n呪い：MP封印を解除。\n投げると命中した敵を封印状態にする。", tile:16 },
  { name:"混乱の薬",         type:"potion", effect:"confuse",  value:5,  rarity:"D", weight:8,  sellPrice:180,  desc:"飲むと5ターン混乱する。\n投げると敵を20ターン混乱(祝：40T、呪：混乱解除)。", tile:16 },
  { name:"暗闇の薬",         type:"potion", effect:"darkness",           rarity:"C", weight:4,  sellPrice:300,  desc:"飲むと視界が1マスになる(20ターン)。\n呪い：反転してモンスター感知100ターン。\n投げると敵を50ターン暗闇に(祝：永続、呪：暗闇解除)。", tile:16 },
  { name:"惑わしの薬",       type:"potion", effect:"bewitch",            rarity:"C", weight:4,  sellPrice:300,  desc:"飲むと50ターン周囲の見た目が狂う。\n呪い：反転してフロアの罠を全て看破。\n投げると敵を50ターン逃走させる(祝：永続、呪：逃走解除)。", tile:16 },
  { name:"レベルアップの薬", type:"potion", effect:"levelup",            rarity:"A", weight:1,  sellPrice:5000, desc:"飲むとレベルが1上がる。\n呪い：1階上にワープ。\n投げると敵がレベルアップ(祝：2段階、呪：レベルダウン)。", tile:17 },
  { name:"金貨",             type:"gold",   value:1,                     desc:"金貨。",                           tile:22 },
  { name:"識別の巻物", type:"scroll", effect:"identify",          rarity:"D", weight:8,  sellPrice:250,
    desc:"持ち物から1つ選んで識別する。\n呪い：識別を解除。", tile:18 },
  { name:"複製の巻物", type:"scroll", effect:"duplicate",         rarity:"A", weight:1,  sellPrice:6000,
    desc:"持ち物から1つ選んで複製する。\n呪い：選んだものが消える。", tile:18 },
  { name:"売却の巻物", type:"scroll", effect:"sell_item",         rarity:"C", weight:4,  sellPrice:600,
    desc:"持ち物から1つ選んで換金する。\n呪い：半額。", tile:18 },
  { name:"変換の巻物", type:"scroll", effect:"transform_item",    rarity:"B", weight:2,  sellPrice:700,
    desc:"持ち物から1つ選んで別のアイテムに変える。\n呪い：レアリティが低いものに変化。", tile:18 },
  { name:"錬成の巻物", type:"scroll", effect:"forge_item",        rarity:"B", weight:2,  sellPrice:2000,
    desc:"持ち物の武器か防具を1つ選んでランダムな能力を付与する。\n呪い：役に立たない能力。", tile:18 },
  { name:"召喚の巻物", type:"scroll", effect:"summon",            rarity:"E", weight:12, sellPrice:50,
    desc:"敵を4体召喚する。\n呪い：部屋内の敵を別の部屋に飛ばす。", tile:18 },
  { name:"収納上手の巻物", type:"scroll", effect:"expand_inv",   rarity:"B", weight:2,  sellPrice:800,
    desc:"最大所持数が1～3増える。", tile:18 },
  { name:"罠の巻物", type:"scroll", effect:"trap_scatter",        rarity:"E", weight:12, sellPrice:30,
    desc:"読むと同じフロアの部屋内に大量の罠が出現する。\n呪い：フロア内の全ての罠が消える。", tile:18 },
  { name:"吸い出しの巻物", type:"scroll", effect:"pot_extract",   rarity:"C", weight:4,  sellPrice:600,
    desc:"選んだ壺の中身を足元にばらまく。", tile:18 },
  { name:"自爆の巻物", type:"scroll", effect:"self_destruct",      rarity:"B", weight:2,  sellPrice:700,
    desc:"中心から2マス（5×5）に爆発が起き、自分のHPが1になる。範囲内の敵は炎無効でない限り即死。炎耐性ありなら自ダメ軽減（個別or万能2/3・両方半減）。\n呪い：爆発は起きず200ターンの間、炎と爆発が全て不発になる。", tile:18 },
  { name:"バーサーカーの巻物", type:"scroll", effect:"berserker_scroll", rarity:"C", weight:4, sellPrice:600,
    desc:"部屋内の敵全員が50ターンのバーサーク状態になり、敵味方区別なく攻撃する。\n呪い：部屋内の敵が20ターンの平和主義状態になる（攻撃不可）。", tile:18 },
  { name:"モンスターの巻物", type:"scroll", effect:"monster_house", rarity:"B", weight:2, sellPrice:900,
    desc:"読んだ部屋がモンスターハウスになり、敵・アイテム・罠が新たに配置される。\n廊下や店など部屋外で読むと、どこかの部屋へテレポートしてから発動する（テレポート不能時は自分は動かず別部屋がハウス化）。\n祝福：強モンスターハウス（敵が1レベル上がった状態）。\n呪い：同部屋の敵を全て別の部屋へテレポートさせる。", tile:18 },
  { name:"あぶく銭の巻物", type:"scroll", effect:"bubble_gold", rarity:"C", weight:4, sellPrice:500,
    desc:"読むと大金が手に入るが、しばらくすると消える。\n呪い：先に減って、しばらくすると戻る。", tile:18 },
  { name:"爆弾矢", type:"arrow", atk:6, bombArrow:true, count:3,  rarity:"B", weight:2,  sellPrice:120,
    desc:"着弾点で爆発する矢。周囲8マスに地雷と同じ爆発効果。\n99本まで束にできる。", tile:23 },
  { name:"魚雷", type:"arrow", atk:8, specialProjectile:"torpedo", count:3, rarity:"C", weight:4, sellPrice:150,
    desc:"水の上を1マスずつ進み、敵に当たる魚雷。水の外に出ると消える。99個まで束にできる。", tile:23 },
  { name:"這いずり爆弾", type:"arrow", atk:6, specialProjectile:"crawling_bomb", count:3, rarity:"B", weight:2, sellPrice:250,
    desc:"床を1マスずつ這い、敵や壁に触れると爆発する爆弾。99個まで束にできる。", tile:23 },
  { name:"誘導弾", type:"arrow", atk:7, specialProjectile:"homing", count:3, rarity:"B", weight:2, sellPrice:220,
    desc:"近くの敵を追尾し、1ターンに1マスずつ進む弾。99個まで束にできる。", tile:23 },
  { name:"毒矢",     type:"arrow", atk:2, poison:true, count:3,   rarity:"D", weight:8,  sellPrice:30,   desc:"毒を持つ矢。命中すると毒効果。99本まで束にできる。",           tile:23 },
  { name:"貫きの矢", type:"arrow", atk:5, pierce:true, count:3,   rarity:"C", weight:4,  sellPrice:60,   desc:"全てを貫通して飛ぶ矢。99本まで束にできる。", tile:23 },
  { name:"強矢",     type:"arrow", atk:8, strong:true,   count:3,   rarity:"C", weight:4,  sellPrice:80,   desc:"攻撃力の高い強力な矢。99本まで束にできる。",                   tile:23 },
];

/** 空き瓶で敵を倒した際に出現する、レア度重み付きの通常薬を1つ生成する。 */
export function makeRandomPotion(randomFn = Math.random) {
  const potion = pickLootFromPool(ITEMS.filter((item) => item.type === "potion"), "drop", randomFn);
  return { ...potion, id: uid() };
}

export function getBlessMultiplier(it) {
  if (!it) return 1;
  if (it.blessed) return 1.5;
  if (it.cursed)  return 0.5;
  return 1;
}

export const CAT_CLAW_T     = { name:"猫の爪",         type:"weapon", atk:13, ability:"critical",    sellPrice:3000, desc:"鋭い爪の形をした武器。25%の確率で会心の一撃。", tile:20 };
export const SOBURO_T       = { name:"ソボロ助広",     type:"weapon", atk:8,  ability:"double_strike", sellPrice:3000, desc:"連撃の刀。", tile:20 };
/** カラペン系が押し付ける、置くことも投げることもできない敵専用アイテム */
export const CHARGED_FUZZBALL_T = {
  name:"帯電毛玉", type:"charged_fuzzball", tile:109, noDrop:true, noThrow:true,
  sellPrice:0, desc:"置くことも投げることもできない。箱や壺には入れられるが、床に落ちると消える。",
};

/** 盗み系：ロングソードは10%でソボロ助広に変化 */
export function maybeLongswordToSoboro(item) {
  if (item?.name === "ロングソード" && Math.random() < 0.10) {
    return { ...SOBURO_T, id: uid(), plus: item.plus || 0 };
  }
  return item;
}

/** 部屋内のランダムな床マス（盗みの罠などで使用） */
export function pickRandomFloorInRooms(dg) {
  if (!dg?.rooms?.length) return null;
  for (let a = 0; a < 200; a++) {
    const room = dg.rooms[rng(0, dg.rooms.length - 1)];
    const x = rng(room.x, room.x + room.w - 1);
    const y = rng(room.y, room.y + room.h - 1);
    if (dg.map[y]?.[x] === T.FLOOR) return { x, y };
  }
  return null;
}
export const EXCALIBUR_T   = { name:"エクスカリバー", type:"weapon", atk:15, ability:"bane_undead_2", sellPrice:5000, desc:"聖なる伝説の剣。アンデッド系に2倍ダメージ（上位特効）。", tile:20 };
export const GOLDEN_AXE_T  = { name:"ゴールデンアクス", type:"weapon", atk:10, ability:"no_degrade", sellPrice:2500, desc:"錆びず＋値が下がらない黄金の斧。", tile:20 };
export const TRIELEM_SWORD_T = { name:"三元の刃", type:"weapon", atk:12, ability:"fire_elem", abilities:["fire_elem","ice_elem","thunder_elem"], sellPrice:9000, desc:"炎・氷・雷の三元素を宿した剣。\n属性弱点の敵に1.5倍ダメージ。", tile:20 };
export const FLAMBERGE_T    = { name:"フランベルジュ", type:"weapon", atk:13, ability:"fire_elem_2",    sellPrice:9000, desc:"上位炎属性の剣。炎弱点・油まみれの敵に2倍ダメージ。", tile:20 };
export const ICESWORD_T     = { name:"アイスソード",   type:"weapon", atk:13, ability:"ice_elem_2",     sellPrice:9000, desc:"上位氷属性の剣。氷弱点の敵に2倍ダメージ。", tile:20 };
export const CHIDORI_T      = { name:"千鳥",           type:"weapon", atk:13, ability:"thunder_elem_2", sellPrice:9000, desc:"上位雷属性の剣。雷弱点の敵に2倍ダメージ。", tile:20 };
export const ULTIMA_SWORD_T = { name:"アルテマソード", type:"weapon", atk:20, ability:"fire_elem_2", abilities:["fire_elem_2","ice_elem_2","thunder_elem_2"], sellPrice:25000, desc:"三属性を極めた剣。属性弱点の敵に2倍ダメージ。", tile:20 };
export const TRIELEM_ARMOR_T  = { name:"元素王の鎧",     type:"armor", def:10, ability:"all_resist", abilities:["all_resist"], sellPrice:15000, desc:"炎・氷・雷すべてに耐性を持つ至高の鎧。\n万能耐性で各属性ダメージ2/3。錬成で個別耐性を追加すれば半減。\n炎・雷の所持品破壊、氷の移動封じ・鈍足も防ぐ。", tile:21 };
export const ELEM_RESIST_ABILITIES = ["fire_resist", "ice_resist", "lightning_resist"];
export const MITHRIL_ARMOR_T  = { name:"ミスリルの胴着", type:"armor", def:18, ability:"dmg_reduce", sellPrice:10000, desc:"硬くて軽い幻のミスリル製鎧。\n最終的な被ダメージが1割減少する。", tile:21 };
/** 革の鎧3枚の特殊合成。通常ドロップしない */
export const STOMACH_ARMOR_T  = { name:"腹持ちの胴", type:"armor", def:3, ability:"slow_hunger", sellPrice:1500, desc:"装備すると空腹の進行が3/4になる。腹持ち指輪と重ねがけ可（2つで1/2、3つで1/4）。", tile:21 };
export const ALLBANE_SWORD_T  = { name:"万能キラー", type:"weapon", atk:11, ability:"bane_dragon", abilities:["bane_dragon","bane_undead","bane_float"], sellPrice:10000, desc:"竜・不死・浮遊の全種族に1.5倍ダメージを与える剣。", tile:20 };
export const IRONMASS_T       = { name:"鉄塊",       type:"weapon", atk:16, ability:"bane_dragon_2",  sellPrice:10000, desc:"ドラゴン系に2倍ダメージを与える上位特効剣。", tile:20 };
export const SNIPER_T         = { name:"スナイパー", type:"weapon", atk:12, ability:"bane_float_2",   sellPrice:10000, desc:"浮遊している敵に2倍ダメージを与える上位特効剣。", tile:20 };
export const GODBANE_SWORD_T  = { name:"全能キラー", type:"weapon", atk:18, ability:"bane_dragon_2", abilities:["bane_dragon_2","bane_undead_2","bane_float_2"], sellPrice:30000, desc:"竜・不死・浮遊の全種族に2倍ダメージを与える上位特効剣。", tile:20 };
export const DIVINE_SHIELD_T  = { name:"神盾の鎧",   type:"armor",  def:12, ability:"thorn",      abilities:["thorn","dodge","wand_reflect"],           sellPrice:15000, desc:"刃反射・みかわし・杖反射を備えた鎧。",       tile:21 };
export const GODSPARKWAND_T   = { name:"ゴッドスパークの杖", type:"wand", effect:"godsparkwand", charges:3, rarity:"S", sellPrice:15000, desc:"振ると100ダメージを与える究極の杖。\n呪い：100回復。", tile:24 };
export const GOBLIN_BAT_T     = { name:"ゴブリンバット", type:"weapon", atk:4, rarity:"D", sellPrice:80, desc:"ゴブリンが持っている粗削りな鈍器。", tile:20 };
export const ONI_CLUB_T       = { name:"鬼棍棒",       type:"weapon", atk:8, ability:"critical", sellPrice:1200, desc:"25%の確率で会心の一撃が出る棍棒。", tile:20 };

export const ARROW_T         = { name:"矢",       type:"arrow", atk:3,                 rarity:"E", weight:12, sellPrice:10,  desc:"99本まで束にできる矢。",                 count:1, tile:23 };
export const POISON_ARROW_T  = { name:"毒矢",     type:"arrow", atk:2, poison:true,     rarity:"D", weight:8,  sellPrice:30,  desc:"毒を持つ矢。99本まで束にできる。",        count:1, tile:23 };
export const PIERCING_ARROW_T= { name:"貫きの矢", type:"arrow", atk:5, pierce:true,     rarity:"C", weight:4,  sellPrice:60,  desc:"全てを貫通して飛ぶ矢。99本まで束にできる。", count:1, tile:23 };
export const STRONG_ARROW_T  = { name:"強矢",     type:"arrow", atk:8, strong:true,       rarity:"C", weight:4,  sellPrice:80,  desc:"攻撃力の高い強力な矢。99本まで束にできる。", count:1, tile:23 };
export const STONE_T        = { name:"石",       type:"arrow", atk:3, stone:true,      rarity:"E", weight:12, sellPrice:5,   desc:"必ず3マス先に着弾する石。99個まで束にできる。遠投の魔方陣では消滅する。呪われた遠投では1マス先に着弾。",  count:1, tile:23 };
export const MAGIC_STONE_T  = { name:"魔法の石", type:"arrow", atk:5, magicStone:true, rarity:"D", weight:8,  sellPrice:30,  desc:"10マス以内の最も近い敵にホーミングして命中する石。99個まで束にできる。",                                    count:1, tile:23 };
export const BOMB_ARROW_T   = { name:"爆弾矢",   type:"arrow", atk:6, bombArrow:true,  rarity:"B", weight:2,  sellPrice:120, desc:"着弾点で爆発する矢。周囲8マスに地雷と同じ爆発効果。\n99本まで束にできる。",                            count:1, tile:23 };
export const TORPEDO_T      = { name:"魚雷",     type:"arrow", atk:8, specialProjectile:"torpedo",      rarity:"C", weight:4, sellPrice:150, desc:"水の上を1マスずつ進み、敵に当たる魚雷。水の外に出ると消える。99個まで束にできる。", count:1, tile:23 };
export const CRAWLING_BOMB_T= { name:"這いずり爆弾", type:"arrow", atk:6, specialProjectile:"crawling_bomb", rarity:"B", weight:2, sellPrice:250, desc:"床を1マスずつ這い、敵や壁に触れると爆発する爆弾。99個まで束にできる。", count:1, tile:23 };
export const HOMING_SHOT_T  = { name:"誘導弾",   type:"arrow", atk:7, specialProjectile:"homing",        rarity:"B", weight:2, sellPrice:220, desc:"近くの敵を追尾し、1ターンに1マスずつ進む弾。99個まで束にできる。", count:1, tile:23 };
export const EMPTY_BOTTLE = { name:"空き瓶",      type:"bottle",                         rarity:"E", weight:12, sellPrice:5,    desc:"泉に浸すと水になる。敵を倒すと薬を落とす。", tile:16 };
export const WATER_BOTTLE = { name:"水", type:"potion", effect:"water", value:10,        rarity:"E", weight:12, sellPrice:5,    desc:"泉の水。投げると周囲の腐敗・焦げた食料を元に戻す。", tile:16 };
export const BLANK_SCROLL  = { name:"白紙の巻物",    type:"scroll", effect:"blank",      rarity:"C", weight:4,  sellPrice:400,  desc:"何も書かれていない。魔法の筆で書き込める。", tile:18 };
export const MAGIC_MARKER  = { name:"魔法の筆", type:"marker", charges:1,          rarity:"B", weight:2,  sellPrice:1500, desc:"白紙の巻物に好きな魔法を書き込める。\n充填の大箱で回数を増やせる。筆同士の合成で容量合算。", tile:41 };


/* ===== 宝石 ===== */
export const GEM_TYPES = [
  /* 価格帯に合わせて E→A の順に希少化。宝石専門店ではこの重みをそのまま使用する。 */
  { name: "ルビー",       type: "gem", rarity:"B", weight:2,  basePrice: 8000, tile: 88,  desc: "深紅の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "サファイア",   type: "gem", rarity:"B", weight:2,  basePrice: 7000, tile: 89,  desc: "深青の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "エメラルド",   type: "gem", rarity:"C", weight:4,  basePrice: 6000, tile: 90,  desc: "緑の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "トパーズ",     type: "gem", rarity:"E", weight:12, basePrice: 500,  tile: 91,  desc: "黄色の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "アメジスト",   type: "gem", rarity:"E", weight:12, basePrice: 300,  tile: 92,  desc: "紫の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "アクアマリン", type: "gem", rarity:"D", weight:8,  basePrice: 4000, tile: 87,  desc: "青緑の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "ダイヤモンド", type: "gem", rarity:"B", weight:2,  basePrice: 9000, tile: 101, desc: "無色透明の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "オパール",     type: "gem", rarity:"C", weight:4,  basePrice: 5000, tile: 102, desc: "虹色の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "ガーネット",   type: "gem", rarity:"D", weight:8,  basePrice: 1700, tile: 184, desc: "暗赤色で丸みのある宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "ラピスラズリ", type: "gem", rarity:"D", weight:8,  basePrice: 3000, tile: 185, desc: "金色の斑点が入った濃紺の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "ターコイズ",   type: "gem", rarity:"E", weight:12, basePrice: 1200,  tile: 186, desc: "黒い筋の入った青緑色の宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "ムーンストーン", type: "gem", rarity:"D", weight:8, basePrice: 2300, tile: 187, desc: "乳白色の中で淡い青い光が揺れる宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "ブラックオニキス", type: "gem", rarity:"E", weight:12, basePrice: 800, tile: 188, desc: "白い縞模様を持つ黒い宝石。買った店から遠い階の店で売ると高値がつく。" },
  { name: "アレキサンドライト", type: "gem", rarity:"A", weight:1, basePrice: 10000, tile: 189, desc: "緑と赤紫の二色に輝く希少な宝石。買った店から遠い階の店で売ると高値がつく。" },
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

export function wPick(arr) {
  return pickByWeight(arr);
}

/* 好きな食べ物：genFood のベース名プールに混ぜる（ダンジョン開始時に set） */
let _favoriteFoodBase = "";

/** ダンジョン探索中の好きな食べ物ベース名を設定（空なら無効） */
export function setFavoriteFoodBase(name) {
  const s = name != null ? String(name).trim() : "";
  _favoriteFoodBase = s;
}

export function getFavoriteFoodBase() {
  return _favoriteFoodBase;
}

/**
 * 食料生成用のベース名一覧。
 * 好きな食べ物が設定されていてリストに無ければ生・調理どちらにも追加する。
 */
export function getFoodBasePool(cooked) {
  const base = cooked ? COOKED_FOODS : RAW_FOODS;
  const fav = _favoriteFoodBase;
  if (!fav || base.includes(fav)) return base;
  return [...base, fav];
}

export function genFood() {
  const cooked = Math.random() < 0.5;
  const names = getFoodBasePool(cooked);
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
  { name:"ふきとばしの杖", type:"wand", effect:"knockback", charges:5, rarity:"D", weight:8,  sellPrice:300,  desc:"振ると対象を吹き飛ばす。壊すと周囲全てを吹き飛ばす。",                           tile:24 },
  { name:"雷の杖",         type:"wand", effect:"lightning", charges:4, rarity:"D", weight:8,  sellPrice:700,  desc:"振ると雷撃が飛ぶ。壊すと周囲に落雷。",                                           tile:24 },
  { name:"鈍足の杖",       type:"wand", effect:"slow",      charges:6, rarity:"C", weight:4,  sellPrice:300,  desc:"振ると対象の速度を半減。壊すと周囲全てを鈍足に。",  tile:24 },
  { name:"変化の杖",       type:"wand", effect:"transform", charges:4, rarity:"C", weight:4,  sellPrice:600,  desc:"対象を同じ階層の敵に変える。壊すと周囲全てを変化。",                           tile:24 },
  { name:"場所替えの杖",   type:"wand", effect:"swap",      charges:5, rarity:"C", weight:4,  sellPrice:500,  desc:"振ると対象と位置を交換する。壊すと周囲をシャッフル。",                           tile:24 },
  { name:"穴掘りの杖",     type:"wand", effect:"dig",       charges:5, rarity:"C", weight:4,  sellPrice:600,  desc:"壁に当てると一直線上の壁を掘り進む。\n壊すと周囲の壁を消し足元に穴が開く。",       tile:24 },
  { name:"飛びつきの杖",   type:"wand", effect:"leap",      charges:5, rarity:"D", weight:8,  sellPrice:250,  desc:"振ると対象の目の前に瞬間移動する。壊しても何も起こらない。",                     tile:24 },
  { name:"テレポートの杖", type:"wand", effect:"warp",      charges:4, rarity:"C", weight:4,  sellPrice:500,  desc:"振ると対象をランダムな場所にテレポートさせる。壊すと周囲全員をテレポート。",     tile:24 },
  { name:"金縛りの杖",     type:"wand", effect:"paralyze",  charges:5, rarity:"B", weight:2,  sellPrice:500, desc:"振ると対象を金縛りにする。何かアクションを受けるまで動けなくなる。", tile:24 },
  { name:"眠りの杖",       type:"wand", effect:"sleep",     charges:5, rarity:"C", weight:4,  sellPrice:400,  desc:"振ると対象を眠りに落とす。眠りの罠と同様の効果。",                                   tile:24 },
  { name:"祝福の杖",       type:"wand", effect:"bless_wand",charges:1, rarity:"A", weight:1,  sellPrice:8000, desc:"振ると対象のアイテムを祝福する。壊すと周囲のアイテム全てを祝福する。",                 tile:24 },
  { name:"呪いの杖",       type:"wand", effect:"curse_wand",charges:1, rarity:"A", weight:1,  sellPrice:1500, desc:"振ると対象のアイテムを呪う。壊すと周囲のアイテム全てを呪う。",                         tile:24 },
  { name:"レベルアップの杖", type:"wand", effect:"levelup", charges:3, rarity:"B", weight:2,  sellPrice:12000, desc:"振ると対象をレベルアップさせる。\n自分：1レベルUP。敵：次の形態に変化。\n呪い：自分は1階上へワープ、敵はレベルダウン。", tile:24 },
  { name:"混乱の杖",       type:"wand", effect:"confuse",   charges:5, rarity:"D", weight:8,  sellPrice:300,  desc:"振ると対象を混乱させる。\n自分：5ターン、敵：20ターン混乱。", tile:24 },
  { name:"暗闇の杖",       type:"wand", effect:"darkness",  charges:5, rarity:"C", weight:4,  sellPrice:500,  desc:"振ると対象を暗闇状態にする。\n自分：視界1マス(20T)。敵：50T認識不可で壁まで直進。\n呪い：フロア全体が見える。", tile:24 },
  { name:"惑わしの杖",     type:"wand", effect:"bewitch",   charges:4, rarity:"C", weight:4,  sellPrice:600,  desc:"振ると対象を幻惑状態にする。\n自分：50T見た目が狂う。敵：50T逃げ回る。\n呪い：罠が全て見える。", tile:24 },
  { name:"封印の杖",       type:"wand", effect:"seal",      charges:5, rarity:"D", weight:8,  sellPrice:350,  desc:"振ると対象を封印状態にする。自分：MP封印50T。\n呪い：敵の特技100%化、自分はMP封印解除。", tile:24 },
  { name:"軟化の杖",       type:"wand", effect:"soften",    charges:5, rarity:"C", weight:4,  sellPrice:700,  desc:"振ると対象の防御力を半減する。\nアイテム・罠・大箱に当てると破壊。壁→食料に変化。\n呪い：1マス先に壊せる壁を生成。", tile:24 },
  { name:"炎の杖",         type:"wand", effect:"fire_wand", charges:5, rarity:"D", weight:8,  sellPrice:600,  desc:"振ると炎の弾が飛ぶ。油まみれの対象はダメージ2倍。\n自分に当たると炎でアイテムが傷つくことがある。床の食料は焼ける。\n呪い：対象を回復。", tile:24 },
  { name:"氷の杖",         type:"wand", effect:"ice_wand",      charges:5, rarity:"D", weight:8,  sellPrice:600,  desc:"振ると氷の弾が飛ぶ。氷属性ダメージと移動封じを与える。\n氷弱点の敵にはダメージ2倍。\n呪い：対象を回復。", tile:24 },
  { name:"体力交換の杖",   type:"wand", effect:"vitality_swap", charges:4, rarity:"C", weight:4,  sellPrice:800,  desc:"振ると相手と現在HPを入れ替える。\n呪い：自分のHPを1に。\n自分に振ると交換なしだが祝福・呪い効果は発動。\n壊すと隣接する最大HPの敵とHP交換。", tile:24 },
  { name:"物知りの杖",     type:"wand", effect:"sage",          charges:4, rarity:"D", weight:8,  sellPrice:700,  desc:"アイテム・大箱に当てると識別。敵：HP・攻撃力・防御力を表示。\n壁に跳ね返り自分に当たると手持ち1個ランダム識別。\n呪い：対象が未識別に戻る。", tile:24 },
  { name:"願いの杖",       type:"wand", effect:"wish",          charges:1, rarity:"S", weight:0.05,  sellPrice:15000, noChargeBoost: true, desc:"振ると願いを一つ叶えてくれる。\n回数は常に1で、増やすことはできない。", tile:24 },
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
  { name:"チョコの壺",         type:"pot", potEffect:"choco",     capacity:3, rarity:"D", weight:8,  sellPrice:600,  desc:"食料を入れるとチョコがけになる。食べるとHP35回復＋状態異常回復。",  tile:32 },
  { name:"唐辛子の壺",         type:"pot", potEffect:"spicy",     capacity:3, rarity:"C", weight:4,  sellPrice:900,  desc:"食料を入れると激辛になる。食べると直接攻撃・矢ダメージ1.5倍(50ターン)。",     tile:32 },
  { name:"蜂蜜の壺",           type:"pot", potEffect:"honey",     capacity:3, rarity:"D", weight:8,  sellPrice:550,  desc:"食料を入れるとはちみつ漬けになる。食べると毎ターンHP+2自然回復(80ターン)。",   tile:32 },
  { name:"保存の壺",           type:"pot", potEffect:"none",      capacity:5, rarity:"C", weight:4,  sellPrice:1500, desc:"アイテムを安全に保管できる。",         tile:32 },
  { name:"強化の壺",           type:"pot", potEffect:"enhance",   capacity:2, rarity:"B", weight:2,  sellPrice:4000, desc:"装備品の性能が上がる。",               tile:32 },
  { name:"弱化の壺",           type:"pot", potEffect:"weaken",    capacity:3, rarity:"D", weight:8,  sellPrice:150,  desc:"入れた装備品が劣化する呪いの壺。",     tile:32 },
  { name:"カレーの壺",         type:"pot", potEffect:"curry",     capacity:3, rarity:"D", weight:8,  sellPrice:500,  desc:"食料を入れるとカレー味になる。食べると炎ダメージ半減(100ターン)。",       tile:32 },
  { name:"味噌の壺",           type:"pot", potEffect:"miso",      capacity:3, rarity:"D", weight:8,  sellPrice:500,  desc:"食料を入れると味噌漬けになる。食べると防御力+8(100ターン)。",       tile:32 },
  { name:"燻製の壺",           type:"pot", potEffect:"smoke",     capacity:3, rarity:"C", weight:4,  sellPrice:1000, desc:"食料を燻製にする。食べると最大満腹度が上がる。", tile:32 },
  { name:"祝福の壺",           type:"pot", potEffect:"bless_pot", capacity:3, rarity:"A", weight:1,  sellPrice:9000, desc:"入れたアイテムを祝福する。",           tile:32 },
  { name:"呪いの壺",           type:"pot", potEffect:"curse_pot", capacity:3, rarity:"A", weight:1,  sellPrice:2000, desc:"入れたアイテムを呪う。",               tile:32 },
  { name:"加熱の壺",           type:"pot", potEffect:"boil",      capacity:3, rarity:"C", weight:4,  sellPrice:800,  desc:"薬を入れると部屋中に薬効が広がる。\n生の食料を入れると焼いた状態になる。\nその他のものは保管できる。", tile:32 },
  { name:"火薬壺",             type:"pot", potEffect:"gunpowder", capacity:3, rarity:"C", weight:4,  sellPrice:700,  desc:"割れると5×5マスを巻き込む大爆発を起こす。\n炎・雷・爆発でも誘爆する。泉に浸すと保存の壺に変化。\n中身は爆発で消える。", tile:32 },
  { name:"オリーブオイルの壺", type:"pot", potEffect:"olive",     capacity:3, rarity:"D", weight:8,  sellPrice:550,  desc:"食料を入れるとオリーブオイル漬けになる。\n食べると被攻撃15%回避(80ターン)。\n割れると周囲に油が飛散する。", tile:32 },
  { name:"ごま油の壺",         type:"pot", potEffect:"sesame",    capacity:3, rarity:"D", weight:8,  sellPrice:550,  desc:"食料を入れるとごま油風味になる。\n食べると会心率UP(80ターン)。\n割れると周囲に油が飛散する。",         tile:32 },
  { name:"バターの壺",         type:"pot", potEffect:"butter",    capacity:3, rarity:"D", weight:8,  sellPrice:550,  desc:"食料を入れるとバター風味になる。\n食べると満腹度減少速度半減(100ターン)。\n割れると周囲に油が飛散する。",         tile:32 },
  { name:"ヨーグルトの壺",     type:"pot", potEffect:"yogurt",    capacity:3, rarity:"D", weight:8,  sellPrice:500,  desc:"食料を入れるとヨーグルト漬けになる。食べると毒・混乱免疫(100ターン)。",   tile:32 },
  { name:"ココナッツの壺",     type:"pot", potEffect:"coconut",   capacity:3, rarity:"D", weight:8,  sellPrice:500,  desc:"食料を入れるとココナッツ風味になる。食べるとMP+10回復。",   tile:32 },
  { name:"強欲な壺",           type:"pot", potEffect:"greed",    capacity:4, rarity:"C", weight:4,  sellPrice:1200, desc:"アイテムを入れても何も起きない。割ると中身に加え残り容量の数だけランダムなアイテムが飛び出す。", tile:32 },
  { name:"回復の壺",           type:"pot", potEffect:"heal_pot", capacity:3, rarity:"C", weight:4,  sellPrice:2000, desc:"アイテムを入れると消滅するが、プレイヤーのHPが100回復する。容量分だけ使える。", tile:32 },
  { name:"醤油の壺",           type:"pot", potEffect:"soy",      capacity:3, rarity:"D", weight:8,  sellPrice:500,  desc:"食料を入れると醤油味になる。食べると経験値1.3倍(100ターン)。", tile:32 },
  { name:"にんにくの壺",       type:"pot", potEffect:"garlic",   capacity:3, rarity:"C", weight:4,  sellPrice:800,  desc:"食料を入れるとにんにく風味になる。食べると攻撃時に固定追加ダメージ+5(80ターン)。", tile:32 },
  { name:"レモンの壺",         type:"pot", potEffect:"lemon",    capacity:3, rarity:"C", weight:4,  sellPrice:800,  desc:"食料を入れるとレモン風味になる。食べると投擲ダメージ1.5倍(80ターン)。", tile:32 },
  { name:"とじこめの壺",     type:"pot", potEffect:"imprison", capacity:3, rarity:"B", weight:2,  sellPrice:3500, desc:"入れると閉じ込められる。敵に投げても使える。", tile:32 },
  { name:"願いの壺",         type:"pot", potEffect:"wish_pot", capacity:3, rarity:"S", weight:0.05,  sellPrice:12000, desc:"アイテムを入れると願いが叶う。\n入れた物は消え、壺も一回で壊れる。", tile:32 },
  { name:"クラインの壺",     type:"pot", potEffect:"klein",   capacity:3, rarity:"B", weight:2,  sellPrice:5000, desc:"アイテムを入れると消え、20ターン逆転状態になる。\nダメージが回復に、回復がダメージに反転する。", tile:32 },
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
  const _in = resolveItemName(item, nameFn);
  const _pn = resolveItemName(pot, nameFn);
  const pe = pot.potEffect;
  if (pe === "imprison") { ml.push(`${_pn}にはアイテムは入れられない。`); return; }
  if (pe === "none" || pe === "greed") { ml.push(`${_in}を${_pn}に入れた。`); return; }
  if (pe === "boil") { /* 実効果はGame.jsx側で処理 */ return; }
  if (pe === "enhance") {
    if (item.type === "weapon" || item.type === "armor" || (item.type === "ring" && ["power_ring", "defense_ring", "life_ring"].includes(item.effect))) {
      const _g = rng(1, 2);
      item.plus = (item.plus || 0) + _g;
      ml.push(`${resolveItemName(item, nameFn)}が強化された！(+${item.plus})`);
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
      ml.push(`${resolveItemName(item, nameFn)}が劣化した！(${_ps >= 0 ? "+" : ""}${_ps})`);
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
    const _catMatch = foodMatchesPotCategory(item, pe);
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
  if (potEffect === "wish_pot") return rng(3, 5);
  if (potEffect === "klein") return rng(2, 4);
  return rng(3, 5);
}

/** 願いの杖など、回数を増やせない杖か */
export function isNoChargeBoostWand(it) {
  return !!(it && it.type === "wand" && (it.effect === "wish" || it.noChargeBoost));
}

export function potOccupancyCount(pot) {
  if (!pot || pot.type !== "pot") return 0;
  if (pot.potEffect === "imprison") return pot.confinedMonsters?.length || 0;
  return pot.contents?.length || 0;
}

export function imprisonPotRemainingCapacity(pot) {
  if (!pot || pot.potEffect !== "imprison") {
    return Math.max(0, (pot?.capacity || 3) - (pot?.contents?.length || 0));
  }
  return Math.max(0, (pot.capacity || 3) - (pot.confinedMonsters?.length || 0));
}

export function canConfineMonsterInImprisonPot(mon) {
  if (!mon) return false;
  if (mon.isBoss) return false;
  if (mon.type === "shopkeeper") return false;
  if (mon.baseKind === "firedemon") return false;
  if (mon.baseKind === "synthmonster") return false;
  return true;
}

export function confineMonsterInImprisonPot(pot, mon, dg, ml, nameFn = null) {
  if (!pot.confinedMonsters) pot.confinedMonsters = [];
  const snap = JSON.parse(JSON.stringify(mon));
  pot.confinedMonsters.push(snap);
  const _mn = resolveItemName(mon, nameFn);
  const _pn = resolveItemName(pot, nameFn);
  ml.push(`${_mn}を${_pn}に閉じ込めた！`);
  removeMonster(dg, mon);
}

export function canMonsterSurviveOnWater(mon, dg, x, y) {
  const tile = dg.map[y]?.[x];
  const onSpring = dg.springs?.some((s) => s.x === x && s.y === y);
  const onWater = tile === T.WATER || onSpring;
  if (!onWater) return true;
  /* 実効浮遊（封印で固有floatは無効）・水生のみ生存 */
  return !!(mon.waterOnly || mon.baseKind === "im_boss_kraken" || monEffectiveFloat(mon));
}

/**
 * 封印などで浮遊が落ち、深い水上に残った敵を重力と同様に陸へ弾き出す。
 * 逃げ場がなければ即死。
 * @returns {"ejected"|"killed"|"ok"|null}
 */
export function resolveSealedFloatOnWater(m, dg, p, ml, luFn) {
  if (!m || !dg?.map || !ml) return null;
  if (!m.sealed) return null;
  /* まだ浮遊できている（一時floatTurns等）なら何もしない */
  if (monEffectiveFloat(m)) return "ok";
  if (m.waterOnly || m.baseKind === "im_boss_kraken") return "ok";
  if (dg.map[m.y]?.[m.x] !== T.WATER) return "ok";

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [dx, dy] of dirs) {
    const nx = m.x + dx, ny = m.y + dy;
    if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) continue;
    const tile = dg.map[ny]?.[nx];
    if (tile === T.WALL || tile === T.BWALL || tile === T.WATER) continue;
    if (dg.monsters.some((o) => o !== m && o.x === nx && o.y === ny)) continue;
    if (p && p.x === nx && p.y === ny) continue;
    m.x = nx;
    m.y = ny;
    ml.push(`封印で浮遊が解け、${m.name}が水上から弾き出された！`);
    return "ejected";
  }
  ml.push(`封印で浮遊が解け、${m.name}は逃げ場がなく即死した！`);
  killMonster(m, dg, p, ml, luFn);
  return "killed";
}

/**
 * モンスターに封印を付与し、水上浮遊の弾き出し／即死を解決する。
 */
export function applyMonsterSeal(target, dg, p, ml, luFn, opts = {}) {
  if (!target) return null;
  const { blessed = false, sealedTurns = null, message = null } = opts;
  target.sealed = true;
  const turns = sealedTurns != null
    ? sealedTurns
    : statusTurns("seal", { kind: "monster", blessed, target });
  target.sealedTurns = Math.max(target.sealedTurns || 0, turns);
  if (message) ml.push(message);
  else ml.push(`${target.name}は封印された！`);
  return resolveSealedFloatOnWater(target, dg, p, ml, luFn);
}

function _isConfinedReleaseBlocked(dg, tx, ty, p, used) {
  if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) return true;
  const tile = dg.map[ty]?.[tx];
  if (tile === T.WALL || tile === T.BWALL) return true;
  if (p && p.x === tx && p.y === ty) return true;
  if (monsterAt(dg, tx, ty)) return true;
  if (used.has(`${tx},${ty}`)) return true;
  return false;
}

function _findConfinedMonsterReleaseTile(dg, cx, cy, p, used) {
  for (const [dx, dy] of DRO) {
    const tx = cx + dx, ty = cy + dy;
    if (!_isConfinedReleaseBlocked(dg, tx, ty, p, used)) return { x: tx, y: ty };
  }
  return randomTeleportDest(dg, cx, cy, (x, y) => !_isConfinedReleaseBlocked(dg, x, y, p, used));
}

export function releaseConfinedMonstersFromPot(pot, dg, px, py, p, ml) {
  const confined = pot.confinedMonsters || [];
  if (confined.length === 0) return;
  const used = new Set();
  for (const snap of confined) {
    const _pos = _findConfinedMonsterReleaseTile(dg, px, py, p, used);
    if (!_pos) {
      ml.push(`${snap.name}を出す場所がなく消えた…`);
      continue;
    }
    used.add(`${_pos.x},${_pos.y}`);
    if (!canMonsterSurviveOnWater(snap, dg, _pos.x, _pos.y)) {
      ml.push(`${snap.name}は水没した！`);
      continue;
    }
    const mon = {
      ...snap,
      id: uid(),
      x: _pos.x,
      y: _pos.y,
      turnAccum: 0,
      aware: true,
      lastPx: p?.x ?? px,
      lastPy: p?.y ?? py,
    };
    dg.monsters.push(mon);
    wakeIfDormant(mon);
    ml.push(`${mon.name}が現れた！`);
  }
  pot.confinedMonsters = [];
}

function _playerOnWaterTile(p, dg) {
  if (!dg?.map) return false;
  return dg.map[p.y]?.[p.x] === T.WATER || dg.springs?.some((s) => s.x === p.x && s.y === p.y);
}

export function confinePlayerInImprisonPot(pot, p, dg, ml, nameFn = null) {
  const rem = imprisonPotRemainingCapacity(pot);
  if (rem <= 0) {
    ml.push("壺に空きがない。");
    return false;
  }
  const _pn = resolveItemName(pot, nameFn);
  const turns = rem * 10;
  p.potConfinedTurns = turns;
  p.potConfinedPotId = pot.id;
  if (_playerOnWaterTile(p, dg) && !hasRingEffect(p, "water_breath_ring")) {
    ml.push(`${_pn}が水中に沈んだ！`);
    ml.push(`${_pn}に入った！あと${turns}ターン動けない。水中では毎ターン息が詰まる…`);
  } else {
    ml.push(`${_pn}に入った！あと${turns}ターン動けない。敵に見つからない。`);
  }
  return true;
}

/** とじこめの壺から出たとき、壺を割って消す（閉じ込め敵がいれば放出） */
export function resolveImprisonPotExit(p, dg, ml, luFn, nameFn = null) {
  if (!p.potConfinedPotId) return;
  const potIdx = p.inventory?.findIndex((i) => i.id === p.potConfinedPotId && i.potEffect === "imprison") ?? -1;
  if (potIdx !== -1) {
    const pot = p.inventory[potIdx];
    scatterPotContents(pot, dg, p.x, p.y, p, ml, luFn, nameFn);
    p.inventory.splice(potIdx, 1);
  }
  delete p.potConfinedPotId;
}

/** @param {'floor'|'change'|'shop'|'drop'} [context='floor'] */
export function makePot(context = "floor") {
  const t = pickLootFromPool(POTS, context) || pick(POTS);
  const pot = { ...t, id: uid(), contents: [], capacity: randPotCapacity(t.potEffect) };
  if (t.potEffect === "imprison") pot.confinedMonsters = [];
  return pot;
}

/** 変化の大箱と同じ抽選表から、変化後のアイテムを1個作る。 */
export function makeChangeBoxItem() {
  const kinds = ["potion", "weapon", "armor", "food", "wand", "arrow", "pot"];
  const rt = pick(kinds);
  if (rt === "food") return { ...genFood(), id: uid() };
  if (rt === "wand") {
    const wt = pickLootFromPool(WANDS, "change") || pick(WANDS);
    return { ...wt, id: uid() };
  }
  if (rt === "arrow") return makeArrow(rng(3, 15));
  if (rt === "pot") return makePot("change");
  const pool = ITEMS.filter((i) => i.type === rt);
  const fallback = ITEMS.filter((i) => i.type !== "gold" && i.type !== "charged_fuzzball");
  const tmpl = (pool.length ? pickLootFromPool(pool, "change") : null)
    || pickLootFromPool(fallback, "change")
    || pick(fallback);
  return { ...tmpl, id: uid() };
}

/** 大箱が壊れたときの共通処理。ゴミ箱だけは追加で変化抽選品を落とす。 */
export function breakBigboxContents(bb, dg, ml, nameFn = null, dropX = null, dropY = null) {
  if (!bb || !dg) return;
  const x = dropX ?? bb.x;
  const y = dropY ?? bb.y;
  const ft = new Set();
  for (const item of [...(bb.contents || [])]) placeItemAt(dg, x, y, item, ml, ft);
  if (bb.kind === "trash") {
    const loot = makeChangeBoxItem();
    placeItemAt(dg, x, y, loot, ml, ft);
    ml.push(`ゴミ箱から${resolveItemName(loot, nameFn)}が飛び出した！`);
  }
  stageBigbox(bb);
  dg.bigboxes = (dg.bigboxes || []).filter((b) => b !== bb);
}

export function scatterPotContents(pot, dg, px, py, p, ml, luFn, nameFn = null) {
  const _pn = resolveItemName(pot, nameFn);
  /* 強欲な壺：中身＋残り容量分のランダムアイテムを出す */
  if (pot.potEffect === "greed") {
    const _remaining = Math.max(0, (pot.capacity || 4) - (pot.contents?.length || 0));
    ml.push(`${_pn}が割れた！`);
    const ft = new Set();
    for (const item of (pot.contents || [])) { placeItemAt(dg, px, py, item, ml, ft); }
    if (_remaining > 0) {
      ml.push(`${_remaining}個のランダムなアイテムが飛び出した！`);
      for (let i = 0; i < _remaining; i++) {
        /* 変化の大箱と同系統（weight＋一定確率で均等） */
        const _ri = { ...(pickLootFromPool(ITEMS, "change") || pick(ITEMS)), id: uid() };
        if (_ri.type === 'gold') _ri.value = rng(20, 80);
        placeItemAt(dg, px, py, _ri, ml, ft);
      }
    }
    return;
  }
  /* とじこめの壺：閉じ込めた敵を放出 */
  if (pot.potEffect === "imprison") {
    ml.push(`${_pn}が割れた！`);
    releaseConfinedMonstersFromPot(pot, dg, px, py, p, ml);
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
        const _isReverseHp = (p.reverseTurns || 0) > 0;
        const _hpRoom = Math.max(0, p.maxHp - p.hp);
        const _healIntent = _hpRoom > 0 ? Math.min(_hpAmt, _hpRoom) : (_isReverseHp ? _hpAmt : 0);
        if (_healIntent > 0) {
          if (_isReverseHp) {
            p.hp += _healIntent;
            ml.push(`HPが${_healIntent}ダメージを受けた！`);
          } else {
            const _prevHp = p.hp;
            p.hp = Math.min(p.maxHp, p.hp + _healIntent);
            if (p.hp > _prevHp) ml.push(`HPが${p.hp - _prevHp}回復した！`);
          }
        }
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
        if (statueAt(dg, tx, ty)) continue;
        if (!dg.oilyTiles.some(t => t.x === tx && t.y === ty))
          dg.oilyTiles.push({ x: tx, y: ty });
        const mon = monsterAt(dg, tx, ty);
        if (mon) {
          const _ot = statusTurns("oily", { kind: "monster", target: mon });
          mon.oilyTurns = (mon.oilyTurns || 0) + _ot;
          ml.push(`${mon.name}は油まみれになった！(${_ot}ターン)`);
        }
        if (tx === p.x && ty === p.y) {
          const _ot = statusTurns("oily", { kind: "player" });
          p.oilyTurns = (p.oilyTurns || 0) + _ot;
          ml.push(`油を浴びた！炎ダメージが2倍になる！(${_ot}ターン)`);
        }
        /* 油がかかったマスの非永続罠を消滅 */
        const _oilTrap = dg.traps?.find(t => t.x === tx && t.y === ty && !t.permanent);
        if (_oilTrap) removeTrap(dg, _oilTrap, ml, { message: `油で${_oilTrap.name}が消えた！`, p });
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
    ml.push(`${resolveItemName(pot)}から火薬が吸い出され爆発した！`);
    doGunpowderExplosion(px, py, dg, p, ml, luFn, resolveItemName(pot));
    return { potRemovedAt: null };
  }
  const _oilEffects = { olive: "オリーブオイル", sesame: "ごま油", butter: "バター" };
  if (_oilEffects[pot.potEffect] && (pot.contents?.length || 0) < (pot.capacity || 3)) {
    ml.push(`${resolveItemName(pot)}から${_oilEffects[pot.potEffect]}が溢れ出た！`);
    pushSplashAnim(px, py, "#ccaa44");
    dg.oilyTiles = dg.oilyTiles || [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = px + dx, ty = py + dy;
        if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) continue;
        if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) continue;
        if (statueAt(dg, tx, ty)) continue;
        if (!dg.oilyTiles.some(t => t.x === tx && t.y === ty)) dg.oilyTiles.push({ x: tx, y: ty });
        const _om = monsterAt(dg, tx, ty);
        if (_om) {
          const _ot = statusTurns("oily", { kind: "monster", target: _om });
          _om.oilyTurns = (_om.oilyTurns || 0) + _ot;
          ml.push(`${_om.name}は油まみれになった！(${_ot}ターン)`);
        }
        if (tx === p.x && ty === p.y) {
          const _ot = statusTurns("oily", { kind: "player" });
          p.oilyTurns = (p.oilyTurns || 0) + _ot;
          ml.push(`油を浴びた！炎ダメージが2倍になる！(${_ot}ターン)`);
        }
        const _ot = dg.traps?.find(t => t.x === tx && t.y === ty && !t.permanent);
        if (_ot) removeTrap(dg, _ot, ml, { message: `油で${_ot.name}が消えた！`, p });
      }
    }
    if (dg.pentacles?.length > 0) {
      const _opc = dg.pentacles.filter(pc => dg.oilyTiles.some(t => t.x === pc.x && t.y === pc.y));
      if (_opc.length > 0) { dg.pentacles = dg.pentacles.filter(pc => !_opc.includes(pc)); for (const _op of _opc) ml.push(`油が${_op.name}を消した！`); }
    }
  }
  const ft = new Set();
  if ((pot.contents?.length || 0) > 0) {
    ml.push(`${resolveItemName(pot)}から中身が飛び出した！`);
    for (const item of [...pot.contents]) { placeItemAt(dg, px, py, item, ml, ft); }
    pot.contents = [];
  } else {
    ml.push(`${resolveItemName(pot)}は空だった。`);
  }
  if (blessed) {
    pot.capacity = (pot.capacity || 1) + 1;
    ml.push(`${resolveItemName(pot)}の容量が1増えた！(${pot.capacity})【祝】`);
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
  { id:"fire_elem",       name:"炎属性",      desc:"油まみれ・炎弱点の敵に1.5倍ダメージ" },
  { id:"ice_elem",        name:"氷属性",      desc:"氷弱点の敵に1.5倍ダメージ" },
  { id:"thunder_elem",    name:"雷属性",      desc:"雷弱点の敵に1.5倍ダメージ" },
  { id:"fire_elem_2",     name:"上位炎属性",  desc:"油まみれ・炎弱点の敵に2倍ダメージ（上位特効）" },
  { id:"ice_elem_2",      name:"上位氷属性",  desc:"氷弱点の敵に2倍ダメージ（上位特効）" },
  { id:"thunder_elem_2",  name:"上位雷属性",  desc:"雷弱点の敵に2倍ダメージ（上位特効）" },
  { id:"def_bonus",       name:"防御強化",  desc:"装備中、防御力が5上がる" },
  /* 呪い専用デメリット能力 */
  { id:"recoil",          name:"反動",      desc:"攻撃するたびに自分も2〜4ダメージを受ける",        curseOnly:true },
  { id:"gluttony",        name:"大食い",    desc:"装備中、空腹の進みが2倍になる",                  curseOnly:true },
  /* 祝福専用強力能力 */
  { id:"lifesteal",       name:"吸血",      desc:"攻撃時、与えたダメージの30%をHP回復する",        blessedOnly:true },
  { id:"double_strike",   name:"連撃",      desc:"通常攻撃が2回になる（2回目は威力60%）",          blessedOnly:true },
];

export const ARMOR_ABILITIES = [
  { id:"fire_resist",      name:"耐火",     desc:"炎ダメージ2/3（万能耐性併用で半減）。アイテムを炎から守る" },
  { id:"slow_hunger",      name:"節食",     desc:"空腹の進行が3/4になる（腹持ちと重ねがけ可）" },
  { id:"regen",            name:"回復",     desc:"毎ターン追加でHP+1回復する" },
  { id:"sleep_proof",      name:"眠れず",   desc:"睡眠効果を無効化する" },
  { id:"thorn",            name:"刃反射",   desc:"近接攻撃を受けた時にダメージの1/3を反射する" },
  { id:"lightning_resist", name:"雷耐性",   desc:"雷ダメージ2/3（万能耐性併用で半減）。アイテムが雷で壊れなくなる" },
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
  { id:"ice_resist",       name:"耐氷",     desc:"氷ダメージ2/3（万能耐性併用で半減）。移動封じ・鈍足を防ぐ" },
  { id:"water_proof",      name:"耐水",     desc:"水鉄砲の所持品被害とずぶ濡れを無効化する" },
  /* 特殊合成専用（錬成では出ない） */
  { id:"dmg_reduce",       name:"被ダメ軽減", desc:"最終的な被ダメージが1割減少する", specialOnly:true },
  /* 呪い専用デメリット能力 */
  { id:"frail",            name:"脆弱",     desc:"近接攻撃を受けた時、ダメージが+3増加する",         curseOnly:true },
  { id:"noisy",            name:"騒音",     desc:"部屋に入るたびに同部屋の敵が全員目を覚ます",       curseOnly:true },
  /* 祝福専用強力能力 */
  { id:"all_resist",       name:"万能耐性", desc:"炎・氷・雷ダメージ2/3。個別耐性と併用で半減",             blessedOnly:true },
  { id:"aura",             name:"闘気",     desc:"毎ターン、隣接する敵全員に2ダメージを与える",       blessedOnly:true },
];

/* ===== TRAPS ===== */
/* rarity/weight はアイテムと同じ対応（E:12 D:8 C:4 B:2 A:1）。生成は pickTrap() で weight 抽選。 */
export const TRAPS = [
  /* E: よく出る基本罠 */
  { name:"矢の罠",         effect:"arrow_trap",    tile:26,  rarity:"E", weight:12, desc:"踏むと、そのときの正面方向から矢が飛んでくる。\nダメージは小さいが序盤は注意。矢が落ちる。\n踏む以外で壊れると矢が数本散らばる。" },
  { name:"睡眠ガスの罠",   effect:"sleep",         tile:30,  rarity:"E", weight:12, desc:"踏むと6ターン眠る。" },
  { name:"鈍足の罠",       effect:"slow_trap",     tile:47,  rarity:"C", weight:4,  desc:"踏むと10ターン鈍足になる(速度半減)。" },
  { name:"空腹の罠",       effect:"hunger_trap",   tile:50,  rarity:"E", weight:12, desc:"踏むと満腹度が最大の10%減少する。" },
  { name:"MP吸収の罠",     effect:"mp_absorb_trap", tile:120, rarity:"C", weight:4,  desc:"踏むとMPが5減る。\nモンスターが踏むと封印状態になる（特技使用不可）。" },
  { name:"混乱の罠",       effect:"confuse_trap",   tile:127, rarity:"E", weight:12, desc:"踏むと10ターン混乱する。\n敵が踏むと20ターン混乱する。耐混乱の防具で防げる。" },
  /* D: やや多い */
  { name:"毒矢の罠",       effect:"poison_arrow",  tile:45,  rarity:"D", weight:8,  desc:"踏むと、そのときの正面方向から毒矢が飛んでくる。\nダメージ+毒状態。\n踏む以外で壊れると毒矢が数本散らばる。" },
  { name:"強矢の罠",       effect:"strong_arrow",  tile:121, rarity:"D", weight:8,  desc:"踏むと、そのときの正面方向から強矢が飛んでくる。\n通常の矢よりダメージが大きい。\n踏む以外で壊れると強矢が数本散らばる。" },
  { name:"錆の罠",         effect:"rust",          tile:28,  rarity:"D", weight:8,  desc:"踏むと装備中の武器or防具の＋値が-1される。\n金属製装備が対象。" },
  { name:"回転板",         effect:"spin",          tile:29,  rarity:"D", weight:8,  desc:"踏むとランダムな場所に吹き飛ばされる。\n飛んだ先の罠も発動する。" },
  { name:"落石の罠",       effect:"rockfall",      tile:72,  rarity:"D", weight:8,  desc:"踏むと岩が降ってきて15～25ダメージ。\n対象がいなければ石が落ちる（罠マスには重ならず近くに転がる）。\n踏む以外で壊れると石が数個散らばる。" },
  { name:"吹き飛ばしの罠", effect:"blowback_trap", tile:51,  rarity:"D", weight:8,  desc:"踏むと向いていた方向と逆に最大10マス吹き飛ぶ。\n壁に激突すると10ダメージ。敵に当たると5ダメージ。" },
  { name:"暗闇の罠",       effect:"darkness_trap", tile:85,  rarity:"D", weight:8,  desc:"踏むと20ターン暗闇状態。\n視界が1マスになる。" },
  { name:"油まみれの罠",   effect:"oil_trap",       tile:123, rarity:"D", weight:8,  desc:"踏むと油まみれになる（プレイヤー50ターン／敵100ターン）。\n炎・爆発ダメージが2倍。敵が踏んでも同様（ボス・店主も有効）。" },
  { name:"浮遊の罠",       effect:"float_trap",     tile:122, rarity:"D", weight:8,  desc:"踏むと30ターン浮遊する。\n罠にかからなくなるが、階段を降りられなくなる。\n敵が踏んでも浮遊する（ボス・店主も有効）。" },
  /* C: ややレア */
  { name:"落とし穴",       effect:"pitfall",       tile:27,  rarity:"C", weight:4,  desc:"踏むと次のフロアに落ちる。\nアイテムも一緒に落ちる。" },
  { name:"召喚の罠",       effect:"summon_trap",   tile:46,  rarity:"C", weight:4,  desc:"踏むと周囲に2～4体の敵が出現する。\n出現した敵は即座にこちらを認識している。" },
  { name:"封印の罠",       effect:"seal_trap",     tile:48,  rarity:"C", weight:4,  desc:"踏むと50ターン魔法が封印される。\n巻物・魔法・杖が使えなくなる。" },
  { name:"盗みの罠",       effect:"steal_trap",    tile:49,  rarity:"C", weight:4,  desc:"踏むと所持品が1つランダムにフロアのどこかへ飛ばされる。\nアイテムで起動した場合もそのアイテムが飛ばされる。\nロングソードは10%でソボロ助広に変化する。\nキーアイテムは盗まれない。" },
  { name:"影ぬいの罠",     effect:"shadow_stitch", tile:71,  rarity:"E", weight:12, desc:"踏むと5ターン移動不能になる。\n攻撃やアイテム使用は可能。" },
  { name:"惑わしの罠",     effect:"bewitch_trap",  tile:84,  rarity:"C", weight:4,  desc:"踏むと50ターン幻惑状態。\n周囲の見た目と、見渡すで得られる情報が狂う。" },
  { name:"腐敗の罠",       effect:"rot_trap",      tile:94,  rarity:"C", weight:4,  desc:"踏むと所持品の食料が1つランダムに腐る。\n腐った食料は満腹回復が0.4倍に。" },
  { name:"鳴動の罠",       effect:"alarm_trap",     tile:125, rarity:"C", weight:4,  desc:"踏むとフロア中の敵が一斉に気づく。\nダメージはないが危険。敵が踏んでも警報が鳴る。" },
  /* B: レア（危険） */
  { name:"地雷",           effect:"explode",       tile:25,  rarity:"C", weight:4,  desc:"踏むと周囲8マスが大爆発（敵ターン後）。敵は即死、プレイヤーはHP半減（耐火で軽減）。\n壁・罠・大箱・床のアイテムも破壊される。隣の地雷は誘爆する。" },
  { name:"時限爆弾の罠",   effect:"time_bomb",     tile:73,  rarity:"B", weight:2,  desc:"踏むと4ターン後に大爆発が起きる。\n爆発は地雷と同じ威力。離れれば回避できる。\n作動済みの爆心地に薬液をかけると消火可能。\n作動済みは爆心地にカウントダウン表示。" },
  { name:"未識別の罠",     effect:"unident_trap",   tile:124, rarity:"B", weight:2,  desc:"踏むと、識別していた所持品・装備のうち1つがランダムで未識別に戻る。\n武器・防具・食料は祝呪がわからなくなる。\n落ちたアイテムで作動すると、そのアイテムが未識別になる。\n敵が踏むと20ターン混乱する。" },
  { name:"増殖の罠",       effect:"multiply_trap",  tile:126, rarity:"B", weight:2,  desc:"踏むと、同じ部屋の敵がそれぞれ1体ずつ分裂する。\nボス・店主には無効。作動後の破損率50%。" },
  { name:"水鉄砲の罠",     effect:"watergun_trap",  tile:132, rarity:"C", weight:4,  desc:"踏むと水鉄砲を浴びる。ずぶ濡れになり、所持品に水の影響が出る。\n巻物・魔法書は白紙化、食料はサイズ1段階縮小、ペンはインク-1。\nアーマーガッパ（耐水）で防げる。" },
  { name:"転倒の罠",       effect:"trip_trap",      tile:133, rarity:"D", weight:8,  desc:"踏むと転んで小ダメージを受け、所持品が数個ランダムに周囲へ落ちる。\n装備中の武器・防具・指輪とキーアイテムは落ちない。\n落ちた先の罠・泉・水にも作用する。\n体幹の指輪で無効。" },
];

/**
 * 罠テンプレの weight 抽選（rarity 未設定時は weight 1）。
 * @param {object[]} [pool=TRAPS]
 * @param {() => number} [rngFn]
 * @param {number} [biasChance=0] 条件付き抽選を行う運枠の確率
 * @param {(trap: object) => boolean} [biasFilter] 運枠の候補を絞る条件（既定はC以上）
 */
export function pickTrap(pool = TRAPS, rngFn = Math.random, biasChance = 0, biasFilter = null) {
  if (!pool || pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  if (biasChance > 0 && rngFn() < biasChance) {
    const biased = pool.filter(biasFilter || ((trap) => isRarityAtLeast(trap, "C")));
    if (biased.length > 0) return pickWeighted(biased, rngFn);
  }
  return pickWeighted(pool, rngFn);
}

function _explosionBreakWand(it, ax, ay, dg, p, ml, luFn, nameFn, blasted) {
  blasted.add(it);
  const _snap = { type: "wand", effect: it.effect, charges: it.charges ?? 0, blessed: !!it.blessed, cursed: !!it.cursed, name: it.name };
  ml.push(`杖「${resolveItemName(it, nameFn)}」が爆発で壊れ、魔法が炸裂した！`);
  _triggerWandBreakEffect(_snap, ax, ay, dg, p, ml, luFn);
}

/**
 * 爆発共通処理 (地雷・爆弾矢などから呼ぶ)
 * cx, cy: 爆発の中心。周囲8マス＋中心の計9マスを処理する。
 * excludeItem: アイテム破壊から除外するアイテム（罠を踏んだアイテム自身など）
 * mineExplosion: true のとき地雷モード（炎無効でない敵は消滅＋範囲内地雷を連鎖爆発）
 */
let _mineExplosionDepth = 0;
export function doExplosion(cx, cy, dg, p, ml, nameFn = null, srcLabel = "爆発", excludeItem = null, luFn = null, proportional = false, ringExplosion = false, mineExplosion = false, noExpKills = false) {
  ensureItemMimicFloorItems(dg);
  if (isFireExplosionNullified(dg, p)) {
    announceFireExplosionNullified(dg, p, ml, srcLabel);
    return;
  }
  if (mineExplosion) {
    if (_mineExplosionDepth > 4) return;
    if (_mineExplosionDepth === 0) dg._mineDetonatedIds = new Set();
    _mineExplosionDepth++;
  }
  pushExplosionAnim(cx, cy);
  /* プレイヤーへのダメージ（中心含む1タイル以内） */
  if (p && Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)) <= 1) {
    const _fireCtx = ringExplosion || mineExplosion;
    const _hasFireProt = _fireCtx && hasFireResist(p);
    const _oilyMult = oilyDamageMult(dg, p);
    const rawDmg = (ringExplosion ? Math.max(1, Math.floor(p.hp * 3 / 4))
                 : proportional  ? Math.max(1, Math.floor(p.hp / 2))
                 : rng(10, 20)) * _oilyMult;
    const dmg = _fireCtx
      ? reduceFireDamage(rawDmg, p)
      : _applySoakedFireReduction(rawDmg, p);
    const _fireLbl = _fireCtx ? fireResistDamageLabel(p) : _soakedFireLabel(p);
    p.deathCause = `${srcLabel}により`;
    p.hp -= dmg;
    ml.push(`${srcLabel}！${dmg}ダメージ！${_fireLbl}${oilyDamageLabel(dg, p)}`);
    /* 指輪爆発：炎によるアイテム損傷（耐火なし時） */
    if (ringExplosion && !_hasFireProt) applyLightningToInventory(p, dg, ml, luFn, null, true);
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
      for (const m of [...dg.monsters.filter(m => !m.disguisedAsItem && m.x === ax && m.y === ay)]) {
        if (_killed.has(m)) continue;
        wakeIfDormant(m, ml);
        /* 火ダルマ：爆発で分裂（封印中は特性無効で通常ダメージ） */
        if (m.baseKind === "firedemon" && !m.sealed) {
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
            let _bd = Math.max(1, Math.floor(m.hp / 4)) * oilyDamageMult(dg, m);
            _bd = scaleMonFireDmg(m, _bd);
            m.hp -= _bd;
            ml.push(`爆発で${m.name}は${_bd}ダメージ！${oilyDamageLabel(dg, m)}${monFireDmgLabel(m)}`);
            if (m.hp <= 0) { _killed.add(m); killMonster(m, dg, p, ml, luFn, noExpKills || ringExplosion); }
            continue;
          }
          m.hp = 0;
          _killed.add(m); killMonster(m, dg, p, ml, luFn, noExpKills || ringExplosion);
        } else {
          if (consumeBarrier(m, ml)) continue;
          let md = (proportional ? Math.max(1, Math.floor(m.hp / 2)) : rng(8, 15)) * oilyDamageMult(dg, m);
          md = scaleMonFireDmg(m, md);
          m.hp -= md;
          ml.push(`爆風で${m.name}に${md}ダメージ！${oilyDamageLabel(dg, m)}${monFireDmgLabel(m)}`);
          if (m.hp <= 0) { _killed.add(m); killMonster(m, dg, p, ml, luFn, noExpKills); }
        }
      }
      /* アイテム破壊 */
      for (const it of dg.items.filter(i => i !== excludeItem && i.x === ax && i.y === ay)) {
        if (it.type === "scroll") {
          blasted.add(it); ml.push(`巻物「${resolveItemName(it, nameFn)}」が燃えてなくなった！`);
        } else if (it.type === "spellbook") {
          blasted.add(it); ml.push(`魔法書「${resolveItemName(it, nameFn)}」が燃えてなくなった！`);
        } else if (it.type === "potion") {
          blasted.add(it); ml.push(`薬「${resolveItemName(it, nameFn)}」が割れてなくなった！`);
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
            ml.push(`壺「${resolveItemName(it, nameFn)}」が爆発で割れ、中身が飛び出した！`);
          } else { ml.push(`壺「${resolveItemName(it, nameFn)}」が爆発で割れた！`); }
        } else if (it.type === "wand") {
          _explosionBreakWand(it, ax, ay, dg, p, ml, luFn, nameFn, blasted);
        } else if (it.type === "item_mimic") {
          blasted.add(it);
          ml.push(`「${resolveItemName(it, nameFn)}」が爆発で消えた！`);
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
        breakBigboxContents(_hbb, dg, ml);
      }
    }
  }
  if (_blastedBB.length > 0) dg.bigboxes = dg.bigboxes.filter(b => !_blastedBB.includes(b));
  for (const it of blasted) destroyItemMimicFloorItem(dg, it);
  if (blasted.size > 0) dg.items = dg.items.filter(it => !blasted.has(it));
  dg.monsters = dg.monsters.filter(m => m.hp > 0);
  /* 爆発範囲内の石像 */
  for (let ddx = -1; ddx <= 1; ddx++) {
    for (let ddy = -1; ddy <= 1; ddy++) {
      const ax = cx + ddx, ay = cy + ddy;
      hitStatueWithAction(dg, ax, ay, p, ml, luFn, p?.depth, {
        breaks: true,
        spawnItem: false,
        spawnMonster: false,
        breakMessage: "石像が爆発で粉々になって消えた！",
        itemDeps: getFixtureItemDeps(),
      });
    }
  }
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
    doGunpowderExplosion(_gp.x, _gp.y, dg, p, ml, luFn, resolveItemName(_gp));
  }
  /* 地雷モード：範囲内の他の地雷・時限爆弾を連鎖爆発 */
  if (mineExplosion) {
    const _chainMines = (dg.traps || []).filter(t =>
      t.effect === "explode" &&
      (t.x !== cx || t.y !== cy) &&
      !(dg._mineDetonatedIds?.has(t.id)) &&
      Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= 1
    );
    for (const _cm of _chainMines) {
      runMineExplosion(dg, mineExplosionPending(_cm, nameFn), p, ml, luFn, { chainMsg: `${_cm.name}が誘爆した！` });
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
    if (_mineExplosionDepth === 0) delete dg._mineDetonatedIds;
  }
}

/** 火薬壺の爆発処理。中心から半径2マス（5×5=25マス）を対象にする。連鎖爆発あり。 */
let _gunpowderDepth = 0;
export function doGunpowderExplosion(cx, cy, dg, p, ml, luFn, srcLabel = "火薬壺") {
  if (_gunpowderDepth > 5) return;
  if (isFireExplosionNullified(dg, p)) { announceFireExplosionNullified(dg, p, ml, `${srcLabel}の爆発`); return; }
  ensureItemMimicFloorItems(dg);
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
          const _hasFireProt = hasFireResist(p);
          const rawDmg = Math.max(1, Math.floor(p.hp * 3 / 4)) * oilyDamageMult(dg, p);
          const dmg = reduceFireDamage(rawDmg, p);
          p.deathCause = `${srcLabel}の爆発により`;
          p.hp -= dmg;
          ml.push(`${srcLabel}の爆発を受けた！${dmg}ダメージ！${fireResistDamageLabel(p)}${oilyDamageLabel(dg, p)}`);
          if (!_hasFireProt) applyLightningToInventory(p, dg, ml, luFn, null, true);
        }
        /* モンスター：即死（火ダルマは分裂、ボスは現在HPの4分の1ダメージ） */
        for (const m of [...dg.monsters.filter(m => !m.disguisedAsItem)]) {
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
              const _bd = Math.max(1, Math.floor(m.hp / 4)) * oilyDamageMult(dg, m);
              m.hp -= _bd;
              ml.push(`${srcLabel}の爆発で${m.name}は${_bd}ダメージ！${oilyDamageLabel(dg, m)}`);
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
        _blasted.add(it); ml.push(`巻物「${resolveItemName(it)}」が爆風で燃えてなくなった！`);
      } else if (it.type === "potion") {
        _blasted.add(it); ml.push(`薬「${resolveItemName(it)}」が爆風で割れてなくなった！`);
      } else if (it.type === "food") {
        if (!it.cooked) { it.value *= 2; cookFoodMeta(it); it.name = "焼いた" + it.name; ml.push(`${it.name}になった！`); }
        else { burnFoodItem(it, ml); }
      } else if (it.type === "pot") {
        _blasted.add(it);
        if (it.contents?.length > 0) {
          const _ft2 = new Set();
          for (const ci of it.contents) placeItemAt(dg, it.x, it.y, ci, ml, _ft2);
          ml.push(`壺「${resolveItemName(it)}」が爆発で割れ、中身が飛び出した！`);
        } else { ml.push(`壺「${resolveItemName(it)}」が爆発で割れた！`); }
      } else if (it.type === "wand") {
        _explosionBreakWand(it, it.x, it.y, dg, p, ml, luFn, null, _blasted);
      } else if (it.type === "item_mimic") {
        _blasted.add(it);
        ml.push(`「${resolveItemName(it)}」が爆発で消えた！`);
      }
    }
    for (const it of _blasted) destroyItemMimicFloorItem(dg, it);
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
          breakBigboxContents(_hbb, dg, ml);
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
      for (const _gp of _chainPots) doGunpowderExplosion(_gp.x, _gp.y, dg, p, ml, luFn, resolveItemName(_gp));
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
  if (isFireExplosionNullified(dg, p)) {
    announceFireExplosionNullified(dg, p, ml, "時限爆弾の爆発");
    return;
  }
  ensureItemMimicFloorItems(dg);
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
        const _hasFireProt = hasFireResist(p);
        const _oilyMult = oilyDamageMult(dg, p);
        p.deathCause = "時限爆弾の罠の大爆発により";
        if (_hasFireProt) {
          const dmg = reduceFireDamage(Math.max(1, p.hp - 1) * _oilyMult, p);
          p.hp -= dmg;
          ml.push(`大爆発！${dmg}ダメージ！${fireResistDamageLabel(p)}${oilyDamageLabel(dg, p)}`);
        } else if (_oilyMult > 1) {
          const rawDmg = Math.max(1, (p.hp - 1) * _oilyMult);
          p.hp -= rawDmg;
          ml.push(`大爆発！${rawDmg}ダメージ！${oilyDamageLabel(dg, p)}`);
          if (p.hp > 0) applyLightningToInventory(p, dg, ml, luFn, nameFn, true);
        } else {
          p.hp = 1;
          ml.push(`大爆発！HPが1になった！`);
          applyLightningToInventory(p, dg, ml, luFn, nameFn, true);
        }
      }
      /* モンスター：炎無効(火ダルマ)以外は消滅（ボスは現在HPの4分の1ダメージ） */
      for (const m of [...dg.monsters.filter(mm => !mm.disguisedAsItem && mm.x === ax && mm.y === ay)]) {
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
          const _bd = Math.max(1, Math.floor(m.hp / 4)) * oilyDamageMult(dg, m);
          m.hp -= _bd;
          ml.push(`爆発で${m.name}は${_bd}ダメージ！${oilyDamageLabel(dg, m)}`);
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
          blasted.add(it); ml.push(`巻物「${resolveItemName(it, nameFn)}」が燃えてなくなった！`);
        } else if (it.type === "spellbook") {
          blasted.add(it); ml.push(`魔法書「${resolveItemName(it, nameFn)}」が燃えてなくなった！`);
        } else if (it.type === "potion") {
          blasted.add(it); ml.push(`薬「${resolveItemName(it, nameFn)}」が割れてなくなった！`);
        } else if (it.type === "food") {
          if (!it.cooked) { it.value *= 2; cookFoodMeta(it); it.name = "焼いた" + it.name; ml.push(`${it.name}になった！`); }
          else { burnFoodItem(it, ml); }
        } else if (it.type === "pot") {
          blasted.add(it);
          if (it.contents?.length > 0) {
            const ft2 = new Set();
            for (const ci of it.contents) placeItemAt(dg, ax, ay, ci, ml, ft2);
            ml.push(`壺「${resolveItemName(it, nameFn)}」が爆発で割れ、中身が飛び出した！`);
          } else { ml.push(`壺「${resolveItemName(it, nameFn)}」が爆発で割れた！`); }
        } else if (it.type === "wand") {
          _explosionBreakWand(it, ax, ay, dg, p, ml, luFn, nameFn, blasted);
        } else if (it.type === "item_mimic") {
          blasted.add(it);
          ml.push(`「${resolveItemName(it, nameFn)}」が爆発で消えた！`);
        }
      }
    }
  }
  for (const it of blasted) destroyItemMimicFloorItem(dg, it);
  if (blasted.size > 0) dg.items = dg.items.filter(i => !blasted.has(i));
  dg.monsters = dg.monsters.filter(m => m.hp > 0);
  /* 範囲内の地雷を連鎖爆発 */
  const _chainMines = (dg.traps || []).filter(t =>
    t.effect === "explode" &&
    !(dg._mineDetonatedIds?.has(t.id)) &&
    Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= R
  );
  for (const _cm of _chainMines) {
    runMineExplosion(dg, mineExplosionPending(_cm, nameFn), p, ml, luFn, { chainMsg: `${_cm.name}が誘爆した！` });
  }
  /* 範囲内の火薬壺を連鎖爆発 */
  const _chainPots = dg.items.filter(it =>
    it.type === "pot" && it.potEffect === "gunpowder" &&
    Math.max(Math.abs(it.x - cx), Math.abs(it.y - cy)) <= R
  );
  if (_chainPots.length > 0) {
    dg.items = dg.items.filter(i => !_chainPots.includes(i));
    for (const _gp of _chainPots) doGunpowderExplosion(_gp.x, _gp.y, dg, p, ml, luFn, resolveItemName(_gp));
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

/** 踏む以外で壊れた矢/毒矢/落石罠から対応アイテムをばらまく */
export function dropTrapBreakLoot(dg, trap, ml, ft = new Set(), p = null) {
  if (!trap || !dg) return;
  let item = null;
  if (trap.effect === "arrow_trap") item = makeArrow(rng(2, 4));
  else if (trap.effect === "poison_arrow") item = makePoisonArrow(rng(2, 4));
  else if (trap.effect === "strong_arrow") item = makeStrongArrow(rng(2, 4));
  else if (trap.effect === "rockfall") item = makeStone(rng(2, 4));
  if (!item) return;
  placeItemAt(dg, trap.x, trap.y, item, ml, new Set(ft), 0, p, trap.x, trap.y);
}

/** 罠を除去。fromStep / skipLoot 以外の破壊時は dropTrapBreakLoot を呼ぶ */
export function removeTrap(dg, trap, ml, opts = {}) {
  const { fromStep = false, skipLoot = false, message, ft, p } = opts;
  dg.traps = (dg.traps || []).filter(t => t !== trap);
  if (message) ml.push(message);
  if (!fromStep && !skipLoot) dropTrapBreakLoot(dg, trap, ml, ft, p);
}

/** 踏んだ後に罠が壊れる確率（盗み・召喚は50%、それ以外25%） */
export function trapStepBreakChance(trap) {
  return (trap?.effect === "steal_trap" || trap?.effect === "summon_trap" || trap?.effect === "multiply_trap") ? 0.5 : 0.25;
}

/** 罠発動後のランダム破壊（fromStep=true で戦利品ドロップなし） */
export function maybeBreakTrapAfterStep(trap, dg, ml, opts = {}) {
  if (!trap || trap.permanent) return false;
  if (!(dg.traps || []).some(t => t === trap || (trap.id != null && t.id === trap.id))) return false;
  if (Math.random() < trapStepBreakChance(trap)) {
    removeTrap(dg, trap, ml, { fromStep: true, message: `${trap.name}は壊れた。`, ...opts });
    return true;
  }
  return false;
}

export function mineExplosionPending(trap, nameFn = null) {
  return { x: trap.x, y: trap.y, trapId: trap.id, name: trap.name || "地雷", nameFn };
}

export function findMineTrapForPending(dg, pme) {
  if (!pme) return null;
  return (dg.traps || []).find(t =>
    (pme.trapId != null && t.id === pme.trapId) ||
    (t.effect === "explode" && t.x === pme.x && t.y === pme.y)
  ) || null;
}

/** 地雷の爆発：爆発後に破壊判定（踏む・投げ・誘爆すべて共通） */
export function runMineExplosion(dg, pme, p, ml, luFn, opts = {}) {
  const { chainMsg = null } = opts;
  const trap = findMineTrapForPending(dg, pme);
  if (trap?.id != null && dg._mineDetonatedIds?.has(trap.id)) return;
  if (trap) {
    trap.revealed = true;
    if (trap.id != null) {
      if (!dg._mineDetonatedIds) dg._mineDetonatedIds = new Set();
      dg._mineDetonatedIds.add(trap.id);
    }
  }
  if (chainMsg) ml.push(chainMsg);
  doExplosion(pme.x, pme.y, dg, p, ml, pme.nameFn, pme.name, null, luFn, true, false, true);
  if (trap) maybeBreakTrapAfterStep(trap, dg, ml, { p });
}

/** 複数罠を一括除去（呪いの罠の巻物など） */
export function removeTraps(dg, traps, ml, opts = {}) {
  const gone = traps.filter(t => (dg.traps || []).includes(t));
  if (gone.length === 0) return;
  const ids = new Set(gone.map(t => t.id).filter(Boolean));
  dg.traps = (dg.traps || []).filter(t => !gone.includes(t));
  if (opts.message) ml.push(opts.message);
  if (!opts.fromStep) {
    for (const t of gone) dropTrapBreakLoot(dg, t, ml, ids, opts.p);
  }
}

/** 落石罠：対象がいなければ石を通常落下と同様に近くへ置く（罠マスには重ならない） */
export function applyRockfallEffect(dg, tx, ty, trap, ml, ft, p = null) {
  let hit = false;
  const _rfm = monsterAt(dg, tx, ty);
  if (_rfm) {
    const _rfd2 = rng(15, 25);
    _rfm.hp -= _rfd2;
    hit = true;
    ml.push(`${_rfm.name}に岩が命中！${_rfd2}ダメージ！`);
    if (_rfm.hp <= 0) {
      ml.push(`${_rfm.name}は倒れた！`);
      monsterDrop(_rfm, dg, ml, p);
      removeMonster(dg, _rfm);
    }
  }
  if (p && p.x === tx && p.y === ty) {
    const _rfd3 = rng(15, 25);
    p.deathCause = `${trap.name}により`;
    p.hp -= _rfd3;
    hit = true;
    /* 「Nダメージ！」単体だと立ち絵の被ダメ判定に乗らないので岩命中を明示 */
    ml.push(`岩が命中！${_rfd3}ダメージ！`);
  }
  if (!hit) {
    const _rfFt = ft ? new Set(ft) : new Set();
    if (trap?.id) _rfFt.add(trap.id);
    placeItemAt(dg, tx, ty, makeStone(1), ml, _rfFt, 0, p, tx, ty);
    ml.push(`岩が転がった。`);
  }
}

/** 部屋内の分裂可能敵を1体ずつ複製（ボス・店主除外） */
export function multiplyRoomMonsters(dg, cx, cy, ml, p = null) {
  const room = findRoom(dg.rooms || [], cx, cy);
  if (!room) {
    ml.push("しかし分裂する敵がいなかった。");
    return 0;
  }
  const originals = (dg.monsters || []).filter((m) => {
    if (!m || m.isBoss || m.type === "shopkeeper") return false;
    return m.x >= room.x && m.x < room.x + room.w && m.y >= room.y && m.y < room.y + room.h;
  });
  if (originals.length === 0) {
    ml.push("しかし分裂する敵がいなかった。");
    return 0;
  }
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  let n = 0;
  for (const m of originals) {
    for (const [dx, dy] of dirs) {
      const nx = m.x + dx, ny = m.y + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const tile = dg.map[ny]?.[nx];
      if (!tile || tile === T.WALL || tile === T.BWALL) continue;
      if (tile === T.WATER && !monEffectiveFloat(m) && !m.waterOnly) continue;
      if (p && nx === p.x && ny === p.y) continue;
      if (dg.monsters.some((o) => o.x === nx && o.y === ny)) continue;
      const child = {
        ...m,
        id: uid(),
        x: nx,
        y: ny,
        hp: m.maxHp ?? m.hp,
        maxHp: m.maxHp ?? m.hp,
        turnAccum: 0,
        posHistory: [],
        patrolTarget: null,
        aware: true,
      };
      delete child.hasSplit;
      delete child.capturedBy;
      dg.monsters.push(child);
      n++;
      break;
    }
  }
  if (n > 0) ml.push(`部屋の敵が分裂した！(+${n}体)`);
  else ml.push("しかし分裂する場所がなかった。");
  return n;
}

/** 単一アイテムを未識別にする（種別キーを外し、祝呪既知も落とす） */
export function unidentSingleItem(it, identSet = null) {
  if (!it || it.type === "goal" || it.type === "misc" || it.type === "gold" || it.type === "arrow") return false;
  let changed = false;
  const k = getIdentKey(it);
  if (k && identSet?.has?.(k)) {
    identSet.delete(k);
    changed = true;
  }
  /* 種別未識別がなくても、武器・防具・食料等は祝呪既知を落とす */
  if (it.fullIdent || it.bcKnown) {
    it.fullIdent = false;
    it.bcKnown = false;
    changed = true;
  } else if (isBcInstanceType(it) || k) {
    /* 既に不明でもフラグを揃えておく（表示・再識別の一貫性） */
    it.fullIdent = false;
    it.bcKnown = false;
  }
  return changed;
}

/**
 * 識別済みの所持・装備から1つランダムで未識別に戻す
 * （種別識別済み、または祝呪既知の武器・防具・食料など）
 * @returns {{ count: number, item?: object }}
 */
export function unidentPlayerItems(p, identSet) {
  if (!p) return { count: 0 };
  const list = [...(p.inventory || [])];
  if (p.weapon) list.push(p.weapon);
  if (p.armor) list.push(p.armor);
  if (p.arrow) list.push(p.arrow);
  for (const r of p.rings || []) if (r) list.push(r);
  const seen = new Set();
  const candidates = [];
  for (const it of list) {
    if (!it || seen.has(it)) continue;
    seen.add(it);
    if (it.type === "gold" || it.type === "arrow" || it.type === "goal" || it.type === "misc") continue;
    const k = getIdentKey(it);
    const knownKey = !!(k && identSet?.has?.(k));
    const knownFlags = itemBcKnown(it);
    if (knownKey || knownFlags) candidates.push(it);
  }
  if (candidates.length === 0) return { count: 0 };
  const it = candidates[rng(0, candidates.length - 1)];
  unidentSingleItem(it, identSet);
  return { count: 1, item: it };
}

/**
 * 矢/毒矢/強矢の罠：作動時プレイヤーの正面方向の壁側から、プレイヤーへ向かって矢が飛ぶ。
 * @param {{ poison?: boolean, strong?: boolean, ft?: Set }} opts
 * @returns {boolean} 命中（または回避で矢が落ちた）したか
 */
export function fireTrapArrowFromFacing(trap, p, dg, ml, { poison = false, strong = false, ft = null } = {}) {
  const _ft = ft || new Set([trap?.id].filter(Boolean));
  const face = (p && p.facing) || { dx: 0, dy: 1 };
  let fdx = Math.sign(face.dx || 0);
  let fdy = Math.sign(face.dy || 0);
  if (fdx === 0 && fdy === 0) { fdx = 0; fdy = 1; }

  /* 正面方向へ進み、壁（またはマップ外）を矢の起点にする */
  const originX = trap?.x ?? p?.x ?? 0;
  const originY = trap?.y ?? p?.y ?? 0;
  let ox = originX, oy = originY;
  for (let i = 0; i < Math.max(MW, MH) + 2; i++) {
    const nx = ox + fdx, ny = oy + fdy;
    if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) {
      ox = nx; oy = ny;
      break;
    }
    if (dg.map[ny]?.[nx] === T.WALL || dg.map[ny]?.[nx] === T.BWALL) {
      ox = nx; oy = ny;
      break;
    }
    ox = nx; oy = ny;
  }

  /* 飛行方向：正面からプレイヤー側へ（向きの逆） */
  const flyDx = -fdx, flyDy = -fdy;
  const arrow = poison ? makePoisonArrow(1) : strong ? makeStrongArrow(1) : makeArrow(1);
  const label = poison ? "毒矢" : strong ? "強矢" : "矢";
  const baseAtk = poison
    ? (ARROW_T.atk || 3)
    : strong
      ? (STRONG_ARROW_T.atk || 8)
      : (ARROW_T.atk || 3);
  /* 強矢は通常より高めの乱数補正 */
  const dmgPlayer = () => baseAtk + (strong ? rng(2, 6) : rng(1, 4));
  const dmgMon = () => baseAtk + (strong ? rng(1, 5) : rng(0, 3));
  let hit = false;
  let lastX = originX, lastY = originY;

  let cx = ox + flyDx, cy = oy + flyDy;
  for (let step = 0; step < Math.max(MW, MH) + 2; step++) {
    if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) break;
    const tile = dg.map[cy]?.[cx];
    if (tile === T.WALL || tile === T.BWALL) break;
    lastX = cx; lastY = cy;

    if (p && p.x === cx && p.y === cy) {
      if (getDodgePentacleMode(dg, p.x, p.y) === "dodge") {
        ml.push(`みかわしの魔方陣の加護で${label}をかわした！矢が落ちた。`);
        placeItemAt(dg, cx, cy, arrow, ml, _ft);
        hit = true;
        break;
      }
      const d = dmgPlayer();
      p.deathCause = `${trap?.name || label}により`;
      p.hp -= d;
      if (poison) {
        if (hasRingEffect(p, "antidote_ring")) {
          ml.push(`毒矢が命中！${d}ダメージ！しかし指輪が毒を消した！`);
        } else {
          const _poison = applyPlayerPoison(p);
          ml.push(`毒矢が命中！${d}ダメージ！毒を受けた！${_poison.atkLoss > 0 ? "攻撃力が下がった！" : ""}`);
        }
      } else {
        ml.push(`${label}が命中！${d}ダメージ！`);
      }
      hit = true;
      break;
    }

    const m = monsterAt(dg, cx, cy);
    if (m) {
      if (monReflectsProjectiles(m)) {
        ml.push(`${label}が${m.name}に弾き返された！`);
        let rHit = false, rLastX = cx, rLastY = cy;
        let rx = cx + fdx, ry = cy + fdy;
        for (let ri = 0; ri < Math.max(MW, MH) + 2; ri++) {
          if (rx < 0 || ry < 0 || rx >= MW || ry >= MH) break;
          if (dg.map[ry]?.[rx] === T.WALL || dg.map[ry]?.[rx] === T.BWALL) break;
          rLastX = rx; rLastY = ry;
          if (p && p.x === rx && p.y === ry) {
            rHit = true;
            const d = dmgPlayer();
            p.deathCause = `${trap?.name || label}により`;
            p.hp -= d;
            if (poison) {
              if (hasRingEffect(p, "antidote_ring")) {
                ml.push(`跳ね返された毒矢が${pl()}に命中！${d}ダメージ！しかし指輪が毒を消した！`);
              } else {
                const _poison = applyPlayerPoison(p);
                ml.push(`跳ね返された毒矢が${pl()}に命中！${d}ダメージ！毒を受けた！${_poison.atkLoss > 0 ? "攻撃力が下がった！" : ""}`);
              }
            } else {
              ml.push(`跳ね返された${label}が${pl()}に命中！${d}ダメージ！`);
            }
            break;
          }
          rx += fdx; ry += fdy;
        }
        if (!rHit) placeItemAt(dg, rLastX, rLastY, arrow, ml, _ft);
        hit = true;
        break;
      }
      if (getDodgePentacleMode(dg, m.x, m.y) === "dodge") {
        ml.push(`みかわしの魔方陣の加護で${label}が${m.name}に当たらなかった！矢が落ちた。`);
        placeItemAt(dg, cx, cy, arrow, ml, _ft);
      } else {
        const d = dmgMon();
        m.hp -= d;
        if (poison) {
          m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
          ml.push(`毒矢が${m.name}に命中！${d}ダメージ！攻撃力が半減した！`);
        } else {
          ml.push(`${label}が${m.name}に命中！${d}ダメージ！`);
        }
        if (m.hp <= 0) {
          ml.push(`${m.name}は倒れた！`);
          monsterDrop(m, dg, ml, p);
          removeMonster(dg, m);
        }
      }
      hit = true;
      break;
    }

    cx += flyDx;
    cy += flyDy;
  }

  if (!hit) placeItemAt(dg, lastX, lastY, arrow, ml, _ft);
  return hit;
}

let _fireTrapDepth = 0;
export function fireTrapItem(trap, item, dg, tx, ty, ml, ft, p = null, nameFn = null, luFn = null, identSet = null) {
  if (_fireTrapDepth > 5) return "stop";
  _fireTrapDepth++;
  try {
  if (trap?.effect === "fake_stair") {
    const _was = trap.name || "偽の階段";
    materializeFakeStair(trap, getFixtureItemDeps());
    ml.push(`${_was}が罠に化けた！（${trap.name}）`);
    return fireTrapItem(trap, item, dg, tx, ty, ml, ft, p, nameFn, luFn, identSet);
  }
  switch (trap.effect) {
    case "explode": {
      ml.push(`${trap.name}が発動！${resolveItemName(item, nameFn)}は爆発で消し飛んだ！`);
      doExplosion(tx, ty, dg, p, ml, nameFn, trap.name, item, luFn, true, false, true);
      /* 地雷を直接起動したアイテムは爆発で消費する。
         重力などの内部トリガーと、罠を別の罠へ移す処理では対象外にする。 */
      if (item && item !== trap && !item._ephemeralTrapTrigger && Array.isArray(dg.items)) {
        dg.items = dg.items.filter(it => it !== item);
      }
      maybeBreakTrapAfterStep(trap, dg, ml, { p });
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
      /* 重力の力など内部トリガーは落下アイテムにしない（拾えるとバグ） */
      if (item && !item._ephemeralTrapTrigger) {
        if (_pitfallBag) {
          _pitfallBag.push({ kind: 'item', entity: item });
          ml.push(`${trap.name}が発動！${resolveItemName(item, nameFn)}は穴に落ちて次の階へ落下した！`);
        } else {
          ml.push(`${trap.name}が発動！${resolveItemName(item, nameFn)}は穴に落ちて消えた！`);
        }
      } else if (item?._ephemeralTrapTrigger) {
        ml.push(`${trap.name}が発動！`);
      }
      if (p && p.x === tx && p.y === ty) return "pitfall_player";
      return "destroyed";
    }
    case "rust": {
      if (item.type === "weapon" || item.type === "armor") {
        const _op2 = item.plus || 0;
        item.plus = _op2 - 1;
        const _fp2 = v => v > 0 ? "+" + v : v === 0 ? "無印" : "" + v;
        ml.push(`${trap.name}が発動！${resolveItemName(item)}が錆びた！(${_fp2(_op2)}→${_fp2(item.plus)})`);
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
      fireTrapArrowFromFacing({ ...trap, x: tx, y: ty }, p, dg, ml, { poison: false, ft });
      return "restart";
    }
    case "spin": {
      ml.push(`${trap.name}が発動！${resolveItemName(item)}はどこかへ吹き飛んだ！`);
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
            const _spinFromX = p.x, _spinFromY = p.y;
            const _psr = dg.rooms[rng(0, dg.rooms.length - 1)];
            p.x = rng(_psr.x, _psr.x + _psr.w - 1);
            p.y = rng(_psr.y, _psr.y + _psr.h - 1);
            pushPlayerTeleportAnim(_spinFromX, _spinFromY, p.x, p.y);
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
        const _mst = statusTurns("sleep", { kind: "monster", target: _slm });
        _slm.sleepTurns = (_slm.sleepTurns || 0) + _mst;
        ml.push(`${_slm.name}が眠りに落ちた！(${_mst}ターン)`);
      }
      if (p && p.x === tx && p.y === ty) {
        if (blockPlayerStatus(p, ml, { proofAbility: "sleep_proof", proofMsg: "しかし眠れなかった！(耐眠)" })) {
          /* blocked */
        } else {
          const _pst = statusTurns("sleep", { kind: "player" });
          p.sleepTurns = (p.sleepTurns || 0) + _pst;
          ml.push(`眠りに落ちた...(${_pst}ターン)`);
        }
      }
      return "restart";
    }
    case "poison_arrow": {
      ml.push(`${trap.name}が発動！`);
      fireTrapArrowFromFacing({ ...trap, x: tx, y: ty }, p, dg, ml, { poison: true, ft });
      return "restart";
    }
    case "strong_arrow": {
      ml.push(`${trap.name}が発動！`);
      fireTrapArrowFromFacing({ ...trap, x: tx, y: ty }, p, dg, ml, { strong: true, ft });
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
      if (_slwm) {
        if (_slwm.isBoss && _slwm._preSlowSpeed === undefined) _slwm._preSlowSpeed = _slwm.speed;
        _slwm.speed = Math.max(0.25, _slwm.speed * 0.5);
        if (_slwm.isBoss) _slwm.bossSlowTurns = (_slwm.bossSlowTurns || 0) + statusTurns("bossSlow", { kind: "monster", target: _slwm });
        ml.push(`${_slwm.name}が鈍足になった！`);
      }
      if (p && p.x === tx && p.y === ty) {
        if (!blockPlayerStatus(p, ml, { proofAbility: "slow_proof", proofMsg: "しかし防具が鈍足を防いだ！(耐鈍足)" })) {
          const _st = statusTurns("slow", { kind: "player" });
          p.slowTurns = (p.slowTurns || 0) + _st;
          ml.push(`体が重くなった...(鈍足${_st}ターン)`);
        }
      }
      return "restart";
    }
    case "seal_trap": {
      ml.push(`${trap.name}が発動！`);
      const _seam = monsterAt(dg, tx, ty);
      if (_seam) {
        applyMonsterSeal(_seam, dg, p, ml, luFn, {
          message: `${_seam.name}の特技が封印された！`,
        });
      }
      if (p && p.x === tx && p.y === ty) {
        if (!blockPlayerStatus(p, ml, { proofAbility: "seal_proof", proofMsg: "しかし防具が封印を防いだ！(耐封印)" })) {
          const _st = statusTurns("seal", { kind: "player" });
          p.sealedTurns = (p.sealedTurns || 0) + _st;
          ml.push(`魔法が封印された！(${_st}ターン)`);
        }
      }
      return "restart";
    }
    case "steal_trap": {
      ml.push(`${trap.name}が発動！`);
      const _stm = monsterAt(dg, tx, ty);
      if (_stm) {
        /* 敵の一般ドロップと同系統の抽選 */
        const _stPool = ITEMS.filter((i) => i.type !== "gold");
        const _stTmpl = pickLootFromPool(_stPool, "drop") || pick(_stPool);
        const _stNewItem = { ..._stTmpl, id: uid() };
        const _stFtm = new Set([...(ft || [])]);
        if (trap.id != null) _stFtm.add(trap.id);
        const _stPosM = pickRandomFloorInRooms(dg) || { x: tx, y: ty };
        placeItemAt(dg, _stPosM.x, _stPosM.y, _stNewItem, ml, _stFtm, 0, p);
        ml.push(`フロアのどこかにアイテムが出現した！`);
      }
      if (p && p.x === tx && p.y === ty && p.inventory && p.inventory.length > 0) {
        const _stCandidates = p.inventory.filter((i) => i.type !== "goal");
        if (_stCandidates.length > 0) {
          const _stItem = _stCandidates[rng(0, _stCandidates.length - 1)];
          const _stIdx = p.inventory.indexOf(_stItem);
          if (_stIdx !== -1) p.inventory.splice(_stIdx, 1);
          const _stFt = new Set([...(ft || [])]);
          if (trap.id != null) _stFt.add(trap.id);
          const _stPos = pickRandomFloorInRooms(dg) || { x: tx, y: ty };
          const _stFinal = maybeLongswordToSoboro(_stItem);
          placeItemAt(dg, _stPos.x, _stPos.y, _stFinal, ml, _stFt, 0, p);
          const _soboro = _stFinal !== _stItem && _stFinal?.name === "ソボロ助広";
          ml.push(`${resolveItemName(_stItem, nameFn)}がどこかへ飛んでいった！${_soboro ? "なぜかソボロ助広に変化した…！" : ""}`);
        }
      }
      /* 起動したアイテム自体もフロアのどこかへ飛ばす（内部トリガーは除く） */
      if (item && !item._ephemeralTrapTrigger) {
        const _stFt2 = new Set([...(ft || [])]);
        if (trap.id != null) _stFt2.add(trap.id);
        const _stPos2 = pickRandomFloorInRooms(dg) || { x: tx, y: ty };
        const _stFinal2 = maybeLongswordToSoboro(item);
        placeItemAt(dg, _stPos2.x, _stPos2.y, _stFinal2, ml, _stFt2, 0, p);
        const _soboro2 = _stFinal2 !== item && _stFinal2?.name === "ソボロ助広";
        ml.push(`${resolveItemName(item, nameFn)}がどこかへ飛んでいった！${_soboro2 ? "なぜかソボロ助広に変化した…！" : ""}`);
        return "destroyed";
      }
      return "restart";
    }
    case "trip_trap": {
      ml.push(`${trap.name}が発動！`);
      const _trm = monsterAt(dg, tx, ty);
      if (_trm) {
        const _td = rng(3, 8);
        _trm.hp -= _td;
        ml.push(`${_trm.name}が転んだ！${_td}ダメージ！`);
        if (_trm.hp <= 0) killMonster(_trm, dg, p, ml, luFn);
      }
      if (p && p.x === tx && p.y === ty) {
        applyPlayerTrip(p, dg, ml, {
          nameFn,
          trapId: trap.id,
          cause: `${trap.name}による転倒により`,
          checkFloat: false,
        });
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
      if (_ssm) {
        const _it = statusTurns("immobile", { kind: "monster", target: _ssm });
        _ssm.immobileTurns = (_ssm.immobileTurns || 0) + _it;
        ml.push(`${_ssm.name}が影に縫い付けられ動けなくなった！(${_it}ターン移動封じ)`);
      }
      if (p && p.x === tx && p.y === ty) {
        if (!blockPlayerStatus(p, ml)) {
          const _it = statusTurns("immobile", { kind: "player" });
          p.immobileTurns = (p.immobileTurns || 0) + _it;
          ml.push(`影に縫い付けられた！(${_it}ターン移動不能)`);
        }
      }
      return "restart";
    }
    case "rockfall": {
      ml.push(`${trap.name}が発動！岩が降ってきた！`);
      applyRockfallEffect(dg, tx, ty, trap, ml, ft, p);
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
        const _blowFromX = p.x, _blowFromY = p.y;
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
        pushPlayerKnockbackAnim(_blowFromX, _blowFromY, p.x, p.y, _pbdx, _pbdy);
      }
      return "restart";
    }
    case "confuse_trap": {
      ml.push(`${trap.name}が発動！`);
      const _cfm = monsterAt(dg, tx, ty);
      if (_cfm) {
        const _ct = statusTurns("confuse", { kind: "monster", target: _cfm });
        _cfm.confusedTurns = (_cfm.confusedTurns || 0) + _ct;
        ml.push(`${_cfm.name}は混乱した！(${_ct}ターン)`);
      }
      if (p && p.x === tx && p.y === ty) {
        if (!blockPlayerStatus(p, ml, { proofAbility: "confuse_proof", proofMsg: "しかし防具が混乱を防いだ！(耐混乱)" })) {
          const _ct = statusTurns("confuse", { kind: "player" });
          p.confusedTurns = (p.confusedTurns || 0) + _ct;
          ml.push(`頭がくらくらする！(混乱${_ct}ターン)`);
        }
      }
      return "restart";
    }
    case "bewitch_trap": {
      ml.push(`${trap.name}が発動！`);
      const _bwtm = monsterAt(dg, tx, ty);
      if (_bwtm) {
        const _bt = statusTurns("bewitch", { kind: "monster", target: _bwtm });
        _bwtm.fleeingTurns = (_bwtm.fleeingTurns || 0) + _bt;
        ml.push(`${_bwtm.name}が幻惑された！(${_bt}ターン)`);
      }
      if (p && p.x === tx && p.y === ty) {
        if (!blockPlayerStatus(p, ml, { proofAbility: "bewitch_proof", proofMsg: "しかし防具が幻惑を防いだ！(耐惑わし)" })) {
          const _bt = statusTurns("bewitch", { kind: "player" });
          p.bewitchedTurns = (p.bewitchedTurns || 0) + _bt;
          ml.push(`幻惑された！周囲の見た目がおかしくなった！(${_bt}ターン)`);
        }
      }
      return "restart";
    }
    case "darkness_trap": {
      ml.push(`${trap.name}が発動！`);
      const _dktm = monsterAt(dg, tx, ty);
      if (_dktm) {
        const _dt = statusTurns("darkness", { kind: "monster", target: _dktm });
        _dktm.darknessTurns = (_dktm.darknessTurns || 0) + _dt;
        _dktm.darkDir = null;
        _dktm.aware = false;
        ml.push(`${_dktm.name}が暗闇に包まれた！(${_dt}ターン)`);
      }
      if (p && p.x === tx && p.y === ty) {
        if (!blockPlayerStatus(p, ml, { proofAbility: "darkness_proof", proofMsg: "しかし防具が暗闇を防いだ！(耐暗闇)" })) {
          const _dt = statusTurns("darkness", { kind: "player" });
          p.darknessTurns = (p.darknessTurns || 0) + _dt;
          ml.push(`暗闇に包まれた！視界が1マスになる！(${_dt}ターン)`);
        }
      }
      return "restart";
    }
    case "mp_absorb_trap": {
      ml.push(`${trap.name}が発動！`);
      const _mam = monsterAt(dg, tx, ty);
      if (_mam) {
        applyMonsterSeal(_mam, dg, p, ml, luFn, {
          message: `${_mam.name}の特技が封印された！`,
        });
      }
      if (p && p.x === tx && p.y === ty) {
        const _mpBefore = p.mp || 0;
        p.mp = Math.max(0, _mpBefore - 5);
        const _mpLost = _mpBefore - (p.mp || 0);
        ml.push(`MPが${_mpLost}吸い取られた！`);
      }
      return "restart";
    }
    case "float_trap": {
      ml.push(`${trap.name}が発動！`);
      const _flm = monsterAt(dg, tx, ty);
      if (_flm) {
        const _ft = statusTurns("float", { kind: "monster", target: _flm });
        _flm.floatTurns = Math.max(_flm.floatTurns || 0, _ft);
        ml.push(`${_flm.name}がふわっと浮いた！(浮遊${_ft}ターン)`);
      }
      if (p && p.x === tx && p.y === ty) {
        const _ft = statusTurns("float", { kind: "player" });
        p.floatTurns = Math.max(p.floatTurns || 0, _ft);
        ml.push(`体がふわっと浮いた！(浮遊${_ft}ターン)`);
      }
      return "restart";
    }
    case "oil_trap": {
      ml.push(`${trap.name}が発動！`);
      const _olm = monsterAt(dg, tx, ty);
      if (_olm) {
        const _ot = statusTurns("oily", { kind: "monster", target: _olm });
        _olm.oilyTurns = (_olm.oilyTurns || 0) + _ot;
        ml.push(`${_olm.name}は油まみれになった！(${_ot}ターン)`);
      }
      if (p && p.x === tx && p.y === ty) {
        const _ot = statusTurns("oily", { kind: "player" });
        p.oilyTurns = (p.oilyTurns || 0) + _ot;
        ml.push(`油まみれになった！炎ダメージが2倍になる！(${_ot}ターン)`);
      }
      return "restart";
    }
    case "unident_trap": {
      ml.push(`${trap.name}が発動！`);
      const _uim = monsterAt(dg, tx, ty);
      if (_uim) {
        const _ct = statusTurns("confuse", { kind: "monster", target: _uim });
        _uim.confusedTurns = (_uim.confusedTurns || 0) + _ct;
        ml.push(`${_uim.name}は混乱した！(${_ct}ターン)`);
      }
      /* 落ちてきた／作動させたアイテム自体を未識別に */
      const _idSet = identSet || getTrapIdentSet();
      if (item && item.type !== "misc" && unidentSingleItem(item, _idSet)) {
        const _unNm = resolveItemName(item, nameFn);
        ml.push(`${_unNm}が未識別になった！`);
      } else if (!item || item.type === "misc") {
        /* 重力などでアイテム以外が作動 → 何もしない（敵混乱は上） */
      }
      return "restart";
    }
    case "alarm_trap": {
      ml.push(`${trap.name}が発動！フロアに警報が響いた！`);
      let _aw2 = 0;
      for (const m of dg.monsters || []) {
        if (m.type === "shopkeeper" && m.state === "friendly") continue;
        if (!m.aware) _aw2++;
        m.aware = true;
        if (p) { m.lastPx = p.x; m.lastPy = p.y; }
      }
      if (_aw2 > 0) ml.push("敵が騒ぎに気づいた！");
      return "restart";
    }
    case "multiply_trap": {
      ml.push(`${trap.name}が発動！`);
      multiplyRoomMonsters(dg, tx, ty, ml, p);
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

export function makeTorpedo(c = 1) {
  return { ...TORPEDO_T, id:uid(), count:Math.min(99, c) };
}

export function makeCrawlingBomb(c = 1) {
  return { ...CRAWLING_BOMB_T, id:uid(), count:Math.min(99, c) };
}

export function makeHomingShot(c = 1) {
  return { ...HOMING_SHOT_T, id:uid(), count:Math.min(99, c) };
}

export function makeMagicStone(c = 1) {
  return { ...MAGIC_STONE_T, id:uid(), count:Math.min(99, c) };
}

/**
 * 矢スタックの type/属性に合った1本（店フラグなし）を生成。
 */
export function makeBasicArrowUnit(stack) {
  if (!stack || stack.type !== "arrow") return makeArrow(1);
  if (stack.specialProjectile === "torpedo") return makeTorpedo(1);
  if (stack.specialProjectile === "crawling_bomb") return makeCrawlingBomb(1);
  if (stack.specialProjectile === "homing") return makeHomingShot(1);
  if (stack.magicStone) return makeMagicStone(1);
  if (stack.stone) return makeStone(1);
  if (stack.bombArrow) return makeBombArrow(1);
  if (stack.pierce) return makePiercingArrow(1);
  if (stack.poison) return makePoisonArrow(1);
  if (stack.strong) return makeStrongArrow(1);
  const u = makeArrow(1);
  if (stack.name) u.name = stack.name;
  if (stack.atk != null) u.atk = stack.atk;
  if (stack.tile != null) u.tile = stack.tile;
  if (stack.desc) u.desc = stack.desc;
  if (stack.sellPrice != null) u.sellPrice = stack.sellPrice;
  if (stack.blessed) u.blessed = true;
  if (stack.cursed) u.cursed = true;
  return u;
}

/**
 * count を既に1減らした矢スタックから、1本分の店商品フラグ・請求を分離する。
 * 着弾アイテムに付けるプロパティを返す（非店なら null）。
 * 消滅して落ちない場合も呼び、スタック側の請求を1本分減らす（未払いは本体に残る）。
 */
export function peelShopArrowUnit(stack) {
  if (!stack || (stack.shopPrice == null && stack._shopId == null)) return null;
  const shopId = stack._shopId;
  const left = Math.max(0, stack.count | 0);
  const n = left + 1;
  const listTotal = stack.shopPrice || 0;
  const hasCharge = stack._shopCharge != null;
  const chargeTotal = hasCharge ? stack._shopCharge : null;
  let unitList;
  let unitCharge = null;
  if (left <= 0) {
    unitList = listTotal;
    unitCharge = chargeTotal;
    delete stack.shopPrice;
    delete stack._shopId;
    delete stack._shopCharge;
    delete stack._origCount;
  } else {
    unitList = n > 0 ? Math.round(listTotal / n) : listTotal;
    if (listTotal > 0 && unitList < 1) unitList = 1;
    if (unitList > listTotal) unitList = listTotal;
    stack.shopPrice = listTotal - unitList;
    if (hasCharge) {
      unitCharge = Math.round(chargeTotal / n);
      stack._shopCharge = Math.max(0, chargeTotal - unitCharge);
    }
    /* 残束は分離後の請求額をそのまま返せるよう orig を現在本数に合わせる */
    stack._origCount = left;
  }
  const props = {};
  if (unitList > 0 || listTotal > 0) props.shopPrice = unitList > 0 ? unitList : 1;
  if (shopId != null) props._shopId = shopId;
  if (unitCharge != null) {
    props._shopCharge = unitCharge;
    props._origCount = 1;
  }
  return props;
}

/**
 * 射撃・投擲でスタックから1本分を切り出す。
 * ※ 呼び出し前に stack.count-- 済みであること。
 * 店商品なら shopPrice / _shopId / _shopCharge を1本に引き継ぐ。
 */
export function makeArrowUnitFromStack(stack) {
  const unit = makeBasicArrowUnit(stack);
  const shop = peelShopArrowUnit(stack);
  if (shop) Object.assign(unit, shop);
  return unit;
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

export function addArrowsInv(inv, c, poison = false, pierce = false, maxInv = 30, bomb = false, strong = false, specialProjectile = null) {
  let r = c;
  const _special = specialProjectile || null;
  for (const i of inv) {
    if (i.type === "arrow" && !i.stone && !i.magicStone && (i.specialProjectile || null) === _special && !!i.poison === poison && !!i.pierce === pierce && !!i.bombArrow === bomb && !!i.strong === strong && i.count < 99) {
      const a = Math.min(r, 99 - i.count);
      i.count += a;
      r -= a;
      if (r <= 0) return true;
    }
  }
  while (r > 0) {
    if (inv.length >= maxInv) return false;
    const n = Math.min(r, 99);
    const _new = _special === "torpedo" ? makeTorpedo(n)
      : _special === "crawling_bomb" ? makeCrawlingBomb(n)
      : _special === "homing" ? makeHomingShot(n)
      : bomb ? makeBombArrow(n)
      : pierce ? makePiercingArrow(n)
      : poison ? makePoisonArrow(n)
      : strong ? makeStrongArrow(n)
      : makeArrow(n);
    inv.push(_new);
    r -= n;
  }
  return true;
}

export function applyPotionEffect(eff, val, kind, target, dg, p, ml, luFn, blessed = false, cursed = false, killerMon = null) {
  if (kind === "monster") wakeIfDormant(target, ml);
  const _monKill = (mon) => {
    if (mon.hp <= 0) killMonster(mon, dg, p, ml, luFn, false, killerMon);
  };
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
          else if (eff === "heal" || eff === "heal_big") {
            const _up = (eff === "heal_big" ? 2 : 1) * (blessed ? 2 : 1);
            if ((p.reverseTurns || 0) > 0) {
              p.hp += _up;
              ml.push(`HPが満タンだったので${_up}ダメージを受けた！${blessed ? "(祝福)" : ""}`);
            } else {
              p.maxHp += _up;
              p.hp += _up;
              ml.push(`HPが満タンだったのでHP最大値が${_up}上昇した！${blessed ? "(祝福)" : ""}`);
            }
            pushHealAnim(p.x, p.y);
          }
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
        else {
          const _shUp = blessed ? 6 : 3;
          if ((p.reverseTurns || 0) > 0) {
            p.hp += _shUp;
            ml.push(`HPが満タンだったので${_shUp}ダメージを受けた！${blessed ? "(祝福)" : ""}`);
          } else {
            p.maxHp += _shUp;
            p.hp += _shUp;
            ml.push(`HPが満タンだったのでHP最大値が${_shUp}上昇した！${blessed ? "(祝福)" : ""}`);
          }
          pushHealAnim(p.x, p.y);
        }
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
          const _poisonTurns = statusTurns("poison", { kind: "monster", blessed, target });
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
            clearPlayerPoison(p);
            ml.push("毒が体から消えた！攻撃力も回復！【呪→解毒】");
          } else {
            ml.push("変な味がするが…毒はかかっていなかった。【呪→解毒】");
          }
        } else if (hasRingEffect(p, "antidote_ring")) {
          ml.push("毒を浴びたが指輪が毒を消した！");
        } else {
          const _poison = applyPlayerPoison(p, { blessed });
          if (blessed) {
            ml.push(`強烈な毒を浴びた！毒状態になり攻撃力が${_poison.atkLoss}下がった！(強毒)`);
          } else {
            ml.push(_poison.atkLoss > 0 ? "毒状態になった！攻撃力が下がった！" : "毒状態が続いている！");
          }
        }
      }
      break;
    }
    case "fire": {
      /* 呪われた爆発の魔方陣：炎を不発にする */
      if (!cursed && isFireExplosionNullified(dg, p)) {
        announceFireExplosionNullified(dg, p, ml, "炎");
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
          /* 火ダルマは炎で回復（封印中は特性無効で通常ダメ） */
          if (target.baseKind === "firedemon" && !target.sealed) {
            const _fheal = Math.min(Math.round(dmg * (blessed ? 1.5 : 1)), target.maxHp - target.hp);
            if (_fheal > 0) { target.hp += _fheal; ml.push(`炎を受けた${target.name}が回復した！(+${_fheal}HP)`); }
            else ml.push(`${target.name}は炎を吸収した！`);
            break;
          }
          const _oilyMult = _oilyCheck(target) ? 2 : 1;
          const d = scaleMonFireDmg(target, Math.max(1, Math.round(dmg * (blessed ? 1.5 : 1) * _oilyMult)));
          target.hp -= d;
          ml.push(`${target.name}は炎に包まれた！${d}ダメージ！${blessed ? "(強炎)" : ""}${_oilyMult > 1 ? "(油まみれ×2)" : ""}${monFireDmgLabel(target)}`);
          _monKill(target);
        }
        if (kind === "player") {
          const _oilyMult = _oilyCheck(p) ? 2 : 1;
          const rd = Math.max(1, Math.round(dmg * (blessed ? 1.5 : 1) * _oilyMult));
          const fd = reduceFireDamage(rd, p);
          p.deathCause = "炎の薬の飛散により";
          p.hp -= fd;
          ml.push(`炎に包まれた！${fd}ダメージ！${fireResistDamageLabel(p)}${blessed ? "(強炎)" : ""}${_oilyMult > 1 ? "(油まみれ×2)" : ""}`);
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
        if (kind === "monster") {
          const t = statusTurns("sleep", { kind: "monster", blessed, target });
          if (!isStatusImmune(target, ml, target.name)) { target.sleepTurns = (target.sleepTurns || 0) + t; ml.push(`${target.name}は眠りに落ちた！(${t}ターン)${blessed ? "(強眠)" : ""}`); }
        }
        if (kind === "player") {
          const t = statusTurns("sleep", { kind: "player", blessed });
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
        if (kind === "player") {
          const _ht = statusTurns("haste", { kind: "player" });
          p.hasteTurns = (p.hasteTurns || 0) + _ht;
          ml.push(`体が軽くなった！(2倍速${_ht}ターン)【呪→加速】`);
        }
      } else {
        if (kind === "monster") {
          if (target.isBoss && target._preSlowSpeed === undefined) target._preSlowSpeed = target.speed;
          target.speed = Math.max(0.25, target.speed * (blessed ? 0.25 : 0.5));
          if (target.isBoss) target.bossSlowTurns = (target.bossSlowTurns || 0) + statusTurns("bossSlow", { kind: "monster", blessed, target });
          ml.push(`${target.name}は鈍足になった！${blessed ? "(強鈍足)" : ""}`);
        }
        if (kind === "player") {
          if (!blockPlayerStatus(p, ml, { proofAbility: "slow_proof", proofMsg: "鈍足効果を受けたが防具が防いだ！(耐鈍足)" })) {
            const _st = statusTurns("slow", { kind: "player", blessed });
            p.slowTurns = (p.slowTurns || 0) + _st;
            ml.push(`体が重くなった...(鈍足${_st}ターン)${blessed ? "(強鈍足)" : ""}`);
          }
        }
      }
      break;
    case "paralyze":
      if (cursed) {
        // 呪い→状態異常防止
        if (kind === "monster") {
          const _si = statusTurns("statusImmune", { kind: "monster", target });
          target.statusImmune = (target.statusImmune || 0) + _si;
          ml.push(`${target.name}は状態異常を防ぐ力を得た！(${_si}ターン)`);
        }
        if (kind === "player") {
          const _si = statusTurns("statusImmune", { kind: "player" });
          p.statusImmune = (p.statusImmune || 0) + _si;
          ml.push(`状態異常を防ぐ力が宿った！(${_si}ターン)【呪→状態防止】`);
        }
      } else {
        if (kind === "monster") {
          if (isStatusImmune(target, ml, target.name)) break;
          applyMonsterParalyze(target, { blessed, ml });
        }
        if (kind === "player") {
          if (isStatusImmune(p, ml)) break;
          if (hasAbility(p.armor, "paralyze_proof")) { ml.push("金縛り効果を受けたが防具が防いだ！(耐金縛り)"); }
          else {
            const _pt = statusTurns("paralyze", { kind: "player", blessed });
            p.paralyzeTurns = _pt;
            ml.push(`金縛りになった！(${_pt}ターン)${blessed ? "(強金縛り)" : ""}`);
          }
        }
      }
      break;
    case "confuse":
      if (cursed) {
        // 呪い→混乱解消 + 必中（攻撃・投擲が外れなくなる）
        if (kind === "monster") { target.confusedTurns = 0; ml.push(`${target.name}の混乱が解けた！`); }
        if (kind === "player") {
          p.confusedTurns = 0;
          const _sh = statusTurns("sureHit", { kind: "player" });
          p.sureHitTurns = (p.sureHitTurns || 0) + _sh;
          ml.push(`頭が冴えた！混乱が消え、必中状態になった！(${_sh}ターン)【呪→必中】`);
        }
      } else {
        if (kind === "monster") {
          const _ct = statusTurns("confuse", { kind: "monster", blessed, target });
          target.confusedTurns = (target.confusedTurns || 0) + _ct;
          ml.push(`${target.name}が混乱した！(${target.confusedTurns}ターン)${blessed ? "(強混乱)" : ""}`);
        }
        if (kind === "player") {
          if (!blockPlayerStatus(p, ml, { proofAbility: "confuse_proof", proofMsg: "混乱効果を受けたが防具が防いだ！(耐混乱)" })) {
            const _ct = statusTurns("confuse", { kind: "player", blessed });
            p.confusedTurns = (p.confusedTurns || 0) + _ct;
            ml.push(`混乱した！(${p.confusedTurns}ターン)${blessed ? "(強混乱)" : ""}`);
          }
        }
      }
      break;
    case "mana":
      if (kind === "player") {
        if (cursed) {
          const _mt = statusTurns("mpCooldown", { kind: "player" });
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + _mt;
          ml.push(`魔力が封じられた！(MP封印${_mt}ターン)【呪】`);
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
          applyMonsterSeal(target, dg, p, ml, luFn, {
            message: target.isBoss ? `${target.name}は封印された！` : `${target.name}は永続的に封印された！【呪→永続封印】`,
          });
          target.mpCooldownTurns = statusTurns("mpCooldown", { kind: "monster", target });
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
          const _ms = statusTurns("monsterSense", { kind: "player" });
          p.monsterSenseTurns = (p.monsterSenseTurns || 0) + _ms;
          ml.push(`呪われた薬！フロアのモンスターが感知できる！(${_ms}ターン)【呪→感知】`);
        } else {
          if (!blockPlayerStatus(p, ml, { proofAbility: "darkness_proof", proofMsg: "暗闇効果を受けたが防具が防いだ！(耐暗闇)" })) {
            const _dt = statusTurns("darkness", { kind: "player", blessed });
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
          if (!isStatusImmune(target, ml, target.name)) {
            const _dt = statusTurns("darkness", { kind: "monster", blessed, target });
            target.darknessTurns = _dt;
            target.darkDir = null;
            target.aware = false;
            ml.push(`${target.name}は暗闇に包まれた！${isPermanentTurns(_dt) ? "(永続)" : `(${_dt}ターン)`}`);
          }
        }
      }
      break;
    case "bewitch":
      if (kind === "player") {
        if (cursed) {
          dg.traps.forEach(t => t.revealed = true);
          ml.push("呪われた薬！フロアの罠が全て見えた！【呪→罠看破】");
        } else {
          if (!blockPlayerStatus(p, ml, { proofAbility: "bewitch_proof", proofMsg: "幻惑効果を受けたが防具が防いだ！(耐惑わし)" })) {
            const _bt = statusTurns("bewitch", { kind: "player", blessed });
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
          const _bt = statusTurns("bewitch", { kind: "monster", blessed, target });
          target.fleeingTurns = _bt;
          ml.push(`${target.name}は幻惑状態になり逃げ出した！${isPermanentTurns(_bt) ? "(永続)" : `(${_bt}ターン)`}`);
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
          applyMonsterSeal(target, dg, p, ml, luFn, { blessed });
          if (blessed && target.hp > 0 && dg.monsters?.includes(target)) {
            if (target.isBoss && target._preSlowSpeed === undefined) target._preSlowSpeed = target.speed;
            target.speed = Math.max(0.25, (target.speed || 1) * 0.5);
            if (target.isBoss) target.bossSlowTurns = (target.bossSlowTurns || 0) + statusTurns("bossSlow", { kind: "monster", blessed, target });
            ml.push(`さらに${target.name}は鈍足になった！(祝福)`);
          }
        }
      }
      if (kind === "player") {
        if (cursed) {
          // 呪い：MP封印解除
          p.mpCooldownTurns = 0;
          ml.push("MP封印が解けた！【呪→解封】");
        } else if (!blockPlayerStatus(p, ml, { proofAbility: "seal_proof", proofMsg: "封印効果を受けたが防具が防いだ！(耐封印)" })) {
          // 通常/祝福：MP封印（祝福：さらに鈍足）
          const _mt = statusTurns("mpCooldown", { kind: "player", blessed });
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + _mt;
          ml.push(`魔力が封じられた！(MP封印${_mt}ターン)${blessed ? "(祝福)" : ""}`);
          if (blessed) {
            if (!blockPlayerStatus(p, ml, { proofAbility: "slow_proof", proofMsg: "鈍足効果を受けたが防具が防いだ！(耐鈍足)" })) {
              const _st = statusTurns("slow", { kind: "player" });
              p.slowTurns = (p.slowTurns || 0) + _st;
              ml.push(`さらに鈍足${_st}ターン！`);
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
  item.value = Math.max(1, Math.floor(item.value * 0.6));
  item.burnt = true;
  ml.push(`${item.name}になった！`);
  return true;
}

export function applyPotionToItem(eff, val, item, dg, ml, cursed = false, dnFn = null) {
  const _dn = dnFn ? dnFn(item) : resolveItemName(item);
  if (eff === "water" && item.type === "food") {
    restoreFoodWithWater(item, ml);
    return;
  }
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
        removeTrap(dg, trap, ml, { message: `${trap.name}は薬液で壊れた！`, p });
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
        doGunpowderExplosion(x, y, dg, p, ml, luFn, resolveItemName(it, dnFn));
      }
    }
  }
}

/* 通常の水は薬と同じ3×3の共通飛散処理を行い、食料を元に戻す。
   祝福・呪いの水だけは着弾点のアイテム1つのみに祝呪効果（周囲8マス無効）。 */
export function applyWaterSplash(dg, cx, cy, blessed, cursed, ml, p = null, luFn = null, dnFn = null) {
  if (!blessed && !cursed) {
    splashPotion(dg, cx, cy, "water", WATER_BOTTLE.value, p, ml, luFn, false, false, dnFn);
    return;
  }
  ml.push("瓶が割れた！");
  pushSplashAnim(cx, cy, blessed ? "#aaddff" : "#aa88ff");
  const it = itemAt(dg, cx, cy);
  if (!it) { if (blessed || cursed) ml.push("着弾点にアイテムがなかった…"); return; }
  if (it.type === "pot") {
    if (blessed) {
      it.capacity = (it.capacity || 1) + 1;
      ml.push(`${resolveItemName(it)}が祝福の水を浴びた！(容量+1 → ${it.capacity})【祝】`);
    } else if (cursed) {
      const _nc = Math.max(0, (it.capacity || 1) - 1);
      if ((it.contents?.length || 0) > _nc) {
        const _fts = new Set();
        for (const _ci of (it.contents || [])) placeItemAt(dg, cx, cy, _ci, ml, _fts);
        removeFloorItem(dg, it);
        ml.push(`${resolveItemName(it)}が呪いの水を浴びて割れた！中身が飛び出した！【呪】`);
      } else {
        it.capacity = _nc;
        ml.push(`${resolveItemName(it)}が呪いの水を浴びた！(容量-1 → ${it.capacity})【呪】`);
      }
    }
  } else if (it.type !== "gold" && it.type !== "arrow") {
    if (blessed) {
      it.blessed = true; it.cursed = false; it.bcKnown = true;
      ml.push(`${resolveItemName(it)}が祝福の水を浴びた！【祝】`);
    } else if (cursed) {
      it.cursed = true; it.blessed = false; it.bcKnown = true;
      ml.push(`${resolveItemName(it)}が呪いの水を浴びた！【呪】`);
    }
  }
}

export function soakItemIntoSpring(spr, item, ml, dg = null, dnFn = null) {
  const _dn = (it) => dnFn ? dnFn(it) : resolveItemName(it);
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

export function placeItemAt(dg, tx, ty, item, ml, ft, dep = 0, p = null, _ox = null, _oy = null, _fromPortal = false) {
  if (item?._ephemeralTrapTrigger) return false;
  /* 帯電毛玉は所持品または箱・壺の中にだけ存在できる。破壊・散乱などで
     床へ出る経路は、罠や泉などの床効果を発生させず、その場で消滅させる。 */
  if (item?.type === "charged_fuzzball") {
    ml?.push(`${resolveItemName(item)}は床に落ちると消えてしまった！`);
    return false;
  }
  if (dep > 30) { ml.push(`${resolveItemName(item)}は消えてしまった！`); return false; }
  /* ポータルの魔方陣：着地点がポータルなら次のポータルへ転送（再帰防止に _fromPortal フラグ）
     キーアイテム自体はポータルを通過させない */
  if (!_fromPortal && item.type !== "goal") {
    const _portal = dg.pentacles?.find(pc => (pc.kind === "portal" || pc.kind === "fixed_portal") && pc.x === tx && pc.y === ty);
    if (_portal) {
      const _r = _tryItemPortalWarp(dg, _portal, item, ml, ft, dep, p);
      if (_r !== null) return _r;
    }
  }
  /* アニメーション用の出発地点（null の場合は tx,ty を使う） */
  const _animOx = _ox ?? tx, _animOy = _oy ?? ty;
  /* 着地点が水タイルなら沈没（同マスに既存アイテムがない場合のみ、ある場合はDROで代替地を探す） */
  if (dg.map[ty]?.[tx] === T.WATER) {
    dg.waterItems = dg.waterItems || [];
    if (!dg.waterItems.some(wi => wi.x === tx && wi.y === ty)) {
      const sunk = soakItem({ ...item, x: tx, y: ty });
      dg.waterItems.push({ x: tx, y: ty, item: sunk });
      ml.push(sunk.name !== item.name ? `${resolveItemName(item)}が水に濡れて白紙になった！` : `${resolveItemName(item)}が水に沈んだ！`);
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
      ml.push(sunk.name !== item.name ? `${resolveItemName(item)}が水に濡れて白紙になった！` : `${resolveItemName(item)}が水に沈んだ！`);
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
      if (trap.effect !== "explode" && !trap.permanent && Math.random() < trapStepBreakChance(trap)) {
        removeTrap(dg, trap, ml, { message: `${trap.name}は壊れた。`, ft, p });
      }
      if (r === "destroyed") return false;
      if (r === "pitfall_player") return "pitfall_player";
      /* restart: 罠座標を新しい出発地点として再帰（seq が一段上がる）。
         destroyed の場合は起動アイテムも消費済みなので再配置しない。 */
      if (r === "restart") return placeItemAt(dg, cx, cy, item, ml, ft, dep + 1, p, cx, cy);
      continue;
    }
    if (dg.traps.some(t => t.x === cx && t.y === cy)) continue;
    if (dg.springs?.some(s => s.x === cx && s.y === cy)) {
      const _spr = dg.springs.find(s => s.x === cx && s.y === cy);
      soakItemIntoSpring(_spr, item, ml, dg, null);
      pushItemArcAnim(_animOx, _animOy, cx, cy, item.tile, dep + 1);
      return true;
    }
    if (dg.bigboxes?.some(b => b.x === cx && b.y === cy)) continue;
    /* 石像：上にアイテムを重ねない */
    if (statueAt(dg, cx, cy)) continue;
    /* ペンタクル：ポータルなら warp 起動、それ以外は通常通りスキップ */
    const _pcAtCxCy = dg.pentacles?.find(pc => pc.x === cx && pc.y === cy);
    if (_pcAtCxCy) {
      if (!_fromPortal && (_pcAtCxCy.kind === "portal" || _pcAtCxCy.kind === "fixed_portal") && item.type !== "goal") {
        const _r = _tryItemPortalWarp(dg, _pcAtCxCy, item, ml, ft, dep, p);
        if (_r !== null) return _r;
      }
      continue;
    }
    if (dg.items.some(i => i.x === cx && i.y === cy)) continue;
    item.x = cx;
    item.y = cy;
    dg.items.push(item);
    /* itemRef を渡すことで flyingItemsRef はこのアイテム固有オブジェクトのみ隠す */
    pushItemArcAnim(_animOx, _animOy, cx, cy, item.tile, dep + 1, item);
    if (item.shopPrice) {
      const _allS = getShops(dg);
      const _iShop = _allS.find(s => s.id === item._shopId) ||
                     _allS.find(s => s.unpaidTotal > 0) ||
                     _allS[0];
      if (_iShop?.room) {
        const r = _iShop.room;
        const _inShop = cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h;
        if (_inShop) {
          /* 返金は拾い時の請求額(_shopCharge)基準。チャージ・矢本数の使用分は残す */
          if (_iShop.unpaidTotal > 0 && item._shopCharge != null) {
            const _ratio = getShopRemainingRatio(item);
            let _refundVal = getShopRefundAmount(item);
            if (_ratio < 1) {
              item.shopPrice = Math.max(0, Math.round((item.shopPrice || 0) * _ratio)); /* 次に拾う list 価格 */
            }
            _iShop.unpaidTotal = Math.max(0, _iShop.unpaidTotal - _refundVal);
            delete item._shopCharge; /* 棚に戻ったので次回拾い時に再計算 */
            delete item._origCharges;
            delete item._origCount;
            if (_iShop.unpaidTotal === 0) {
              const sk = dg.monsters.find(m => m.id === _iShop.shopkeeperId && m.state === "blocking");
              if (sk) moveShopkeeperHome(sk, _iShop, dg);
              if (ml) ml.push("残高がゼロになった。店主が入り口を開けた。");
            }
          }
        } else {
          /* 店外着地：投げ・吹き飛ばし等と同じく請求して値札を外す */
          chargeShopItem(item, dg, ml, p);
        }
      }
    }
    return true;
  }
  ml.push(`${resolveItemName(item)}は消えてしまった！`);
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
    const _wpPool = ITEMS.filter(i => i.type === "weapon" && ["C", "B", "A", "S"].includes(i.rarity));
    placeItemAt(dg, m.x, m.y,
      { ...pick(_wpPool.length ? _wpPool : ITEMS.filter(i => i.type === "weapon")), plus: _tier + 1, id: uid() },
      ml, _ft, 0, p);
    /* 強化防具 (+tier、tier2+) */
    if (_tier >= 2) {
      const _arPool = ITEMS.filter(i => i.type === "armor" && ["C", "B", "A", "S"].includes(i.rarity));
      placeItemAt(dg, m.x, m.y,
        { ...pick(_arPool.length ? _arPool : ITEMS.filter(i => i.type === "armor")), plus: _tier, id: uid() },
        ml, _ft, 0, p);
    }
    /* 高レア巻物 (B/A 中心、S があれば15%) */
    const _scAPool = ITEMS.filter(i => i.type === "scroll" && (i.rarity === "A" || i.rarity === "B"));
    const _scSPool = ITEMS.filter(i => i.type === "scroll" && i.rarity === "S");
    const _scFallback = ITEMS.filter(i => i.type === "scroll" && i.rarity !== "E" && i.rarity !== "D");
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
  if (m.baseKind === "stealthrower" && (m._stealthrowerHeldItem || m.heldItems?.length > 0)) {
    const _ft = new Set();
    const _held = m._stealthrowerHeldItem ? [m._stealthrowerHeldItem] : (m.heldItems || []);
    for (const it of _held) { placeItemAt(dg, m.x, m.y, it, ml, _ft, 0, p); }
    m.heldItems = [];
    delete m._stealthrowerHeldItem;
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
    const _t = pickLootFromPool(_pool, "drop");
    if (_t) {
      const _di = { ..._t, id: uid() };
      if (_di.type === "pen")  _di.charges = rng(2, 3);
      else if (_di.type === "wand") _di.charges = Math.max(1, (_di.charges || 1) + rng(-1, 1));
      drops.push(_di);
    }
  }
  /* 一般ランダムドロップ（固有ドロップは上で別処理）
   * 特技なし・分裂敵: 2%、特技持ち: 5% */
  if (Math.random() < monsterRandomDropChance(m)) {
    const _pool = [...ITEMS.filter(i => i.type !== "gold"), ...WANDS, ...RINGS];
    const _t = pickLootFromPool(_pool, "drop");
    if (_t) {
      const _di = { ..._t, id: uid() };
      if (_di.type === "pen")  _di.charges = rng(2, 3);
      else if (_di.type === "wand") _di.charges = Math.max(1, (_di.charges || 1) + rng(-1, 1));
      drops.push(_di);
    }
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

/** 炎・爆発が不発になるか（呪われた爆発の魔方陣 or 自爆の巻物【呪】バフ） */
export function isFireExplosionNullified(dg, p = null) {
  if (hasCursedExplosionPentacle(dg)) return true;
  if (p && (p.fireExplosionNullTurns || 0) > 0) return true;
  return false;
}

export function announceFireExplosionNullified(dg, p, ml, targetLabel = "爆発") {
  if (p && (p.fireExplosionNullTurns || 0) > 0) {
    ml.push(`炎と爆発が不発にされた！（残り${p.fireExplosionNullTurns}ターン）`);
  } else {
    ml.push(`呪われた爆発の魔方陣が${targetLabel}を打ち消した！`);
  }
}

export function hasCursedTeleportPentacle(dg) {
  return dg.pentacles?.some(pc => pc.kind === "teleport_trap" && pc.cursed) ?? false;
}

/* 爆発の魔方陣：死亡したモンスターの位置で爆発を起こす */
let _explosionDepth = 0;
function _triggerExplosionPentacle(mx, my, dg, p, ml, luFn) {
  if (_explosionDepth > 4 || !dg.pentacles?.length) return;
  /* 呪われた爆発の魔方陣がある場合は爆発を起こさない */
  if (isFireExplosionNullified(dg, p)) return;
  ensureItemMimicFloorItems(dg);
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
        for (const m of [...dg.monsters.filter(m => !m.disguisedAsItem)]) {
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
              const _bd = Math.max(1, Math.floor(m.hp / 4)) * oilyDamageMult(dg, m);
              m.hp -= _bd;
              ml.push(`爆発で${m.name}は${_bd}ダメージ！${oilyDamageLabel(dg, m)}`);
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
          const _hasFireProt = hasFireResist(p);
          const rawDmg = Math.max(1, Math.floor(p.hp * 3 / 4)) * oilyDamageMult(dg, p);
          const dmg = reduceFireDamage(rawDmg, p);
          p.deathCause = `${exPc.name}の爆発により`;
          p.hp -= dmg;
          ml.push(`${exPc.name}の爆発を受けた！${dmg}ダメージ！${fireResistDamageLabel(p)}${oilyDamageLabel(dg, p)}`);
          if (!_hasFireProt) applyLightningToInventory(p, dg, ml, luFn, null, true);
        }
        /* アイテム破壊（巻物・薬・壺） */
        for (const it of dg.items.filter(i => i.x === ax && i.y === ay)) {
          if (it.type === "scroll") { blasted.add(it); ml.push(`巻物「${resolveItemName(it)}」が燃えてなくなった！`); }
          else if (it.type === "potion") { blasted.add(it); ml.push(`薬「${resolveItemName(it)}」が割れてなくなった！`); }
          else if (it.type === "spellbook") { blasted.add(it); ml.push(`魔法書「${resolveItemName(it)}」が燃えてなくなった！`); }
          else if (it.type === "pot") {
            blasted.add(it);
            if (it.potEffect !== "gunpowder") ml.push(`壺「${resolveItemName(it)}」が爆発で割れた！`);
          } else if (it.type === "wand") {
            _explosionBreakWand(it, ax, ay, dg, p, ml, luFn, null, blasted);
          } else if (it.type === "item_mimic") {
            blasted.add(it);
            ml.push(`「${resolveItemName(it)}」が爆発で消えた！`);
          }
        }
        /* 罠の破壊（永続回転板は爆発でも壊れない） */
        const ti = dg.traps.findIndex(t => t.x === ax && t.y === ay && !t.permanent);
        if (ti >= 0) removeTrap(dg, dg.traps[ti], ml, { message: "罠が爆発で壊れた！", p });
        /* 大箱の破壊 */
        if (dg.bigboxes) {
          const bi = dg.bigboxes.findIndex(b => b.x === ax && b.y === ay);
          if (bi >= 0) {
            const bb = dg.bigboxes[bi];
            breakBigboxContents(bb, dg, ml);
            ml.push("大箱が爆発で壊れた！");
          }
        }
      }
    }
    /* 爆発範囲内の魔方陣を消滅 */
    const _blastPcs = dg.pentacles.filter(pc =>
      Math.max(Math.abs(pc.x - mx), Math.abs(pc.y - my)) <= 1
    );
    if (_blastPcs.length > 0) {
      dg.pentacles = dg.pentacles.filter(pc => !_blastPcs.includes(pc));
      for (const _bpc of _blastPcs) ml.push(`爆発で${_bpc.name}が消えた！`);
    }
    for (const it of blasted) destroyItemMimicFloorItem(dg, it);
    dg.items = dg.items.filter(i => !blasted.has(i));
    /* 破壊された火薬壺の連鎖爆発 */
    for (const _gp of [...blasted].filter(it => it.type === "pot" && it.potEffect === "gunpowder")) {
      doGunpowderExplosion(_gp.x, _gp.y, dg, p, ml, luFn, resolveItemName(_gp));
    }
  } finally {
    _explosionDepth--;
  }
}

/* 炎によるインベントリ損傷（巻物・薬・魔法書・帯電毛玉のどれか1つをランダムに消去） */
export function applyFireInventoryDamage(p, ml) {
  if (hasFireResist(p)) return;
  const burnables = p.inventory.filter(i => i.type === "scroll" || i.type === "potion" || i.type === "spellbook" || i.type === "charged_fuzzball");
  if (burnables.length === 0) return;
  const victim = burnables[Math.floor(Math.random() * burnables.length)];
  p.inventory = p.inventory.filter(i => i !== victim);
  const verb = victim.type === "potion" ? "割れてなくなった" : victim.type === "charged_fuzzball" ? "炎で消滅した" : "燃えてなくなった";
  ml.push(`爆発の熱で所持していた「${resolveItemName(victim)}」が${verb}！`);
}

/** プレイヤーがモンスターを倒した時の共通処理。
 *  killerMon を渡すとモンスター同士の撃破扱い（経験値はプレイヤーに入らずkillerMonがレベルアップ） */
export function killMonster(mon, dg, p, ml, luFn, noExp = false, killerMon = null, noRevive = false) {
  const mx = mon.x, my = mon.y;
  /* 呪われた復活の魔方陣：同部屋の蘇りを封じる（復活魔方陣・骨残しなど） */
  const _reviveBlocked = isRevivalSuppressedAt(dg, mx, my);
  /* 復活の魔方陣チェック：魔方陣上/同部屋内でHPゼロになったら全回復で復活（使い捨て） */
  /* noRevive: 願いの敵全滅など、特別に復活させない撃破 */
  if (!noRevive && !_reviveBlocked && dg.pentacles?.length > 0) {
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
  /* 拾い投げ系：投げる前に倒された場合は、持っていた床アイテムを落とす */
  if (mon.carriedItem) {
    const _held = mon.carriedItem;
    delete mon.carriedItem;
    const _ft = new Set();
    placeItemAt(dg, mx, my, _held, ml, _ft, 0, p);
    ml.push(`${mon.name}が持っていた${resolveItemName(_held)}を落とした！`);
  }
  monsterDrop(mon, dg, ml, p);
  removeMonster(dg, mon);
  /* スケルトン：50%で骨を残し5ターン後に復活（復活抑制下では骨を残さない） */
  if (mon.baseKind === "skeleton" && Math.random() < 0.5) {
    if (_reviveBlocked) {
      ml.push(REVIVAL_SUPPRESS_MSG);
      ml.push(`${mon.name}の骨は散らばって消えた。`);
    } else {
      /* 骨の配置先：アイテム・罠・階段・大箱・泉と重ならないマスをDRO(24マス)で探す */
      const _boneBlocked = (bx, by) => {
        const _tile = dg.map[by]?.[bx];
        if (!_tile || _tile === T.WALL || _tile === T.BWALL) return true;
        if (_tile === T.SD || _tile === T.SU) return true;
        if (statueAt(dg, bx, by)) return true;
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
        desc: `倒れた${mon.name}の骨。あと5ターンで復活するかもしれない。踏んでも何も起きない。`,
        monData: { baseKind: mon.baseKind, name: mon.name, hp: mon.maxHp, maxHp: mon.maxHp,
          atk: mon.atk, def: mon.def, exp: mon.exp, speed: mon.speed ?? 1, tile: mon.tile,
          kind: mon.kind, monLevel: mon.monLevel || 1, levels: mon.levels }
      });
      ml.push(`${mon.name}の骨が残った...5ターン後に復活するかもしれない。`);
    }
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
    nameFn = null,
    applyWandFn = null,
    killerMon = null,
    reflectorRange = range,
    animColor = item.type === "potion" ? "#88ccff" : "#ffdd44",
    monHitMsg = (target, dmg) => `飛んできた${resolveItemName(item, nameFn)}が${target.name}に命中！${dmg}ダメージ！`,
    plHitMsg = (dmg) => `飛んできた${resolveItemName(item, nameFn)}が${pl()}に命中！${dmg}ダメージ！`,
    potHitMsg = (target, dmg) => `飛んできた${resolveItemName(item, nameFn)}が${target.name}に当たって割れた！${dmg}ダメージ！`,
    potPlHitMsg = (dmg) => `飛んできた${resolveItemName(item, nameFn)}が${pl()}に当たって割れた！${dmg}ダメージ！`,
    /* 薬瓶/杖の命中前置きメッセージ（splash/applyWandの前に push される） */
    potionHitMsg = null,         /* (target) => string|null */
    potionPlHitMsg = null,       /* () => string|null */
    wandHitMsg = null,           /* (target) => string|null */
    wandPlHitMsg = null,         /* () => string|null */
    /* 着弾位置別メッセージ（指定があれば push） */
    springLandMsg = null,        /* (spr, lx, ly) => string|null */
    bigboxLandMsg = null,        /* (bb, lx, ly) => string|null */
    noHitLandMsg = null,         /* (lx, ly, item) => string|null（壁/末端で何にも当たらず着地時） */
    deathCausePhrase = `飛んできた${resolveItemName(item)}に`,
  } = opts;

  const _isPotion = item.type === "potion";
  const _isPot = item.type === "pot";
  const _isWand = item.type === "wand";
  const _isBombArrow = item.type === "arrow" && item.bombArrow;
  const _isPierceArrow = item.type === "arrow" && item.pierce;
  const _itemName = nameFn ? nameFn(item) : resolveItemName(item);
  const res = { x: shooter.x, y: shooter.y, consumed: false };
  /* _resolveBolt は壁・射程端でコールバック後に戻るため、最後の有効マスを
     resへ引き継ぐ。これがないと投擲物が発射地点扱いになり、遮蔽物の裏で
     消えたように見える。 */
  let _terminalStop = null;

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
          mon.poisonedTurns = Math.max(mon.poisonedTurns || 0, statusTurns("poison", { kind: "monster", target: mon }));
          mon.confusedTurns = (mon.confusedTurns || 0) + statusTurns("confuse", { kind: "monster", target: mon });
          mon.fleeingTurns = (mon.fleeingTurns || 0) + statusTurns("bewitch", { kind: "monster", target: mon });
          if (mon.isBoss && mon._preSlowSpeed === undefined) mon._preSlowSpeed = mon.speed;
          mon.speed = Math.max(0.25, (mon.speed || 1) * 0.5);
          if (mon.isBoss) mon.bossSlowTurns = (mon.bossSlowTurns || 0) + statusTurns("bossSlow", { kind: "monster", target: mon });
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
      let dmg = _isPot ? _potDmg() : _projDmg();
      dmg = applyFrozenPhysicalMult(dmg, p);
      p.deathCause = deathCausePhrase;
      p.hp -= dmg;
      const _plHit = (_isPot ? potPlHitMsg(dmg) : plHitMsg(dmg)) + frozenPhysicalLabel(p);
      mlx.push(_plHit);
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
          const _poison = applyPlayerPoison(p);
          mlx.push(`食中毒になった！毒状態になった！${_poison.atkLoss > 0 ? "攻撃力が下がった！" : ""}`);
        }
        p.confusedTurns = (p.confusedTurns || 0) + statusTurns("confuse", { kind: "player" });
        p.slowTurns = (p.slowTurns || 0) + statusTurns("slow", { kind: "player" });
        mlx.push("混乱・鈍足状態になった！");
      } else if (item.type === "food" && item.rotten && !item.yabai) {
        if (hasRingEffect(p, "antidote_ring")) {
          mlx.push("毒消しの指輪が毒を防いだ！");
        } else {
          const _poison = applyPlayerPoison(p);
          mlx.push(`腐った食料がぶつかった！毒状態になった！${_poison.atkLoss > 0 ? "攻撃力が下がった！" : ""}`);
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
    onStatue: (statue, lx, ly) => {
      /* 石像に当たった投擲物は、石像を壊した時点で消費する。 */
      res.consumed = true; res.hitStatue = statue; res.x = lx; res.y = ly;
    },
    onSelfHit: (mon, lx, ly) => {
      /* 風で射手自身に戻った場合も、敵に実際に命中したので消費する。 */
      res.consumed = true; res.hitMonster = mon; res.x = lx; res.y = ly;
    },
    onTrap: (trap, lx, ly, mlx) => {
      if (_isPotion) {
        res.consumed = true; res.splash = true; res.x = lx; res.y = ly;
        return "destroyed";
      }
      trap.revealed = true;
      const ft = new Set(); ft.add(trap.id);
      const r = fireTrapItem(trap, item, dg, lx, ly, mlx, ft, p);
      if (trap.effect !== "explode" && !trap.permanent && Math.random() < trapStepBreakChance(trap)) {
        removeTrap(dg, trap, mlx, { message: `${trap.name}は壊れた。`, ft, p });
      }
      if (r === "destroyed") { res.consumed = true; return "destroyed"; }
      res.x = lx; res.y = ly; res.consumed = false;
    },
    onWallStop: (lx, ly) => {
      _terminalStop = { x: lx, y: ly };
    },
    onFlyOff: (lx, ly) => {
      _terminalStop = { x: lx, y: ly };
    },
  });

  if (_terminalStop) {
    res.x = _terminalStop.x;
    res.y = _terminalStop.y;
  }

  /* 偽アイテムが命中・泉・大箱などで消費された場合は、紐付いた本体も消す。
     何にも当たらず着地する場合だけ、偽アイテムとして床に残す。 */
  if (item.itemMimicId && (res.consumed || res.spring || res.bigbox || res.hitStatue)) {
    destroyItemMimicFloorItem(dg, item);
    dg.items = dg.items.filter(i => i !== item);
  }

  /* 着弾後のアイテム種別ごとの処理 */
  /* noHitLandMsg：何も命中せず着地（壁/末端）した時のメッセージ。spring/bigbox は専用msg利用、対象命中時は不要 */
  const _noHit = !res.spring && !res.bigbox && !res.hitMonster && !res.hitPlayer && !res.hitStatue;
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
    if (res.hitMonster || res.hitPlayer) {
      const _twSnap = { type: "wand", effect: item.effect, charges: item.charges ?? 0, blessed: !!item.blessed, cursed: !!item.cursed, name: item.name };
      const _twDx = Math.sign(res.x - shooter.x) || 1;
      const _twDy = Math.sign(res.y - shooter.y) || 0;
      const _twOpts = res.hitMonster
        ? { singleTargetKind: "monster", singleTarget: res.hitMonster, effectDx: _twDx, effectDy: _twDy }
        : { singleTargetKind: "player", singleTarget: p, effectDx: -_twDx, effectDy: -_twDy };
      _triggerWandBreakEffect(_twSnap, res.x, res.y, dg, p, ml, luFn, _twOpts);
    } else if (!res.hitStatue) {
      if (_noHit && noHitLandMsg) { const _m = noHitLandMsg(res.x, res.y, item); if (_m) ml.push(_m); }
      const ft = new Set();
      placeItemAt(dg, res.x, res.y, item, ml, ft);
    }
  } else if (_isBombArrow) {
    /* 爆弾矢：着弾点で爆発（呪われた爆発の魔方陣でない場合） */
    if (isFireExplosionNullified(dg, p)) {
      announceFireExplosionNullified(dg, p, ml, "爆弾矢の爆発");
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
  if (kind === "player" && resistsForcedMove(p)) {
    if (ml) ml.push("体幹の指輪のおかげで踏ん張った！強制移動を防いだ！");
    return { x, y, consumed: false, blocked: true };
  }
  let cx = x, cy = y;
  const _isFloorObj = kind === "trap" || kind === "vent" || kind === "pentacle";
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
    /* 風穴・魔方陣：キャラに乗せず手前で止まる */
    if ((kind === "vent" || kind === "pentacle") &&
        ((p && p.x === nx && p.y === ny) || monsterAt(dg, nx, ny))) {
      break;
    }
    /* 床物体：他オブジェクトと重ならない手前で止まる */
    if (_isFloorObj && isFloorOccupancyBlocked(dg, nx, ny, {
      ignore: entity,
      p,
      allowPlayer: kind === "trap", /* 罠のみ着弾で命中処理（上で既に処理） */
      allowMonster: kind === "trap",
    })) {
      break;
    }
    /* kind === "item" は throwItemAlongLine() に移行済み（呼び出し側で直接呼ぶ） */
    if (kind === "monster") {
      /* プレイヤーとの衝突 */
      if (p && p.x === nx && p.y === ny) {
        if (collisionAtk > 0) {
          entity.hp -= collisionAtk;
          p.deathCause = `${entity.name}との衝突により`;
          p.hp -= collisionAtk;
          ml.push(`${entity.name}が${pl()}に激突！お互いに${collisionAtk}ダメージ！`);
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
  if (kind === "monster") { entity.x = cx; entity.y = cy; }
  else if (kind === "player") {
    entity.x = cx; entity.y = cy;
    if (cx !== x || cy !== y) {
      pushAnim({ type: "playerKnockback", fromX: x, fromY: y, toX: cx, toY: cy, dx, dy });
    }
  }
  else if (_isFloorObj) { entity.x = cx; entity.y = cy; }
  return { x:cx, y:cy, consumed:false };
}

/** 店商品の値札・請求メタを外す（店外排出後など） */
export function clearShopItemTags(item) {
  if (!item) return;
  delete item.shopPrice;
  delete item._shopId;
  delete item._shopCharge;
  delete item._origCharges;
  delete item._origCount;
}

/**
 * 店商品を請求して値札を外す（破壊・店外排出用）。
 * 既に _shopCharge がある場合は二重加算せずタグだけ外す。
 * @returns {number} 今回新たに加算した金額
 */
export function chargeShopItem(item, dg, ml, p = null) {
  if (!item?.shopPrice) return 0;
  const _allS = getShops(dg);
  const _shop = _allS.find(s => s.id === item._shopId) || _allS[0];
  if (!_shop) {
    clearShopItemTags(item);
    return 0;
  }
  let charged = 0;
  if (item._shopCharge == null) {
    if (p) {
      charged = applyShopUnpaidCharge(item, _shop, p);
    } else {
      charged = item.shopPrice || 0;
      item._shopCharge = charged;
      _shop.unpaidTotal += charged;
    }
    if (charged > 0) {
      const sk = dg.monsters.find(m => m.id === _shop.shopkeeperId && m.state === "friendly");
      if (sk) sk.state = "blocking";
      if (ml) ml.push(`${resolveItemName(item)}(${charged}G)の代金が請求された！`);
    }
  }
  /* 店外・破壊後は値札付き商品を残さない */
  clearShopItemTags(item);
  return charged;
}

/**
 * 座標 (x,y) が所属店の外なら請求して値札を外す。
 * テレポート／吹き飛ばし／場所替えなどで店商品が移動したあとに呼ぶ。
 * @returns {boolean} 店外として処理したか
 */
export function claimShopItemIfOutside(item, dg, x, y, ml, p = null) {
  if (!item?.shopPrice) return false;
  const _allS = getShops(dg);
  const _shop = _allS.find(s => s.id === item._shopId) || _allS[0];
  if (!_shop?.room) return false;
  const r = _shop.room;
  if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return false;
  chargeShopItem(item, dg, ml, p);
  return true;
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
  if (inMagicSealRoom(x, y, dg)) return false;
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
  return calcAtkDefDmg(ap, def, { defWeight: 1 });
}

/** reflector に当たった魔法の石をプレイヤーへホーミング反射する。 */
export function reflectMagicStoneToPlayer(p, reflector, stoneName, stoneAtk, ml) {
  if (!p || !monReflectsProjectiles(reflector)) return null;
  const dmg = calcProjectileDmg(p, stoneAtk || 5, 0);
  p.hp -= dmg;
  p.deathCause = `${reflector.name}に跳ね返された${stoneName}で`;
  ml.push(`${stoneName}が${reflector.name}に弾き返された！`);
  ml.push(`跳ね返された${stoneName}が${pl()}にホーミング命中！${dmg}ダメージ！消滅した。`);
  if (p.sleepTurns > 0) { p.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
  if (p.paralyzeTurns > 0) { p.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
  return dmg;
}

const SPECIAL_PROJECTILE_COLORS = {
  torpedo: "#48c8ff",
  crawling_bomb: "#ff6848",
  homing: "#d08cff",
};

function specialProjectileColor(kind) {
  return SPECIAL_PROJECTILE_COLORS[kind] || "#d0a050";
}

function specialProjectileMonsterAt(dg, x, y) {
  return (dg.monsters || []).find(m => m.x === x && m.y === y && (m.hp ?? 1) > 0) || null;
}

function nearestSpecialProjectileTarget(dg, x, y, range = 10) {
  return (dg.monsters || [])
    .filter(m => (m.hp ?? 1) > 0 && Math.max(Math.abs(m.x - x), Math.abs(m.y - y)) <= range)
    .sort((a, b) => {
      const da = Math.max(Math.abs(a.x - x), Math.abs(a.y - y));
      const db = Math.max(Math.abs(b.x - x), Math.abs(b.y - y));
      return da - db;
    })[0] || null;
}

function specialProjectileCellOpen(dg, x, y) {
  return x >= 0 && x < MW && y >= 0 && y < MH &&
    dg.map?.[y]?.[x] !== T.WALL && dg.map?.[y]?.[x] !== T.BWALL;
}

function specialProjectileHitMonster(sp, monster, dg, p, ml, luFn) {
  const _dodgeMode = getDodgePentacleMode(dg, monster.x, monster.y);
  const _sureHit = (p?.sureHitTurns || 0) > 0;
  const _miss = _dodgeMode === "dodge" ||
    (!_sureHit && !isEvasionDisabledByStatus(monster) && _dodgeMode !== "sure" && Math.random() >= 0.90);
  if (_miss) {
    if (_dodgeMode === "dodge") ml.push(`みかわしの魔方陣の加護で${monster.name}に${sp.name}が当たらなかった！`);
    ml.push(`${sp.name}は${monster.name}に外れて消えた！`);
    return;
  }
  if (consumeBarrier(monster, ml)) return;
  const _dmg = clampDmgFixed(monster, calcProjectileDmg(p, sp.atk || 1, monster.def), true);
  monster.hp -= _dmg;
  ml.push(`${sp.name}が${monster.name}に命中！${_dmg}ダメージ！`);
  if (monster.hp <= 0) killMonster(monster, dg, p, ml, luFn);
}

function specialProjectilePlayerHit(sp, p, ml) {
  if (!p) return;
  const _dmg = calcProjectileDmg(p, sp.atk || 1, 0);
  p.hp -= _dmg;
  p.deathCause = `${sp.name}に当たって`;
  ml.push(`${sp.name}が自分に当たった！${_dmg}ダメージ！`);
}

function chooseHomingStep(sp, target, dg) {
  const _dirs = [
    [sp.dx, sp.dy], [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ].filter(([dx, dy], i, all) => (dx || dy) && all.findIndex(([x, y]) => x === dx && y === dy) === i);
  const _tx = target?.x ?? (sp.x + sp.dx), _ty = target?.y ?? (sp.y + sp.dy);
  const _candidates = _dirs.map(([dx, dy], order) => {
    const x = sp.x + Math.sign(dx || 0), y = sp.y + Math.sign(dy || 0);
    if (!specialProjectileCellOpen(dg, x, y)) return null;
    return {
      x, y, dx: Math.sign(dx || 0), dy: Math.sign(dy || 0), order,
      distance: Math.max(Math.abs(_tx - x), Math.abs(_ty - y)),
    };
  }).filter(Boolean);
  _candidates.sort((a, b) => a.distance - b.distance || a.order - b.order);
  return _candidates[0] || null;
}

function consumeSpecialProjectileArrow(p, idx, st) {
  st.count--;
  if (st.count <= 0) {
    if (p.arrow === st) p.arrow = null;
    const _idx = p.inventory.indexOf(st);
    if (_idx >= 0) p.inventory.splice(_idx, 1);
  }
  peelShopArrowUnit(st);
}

function launchSpecialProjectile(p, dg, idx, dx, dy, ml, { forceMiss = false } = {}) {
  const st = p.inventory[idx];
  if (!st?.specialProjectile) return false;
  const _kind = st.specialProjectile;
  const _name = st.name || "飛び道具";
  consumeSpecialProjectileArrow(p, idx, st);
  const _fc = getFarcastMode(p.x, p.y, dg);
  if (forceMiss || _fc === "farcast") {
    ml.push(`${_name}を射った。${_name}は消滅した。`);
    return true;
  }
  const _first = stepProjectile(dg, p.x, p.y, dx, dy);
  if (!specialProjectileCellOpen(dg, _first.x, _first.y)) {
    ml.push(`${_name}を射ったが、すぐに壁に当たって消えた。`);
    return true;
  }
  if (_kind === "torpedo" && dg.map?.[_first.y]?.[_first.x] !== T.WATER) {
    ml.push(`${_name}は水に入れず消えた。`);
    return true;
  }
  const _target = _kind === "homing" ? nearestSpecialProjectileTarget(dg, p.x, p.y, 10) : null;
  dg.specialProjectiles ||= [];
  dg.specialProjectiles.push({
    id: uid(), kind: _kind, name: _name, atk: st.atk || 1,
    x: p.x, y: p.y, dx: _first.dx, dy: _first.dy,
    targetId: _target?.id ?? null, turnsLeft: _kind === "torpedo" ? 30 : 20,
  });
  ml.push(`${_name}を射った！`);
  return true;
}

/** 床を進む特殊飛び道具をプレイヤーの1ターン分だけ進める。 */
export function advanceSpecialProjectiles(dg, p, ml, luFn) {
  if (!dg?.specialProjectiles?.length) return;
  const _remaining = [];
  for (const sp of dg.specialProjectiles) {
    if ((sp.turnsLeft ?? 0) <= 0) continue;
    let _target = null;
    if (sp.kind === "homing") {
      if (sp.targetId) _target = (dg.monsters || []).find(m => m.id === sp.targetId && (m.hp ?? 1) > 0) || null;
      if (!_target) _target = nearestSpecialProjectileTarget(dg, sp.x, sp.y, 10);
      if (_target?.id != null) sp.targetId = _target.id;
    }
    const _next = sp.kind === "homing"
      ? chooseHomingStep(sp, _target, dg)
      : stepProjectile(dg, sp.x, sp.y, sp.dx, sp.dy);
    if (!_next || !specialProjectileCellOpen(dg, _next.x, _next.y)) {
      if (sp.kind === "crawling_bomb") {
        ml.push(`${sp.name}が壁に触れて爆発した！`);
        doExplosion(sp.x, sp.y, dg, p, ml, null, `${sp.name}の爆発`, null, luFn);
      } else {
        ml.push(`${sp.name}は進めず消えた。`);
      }
      continue;
    }
    if (sp.kind === "torpedo" && dg.map?.[_next.y]?.[_next.x] !== T.WATER) {
      ml.push(`${sp.name}は水の外に出て消えた。`);
      continue;
    }
    sp.dx = _next.dx ?? sp.dx;
    sp.dy = _next.dy ?? sp.dy;
    const _monster = specialProjectileMonsterAt(dg, _next.x, _next.y);
    const _bigbox = dg.bigboxes?.some(b => b.x === _next.x && b.y === _next.y);
    const _statue = statueAt(dg, _next.x, _next.y);
    const _player = p && p.x === _next.x && p.y === _next.y;
    pushAnim({ type: "projectile", fromX: sp.x, fromY: sp.y, toX: _next.x, toY: _next.y, color: specialProjectileColor(sp.kind), path: [{ x: sp.x, y: sp.y }, { x: _next.x, y: _next.y }] });
    sp.x = _next.x; sp.y = _next.y;
    sp.turnsLeft--;
    if (sp.kind === "crawling_bomb" && (_monster || _bigbox || _statue || _player)) {
      ml.push(`${sp.name}が${_monster?.name || "障害物"}に触れて爆発した！`);
      doExplosion(sp.x, sp.y, dg, p, ml, null, `${sp.name}の爆発`, null, luFn);
      continue;
    }
    if (_monster) {
      specialProjectileHitMonster(sp, _monster, dg, p, ml, luFn);
      continue;
    }
    if (_player && sp.kind !== "homing") {
      specialProjectilePlayerHit(sp, p, ml);
      continue;
    }
    if (sp.turnsLeft > 0) _remaining.push(sp);
  }
  dg.specialProjectiles = _remaining;
}

export function shootArrow(p, dg, idx, dx, dy, ml, luFn, bbFn, animFn = null, outgoingBolt = null, { forceMiss = false } = {}) {
  const st = p.inventory[idx];
  if (!st || st.type !== "arrow") return;
  if (st.specialProjectile) {
    launchSpecialProjectile(p, dg, idx, dx, dy, ml, { forceMiss });
    return;
  }
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
  /* 店商品フラグ付き1本。複数回呼ばないよう1回だけ生成して使い回す */
  let _shotUnit = null;
  const _dropItem = () => {
    if (!_shotUnit) _shotUnit = makeArrowUnitFromStack(st);
    return _shotUnit;
  };
  const _ensureShopPeeled = () => {
    if (!_shotUnit) peelShopArrowUnit(st);
  };
  let lx = p.x, ly = p.y, hit = false;
  let _fdx = dx, _fdy = dy, _cx = p.x, _cy = p.y, _windMsg = false;
  const _path = [{ x: p.x, y: p.y }];
  for (let d = 1; d <= _maxR; d++) {
    const _st = stepProjectile(dg, _cx, _cy, _fdx, _fdy);
    if (_st.bent && !_windMsg) { ml.push("風穴の風が飛び道具を曲げた！"); _windMsg = true; }
    _fdx = _st.dx; _fdy = _st.dy;
    const tx = _st.x, ty = _st.y;
    _cx = tx; _cy = ty;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
    if (!_pierceMode && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
    _path.push({ x: tx, y: ty });
    /* 風で曲がって自分に当たった */
    if (tx === p.x && ty === p.y) {
      const _selfD = calcProjectileDmg(p, _arAtk, 0);
      p.hp -= _selfD;
      p.deathCause = "風に煽られた矢に当たって";
      ml.push(`風に煽られた${_arName}が自分に当たった！${_selfD}ダメージ！`);
      hit = true; break;
    }
    /* 石像：矢は破壊して止まる（貫通矢も1体分として割る） */
    if (statueAt(dg, tx, ty)) {
      ml.push(`${_arName}が石像に命中！`);
      tryBreakStatueAt(dg, tx, ty, p, ml, luFn, p?.depth, getFixtureItemDeps());
      hit = true;
      if (!_pierceMode) break;
      continue;
    }
    const m = monsterAt(dg, tx, ty);
    if (m) {
      /* 下手投げなどの絶対ミスは、反射・障壁より先に処理する。 */
      if (forceMiss) {
        if (_pierceMode) continue;
        ml.push(`${_arName}は${m.name}に外れ、足元に落ちた！`);
        const _missFt = new Set();
        placeItemAt(dg, tx, ty, _dropItem(), ml, _missFt);
        hit = true;
        break;
      }
      /* ── reflector（ミラーゴーレム等）：矢をプレイヤーへ跳ね返す（封印中は無効） ── */
      if (!_pierceMode && monReflectsProjectiles(m)) {
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
            const _poison = applyPlayerPoison(p);
            ml.push(`跳ね返された${_arName}が${pl()}に命中！${_refDmg}ダメージ！毒を受けた！${_poison.atkLoss > 0 ? "攻撃力が下がった！" : ""}`);
          } else if (_isPoison) {
            ml.push(`跳ね返された${_arName}が${pl()}に命中！${_refDmg}ダメージ！しかし指輪が毒を消した！`);
          } else {
            ml.push(`跳ね返された${_arName}が${pl()}に命中！${_refDmg}ダメージ！消滅した。`);
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
  if (animFn && _path.length > 1) {
    const _col = _isPierce ? "#ff8844" : _isPoison ? "#60d060" : "#d0a050";
    animFn({ type: "projectile", fromX: p.x, fromY: p.y, toX: lx, toY: ly, color: _col, path: _path });
  }
  if (_pierceMode || _fc === "cursed") {
    ml.push(`${_arName}を射った。矢は消滅した。`);
    _ensureShopPeeled(); /* 消滅でも店請求は1本分スタックから外す */
  } else if (!hit) {
    ml.push(`${_arName}を射った。`);
    const ft = new Set();
    placeItemAt(dg, lx, ly, _dropItem(), ml, ft);
  } else {
    /* 命中で落ちなかった場合も店フラグ請求を1本分分離 */
    _ensureShopPeeled();
  }
}

/**
 * 店泥棒状態にする（警備員スポーン用 shopTheft・isThief・店主敵対・値札解除）。
 * 既に泥棒でも、未払い店主を敵対に揃える。
 * @returns {boolean} 新たに泥棒扱いにした（メッセージ用）
 */
export function declareShopTheft(p, dg, ml, opts = {}) {
  if (!dg || !p) return false;
  const wasThief = !!(dg.shopTheft || p.isThief);
  dg.shopTheft = true;
  p.isThief = true;
  /* 未払い商品の値札を外す（支払い対象は unpaidTotal 側に残る） */
  for (const it of p.inventory || []) {
    if (it.shopPrice != null || it._shopId != null) {
      delete it.shopPrice;
      delete it._shopId;
      delete it._shopCharge;
      delete it._origCharges;
      delete it._origCount;
    }
  }
  /* 未払いのある店（または forceAll）の店主を敵対化。モールで複数店あっても漏れない */
  const shops = getShops(dg);
  for (const s of shops) {
    if (!opts.forceAll && (s.unpaidTotal || 0) <= 0) continue;
    const sk = dg.monsters.find((m) => m.id === s.shopkeeperId);
    if (sk) {
      sk.state = "hostile";
      sk.aware = true;
      sk.lastPx = p.x;
      sk.lastPy = p.y;
    }
  }
  /* 警備員を次ターン以降すぐ出せるようスポーン予定を前倒し */
  if (dg.nextGuardSpawnTurn == null || dg.nextGuardSpawnTurn > (p.turns ?? 0)) {
    dg.nextGuardSpawnTurn = p.turns ?? 0;
  }
  if (!wasThief && ml && opts.message !== null) {
    ml.push(opts.message || "商品を持ったまま店を出た！泥棒扱いになった！");
  }
  return !wasThief;
}

/** 未払いを抱えたまま店の外にいるか確認し、泥棒状態にする（endTurn 等） */
export function checkShopTheft(p, dg, ml) {
  if (!dg || !p || p.isThief) return;
  const shops = getShops(dg);
  for (const s of shops) {
    if ((s.unpaidTotal || 0) <= 0 || !s.room) continue;
    const inShop = p.x >= s.room.x && p.x < s.room.x + s.room.w &&
                   p.y >= s.room.y && p.y < s.room.y + s.room.h;
    if (!inShop) {
      declareShopTheft(p, dg, ml);
      return;
    }
  }
}

/** 店主の敵対を回復で解除してよいか（泥棒中・未払い中は不可） */
export function canCalmShopkeeper(m, dg, p) {
  if (!m || m.type !== "shopkeeper" || m.state !== "hostile") return false;
  if (dg?.shopTheft || p?.isThief) return false;
  const shop = getShops(dg).find((s) => s.shopkeeperId === m.id);
  if (shop && (shop.unpaidTotal || 0) > 0) return false;
  return m.hp >= m.maxHp;
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
  {id:"transform_magic",name:"変化の魔法",        mpCost:10, effect:"transform_magic", range:10,  needsDir:true,  desc:"対象を同じ階層の敵に変える。MP:10"},
  {id:"identify_magic", name:"識別の魔法",        mpCost:5,  effect:"identify_magic",             needsDir:false, desc:"持ち物から1つ選んで識別する。MP:5"},
  {id:"bless_magic",    name:"祝福の魔法",        mpCost:18, effect:"bless_magic",                needsDir:false, desc:"アイテムを1つ選んで祝福する。MP:18"},
  {id:"curse_magic",    name:"呪いの魔法",        mpCost:5,  effect:"curse_magic",                needsDir:false, desc:"アイテムを1つ選んで呪う。MP:5"},
  {id:"debug_summon_mon", name:"[debug]敵召喚",   mpCost:0,  fixedMpCost:true, effect:"debug_summon_mon",  needsDir:false, debug:true, desc:"任意の敵を1体選んで呼び出す。MP:0"},
  {id:"debug_get_item",   name:"[debug]アイテム取得",mpCost:0,fixedMpCost:true,effect:"debug_get_item",   needsDir:false, debug:true, desc:"任意のアイテムを1個選んで入手する。MP:0"},
  {id:"debug_create_trap",name:"[debug]罠生成",   mpCost:0,  fixedMpCost:true, effect:"debug_create_trap", needsDir:false, debug:true, desc:"任意の罠を1つ選んで足元に作る。MP:0"},
  {id:"debug_summon_bb",  name:"[debug]大箱召喚", mpCost:0,  fixedMpCost:true, effect:"debug_summon_bb",   needsDir:false, debug:true, desc:"任意の大箱を1つ選んで呼び出す。MP:0"},
];
export const SPELLBOOKS=[
  {name:"炎の魔法書",       type:"spellbook",spell:"fire_bolt",       rarity:"C", weight:4,  sellPrice:2500,  desc:"炎の魔法を習得できる。火に弱い。",tile:43},
  {name:"氷の魔法書",       type:"spellbook",spell:"ice_bolt",        rarity:"C", weight:4,  sellPrice:2500,  desc:"氷の魔法を習得できる。火に弱い。",tile:43},
  {name:"雷の魔法書",       type:"spellbook",spell:"lightning_magic", rarity:"C", weight:4,  sellPrice:3000,  desc:"雷の魔法を習得できる。火に弱い。",tile:43},
  {name:"眠りの魔法書",     type:"spellbook",spell:"sleep_bolt",      rarity:"C", weight:4,  sellPrice:2500,  desc:"眠りの魔法を習得できる。火に弱い。",tile:43},
  {name:"テレポートの魔法書",type:"spellbook",spell:"teleport_magic", rarity:"B", weight:2,  sellPrice:5000,  desc:"テレポートの魔法を習得できる。火に弱い。",tile:43},
  {name:"テレポートアザーの魔法書",type:"spellbook",spell:"teleport_other",rarity:"B", weight:2,  sellPrice:5000,  desc:"テレポートアザーの魔法を習得できる。火に弱い。",tile:43},
  {name:"毒の魔法書",            type:"spellbook",spell:"poison_bolt",   rarity:"C", weight:4,  sellPrice:2500,  desc:"毒の魔法を習得できる。火に弱い。",tile:43},
  {name:"透明の魔法書",          type:"spellbook",spell:"invisible_magic",rarity:"A", weight:1,  sellPrice:6000,  desc:"透明の魔法を習得できる。火に弱い。",tile:43},
  {name:"壁抜けの魔法書",        type:"spellbook",spell:"wallwalk_magic", rarity:"A", weight:1,  sellPrice:8000,  desc:"壁抜けの魔法を習得できる。火に弱い。",tile:43},
  {name:"回復の魔法書",       type:"spellbook",spell:"heal_magic",       rarity:"B", weight:2,  sellPrice:5000,  desc:"回復の魔法を習得できる。火に弱い。",tile:43},
  {name:"HP吸収の魔法書",    type:"spellbook",spell:"drain_hp",         rarity:"C", weight:4,  sellPrice:3000,  desc:"HP吸収の魔法を習得できる。火に弱い。",tile:43},
  {name:"金縛りの魔法書",    type:"spellbook",spell:"paralyze_magic",   rarity:"C", weight:4,  sellPrice:2500,  desc:"金縛りの魔法を習得できる。火に弱い。",tile:43},
  {name:"食料生成の魔法書",  type:"spellbook",spell:"food_create",       rarity:"C", weight:4,  sellPrice:2000,  desc:"食料生成の魔法を習得できる。火に弱い。",tile:43},
  {name:"変化の魔法書",      type:"spellbook",spell:"transform_magic",  rarity:"C", weight:4,  sellPrice:2500,  desc:"変化の魔法を習得できる。火に弱い。",tile:43},
  {name:"識別の魔法書",     type:"spellbook",spell:"identify_magic",  rarity:"C", weight:4,  sellPrice:3500,  desc:"識別の魔法を習得できる。火に弱い。",tile:43},
  {name:"祝福の魔法書",     type:"spellbook",spell:"bless_magic",     rarity:"A", weight:1,  sellPrice:10000, desc:"祝福の魔法を習得できる。火に弱い。",tile:43},
  {name:"呪いの魔法書",     type:"spellbook",spell:"curse_magic",     rarity:"C", weight:4,  sellPrice:2000,  desc:"呪いの魔法を習得できる。火に弱い。",tile:43},];
export function burnInventorySpellbooks(p,ml){const burned=p.inventory.filter(i=>i.type==="spellbook"&&Math.random()<0.5);if(burned.length>0){p.inventory=p.inventory.filter(i=>!burned.includes(i));burned.forEach(b=>ml.push(`所持していた「${b.name}」が燃えてなくなった！`));}}

/** 防具の耐火（個別耐火・万能耐性）— 所持品破損防止用 */
export function hasFireResist(p) {
  return hasAbility(p?.armor, "fire_resist") || hasAbility(p?.armor, "all_resist");
}

/** 防具の雷耐性（万能耐性も対象）— 所持品破損防止用 */
export function hasLightningResist(p) {
  return hasAbility(p?.armor, "lightning_resist") || hasAbility(p?.armor, "all_resist");
}

/** 防具の耐水（水鉄砲・ずぶ濡れ・所持品の水被害） */
export function hasWaterProof(p) {
  return hasAbility(p?.armor, "water_proof");
}

/** 食料サイズ1段階縮小（水鉄砲など）。最小サイズなら false */
export function shrinkFoodOneStep(item, ml = null, nameFn = null) {
  if (!item || item.type !== "food") return false;
  const szLevels = item.cooked
    ? [
        { l: "一口", v: 10 },
        { l: "小盛り", v: 20 },
        { l: "普通の", v: 35 },
        { l: "大盛り", v: 55 },
        { l: "特盛り", v: 80 },
        { l: "爆盛り", v: 120 },
      ]
    : [
        { l: "極小の", v: 10 },
        { l: "小さい", v: 20 },
        { l: "普通の", v: 35 },
        { l: "大きい", v: 55 },
        { l: "特大", v: 80 },
        { l: "超特大", v: 120 },
      ];
  const _hasSzLabel = item.sizeLabel !== undefined;
  for (let si = szLevels.length - 1; si >= 1; si--) {
    const curL = szLevels[si].l;
    const matches = _hasSzLabel ? item.sizeLabel === curL : item.name.includes(curL);
    if (!matches) continue;
    const oldName = item.name;
    const cur = szLevels[si];
    const prev = szLevels[si - 1];
    if (_hasSzLabel && item._foodBase && item._foodEfLabel) {
      const efStart = item.name.indexOf(item._foodEfLabel);
      const cookPfx = efStart > 0 ? item.name.slice(0, efStart) : "";
      item.name = cookPfx + item._foodEfLabel + (prev.l === "普通の" ? "" : prev.l) + item._foodBase;
    } else {
      item.name = item.name.replace(cur.l, prev.l === "普通の" ? "" : prev.l);
    }
    item.sizeLabel = prev.l;
    item.value = Math.max(1, Math.round((item.value * prev.v) / cur.v));
    if (ml) {
      const _dn = resolveItemName({ ...item, name: oldName }, nameFn);
      ml.push(`水を浴びて${_dn}が小さくなった！→${item.name}`);
    }
    return true;
  }
  /* ラベル無しの旧形式：最小サイズ扱い */
  if (ml) ml.push(`${resolveItemName(item, nameFn)}はこれ以上小さくならない。`);
  return false;
}

/** 巻物・魔法書を白紙化（既に白紙なら false） */
export function blankScrollOrSpellbook(item, ml = null, nameFn = null) {
  if (!item) return false;
  if (item.type === "scroll" && item.effect !== "blank") {
    const _dn = resolveItemName(item, nameFn);
    item.name = "白紙の巻物";
    item.effect = "blank";
    item.desc = "何も書かれていない。魔法の筆で書き込める。";
    if (ml) ml.push(`水を浴びて巻物「${_dn}」の文字が消えた！`);
    return true;
  }
  if (item.type === "spellbook" && item.spell) {
    const _dn = resolveItemName(item, nameFn);
    item.name = "白紙の魔法書";
    item.spell = null;
    item.desc = "魔法が消えてしまった。魔法の筆(5回分)で好きな魔法書に変えられる。";
    if (ml) ml.push(`水を浴びて魔法書「${_dn}」の文字が消えた！`);
    return true;
  }
  return false;
}

/**
 * 水鉄砲など：所持品に水の影響（炎・雷と同様にランダム1点）。
 * 巻物/魔法書→白紙、食料→サイズ-1、ペン→インク-1、帯電毛玉→消滅。耐水で無効。
 * @returns {boolean} 何か影響が出たか
 */
export function applyWaterGunToInventory(p, ml, nameFn = null) {
  if (!p?.inventory?.length) return false;
  if (hasWaterProof(p)) {
    if (ml) ml.push("防具が水を弾いた！所持品は無事だ。(耐水)");
    return false;
  }
  const vulnerable = p.inventory.filter((it) => {
    if (it.type === "charged_fuzzball") return true;
    if (it.type === "scroll" && it.effect !== "blank") return true;
    if (it.type === "spellbook" && it.spell) return true;
    if (it.type === "food") return true;
    if (it.type === "pen" && (it.charges ?? 0) > 0) return true;
    return false;
  });
  if (vulnerable.length === 0) {
    if (ml) ml.push("水を浴びたが所持品に変化はなかった。");
    return false;
  }
  const victim = vulnerable[Math.floor(Math.random() * vulnerable.length)];
  if (victim.type === "scroll" || victim.type === "spellbook") {
    return blankScrollOrSpellbook(victim, ml, nameFn);
  }
  if (victim.type === "food") {
    return shrinkFoodOneStep(victim, ml, nameFn);
  }
  if (victim.type === "charged_fuzzball") {
    p.inventory = p.inventory.filter((it) => it !== victim);
    if (ml) ml.push(`水を浴びて${resolveItemName(victim, nameFn)}が消滅した！`);
    return true;
  }
  if (victim.type === "pen") {
    const _dn = resolveItemName(victim, nameFn);
    const prev = victim.charges ?? 0;
    victim.charges = Math.max(0, prev - 1);
    if (ml) ml.push(`水を浴びて${_dn}のインクが1減った！(残${victim.charges}回)`);
    return true;
  }
  return false;
}

/** 油まみれ状態（ターン残り or 油タイル上） */
export function isOily(dg, char) {
  if (!char) return false;
  return (char.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === char.x && t.y === char.y);
}
export function oilyDamageMult(dg, char) {
  return isOily(dg, char) ? 2 : 1;
}
export function oilyDamageLabel(dg, char) {
  return oilyDamageMult(dg, char) > 1 ? "(油まみれ×2)" : "";
}

/** 防具の耐氷（万能耐性も対象）— 移動封じ・鈍足防止用 */
export function hasIceResist(p) {
  return hasAbility(p?.armor, "ice_resist") || hasAbility(p?.armor, "all_resist");
}

function _elemResistMult(p, individualId, { includeRingFire = false } = {}) {
  const hasIndividual = hasAbility(p?.armor, individualId)
    || (includeRingFire && individualId === "fire_resist" && (p?.rings || []).some(r => r.effect === "fire_resist"));
  const hasAll = hasAbility(p?.armor, "all_resist");
  if (!hasIndividual && !hasAll) return null;
  if (hasIndividual && hasAll) return 0.5;
  return 2 / 3;
}

function _elemResistLabel(baseName, p, individualId, { includeRingFire = false } = {}) {
  const hasIndividual = hasAbility(p?.armor, individualId)
    || (includeRingFire && individualId === "fire_resist" && (p?.rings || []).some(r => r.effect === "fire_resist"));
  const hasAll = hasAbility(p?.armor, "all_resist");
  if (!hasIndividual && !hasAll) return "";
  if (hasIndividual && hasAll) return `（${baseName}半減）`;
  return `（${baseName}）`;
}

/** 炎ダメージ軽減：個別 or 万能のみ→2/3、個別+万能→半減 */
function _applySoakedFireReduction(dmg, p) {
  if ((p?.soakedTurns || 0) <= 0) return dmg;
  return Math.max(1, Math.floor(dmg * 0.5));
}

function _soakedFireLabel(p) {
  return (p?.soakedTurns || 0) > 0 ? "(ずぶ濡れ半減)" : "";
}

function _applySoakedLightningBoost(dmg, p) {
  if ((p?.soakedTurns || 0) <= 0) return dmg;
  return Math.max(1, Math.floor(dmg * 2));
}

function _soakedLightningLabel(p) {
  return (p?.soakedTurns || 0) > 0 ? "(ずぶ濡れ×2)" : "";
}

export function reduceFireDamage(dmg, p, opts = {}) {
  const mult = _elemResistMult(p, "fire_resist", opts);
  let d = mult == null ? dmg : Math.max(1, Math.floor(dmg * mult));
  return _applySoakedFireReduction(d, p);
}
export function fireResistDamageLabel(p, opts = {}) {
  return _elemResistLabel("耐火", p, "fire_resist", opts) + _soakedFireLabel(p);
}

function _applySoakedIceBoost(dmg, p) {
  if ((p?.soakedTurns || 0) <= 0) return dmg;
  return Math.max(1, Math.floor(dmg * 2));
}
function _soakedIceLabel(p) {
  return (p?.soakedTurns || 0) > 0 ? "(ずぶ濡れ×2)" : "";
}

export function reduceIceDamage(dmg, p) {
  const mult = _elemResistMult(p, "ice_resist");
  let d = mult == null ? dmg : Math.max(1, Math.floor(dmg * mult));
  return _applySoakedIceBoost(d, p);
}
export function iceResistDamageLabel(p) {
  return _elemResistLabel("耐氷", p, "ice_resist") + _soakedIceLabel(p);
}

/** プレイヤーが水タイルまたは泉の上にいるか */
export function isPlayerOnWater(p, dg) {
  if (!p || !dg?.map) return false;
  if (dg.map[p.y]?.[p.x] === T.WATER) return true;
  return !!(dg.springs?.some((s) => s.x === p.x && s.y === p.y));
}

/**
 * 水中で氷属性攻撃を受けたときの凍結。
 * 行動不能＋物理ダメージ2倍。耐氷で無効。
 * @returns {boolean}
 */
export function applyWaterIceFreeze(p, dg, ml, turns = null) {
  if (turns == null) turns = statusTurns("frozen", { kind: "player" });
  if (!isPlayerOnWater(p, dg)) return false;
  if (hasIceResist(p)) {
    if (ml) ml.push("防具が氷を弾いた！凍結しなかった。(耐氷)");
    return false;
  }
  const _was = p.frozenTurns || 0;
  p.frozenTurns = Math.max(_was, turns);
  if (ml) {
    if (_was <= 0) ml.push(`水の中で凍りついた！${turns}ターン行動不能！物理ダメージ2倍！`);
    else ml.push(`さらに凍りついた！(凍結${p.frozenTurns}ターン)`);
  }
  return true;
}

/** 凍結中の物理ダメージ2倍 */
export function applyFrozenPhysicalMult(dmg, p) {
  if ((p?.frozenTurns || 0) <= 0) return dmg;
  return Math.max(1, Math.floor(dmg * 2));
}
export function frozenPhysicalLabel(p) {
  return (p?.frozenTurns || 0) > 0 ? "(凍結×2)" : "";
}

/**
 * あぶく銭の巻物。
 * 通常: +10000 → 10ターン後 -10000
 * 祝福: +20000 → 10ターン後 -20000
 * 呪い: -10000（0未満にしない）→ 10ターン後 +10000
 * 複数回読むとキューに積む。
 * @returns {number} 即時に変化した金額（増は正・減は負。減が足りない場合は実際の減額）
 */
export function applyBubbleGoldScroll(p, ml, { blessed = false, cursed = false } = {}) {
  if (!p) return 0;
  const amount = blessed ? 20000 : 10000;
  p.bubbleGoldQueue = p.bubbleGoldQueue || [];
  if (cursed && !blessed) {
    const lost = Math.min(Math.max(0, p.gold || 0), amount);
    p.gold = Math.max(0, (p.gold || 0) - lost);
    p.bubbleGoldQueue.push({ turns: 10, delta: amount }); // 後で増える
    if (ml) {
      if (lost > 0) ml.push(`${lost}G失った！【呪】`);
      else ml.push("所持金が0のため減らせなかった…【呪】");
    }
    return -lost;
  }
  p.gold = (p.gold || 0) + amount;
  p.bubbleGoldQueue.push({ turns: 10, delta: -amount }); // 後で減る
  const tag = blessed ? "【祝】" : "";
  if (ml) ml.push(`${amount}G手に入れた！${tag}`);
  return amount;
}

/** あぶく銭キューを1ターン進める。delta が負なら減（0未満にしない）、正なら増。 */
export function tickBubbleGold(p, ml) {
  if (!p?.bubbleGoldQueue?.length) return;
  const next = [];
  for (const entry of p.bubbleGoldQueue) {
    entry.turns = (entry.turns || 0) - 1;
    if (entry.turns <= 0) {
      // 後方互換: 旧 save の amount は「後で減らす額」
      const delta = entry.delta != null ? entry.delta : -(entry.amount || 0);
      if (delta < 0) {
        const want = -delta;
        const lost = Math.min(Math.max(0, p.gold || 0), want);
        p.gold = Math.max(0, (p.gold || 0) - lost);
        if (ml) {
          if (lost >= want && want > 0) ml.push(`あぶく銭が消えた…${lost}G失った！`);
          else if (lost > 0) ml.push(`あぶく銭が消えた…${lost}G失った！（手元が足りず${want - lost}G分は帳消し）`);
          else ml.push("あぶく銭が消えた…（手元の金は0のまま）");
        }
      } else if (delta > 0) {
        p.gold = (p.gold || 0) + delta;
        if (ml) ml.push(`あぶく銭が戻ってきた！${delta}G手に入れた！`);
      }
    } else {
      next.push(entry);
    }
  }
  p.bubbleGoldQueue = next;
}

/**
 * 水タイルを凍らせて床にする（氷の杖・氷ブレス共通）。
 * @returns {boolean} 凍らせたか
 */
export function freezeWaterTile(dg, x, y, ml = null, nameFn = null) {
  if (!dg?.map || dg.map[y]?.[x] !== T.WATER) return false;
  dg.map[y][x] = T.FLOOR;
  if (ml) ml.push("氷が水を凍らせた！");
  if (dg.waterItems) {
    const _frozen = dg.waterItems.filter((wi) => wi.x === x && wi.y === y);
    dg.waterItems = dg.waterItems.filter((wi) => !(wi.x === x && wi.y === y));
    for (const wi of _frozen) {
      wi.item.x = x;
      wi.item.y = y;
      if (!dg.items) dg.items = [];
      dg.items.push(wi.item);
      if (ml) ml.push(`凍った水から${resolveItemName(wi.item, nameFn)}が現れた！`);
    }
  }
  if (dg.springs) {
    const _fs = dg.springs.find((s) => s.x === x && s.y === y);
    if (_fs) {
      dg.springs = dg.springs.filter((s) => s !== _fs);
      if (ml) ml.push("泉が凍りついて干上がった！");
    }
  }
  return true;
}

export function reduceLightningDamage(dmg, p) {
  const mult = _elemResistMult(p, "lightning_resist");
  let d = mult == null ? dmg : Math.max(1, Math.floor(dmg * mult));
  return _applySoakedLightningBoost(d, p);
}
export function lightningResistDamageLabel(p) {
  return _elemResistLabel("雷耐性", p, "lightning_resist") + _soakedLightningLabel(p);
}

/* 雷・炎ダメージを受けたとき所持品1つにランダムで影響を与える */
export function applyLightningToInventory(p, dg, ml, luFn, nameFn = null, isFireContext = false) {
  if (p.inventory.length === 0) return;
  if (isFireContext ? hasFireResist(p) : hasLightningResist(p)) return;
  const dn = (it) => resolveItemName(it, nameFn);
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
    if (monEffectiveMagicImmune(target)) { ml.push(`魔法は${target.name}に効かない！`); return; }
    if (consumeBarrier(target, ml)) return;
  }
  const _cmsBoost = kind === "monster" && inCursedMagicSealRoom(target.x, target.y, dg) ? 2 : 1;
  const _lvF = 1 + (lv - 1) * 0.2;
  switch (eff) {
    case "fire_bolt": {
      if (isFireExplosionNullified(dg, p)) { announceFireExplosionNullified(dg, p, ml, "炎の魔法"); break; }
      const _fbOilyMult = kind === "monster" && ((target.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === target.x && t.y === target.y)) ? 2 : 1;
      const dmg = Math.round(rng(20, 30) * _lvF) * _cmsBoost * _fbOilyMult;
      if (kind === "monster") {
        /* 火ダルマは炎の魔法で回復（封印中は特性無効） */
        if (target.baseKind === "firedemon" && !target.sealed) {
          const _fheal = Math.min(dmg, target.maxHp - target.hp);
          if (_fheal > 0) { target.hp += _fheal; ml.push(`炎の魔法が${target.name}に当たった！炎を吸収して回復した！(+${_fheal}HP)`); }
          else ml.push(`炎の魔法が${target.name}に当たった！しかし炎を吸収した！`);
          break;
        }
        const _fbDmg = scaleMonFireDmg(target, dmg);
        target.hp -= _fbDmg; ml.push(`炎の魔法が${target.name}に命中！${_fbDmg}ダメージ！${_fbOilyMult > 1 ? "(油まみれ×2)" : ""}${monFireDmgLabel(target)}`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
      }
      if (kind === "item" && target.type === "pot" && target.potEffect === "gunpowder") {
        removeFloorItem(dg, target);
        ml.push(`炎の魔法が${target.name}に当たり誘爆した！`);
        doGunpowderExplosion(target.x, target.y, dg, p, ml, luFn, target.name);
      } break;
    }
    case "ice_bolt": {
      let dmg = Math.round(rng(15, 22) * _lvF) * _cmsBoost;
      const _iceFreeze = statusTurns("immobile", { kind: "monster", target });
      if (kind === "monster") {
        if (target.elemWeak === "ice") dmg = Math.floor(dmg * 1.5);
        target.hp -= dmg;
        target.immobileTurns = (target.immobileTurns || 0) + _iceFreeze;
        ml.push(`氷の魔法が${target.name}に命中！${dmg}ダメージ！${_iceFreeze}ターン移動封じ！${target.elemWeak === "ice" ? "氷弱点特効！" : ""}`);
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
      if (kind === "monster") {
        const t = statusTurns("sleep", { kind: "monster", target });
        target.sleepTurns = (target.sleepTurns || 0) + t;
        ml.push(`眠りの魔法が${target.name}に命中！${t}ターン眠りについた！`);
      }
      break;
    }
    case "transform_magic": {
      if (kind === "monster") {
        if (target.isBoss) { ml.push(`${target.name}には変化の魔法が効かなかった！`); break; }
        const nt = pickTransformMonsterDef(p.depth, dg.dungeonType ?? null, target.monLevel || 1); const prevName = target.name; const ox = target.x, oy = target.y;
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
        const _pt = statusTurns("poison", { kind: "monster", target });
        target.poisonedTurns = (target.poisonedTurns || 0) + _pt;
        ml.push(`毒の魔法が${target.name}に命中！毒に侵された！(${_pt}ターン)`);
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
        const _tpFromX = p.x, _tpFromY = p.y;
        p.x = _tmd.x; p.y = _tmd.y;
        pushPlayerTeleportAnim(_tpFromX, _tpFromY, p.x, p.y);
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
          applyMonsterParalyze(target, { ml: null });
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
  let _fdx = dx, _fdy = dy, _cx = p.x, _cy = p.y;
  for (let d = 1; d <= spell.range; d++) {
    /* プレイヤー魔法弾は風で曲がらない */
    const _st = stepProjectile(dg, _cx, _cy, _fdx, _fdy, { wind: false });
    _fdx = _st.dx; _fdy = _st.dy;
    const tx = _st.x, ty = _st.y;
    _cx = tx; _cy = ty;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
    if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) {
      ml.push("魔法弾は壁に消えた。");
      return { x: _lx, y: _ly, hitType: "wall" };
    }
    if (inMagicSealRoom(tx, ty, dg)) {
      ml.push("魔法弾が魔封じの魔方陣で消えた！");
      return { x: tx, y: ty, hitType: "sealed" };
    }
    /* 石像：ダメージ系スペルは破壊。睡眠・金縛りなどは壊れない */
    if (statueAt(dg, tx, ty)) {
      const _breaks = ["fire_bolt", "ice_bolt", "lightning_magic", "poison_bolt"].includes(spell.effect);
      hitStatueWithAction(dg, tx, ty, p, ml, luFn, p?.depth, {
        breaks: _breaks,
        itemDeps: getFixtureItemDeps(),
      });
      return { x: tx, y: ty, hitType: _breaks ? "statue" : "statue_safe" };
    }
    const mon = monsterAt(dg, tx, ty);
    if (mon) {
      wakeIfDormant(mon, ml);
      if (monEffectiveMagicImmune(mon)) {
        ml.push(`魔法は${mon.name}に効かない！`);
      } else if (monReflectsMagic(mon)) {
        ml.push(`${mon.name}が魔法を跳ね返した！`);
        const _rfLvF = 1 + (lv - 1) * 0.2;
        switch (spell.effect) {
          case "fire_bolt": { const _rd = Math.round(rng(20, 30) * _rfLvF); p.hp -= _rd; p.deathCause = "反射された炎の魔法で"; ml.push(`炎の魔法が跳ね返ってきた！${_rd}ダメージ！`); break; }
          case "ice_bolt": { const _rd = Math.round(rng(15, 22) * _rfLvF); p.hp -= _rd; p.deathCause = "反射された氷の魔法で"; ml.push(`氷の魔法が跳ね返ってきた！${_rd}ダメージ！`); break; }
          case "lightning_magic": { const _rd = Math.round(rng(22, 32) * _rfLvF); p.hp -= _rd; p.deathCause = "反射された雷の魔法で"; ml.push(`雷の魔法が跳ね返ってきた！${_rd}ダメージ！`); break; }
          case "sleep_bolt": {
            const _rt = statusTurns("sleep", { kind: "player" });
            if ((p.statusImmune || 0) > 0) { ml.push("眠りの魔法が跳ね返ってきた！しかし状態防止中のため効かなかった！"); }
            else if (hasAbility(p.armor, "sleep_proof")) { ml.push("眠りの魔法が跳ね返ってきた！しかし防具が防いだ！(耐眠)"); }
            else { p.sleepTurns = (p.sleepTurns || 0) + _rt; ml.push(`眠りの魔法が跳ね返ってきた！${_rt}ターン眠った！`); }
            break;
          }
          case "poison_bolt": {
            if (hasRingEffect(p, "antidote_ring")) { ml.push("毒の魔法が跳ね返ってきたが指輪が毒を消した！"); }
            else {
              const _poison = applyPlayerPoison(p);
              ml.push(`毒の魔法が跳ね返ってきた！毒に侵された！(${_poison.turns}ターン)${_poison.atkLoss > 0 ? "攻撃力が下がった！" : ""}`);
            }
            break;
          }
          case "paralyze_magic": {
            if ((p.statusImmune || 0) > 0) { ml.push("金縛りの魔法が跳ね返ってきた！しかし状態防止中のため効かなかった！"); }
            else if (hasAbility(p.armor, "paralyze_proof")) { ml.push("金縛りの魔法が跳ね返ってきた！しかし防具が防いだ！(耐金縛り)"); }
            else {
              const _pt = statusTurns("paralyze", { kind: "player" });
              p.paralyzed = true;
              p.paralyzeTurns = (p.paralyzeTurns || 0) + _pt;
              ml.push(`金縛りの魔法が跳ね返ってきた！金縛りになった！(${_pt}ターン)`);
            }
            break;
          }
          case "teleport_other": {
            const _rtf = [];
            for (let _rty = 0; _rty < MH; _rty++) for (let _rtx = 0; _rtx < MW; _rtx++)
              if (dg.map[_rty][_rtx] === T.FLOOR && !(p.x === _rtx && p.y === _rty) && !dg.monsters.some(m => m.x === _rtx && m.y === _rty)) _rtf.push({ x: _rtx, y: _rty });
            if (_rtf.length > 0) {
              const _rtd = pick(_rtf);
              const _tpFromX = p.x, _tpFromY = p.y;
              p.x = _rtd.x; p.y = _rtd.y;
              pushPlayerTeleportAnim(_tpFromX, _tpFromY, p.x, p.y);
              ml.push("テレポートの魔法が跳ね返ってきた！どこかへ飛ばされた！");
            }
            break;
          }
          case "drain_hp": { const _rd = Math.round(rng(15, 25) * _rfLvF); p.hp -= _rd; p.deathCause = "反射されたHP吸収の魔法で"; ml.push(`HP吸収の魔法が跳ね返ってきた！${_rd}ダメージ！`); break; }
          case "transform_magic": { const _th = rng(-10, 10); p.hp += _th; if (_th < 0) p.deathCause = "反射された変化の魔法で"; ml.push(`変化の魔法が跳ね返ってきた！${_th >= 0 ? `体に変化が...HP+${_th}` : `体に異変が...HP${_th}`}`); break; }
          default: ml.push("魔法が跳ね返ってきた！しかし効果はなかった。"); break;
        }
      } else {
        applySpellEffect(spell.effect, "monster", mon, _fdx, _fdy, dg, p, ml, luFn, lv);
      }
      return { x: tx, y: ty, hitType: "monster" };
    }
    if (tx === p.x && ty === p.y) continue;
    const it = itemAt(dg, tx, ty);
    if (it) { applySpellEffect(spell.effect, "item", it, _fdx, _fdy, dg, p, ml, luFn, lv); return { x: tx, y: ty, hitType: "item" }; }
    _lx = tx; _ly = ty;
  }
  ml.push("魔法弾は虚空に消えた。");
  return { x: _lx, y: _ly, hitType: "void" };
}

/* ===== RINGS ===== */
export const RINGS = [
  { name: "力の指輪",       type:"ring", effect:"power_ring",   plus:0, rarity:"C", weight:4, sellPrice:1000, tile:60, desc:"装備中、＋値の分だけ攻撃力が増える。合成や強化で＋値を上げられる。" },
  { name: "守りの指輪",     type:"ring", effect:"defense_ring", plus:0, rarity:"C", weight:4, sellPrice:1000, tile:60, desc:"装備中、＋値の分だけ防御力が増える。合成や強化で＋値を上げられる。" },
  { name: "命の指輪",       type:"ring", effect:"life_ring",    plus:0, rarity:"C", weight:4, sellPrice:1200, tile:60, desc:"装備中、＋値×5だけ最大HPが増える。合成や強化で＋値を上げられる。" },
  { name: "遠投の指輪",     type:"ring", effect:"farcast_ring",         rarity:"B", weight:2, sellPrice:1500, tile:60, desc:"装備中、常に遠投状態で物を投げられる。" },
  { name: "浮遊の指輪",     type:"ring", effect:"float_ring",           rarity:"B", weight:2, sellPrice:1500, tile:60, desc:"装備中、罠にかからなくなる。\nただし階段を降りられなくなる。" },
  { name: "毒消しの指輪",   type:"ring", effect:"antidote_ring",        rarity:"B", weight:2, sellPrice:1000, tile:60, desc:"装備中、毒が無効になる。" },
  { name: "値切りの指輪",   type:"ring", effect:"bargain_ring",         rarity:"A", weight:1, sellPrice:2500, tile:60, desc:"装備中、店のアイテムが3割引で買える。" },
  { name: "魔物呼びの指輪", type:"ring", effect:"spawn_ring",           rarity:"D", weight:8, sellPrice:1000, tile:60, desc:"装備中、敵が現れやすくなる。" },
  { name: "下手投げの指輪", type:"ring", effect:"miss_throw_ring",      rarity:"E", weight:12, sellPrice:1000, tile:60, desc:"装備中、投げたものが必ず外れるようになる。" },
  { name: "回復の指輪",     type:"ring", effect:"regen_ring",           rarity:"B", weight:2, sellPrice:1200, tile:60, desc:"装備中、毎ターンのHP自然回復量が1増える。2つ装備すれば2増える。再生付き装備とも重複する。" },
  { name: "爆発の指輪",     type:"ring", effect:"explode_ring",         rarity:"A", weight:1, sellPrice:2000, tile:60, desc:"装備時に自分が爆発する。装備中もたまに爆発する。" },
  { name: "松明の指輪",     type:"ring", effect:"torch_ring",           rarity:"B", weight:2, sellPrice:3000, tile:60, desc:"装備中、視界範囲が1マス広がる。2つ装備すれば2マス広がる。" },
  { name: "腹持ちの指輪",   type:"ring", effect:"stomach_ring",          rarity:"A", weight:1, sellPrice:5000, tile:60, desc:"装備中、空腹の進行が3/4になる。複数・胴と重ねがけ可（2つで1/2、3つで1/4）。" },
  { name: "透視の指輪",     type:"ring", effect:"clairvoyance_ring",      rarity:"A", weight:1, sellPrice:10000, tile:60, desc:"装備中、壁越しでもモンスターの位置が見え続ける。" },
  { name: "感知の指輪",     type:"ring", effect:"detect_ring",            rarity:"A", weight:1, sellPrice:10000, tile:60, desc:"装備中、フロア全体の落ちているアイテムの位置が見え続ける。" },
  { name: "吸血の指輪",     type:"ring", effect:"vampire_ring",           rarity:"B", weight:2, sellPrice:3000, tile:60, desc:"装備中、通常の敵への近接攻撃で与えたダメージの8分の1だけHPを吸収する。アンデッドへの攻撃では同量の反動ダメージを受ける。" },
  { name: "背水の指輪",     type:"ring", effect:"desperation_ring",       rarity:"B", weight:2, sellPrice:3500, tile:60, desc:"装備中、HPが低いほど会心率が上昇する。\nHP75%以下から発動し、HP20%以下で必ず会心になる。" },
  { name: "射撃の指輪",     type:"ring", effect:"shoot_ring",             rarity:"B", weight:2, sellPrice:4000, tile:60, desc:"装備中、近接攻撃時に装備中の矢を1本消費して追加発射する。\n2個装備で2本発射。" },
  { name: "水中呼吸の指輪", type:"ring", effect:"water_breath_ring",      rarity:"B", weight:2, sellPrice:3500, tile:60, desc:"水の中に入れる。" },
  { name: "鈍足の指輪",     type:"ring", effect:"slow_ring",              rarity:"E", weight:12, sellPrice:1000, tile:60, desc:"装備中、速度が半減する（2ターンに1回しか行動できない）。" },
  { name: "空腹の指輪",     type:"ring", effect:"hunger_ring",            rarity:"E", weight:12, sellPrice:1000, tile:60, desc:"装備中、空腹の進行が2倍になる。" },
  { name: "足音の指輪",     type:"ring", effect:"footstep_ring",          rarity:"E", weight:12, sellPrice:1000, tile:60, desc:"装備中、歩くたびに足音が響き近くの敵が目を覚ます。" },
  { name: "値上げの指輪",   type:"ring", effect:"markup_ring",            rarity:"E", weight:12, sellPrice:1000, tile:60, desc:"装備中、店のアイテムが5割増しで買わされる。" },
  { name: "自慢の指輪",     type:"ring", effect:"vanity_ring",            rarity:"E", weight:12, sellPrice:5000, tile:60, desc:"自慢げに輝いているが、特に効果はない。見た目だけで妙に高い。" },
  { name: "暗闇の指輪",     type:"ring", effect:"darkness_ring",          rarity:"E", weight:12, sellPrice:1000, tile:60, desc:"装備中、廊下での視界が1マス狭くなる。" },
  { name: "平和の指輪",     type:"ring", effect:"peace_ring",             rarity:"D", weight:8,  sellPrice:1200, tile:60, desc:"装備中、近接攻撃の与ダメージが1になり、受ける近接ダメージが半分になる。" },
  { name: "体幹の指輪",     type:"ring", effect:"core_ring",              rarity:"B", weight:2,  sellPrice:3500, tile:60, desc:"装備中、転倒しなくなる。\n敵による吹き飛ばし・引き寄せ・罠への投げつけなど、強制的な移動を防ぐ。" },
];

export function hasRingEffect(p, effect) {
  return p.rings?.some(r => r.effect === effect) ?? false;
}

/**
 * ダンジョン入場時の初期装備（短剣・革の鎧）をインベントリに追加して装備する。
 * 所持上限に空きがない場合はそのアイテムは入らない（満杯なら何も入らない）。
 * @returns {{ dagger: object|null, armor: object|null }}
 */
export function grantDungeonStarterGear(player, { uidFn = uid, catalog = ITEMS } = {}) {
  if (!player) return { dagger: null, armor: null };
  player.inventory = player.inventory || [];
  const maxInv = player.maxInventory || 30;
  const result = { dagger: null, armor: null };

  const tryAddEquip = (name, slot) => {
    if (player.inventory.length >= maxInv) return null;
    const tmpl = catalog.find((i) => i.name === name);
    if (!tmpl) return null;
    const it = { ...tmpl, id: uidFn(), plus: 0 };
    player.inventory.push(it);
    player[slot] = it;
    return it;
  };

  result.dagger = tryAddEquip("短剣", "weapon");
  result.armor = tryAddEquip("革の鎧", "armor");
  return result;
}



/** 体幹の指輪：転倒および強制移動を防ぐ */
export function resistsForcedMove(p) {
  return hasRingEffect(p, "core_ring");
}

/**
 * プレイヤー転倒処理（転倒の罠・敵の足払い特技で共通）
 * @param {object} opts
 * @param {Function|null} [opts.nameFn]
 * @param {string|number|null} [opts.trapId] 罠ID（落ちたアイテムの着地判定用）
 * @param {string|null} [opts.cause] deathCause 用文言
 * @param {boolean} [opts.checkFloat] true なら浮遊でも回避（敵特技用）
 * @returns {"blocked_core"|"blocked_float"|"tripped"|null}
 */
export function applyPlayerTrip(p, dg, ml, opts = {}) {
  if (!p || !ml) return null;
  const {
    nameFn = null,
    trapId = null,
    cause = "転倒により",
    checkFloat = false,
  } = opts;

  if (hasRingEffect(p, "core_ring")) {
    ml.push("しかし体幹の指輪で踏ん張り、転ばなかった！");
    return "blocked_core";
  }
  if (checkFloat && isPlayerFloating(p, dg)) {
    ml.push("しかし浮遊していて転ばなかった！");
    return "blocked_float";
  }

  const dmg = rng(3, 8);
  p.deathCause = cause;
  p.hp -= dmg;
  ml.push(`転んでしまった！${dmg}ダメージ！`);

  const eq = new Set([p.weapon, p.armor, ...(p.rings || [])].filter(Boolean));
  const cand = (p.inventory || []).filter((i) => i && i.type !== "goal" && !eq.has(i));
  if (cand.length === 0) {
    ml.push("しかし落とすものはなかった。");
    return "tripped";
  }
  const n = Math.min(cand.length, rng(2, 4));
  for (let i = cand.length - 1; i > 0; i--) {
    const j = rng(0, i);
    const tmp = cand[i];
    cand[i] = cand[j];
    cand[j] = tmp;
  }
  const ft = new Set(trapId != null ? [trapId] : []);
  const names = [];
  for (const it of cand.slice(0, n)) {
    const idx = p.inventory.indexOf(it);
    if (idx === -1) continue;
    p.inventory.splice(idx, 1);
    placeItemAt(dg, p.x, p.y, it, ml, ft, 0, p, p.x, p.y);
    names.push(resolveItemName(it, nameFn));
  }
  if (names.length > 0) ml.push(`${names.join("、")}を落とした！`);
  return "tripped";
}

/**
 * 店での購入価格（未払い加算用）。
 * 値上げの指輪: ×1.5、値切りの指輪: ×0.7。両方装備時は両方乗算。
 */
export function calcShopBuyPrice(p, shopPrice) {
  let price = shopPrice || 0;
  if (hasRingEffect(p, "markup_ring")) price = Math.floor(price * 1.5);
  if (hasRingEffect(p, "bargain_ring")) price = Math.floor(price * 0.7);
  return Math.max(1, price);
}

/** 店購入メッセージ用の価格注記（" 5割増！" など。無ければ空文字） */
export function shopPriceNote(p) {
  const notes = [];
  if (hasRingEffect(p, "markup_ring")) notes.push("5割増！");
  if (hasRingEffect(p, "bargain_ring")) notes.push("3割引！");
  return notes.length ? " " + notes.join("") : "";
}

/**
 * 店商品の未払い計上額。
 * 拾い時に _shopCharge を記録（値上げ・値切り反映）。なければ list 価格 shopPrice。
 */
export function getShopItemCharge(item) {
  if (!item) return 0;
  if (item._shopCharge != null) return item._shopCharge;
  return item.shopPrice || 0;
}

/**
 * 使用・消費後の残り価値比率（0〜1）。
 * 杖・魔法の筆の残チャージ、矢の残本数で按分する。
 * 消費がなければ 1。
 */
export function getShopRemainingRatio(item) {
  if (!item) return 1;
  /* 矢・石：1本（個）単位で按分 */
  if (item.type === "arrow" && item._origCount != null && item._origCount > 0 && item.count != null) {
    if (item.count >= item._origCount) return 1;
    return Math.max(0, Math.min(1, Math.max(0, item.count) / item._origCount));
  }
  /* 杖・ペン・マーカー：チャージで按分（価格関数に合わせる） */
  if (item._origCharges != null && item._origCharges > 0 && item.charges != null) {
    if (item.charges >= item._origCharges) return 1;
    const priceOrig = itemPrice({ ...item, charges: item._origCharges });
    const priceCur = itemPrice({ ...item, charges: Math.max(0, item.charges) });
    if (priceOrig <= 0) return item.charges / item._origCharges;
    return Math.max(0, Math.min(1, priceCur / priceOrig));
  }
  return 1;
}

/** 返却時に残るべき使用分コスト（請求額 − 返金額） */
export function getShopUsedCost(item) {
  const owed = getShopItemCharge(item);
  if (owed <= 0) return 0;
  const ratio = getShopRemainingRatio(item);
  return Math.max(0, Math.round(owed * (1 - ratio)));
}

/** 店に戻したときの返金額 */
export function getShopRefundAmount(item) {
  const owed = getShopItemCharge(item);
  if (owed <= 0) return 0;
  return Math.max(0, Math.round(owed * getShopRemainingRatio(item)));
}

/**
 * 店商品の未払いを加算し、返却精算用に _shopCharge を記録する。
 * 既に請求済み（_shopCharge あり）の場合は二重加算しない（0 を返す）。
 * @returns {number} 今回新たに加算した金額
 */
export function applyShopUnpaidCharge(item, shop, p) {
  if (!item?.shopPrice || !shop) return 0;
  /* 返却按分用の初期状態を記録（矢の本数・杖等のチャージ） */
  if (item.charges != null) item._origCharges = item._origCharges ?? item.charges;
  if (item.type === "arrow" && item.count != null) item._origCount = item._origCount ?? item.count;
  if (item._shopCharge != null) return 0; /* 既にこの請求サイクルで計上済み */
  const charged = calcShopBuyPrice(p, item.shopPrice);
  item._shopCharge = charged;
  shop.unpaidTotal += charged;
  return charged;
}

/**
 * 1ターンあたりの空腹進行レート（基準: 合計10で満腹度-1 ≒ 通常10ターンに1）。
 * 腹持ち1つにつき ×3/4（胴+指輪1=1/2、胴+指輪2=1/4）。バターでさらに×1/2。
 * 空腹の指輪は軽減後のレートを×2（上書きしない・重ねがけ可）。
 */
export function calcHungerDrainRate(p) {
  if (!p) return 1;
  let n = 0;
  if (hasAbility(p.armor, "slow_hunger")) n++;
  for (const r of p.rings || []) {
    if (r?.effect === "stomach_ring") n++;
  }
  let rate = Math.max(0, 4 - n) / 4;
  if ((p.butterHungerTurns || 0) > 0) rate *= 0.5;
  if (hasRingEffect(p, "hunger_ring")) rate *= 2;
  return rate;
}

/* ===== 食料の腐敗 ===== */
/* food アイテムに「腐った」接頭語を付け、rotten:true フラグを立てる */
/* 既に腐っている場合はヤバイに昇格する。食料以外には適用しない。 */

const _FOOD_STATE_PREFIXES = [
  "ヤバイ", "腐った", "焦げた", "焼いた",
  ...Object.values(POT_FOOD_PREFIX),
];

/** 壺味・調理・状態・特殊効果接頭語を除いた食料の素の名前 */
function _foodDisplayBaseName(item) {
  if (item._foodBase) return item._foodBase;
  let n = item.name;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pfx of _FOOD_STATE_PREFIXES) {
      if (n.startsWith(pfx)) {
        n = n.slice(pfx.length);
        changed = true;
        break;
      }
    }
  }
  for (const ef of FOOD_EFFECTS) {
    if (n.startsWith(ef.l)) { n = n.slice(ef.l.length); break; }
  }
  for (const sz of [...RAW_SIZES, ...COOKED_SIZES]) {
    if (sz.l !== "普通の" && n.startsWith(sz.l)) { n = n.slice(sz.l.length); break; }
  }
  return n;
}

/** 大きさ接頭語付きの食料表示名（味付け・特殊効果ラベルは含めない） */
function _foodSizedName(item) {
  const base = _foodDisplayBaseName(item);
  const sz = item.sizeLabel;
  if (sz && sz !== "普通の") return sz + base;
  return base;
}

/** 通常の水で腐敗・焦げ状態を戻す。腐敗で失われた食料効果は戻らない。 */
function restoreFoodWithWater(item, ml) {
  if (item?.type !== "food" || (!item.rotten && !item.burnt && !item.yabai)) return false;
  const before = item.name;
  if (item.burnt) item.value = Math.max(1, Math.ceil((item.value || 1) / 0.6));
  item.name = (item.cooked ? "焼いた" : "") + _foodSizedName(item);
  item.desc = FOOD_DESCS[item.effect] || "食べると満腹度が回復する。";
  delete item.rotten;
  delete item.burnt;
  delete item.yabai;
  ml.push(`${before}が水で元に戻った！`);
  return true;
}

/** 祝福・呪い・壺加工・特殊効果などを除去（腐敗・ヤバイ化時） */
function _stripFoodEnchantments(item) {
  delete item.blessed;
  delete item.cursed;
  delete item.bcKnown;
  delete item.fullIdent;
  delete item.potionEffects;
  delete item.potFlavors;
  delete item.smoked;
  delete item.effect;
  delete item._foodEfLabel;
}

function _upgradeToYabai(item) {
  _stripFoodEnchantments(item);
  item.name = "ヤバイ" + _foodSizedName(item);
  item.yabai = true;
  item.rotten = true;
  item.burnt = true;
  item.desc = "ヤバイ臭いがする。絶対食べるな。";
}

export function rotFood(item) {
  if (item.type !== "food") return false;
  if (item.yabai) return false;
  if (item.rotten) {
    _upgradeToYabai(item);
    return "yabai";
  }
  _stripFoodEnchantments(item);
  item.rotten = true;
  item.name = "腐った" + _foodSizedName(item);
  item.desc = "腐っている。食べるのは危険そうだ。";
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

/** 水中呼吸の指輪装備中か */
export function hasWaterBreathRing(p) {
  return hasRingEffect(p, "water_breath_ring");
}

/** 水タイル上を歩行できるか（浮遊 or 水中呼吸） */
export function canPlayerWalkOnWater(p, dg) {
  return isPlayerFloating(p, dg) || hasWaterBreathRing(p);
}

/** ずぶ濡れ状態か */
export function isSoaked(p) {
  return (p?.soakedTurns || 0) > 0;
}

/** 水中を歩いたときずぶ濡れ。浮遊中・耐水は付与しない */
export function applySoakedFromWaterWalk(p, dg, ml) {
  if (!dg?.map || dg.map[p.y]?.[p.x] !== T.WATER) return;
  if (isPlayerFloating(p, dg)) return;
  if (hasWaterProof(p)) return;
  const _was = p.soakedTurns || 0;
  const _st = statusTurns("soaked", { kind: "player" });
  p.soakedTurns = _st;
  if (_was === 0) ml.push(`水の中を歩いてずぶ濡れになった！(${_st}ターン)`);
}

/**
 * ずぶ濡れ付与（水鉄砲など）。耐水で無効。
 * @param {number} [turns] 省略時は基準ターン
 * @returns {boolean} 付与したか
 */
export function applySoakedStatus(p, ml, turns = null, msg = null) {
  if (turns == null) turns = statusTurns("soaked", { kind: "player" });
  if (!p) return false;
  if (hasWaterProof(p)) {
    if (ml) ml.push("防具が水を弾いた！ずぶ濡れにならなかった。(耐水)");
    return false;
  }
  const _was = p.soakedTurns || 0;
  p.soakedTurns = Math.max(_was, turns);
  if (ml && _was === 0) ml.push(msg || `ずぶ濡れになった！(${turns}ターン)`);
  else if (ml && _was > 0 && p.soakedTurns > _was) ml.push(`ずぶ濡れが長引いた！(${p.soakedTurns}ターン)`);
  return true;
}

export function soakedFireExplosionMult(p) {
  return isSoaked(p) ? 0.5 : 1;
}

export function soakedLightningMult(p) {
  return isSoaked(p) ? 2 : 1;
}

export function soakedIceMult(p) {
  return isSoaked(p) ? 2 : 1;
}

export function soakedFireExplosionLabel(p) {
  return _soakedFireLabel(p);
}

export function soakedLightningLabel(p) {
  return _soakedLightningLabel(p);
}

export function soakedIceLabel(p) {
  return _soakedIceLabel(p);
}
