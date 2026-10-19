import { describe, expect, it } from "vitest";
import { applyWandEffect } from "../wands.js";
import { monsterBodiesOverlap, monsterOccupiesCell, monsterPointDistance } from "../monsterGeometry.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const directions = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
function setup(size, dx, dy) {
  const player = makePlayer({ x: 20, y: 20 });
  const target = { name: "対象", x: 20 + dx * 8, y: 20 + dy * 8, bodySize: size, hp: 100, maxHp: 100 };
  return { player, target, dungeon: makeEmptyDg({ monsters: [target] }), messages: [] };
}
function pull(state, dx, dy) {
  applyWandEffect("knockback", "monster", state.target, dx, dy,
    state.dungeon, state.player, state.messages, () => {}, () => {}, 0.5);
}

describe.each([1, 2, 3])("呪い吹き飛ばしの引き寄せ：%sマス角", size => {
  it.each(directions)("方向(%s,%s)で体の端が隣接し、プレイヤーに重ならない", (dx, dy) => {
    const state = setup(size, dx, dy);
    pull(state, dx, dy);
    expect(monsterOccupiesCell(state.target, 20, 20)).toBe(false);
    expect(monsterPointDistance(state.target, 20, 20)).toBe(1);
    expect(state.target).not.toMatchObject({ x: 20 + dx * 8, y: 20 + dy * 8 });
  });

  it.each([1, 3])("体全体が%sマス角の別の敵に重なるなら元の位置を保持する", otherSize => {
    const state = setup(size, 1, 0);
    // 右側へ寄せると、1マス敵は(21,20)、2マス角は(22,21)、3マス角は(23,21)も占める。
    const edge = { x: 20 + size, y: 20 + (size > 1 ? 1 : 0) };
    const other = { name: "障害となる敵", ...edge, hp: 100 };
    if (otherSize === 3) {
      other.bodySize = 3;
      other.x = edge.x + 1;
    }
    state.dungeon.monsters.push(other);
    pull(state, 1, 0);
    expect(state.target).toMatchObject({ x: 28, y: 20, hp: 100 });
    expect(monsterBodiesOverlap(state.target, other)).toBe(false);
  });

  it("基準マスが壁なら移動せず、強制移動無効も維持する", () => {
    const state = setup(size, 1, 0);
    const offset = Math.floor((size - 1) / 2);
    state.dungeon.map[20][21 + offset] = T.WALL;
    pull(state, 1, 0);
    expect(state.target.x).toBe(28);
    state.dungeon.map[20][21 + offset] = T.FLOOR;
    state.target.forcedMoveImmune = true;
    pull(state, 1, 0);
    expect(state.target.x).toBe(28);
  });
});
