/**
 * 願い（Wish）コア
 * 泉の飲む／浸す超低確率、将来の巻物・杖から共通利用する。
 */
import {
  ITEMS, WANDS, POTS, RINGS, SPELLBOOKS, BB_TYPES,
  EXCALIBUR_T, CAT_CLAW_T, GOLDEN_AXE_T, SOBURO_T,
  TRIELEM_SWORD_T, FLAMBERGE_T, ICESWORD_T, CHIDORI_T,
  MITHRIL_ARMOR_T, STOMACH_ARMOR_T, TRIELEM_ARMOR_T, DIVINE_SHIELD_T,
  ALLBANE_SWORD_T, IRONMASS_T, SNIPER_T, ONI_CLUB_T, GOBLIN_BAT_T,
  GODSPARKWAND_T,
  ARROW_T, POISON_ARROW_T, PIERCING_ARROW_T, STRONG_ARROW_T,
  BOMB_ARROW_T, STONE_T, MAGIC_STONE_T,
  MAGIC_MARKER, WATER_BOTTLE, BLANK_SCROLL,
  getIdentKey, placeItemAt, killMonster,
} from "./items.js";
import { trackMonster, trackBigbox } from "./DiscoveryTracker.js";
import { uid, MW, MH, T, TI, DRO, rng } from "./utils.js";
import { clearPlayerPoison } from "./statusDuration.js";

/** 飲む／浸すで願いが発動する確率（各 0.5%） */
export const WISH_CHANCE_DRINK = 0.005;
export const WISH_CHANCE_SOAK = 0.005;

/** 願いで得られるゴールド量 */
export const WISH_GOLD_MIN = 10000;
export const WISH_GOLD_MAX = 20000;

/** テキスト願いで拒否する名称（最上位・キー相当） */
const ITEM_NAME_BLACKLIST = new Set([
  "全能キラー",
  "アルテマソード",
  "願いの杖",
  "願いの壺",
  "伝説の王冠",
  "深淵の禁書",
  "輝く宝玉",
  "深紅の魔石",
]);

/** 特殊テンプレ（ホワイトリスト） */
const SPECIAL_TEMPLATES = [
  EXCALIBUR_T, CAT_CLAW_T, GOLDEN_AXE_T, SOBURO_T,
  TRIELEM_SWORD_T, FLAMBERGE_T, ICESWORD_T, CHIDORI_T,
  MITHRIL_ARMOR_T, STOMACH_ARMOR_T, TRIELEM_ARMOR_T, DIVINE_SHIELD_T,
  ALLBANE_SWORD_T, IRONMASS_T, SNIPER_T, ONI_CLUB_T, GOBLIN_BAT_T,
  GODSPARKWAND_T,
  ARROW_T, POISON_ARROW_T, PIERCING_ARROW_T, STRONG_ARROW_T,
  BOMB_ARROW_T, STONE_T, MAGIC_STONE_T,
  MAGIC_MARKER, WATER_BOTTLE, BLANK_SCROLL,
];

/**
 * 恩恵（選択肢）— UIの「恩恵」から選ぶ固定願い
 * @type {{ id: string, label: string, desc: string }[]}
 */
export const WISH_PRESETS = [
  { id: "full_restore", label: "全回復", desc: "HP・MP・満腹度を全回復し、状態異常を治す" },
  { id: "ident_all", label: "全識別", desc: "持ち物を全て識別する" },
  { id: "map_reveal", label: "フロアを見通す", desc: "このフロアの地図と罠を明らかにする" },
  { id: "level_up", label: "レベルアップ", desc: "レベルが3上がる" },
  { id: "wipe_enemies", label: "敵の全滅", desc: "このフロアの敵を全て倒す（経験値・ドロップあり／復活不可）" },
];

/** 道具願いUI用カテゴリ（デバッグ魔法と同様の並び） */
export const WISH_ITEM_CATEGORIES = [
  { key: "potion", label: "薬", types: ["potion"] },
  { key: "scroll", label: "巻物", types: ["scroll"] },
  { key: "weapon", label: "武器", types: ["weapon"] },
  { key: "armor", label: "防具", types: ["armor"] },
  { key: "pen", label: "ペン", types: ["pen", "marker"] },
  { key: "arrow", label: "飛び道具", types: ["arrow"] },
  { key: "wand", label: "杖", types: ["wand"] },
  { key: "spellbook", label: "魔法書", types: ["spellbook"] },
  { key: "ring", label: "指輪", types: ["ring"] },
  { key: "pot", label: "壺", types: ["pot"] },
  { key: "bigbox", label: "大箱", types: ["bigbox"] },
  { key: "food", label: "食べ物", types: ["food"] },
  { key: "other", label: "その他", types: null }, // 上記以外
];

