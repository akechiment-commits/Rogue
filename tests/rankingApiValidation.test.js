import { describe, expect, it } from "vitest";
import { validateBody } from "../api/ranking.js";

const base = {
  playerId: "p1", playerName: "冒険者", dungeonType: "beginner",
  score: 100, turns: 20, elapsedMs: 1000,
};

describe("ランキングAPIの結果確定チェック", () => {
  it.each([
    {}, { cleared: false }, { survived: true },
    { cleared: "false", survived: "false" }, { cleared: 1 },
  ])("クリア・死亡が確定していない投稿を拒否する %#", flags => {
    expect(validateBody({ ...base, ...flags }).ok).toBe(false);
  });
  it.each([
    { cleared: true, survived: true },
    { cleared: false, survived: false },
  ])("確定した結果を受け入れる %#", flags => {
    expect(validateBody({ ...base, ...flags })).toMatchObject({ ok: true, data: flags });
  });
});
