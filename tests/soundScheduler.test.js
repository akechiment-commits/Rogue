import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { soundEngine } from "../soundEngine.js";
import { BGM_DUNGEON_SHALLOW, BGM_GAMEOVER } from "../musicData.js";

describe("BGMスケジューラー", () => {
  let engine, play;
  beforeEach(() => {
    vi.useFakeTimers();
    engine = new soundEngine.constructor();
    engine.ctx = { currentTime: 0 };
    play = vi.spyOn(engine, "_playStepAt").mockImplementation(() => {});
    engine.playBGM(BGM_DUNGEON_SHALLOW);
    play.mockClear();
  });
  afterEach(() => { engine.stopBGM(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it.each([60, 86400])("音声時計が%s秒進んでも過去の音を生成せず、先読み分だけ予約する", time => {
    engine.ctx.currentTime = time;
    engine._schedule();
    expect(play.mock.calls.length).toBeGreaterThan(0);
    expect(play.mock.calls.length).toBeLessThanOrEqual(4);
    for (const [step, at] of play.mock.calls) {
      expect(at).toBeGreaterThanOrEqual(time);
      expect(at).toBeLessThan(time + 0.2);
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(engine.totalSteps);
    }
  });
  it("通常のポーリングで同じ音を二重予約しない", () => {
    engine._schedule();
    expect(play).not.toHaveBeenCalled();
    engine.ctx.currentTime = 0.1;
    engine._schedule();
    expect(new Set(play.mock.calls.map(call => call[1])).size).toBe(play.mock.calls.length);
  });
  it("空の譜面は再生状態や定期処理を残さない", () => {
    engine.playBGM({ name: "empty", tracks: [{ notes: [] }] });
    expect(engine.isPlayingBgm).toBe(false);
    expect(engine.schedulerTimer).toBeNull();
  });
  it("終止曲は最後で停止し、同じ画面の更新では再発火しない", () => {
    engine.playBGM(BGM_GAMEOVER);
    play.mockClear();
    engine.ctx.currentTime = 100;
    engine._schedule();
    expect(play).not.toHaveBeenCalled();
    expect(engine.isPlayingBgm).toBe(false);
    expect(engine.bgmCompleted).toBe(true);
    expect(engine.schedulerTimer).toBeNull();
    engine.playBGM(BGM_GAMEOVER);
    expect(play).not.toHaveBeenCalled();
    engine.playBGM(BGM_GAMEOVER, true);
    expect(play).toHaveBeenCalled();
  });
});
