import { describe, expect, it, vi } from "vitest";
import { soundEngine } from "../soundEngine.js";

function fixture() {
  const engine = new soundEngine.constructor(), nodes = [];
  const node = () => {
    const param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    const result = { gain: param, frequency: param, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    nodes.push(result); return result;
  };
  engine.ctx = { currentTime: 10, state: "running", createOscillator: node, createGain: node, createBufferSource: node, createBiquadFilter: node };
  engine.noiseBuffer = {}; engine.seGain = {};
  return { engine, nodes };
}

describe("SEの予約と音源の寿命", () => {
  it("同じ行動の後続音を指定時間へ予約し、次のSEに遅延を持ち越さない", () => {
    const { engine } = fixture();
    engine.playSE("cursor", { delay: 0.2 });
    const first = [...engine.seSources][0];
    expect(first.start).toHaveBeenCalledWith(10.2);
    engine.playSE("cursor");
    const next = [...engine.seSources][1];
    expect(next.start).toHaveBeenCalledWith(10);
    first.onended();
    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(engine.seSources.has(first)).toBe(false);
  });
  it("大量発音でも音源数が上限を超えず、古い接続を片付ける", () => {
    const { engine } = fixture();
    engine.playSE("cursor");
    const first = [...engine.seSources][0];
    for (let i = 0; i < 100; i++) engine.playSE("cursor");
    expect(engine.seSources.size).toBe(64);
    expect(first.disconnect).toHaveBeenCalledOnce();
  });
});
