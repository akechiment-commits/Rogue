/**
 * 願い（Wish）コア
 * 泉の飲む／浸す超低確率、将来の巻物・杖から共通利用する。
 */
import {
  ITEMS, WANDS, POTS, RINGS, SPELLBOOKS,
  EXCALIBUR_T, CAT_CLAW_T, GOLDEN_AXE_T, SOBURO_T,
  TRIELEM_SWORD_T, FLAMBERGE_T, ICESWORD_T, CHIDORI_T,
  MITHRIL_ARMOR_T, TRIELEM_ARMOR_T, DIVINE_SHIELD_T,
  ALLBANE_SWORD_T, IRONMASS_T, SNIPER_T, ONI_CLUB_T, GOBLIN_BAT_T,
  ARROW_T, POISON_ARROW_T, PIERCING_ARROW_T, STRONG_ARROW_T,
  BOMB_ARROW_T, STONE_T, MAGIC_STONE_T,
  MAGIC_MARKER, WATER_BOTTLE, BLANK_SCROLL,
  getIdentKey, placeItemAt,
} from "./items.js";
import { uid, MW, MH } from "./utils.js";

/** 飲む／浸すで願いが発動する確率 */
export const WISH_CHANCE_DRINK = 0.01;
export const WISH_CHANCE_SOAK = 0.008;

/** テキスト願いで拒否する名称（最上位・キー相当） */
const ITEM_NAME_BLACKLIST = new Set([
  "全能キラー",
  "アルテマソード",
  "ゴッドスパークの杖",
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
  MITHRIL_ARMOR_T, TRIELEM_ARMOR_T, DIVINE_SHIELD_T,
  ALLBANE_SWORD_T, IRONMASS_T, SNIPER_T, ONI_CLUB_T, GOBLIN_BAT_T,
  ARROW_T, POISON_ARROW_T, PIERCING_ARROW_T, STRONG_ARROW_T,
  BOMB_ARROW_T, STONE_T, MAGIC_STONE_T,
  MAGIC_MARKER, WATER_BOTTLE, BLANK_SCROLL,
];

/**
 * 固定願い（選択肢）
 * @type {{ id: string, label: string, group: string, desc: string }[]}
 */
export const WISH_PRESETS = [
  { id: "full_restore", label: "全快する", group: "体", desc: "HP・MPを全回復し、主要な状態異常を治す" },
  { id: "level_up", label: "レベルが上がる", group: "体", desc: "レベルが1上がる" },
  { id: "max_hp", label: "生命力が満ちる", group: "体", desc: "最大HPが5増える" },
  { id: "max_mp", label: "魔力が深まる", group: "体", desc: "最大MPが3増える" },
  { id: "expand_inv", label: "荷物が増える", group: "体", desc: "最大所持数が2増える" },
  { id: "ident_all", label: "全てを見通す", group: "知識", desc: "持ち物を全て識別する" },
  { id: "map_reveal", label: "地図を知る", group: "知識", desc: "このフロアの地図と罠を明らかにする" },
  { id: "uncurse_all", label: "呪いを解く", group: "知識", desc: "持ち物と装備の呪いを全て解く" },
  { id: "random_good_item", label: "良い物を得る", group: "運命", desc: "レアなアイテムが1つ手に入る" },
  { id: "bless_equipped", label: "装備が輝く", group: "運命", desc: "装備中の武器・防具・指輪を祝福する" },
  { id: "fill_hunger", label: "腹を満たす", group: "運命", desc: "満腹度が最大になる" },
];

export function normalizeWishText(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[の・]/g, "")
    .toLowerCase();
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
  if (tmpl.type === "gold") return { ok: false, reason: "gold" };
  return { ok: true };
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

  // ブラックリスト完全一致は forbidden
  for (const banned of ITEM_NAME_BLACKLIST) {
    if (normalizeWishText(banned) === core) {
      return { status: "forbidden", matches: [], message: "その願いは叶えてもらえない…" };
    }
  }

  const cat = getWishItemCatalog();
  const scored = [];
  for (const t of cat) {
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
    it.blessed = true;
    it.cursed = false;
    it.bcKnown = true;
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

function clearMajorDebuffs(p) {
  p.poisoned = false;
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

function pickRandomGoodTemplate() {
  const pool = getWishItemCatalog().filter((t) => {
    if (!canWishItem(t).ok) return false;
    const r = t.rarity;
    return r === "A" || r === "S" || r === "B";
  });
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 願いを叶える
 * @param {{ kind: 'preset'|'item', id?: string, template?: object, blessed?: boolean }} wish
 * @param {{ player, dungeon, ml: string[], ident?: Set }} ctx
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
        clearMajorDebuffs(p);
        ml.push("体中に力が戻ってきた！全快した！");
        return { ok: true };
      }
      case "level_up": {
        forceLevelUp(p, ml);
        return { ok: true };
      }
      case "max_hp": {
        p.maxHp = (p.maxHp || 1) + 5;
        p.hp = Math.min(p.maxHp, (p.hp || 0) + 5);
        ml.push("生命力が満ちた！最大HP+5");
        return { ok: true };
      }
      case "max_mp": {
        p.maxMp = (p.maxMp || 0) + 3;
        p.mp = Math.min(p.maxMp, (p.mp || 0) + 3);
        ml.push("魔力が深まった！最大MP+3");
        return { ok: true };
      }
      case "expand_inv": {
        p.maxInventory = (p.maxInventory || 30) + 2;
        ml.push(`荷物が軽くなった気がする！最大所持数${p.maxInventory}`);
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
      case "uncurse_all": {
        uncurseAll(p);
        ml.push("呪いの気配が洗い流された！");
        return { ok: true };
      }
      case "random_good_item": {
        const tmpl = pickRandomGoodTemplate();
        if (!tmpl) {
          ml.push("良い物が思い浮かばなかった…");
          return { ok: false, message: "叶わなかった" };
        }
        const it = makeWishedItem(tmpl);
        giveItemToPlayer(p, dg, it, ml);
        return { ok: true };
      }
      case "bless_equipped": {
        let n = 0;
        for (const it of [p.weapon, p.armor, ...(p.rings || [])]) {
          if (!it) continue;
          it.blessed = true;
          it.cursed = false;
          it.bcKnown = true;
          n++;
        }
        ml.push(n > 0 ? "装備が聖なる光に包まれた！" : "祝福する装備がなかった…");
        return { ok: n > 0 };
      }
      case "fill_hunger": {
        p.hunger = p.maxHunger || 100;
        ml.push("腹が満たされた！");
        return { ok: true };
      }
      default:
        return { ok: false, message: "そんな願いは叶わないようだ…" };
    }
  }

  if (wish.kind === "item" && wish.template) {
    const check = canWishItem(wish.template);
    if (!check.ok) return { ok: false, message: "その願いは叶えてもらえない…" };
    const it = makeWishedItem(wish.template, { blessed: !!wish.blessed || !!wish.template._wishBlessed });
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
