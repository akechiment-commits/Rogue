import { describe, it, expect } from "vitest";
import { bfsNext } from "../monsters.js";
import { MW, MH, T } from "../utils.js";

function blankFloorMap() {
  return Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
}

describe("wall walker pathfinding", () => {
  it("壁タイルを通ってプレイヤーへ向かえる", () => {
    const map = blankFloorMap();
    /* 中央に壁の廊 */
    for (let y = 5; y < 15; y++) map[y][10] = T.WALL;
    const self = { x: 8, y: 10 };
    const mons = [self];
    const wwCan = (x, y) =>
      x > 0 && x < MW - 1 && y > 0 && y < MH - 1 && map[y][x] !== T.BWALL;
    const next = bfsNext(map, mons, 8, 10, 12, 10, self, 40, null, false, wwCan, true, null, null);
    expect(next).not.toBeNull();
    /* 壁(10,10)へ入るか、迂回して接近する一歩 */
    const dist0 = Math.max(Math.abs(12 - 8), Math.abs(10 - 10));
    const dist1 = Math.max(Math.abs(12 - next.x), Math.abs(10 - next.y));
    expect(dist1).toBeLessThan(dist0);
  });

  it("前の敵を迂回して接近する", () => {
    const map = blankFloorMap();
    const self = { x: 5, y: 10 };
    const blocker = { x: 6, y: 10 };
    const mons = [self, blocker];
    const wwCan = (x, y) =>
      x > 0 && x < MW - 1 && y > 0 && y < MH - 1 && map[y][x] !== T.BWALL;
    const next = bfsNext(map, mons, 5, 10, 8, 10, self, 40, null, false, wwCan, true, null, null);
    expect(next).not.toBeNull();
    /* ブロッカーの上に乗らない */
    expect(!(next.x === 6 && next.y === 10)).toBe(true);
    /* プレイヤー(8,10)へ近づく */
    const dist0 = Math.max(Math.abs(8 - 5), Math.abs(10 - 10));
    const dist1 = Math.max(Math.abs(8 - next.x), Math.abs(10 - next.y));
    expect(dist1).toBeLessThan(dist0);
  });
});
