import { describe, it, expect } from 'vitest';
import { noteToFreq } from '../soundEngine.js';
import {
  ALL_BGM_TRACKS,
  ALL_SE_LIST,
  BGM_DUNGEON_SHALLOW,
  BGM_DUNGEON_DEEP,
  BGM_MONSTER_HOUSE,
  BGM_SHOP,
  BGM_BOSS,
  BGM_GAMEOVER,
  BGM_GAMECLEAR,
} from '../musicData.js';

describe('SoundEngine / noteToFreq', () => {
  it('correctly calculates note frequencies', () => {
    // A4 = 440Hz
    expect(noteToFreq('A4')).toBeCloseTo(440, 1);
    // A3 = 220Hz
    expect(noteToFreq('A3')).toBeCloseTo(220, 1);
    // A5 = 880Hz
    expect(noteToFreq('A5')).toBeCloseTo(880, 1);
    // C4 = ~261.63Hz
    expect(noteToFreq('C4')).toBeCloseTo(261.63, 1);
    // Rest or invalid note returns 0
    expect(noteToFreq('-')).toBe(0);
    expect(noteToFreq('R')).toBe(0);
    expect(noteToFreq('')).toBe(0);
    expect(noteToFreq(null)).toBe(0);
  });

  it('supports accidentals (# and b)', () => {
    // C#4 == Db4
    expect(noteToFreq('C#4')).toBeCloseTo(noteToFreq('Db4'), 1);
    // F#4 == Gb4
    expect(noteToFreq('F#4')).toBeCloseTo(noteToFreq('Gb4'), 1);
  });
});

describe('musicData tracks verification', () => {
  it('all BGM tracks have valid structure and tempo', () => {
    expect(ALL_BGM_TRACKS.length).toBe(7);

    for (const bgm of ALL_BGM_TRACKS) {
      expect(bgm.name).toBeTruthy();
      expect(bgm.title).toBeTruthy();
      expect(bgm.tempo).toBeGreaterThan(40);
      expect(bgm.tempo).toBeLessThan(250);
      expect(bgm.tracks.length).toBeGreaterThan(0);

      for (const track of bgm.tracks) {
        expect(['square', 'triangle', 'sawtooth', 'noise', 'sine']).toContain(track.type);
        expect(track.notes.length).toBeGreaterThan(0);

        for (const noteItem of track.notes) {
          const note = Array.isArray(noteItem) ? noteItem[0] : noteItem.note;
          const len = Array.isArray(noteItem) ? noteItem[1] : noteItem.len;
          expect(typeof note).toBe('string');
          expect(typeof len).toBe('number');
          expect(len).toBeGreaterThan(0);
          if (track.type !== 'noise') {
            if (note !== '-') {
              expect(noteToFreq(note)).toBeGreaterThan(20);
            }
          }
        }
      }
    }
  });

  it('all required BGM themes exist', () => {
    expect(BGM_DUNGEON_SHALLOW.name).toBe('dungeon_shallow');
    expect(BGM_DUNGEON_DEEP.name).toBe('dungeon_deep');
    expect(BGM_MONSTER_HOUSE.name).toBe('monster_house');
    expect(BGM_SHOP.name).toBe('shop');
    expect(BGM_BOSS.name).toBe('boss');
    expect(BGM_GAMEOVER.name).toBe('gameover');
    expect(BGM_GAMECLEAR.name).toBe('gameclear');
  });

  it('all SE IDs are defined and properly described', () => {
    expect(ALL_SE_LIST.length).toBeGreaterThanOrEqual(15);
    const seIds = ALL_SE_LIST.map(s => s.id);
    expect(seIds).toContain('hit');
    expect(seIds).toContain('crit');
    expect(seIds).toContain('miss');
    expect(seIds).toContain('playerDamage');
    expect(seIds).toContain('defeat');
    expect(seIds).toContain('levelUp');
    expect(seIds).toContain('stairs');
    expect(seIds).toContain('pickup');
    expect(seIds).toContain('useItem');
    expect(seIds).toContain('eat');
    expect(seIds).toContain('throw');
    expect(seIds).toContain('shatter');
    expect(seIds).toContain('trap');
    expect(seIds).toContain('magic');
    expect(seIds).toContain('gold');
    expect(seIds).toContain('cursor');
    expect(seIds).toContain('select');
    expect(seIds).toContain('cancel');
  });
});
