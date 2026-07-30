import { TI, rng } from "./utils.js";
import { getIdentKey, potOccupancyCount } from "./items.js";
import { genDungeon } from "./dungeon.js";

/* Tile name mapping — place images at CUSTOM_TILE_PATH/{name}.png to override spritesheet */
export const TILE_NAMES = {
  0: "wall",
  1: "floor",
  2: "stairs_down",
  3: "stairs_up",
  4: "corridor",
  5: "player",
  6: "rat",
  7: "kobold",
  8: "goblin",
  9: "skeleton",
  10: "zombie",
  11: "orc",
  12: "snake",
  13: "troll",
  14: "dragon",
  15: "vampire",
  16: "potion",
  17: "potion2",
  18: "scroll",
  19: "food",
  20: "weapon",
  21: "armor",
  22: "gold",
  23: "arrow",
  24: "wand",
  25: "trap_mine",
  26: "trap_arrow",
  27: "trap_pit",
  28: "trap_rust",
  29: "trap_spin",
  30: "trap_sleep",
  31: "spring",
  32: "pot",
  33: "player_down",
  34: "player_up",
  35: "player_left",
  36: "player_right",
  37: "shopkeeper",
  38: "bigbox",
  39: "archer",
  40: "wizard",
  41: "magic_marker",
  45: "trap_poison_arrow",
  46: "trap_summon",
  47: "trap_slow",
  48: "trap_seal",
  49: "trap_steal",
  50: "trap_hunger",
  51: "trap_blowback",
  52: "gargoyle",
  53: "imp",
  54: "wind_mage",
  55: "shaman",
  56: "wolf",
  57: "golem",
  58: "demon",
  59: "guard",
  60: "ring",
  61: "firedemon",
  42: "pen",
  43: "spellbook",
  62: "player_down_left",
  63: "player_down_right",
  64: "player_up_left",
  65: "player_up_right",
  66: "food_cooked",
  44: "witchdoctor",
  67: "wokka",
  68: "rockspirit",
  69: "thief",
  70: "runner",
  71: "trap_shadow",
  72: "trap_rockfall",
  73: "trap_timebomb",
  74: "pentacle",
  75: "rustbug",
  76: "walldigger",
  77: "slime",
  78: "puller",
  79: "gelcube",
  80: "synthmonster",
  81: "confusemage",
  82: "sleepmage",
  83: "warpmage",
  84: "trap_bewitch",
  85: "trap_darkness",
  86: "trapmaster",
  93: "wateri",
  94: "trap_rot",
  120: "trap_mp_absorb",
  121: "trap_strong_arrow",
  122: "trap_float",
  123: "trap_oil",
  124: "trap_unident",
  125: "trap_alarm",
  126: "trap_multiply",
  127: "trap_confuse",
  132: "trap_watergun",
  133: "trap_spin", /* 転倒の罠：専用画像がなければ回転板を流用 */
  87: "aquamarine", 88: "ruby", 89: "sapphire", 90: "emerald", 91: "topaz", 92: "amethyst", 101: "diamond", 102: "opal",
  108: "grabber",
  109: "leprechaun",
  110: "sign",
  111: "rakugaki",
  112: "tattoobird",
  113: "splitslime",
  114: "bombslime",
  115: "crystalslime",
  116: "hammerogre",
  117: "berserker",
};
export const CUSTOM_TILE_PATH = "./tiles";
export const customTileImages = {};
export function clearCustomTileImages() {
  for (const k of Object.keys(customTileImages)) delete customTileImages[k];
}
export const ST = 16;

