import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fetchRanking, submitRunResult, validateSubmitPayload, RANKING_DUNGEON_IDS } from "../rankingClient.js";

function makeStorage() {
  return {
    _data: {},
    getItem(key) { return this._data[key] ?? null; },
    setItem(key, value) { this._data[key] = value; },
    removeItem(key) { delete this._data[key]; },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("tutorial は拒否", () => {
    expect(validateSubmitPayload({ ...base, dungeonType: "tutorial" }).ok).toBe(false);
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

  it("オフラインでも自分のスコアランキングへ保存する", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await submitRunResult(base);
    expect(result.offline).toBe(true);

    const ranking = await fetchRanking({
      board: "score", dungeon: "beginner", mine: true, playerId: "pid-1",
    });
    expect(ranking.ok).toBe(true);
    expect(ranking.offline).toBe(true);
    expect(ranking.entries).toHaveLength(1);
    expect(ranking.entries[0]).toMatchObject({ playerName: "テスト", score: 100, cleared: false });
  });

  it("自分のクリアタイムランキングはクリア結果だけを表示する", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await submitRunResult({ ...base, cleared: false, score: 500 });
    await submitRunResult({ ...base, cleared: true, score: 700, elapsedMs: 9000 });

    const ranking = await fetchRanking({
      board: "clear", dungeon: "beginner", mine: true, playerId: "pid-1",
    });
    expect(ranking.entries).toHaveLength(1);
    expect(ranking.entries[0]).toMatchObject({ cleared: true, elapsedMs: 9000 });
  });
});