export function normalizeWishText(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[の・]/g, "")
    .toLowerCase();
}

/** テキストでお金を願うときのエイリアス */
const GOLD_WISH_ALIASES = new Set(
  ["お金", "金", "金貨", "ゴールド", "マネー", "gold", "money"].map((s) => normalizeWishText(s)),
);

/** お金願い用の疑似テンプレ */
export const GOLD_WISH_TEMPLATE = {
  name: "お金",
  type: "gold_wish",
  desc: `金貨が${WISH_GOLD_MIN}〜${WISH_GOLD_MAX}枚手に入る`,
};

function bbTemplateFromType(bbt) {
  if (!bbt?.name) return null;
  return {
    name: bbt.name,
    type: "bigbox",
    kind: bbt.kind,
    desc: bbt.desc || "",
    rare: !!bbt.rare,
  };
}

function collectCatalog() {
  const list = [];
  const add = (tmpl) => {
    if (!tmpl?.name) return;
    if (ITEM_NAME_BLACKLIST.has(tmpl.name)) return;
    if (tmpl.type === "goal") return;
    if (tmpl.debug) return;
    if (tmpl.name.startsWith("[debug]")) return;
    list.push(tmpl);
  };
  for (const t of ITEMS) add(t);
  for (const t of WANDS) add(t);
  for (const t of POTS) add(t);
  for (const t of RINGS) add(t);
  for (const t of SPELLBOOKS) add(t);
  for (const t of SPECIAL_TEMPLATES) add(t);
  for (const b of BB_TYPES) add(bbTemplateFromType(b));
  add(GOLD_WISH_TEMPLATE);
  // ペンは ITEMS に含まれる
  return list;
}

let _catalogCache = null;
export function getWishItemCatalog() {
  if (!_catalogCache) _catalogCache = collectCatalog();
  return _catalogCache;
}

/** テスト用にキャッシュを捨てる */
export function _resetWishCatalogCache() {
  _catalogCache = null;
}

/**
 * アイテムテンプレが願えるか
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canWishItem(tmpl) {
  if (!tmpl?.name) return { ok: false, reason: "unknown" };
  if (ITEM_NAME_BLACKLIST.has(tmpl.name)) return { ok: false, reason: "forbidden" };
  if (tmpl.type === "goal") return { ok: false, reason: "key" };
  if (tmpl.debug || tmpl.name.startsWith("[debug]")) return { ok: false, reason: "debug" };
  /* gold_wish は許可。通常の type:gold ドロップテンプレは拒否 */
  if (tmpl.type === "gold") return { ok: false, reason: "gold" };
  return { ok: true };
}

/**
 * 図鑑エントリから願えるアイテムテンプレを解決
 * @param {{ name: string, type?: string, tile?: number, kind?: string }} entry
 * @returns {object|null}
 */
export function templateFromDiscovery(entry) {
  if (!entry?.name) return null;
  const cat = getWishItemCatalog();
  const found = cat.find((t) => t.name === entry.name);
  if (found) return canWishItem(found).ok ? found : null;
  if (entry.kind || entry.type === "bigbox") {
    const bbt = BB_TYPES.find((b) => b.kind === entry.kind || b.name === entry.name);
    const tmpl = bbTemplateFromType(bbt);
    return tmpl && canWishItem(tmpl).ok ? tmpl : null;
  }
  // カタログ外（主に食べ物）は図鑑の type/name から仮テンプレを組み立てる
  if (entry.type === "food") {
    const tmpl = {
      name: entry.name,
      type: "food",
      effect: "satiate_food",
      value: 20,
      tile: entry.tile || 19,
      desc: "願いで現れた食料。",
    };
    return canWishItem(tmpl).ok ? tmpl : null;
  }
  return null;
}

/**
 * 図鑑（セーブ＋今回の探索）に載っている願える道具をカテゴリ別に返す
 * @param {{ items?: object, bigboxes?: object }} globalDisc
 * @param {{ items?: object, bigboxes?: object }} runDisc
 * @returns {{ key: string, label: string, items: object[] }[]}
 */