export const TILE_RENDER = {
  0: { bg: "#1a1a22", fg: "#3a3a4a", ch: "#" },
  1: { bg: "#0c0c14", fg: "#252530", ch: "." },
  2: { bg: "#0c0c14", fg: "#0ff", ch: ">" },
  3: { bg: "#0c0c14", fg: "#0f0", ch: "<" },
  4: { bg: "#080810", fg: "#1a1a22", ch: ":" },
  5: { bg: null, fg: "#ffe030", ch: "@" },
  6: { bg: null, fg: "#c08050", ch: "r" },
  7: { bg: null, fg: "#70a050", ch: "k" },
  8: { bg: null, fg: "#40a070", ch: "g" },
  9: { bg: null, fg: "#c0c0b0", ch: "s" },
  10: { bg: null, fg: "#60a050", ch: "z" },
  11: { bg: null, fg: "#90a040", ch: "O" },
  12: { bg: null, fg: "#40b040", ch: "~" },
  13: { bg: null, fg: "#806030", ch: "T" },
  14: { bg: null, fg: "#f04020", ch: "D" },
  15: { bg: null, fg: "#9040d0", ch: "V" },
  16: { bg: null, fg: "#f050e0", ch: "!" },
  17: { bg: null, fg: "#f090f0", ch: "!" },
  18: { bg: null, fg: "#e8e060", ch: "?" },
  19: { bg: null, fg: "#50c050", ch: "%" },
  20: { bg: null, fg: "#a0a0a0", ch: "/" },
  21: { bg: null, fg: "#5090c0", ch: "[" },
  22: { bg: null, fg: "#f0d000", ch: "$" },
  23: { bg: null, fg: "#d0a050", ch: "|" },
  24: { bg: null, fg: "#a050f0", ch: "\\" },
  25: { bg: null, fg: "#f03030", ch: "^" },
  26: { bg: null, fg: "#f08030", ch: "^" },
  121: { bg: null, fg: "#ffb040", ch: "^" },
  122: { bg: null, fg: "#80e0ff", ch: "^" },
  123: { bg: null, fg: "#c8a020", ch: "^" },
  124: { bg: null, fg: "#a0a0ff", ch: "^" },
  125: { bg: null, fg: "#ff6060", ch: "^" },
  126: { bg: null, fg: "#60ff90", ch: "^" },
  127: { bg: null, fg: "#dd66ff", ch: "^" },
  132: { bg: null, fg: "#20c0ff", ch: "^" },
  27: { bg: null, fg: "#804040", ch: "^" },
  28: { bg: null, fg: "#909090", ch: "^" },
  29: { bg: null, fg: "#4080f0", ch: "^" },
  30: { bg: null, fg: "#80f040", ch: "^" },
  31: { bg: "#1a3a5a", fg: "#4af", ch: "♨" },
  32: { bg: "#3a2a1a", fg: "#7a5a2a", ch: "壺" },
  37: { bg: null, fg: "#f0c040", ch: "S" },
  38: { bg: "#1a1008", fg: "#c07830", ch: "B" },
  39: { bg: null, fg: "#e09030", ch: "A" },
  40: { bg: null, fg: "#60a0ff", ch: "W" },
  41: { bg: null, fg: "#ff80c0", ch: "P" },
  42: { bg: null, fg: "#a060ff", ch: "◇" },
  43: { bg: null, fg: "#88aaff", ch: "+" },
  44: { bg: null, fg: "#b020e0", ch: "C" },
  45: { bg: null, fg: "#60d060", ch: "^" },
  46: { bg: null, fg: "#d020d0", ch: "^" },
  47: { bg: null, fg: "#20d0d0", ch: "^" },
  48: { bg: null, fg: "#8040e0", ch: "^" },
  49: { bg: null, fg: "#d0d020", ch: "^" },
  50: { bg: null, fg: "#d06000", ch: "^" },
  51: { bg: null, fg: "#20e0c0", ch: "^" },
  52: { bg: null, fg: "#888888", ch: "G" },
  53: { bg: null, fg: "#ff4466", ch: "i" },
  54: { bg: null, fg: "#40e0ff", ch: "M" },
  55: { bg: null, fg: "#88dd44", ch: "S" },
  56: { bg: null, fg: "#ddaa44", ch: "w" },
  57: { bg: null, fg: "#aaaaaa", ch: "O" },
  58: { bg: null, fg: "#cc2200", ch: "D" },
  59: { bg: null, fg: "#4488ee", ch: "g" },
  60: { bg: null, fg: "#c0a0ff", ch: "=" },
  61: { bg: null, fg: "#ff7722", ch: "F" },
  62: { bg: null, fg: "#ffe030", ch: "@" },
  63: { bg: null, fg: "#ffe030", ch: "@" },
  64: { bg: null, fg: "#ffe030", ch: "@" },
  65: { bg: null, fg: "#ffe030", ch: "@" },
  69: { bg: null, fg: "#a06020", ch: "t" },
  70: { bg: null, fg: "#ff88cc", ch: "p" },
  71: { bg: null, fg: "#8040a0", ch: "^" },
  72: { bg: null, fg: "#a08040", ch: "^" },
  73: { bg: null, fg: "#f04040", ch: "^" },
  75: { bg: null, fg: "#c06010", ch: "R" },
  76: { bg: null, fg: "#888866", ch: "X" },
  77: { bg: null, fg: "#44cc44", ch: "s" },
  78: { bg: null, fg: "#aa44dd", ch: "P" },
  79: { bg: null, fg: "#88ddaa", ch: "G" },
  80: { bg: null, fg: "#ddcc44", ch: "Q" },
  81: { bg: null, fg: "#dd44ff", ch: "c" },
  82: { bg: null, fg: "#44ff88", ch: "z" },
  83: { bg: null, fg: "#ff9900", ch: "w" },
  84: { bg: null, fg: "#c040c0", ch: "^" },
  85: { bg: null, fg: "#2060a0", ch: "^" },
  86: { bg: null, fg: "#c0a030", ch: "T" },
  93: { bg: null, fg: "#20c0ff", ch: "W" },
  94: { bg: null, fg: "#8b4513", ch: "^" },
  120: { bg: null, fg: "#5080e8", ch: "^" },
  87:  { bg: null, fg: "#00ccee", ch: "*" }, /* アクアマリン (C) */
  88:  { bg: null, fg: "#ee2244", ch: "*" }, /* ルビー       (B) */
  89:  { bg: null, fg: "#4488ff", ch: "*" }, /* サファイア   (B) */
  90:  { bg: null, fg: "#22cc44", ch: "*" }, /* エメラルド   (B) */
  91:  { bg: null, fg: "#ffcc00", ch: "*" }, /* トパーズ     (C) */
  92:  { bg: null, fg: "#cc44ff", ch: "*" }, /* アメジスト   (C) */
  101: { bg: null, fg: "#e8f4ff", ch: "*" }, /* ダイヤモンド (A) */
  102: { bg: null, fg: "#ffaadd", ch: "*" }, /* オパール     (A) */
  /* ===== ボス tier 5〜10 ===== */
  95:  { bg: null, fg: "#aa8833", ch: "B" }, /* 魔将軍  */
  96:  { bg: null, fg: "#ccccaa", ch: "B" }, /* 骸骨王  */
  97:  { bg: null, fg: "#ffaa00", ch: "B" }, /* 炎帝竜  */
  98:  { bg: null, fg: "#6600cc", ch: "B" }, /* 虚無の僧侶 */
  99:  { bg: null, fg: "#cc0022", ch: "B" }, /* 煉獄公  */
  100: { bg: null, fg: "#880088", ch: "B" }, /* 深淵神  */
  103: { bg: null, fg: "#aa77cc", ch: "b" }, /* コウモリ   */
  104: { bg: null, fg: "#bb8833", ch: "c" }, /* ムカデ     */
  105: { bg: null, fg: "#dd6633", ch: "B" }, /* 弾き師     */
  106: { bg: null, fg: "#cc44aa", ch: "S" }, /* 盗投士     */
  107: { bg: null, fg: "#888877", ch: "%" }, /* 骨         */
  108: { bg: null, fg: "#cc2255", ch: "G" }, /* からめ鬼   */
  109: { bg: null, fg: "#22aa44", ch: "L" }, /* レプラコーン */
  110: { bg: null, fg: "#8B4513", ch: "♦" }, /* 看板         */
  111: { bg: null, fg: "#cc44ff", ch: "m" }, /* ラクガキ魔   */
  112: { bg: null, fg: "#22ccff", ch: "B" }, /* タトゥーバード */
  113: { bg: null, fg: "#ff88aa", ch: "s" }, /* 分裂スライム  */
  114: { bg: null, fg: "#ffcc22", ch: "s" }, /* ボムスライム  */
  115: { bg: null, fg: "#aa66ff", ch: "s" }, /* 水晶スライム  */
  116: { bg: null, fg: "#cc8844", ch: "O" }, /* ハンマーオーガ*/
  117: { bg: null, fg: "#ee6622", ch: "B" }, /* バーサーカー  */
};

