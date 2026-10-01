import { SOUND_EFFECTS } from "./soundEffectData.js";
import { MUSIC_INSTRUMENTS, synthesizeMusicNote } from "./musicInstruments.js";

/**
 * Web Audio API based Sound Engine for Roguelike Game.
 * Provides retro-style Chiptune synthesizer, BGM scheduler, and SE player.
 * Works seamlessly in modern browsers without external audio files.
 */

// Note name to semitone offset from C0
const NOTE_OFFSETS = {
  "C": 0, "C#": 1, "DB": 1,
  "D": 2, "D#": 3, "EB": 3,
  "E": 4,
  "F": 5, "F#": 6, "GB": 6,
  "G": 7, "G#": 8, "AB": 8,
  "A": 9, "A#": 10, "BB": 10,
  "B": 11,
};

/**
 * Convert note string (e.g. "C4", "F#3", "Bb5", "-") to frequency in Hz.
 * Returns 0 for rests ("-", "R", etc.) or invalid notes.
 */
export function noteToFreq(noteStr) {
  if (!noteStr || noteStr === "-" || noteStr.toUpperCase() === "R") return 0;
  const m = String(noteStr).trim().toUpperCase().match(/^([A-G][#B]?)(-?\d+)$/);
  if (!m) return 0;
  const noteName = m[1];
  const octave = parseInt(m[2], 10);
  const semitone = NOTE_OFFSETS[noteName];
  if (semitone === undefined) return 0;

  // MIDI number: C-1 is 0, C4 is 60, A4 is 69 (440Hz)
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 譜面の展開は実時間再生とOfflineAudioContextでの試聴書き出しで共通。 */
export function parseMusicScore(score) {
  return score.tracks.map(track => {
    const steps = [];
    for (const item of track.notes || []) {
      const note = Array.isArray(item) ? item[0] : item.note;
      const len = Array.isArray(item) ? item[1] : item.len;
      const velocity = Array.isArray(item) ? item[2] : item.velocity;
      if (!Number.isInteger(len) || len <= 0) continue;
      steps.push({ freq: noteToFreq(note), len, velocity: velocity ?? 1, isNoise: track.type === "noise" });
      for (let i = 1; i < len; i++) steps.push({ freq: 0, len: 0, hold: true });
    }
    return { ...track, type: track.type || "square", volume: track.volume ?? 0.2, steps };
  });
}

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.seGain = null;
    this.isUnlocked = false;

    // Volume settings (persisted in localStorage if available)
    this.bgmVolume = 0.4;
    this.seVolume = 0.5;
    this.isMuted = false;

    // BGM Scheduler state
    this.currentBgm = null;
    this.currentBgmName = null;
    this.isPlayingBgm = false;
    this.bgmCompleted = false;
    this.schedulerTimer = null;
    this.bgmSources = new Set();
    this.musicNoteBuffers = new Map();
    this.musicBufferBytes = 0;
    this.musicBufferLimit = 12 * 1024 * 1024;
    this.bgmRoom = null;
    this.seSources = new Set();
    this.maxSeSources = 64;
    this.seStartOffset = 0;
    this.nextNoteTime = 0;
    this.trackStepIndices = [];
    this.currentStep = 0;
    this.totalSteps = 0;

    // Noise buffer for drum / retro sound effects
    this.noiseBuffer = null;

    this._loadSettings();
  }

  _loadSettings() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      const savedBgm = localStorage.getItem("rogue_bgm_vol");
      const savedSe = localStorage.getItem("rogue_se_vol");
      const savedMute = localStorage.getItem("rogue_audio_mute");
      if (savedBgm?.trim() && Number.isFinite(Number(savedBgm))) this.bgmVolume = Math.max(0, Math.min(1, Number(savedBgm)));
      if (savedSe?.trim() && Number.isFinite(Number(savedSe))) this.seVolume = Math.max(0, Math.min(1, Number(savedSe)));
      if (savedMute !== null) this.isMuted = savedMute === "true";
    } catch {
      // Ignore storage errors
    }
  }

  _saveSettings() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      localStorage.setItem("rogue_bgm_vol", String(this.bgmVolume));
      localStorage.setItem("rogue_se_vol", String(this.seVolume));
      localStorage.setItem("rogue_audio_mute", String(this.isMuted));
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Initializes AudioContext and gain graph.
   * Safe to call multiple times.
   */
  init() {
    if (this.ctx) return;
    if (typeof window === "undefined") return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      this.ctx = new AudioContextClass();

      // Master gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // BGM gain
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      // SE gain
      this.seGain = this.ctx.createGain();
      this.seGain.gain.setValueAtTime(this.seVolume, this.ctx.currentTime);
      this.seGain.connect(this.masterGain);

      // Generate 2 seconds of white noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    } catch {
      this.ctx = null;
    }
  }

  /**
   * Unlock AudioContext on first user interaction (click, key, touch).
   */
  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(() => {
        this.isUnlocked = true;
      }).catch(() => {});
    } else {
      this.isUnlocked = true;
    }
  }

  setBgmVolume(vol) {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
    }
    this._saveSettings();
  }

  setSeVolume(vol) {
    this.seVolume = Math.max(0, Math.min(1, vol));
    if (this.seGain && this.ctx) {
      this.seGain.gain.setValueAtTime(this.seVolume, this.ctx.currentTime);
    }
    this._saveSettings();
  }

  setMuted(muted) {
    this.isMuted = !!muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
    }
    this._saveSettings();
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /* =====================================================================
   * SE (Sound Effect) Synthesizers
   * ===================================================================== */

  /**
   * Helper to create an envelope-controlled tone
   */
  _playTone({ freq = 440, type = "square", start = 0, duration = 0.1, gain = 0.3, pitchSlideTo = null, pitchSlideTime = null }) {
    if (!this.ctx || this.isMuted || this.seVolume <= 0) return;
    const now = this.ctx.currentTime + start + (this.seStartOffset || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (pitchSlideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, pitchSlideTo), now + Math.min(duration, pitchSlideTime ?? duration));
    }

    // 立ち上がり→響きの胴→余韻。音量を即座にゼロ近くへ落とさない。
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + Math.min(0.003, duration * 0.08));
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.24), now + duration * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(g);
    g.connect(this.seGain);
    this._trackSeSource(osc, [osc, g]);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /**
   * Helper to play filtered noise burst
   */
  _playNoise({ start = 0, duration = 0.1, gain = 0.4, filterFreq = 1000, filterType = "lowpass", filterSlideTo = null }) {
    if (!this.ctx || !this.noiseBuffer || this.isMuted || this.seVolume <= 0) return;
    const now = this.ctx.currentTime + start + (this.seStartOffset || 0);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    if (filterSlideTo !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterSlideTo), now + duration);
    }

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + Math.min(0.002, duration * 0.08));
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.12), now + duration * 0.62);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(g);
    g.connect(this.seGain);
    this._trackSeSource(noise, [noise, filter, g]);

    noise.start(now);
    noise.stop(now + duration + 0.05);
  }

  _trackSeSource(source, nodes) {
    if (this.seSources.size >= this.maxSeSources) {
      const oldest = this.seSources.values().next().value;
      try { oldest.stop(); } catch { /* 終了済み */ }
      oldest.onended?.();
    }
    this.seSources.add(source);
    source.onended = () => {
      this.seSources.delete(source);
      for (const node of nodes) node.disconnect?.();
    };
  }

  playSE(name, { delay = 0 } = {}) {
    const effect = SOUND_EFFECTS[name];
    if (!effect) return;
    if (!this.ctx) this.init();
    if (!this.ctx || this.isMuted || this.seVolume <= 0) return;
    if (this.ctx.state === "suspended") this.unlock();
    const previousOffset = this.seStartOffset || 0;
    this.seStartOffset = Math.max(0, Number(delay) || 0);
    try {
      for (const voice of effect.voices) {
        if (voice.kind === "noise") this._playNoise(voice);
        else this._playTone(voice);
      }
    } finally { this.seStartOffset = previousOffset; }
  }

  /* =====================================================================
   * BGM Scheduler & Synthesizer
   * ===================================================================== */

  /**
   * Starts playing a BGM score.
   * score: { name, tempo, tracks: [{ type, volume, notes: [{ note, len }] }] }
   */
  playBGM(score, forceRestart = false) {
    if (!score || !score.tracks || score.tracks.length === 0) {
      this.stopBGM();
      return;
    }

    if (!forceRestart && this.currentBgmName === score.name && (this.isPlayingBgm || this.bgmCompleted)) {
      return; // Already playing this track
    }

    this.init();
    this.stopBGM();
    if (!this.ctx) return;

    this.currentBgm = score;
    this.currentBgmName = score.name || "unnamed";
    this.isPlayingBgm = true;

    // Expand notes for each track into 16th-note steps
    // 1 step = 1/16 note = 60 / tempo / 4 seconds
    const tempo = Number(score.tempo);
    this.tempo = Number.isFinite(tempo) && tempo > 0 ? tempo : 120;
    this.secondsPerStep = (60 / this.tempo) / 4;

    this.parsedTracks = parseMusicScore(score);

    // Determine loop length (max steps across tracks)
    this.totalSteps = Math.max(...this.parsedTracks.map(t => t.steps.length));
    if (!(this.totalSteps > 0)) { this.stopBGM(); return; }
    this.currentStep = 0;
    this.nextNoteTime = this.ctx ? this.ctx.currentTime + 0.05 : 0;

    // Start scheduling loop
    this._schedule();
    if (this.isPlayingBgm) this.schedulerTimer = setInterval(() => this._schedule(), 50);
  }

  stopBGM() {
    this.isPlayingBgm = false;
    this.bgmCompleted = false;
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.currentBgm = null;
    this.currentBgmName = null;
    for (const source of [...this.bgmSources]) {
      try { source.stop(); } catch { /* 終了済み音源 */ }
      source.onended?.();
    }
    if (this.bgmRoom) {
      for (const node of this.bgmRoom.nodes) node.disconnect?.();
      this.bgmRoom = null;
    }
  }

  _trackBgmSource(source, nodes) {
    this.bgmSources.add(source);
    source.onended = () => {
      this.bgmSources.delete(source);
      for (const node of nodes) node.disconnect?.();
    };
  }

  _schedule() {
    if (!this.isPlayingBgm || !this.ctx || !this.parsedTracks || !(this.totalSteps > 0)) return;

    // Schedule notes ahead by 0.2 seconds (lookahead)
    const scheduleAheadTime = 0.2;
    const now = this.ctx.currentTime;
    // ブラウザ休止などで遅れた音は捨て、曲中の位置だけ進める。
    if (this.nextNoteTime < now) {
      const skipped = Math.ceil((now - this.nextNoteTime) / this.secondsPerStep);
      this.currentStep = this.currentBgm?.loop === false
        ? this.currentStep + skipped : (this.currentStep + skipped) % this.totalSteps;
      this.nextNoteTime = Math.max(now, this.nextNoteTime + skipped * this.secondsPerStep);
    }
    let scheduled = 0;
    while (this.nextNoteTime < now + scheduleAheadTime && scheduled < 64) {
      if (this.currentBgm?.loop === false && this.currentStep >= this.totalSteps) {
        this.isPlayingBgm = false;
        this.bgmCompleted = true;
        clearInterval(this.schedulerTimer);
        this.schedulerTimer = null;
        break;
      }
      this._playStepAt(this.currentStep, this.nextNoteTime);
      this.nextNoteTime += this.secondsPerStep;
      this.currentStep = this.currentBgm?.loop === false
        ? this.currentStep + 1 : (this.currentStep + 1) % this.totalSteps;
      scheduled++;
    }
  }

  _connectBgmVoice(source, gain, track, time, filter = null) {
    const nodes = [source, gain];
    if (!filter && track.cutoff && typeof this.ctx.createBiquadFilter === "function") {
      filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(track.cutoff, time);
    }
    if (filter) { source.connect(filter); filter.connect(gain); nodes.push(filter); }
    else source.connect(gain);
    let output = gain;
    if (track.pan && typeof this.ctx.createStereoPanner === "function") {
      const pan = this.ctx.createStereoPanner();
      pan.pan.setValueAtTime(track.pan, time);
      gain.connect(pan); output = pan; nodes.push(pan);
    }
    output.connect(this.bgmGain);
    if (track.roomSend > 0) {
      const room = this._ensureBgmRoom();
      if (room) {
        const send = this.ctx.createGain();
        send.gain.setValueAtTime(track.roomSend, time);
        output.connect(send); send.connect(room.input); nodes.push(send);
      }
    }
    this._trackBgmSource(source, nodes);
  }

  _ensureBgmRoom() {
    if (this.bgmRoom) return this.bgmRoom;
    if (typeof this.ctx.createConvolver !== "function") return null;
    const filter = this.ctx.createBiquadFilter(), convolver = this.ctx.createConvolver(), wet = this.ctx.createGain();
    filter.type = "lowpass"; filter.frequency.value = 2800;
    wet.gain.value = 0.32;
    const impulse = this.ctx.createBuffer(2, Math.ceil(this.ctx.sampleRate * 1.35), this.ctx.sampleRate);
    let seed = 98765;
    for (let channel = 0; channel < 2; channel++) {
      const pcm = impulse.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < pcm.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        smooth = smooth * 0.65 + (seed / 2147483648 - 1) * 0.35;
        const t = i / this.ctx.sampleRate;
        pcm[i] = t < 0.025 ? 0 : smooth * Math.exp(-(t - 0.025) * 5.5);
      }
    }
    convolver.buffer = impulse;
    filter.connect(convolver); convolver.connect(wet); wet.connect(this.bgmGain);
    this.bgmRoom = { input: filter, nodes: [filter, convolver, wet] };
    return this.bgmRoom;
  }

  _playMusicInstrument(track, step, time, duration, volume) {
    const key = `${this.ctx.sampleRate}:${track.instrument}:${step.freq}:${duration}`;
    let buffer = this.musicNoteBuffers.get(key);
    if (!buffer) {
      const pcm = synthesizeMusicNote(track.instrument, step.freq, duration, this.ctx.sampleRate);
      buffer = this.ctx.createBuffer(1, pcm.length, this.ctx.sampleRate);
      buffer.getChannelData(0).set(pcm);
      if (pcm.byteLength <= this.musicBufferLimit) {
        while (this.musicNoteBuffers.size && (this.musicBufferBytes + pcm.byteLength > this.musicBufferLimit || this.musicNoteBuffers.size >= 128)) {
          const oldest = this.musicNoteBuffers.keys().next().value;
          this.musicBufferBytes -= this.musicNoteBuffers.get(oldest).length * 4;
          this.musicNoteBuffers.delete(oldest);
        }
        this.musicNoteBuffers.set(key, buffer);
        this.musicBufferBytes += pcm.byteLength;
      }
    }
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, time);
    this._connectBgmVoice(source, gain, track, time);
    source.start(time); source.stop(time + buffer.duration);
  }

  _playStepAt(stepIndex, time) {
    if (this.isMuted || this.bgmVolume <= 0) return;

    for (const tr of this.parsedTracks) {
      const step = tr.steps[stepIndex % tr.steps.length];
      if (!step || step.hold) continue;

      const dur = Math.max(0.025, step.len * this.secondsPerStep * (tr.gate ?? 0.85));
      const gainVal = tr.volume * (step.velocity ?? 1);
      if (gainVal <= 0) continue;

      if (step.isNoise) {
        if (step.freq > 0 && this.noiseBuffer) {
          // Noise drum: snare/hi-hat
          const noise = this.ctx.createBufferSource();
          noise.buffer = this.noiseBuffer;

          const filter = this.ctx.createBiquadFilter();
          // High pitch freq = hihat, lower = snare
          filter.type = step.freq > 200 ? "highpass" : "bandpass";
          filter.frequency.setValueAtTime(step.freq > 200 ? 5000 : 1200, time);

          const g = this.ctx.createGain();
          const drumDur = step.freq > 900 ? 0.17 : step.freq > 200 ? 0.035 : 0.12;
          g.gain.setValueAtTime(0.0001, time);
          g.gain.linearRampToValueAtTime(gainVal, time + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, time + drumDur);
          this._connectBgmVoice(noise, g, tr, time, filter);

          noise.start(time);
          noise.stop(time + drumDur + 0.03);
        }
      } else if (step.freq > 0) {
        if (MUSIC_INSTRUMENTS[tr.instrument]) {
          this._playMusicInstrument(tr, step, time, dur, gainVal);
          continue;
        }
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();

        osc.type = tr.type;
        const kick = tr.instrument === "kick";
        const toneDur = kick ? 0.16 : dur;
        osc.frequency.setValueAtTime(kick ? 135 : step.freq, time);
        if (kick) osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);

        // Envelope: soft attack, decay
        g.gain.setValueAtTime(0.0001, time);
        const attack = Math.min(tr.attack ?? 0.005, toneDur * 0.15);
        g.gain.linearRampToValueAtTime(gainVal, time + attack);
        if (kick) g.gain.exponentialRampToValueAtTime(0.0001, time + toneDur);
        else {
          const decay = Math.min(tr.decay ?? 0.05, toneDur * 0.3);
          const release = Math.min(tr.release ?? 0.04, toneDur * 0.25);
          const sustain = Math.max(0.0001, gainVal * (tr.sustain ?? 0.65));
          g.gain.exponentialRampToValueAtTime(sustain, time + attack + decay);
          g.gain.setValueAtTime(sustain, time + Math.max(attack + decay, toneDur - release));
          g.gain.exponentialRampToValueAtTime(0.0001, time + toneDur);
        }
        this._connectBgmVoice(osc, g, tr, time);

        osc.start(time);
        osc.stop(time + toneDur + 0.03);
      }
    }
  }
}

// Global singleton instance
export const soundEngine = new SoundEngine();
