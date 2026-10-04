/** 外部サンプルを使わない、旋律楽器と打楽器の音源。 */
export const MUSIC_INSTRUMENTS = {
  feltPiano: { attack: 0.004, release: 0.36, partials: [1, 0.24, 0.095, 0.035, 0.012] },
  woodFlute: { attack: 0.06, release: 0.2, partials: [1, 0.12, 0.035, 0.015] },
  softStrings: { attack: 0.19, release: 0.38, partials: [1, 0.27, 0.13, 0.065, 0.035, 0.015] },
  roundBass: { attack: 0.024, release: 0.14, partials: [1, 0.16, 0.035] },
  accordion: { attack: 0.024, release: 0.14, partials: [1, 0.65, 0.42, 0.28, 0.18, 0.12] },
  marimba: { attack: 0.001, release: 0.16, partials: [1, 0.22, 0.05, 0.02] },
  pizzicato: { attack: 0.001, release: 0.22, partials: [1, 0.42, 0.18, 0.08] },
  steelGuitar: { attack: 0.002, release: 0.24, partials: [1, 0.55, 0.32, 0.18, 0.09, 0.04] },
  slapBass: { attack: 0.002, release: 0.10, partials: [1, 0.48, 0.22, 0.08, 0.03] },
  drumKick: { kind: 'percussion', duration: 0.36 },
  drumSnare: { kind: 'percussion', duration: 0.25 },
  drumHat: { kind: 'percussion', duration: 0.085 },
  drumOpenHat: { kind: 'percussion', duration: 0.25 },
};

function synthesizePercussion(instrument, sampleRate) {
  const duration = MUSIC_INSTRUMENTS[instrument].duration;
  const pcm = new Float32Array(Math.ceil(duration * sampleRate));
  const lowCoefficient = 1 - Math.exp(-2 * Math.PI * 700 / sampleRate);
  const highCoefficient = 1 - Math.exp(-2 * Math.PI * 3500 / sampleRate);
  let seed = 75319, low = 0, high = 0;
  for (let frame = 0; frame < pcm.length; frame++) {
    const t = frame / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += (noise - low) * lowCoefficient;
    high += (noise - high) * highCoefficient;
    let value;
    if (instrument === 'drumKick') {
      const phase = 2 * Math.PI * (48 * t + 92 * 0.028 * (1 - Math.exp(-t / 0.028)));
      value = Math.sin(phase) * Math.exp(-t * 13) + (noise - high) * 0.08 * Math.exp(-t * 160);
    } else if (instrument === 'drumSnare') {
      const body = Math.sin(2 * Math.PI * 185 * t) * 0.32 + Math.sin(2 * Math.PI * 330 * t) * 0.11;
      value = (high - low) * 1.15 * Math.exp(-t * 16) + body * Math.exp(-t * 30);
    } else {
      const metal = Math.sin(2 * Math.PI * 4310 * t) * Math.sin(2 * Math.PI * 1730 * t) * 0.12;
      value = ((noise - high) * 0.68 + metal) * Math.exp(-t * (instrument === 'drumOpenHat' ? 15 : 48));
    }
    const attack = Math.min(1, t / 0.0015);
    const release = Math.min(1, (duration - t) / 0.015) ** 2;
    pcm[frame] = Math.tanh(value * 1.15) * 0.85 * attack * release;
  }
  return pcm;
}

export function synthesizeMusicNote(instrument, frequency, heldSeconds, sampleRate) {
  const profile = MUSIC_INSTRUMENTS[instrument];
  if (!profile || !(frequency > 0) || !(heldSeconds > 0) || !(sampleRate > 0)) return new Float32Array();
  if (profile.kind === 'percussion') return synthesizePercussion(instrument, sampleRate);
  const piano = instrument === 'feltPiano', flute = instrument === 'woodFlute', strings = instrument === 'softStrings';
  const accordion = instrument === 'accordion', marimba = instrument === 'marimba', pizzicato = instrument === 'pizzicato';
  const attack = Math.min(profile.attack, heldSeconds * 0.25);
  const duration = heldSeconds + profile.release;
  const pcm = new Float32Array(Math.ceil(duration * sampleRate));
  // ナイキスト近くの倍音を生成しない。和音を重ねても耳に痛い折り返し音を出さない。
  const partials = profile.partials.map((amplitude, i) => ({
    amplitude, ratio: piano ? (i + 1) * Math.sqrt(1 + 0.00013 * i * i) : i + 1,
    decay: piano ? 2.6 / (1 + i * 0.95)
      : marimba ? 0.12 / (1 + i * 0.8)
      : pizzicato ? 0.20 / (1 + i * 0.7)
      : instrument === 'steelGuitar' ? 0.35 / (1 + i * 0.7)
      : instrument === 'slapBass' ? 0.18 / (1 + i * 0.85)
      : Infinity,
  })).filter(partial => partial.ratio * frequency < sampleRate * 0.43);
  const scale = 0.8 / profile.partials.reduce((sum, amplitude) => sum + amplitude, 0);
  let seed = 131071;
  for (let frame = 0; frame < pcm.length; frame++) {
    const t = frame / sampleRate;
    const rise = Math.sin(Math.min(1, t / attack) * Math.PI * 0.5) ** 2;
    const release = t <= heldSeconds ? 1 : Math.cos(Math.min(1, (t - heldSeconds) / profile.release) * Math.PI * 0.5) ** 2;
    const vibrato = (flute || strings || accordion) ? 0.035 * Math.sin(2 * Math.PI * (accordion ? 6.2 : 5.1) * t) * Math.min(1, Math.max(0, t - 0.15) * 3) : 0;
    let value = 0;
    for (const partial of partials) {
      const phase = 2 * Math.PI * frequency * partial.ratio * t;
      let carrier;
      if (strings) {
        carrier = (Math.sin(phase + vibrato) + 0.38 * Math.sin(phase * 1.0018 + 0.7) + 0.38 * Math.sin(phase * 0.9982 - 0.7)) / 1.76;
      } else if (accordion) {
        carrier = (Math.sin(phase + vibrato) + 0.55 * Math.sin(phase * 1.0024 + 0.4) + 0.35 * Math.sin(phase * 0.9976 - 0.4)) / 1.65;
      } else {
        carrier = Math.sin(phase + vibrato);
      }
      value += carrier * partial.amplitude * Math.exp(-t / partial.decay);
    }
    if (flute) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      value += (seed / 2147483648 - 1) * 0.009;
    }
    pcm[frame] = value * scale * rise * release;
  }
  return pcm;
}