export function getDiscoveredWishCatalog(globalDisc, runDisc) {
  const byName = new Map();
  const addEntries = (bucket) => {
    if (!bucket) return;
    for (const e of Object.values(bucket)) {
      if (!e?.name || byName.has(e.name)) continue;
      const tmpl = templateFromDiscovery(e);
      if (tmpl) byName.set(e.name, tmpl);
    }
  };
  addEntries(globalDisc?.items);
  addEntries(runDisc?.items);
  addEntries(globalDisc?.bigboxes);
  addEntries(runDisc?.bigboxes);

  const typed = new Set();
  for (const cat of WISH_ITEM_CATEGORIES) {
    if (cat.types) for (const t of cat.types) typed.add(t);
  }

  const groups = [];
  for (const cat of WISH_ITEM_CATEGORIES) {
    let items;
    if (cat.types) {
      items = [...byName.values()]
        .filter((t) => cat.types.includes(t.type))
        .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    } else {
      items = [...byName.values()]
        .filter((t) => !typed.has(t.type) && t.type !== "gold_wish")
        .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }
    if (items.length > 0) groups.push({ key: cat.key, label: cat.label, items });
  }
  return groups;
}

/**
 * テキストからアイテム候補を解決
 * @returns {{ status: 'exact'|'single'|'multi'|'none'|'forbidden', matches: object[], message?: string }}
 */
export function resolveWishText(raw) {
  const q = normalizeWishText(raw);
  if (!q) return { status: "none", matches: [], message: "何も願っていない。" };

  // 祝福プレフィックス
  let wantBlessed = false;
  let core = q;
  if (core.startsWith("祝福の") || core.startsWith("祝福") || core.startsWith("祝の")) {
    wantBlessed = true;
    core = core.replace(/^祝福の?/, "").replace(/^祝の?/, "");
  }

  // お金（完全一致のエイリアス）
  if (GOLD_WISH_ALIASES.has(core)) {
    return { status: "exact", matches: [{ ...GOLD_WISH_TEMPLATE }] };
  }

  // ブラックリスト完全一致は forbidden
  for (const banned of ITEM_NAME_BLACKLIST) {
    if (normalizeWishText(banned) === core) {
      return { status: "forbidden", matches: [], message: "その願いは叶えてもらえない…" };
    }
  }

  const cat = getWishItemCatalog();
  const scored = [];
  for (const t of cat) {
    if (t.type === "gold_wish") continue; /* エイリアスで処理済み */
    const n = normalizeWishText(t.name);
    if (n === core) scored.push({ t, rank: 0 });
    else if (n.startsWith(core)) scored.push({ t, rank: 1 });
    else if (n.includes(core) || core.includes(n)) scored.push({ t, rank: 2 });
  }
  scored.sort((a, b) => a.rank - b.rank || a.t.name.localeCompare(b.t.name, "ja"));

  // 同一名の重複除去（ITEMS とテンプレ）
  const seen = new Set();
  const unique = [];
  for (const { t, rank } of scored) {
    if (seen.has(t.name)) continue;
    seen.add(t.name);
    unique.push({ t, rank });
  }

  if (unique.length === 0) {
    return { status: "none", matches: [], message: "そんな願いは叶わないようだ…" };
  }

  const check = canWishItem(unique[0].t);
  if (unique.length === 1 && !check.ok) {
    return { status: "forbidden", matches: [], message: "その願いは叶えてもらえない…" };
  }

  const bestRank = unique[0].rank;
  const top = unique.filter((u) => u.rank === bestRank);
  const matches = top.map((u) => ({ ...u.t, _wishBlessed: wantBlessed }));

  if (matches.length === 1 && bestRank === 0) {
    return { status: "exact", matches };
  }
  if (matches.length === 1) {
    return { status: "single", matches };
  }
  return { status: "multi", matches: matches.slice(0, 12) };
}

