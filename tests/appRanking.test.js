import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isCarryInRun, isRankableRun, RANKING_DUNGEON_IDS } from "../rankingClient.js";

const source = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const start = source.indexOf("  const submitRankingIfEligible = useCallback(");
const end = source.indexOf("  /* 死亡直後", start);

function callbackRenderer(submitRunResult) {
  let previous;
  const useCallback = (fn, dependencies) => {
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
      previous = { fn, dependencies };
    }
    return previous.fn;
  };
  return (dungeonConfig) => {
    const deps = {
      useCallback, dungeonConfig, saveData: { playerId: "p1", playerName: "冒険者" },
      isCarryInRun, isRankableRun, RANKING_DUNGEON_IDS, submitRunResult,
    };
    return new Function(...Object.keys(deps), `${source.slice(start, end)}; return submitRankingIfEligible;`)(...Object.values(deps));
  };
}

describe("続けて同じダンジョンへ出発した時のランキング区分", () => {
  it("持ち込みなし→あり→なしの各冒険で今回の開始設定を使う", () => {
    const submit = vi.fn(() => Promise.resolve({ ok: true }));
    const render = callbackRenderer(submit);
    for (const config of [
      { dungeonType: "beginner", startGold: 0 },
      { dungeonType: "beginner", startGold: 100 },
      { dungeonType: "beginner", startGold: 0, startInventory: [{ name: "短剣" }] },
      { dungeonType: "beginner", startGold: 0 },
    ]) render(config)({ survived: false });
    expect(submit.mock.calls.map(([result]) => result.carryIn)).toEqual([false, true, true, false]);
  });
});
