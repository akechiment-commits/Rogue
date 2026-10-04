import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monsterAI, MONS, makeMonsterFromBase, findRoom } from "../monsters.js";
import { fireTrapPlayer } from "../traps.js";
import { takeDueActions } from "../actionClock.js";
import { declareFloorExitTheft, inMagicSealRoom } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { suspendFloor, resumeFloor } from "../floorAbsence.js";
import { synchronizeFloorArrival } from "../floorArrival.js";
import { generateSessionFloor } from "../floorGeneration.js";
import { markBigboxKindIdentified } from "../GameHelpers.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

// 本体の敵処理と階移動コールバックを実行する。描画・React・床到着の補助処理は省く。
function callbacksFor(state, overrides = {}) {
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const moveStart = source.indexOf("  const moveMons = useCallback(");
  const moveEnd = source.indexOf("  /* ポータルの魔方陣のプレイヤー転送ヘルパー", moveStart);
  const floorStart = source.indexOf("  const chgFloor = useCallback(");
  const floorEnd = source.indexOf("  const withPitfallBag", floorStart);
  const deps = {
    sr: { current: state }, useCallback: fn => fn, monsterAI, fireTrapPlayer,
    bigboxAddItem: () => {}, lu: () => {}, applyWandEffect, inMagicSealRoom, findRoom, takeDueActions,
    suspendFloor, resumeFloor, generateSessionFloor, synchronizeFloorArrival, declareFloorExitTheft,
    setDungeonAllBcKnown: () => {}, ensureStairsPresent: () => {}, markBigboxKindIdentified,
    refreshFOV: () => {}, pushPlayerTeleportAnim: () => {}, rng: low => low, ...overrides,
  };
  return new Function(...Object.keys(deps), `${source.slice(floorStart, floorEnd)}\n${source.slice(moveStart, moveEnd)}\nreturn { moveMons, chgFloor };`)(...Object.values(deps));
}

describe("敵処理中の階移動", () => {
  it("タイガーに落とし穴へ投げられた後、元の階の敵に移動先座標で攻撃されない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const tiger = makeMonsterFromBase(MONS.find(mon => mon.name === "ゴールドタイガー"), 1, 5, 5);
    const oldEnemy = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 2, 3);
    for (const monster of [tiger, oldEnemy]) {
      monster.aware = true;
      monster._phaseActionCount = 1;
      monster._movesMadeThisPhase = 0;
      monster.turnAttacks = 0;
    }
    tiger.alwaysUseSpecial = true;
    const source = makeEmptyDg({ monsters: [tiger, oldEnemy], rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
      traps: [{ id: "pit", name: "落とし穴", effect: "pitfall", x: 8, y: 5, revealed: true, permanent: true }] });
    const destination = makeEmptyDg({ rooms: [{ x: 2, y: 2, w: 3, h: 3 }], stairUp: { x: 2, y: 2 } });
    const player = makePlayer({ x: 6, y: 5, depth: 1, exp: 0, turns: 1, actionTime: 12 });
    const state = { player, dungeon: source, floors: { 2: destination }, maxDepth: null, allBcKnown: true, ident: new Set() };
    const messages = [];
    callbacksFor(state).moveMons(source, player, messages, "attackOnly");
    expect(state.dungeon).toBe(destination);
    expect(player.depth).toBe(2);
    expect([player.x, player.y]).toEqual([2, 2]);
    expect(player.hp).toBe(100);
    expect(oldEnemy.turnAttacks).toBe(0);
    expect(messages.some(message => message.includes("コボルドの攻撃"))).toBe(false);
  });
  it.each(["attackOnly", "moveOnly", "both"])("%sでも、倍速敵の途中で階が変われば残りの行動を止める", phase => {
    const actor = { id: "fast", hp: 10, x: 5, y: 5, speed: 3, actionTime: 0, _phaseActionCount: 3, _movesMadeThisPhase: 0 };
    const player = makePlayer({ depth: 1, actionTime: 12 });
    const source = makeEmptyDg({ monsters: [actor] });
    const destination = makeEmptyDg();
    const state = { player, dungeon: source };
    const ai = vi.fn(() => { state.dungeon = destination; player.depth = 2; });
    callbacksFor(state, { monsterAI: ai }).moveMons(source, player, [], phase);
    expect(ai).toHaveBeenCalledOnce();
  });
  it("同じ階内の位置移動では、残りの敵行動を止めない", () => {
    const actor = { id: "fast", hp: 10, x: 5, y: 5, speed: 3, _phaseActionCount: 3, _movesMadeThisPhase: 0 };
    const player = makePlayer({ depth: 1 });
    const state = { player, dungeon: makeEmptyDg({ monsters: [actor] }) };
    const ai = vi.fn(() => { player.x = 10; player.y = 10; });
    callbacksFor(state, { monsterAI: ai }).moveMons(state.dungeon, player, [], "attackOnly");
    expect(ai).toHaveBeenCalledTimes(3);
  });
});
