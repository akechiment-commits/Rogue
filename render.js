import { TI, rng } from "./utils.js";
import { getIdentKey } from "./items.js";
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
  43: "spellbook",
};
export const CUSTOM_TILE_PATH = "./tiles";
export const customTileImages = {};
export function clearCustomTileImages() {
  for (const k of Object.keys(customTileImages)) delete customTileImages[k];
}
export const ST = 16;

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
  const TILE_RENDER = {
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
    27: { bg: null, fg: "#804040", ch: "^" },
    28: { bg: null, fg: "#909090", ch: "^" },
    29: { bg: null, fg: "#4080f0", ch: "^" },
    30: { bg: null, fg: "#80f040", ch: "^" },
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
  };
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

export const VW_M = 21,
  VH_M = 15,
  VW_D = 60,
  VH_D = 28,
  VW_L = 36,
  VH_L = 18;

/* 拾い/置き/商品メッセージ用：杖・ペン・マーカーは残り回数、対象アイテムは祝呪を付加 */
export function _itemPickupSuffix(it, ident) {
  if (!it) return "";
  const _key = getIdentKey(it);
  const _isIdent = !_key || ident?.has(_key);
  if (!_isIdent) return "";
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
    const _pfx = key[0]==='p' ? '薬' : key[0]==='s' ? '巻' : key[0]==='w' ? '杖' : key[0]==='n' ? 'ペン' : key[0]==='b' ? '書' : '壺';
    return `${_pfx}:${nicknames[key]}`;
  }
  return fakeNames?.[key] ?? it.name;
}
