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
    this.schedulerTimer = null;
    this.bgmSources = new Set();
    this.nextNoteTime = 0;
    this.trackStepIndices = [];
    this.currentStep = 0;
    this.totalSteps = 0;

    // Noise buffer for drum / retro sound effects
    this.noiseBuffer = null;

    this._loadSettings();
  }

  _loadSettings() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const savedBgm = localStorage.getItem("rogue_bgm_vol");
      const savedSe = localStorage.getItem("rogue_se_vol");
      const savedMute = localStorage.getItem("rogue_audio_mute");
      if (savedBgm !== null) this.bgmVolume = Math.max(0, Math.min(1, parseFloat(savedBgm)));
      if (savedSe !== null) this.seVolume = Math.max(0, Math.min(1, parseFloat(savedSe)));
      if (savedMute !== null) this.isMuted = savedMute === "true";
    } catch {
      // Ignore storage errors
    }
  }

  _saveSettings() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
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
  _playTone({ freq = 440, type = "square", start = 0, duration = 0.1, gain = 0.3, pitchSlideTo = null }) {
    if (!this.ctx || this.isMuted || this.seVolume <= 0) return;
    const now = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (pitchSlideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, pitchSlideTo), now + duration);
    }

    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(g);
    g.connect(this.seGain);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /**
   * Helper to play filtered noise burst
   */
  _playNoise({ start = 0, duration = 0.1, gain = 0.4, filterFreq = 1000, filterType = "lowpass", filterSlideTo = null }) {
    if (!this.ctx || !this.noiseBuffer || this.isMuted || this.seVolume <= 0) return;
    const now = this.ctx.currentTime + start;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    if (filterSlideTo !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterSlideTo), now + duration);
    }

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(g);
    g.connect(this.seGain);

    noise.start(now);
    noise.stop(now + duration + 0.05);
  }

  playSE(name) {
    if (!this.ctx) this.init();
    if (!this.ctx || this.isMuted || this.seVolume <= 0) return;
    if (this.ctx.state === "suspended") this.unlock();

    switch (name) {
      case "hit": // Player attacks enemy (punch/slash)
        this._playTone({ freq: 220, type: "square", duration: 0.08, gain: 0.25, pitchSlideTo: 60 });
        this._playNoise({ duration: 0.08, gain: 0.35, filterFreq: 1200, filterSlideTo: 200 });
        break;

      case "crit": // Critical hit / powerful strike
        this._playTone({ freq: 440, type: "sawtooth", duration: 0.15, gain: 0.3, pitchSlideTo: 80 });
        this._playTone({ freq: 880, type: "square", start: 0.02, duration: 0.12, gain: 0.2, pitchSlideTo: 110 });
        this._playNoise({ duration: 0.2, gain: 0.5, filterFreq: 2500, filterSlideTo: 100 });
        break;

      case "miss": // Attack missed (swing air)
        this._playTone({ freq: 350, type: "sine", duration: 0.1, gain: 0.15, pitchSlideTo: 120 });
        break;

      case "playerDamage": // Player takes damage
        this._playTone({ freq: 160, type: "triangle", duration: 0.12, gain: 0.35, pitchSlideTo: 40 });
        this._playNoise({ duration: 0.14, gain: 0.4, filterFreq: 800, filterSlideTo: 100 });
        break;

      case "defeat": // Monster defeated
        this._playTone({ freq: 300, type: "sawtooth", duration: 0.18, gain: 0.25, pitchSlideTo: 50 });
        this._playNoise({ start: 0.04, duration: 0.2, gain: 0.35, filterFreq: 1500, filterSlideTo: 150 });
        break;

      case "levelUp": // Level up fanfare (retro arpeggio C4 - E4 - G4 - C5)
        [
          { f: 261.6, t: 0.00 }, // C4
          { f: 329.6, t: 0.08 }, // E4
          { f: 392.0, t: 0.16 }, // G4
          { f: 523.3, t: 0.24 }, // C5
          { f: 659.3, t: 0.34 }, // E5
        ].forEach(n => {
          this._playTone({ freq: n.f, type: "square", start: n.t, duration: 0.18, gain: 0.22 });
        });
        break;

      case "stairs": // Descend stairs (descending notes)
        [
          { f: 400, t: 0.00 },
          { f: 320, t: 0.09 },
          { f: 240, t: 0.18 },
          { f: 160, t: 0.27 },
        ].forEach(n => {
          this._playTone({ freq: n.f, type: "square", start: n.t, duration: 0.12, gain: 0.18 });
        });
        break;

      case "pickup": // Pick up item
        this._playTone({ freq: 440, type: "square", duration: 0.06, gain: 0.18 });
        this._playTone({ freq: 880, type: "square", start: 0.05, duration: 0.09, gain: 0.22 });
        break;

      case "useItem": // Drink potion / read scroll
        this._playTone({ freq: 523.3, type: "triangle", duration: 0.12, gain: 0.25, pitchSlideTo: 784 });
        this._playTone({ freq: 784.0, type: "sine", start: 0.08, duration: 0.16, gain: 0.25, pitchSlideTo: 1046.5 });
        break;

      case "eat": // Eat food
        this._playTone({ freq: 220, type: "triangle", duration: 0.08, gain: 0.25, pitchSlideTo: 330 });
        this._playTone({ freq: 260, type: "triangle", start: 0.09, duration: 0.1, gain: 0.25, pitchSlideTo: 390 });
        break;

      case "throw": // Throw item
        this._playTone({ freq: 280, type: "sine", duration: 0.12, gain: 0.2, pitchSlideTo: 600 });
        this._playNoise({ duration: 0.1, gain: 0.15, filterFreq: 1500, filterSlideTo: 500 });
        break;

      case "shatter": // Pot breaks / glass shatters
        this._playNoise({ duration: 0.25, gain: 0.45, filterFreq: 4000, filterSlideTo: 300 });
        this._playTone({ freq: 600, type: "square", duration: 0.1, gain: 0.18, pitchSlideTo: 150 });
        break;

      case "trap": // Trap sprung
        this._playTone({ freq: 800, type: "sawtooth", duration: 0.05, gain: 0.25, pitchSlideTo: 100 });
        this._playNoise({ start: 0.04, duration: 0.2, gain: 0.4, filterFreq: 1000, filterSlideTo: 120 });
        break;

      case "magic": // Wand fired / magic cast
        this._playTone({ freq: 440, type: "sawtooth", duration: 0.18, gain: 0.2, pitchSlideTo: 1200 });
        this._playTone({ freq: 880, type: "sine", start: 0.06, duration: 0.18, gain: 0.25, pitchSlideTo: 1500 });
        break;

      case "gold": // Coin picked up (chime)
        this._playTone({ freq: 1318.5, type: "square", duration: 0.08, gain: 0.2 }); // E6
        this._playTone({ freq: 1975.5, type: "square", start: 0.06, duration: 0.18, gain: 0.25 }); // B6
        break;

      case "cursor": // Menu move cursor
        this._playTone({ freq: 600, type: "square", duration: 0.03, gain: 0.1 });
        break;

      case "select": // Menu confirm
        this._playTone({ freq: 440, type: "square", duration: 0.05, gain: 0.15 });
        this._playTone({ freq: 659.3, type: "square", start: 0.04, duration: 0.08, gain: 0.18 });
        break;

      case "cancel": // Menu cancel / back
        this._playTone({ freq: 350, type: "square", duration: 0.05, gain: 0.15 });
        this._playTone({ freq: 260, type: "square", start: 0.04, duration: 0.08, gain: 0.15 });
        break;

      case "alert": // Danger / hunger warning
        this._playTone({ freq: 880, type: "square", duration: 0.08, gain: 0.25 });
        this._playTone({ freq: 880, type: "square", start: 0.12, duration: 0.08, gain: 0.25 });
        break;

      default:
        break;
    }
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

    if (!forceRestart && this.currentBgmName === score.name && this.isPlayingBgm) {
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

    this.parsedTracks = score.tracks.map(tr => {
      const steps = [];
      for (const item of tr.notes) {
        // item: [noteName, lengthInSteps] or { note, len }
        const note = Array.isArray(item) ? item[0] : item.note;
        const len = Array.isArray(item) ? item[1] : item.len;
        const freq = noteToFreq(note);
        steps.push({ freq, len, isNoise: tr.type === "noise" });
        // Fill remaining steps with continuation / rest
        for (let i = 1; i < len; i++) {
          steps.push({ freq: 0, len: 0, hold: true });
        }
      }
      return {
        type: tr.type || "square",
        volume: tr.volume !== undefined ? tr.volume : 0.2,
        steps,
      };
    });

    // Determine loop length (max steps across tracks)
    this.totalSteps = Math.max(...this.parsedTracks.map(t => t.steps.length));
    if (!(this.totalSteps > 0)) { this.stopBGM(); return; }
    this.currentStep = 0;
    this.nextNoteTime = this.ctx ? this.ctx.currentTime + 0.05 : 0;

    // Start scheduling loop
    this._schedule();
    this.schedulerTimer = setInterval(() => this._schedule(), 50);
  }

  stopBGM() {
    this.isPlayingBgm = false;
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
      this.currentStep = (this.currentStep + skipped) % this.totalSteps;
      this.nextNoteTime = Math.max(now, this.nextNoteTime + skipped * this.secondsPerStep);
    }
    let scheduled = 0;
    while (this.nextNoteTime < now + scheduleAheadTime && scheduled < 64) {
      this._playStepAt(this.currentStep, this.nextNoteTime);
      this.nextNoteTime += this.secondsPerStep;
      this.currentStep = (this.currentStep + 1) % this.totalSteps;
      scheduled++;
    }
  }

  _playStepAt(stepIndex, time) {
    if (this.isMuted || this.bgmVolume <= 0) return;

    for (const tr of this.parsedTracks) {
      const step = tr.steps[stepIndex % tr.steps.length];
      if (!step || step.hold) continue;

      const dur = Math.max(0.04, step.len * this.secondsPerStep * 0.9); // Staccato articulation
      const gainVal = tr.volume;

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
          g.gain.setValueAtTime(gainVal, time);
          g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

          noise.connect(filter);
          filter.connect(g);
          g.connect(this.bgmGain);

          this._trackBgmSource(noise, [noise, filter, g]);

          noise.start(time);
          noise.stop(time + dur + 0.05);
        }
      } else if (step.freq > 0) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();

        osc.type = tr.type;
        osc.frequency.setValueAtTime(step.freq, time);

        // Envelope: soft attack, decay
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(gainVal, time + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

        osc.connect(g);
        g.connect(this.bgmGain);

        this._trackBgmSource(osc, [osc, g]);

        osc.start(time);
        osc.stop(time + dur + 0.05);
      }
    }
  }
}

// Global singleton instance
export const soundEngine = new SoundEngine();
