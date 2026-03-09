export const MW = 60,
  MH = 30;

export const T = { WALL: "#", FLOOR: ".", DOOR: "+", SD: ">", SU: "<" };

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
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

export function computeFOV(map, px, py, rad, vis, exp) {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) vis[y][x] = false;
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
      if (map[iy][ix] === T.WALL && !(ix === px && iy === py)) break;
      x += ddx * 0.5;
      y += ddy * 0.5;
    }
  }
}