/* Canvas drawing helper */
export function drawTile(ctx, ts, idx, dx, dy, sz) {
  const ci = customTileImages[idx];
  if (ci) {
    ctx.drawImage(ci, dx, dy, sz, sz);
    return;
  }
  if (idx === TI.SPRING) {
    ctx.fillStyle = "#1a3a5a";
    ctx.fillRect(dx, dy, sz, sz);
    ctx.fillStyle = "#4af";
    ctx.font = `bold ${Math.floor(sz * 0.7)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♨", dx + sz / 2, dy + sz / 2);
    ctx.textAlign = "start";
    return;
  }
  if (idx === TI.POT) {
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(dx + sz * 0.2, dy + sz * 0.15, sz * 0.6, sz * 0.7);
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(dx + sz * 0.15, dy + sz * 0.3, sz * 0.7, sz * 0.5);
    ctx.fillStyle = "#7a5a2a";
    ctx.fillRect(dx + sz * 0.3, dy + sz * 0.1, sz * 0.4, sz * 0.25);
    ctx.textAlign = "start";
    return;
  }
  const td = TILE_RENDER[idx];
  if (td) {
    if (td.bg) {
      ctx.fillStyle = td.bg;
      ctx.fillRect(dx, dy, sz, sz);
    }
    ctx.fillStyle = td.fg;
    ctx.font = "bold " + Math.floor(sz * 0.75) + "px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(td.ch, dx + sz / 2, dy + sz / 2);
    ctx.textAlign = "start";
  }
}

export const VW_M = 17,
  VH_M = 13,
  VW_D = 33,
  VH_D = 19,
  VW_L = 27,
  VH_L = 15;

/* 拾い/置き/商品メッセージ用：杖・ペン・マーカーは残り回数、対象アイテムは祝呪を付加 */
export function _itemPickupSuffix(it, ident) {
  if (!it) return "";
  const _key = getIdentKey(it);
  const _isIdent = !_key || ident?.has(_key);
  if (!_isIdent) return "";
  if (it.type === "pot") return ` [${potOccupancyCount(it)}/${it.capacity}]`;
  if (_key && !it.fullIdent) return "";
  const _chgTypes = new Set(["wand", "pen", "marker"]);
  const _bcTypes  = new Set(["wand", "pen", "marker", "potion", "scroll", "bottle"]);
  if (!_bcTypes.has(it.type)) return "";
  const charge = _chgTypes.has(it.type) && it.charges != null ? `[${it.charges}回]` : "";
  const state  = it.blessed ? "【祝】" : it.cursed ? "【呪】" : "";
  return (charge || state) ? ` ${charge}${state}` : "";
}

/* 落とし穴バッグを処理して落下エンティティを次の階に配置する */
export function processPitfallBag(bag, floors, depth) {
  if (!bag || bag.length === 0) return;
  const nd = depth + 1;
  if (!floors[nd]) floors[nd] = genDungeon(nd - 1);
  const nf = floors[nd];
  for (const { kind, entity } of bag) {
    const room = nf.rooms[rng(0, nf.rooms.length - 1)];
    entity.x = rng(room.x, room.x + room.w - 1);
    entity.y = rng(room.y, room.y + room.h - 1);
    if (kind === 'item') nf.items.push(entity);
    else if (kind === 'monster') nf.monsters.push(entity);
  }
}

/* アイテム表示名を返す（未識別なら偽名 or ニックネーム、識別済みなら本名優先） */
export function itemDisplayName(it, fakeNames, ident, nicknames) {
  const key = getIdentKey(it);
  if (!key) return it.name;
  if (ident?.has(key)) return it.name;
  if (nicknames?.[key]) {
    const _pfx = key[0]==='p' ? '薬' : key[0]==='s' ? '巻' : key[0]==='w' ? '杖' : key[0]==='n' ? 'ペン' : key[0]==='b' ? '書' : key[0]==='r' ? '指輪' : '壺';
    return `${_pfx}:${nicknames[key]}`;
  }
  return fakeNames?.[key] ?? it.name;
}
