/**
 * 床上の「動かせる物体」（罠・魔方陣・風穴など）の配置・重なり判定。
 */
import { T, MW, MH, randomTeleportDest } from "./utils.js";
import { statueAt } from "./fixtureQueries.js";

/**
 * (x,y) に床物体を置けないか。
 * @param {object} dg
 * @param {number} x
 * @param {number} y
 * @param {{ ignore?: object, p?: object, allowPlayer?: boolean, allowMonster?: boolean }} [opts]
 */
export function isFloorOccupancyBlocked(dg, x, y, opts = {}) {
  if (!dg?.map) return true;
  const tile = dg.map[y]?.[x];
  if (tile !== T.FLOOR) return true;
  if (statueAt(dg, x, y)) return true;
  const ignore = opts.ignore;
  if (!opts.allowPlayer && opts.p && opts.p.x === x && opts.p.y === y) return true;
  if (!opts.allowMonster && dg.monsters?.some((m) => m.x === x && m.y === y)) return true;
  if (dg.items?.some((i) => i !== ignore && i.x === x && i.y === y && !i.wallEmbedded)) return true;
  if (dg.traps?.some((t) => t !== ignore && t.x === x && t.y === y)) return true;
  if (dg.springs?.some((s) => s !== ignore && s.x === x && s.y === y)) return true;
  if (dg.bigboxes?.some((b) => b !== ignore && b.x === x && b.y === y)) return true;
  if (dg.pentacles?.some((pc) => pc !== ignore && pc.x === x && pc.y === y)) return true;
  if (dg.vents?.some((v) => v !== ignore && v.x === x && v.y === y)) return true;
  if (dg.oilyTiles?.some((t) => t !== ignore && t.x === x && t.y === y)) return true;
  return false;
}

/**
 * 床物体のテレポート先（重ならない空き床）。
 */
export function pickFreeFloorObjectCell(dg, ignore, p, fromX, fromY) {
  return randomTeleportDest(dg, fromX ?? 0, fromY ?? 0, (x, y) =>
    !isFloorOccupancyBlocked(dg, x, y, { ignore, p }),
  );
}

/** 1マス先が床物体の移動先として有効か（呪いテレポ1歩など） */
export function canStepFloorObjectTo(dg, x, y, ignore, p) {
  if (x < 0 || x >= MW || y < 0 || y >= MH) return false;
  return !isFloorOccupancyBlocked(dg, x, y, { ignore, p });
}

export const FLOOR_MOVE_KINDS = new Set(["trap", "vent", "pentacle"]);

export function floorMoveLabel(kind, target) {
  if (!target) return "何か";
  if (kind === "trap") return target.name || "罠";
  if (kind === "vent") return target.name || "風穴";
  if (kind === "pentacle") return target.name || "魔方陣";
  return target.name || "何か";
}
