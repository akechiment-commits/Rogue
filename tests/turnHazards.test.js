import { describe, expect, it } from "vitest";
import { resolveTurnHazards } from "../turnHazards.js";

function dependencies(overrides = {}) {
  return {
    hasRingEffect: () => false,
    doExplosion: () => {},
    runMineExplosion: () => {},
    doTimeBombExplosion: () => {},
    fireTrapPlayer: () => {},
    getItemName: (item) => item.name,
    lu: {},
    ident: new Set(),
    ...overrides,
  };
}

describe("resolveTurnHazards", () => {
  it("遅延地雷と時限爆弾を解決し、残りターンを記録する", () => {
    const mine = { name: "地雷" };
    const explodingBomb = { x: 2, y: 3, turnsLeft: 1 };
    const pendingBomb = { x: 4, y: 5, turnsLeft: 2 };
    const state = { dungeon: { _pendingMineExplosion: mine, pendingBombs: [explodingBomb, pendingBomb] } };
    const player = { x: 1, y: 1, hp: 20 };
    const messages = [];
    const calls = [];

    const result = resolveTurnHazards(state, player, messages, dependencies({
      runMineExplosion: (_dungeon, pending) => calls.push(["mine", pending]),
      doTimeBombExplosion: (x, y) => calls.push(["bomb", x, y]),
    }));

    expect(result).toEqual({ spinFired: false });
    expect(calls).toEqual([["mine", mine], ["bomb", 2, 3]]);
    expect(state.dungeon.pendingBombs).toEqual([{ x: 4, y: 5, turnsLeft: 1 }]);
    expect(messages).toEqual(["地雷が発動！", "時限爆弾の罠が大爆発した！", "時限爆弾の罠：あと1ターンで爆発！"]);
  });

  it("遅延回転板は敵攻撃を止めるための印を返す", () => {
    const spin = { name: "回転板" };
    const state = { _pendingSpin: spin, dungeon: {} };
    const calls = [];

    const result = resolveTurnHazards(state, { x: 1, y: 1, hp: 20 }, [], dependencies({
      fireTrapPlayer: (trap) => calls.push(trap),
    }));

    expect(result).toEqual({ spinFired: true });
    expect(calls).toEqual([spin]);
    expect(state._pendingSpin).toBeUndefined();
  });

  it("倍速の追加拍では時限爆弾を進めず、遅延地雷は発火する", () => {
    const mine = { name: "地雷" };
    const bomb = { x: 2, y: 3, turnsLeft: 2 };
    const state = { dungeon: { _pendingMineExplosion: mine, pendingBombs: [bomb] } };
    const calls = [];
    resolveTurnHazards(state, { x: 1, y: 1, hp: 20 }, [], dependencies({
      runMineExplosion: (_dungeon, pending) => calls.push(["mine", pending]),
      doTimeBombExplosion: () => calls.push("bomb"),
      tickTimedEffects: false,
    }));
    expect(calls).toEqual([["mine", mine]]);
    expect(state.dungeon.pendingBombs).toEqual([{ x: 2, y: 3, turnsLeft: 2 }]);
  });
});
