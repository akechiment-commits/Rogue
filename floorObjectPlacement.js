/**
 * 床上の「動かせる物体」（罠・魔方陣・風穴・階段など）の配置・重なり判定。
 */
import { T, MW, MH, randomTeleportDest, TI } from "./utils.js";
import { statueAt } from "./fixtureQueries.js";

export const STAIR_DOWN_DESC =
  "下り階段。足で降りると次のフロアへ進める。";
export const STAIR_UP_DESC =
  "上り階段。1階では地上へ脱出できる。2階以降は前のフロアへ戻る。";

/**
 * (x,y) に床物体を置けないか。
 * @param {object} dg
 * @param {number} x
 * @param {number} y
 * @param {{ ignore?: object, p?: object, allowPlayer?: boolean, allowMonster?: boolean, allowStairTile?: boolean }} [opts]
 */
export function isFloorOccupancyBlocked(dg, x, y, opts = {}) {
  if (!dg?.map) return true;
  const tile = dg.map[y]?.[x];
  /* 階段タイル自体への着地は不可（階段を動かす先は FLOOR のみ） */
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

export const FLOOR_MOVE_KINDS = new Set(["trap", "vent", "pentacle", "stair"]);

export function floorMoveLabel(kind, target) {
  if (!target) return "何か";
  if (kind === "trap") return target.name || "罠";
  if (kind === "vent") return target.name || "風穴";
  if (kind === "pentacle") return target.name || "魔方陣";
  if (kind === "stair") return target.name || (target.stairDir === "up" ? "上り階段" : "下り階段");
  return target.name || "何か";
}

/** マップ上の階段を足元／杖用の参照オブジェクトにする */
export function stairRefAt(dg, x, y) {
  const tile = dg?.map?.[y]?.[x];
  if (tile === T.SD) {
    return {
      _floorRole: "stair",
      stairDir: "down",
      x, y,
      name: "下り階段",
      desc: STAIR_DOWN_DESC,
      tile: TI.SD,
    };
  }
  if (tile === T.SU) {
    return {
      _floorRole: "stair",
      stairDir: "up",
      x, y,
      name: "上り階段",
      desc: STAIR_UP_DESC,
      tile: TI.SU,
    };
  }
  return null;
}

/**
 * 階段を (nx,ny) へ移す（マップと stairUp/stairDown を更新）。
 * 成功時 true。
 */
export function moveStairTo(dg, stair, nx, ny) {
  if (!dg?.map || !stair) return false;
  if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) return false;
  if (isFloorOccupancyBlocked(dg, nx, ny, { allowPlayer: true, allowMonster: true })) return false;
  const oldX = stair.x, oldY = stair.y;
  const tileType = stair.stairDir === "up" ? T.SU : T.SD;
  if (dg.map[oldY]?.[oldX] === T.SU || dg.map[oldY]?.[oldX] === T.SD) {
    dg.map[oldY][oldX] = T.FLOOR;
  }
  dg.map[ny][nx] = tileType;
  stair.x = nx;
  stair.y = ny;
  if (stair.stairDir === "up") {
    if (dg.stairUp) { dg.stairUp.x = nx; dg.stairUp.y = ny; }
    else dg.stairUp = { x: nx, y: ny };
  } else {
    if (dg.stairDown) { dg.stairDown.x = nx; dg.stairDown.y = ny; }
    else dg.stairDown = { x: nx, y: ny };
  }
  return true;
}

/**
 * 階段を吹き飛ばし方向へスライド（重なり手前で停止）。
 */
export function pushStair(dg, stair, dx, dy, dist) {
  if (!stair || (!dx && !dy)) return { x: stair?.x, y: stair?.y };
  let cx = stair.x, cy = stair.y;
  for (let i = 0; i < dist; i++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) break;
    const tile = dg.map[ny]?.[nx];
    if (tile === T.WALL || tile === T.BWALL) break;
    if (isFloorOccupancyBlocked(dg, nx, ny, { allowPlayer: true, allowMonster: true })) break;
    cx = nx; cy = ny;
  }
  if (cx !== stair.x || cy !== stair.y) moveStairTo(dg, stair, cx, cy);
  return { x: stair.x, y: stair.y };
}
