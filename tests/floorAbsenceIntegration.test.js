import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { suspendFloor, resumeFloor } from "../floorAbsence.js";
import { beginPlayerTurnClock, takeDueActions } from "../actionClock.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

// Reactを起動せず、本体の階移動コールバックそのものを実行する。
function changeFloorFor(state) {
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const chgFloor = useCallback(");
  const end = source.indexOf("  const withPitfallBag", start);
  const deps = {
    sr: { current: state }, useCallback: fn => fn, suspendFloor, resumeFloor,
    getShops: () => [], setDungeonAllBcKnown: () => {}, ensureStairsPresent: () => {},
    refreshFOV: () => {}, pushPlayerTeleportAnim: () => {}, rng: low => low,
  };
  return new Function(...Object.keys(deps), `${source.slice(start, end)}; return chgFloor;`)(...Object.values(deps));
}

describe("階移動と不在処理の接続", () => {
  it("階段で逃げて長時間後に戻ると追跡者は残り、通常の1行動だけ行う", () => {
    const waiting = { id: "waiting", x: 5, y: 5, aware: true, hp: 30, speed: 1, actionTime: 120 };
    const patrol = { id: "patrol", x: 20, y: 20, aware: false, hp: 30, speed: 1, actionTime: 120 };
    const floor1 = makeEmptyDg({ monsters: [waiting, patrol], stairUp: { x: 2, y: 2 }, stairDown: { x: 4, y: 4 } });
    const floor2 = makeEmptyDg({ stairUp: { x: 2, y: 2 }, stairDown: { x: 4, y: 4 } });
    const player = makePlayer({ depth: 1, x: 4, y: 4, actionTime: 120, turns: 10 });
    const state = { player, dungeon: floor1, floors: { 2: floor2 }, maxDepth: null, allBcKnown: true };
    const change = changeFloorFor(state);
    state.dungeon = change(player, 1, false, { stairs: true });
    expect(state.floors[1].absentSince).toBe(120);
    player.actionTime += 1200;
    state.dungeon = change(player, -1, false, { stairs: true });
    expect(state.dungeon).toBe(floor1);
    expect([player.x, player.y]).toEqual([4, 4]);
    expect([waiting.x, waiting.y]).toEqual([5, 5]);
    expect([patrol.x, patrol.y]).not.toEqual([20, 20]);
    beginPlayerTurnClock(player);
    expect(takeDueActions(waiting, player.actionTime, 1)).toBe(1);
    expect(takeDueActions(patrol, player.actionTime, 1)).toBe(1);
  });

  it("旧セーブの再訪でも記録のない巡回は行わず時計だけ補正する", () => {
    const enemy = { x: 20, y: 20, hp: 30, speed: 1, actionTime: 12 };
    const oldFloor = makeEmptyDg({ monsters: [enemy], stairUp: { x: 2, y: 2 }, stairDown: { x: 4, y: 4 } });
    const player = makePlayer({ depth: 2, actionTime: 12000, turns: 1000 });
    const state = { player, dungeon: makeEmptyDg(), floors: { 1: oldFloor }, maxDepth: null, allBcKnown: true };
    state.dungeon = changeFloorFor(state)(player, -1, false, { stairs: true });
    expect(enemy).toMatchObject({ x: 20, y: 20, actionTime: 12000 });
    beginPlayerTurnClock(player);
    expect(takeDueActions(enemy, player.actionTime, 1)).toBe(1);
  });
});
