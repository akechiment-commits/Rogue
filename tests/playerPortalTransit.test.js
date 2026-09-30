import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { declareFloorExitTheft } from "../items.js";
import { suspendFloor, resumeFloor } from "../floorAbsence.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

export function portalFor(state) {
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const playerPortalWarp = useCallback(");
  const end = source.indexOf("  const chgFloor", start);
  const deps = { sr: { current: state }, useCallback: fn => fn, suspendFloor, resumeFloor,
    declareFloorExitTheft, refreshFOV: () => {}, pushPlayerTeleportAnim: () => {} };
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
  });
});
