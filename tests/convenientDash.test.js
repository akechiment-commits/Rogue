import { describe, expect, it } from "vitest";
import { T, MW, MH } from "../utils.js";
import { planConvenientDash } from "../convenientDash.js";

function mapWithWalls() {
  return Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
}

function carve(map, cells) {
  for (const [x, y] of cells) map[y][x] = T.FLOOR;
}

describe("planConvenientDash", () => {
  it("通路では曲がり角を追って出口または行き止まりまで進む", () => {
    const map = mapWithWalls();
    carve(map, [[5, 5], [6, 5], [7, 5], [7, 6], [7, 7]]);
    const route = planConvenientDash(
      { map, rooms: [], items: [], monsters: [], statues: [] },
      { x: 5, y: 5 },
      1,
      0,
    );
    expect(route).toEqual([[1, 0], [1, 0], [0, 1], [0, 1]]);
  });

  it("部屋では入力方向を起点に道具までの経路を選ぶ", () => {
    const map = mapWithWalls();
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) map[y][x] = T.FLOOR;
    const route = planConvenientDash(
      { map, rooms: [{ x: 2, y: 2, w: 5, h: 5 }], items: [{ x: 2, y: 4 }, { x: 5, y: 4 }], monsters: [], statues: [] },
      { x: 3, y: 4 },
      1,
      0,
    );
    expect(route).toEqual([[1, 0], [1, 0]]);
  });

  it("部屋に目的物がなければ1マスだけ進む", () => {
    const map = mapWithWalls();
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) map[y][x] = T.FLOOR;
    const route = planConvenientDash(
      { map, rooms: [{ x: 2, y: 2, w: 5, h: 5 }], items: [], monsters: [], statues: [] },
      { x: 3, y: 4 },
      1,
      0,
    );
    expect(route).toEqual([[1, 0]]);
  });

  it("入力が斜めなら、同じ方向の対象へ斜めを含む最短経路を選ぶ", () => {
    const map = mapWithWalls();
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) map[y][x] = T.FLOOR;
    const route = planConvenientDash(
      { map, rooms: [{ x: 2, y: 2, w: 5, h: 5 }], items: [{ x: 5, y: 2 }], monsters: [], statues: [] },
      { x: 3, y: 4 },
      1,
      -1,
    );
    expect(route).toEqual([[1, -1], [1, -1]]);
  });

  it("上下左右入力の1歩目はその方向へ進み、その後に目的物への最短経路へ入る", () => {
    const map = mapWithWalls();
    for (let y = 2; y <= 7; y++) for (let x = 2; x <= 7; x++) map[y][x] = T.FLOOR;
    const route = planConvenientDash(
      { map, rooms: [{ x: 2, y: 2, w: 6, h: 6 }], items: [], altars: [{ x: 5, y: 6 }], monsters: [], statues: [] },
      { x: 3, y: 4 },
      0,
      1,
    );
    expect(route).toEqual([[0, 1], [1, 1], [1, 0]]);
  });

  it("部屋の出口が近くても祭壇などの床オブジェクトを優先する", () => {
    const map = mapWithWalls();
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) map[y][x] = T.FLOOR;
    map[7][3] = T.FLOOR;
    const route = planConvenientDash(
      { map, rooms: [{ x: 2, y: 2, w: 5, h: 5 }], items: [], altars: [{ x: 5, y: 6 }], monsters: [], statues: [] },
      { x: 3, y: 4 },
      0,
      1,
    );
    expect(route).toEqual([[0, 1], [1, 1], [1, 0]]);
  });

  it("大箱などの床オブジェクトも目的地として選ぶ", () => {
    const map = mapWithWalls();
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) map[y][x] = T.FLOOR;
    const route = planConvenientDash(
      { map, rooms: [{ x: 2, y: 2, w: 5, h: 5 }], items: [], bigboxes: [{ x: 5, y: 4 }], monsters: [], statues: [] },
      { x: 3, y: 4 },
      1,
      0,
    );
    expect(route).toEqual([[1, 0], [1, 0]]);
  });

  it("敵の手前で経路を切る", () => {
    const map = mapWithWalls();
    carve(map, [[5, 5], [6, 5], [7, 5], [8, 5]]);
    const route = planConvenientDash(
      { map, rooms: [], items: [], monsters: [{ x: 7, y: 5 }], statues: [] },
      { x: 5, y: 5 },
      1,
      0,
    );
    expect(route).toEqual([[1, 0]]);
  });
});
