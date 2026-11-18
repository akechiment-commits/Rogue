import fs from "node:fs";
import { monsterOccupiesCell } from '../monsterGeometry.js';
import { describe, it, expect } from "vitest";
import { randomPlayerTeleportDest, T } from "../utils.js";
import { declareFloorExitTheft } from "../items.js";
import { suspendFloor, resumeFloor } from "../floorAbsence.js";
import { synchronizeFloorArrival } from "../floorArrival.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

export function portalFor(state) {
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const playerPortalWarp = useCallback(");
  const end = source.indexOf("  const chgFloor", start);
  const deps = { sr: { current: state }, useCallback: fn => fn, suspendFloor, resumeFloor, monsterOccupiesCell, randomPlayerTeleportDest,
    declareFloorExitTheft, synchronizeFloorArrival, refreshFOV: () => {}, pushPlayerTeleportAnim: () => {}, spawnFlockStalker: () => false };
  return new Function(...Object.keys(deps), `${source.slice(start, end)}; return playerPortalWarp;`)(...Object.values(deps));
}
function fixture({ debt = 100, goods = true } = {}) {
  const room = { x: 4, y: 4, w: 5, h: 5 };
  const keeper = { id: "sk", x: 7, y: 7, hp: 200, speed: 1, type: "shopkeeper", state: "blocking" };
  const source = makeEmptyDg({ rooms: [room], monsters: [keeper],
    shops: [{ id: "shop", room, unpaidTotal: debt, shopkeeperId: "sk" }],
    pentacles: [{ kind: "portal", name: "ポータル", x: 5, y: 5, blessed: true, drawOrder: 1 }] });
  const dest = makeEmptyDg({ pentacles: [{ kind: "portal", name: "ポータル", x: 8, y: 8, blessed: true, drawOrder: 2 }] });
  const player = makePlayer({ depth: 2, turns: 50, inventory: goods ? [{ type: "potion", shopPrice: 100, _shopId: "shop" }] : [] });
  const state = { player, dungeon: source, floors: { 1: dest }, dungeonType: "advanced", maxDepth: 30, floorTurns: 999 };
  return { state, source, keeper, dest };
}
describe("プレイヤーの別階ポータル", () => {
  it.each([true, false])("商品所持=%sでも元フロアに未払いがあれば離脱時に泥棒になる", goods => {
    const { state, source, keeper } = fixture({ goods });
    expect(portalFor(state)(state.player, state, [])).toBe(true);
    expect(state.player.depth).toBe(1);
    expect(state.player.isThief).toBe(true);
    expect(source.shopTheft).toBe(true);
    expect(keeper.state).toBe("hostile");
    expect(source.nextGuardSpawnTurn).toBe(50);
  });
  it("支払い済みの場合は敵対せず、同じ階内のポータルは離脱扱いにしない", () => {
    const { state, keeper, dest } = fixture({ goods: false, debt: 0 });
    portalFor(state)(state.player, state, []);
    expect(state.player.isThief).toBeFalsy();
    expect(keeper.state).toBe("blocking");
    const second = fixture();
    second.state.dungeon.pentacles.push(dest.pentacles[0]);
    second.state.floors = {};
    portalFor(second.state)(second.state.player, second.state, []);
    expect(second.state.player.isThief).toBeFalsy();
    expect(second.state.floorTurns).toBe(999);
  });
  it("別階到着時に滞在ターンと自然湧き時刻を更新し、長居ペナルティを持ち越さない", () => {
    const { state, dest } = fixture();
    portalFor(state)(state.player, state, []);
    expect(state.floorTurns).toBe(0);
    expect(dest.nextSpawnTurn).toBe(80);
    expect(state.maxReachedFloor).toBe(2);
    expect(dest.maxFloors).toBe(30);
  });
  it("同じポータルに居続けても再発動せず、乗り直すと発動する", () => {
    const a = { kind: "portal", name: "ポータルA", x: 5, y: 5, drawOrder: 1 };
    const b = { kind: "portal", name: "ポータルB", x: 8, y: 8, drawOrder: 2 };
    const dg = makeEmptyDg({ pentacles: [a, b], monsters: [] });
    const player = makePlayer({ depth: 1, inventory: [] });
    const state = { player, dungeon: dg, floors: {}, dungeonType: "advanced", maxDepth: 30, floorTurns: 0 };
    const warp = portalFor(state);
    expect(warp(player, state, [])).toBe(true);
    expect(player).toMatchObject({ x: 8, y: 8 });
    // 着地したポータルの上に居続けても発動しない
    expect(warp(player, state, [])).toBe(false);
    expect(player).toMatchObject({ x: 8, y: 8 });
    // 一度降りて乗り直すと発動する
    player.x = 1; player.y = 1;
    expect(warp(player, state, [])).toBe(false);
    player.x = 8; player.y = 8;
    expect(warp(player, state, [])).toBe(true);
    expect(player).toMatchObject({ x: 5, y: 5 });
  });
  it("呪いポータルは大型敵の体が占める床を飛ばして空き床に着地する", () => {
    const portal = { kind: "portal", name: "ポータル", cursed: true, x: 5, y: 5 };
    const dungeon = makeEmptyDg({
      pentacles: [portal],
      monsters: [{ x: 7, y: 7, bodySize: 2 }],
    });
    for (const row of dungeon.map) row.fill(T.WALL);
    dungeon.map[8][8] = T.FLOOR;
    dungeon.map[10][10] = T.FLOOR;
    const player = makePlayer({ depth: 1 });
    const state = { player, dungeon };
    expect(portalFor(state)(player, state, [])).toBe(true);
    expect(player).toMatchObject({ x: 10, y: 10 });
  });

  it("空き床がなければ呪いポータルは移動も移動封じ解除も行わない", () => {
    const portal = { kind: "portal", name: "ポータル", cursed: true, x: 5, y: 5 };
    const dungeon = makeEmptyDg({ pentacles: [portal], monsters: [{ x: 8, y: 8 }] });
    for (const row of dungeon.map) row.fill(T.WALL);
    dungeon.map[5][5] = T.FLOOR;
    dungeon.map[8][8] = T.FLOOR;
    const player = makePlayer({ depth: 1, immobileTurns: 3 });
    const state = { player, dungeon };
    expect(portalFor(state)(player, state, [])).toBe(false);
    expect(player).toMatchObject({ x: 5, y: 5, immobileTurns: 3 });
  });

  it("同じ階へのテレポートでは滞在ターンを消さない", () => {
    const { state } = fixture();
    synchronizeFloorArrival(state, state.dungeon, { floorChanged: false, spawnDelay: 10 });
    expect(state.floorTurns).toBe(999);
    expect(state.dungeon.nextSpawnTurn).toBe(60);
  });
});
