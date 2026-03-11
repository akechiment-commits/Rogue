export const MW = 60,
  MH = 30;

export const T = { WALL: "#", FLOOR: ".", DOOR: "+", SD: ">", SU: "<", BWALL: "B" };

/* Tile indices in spritesheet (8 cols x 4 rows, 16x16 each) */
export const TI = {
  WALL: 0,
  FLOOR: 1,
  SD: 2,
  SU: 3,
  CORR: 4,
  PLAYER: 5,
  SPRING: 31,
  POT: 32,
  PLAYER_DOWN: 33,
  PLAYER_UP: 34,
  PLAYER_LEFT: 35,
  PLAYER_RIGHT: 36,
  SHOPKEEPER: 37,
  BIGBOX: 38,
};

export const rng = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const pick = (arr) => arr[rng(0, arr.length - 1)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const removeFloorItem = (dg, item) => { dg.items = dg.items.filter(i => i !== item); };

let _u = 0;
export const uid = () => `u${++_u}_${Date.now()}`;

/* Drop/search offsets: centre first, then expanding ring */
export const DRO = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [-2, 0],
  [2, 0],
  [0, -2],
  [0, 2],
  [-2, -1],
  [-2, 1],
  [2, -1],
  [2, 1],
  [-1, -2],
  [1, -2],
  [-1, 2],
  [1, 2],
  [-2, -2],
  [2, -2],
  [-2, 2],
  [2, 2],
];

export function corridorRange(depth) {
  return depth >= 2 ? 2 : 6;
}

export function computeFOV(map, px, py, rad, vis, exp, rooms = []) {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) vis[y][x] = false;

  // 部屋内なら同じ部屋全体（+ 隣接壁）を表示（暗闇中は無効）
  if (rad > 1) {
    const playerRoom = rooms.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (playerRoom) {
      for (let ry = playerRoom.y - 1; ry <= playerRoom.y + playerRoom.h; ry++) {
        for (let rx = playerRoom.x - 1; rx <= playerRoom.x + playerRoom.w; rx++) {
          if (rx >= 0 && rx < MW && ry >= 0 && ry < MH) {
            vis[ry][rx] = true;
            exp[ry][rx] = true;
          }
        }
      }
    }
  }

  // 通路視界（レイキャスト）
  for (let a = 0; a < 360; a++) {
    const r = (a * Math.PI) / 180,
      ddx = Math.cos(r),
      ddy = Math.sin(r);
    let x = px + 0.5,
      y = py + 0.5;
    for (let d = 0; d <= rad; d += 0.5) {
      const ix = Math.floor(x),
        iy = Math.floor(y);
      if (ix < 0 || ix >= MW || iy < 0 || iy >= MH) break;
      vis[iy][ix] = true;
      exp[iy][ix] = true;
      if ((map[iy][ix] === T.WALL || map[iy][ix] === T.BWALL) && !(ix === px && iy === py)) break;
      x += ddx * 0.5;
      y += ddy * 0.5;
    }
  }
}

/* FOV再計算 + アイテム発見マーキングを一括実行するラッパー */
export function refreshFOV(dg, p) {
  const rad = (p.darknessTurns || 0) > 0 ? 1 : corridorRange(p.depth);
  computeFOV(dg.map, p.x, p.y, rad, dg.visible, dg.explored, dg.rooms);
  for (const it of dg.items) { if (dg.visible[it.y]?.[it.x]) it.discovered = true; }
}
