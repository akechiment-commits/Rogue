import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MW, MH, T, monsterAt } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function examineFor(state, act, guards = {}) {
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const doExamineFront = useCallback(");
  const end = source.indexOf("  const doDash = useCallback(", start);
  const deps = {
    sr: { current: state }, useCallback: fn => fn, act,
    lookMode: false, mapMode: false, showFirstEncounterTip: vi.fn(),
    showSoundRef: { current: false }, bigboxModeRef: { current: null },
    gachaModeRef: { current: null }, nicknameModeRef: { current: null },
    MW, MH, T, monsterAt, ...guards,
  };
  return new Function(...Object.keys(deps), `${source.slice(start, end)}; return doExamineFront;`)(...Object.values(deps));
}

describe("次元宝物庫を正面から調べる", () => {
  it("通常の移動処理へ委譲し、直接座標を書き換えてターン処理を飛ばさない", () => {
    const player = makePlayer({ facing: { dx: 1, dy: 0 } });
    const dungeon = makeEmptyDg({ dimensionalVaults: [{ x: 6, y: 5 }] });
    const act = vi.fn();
    expect(() => examineFor({ player, dungeon }, act)()).not.toThrow();
    expect(act).toHaveBeenCalledExactlyOnceWith("move", 1, 0);
    expect([player.x, player.y]).toEqual([5, 5]);
  });

  it("サウンド画面中は宝物庫への移動を行わない", () => {
    const player = makePlayer({ facing: { dx: 1, dy: 0 } });
    const dungeon = makeEmptyDg({ dimensionalVaults: [{ x: 6, y: 5 }] });
    const act = vi.fn();
    examineFor({ player, dungeon }, act, { showSoundRef: { current: true } })();
    expect(act).not.toHaveBeenCalled();
  });
});