export function makeWishedItem(tmpl, opts = {}) {
  const it = { ...tmpl, id: uid() };
  delete it.weight;
  if (opts.blessed) {
    if (it.type === "pot") {
      it.capacity = (it.capacity || 3) + 1;
      delete it.blessed;
      delete it.cursed;
    } else {
      it.blessed = true;
      it.cursed = false;
      it.bcKnown = true;
    }
  }
  if (it.type === "arrow") {
    it.count = it.count || (it.stone || it.magicStone ? 10 : 10);
  }
  if (it.type === "pot") {
    it.contents = [];
    it.capacity = it.capacity || 3;
  }
  if (it.type === "ring" && (it.effect === "power_ring" || it.effect === "defense_ring" || it.effect === "life_ring")) {
    it.plus = it.plus ?? 0;
  }
  if (it.charges != null) it._origCharges = it.charges;
  it.fullIdent = true;
  it.bcKnown = true;
  return it;
}

function giveItemToPlayer(p, dg, it, ml) {
  const maxInv = p.maxInventory || 30;
  if (p.inventory.length < maxInv) {
    p.inventory.push(it);
    ml.push(`${it.name}を手に入れた！`);
    return;
  }
  const ft = new Set();
  placeItemAt(dg, p.x, p.y, it, ml, ft);
  ml.push(`${it.name}が足元に現れた！（荷物がいっぱい）`);
}

function grantGoldWish(p, ml) {
  const amount = rng(WISH_GOLD_MIN, WISH_GOLD_MAX);
  p.gold = (p.gold || 0) + amount;
  ml.push(`${amount}ゴールドを手に入れた！`);
  return { ok: true };
}

/** 大箱を足元優先で配置（空いていなければ DRO で空きマスを探す） */
function placeBigboxNearPlayer(dg, p, tmpl, ml) {
  const bbt = BB_TYPES.find((b) => b.kind === tmpl.kind || b.name === tmpl.name);
  if (!bbt) {
    ml.push("大箱の姿が思い浮かばなかった…");
    return false;
  }
  if (!dg.bigboxes) dg.bigboxes = [];
  let px = null, py = null;
  for (const [dx, dy] of DRO) {
    const x = p.x + dx, y = p.y + dy;
    if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
    const tile = dg.map?.[y]?.[x];
    if (!tile || tile === T.WALL || tile === T.BWALL || tile === T.SD || tile === T.SU) continue;
    if (dg.bigboxes.some((b) => b.x === x && b.y === y)) continue;
    if (dg.springs?.some((s) => s.x === x && s.y === y)) continue;
    px = x; py = y;
    break;
  }
  if (px == null) {
    ml.push(`${bbt.name}を置く場所がない…`);
    return false;
  }
  const bb = {
    id: uid(),
    x: px,
    y: py,
    tile: TI.BIGBOX ?? 41,
    kind: bbt.kind,
    name: bbt.name,
    capacity: typeof bbt.cap === "function" ? bbt.cap() : (bbt.capacity || 2),
    contents: [],
    revealed: true,
  };
  dg.bigboxes.push(bb);
  trackBigbox(bb);
  if (px === p.x && py === p.y) ml.push(`${bb.name}が足元に現れた！`);
  else ml.push(`${bb.name}が近くに現れた！`);
  return true;
}

function clearMajorDebuffs(p) {
  clearPlayerPoison(p);
  p.sleepTurns = 0;
  p.paralyzeTurns = 0;
  p.confusedTurns = 0;
  p.slowTurns = 0;
  p.darknessTurns = 0;
  p.bewitchedTurns = 0;
  p.oilyTurns = 0;
  p.sealedTurns = 0;
  p.mpSealTurns = 0;
  p.immobileTurns = 0;
  p.atkDebuffTurns = 0;
  p.defDebuffTurns = 0;
  p.defSoftenedTurns = 0;
}

function forceLevelUp(p, ml) {
  p.level = (p.level || 1) + 1;
  p.nextExp = Math.floor((p.nextExp || 20) * 1.5);
  p.maxHp += 5;
  p.hp = Math.min(p.hp + 10, p.maxHp);
  p.atk = (p.atk || 1) + 1;
  if (p.level % 3 === 0) {
    p.def = (p.def || 0) + 1;
    p.maxMp = (p.maxMp || 0) + 1;
  }
  ml.push(`レベルアップ！Lv.${p.level}！`);
}

function revealFloor(dg) {
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (dg.explored?.[y]) dg.explored[y][x] = true;
    }
  }
  dg.traps?.forEach((t) => { t.revealed = true; });
}

