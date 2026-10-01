/** 外部サンプルを使わない、柔らかい探索曲用の楽器音。 */
export const MUSIC_INSTRUMENTS = {
  feltPiano: { attack: 0.004, release: 0.36, partials: [1, 0.24, 0.095, 0.035, 0.012] },
  woodFlute: { attack: 0.06, release: 0.2, partials: [1, 0.12, 0.035, 0.015] },
  softStrings: { attack: 0.19, release: 0.38, partials: [1, 0.27, 0.13, 0.065, 0.035, 0.015] },
  roundBass: { attack: 0.024, release: 0.14, partials: [1, 0.16, 0.035] },
};

export function synthesizeMusicNote(instrument, frequency, heldSeconds, sampleRate) {
  const profile = MUSIC_INSTRUMENTS[instrument];
  if (!profile || !(frequency > 0) || !(heldSeconds > 0) || !(sampleRate > 0)) return new Float32Array();
  const piano = instrument === 'feltPiano', flute = instrument === 'woodFlute', strings = instrument === 'softStrings';
  const attack = Math.min(profile.attack, heldSeconds * 0.25);
  const duration = heldSeconds + profile.release;
  const pcm = new Float32Array(Math.ceil(duration * sampleRate));
  // ナイキスト近くの倍音を生成しない。和音を重ねても耳に痛い折り返し音を出さない。
  const partials = profile.partials.map((amplitude, i) => ({
    amplitude, ratio: piano ? (i + 1) * Math.sqrt(1 + 0.00013 * i * i) : i + 1,
    decay: piano ? 2.6 / (1 + i * 0.95) : Infinity,
  })).filter(partial => partial.ratio * frequency < sampleRate * 0.43);
  const scale = 0.8 / profile.partials.reduce((sum, amplitude) => sum + amplitude, 0);
  let seed = 131071;
  for (let frame = 0; frame < pcm.length; frame++) {
    const t = frame / sampleRate;
    const rise = Math.sin(Math.min(1, t / attack) * Math.PI * 0.5) ** 2;
    const release = t <= heldSeconds ? 1 : Math.cos(Math.min(1, (t - heldSeconds) / profile.release) * Math.PI * 0.5) ** 2;
    const vibrato = (flute || strings) ? 0.045 * Math.sin(2 * Math.PI * 5.1 * t) * Math.min(1, Math.max(0, t - 0.2) * 3) : 0;
    let value = 0;
    for (const partial of partials) {
      const phase = 2 * Math.PI * frequency * partial.ratio * t;
      const carrier = strings
        ? (Math.sin(phase + vibrato) + 0.38 * Math.sin(phase * 1.0018 + 0.7) + 0.38 * Math.sin(phase * 0.9982 - 0.7)) / 1.76
        : Math.sin(phase + vibrato);
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
