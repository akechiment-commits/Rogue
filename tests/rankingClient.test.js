import { describe, it, expect } from "vitest";
import { validateSubmitPayload, RANKING_DUNGEON_IDS } from "../rankingClient.js";

describe("validateSubmitPayload", () => {
  const base = {
    playerId: "pid-1",
    playerName: "テスト",
    dungeonType: "beginner",
    score: 100,
    turns: 50,
    elapsedMs: 12000,
    depth: 3,
    level: 2,
    cleared: false,
    survived: false,
  };

  it("正常系", () => {
    const r = validateSubmitPayload(base);
    expect(r.ok).toBe(true);
    expect(r.body.score).toBe(100);
    expect(r.body.playerName).toBe("テスト");
  });

  it("debug は拒否", () => {
    expect(validateSubmitPayload({ ...base, dungeonType: "debug" }).ok).toBe(false);
  });

  it("許可ダンジョンのみ", () => {
    for (const id of RANKING_DUNGEON_IDS) {
      expect(validateSubmitPayload({ ...base, dungeonType: id }).ok).toBe(true);
    }
  });

  it("名前必須", () => {
    expect(validateSubmitPayload({ ...base, playerName: "" }).ok).toBe(false);
  });

  it("負のスコアは拒否", () => {
    expect(validateSubmitPayload({ ...base, score: -1 }).ok).toBe(false);
  });
});
