/**
 * 道具欄「足元」ページに載せる床オブジェクト一覧。
 * アイテム・罠に加え、風穴・魔方陣・泉・大箱を含める。
 */

import { ITEMS, BB_TYPES } from "./items.js";

export const VENT_FLOOR_DESC =
  "一定範囲の物理飛び道具（投擲・矢・石・ブレスなど）の向きを風向きに変える。杖や魔法弾は曲がらない。";

export const FIXED_PORTAL_FLOOR_DESC =
  "対になる転送陣と常に繋がっている。乗ると反対側へ転送される。プレイヤー・敵・投げた物も通る。ペンのポータルとは繋がらない。";

export const PORTAL_FLOOR_DESC =
  "ポータル同士が繋がると乗ってワープできる。上に投げた物も反対側から出る。呪いだとランダムワープになる。";

export const SPRING_FLOOR_DESC =
  "神秘の泉。水を飲んだりアイテムを浸したりできる。状態が変わったり、ごく稀に願いが叶うこともある。";

export const BIGBOX_UNKNOWN_DESC =
  "正体不明の大箱。開けると中にアイテムを入れたり取り出したりできる。";

/** 説明のみ（踏む・拾うなし）の足元ロール */
export const FLOOR_INFO_ROLES = new Set(["vent", "pentacle", "spring", "bigbox"]);

function penTemplate(kind) {
  if (!kind || kind === "fixed_portal") return null;
  return ITEMS.find((i) => i.type === "pen" && i.effect === kind) || null;
}

function pentacleDesc(pc) {
  if (pc.desc) return pc.desc;
  if (pc.kind === "fixed_portal") return FIXED_PORTAL_FLOOR_DESC;
  if (pc.kind === "portal") {
    const pen = penTemplate("portal");
    return pen?.desc || PORTAL_FLOOR_DESC;
  }
  const pen = penTemplate(pc.kind);
  if (pen?.desc) return pen.desc;
  return "魔方陣。効果は種類によって異なる。";
}

function pentacleName(pc) {
  if (pc.name) return pc.name;
  if (pc.kind === "fixed_portal") return "転送の魔法陣";
  const pen = penTemplate(pc.kind);
  if (pen?.name) {
    /* 「○○のペン」→「○○の魔方陣」 */
    return pen.name.replace(/のペン$/, "の魔方陣");
  }
  return "魔方陣";
}

/**
 * @param {object|null|undefined} dungeon
 * @param {number} x
 * @param {number} y
 * @param {{ allBcKnown?: boolean, bbFakeNames?: object }} [opts]
 */
export function listFloorInventoryEntries(dungeon, x, y, opts = {}) {
  if (!dungeon || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { items: [], traps: [], fixtures: [], all: [] };
  }
  const items = (dungeon.items || []).filter(
    (i) => i.x === x && i.y === y && !i.wallEmbedded && !i.noPickup,
  );
  const traps = (dungeon.traps || []).filter((t) => t.x === x && t.y === y);

  const vents = (dungeon.vents || [])
    .filter((v) => v.x === x && v.y === y)
    .map((v) => ({
      ...v,
      _floorRole: "vent",
      name: v.name || "風穴",
      desc: v.desc || VENT_FLOOR_DESC,
      tile: v.tile ?? 128,
    }));

  const pentacles = (dungeon.pentacles || [])
    .filter((pc) => pc.x === x && pc.y === y)
    .map((pc) => ({
      ...pc,
      _floorRole: "pentacle",
      name: pentacleName(pc),
      desc: pentacleDesc(pc),
      tile: pc.tile ?? 42,
    }));

  const springs = (dungeon.springs || [])
    .filter((s) => s.x === x && s.y === y)
    .map((s) => ({
      ...s,
      _floorRole: "spring",
      name: s.name || "泉",
      desc: s.desc || SPRING_FLOOR_DESC,
      tile: s.tile ?? 31,
    }));

  const bigboxes = (dungeon.bigboxes || [])
    .filter((b) => b.x === x && b.y === y)
    .map((b) => {
      const revealed = b.revealed === true || !!opts.allBcKnown;
      const tpl = BB_TYPES.find((t) => t.kind === b.kind);
      const fake = opts.bbFakeNames?.[b.kind];
      return {
        ...b,
        _floorRole: "bigbox",
        name: revealed ? (b.name || tpl?.name || "大箱") : (fake || "謎の大箱"),
        desc: revealed
          ? (b.desc || tpl?.desc || "大箱。中にアイテムを入れたり取り出したりできる。")
          : BIGBOX_UNKNOWN_DESC,
        tile: b.tile ?? tpl?.tile ?? 40,
      };
    });

  const fixtures = [...vents, ...pentacles, ...springs, ...bigboxes];
  return {
    items,
    traps,
    fixtures,
    all: [...items, ...traps, ...fixtures],
  };
}

export function floorEntryRole(entry, items, traps) {
  if (!entry) return "unknown";
  if (entry._floorRole) return entry._floorRole;
  if (entry.type === "vent") return "vent";
  if (entry.kind === "portal" || entry.kind === "fixed_portal" || entry.kind) {
    /* pentacle objects use .kind without being items */
    if (!entry.type && entry.kind) return "pentacle";
  }
  if (items?.includes?.(entry)) return "item";
  if (traps?.includes?.(entry)) return "trap";
  return "unknown";
}

/** 表示ラベル用プレフィックス付き名前 */
export function floorEntryLabel(entry, items, traps, itemLabelFn) {
  const role = floorEntryRole(entry, items, traps);
  if (role === "item") return itemLabelFn ? itemLabelFn(entry) : entry.name;
  if (role === "trap") return `【罠】${entry.name || "罠"}`;
  if (role === "vent") return `【風穴】${entry.name || "風穴"}`;
  if (role === "pentacle") return `【魔方陣】${entry.name || "魔方陣"}`;
  if (role === "spring") return `【泉】${entry.name || "泉"}`;
  if (role === "bigbox") return `【大箱】${entry.name || "大箱"}`;
  return entry.name || "？";
}

/** 足元ページのアクション数（キーボード左右用） */
export function floorEntryActionCount(entry, items, traps, canUseFn) {
  const role = floorEntryRole(entry, items, traps);
  if (role === "trap") return 2; /* 踏む + 説明 */
  if (FLOOR_INFO_ROLES.has(role)) return 1; /* 説明のみ */
  if (role !== "item") return 1;
  let n = 1; /* 拾う */
  if (entry.type === "pot") n += 1;
  else if (entry.type === "marker") n += 1;
  else if (canUseFn?.(entry)) n += 1;
  if (entry.type === "spellbook") n += 1;
  if (entry.type === "arrow") n += 1;
  if (entry.type === "wand") n += 2;
  if (entry.type === "pot") n += 1;
  n += 2; /* 投げる + 説明 */
  return n;
}