function uncurseAll(p) {
  const list = [...(p.inventory || [])];
  if (p.weapon) list.push(p.weapon);
  if (p.armor) list.push(p.armor);
  for (const r of p.rings || []) if (r) list.push(r);
  for (const it of list) {
    if (!it) continue;
    if (it.cursed) {
      it.cursed = false;
      it.bcKnown = true;
    }
  }
}

/**
 * 願いを叶える
 * @param {{ kind: 'preset'|'item', id?: string, template?: object, blessed?: boolean }} wish
 * @param {{ player, dungeon, ml: string[], ident?: Set, luFn?: Function }} ctx
 * @returns {{ ok: boolean, message?: string }}
 */
export function grantWish(wish, ctx) {
  const { player: p, dungeon: dg, ml, ident } = ctx;
  if (!p || !dg || !ml) return { ok: false, message: "願いが届かない…" };

  if (wish.kind === "preset") {
    switch (wish.id) {
      case "full_restore": {
        p.hp = p.maxHp;
        if ((p.maxMp || 0) > 0) p.mp = p.maxMp;
        p.hunger = p.maxHunger || 100;
        clearMajorDebuffs(p);
        if (p.hunger > 0) delete p._hungerDmgStarted;
        ml.push("体中に力が戻ってきた！全快し、腹も満たされた！");
        return { ok: true };
      }
      case "level_up": {
        for (let i = 0; i < 3; i++) forceLevelUp(p, ml);
        return { ok: true };
      }
      case "ident_all": {
        const idSet = ident || ctx.identSet;
        for (const it of p.inventory || []) {
          it.fullIdent = true;
          it.bcKnown = true;
          const k = getIdentKey(it);
          if (k && idSet) idSet.add(k);
        }
        ml.push("持ち物の全てが見通せるようになった！");
        return { ok: true };
      }
      case "map_reveal": {
        revealFloor(dg);
        ml.push("フロアの姿が頭に浮かんだ！地図と罠が明らかになった！");
        return { ok: true };
      }
      case "wipe_enemies": {
        /* 自分で倒した扱い：経験値・ドロップ・図鑑登録・レベルアップ判定 */
        const mons = [...(dg.monsters || [])];
        if (mons.length === 0) {
          ml.push("倒す敵がいなかった…");
          return { ok: true };
        }
        ml.push(`願いの力でフロアの敵${mons.length}体が倒れた！`);
        const luFn = typeof ctx.luFn === "function" ? ctx.luFn : (() => {});
        for (const mon of mons) {
          if (!dg.monsters?.includes(mon)) continue; /* 連鎖爆発等で既に消えている */
          mon.hp = 0;
          trackMonster(mon);
          /* 経験値・ドロップは通常撃破扱いだが、復活の魔方陣では蘇らせない */
          killMonster(mon, dg, p, ml, luFn, false, null, true);
        }
        return { ok: true };
      }
      /* 旧ID互換（直接呼び出し用） */
      case "fill_hunger": {
        p.hunger = p.maxHunger || 100;
        if (p.hunger > 0) delete p._hungerDmgStarted;
        ml.push("腹が満たされた！");
        return { ok: true };
      }
      case "uncurse_all": {
        uncurseAll(p);
        ml.push("呪いの気配が洗い流された！");
        return { ok: true };
      }
      default:
        return { ok: false, message: "そんな願いは叶わないようだ…" };
    }
  }

  if (wish.kind === "item" && wish.template) {
    const tmpl = wish.template;
    const check = canWishItem(tmpl);
    if (!check.ok) return { ok: false, message: "その願いは叶えてもらえない…" };
    if (tmpl.type === "gold_wish") {
      return grantGoldWish(p, ml);
    }
    if (tmpl.type === "bigbox") {
      const ok = placeBigboxNearPlayer(dg, p, tmpl, ml);
      return ok ? { ok: true } : { ok: false, message: "大箱を置けなかった…" };
    }
    const it = makeWishedItem(tmpl, { blessed: !!wish.blessed || !!tmpl._wishBlessed });
    giveItemToPlayer(p, dg, it, ml);
    return { ok: true };
  }

  return { ok: false, message: "そんな願いは叶わないようだ…" };
}

/** 超低確率ロール */
export function rollWishChance(kind = "drink", rngFn = Math.random) {
  const p = kind === "soak" ? WISH_CHANCE_SOAK : WISH_CHANCE_DRINK;
  return rngFn() < p;
}
