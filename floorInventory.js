/**
 * 道具欄「足元」ページに載せる床オブジェクト一覧。
 * アイテム・罠に加え、風穴・転送系魔方陣を含める。
 */

export const VENT_FLOOR_DESC =
  "一定範囲の物理飛び道具（投擲・矢・石・ブレスなど）の向きを風向きに変える。杖や魔法弾は曲がらない。";

export const FIXED_PORTAL_FLOOR_DESC =
  "対になる転送陣と常に繋がっている。乗ると反対側へ転送される。プレイヤー・敵・投げた物も通る。ペンのポータルとは繋がらない。";

export const PORTAL_FLOOR_DESC =
  "ポータル同士が繋がると乗ってワープできる。上に投げた物も反対側から出る。呪いだとランダムワープになる。";

/**
 * @param {object|null|undefined} dungeon
 * @param {number} x
 * @param {number} y
 * @returns {{ items: object[], traps: object[], fixtures: object[], all: object[] }}
 */
export function listFloorInventoryEntries(dungeon, x, y) {
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
  const portals = (dungeon.pentacles || [])
    .filter(
      (pc) =>
        (pc.kind === "portal" || pc.kind === "fixed_portal") &&
        pc.x === x &&
        pc.y === y,
    )
    .map((pc) => {
      const isFixed = pc.kind === "fixed_portal";
      return {
        ...pc,
        _floorRole: "portal",
        name: pc.name || (isFixed ? "転送の魔法陣" : "ポータルの魔方陣"),
        desc:
          pc.desc ||
          (isFixed ? FIXED_PORTAL_FLOOR_DESC : PORTAL_FLOOR_DESC),
        tile: pc.tile ?? 42,
      };
    });
  const fixtures = [...vents, ...portals];
  return {
    items,
    traps,
    fixtures,
    all: [...items, ...traps, ...fixtures],
  };
}

export function floorEntryRole(entry, items, traps) {
  if (!entry) return "unknown";
  if (entry._floorRole === "vent" || entry._floorRole === "portal") return entry._floorRole;
  if (entry.type === "vent") return "vent";
  if (entry.kind === "portal" || entry.kind === "fixed_portal") return "portal";
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
  if (role === "portal") return `【魔方陣】${entry.name || "転送の魔法陣"}`;
  return entry.name || "？";
}

/** 足元ページのアクション数（キーボード左右用） */
export function floorEntryActionCount(entry, items, traps, canUseFn) {
  const role = floorEntryRole(entry, items, traps);
  if (role === "trap") return 2; /* 踏む + 説明 */
  if (role === "vent" || role === "portal") return 1; /* 説明のみ */
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
