import { describe, expect, it, vi } from 'vitest';
import { MUSIC_INSTRUMENTS, synthesizeMusicNote } from '../musicInstruments.js';
import { soundEngine } from '../soundEngine.js';

describe('探索曲の柔らかい楽器音', () => {
  it.each(Object.keys(MUSIC_INSTRUMENTS))('%sは音割れせず、発音終了後にも滑らかな余韻を持つ', instrument => {
    const rate = 16000, held = 0.4;
    const pcm = synthesizeMusicNote(instrument, 440, held, rate);
    let peak = 0, tailEnergy = 0;
    for (let i = 0; i < pcm.length; i++) {
      expect(Number.isFinite(pcm[i])).toBe(true);
      peak = Math.max(peak, Math.abs(pcm[i]));
      if (i >= held * rate && i < (held + 0.05) * rate) tailEnergy += pcm[i] ** 2;
    }
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(0.9);
    expect(tailEnergy).toBeGreaterThan(1);
    expect(Math.abs(pcm[0])).toBe(0);
    expect(Math.abs(pcm.at(-1))).toBeLessThan(0.000001);
  });
  it('高音と無効な発音でも有限なサンプルだけを生成する', () => {
    for (const instrument of Object.keys(MUSIC_INSTRUMENTS)) {
      expect([...synthesizeMusicNote(instrument, 6500, 0.05, 16000)].every(Number.isFinite)).toBe(true);
    }
    expect(synthesizeMusicNote('unknown', 440, 1, 16000)).toHaveLength(0);
    expect(synthesizeMusicNote('woodFlute', 0, 1, 16000)).toHaveLength(0);
  });
});

function fixture() {
  const engine = new soundEngine.constructor(), nodes = [];
  const node = () => {
    const value = { gain: { setValueAtTime: vi.fn() }, frequency: {}, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    nodes.push(value); return value;
  };
  engine.ctx = { sampleRate: 8000, currentTime: 0, createBufferSource: node, createGain: node,
    createBiquadFilter: node, createConvolver: node,
    createBuffer: (channels, length, rate) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, duration: length / rate, getChannelData: channel => data[channel] };
    },
  };
  engine.bgmGain = node();
  return { engine, nodes };
}

describe('楽器音の接続とキャッシュ', () => {
  it('同じ音を再利用し、サイズ上限を超えた古い音だけを解放する', () => {
    const { engine } = fixture();
    engine.musicBufferLimit = 16000;
    const track = { instrument: 'feltPiano' };
    engine._playMusicInstrument(track, { freq: 440 }, 0, 0.1, 0.1);
    const first = [...engine.bgmSources][0].buffer;
    engine._playMusicInstrument(track, { freq: 440 }, 1, 0.1, 0.1);
    expect([...engine.bgmSources][1].buffer).toBe(first);
    engine._playMusicInstrument(track, { freq: 660 }, 2, 0.1, 0.1);
    expect(engine.musicNoteBuffers.size).toBe(1);
    expect(engine.musicBufferBytes).toBeLessThanOrEqual(engine.musicBufferLimit);
    engine.stopBGM();
    expect(engine.bgmSources.size).toBe(0);
  });
  it('曲を止めたときに共有の残響も切断し、次の曲へ響きを持ち越さない', () => {
    const { engine } = fixture();
    const room = engine._ensureBgmRoom();
    expect(engine._ensureBgmRoom()).toBe(room);
    engine.stopBGM();
    expect(engine.bgmRoom).toBeNull();
    for (const node of room.nodes) expect(node.disconnect).toHaveBeenCalledOnce();
    expect(engine._ensureBgmRoom()).not.toBe(room);
  });
});
