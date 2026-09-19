import { describe, it, expect, beforeEach } from "vitest";
import {
  recordAdventureScore,
  scoresForDungeon,
  scoreHeadline,
  migrateAdventureScores,
} from "../adventureScores.js";

const KEY = "roguelike_scores";
const store = new Map();

beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
});

describe("adventureScores", () => {
  it("stores and filters by dungeonType", () => {
    recordAdventureScore({ dungeonType: "beginner", result: "death", cause: "罠", level: 1, depth: 3, turns: 10, gold: 5 });
    recordAdventureScore({ dungeonType: "advanced", result: "clear", cause: "クリア", level: 8, depth: 30, turns: 200, gold: 900 });
    expect(scoresForDungeon("beginner")).toHaveLength(1);
    expect(scoresForDungeon("advanced")).toHaveLength(1);
    expect(scoresForDungeon("advanced")[0].result).toBe("clear");
  });

  it("migrates legacy entries without dungeonType to _legacy", () => {
    localStorage.setItem(KEY, JSON.stringify([{ cause: "スライム", level: 2, depth: 1, turns: 5, gold: 0, date: "2026/1/1" }]));
    const all = migrateAdventureScores();
    expect(all[0].dungeonType).toBe("_legacy");
    expect(scoresForDungeon("beginner")).toHaveLength(0);
    expect(scoresForDungeon("_legacy")).toHaveLength(1);
  });

  it("scoreHeadline distinguishes clear / escape / death", () => {
    expect(scoreHeadline({ result: "clear", cause: "クリア" })).toBe("クリア！");
    expect(scoreHeadline({ result: "escape", cause: "生還" })).toBe("生還");
    expect(scoreHeadline({ result: "death", cause: "毒" })).toBe("毒で倒れた");
  });
});
