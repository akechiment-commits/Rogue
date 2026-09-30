import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { soundEngine } from "../soundEngine.js";
import { BGM_DUNGEON_SHALLOW, BGM_DUNGEON_DEEP } from "../musicData.js";
describe("BGM停止と音源の寿命", () => {
  let engine, nodes;
  beforeEach(() => {
    vi.useFakeTimers();
    engine = new soundEngine.constructor();
    nodes = [];
    const param = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
    const node = () => {
      const value = { gain: param, frequency: param, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      nodes.push(value); return value;
    };
    engine.ctx = { currentTime: 0, createOscillator: node, createGain: node, createBufferSource: node, createBiquadFilter: node };
    engine.bgmGain = {};
    engine.noiseBuffer = {};
  });
  afterEach(() => { engine.stopBGM(); vi.useRealTimers(); });
  it("停止で予約済み音源を即座に停止し、接続とタイマーを片付ける", () => {
    engine.playBGM(BGM_DUNGEON_SHALLOW);
    const sources = [...engine.bgmSources];
    expect(sources.length).toBeGreaterThan(0);
    engine.stopBGM();
    for (const source of sources) {
      expect(source.stop).toHaveBeenLastCalledWith();
      expect(source.disconnect).toHaveBeenCalled();
    }
    expect(engine.bgmSources.size).toBe(0);
    expect(engine.schedulerTimer).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("曲変更で旧音源を残さず、新しい曲の再生を維持する", () => {
    engine.playBGM(BGM_DUNGEON_SHALLOW);
    const old = [...engine.bgmSources];
    engine.playBGM(BGM_DUNGEON_DEEP);
    expect(old.every(source => !engine.bgmSources.has(source))).toBe(true);
    expect(engine.currentBgmName).toBe("dungeon_deep");
    expect(vi.getTimerCount()).toBe(1);
  });
  it("自然に終了した音源も管理リストから除く", () => {
    engine.playBGM(BGM_DUNGEON_SHALLOW);
    const source = [...engine.bgmSources][0];
    source.onended();
    expect(engine.bgmSources.has(source)).toBe(false);
    expect(source.disconnect).toHaveBeenCalled();
  });
  it("音声APIを使えない環境ではタイマーを作らない", () => {
    const unsupported = new soundEngine.constructor();
    unsupported.playBGM(BGM_DUNGEON_SHALLOW);
    expect(unsupported.isPlayingBgm).toBe(false);
    expect(unsupported.schedulerTimer).toBeNull();
  });
});
