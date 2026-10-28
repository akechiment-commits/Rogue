/** オリジナル譜面。1小節=16ステップ。旋律は手書き、伴奏は和声と編成から展開する。 */
const CHORDS = {
  Dm: ["D4", "F4", "A4", "E5"], Bb: ["Bb3", "D4", "F4", "A4"],
  F: ["F4", "A4", "C5", "E5"], C: ["C4", "E4", "G4", "B4"],
  Gm: ["G3", "Bb3", "D4", "F4"], A: ["A3", "C#4", "E4", "G4"],
  Am: ["A3", "C4", "E4", "G4"], Em: ["E4", "G4", "B4", "D5"],
  B: ["B3", "D#4", "F#4", "A4"], D: ["D4", "F#4", "A4", "C5"],
  G: ["G3", "B3", "D4", "F#4"], Cm: ["C4", "Eb4", "G4", "Bb4"],
  Ab: ["Ab3", "C4", "Eb4", "G4"], Db: ["Db4", "F4", "Ab4", "C5"],
  Eb: ["Eb4", "G4", "Bb4", "D5"], G7: ["G3", "B3", "D4", "F4"],
  Fm: ["F3", "Ab3", "C4", "Eb4"], Bm: ["B3", "D4", "F#4", "A4"],
  E7: ["E3", "G#3", "B3", "D4"], Bbm: ["Bb3", "Db4", "F4", "Ab4"],
  Gb: ["Gb3", "Bb3", "Db4", "F4"], Ebm: ["Eb3", "Gb3", "Bb3", "Db4"],
  CsharpDim: ["C#4", "E4", "G4", "Bb4"], DsharpDim: ["D#4", "F#4", "A4", "C5"],
  C7: ["C4", "E4", "G4", "Bb4"], Bdim: ["B3", "D4", "F4", "Ab4"],
  Fsm: ["F#3", "A3", "C#4", "F#4"], Fs: ["F#3", "A#3", "C#4", "F#4"],
  Dmaj: ["D4", "F#4", "A4", "D5"],
};
const octave = (note, value) => note.replace(/\d+$/, String(value));
const parseBar = (score) => {
  const notes = score.split(/\s+/).map(token => {
    const [note, len, velocity] = token.split(":");
    return [note, Number(len), velocity === undefined ? 1 : Number(velocity)];
  });
  if (notes.reduce((sum, note) => sum + note[1], 0) !== 16) throw new Error(`小節長が16でない: ${score}`);
  return notes;
};
const phrase = bars => bars.flatMap(parseBar);
const drumBar = pattern => [...pattern].map((hit, index) => [
  ({ h: "C5", s: "C2", o: "C6", k: "C2" })[hit] || "-", 1,
  hit === "h" ? (index % 4 === 0 ? 0.6 : 0.38) : 0.9,
]);

function arrange({ name, title, desc, tempo, chords, melody, style = "explore", loop = true, harmony = null }) {
  if (chords.length !== melody.length) throw new Error(`${name}: 和声と旋律の小節数不一致`);
  const battle = style === "battle", shadow = style === "shadow", shop = style === "shop", ending = !loop;
  const arps = [], bass = [], counter = [], drums = [], kick = [];
  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]];
    if (!c) throw new Error(`${name}: 未知の和声`);
    const root = octave(c[0], 2), fifth = octave(c[2], 2);
    const mute = ending && bar === chords.length - 1;
    arps.push(parseBar(mute ? "-:16" : shadow
      ? `${c[0]}:6 -:2 ${c[2]}:6 -:2`
      : shop
        ? `-:3 ${c[1]}:1 -:2 ${c[2]}:2 -:3 ${c[3]}:1 -:2 ${c[2]}:2`
        : `${c[0]}:2 -:2 ${c[2]}:2 ${c[1]}:2 ${c[0]}:2 ${c[3]}:2 ${c[2]}:2 -:2`));
    bass.push(parseBar(mute ? `${root}:12 -:4` : battle
      ? `${root}:2 -:1 ${root}:1 ${fifth}:2 ${octave(c[0], 3)}:2 ${root}:2 ${fifth}:2 ${root}:2 ${octave(c[3], 2)}:2`
      : shop
        ? `${root}:3 -:1 ${octave(c[1], 2)}:3 -:1 ${fifth}:3 -:1 ${octave(c[3], 2)}:3 -:1`
        : shadow
          ? `${root}:6 -:2 ${fifth}:6 -:2`
          : `${root}:3 -:1 ${fifth}:2 -:2 ${root}:3 -:1 ${octave(c[0], 3)}:2 ${fifth}:2`));
    counter.push(parseBar(harmony?.[bar] || (mute ? `${c[1]}:12 -:4` :
      bar < 4 && !battle ? "-:16" :
        bar % 4 === 3 ? `-:8 ${c[2]}:2 ${c[3]}:2 ${c[1]}:2 -:2` : `-:8 ${c[1]}:4 -:4`)));
    const quietIntro = bar < 2 && !battle;
    drums.push(drumBar(mute || (ending && shadow) ? "................" : quietIntro ? "..h...h...h...h." :
      bar % 8 === 7 ? "h.h.s.h.h.h.ssso" : battle ? "h.h.s.h.hh.hs.h." : shop ? "h..hs.h.h..hs.h." : "h.h.s.h.h.h.s.h."));
    kick.push(drumBar(mute || quietIntro || (ending && shadow) ? "................" :
      battle ? "k..k....k.k...k." : "k.......k...k..."));
  }
  return {
    name, title, desc, tempo, loop, bars: melody.length,
    tracks: [
      { type: shop ? "triangle" : "square", volume: battle ? 0.15 : 0.115, pan: -0.08,
        cutoff: battle ? 3300 : 2400, gate: ending ? 0.94 : 0.83,
        attack: 0.008, decay: 0.09, sustain: ending ? 0.75 : 0.62, release: 0.07,
        notes: phrase(melody) },
      { type: "triangle", volume: shadow ? 0.055 : 0.07, pan: -0.38, cutoff: 1900,
        gate: shop ? 0.45 : 0.58, attack: 0.006, decay: 0.06, sustain: 0.35, release: 0.035,
        notes: arps.flat() },
      { type: "sine", volume: battle ? 0.07 : 0.045, pan: 0.35, gate: 0.9,
        attack: 0.012, decay: 0.1, sustain: 0.7, release: 0.09, notes: counter.flat() },
      { type: "triangle", volume: battle ? 0.22 : 0.18, pan: 0, cutoff: 850, gate: 0.84,
        attack: 0.005, decay: 0.04, sustain: 0.78, release: 0.04, notes: bass.flat() },
      { type: "noise", volume: battle ? 0.08 : 0.055, pan: 0.15, notes: drums.flat() },
      { type: "sine", instrument: "kick", volume: battle ? 0.22 : 0.14, pan: 0, notes: kick.flat() },
    ],
  };
}

// 浅層は気軽な探索。柔らかい室内楽の音色で、長調の軽い主題を歌う。
const SHALLOW_LIGHT_A = [
  "C5:3 E5:1 G5:4 A5:2 G5:2 E5:4", "F5:3 A5:1 G5:2 F5:2 E5:4 -:4",
  "E5:2 G5:2 C6:4 B5:2 G5:2 E5:4", "D5:3 G5:1 B5:2 A5:2 G5:4 -:4",
  "A5:3 G5:1 F5:4 E5:2 F5:2 A5:4", "G5:2 E5:2 C5:4 D5:2 E5:2 G5:4",
  "F5:3 E5:1 D5:4 A4:2 D5:2 F5:4", "G5:2 F5:2 D5:4 B4:2 D5:2 G5:2 -:2",
];
function chamberExploration() {
  const chords = ["C","F","C","G7","F","C","Dm","G7", "F","C","Dm","G7","F","C","G7","C",
    "C","F","C","G7","F","C","Dm","G7", "F","C","Dm","G7","F","C","G7","G7"];
  const melody = [...SHALLOW_LIGHT_A,
    "A5:4 C6:3 A5:1 G5:2 F5:2 E5:4", "G5:3 E5:1 C5:4 E5:2 G5:2 C6:4",
    "A5:2 F5:2 D5:4 E5:2 F5:2 A5:4", "B5:3 A5:1 G5:4 F5:2 D5:2 B4:4",
    "C6:4 A5:2 G5:2 F5:4 -:4", "E5:2 G5:2 C6:4 B5:2 G5:2 E5:4",
    "F5:2 D5:2 B4:4 D5:2 F5:2 G5:4", "E5:3 G5:1 C6:6 -:2 G5:2 E5:2",
    ...SHALLOW_LIGHT_A.slice(0, 6),
    "A5:3 F5:1 D5:4 F5:2 E5:2 D5:4", "B4:2 D5:2 G5:4 F5:2 D5:2 B4:2 -:2",
    "A5:3 G5:1 F5:4 C5:4 -:4", "E5:2 G5:2 C6:4 G5:2 E5:2 C5:4",
    "D5:3 F5:1 A5:4 G5:2 F5:2 E5:4", "D5:2 G5:2 B5:4 A5:2 G5:2 D5:4",
    "F5:2 A5:2 C6:4 A5:2 G5:2 F5:4", "G5:3 E5:1 C5:4 E5:2 G5:2 C6:4",
    "B5:2 A5:2 G5:4 F5:2 D5:2 B4:4", "D5:2 G5:2 B5:4 G5:4 -:4"];
  const piano = [], inner = [], upper = [], bass = [], lead = [];
  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]], lift = bar >= 8 && bar < 16 ? 0.94 : bar >= 24 ? 0.8 : 0.85;
    lead.push(...parseBar(melody[bar]).map(([note, length], index) => [note, length, lift * (index % 3 === 0 ? 1 : 0.87)]));
    piano.push(...parseBar(bar % 4 === 3
      ? `${c[0]}:2:0.64 -:2 ${c[2]}:2:0.46 -:2 ${c[1]}:2:0.56 -:2 ${c[3]}:2:0.36 -:2`
      : `${c[0]}:3:0.66 -:1 ${c[2]}:2:0.46 -:2 ${c[1]}:3:0.56 -:1 ${c[3]}:2:0.36 -:2`));
    inner.push(...parseBar(bar < 2 ? "-:16" : `${octave(c[1], 3)}:6:${lift * 0.52} -:2 ${octave(c[1], 3)}:6:${lift * 0.42} -:2`));
    upper.push(...parseBar(bar < 4 || bar % 4 === 3 ? "-:16" : `${octave(c[2], 4)}:12:${lift * 0.45} -:4`));
    bass.push(...parseBar(`${octave(c[0], 2)}:3:0.64 -:1 ${octave(c[2], 2)}:3:0.48 -:1 ${octave(c[0], 2)}:3:0.56 -:1 ${octave(c[2], 2)}:3:0.44 -:1`));
  }
  return {
    name: "dungeon_shallow", title: "気ままな探検", tempo: 112, loop: true, bars: 32,
    desc: "C長調。32小節・約69秒。軽やかな笛の主題、弾む鍵盤と低音、薄い弦の5パート。晴れやかな中間部と小さな掛け合いから主題へ戻る、お気楽な探索曲。打楽器を使わず、柔らかい室内楽の響きを添える。",
    tracks: [
      { type: "sine", instrument: "woodFlute", volume: 0.22, gate: 0.87, pan: -0.08, cutoff: 3900, roomSend: 0.25, notes: lead },
      { type: "sine", instrument: "feltPiano", volume: 0.22, gate: 0.67, pan: -0.32, cutoff: 3000, roomSend: 0.2, notes: piano },
      { type: "sine", instrument: "softStrings", volume: 0.1, gate: 0.88, pan: -0.48, cutoff: 2200, roomSend: 0.32, notes: inner },
      { type: "sine", instrument: "softStrings", volume: 0.075, gate: 0.92, pan: 0.46, cutoff: 2500, roomSend: 0.32, notes: upper },
      { type: "sine", instrument: "roundBass", volume: 0.25, gate: 0.72, pan: 0, cutoff: 550, notes: bass },
    ],
  };
}
export const BGM_DUNGEON_SHALLOW = chamberExploration();

// 拠点・ハブ画面テーマ。D長調・134 BPM。気合と情熱のシンフォニック・フォークロックアンサンブル。
function hubTheme() {
  const chords = [
    // 1-4: 衝撃のファンファーレ・イントロ
    "D", "G", "A", "D",
    // 5-12: Aメロ（朝露の街・若き旅人たち）
    "D", "A", "Bm", "Fsm", "G", "D", "Em", "A",
    // 13-20: Bメロ（果てなき荒野への誓い・Bm転調）
    "Bm", "G", "A", "D", "Bm", "G", "Em", "Fs",
    // 21-28: サビ（大空へ羽ばたく希望のクライマックス）
    "G", "A", "Fsm", "Bm", "Em", "A", "D", "D",
    // 29-32: ラストスパート＆完全静寂ブレイク
    "G", "A", "Bm", "D",
  ];

  const melody = [
    // 1-4: イントロ
    "D5:4 F#5:4 A5:4 D6:4",
    "B5:3 A5:1 G5:2 F#5:2 G5:4 B5:4",
    "A5:3 G5:1 F#5:2 E5:2 F#5:4 A5:4",
    "D5:4 E5:2 F#5:2 G5:4 A5:4",
    // 5-12: Aメロ
    "F#5:4 E5:2 D5:2 A4:4 D5:4",
    "E5:3 F#5:1 G5:2 F#5:2 E5:4 A4:4",
    "D5:4 F#5:2 A5:2 D6:4 C#6:2 B5:2",
    "A5:6 F#5:2 D5:4 F#5:4",
    "G5:3 A5:1 B5:2 D6:2 B5:4 A5:2 G5:2",
    "F#5:4 A5:2 D5:2 F#5:4 D5:4",
    "E5:2 F#5:2 G5:4 F#5:2 G5:2 A5:4",
    "A5:6 -:2 A5:4 -:4",
    // 13-20: Bメロ
    "B5:4 A5:2 F#5:2 D5:4 F#5:4",
    "G5:3 A5:1 B5:2 D6:2 B5:4 G5:4",
    "A5:4 G5:2 E5:2 C#5:4 E5:4",
    "F#5:3 G5:1 A5:2 D6:2 A5:4 F#5:4",
    "B5:4 D6:2 F#6:2 E6:4 D6:2 C#6:2",
    "D6:4 B5:2 G5:2 D5:4 G5:4",
    "E5:2 G5:2 B5:4 A5:2 G5:2 E5:4",
    "F#5:8 -:4 F#5:4",
    // 21-28: サビ
    "G5:4 B5:2 D6:2 G6:4 F#6:2 E6:2",
    "E6:4 C#6:2 A5:2 E6:4 D6:2 C#6:2",
    "D6:4 A5:2 F#5:2 D5:4 F#5:4",
    "B5:3 C#6:1 D6:2 E6:2 F#6:4 D6:4",
    "E6:4 D6:2 B5:2 G5:4 B5:4",
    "A5:3 B5:1 C#6:2 D6:2 E6:4 G6:4",
    "F#6:6 E6:2 D6:4 A5:4",
    "D6:8 -:4 D5:4",
    // 29-32: ラストスパート＆ブレイク
    "B5:3 C#6:1 D6:2 E6:2 F#6:4 G6:4",
    "A6:4 G6:2 F#6:2 E6:4 C#6:4",
    "D6:4 A5:4 F#5:4 -:4",
    "-:16",
  ];

  const stringsCounter = [
    // 1-4
    "D5:8 F#5:8", "G5:8 B5:8", "E5:8 A5:8", "F#5:8 A5:8",
    // 5-12
    "F#4:8 A4:8", "A4:8 C#5:8", "F#4:8 D5:8", "C#5:8 F#5:8",
    "D5:8 G5:8", "F#5:8 D5:8", "E5:8 G5:8", "E5:6 -:2 E5:4 -:4",
    // 13-20
    "F#5:8 D5:8", "D5:8 G5:8", "E5:8 A5:8", "F#5:8 A5:8",
    "F#5:8 B5:8", "G5:8 B5:8", "E5:8 B5:8", "A#4:8 C#5:4 -:4",
    // 21-28
    "B5:8 D6:8", "C#6:8 E6:8", "A5:8 D6:8", "F#5:8 B5:8",
    "G5:8 B5:8", "A5:8 C#6:8", "D6:8 F#6:8", "F#5:8 A5:4 -:4",
    // 29-32
    "D5:4 G5:4 B5:4 D6:4", "C#5:4 E5:4 A5:4 C#6:4", "D6:4 A5:4 F#5:4 -:4", "-:16",
  ];

  const lead = [], guitar = [], piano = [], strings = [], bass = [];
  const kick = [], snare = [], hats = [];

  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]];
    const intro = bar < 4;
    const bSection = bar >= 12 && bar < 20;
    const climax = bar >= 20;
    const lift = climax ? 1.0 : bSection ? 0.94 : intro ? 0.98 : 0.92;

    // 1. ブラスリード（誇り高きヒロイック主旋律）
    lead.push(...parseBar(melody[bar]).map(([n, l], i) => [
      n, l, lift * (i % 2 === 0 ? 1 : 0.88)
    ]));

    // 2. スティールギター（疾走する16分アコースティック・ストラミングカッティング）
    let gtrStr = "";
    if (bar === 31) {
      gtrStr = "-:16";
    } else if (bar === 30) {
      gtrStr = `${c[0]}:4 ${c[1]}:4 ${c[2]}:4 -:4`;
    } else if (bar === 11) {
      gtrStr = `${c[0]}:4:0.8 ${c[1]}:2:0.7 -:2 ${c[0]}:4:0.85 -:4`;
    } else if (climax) {
      // 16分刻みの熱いストローク: 2 + 1 + 1 + 2 + 2 + 2 + 1 + 1 + 2 + 2 = 16
      gtrStr = `${c[0]}:2:0.75 -:1 ${c[1]}:1:0.6 ${c[2]}:2:0.75 -:2 ${c[0]}:2:0.75 -:1 ${c[2]}:1:0.6 ${c[1]}:2:0.7 ${c[2]}:2:0.65`;
    } else {
      // 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 = 16
      gtrStr = `${c[0]}:2:0.7 -:2 ${c[2]}:2:0.65 -:2 ${c[1]}:2:0.68 -:2 ${c[2]}:2:0.62 -:2`;
    }
    guitar.push(...parseBar(gtrStr));

    // 3. ピアノ（華麗な16分アルペジオとオブリガート）
    let pnoStr = "";
    if (bar === 31) {
      pnoStr = "-:16";
    } else if (bar === 30) {
      pnoStr = `${c[0]}:4 ${c[1]}:4 ${c[2]}:4 -:4`;
    } else if (bar === 11) {
      pnoStr = `${c[0]}:6:0.8 -:2 ${c[2]}:4:0.8 -:4`;
    } else if (climax) {
      // 16分高速アルペジオ駆け上がり (1*16 = 16)
      pnoStr = `${c[0]}:1:0.7 ${c[1]}:1:0.6 ${c[2]}:1:0.65 ${c[3] || c[0]}:1:0.6 ${octave(c[0], 5)}:1:0.72 ${octave(c[1], 5)}:1:0.65 ${octave(c[2], 5)}:1:0.7 ${octave(c[3] || c[0], 5)}:1:0.65 ${octave(c[2], 5)}:1:0.65 ${octave(c[1], 5)}:1:0.6 ${octave(c[0], 5)}:1:0.65 ${c[2]}:1:0.6 ${c[1]}:1:0.55 ${c[0]}:1:0.6 ${c[1]}:1:0.55 ${c[2]}:1:0.6`;
    } else if (intro) {
      // 2*8 = 16
      pnoStr = `${c[0]}:2:0.75 ${c[1]}:2:0.65 ${c[2]}:2:0.7 ${c[3] || c[0]}:2:0.65 ${octave(c[0], 5)}:2:0.75 ${c[2]}:2:0.65 ${c[1]}:2:0.6 ${c[0]}:2:0.65`;
    } else {
      // 2 + 1 + 1 + 2 + 2 + 2 + 1 + 1 + 2 + 2 = 16
      pnoStr = `${c[0]}:2:0.7 -:1 ${c[2]}:1:0.55 ${c[1]}:2:0.65 -:2 ${c[0]}:2:0.68 -:1 ${c[2]}:1:0.55 ${c[1]}:2:0.6 ${c[2]}:2:0.58`;
    }
    piano.push(...parseBar(pnoStr));

    // 4. ストリングス（壮大な対位法カウンター旋律）
    strings.push(...parseBar(stringsCounter[bar]).map(([n, l]) => [
      n, l, lift * 0.82
    ]));

    // 5. スラップベース（唸るチョッパー＆ドライブ）
    const r = octave(c[0], 2), fifth = octave(c[2], 2), octR = octave(c[0], 3);
    let basStr = "";
    if (bar === 31) {
      basStr = "-:16";
    } else if (bar === 30) {
      basStr = `${r}:4:0.9 ${fifth}:4:0.85 ${octR}:4:0.9 -:4`;
    } else if (bar === 11) {
      basStr = `${r}:4:0.85 ${fifth}:2:0.75 -:2 ${r}:4:0.9 -:4`;
    } else if (climax) {
      // スラップマシンガン: 2 + 1 + 1 + 2 + 2 + 2 + 1 + 1 + 2 + 2 = 16
      basStr = `${r}:2:0.85 -:1 ${r}:1:0.65 ${octR}:2:0.8 ${r}:2:0.75 ${fifth}:2:0.7 -:1 ${r}:1:0.6 ${octR}:2:0.75 ${fifth}:2:0.7`;
    } else {
      // 3 + 1 + 2 + 2 + 3 + 1 + 2 + 2 = 16
      basStr = `${r}:3:0.85 -:1 ${fifth}:2:0.7 ${octR}:2:0.75 ${r}:3:0.8 -:1 ${fifth}:2:0.68 ${r}:2:0.72`;
    }
    bass.push(...parseBar(basStr));

    // 6. ドラム（キック）
    let kckStr = "";
    if (bar === 31) {
      kckStr = "-:16";
    } else if (bar === 30) {
      kckStr = "C2:4:0.95 C2:4:0.9 C2:4:0.95 -:4";
    } else if (bar === 11) {
      kckStr = "C2:4:0.9 C2:2:0.8 -:2 C2:4:0.9 -:4";
    } else if (climax) {
      // 4つ打ちドライブ: 4 + 2 + 2 + 4 + 4 = 16
      kckStr = "C2:4:0.9 -:2 C2:2:0.7 C2:4:0.88 C2:4:0.85";
    } else {
      // 4 + 4 + 4 + 4 = 16
      kckStr = "C2:4:0.88 -:4 C2:4:0.85 -:4";
    }
    kick.push(...parseBar(kckStr));

    // 7. ドラム（スネア）
    let snrStr = "";
    if (bar === 31) {
      snrStr = "-:16";
    } else if (bar === 30) {
      snrStr = "-:4 C2:4:0.95 C2:4:1.0 -:4";
    } else if (bar === 11) {
      snrStr = "-:4 C2:4:0.85 -:4 C2:4:0.9";
    } else if (bar % 8 === 7) {
      // フィルイン: 4 + 4 + 2 + 2 + 2 + 2 = 16
      snrStr = "-:4 C2:4:0.82 -:2 C2:2:0.5 C2:2:0.68 C2:2:0.95";
    } else {
      // バックビート: 4 + 4 + 4 + 4 = 16
      snrStr = "-:4 C2:4:0.82 -:4 C2:4:0.88";
    }
    snare.push(...parseBar(snrStr));

    // 8. ドラム（ハット）
    let hatStr = "";
    if (bar === 31) {
      hatStr = "-:16";
    } else if (bar === 30) {
      hatStr = "C5:4:0.6 C5:4:0.6 C5:4:0.65 -:4";
    } else if (bar === 11) {
      hatStr = "C5:2:0.5 C5:2:0.4 C5:2:0.5 -:10";
    } else {
      hatStr = "C5:2:0.54 C5:2:0.38 C5:2:0.48 C5:2:0.36 C5:2:0.52 C5:2:0.38 C5:2:0.48 C5:2:0.36";
    }
    hats.push(...parseBar(hatStr));
  }

  return {
    name: "hub", title: "冒険の待つ場所", tempo: 134, loop: true, bars: 32,
    desc: "D長調。32小節・約58秒。拠点・ハブ画面テーマ。旧来の笛の旋律から完全脱却した、気合と情熱のシンフォニック・フォークロックアンサンブル。旅立ちのファンファーレから雪崩れ込む134 BPMの爽快なアコースティックカッティング、胸を熱く焦がすB短調へのエモーショナルな転調、全開のスラップベースとストリングスが織りなす大空へのサビ、そして鮮烈な全パート一斉ブレイク。",
    tracks: [
      { type: "sine", instrument: "brassLead", volume: 0.30, gate: 0.88, pan: -0.06, cutoff: 4800, roomSend: 0.22, notes: lead },
      { type: "sine", instrument: "steelGuitar", volume: 0.28, gate: 0.80, pan: 0.25, cutoff: 4600, roomSend: 0.18, notes: guitar },
      { type: "sine", instrument: "feltPiano", volume: 0.22, gate: 0.68, pan: -0.28, cutoff: 3800, roomSend: 0.18, notes: piano },
      { type: "sine", instrument: "softStrings", volume: 0.20, gate: 0.90, pan: 0.38, cutoff: 3400, roomSend: 0.28, notes: strings },
      { type: "sine", instrument: "slapBass", volume: 0.40, gate: 0.74, pan: 0, cutoff: 850, notes: bass },
      { type: "sine", instrument: "drumKick", volume: 0.32, pan: 0, cutoff: 1200, notes: kick },
      { type: "sine", instrument: "drumSnare", volume: 0.26, pan: 0.06, cutoff: 5000, roomSend: 0.10, notes: snare },
      { type: "sine", instrument: "drumHat", volume: 0.14, pan: 0.28, cutoff: 7500, notes: hats },
    ],
  };
}
export const BGM_HUB = hubTheme();

// 11階〜20階の中深層探索テーマ。D短調・134 BPM。鋭利なリフ、タイトなスラップベース、休符のキメによるソリッドな疾走アンサンブル。
function deepExploration() {
  const chords = [
    // 1-8: 鋭利なリフと静寂のキメ（索敵の緊張）
    "Dm", "Gm", "Bb", "A", "Dm", "Gm", "C", "Dm",
    // 9-16: 疾走する回廊・スラップの推進力
    "Bb", "C", "Dm", "Dm", "Gm", "A", "Dm", "Dm",
    // 17-24: 展開部・影の切迫とタメ（Ebナポリ和音〜A7の緊張）
    "Eb", "Dm", "Bb", "A", "Gm", "Bb", "A", "A",
    // 25-32: サビ〜クライマックス・全パート一斉キメ
    "Dm", "Gm", "C", "F", "Bb", "Eb", "A", "Dm",
  ];

  // 鋭利なスティールギターのリフ（16分音符のキレ・休符によるタメ）
  const riff = [
    // 1-8
    "D5:2 D5:1 -:1 F5:2 G5:2 A5:2 -:2 F5:2 E5:2",
    "D5:2 -:2 D5:1 -:1 G5:2 Bb5:2 A5:2 G5:2 F5:2",
    "F5:2 -:1 G5:1 A5:2 D6:2 C6:2 Bb5:2 A5:2 G5:2",
    "A5:4 E5:4 C#5:4 -:4", // 4小節目末尾キメ＆休符！
    "D5:2 D5:1 -:1 F5:2 G5:2 A5:3 Bb5:1 A5:2 G5:2",
    "Bb5:2 A5:2 G5:2 F5:2 E5:2 F5:2 G5:2 E5:2",
    "E5:2 G5:2 C6:4 B5:2 A5:2 G5:2 E5:2",
    "D5:4 A4:4 D5:4 -:4", // 8小節目末尾キメ＆休符！

    // 9-16
    "F5:2 F5:1 -:1 A5:2 D6:2 C6:2 Bb5:2 A5:2 G5:2",
    "G5:2 G5:1 -:1 B5:2 E6:2 D6:2 C6:2 B5:2 A5:2",
    "A5:2 D6:2 F6:4 E6:2 D6:2 C6:2 A5:2",
    "D6:4 A5:2 F5:2 D5:4 -:4",
    "G5:2 Bb5:2 D6:3 C6:1 Bb5:2 A5:2 G5:4",
    "E5:2 G5:2 C#6:4 Bb5:2 A5:2 G5:4",
    "F5:2 G5:2 A5:4 D6:2 C6:2 A5:2 F5:2",
    "D5:4 -:4 D5:4 -:4", // 16小節目：バシッ・バシッとブレイク！

    // 17-24
    "G5:3 F5:1 Eb5:2 D5:2 Eb5:4 G5:4",
    "F5:3 E5:1 D5:2 C#5:2 D5:4 F5:4",
    "D5:2 F5:2 Bb5:4 A5:2 G5:2 F5:4",
    "E5:2 F5:2 G5:4 F5:2 E5:2 C#5:4",
    "G5:2 Bb5:2 D6:4 C6:2 Bb5:2 A5:4",
    "Bb5:2 D6:2 F6:4 E6:2 D6:2 C#6:4",
    "D6:3 C#6:1 D6:2 E6:2 F6:4 E6:2 D6:2",
    "C#6:4 A5:4 E5:4 -:4", // 24小節目：最大緊張のタメ！

    // 25-32
    "D6:2 A5:2 F5:2 D5:2 F5:2 A5:2 D6:4",
    "G5:3 A5:1 Bb5:4 D6:2 C6:2 Bb5:4",
    "C6:3 D6:1 E6:4 G6:2 F6:2 E6:4",
    "A5:3 B5:1 C6:4 F6:2 E6:2 D6:4",
    "Bb5:3 C6:1 D6:4 F6:2 Eb6:2 D6:4",
    "G5:3 A5:1 Bb5:4 Eb6:2 D6:2 C6:4",
    "A5:2 C#6:2 E6:4 D6:2 C#6:2 B5:2 A5:2",
    "D6:4 -:4 D5:4 -:4", // 32小節目：全パート一斉キメ＆ループへのタメ！
  ];

  const lead = [], piano = [], strings = [], bass = [];
  const kick = [], snare = [], hats = [];

  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]];
    const breakBar = bar === 3 || bar === 7 || bar === 15 || bar === 23 || bar === 31;
    const climax = bar >= 24;
    const lift = climax ? 1.0 : 0.94;

    // 1. スティールギター／鋭利なリード
    lead.push(...parseBar(riff[bar]).map(([note, len], i) => [
      note, len, lift * (i % 2 === 0 ? 1 : 0.88),
    ]));

    // 2. ピアノ: ソリッドなスタッカート・カッティング
    piano.push(...parseBar(breakBar
      ? `${c[0]}:2:0.75 -:2 ${c[1]}:2:0.7 -:2 ${c[2]}:4:0.85 -:4`
      : `-:2 ${c[1]}:2:0.65 ${c[0]}:2:0.7 -:2 ${c[2]}:2:0.62 -:2 ${c[1]}:2:0.68 -:2`
    ));

    // 3. ストリングス: 緊迫のスタッカート＆オブリガート
    strings.push(...parseBar(breakBar
      ? `${octave(c[0], 4)}:4:0.8 -:4 ${octave(c[2], 4)}:4:0.85 -:4`
      : bar % 2 === 0
        ? `${octave(c[1], 4)}:2:0.6 -:2 ${octave(c[2], 4)}:2:0.65 -:2 ${octave(c[1], 4)}:2:0.58 -:6`
        : `-:8 ${octave(c[2], 4)}:2:0.7 ${octave(c[3] || c[0], 4)}:2:0.75 -:4`
    ));

    // 4. スラップベース: タイトな16分シンコペーション＆オクターブサムピング
    const root = octave(c[0], 2), oct = octave(c[0], 3), fifth = octave(c[2], 2);
    bass.push(...parseBar(breakBar
      ? `${root}:3:0.9 -:1 ${fifth}:2:0.8 -:2 ${root}:4:0.95 -:4`
      : `${root}:2:0.9 -:1 ${root}:1:0.7 ${oct}:2:0.85 -:2 ${root}:2:0.88 ${fifth}:2:0.8 ${root}:2:0.85 -:2`
    ));

    // 5. キック: タイトで前のめりなビート
    kick.push(...parseBar(breakBar
      ? "C2:4:0.95 -:4 C2:4:0.95 -:4"
      : bar % 2 === 0
        ? "C2:2:0.92 -:2 C2:2:0.8 -:2 C2:2:0.88 -:2 C2:2:0.85 -:2"
        : "C2:2:0.92 -:4 C2:2:0.85 C2:2:0.9 -:2 C2:2:0.85 -:2"
    ));

    // 6. スネア: バシッと抜けるバックビート＆ブレイク
    snare.push(...parseBar(breakBar
      ? "-:4 C2:4:0.95 -:4 C2:4:0.95"
      : "-:4 C2:4:0.88 -:4 C2:4:0.92"
    ));

    // 7. ハット: チキチキと刻み、ブレイクでピタッと止まる
    hats.push(...parseBar(breakBar
      ? "C5:2:0.5 -:2 C5:2:0.4 -:2 -:8"
      : "C5:2:0.55 C5:2:0.35 C5:2:0.5 C5:2:0.38 C5:2:0.52 C5:2:0.35 C5:2:0.48 C5:2:0.35"
    ));
  }

  return {
    name: "dungeon_deep", title: "深紅の回廊", tempo: 134, loop: true, bars: 32,
    desc: "D短調。32小節・約57秒。11階〜20階の中深層探索テーマ。冷徹な石廊を切り裂く鋭利なリフ、タイトなスラップベースの推進力、休符による鮮烈なキメとブレイクが織りなすソリッド＆スリリングな疾走アンサンブル。",
    tracks: [
      { type: "sine", instrument: "steelGuitar", volume: 0.30, gate: 0.85, pan: -0.06, cutoff: 4600, roomSend: 0.22, notes: lead },
      { type: "sine", instrument: "feltPiano", volume: 0.22, gate: 0.65, pan: 0.26, cutoff: 3600, roomSend: 0.18, notes: piano },
      { type: "sine", instrument: "softStrings", volume: 0.16, gate: 0.80, pan: -0.40, cutoff: 3200, roomSend: 0.28, notes: strings },
      { type: "sine", instrument: "slapBass", volume: 0.38, gate: 0.72, pan: 0, cutoff: 800, notes: bass },
      { type: "sine", instrument: "drumKick", volume: 0.30, pan: 0, cutoff: 1100, notes: kick },
      { type: "sine", instrument: "drumSnare", volume: 0.24, pan: 0.06, cutoff: 4800, roomSend: 0.1, notes: snare },
      { type: "sine", instrument: "drumHat", volume: 0.14, pan: 0.28, cutoff: 7200, notes: hats },
    ],
  };
}
export const BGM_DUNGEON_DEEP = deepExploration();

// 21階〜30階の最深層・奈落探索テーマ。C短調・128 BPM。冷徹なミニマル・オスティナートとプログレッシブ・サスペンス。
function abyssExploration() {
  const chords = [
    // 1-8: 第1主題（深淵の回廊・冷徹なミニマルリフ）
    "Cm", "Cm", "Fm", "G", "Cm", "Ab", "G", "Cm",
    // 9-16: 第2主題（ナポリ和音Dbとトリトーンの戦慄）
    "Cm", "Db", "Fm", "G", "Cm", "Db", "Bdim", "G",
    // 17-24: 展開部（平行調Ebの哀愁から暗黒へ）
    "Eb", "Bb", "Cm", "Gm", "Ab", "Fm", "G", "G",
    // 25-32: クライマックス（不退転の覚悟〜極限の静寂ブレイク）
    "Cm", "Ab", "Bb", "Eb", "Fm", "Db", "Bdim", "Cm",
  ];

  const melody = [
    // 1-8
    "-:8 C5:4 D5:2 Eb5:2",
    "G5:6 F#5:2 G5:4 -:4",
    "Ab5:4 G5:2 F5:2 Eb5:2 D5:2 C5:4",
    "D5:4 B4:4 -:8",
    "C5:4 Eb5:2 G5:2 C6:4 Bb5:2 Ab5:2",
    "G5:4 F5:2 Eb5:2 D5:4 Eb5:4",
    "F5:4 Eb5:2 D5:2 B4:4 D5:4",
    "C5:8 -:8",
    // 9-16
    "C5:2 D5:2 Eb5:4 G5:4 F#5:4",
    "F5:3 Eb5:1 Db5:4 F5:4 Ab5:4",
    "Ab5:4 G5:2 F5:2 Eb5:2 D5:2 C5:4",
    "D5:4 G5:4 B4:4 -:4",
    "C5:2 Eb5:2 G5:4 Bb5:2 Ab5:2 G5:4",
    "Db5:2 F5:2 Ab5:4 C6:2 Bb5:2 Ab5:4",
    "B5:4 Ab5:2 F5:2 D5:4 F5:4",
    "G5:8 -:4 G4:4",
    // 17-24
    "Eb5:4 G5:2 Bb5:2 Eb6:4 D6:2 C6:2",
    "Bb5:6 -:2 F5:4 Bb5:4",
    "C6:4 G5:2 Eb5:2 C5:4 Eb5:4",
    "D5:6 -:2 G4:4 Bb4:4",
    "C5:2 D5:2 Eb5:4 Ab5:2 G5:2 F5:4",
    "F5:2 G5:2 Ab5:4 C6:2 Bb5:2 Ab5:4",
    "G5:4 B5:2 D6:2 F6:4 Eb6:2 D6:2",
    "G6:8 -:4 G5:4",
    // 25-32
    "C5:3 D5:1 Eb5:4 G5:2 C6:2 Bb5:2 A5:2",
    "Ab5:4 F5:2 G5:2 Ab5:4 C6:4",
    "Bb5:3 A5:1 G5:2 F5:2 D5:4 F5:4",
    "G5:6 -:2 Eb5:4 G5:4",
    "C6:4 Ab5:2 G5:2 F5:4 Eb5:4",
    "F5:3 Eb5:1 Db5:4 Ab5:4 F5:4",
    "B5:4 Ab5:2 F5:2 D5:4 B4:4",
    "C5:4 -:12",
  ];

  const lead = [], piano = [], guitar = [], strings = [], bass = [];
  const kick = [], snare = [], hats = [];

  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]];
    const intro = bar < 4;
    const bridge = bar >= 16 && bar < 24;
    const climax = bar >= 24;
    const lift = climax ? 1.0 : bridge ? 0.95 : intro ? 0.88 : 0.92;

    // 1. リードブラス（冷徹かつ鋭い切迫の主旋律）
    lead.push(...parseBar(melody[bar]).map(([note, len], idx) => [
      note,
      len,
      lift * (idx % 2 === 0 ? 1 : 0.88),
    ]));

    // 2. ピアノ（冷たく刺さる16分オスティナート ＆ 暗黒アルペジオ）
    if (bar === 3 || bar === 7) {
      piano.push(...parseBar(`${c[0]}:2 ${c[1]}:2 ${c[2]}:2 ${c[3]}:2 -:8`));
    } else if (bar === 14) {
      piano.push(...parseBar("B3:1 D4:1 F4:1 Ab4:1 B4:1 D5:1 F5:1 Ab5:1 G5:2 F5:2 D5:2 B4:2"));
    } else if (bar === 30) {
      piano.push(...parseBar("B3:1 D4:1 F4:1 Ab4:1 B4:1 D5:1 F5:1 Ab5:1 B5:1 Ab5:1 F5:1 D5:1 B4:1 Ab4:1 F4:1 D4:1"));
    } else if (bar === 31) {
      piano.push(...parseBar("C4:4 -:12"));
    } else if (bar === 1 || bar === 9 || bar === 13) {
      const n0 = c[0], n1 = c[1], n2 = c[2];
      piano.push(...parseBar(`${n0}:1 ${n1}:1 ${n2}:1 G4:1 ${n2}:1 ${n1}:1 ${n0}:1 ${n1}:1 ${n0}:1 ${n1}:1 ${n2}:1 G4:1 ${n2}:1 ${n1}:1 ${n0}:1 ${n1}:1`));
    } else if (bridge) {
      piano.push(...parseBar(`${c[0]}:2:0.7 ${c[1]}:2:0.6 ${c[2]}:2:0.65 ${c[3]}:2:0.58 ${c[2]}:2:0.6 ${c[1]}:2:0.55 ${c[0]}:2:0.65 ${c[2]}:2:0.6`));
    } else {
      piano.push(...parseBar("C4:1:0.75 Eb4:1:0.6 G4:1:0.7 F#4:1:0.65 G4:1:0.7 Eb4:1:0.6 C4:1:0.75 Eb4:1:0.6 C4:1:0.72 Eb4:1:0.58 G4:1:0.68 F#4:1:0.62 G4:1:0.68 Eb4:1:0.58 D4:1:0.65 B3:1:0.6"));
    }

    // 3. スティールギター（パーカッシブな鋭いミュート刻み＆カッティング）
    if (bar === 3 || bar === 7 || bar === 31) {
      guitar.push(...parseBar(`${c[0]}:2:0.75 ${c[1]}:2:0.65 -:12`));
    } else if (bar === 30) {
      guitar.push(...parseBar("B3:2:0.8 D4:2:0.7 F4:2:0.75 Ab4:2:0.7 B3:2:0.8 D4:2:0.7 F4:2:0.75 Ab4:2:0.7"));
    } else if (climax) {
      guitar.push(...parseBar(`-:2 ${c[0]}:2:0.75 -:1 ${c[2]}:1:0.6 ${c[1]}:2:0.7 -:2 ${c[0]}:2:0.7 ${c[3] || c[0]}:4:0.75`));
    } else {
      guitar.push(...parseBar(`-:2 ${c[0]}:2:0.7 -:2 ${c[2]}:2:0.65 -:2 ${c[1]}:2:0.68 -:2 ${c[2]}:2:0.6`));
    }

    // 4. ストリングス（緊迫のサスペンス・クラスターと高音オブリガート）
    if (bar === 3 || bar === 7) {
      strings.push(...parseBar(`${octave(c[1], 4)}:8:${lift * 0.7} -:8`));
    } else if (bar === 30) {
      strings.push(...parseBar(`Ab4:4:${lift * 0.8} B4:4:${lift * 0.85} D5:4:${lift * 0.9} F5:4:${lift * 0.95}`));
    } else if (bar === 31) {
      strings.push(...parseBar(`C5:4:${lift * 0.75} -:12`));
    } else if (climax) {
      strings.push(...parseBar(`${octave(c[2], 4)}:4:${lift * 0.85} ${octave(c[1], 4)}:4:${lift * 0.75} ${octave(c[0], 5)}:4:${lift * 0.88} ${octave(c[2], 4)}:4:${lift * 0.8}`));
    } else if (bridge) {
      strings.push(...parseBar(`${octave(c[0], 4)}:8:${lift * 0.75} ${octave(c[2], 4)}:8:${lift * 0.8}`));
    } else {
      strings.push(...parseBar(`${octave(c[1], 4)}:16:${lift * 0.72}`));
    }

    // 5. スラップベース（地を這う重低音チョッパー＆ドライブ）
    const r = octave(c[0], 2), fifth = octave(c[2], 2), octR = octave(c[0], 3);
    if (bar === 3 || bar === 7) {
      bass.push(...parseBar(`${r}:2:0.85 -:2 ${fifth}:2:0.7 -:10`));
    } else if (bar === 14) {
      bass.push(...parseBar("B1:2:0.85 D2:2:0.75 F2:2:0.8 Ab2:2:0.75 B2:2:0.85 F2:2:0.75 D2:2:0.7 B1:2:0.8"));
    } else if (bar === 30) {
      bass.push(...parseBar("B1:2:0.9 D2:2:0.8 F2:2:0.85 Ab2:2:0.8 B2:2:0.9 D3:2:0.85 F3:2:0.9 Ab3:2:0.95"));
    } else if (bar === 31) {
      bass.push(...parseBar("C2:4:0.85 -:12"));
    } else if (climax) {
      bass.push(...parseBar(`${r}:2:0.85 -:1 ${r}:1:0.6 ${octR}:2:0.8 ${r}:2:0.75 ${fifth}:2:0.7 -:1 ${r}:1:0.55 ${octR}:2:0.75 ${fifth}:2:0.7`));
    } else {
      bass.push(...parseBar(`${r}:2:0.85 -:1 ${r}:1:0.6 ${octR}:2:0.75 ${r}:2:0.7 -:2 ${fifth}:2:0.68 ${r}:2:0.75 ${fifth}:2:0.65`));
    }

    // 6. ドラム（キック）
    if (bar === 3 || bar === 7) {
      kick.push(...parseBar("C2:4:0.9 C2:2:0.7 -:10"));
    } else if (bar === 30) {
      kick.push(...parseBar("C2:2:0.9 C2:2:0.85 C2:2:0.9 C2:2:0.85 C2:2:0.9 C2:2:0.85 C2:2:0.9 C2:2:0.95"));
    } else if (bar === 31) {
      kick.push(...parseBar("C2:4:0.9 -:12"));
    } else if (climax) {
      kick.push(...parseBar("C2:4:0.9 -:2 C2:2:0.7 C2:4:0.88 C2:2:0.7 C2:2:0.85"));
    } else {
      kick.push(...parseBar("C2:4:0.88 -:2 C2:2:0.65 C2:4:0.85 -:4"));
    }

    // 7. ドラム（スネア）
    if (bar === 3 || bar === 7) {
      snare.push(...parseBar("-:4 C2:4:0.85 -:8"));
    } else if (bar === 30) {
      snare.push(...parseBar("C2:2:0.8 C2:2:0.85 C2:2:0.8 C2:2:0.85 C2:2:0.9 C2:2:0.9 C2:2:0.95 C2:2:1.0"));
    } else if (bar === 31) {
      snare.push(...parseBar("-:16"));
    } else {
      snare.push(...parseBar("-:4 C2:4:0.82 -:4 C2:4:0.88"));
    }

    // 8. ドラム（ハット）
    if (bar === 3 || bar === 7 || bar === 31) {
      hats.push(...parseBar("C5:2:0.5 C5:2:0.4 C5:2:0.45 -:10"));
    } else if (bar === 30) {
      hats.push(...parseBar("C5:1:0.5 C5:1:0.4 C5:1:0.5 C5:1:0.4 C5:1:0.5 C5:1:0.4 C5:1:0.5 C5:1:0.4 C5:1:0.5 C5:1:0.4 C5:1:0.5 C5:1:0.4 C5:1:0.5 C5:1:0.4 C5:1:0.5 C5:1:0.4"));
    } else {
      hats.push(...parseBar("C5:2:0.52 C5:2:0.38 C5:2:0.48 C5:2:0.36 C5:2:0.5 C5:2:0.38 C5:2:0.48 C5:2:0.36"));
    }
  }

  return {
    name: "dungeon_abyss", title: "深淵の胎動", tempo: 128, loop: true, bars: 32,
    desc: "C短調。32小節・約60秒。21階〜30階の最深層・奈落探索テーマ。旧版のゆったりした室内楽風から全面刷新。冷徹に刺さるピアノの16分ミニマル・オスティナートと地を奮い立たせるスラップ低音、スティールギターの鋭いミュート刻み、ナポリ和音と減七和音（Bdim）が織りなす底知れぬ切迫感、そして極限の静寂ブレイクへ至るダーク・プログレッシブ・サスペンス。",
    tracks: [
      { type: "sine", instrument: "brassLead", volume: 0.28, gate: 0.88, pan: -0.06, cutoff: 4600, roomSend: 0.22, notes: lead },
      { type: "sine", instrument: "feltPiano", volume: 0.24, gate: 0.70, pan: -0.25, cutoff: 3400, roomSend: 0.18, notes: piano },
      { type: "sine", instrument: "steelGuitar", volume: 0.26, gate: 0.80, pan: 0.25, cutoff: 4400, roomSend: 0.18, notes: guitar },
      { type: "sine", instrument: "softStrings", volume: 0.16, gate: 0.90, pan: 0.40, cutoff: 3200, roomSend: 0.30, notes: strings },
      { type: "sine", instrument: "slapBass", volume: 0.38, gate: 0.74, pan: 0, cutoff: 820, notes: bass },
      { type: "sine", instrument: "drumKick", volume: 0.32, pan: 0, cutoff: 1100, notes: kick },
      { type: "sine", instrument: "drumSnare", volume: 0.22, pan: 0.06, cutoff: 4800, roomSend: 0.12, notes: snare },
      { type: "sine", instrument: "drumHat", volume: 0.14, pan: 0.26, cutoff: 7200, notes: hats },
    ],
  };
}
export const BGM_DUNGEON_ABYSS = abyssExploration();

// モンスターハウス（MH）テーマ。E短調・162 BPM。警報サイレン動機から雪崩れ込む超高速サバイバル戦闘アンサンブル。
function monsterHouseTheme() {
  const chords = [
    // 1-4: 【開幕警報・サイレン＆狂乱パニック】
    "Em", "Em", "Em", "B",
    // 5-12: 【第1主題：四面楚歌・包囲網のスラッシュリフ】
    "Em", "C", "Am", "B", "Em", "G", "C", "B",
    // 13-20: 【第2主題：半音転調・退路遮断の危機（Fmへ突入）】
    "Fm", "Db", "Bbm", "C7", "Fm", "Ab", "Db", "B",
    // 21-28: 【サビ：逆転殲滅・怒涛のブレイクスルー】
    "Em", "D", "C", "B", "Em", "G", "Am", "B",
    // 29-32: 【ループブリッジ：極限緊張D#dim〜全パート一斉ブレイク】
    "C", "D", "DsharpDim", "B",
  ];

  const riff = [
    // 1-4: 警報サイレン＆開幕パニック
    "E5:1 F5:1 E5:1 F5:1 E5:1 F5:1 E5:1 F5:1 B5:4 -:4",
    "E5:1 F5:1 E5:1 F5:1 E5:1 F5:1 E5:1 F5:1 B5:4 -:4",
    "E5:2 G5:2 Bb5:2 B5:4 E6:4 D#6:2",
    "E6:4 B5:4 F#5:4 -:4",

    // 5-12: 第1主題（四面楚歌・包囲網）
    "E5:2 E5:1 -:1 G5:2 A5:2 B5:4 E6:4",
    "C6:3 B5:1 A5:2 G5:2 F#5:4 A5:4",
    "A5:2 B5:2 C6:4 B5:2 A5:2 G5:4",
    "F#5:4 A5:4 D#5:4 -:4",
    "E5:2 E5:1 -:1 G5:2 A5:2 B5:3 C6:1 B5:2 A5:2",
    "D6:3 B5:1 G5:2 B5:2 D6:4 G6:4",
    "E6:2 D6:2 C6:4 B5:2 A5:2 G5:4",
    "F#5:4 D#5:4 B4:4 -:4",

    // 13-20: 第2主題（Fm半音跳躍転調・退路遮断）
    "F5:2 F5:1 -:1 Ab5:2 Bb5:2 C6:4 F6:4",
    "Db6:3 C6:1 Bb5:2 Ab5:2 G5:4 Bb5:4",
    "Bb5:2 C6:2 Db6:4 C6:2 Bb5:2 Ab5:4",
    "G5:4 Bb5:4 E5:4 -:4",
    "F5:2 Ab5:2 C6:4 Db6:2 C6:2 Bb5:2 Ab5:2",
    "Eb6:3 C6:1 Ab5:2 C6:2 Eb6:4 Ab6:4",
    "Db6:2 C6:2 Bb5:4 Ab5:2 G5:2 F5:4",
    "D#5:4 F#5:4 B5:4 -:4",

    // 21-28: サビ（逆転殲滅・ブレイクスルー）
    "E6:6 B5:2 G5:4 E5:4",
    "F#6:4 D6:2 A5:2 F#5:4 A5:4",
    "G6:6 E6:2 C6:4 G5:4",
    "B6:4 F#6:2 D#6:2 B5:4 -:4",
    "E6:3 F#6:1 G6:4 F#6:2 E6:2 D6:4",
    "B5:3 C6:1 D6:4 C6:2 B5:2 A5:4",
    "C6:2 E6:2 A6:4 G6:2 F#6:2 E6:4",
    "D#6:4 F#6:4 B6:4 -:4",

    // 29-32: ループブリッジ（減七極限緊張〜ブレイク）
    "E6:3 D6:1 C6:2 B5:2 C6:4 E6:4",
    "F#6:3 E6:1 D6:2 C#6:2 D6:4 F#6:4",
    "A6:2 G6:2 F#6:2 E6:2 D#6:2 E6:2 F#6:2 A6:2",
    "B6:4 -:4 B5:4 -:4",
  ];

  const guitarScore = [
    // 1-4: イントロ
    "E4:2 -:2 E4:1 E4:1 G4:2 E4:1 E4:1 Bb4:2 E4:1 E4:1 B4:2",
    "E4:2 -:2 E4:1 E4:1 G4:2 E4:1 E4:1 Bb4:2 E4:1 E4:1 B4:2",
    "E4:1 E4:1 G4:2 E4:1 E4:1 Bb4:2 E4:1 E4:1 B4:2 E5:2 D#5:2",
    "E5:4 B4:4 F#4:4 -:4",

    // 5-12: Aメロ
    "E4:2 E4:1 -:1 G4:2 A4:2 B4:4 E5:4",
    "C5:2 C5:1 -:1 E5:2 F#5:2 G5:4 C6:4",
    "A4:2 A4:1 -:1 C5:2 D5:2 E5:4 A5:4",
    "F#4:4 A4:4 D#4:4 -:4",
    "E4:2 E4:1 -:1 G4:2 A4:2 B4:2 C5:2 B4:2 A4:2",
    "G4:2 G4:1 -:1 B4:2 D5:2 G5:4 B5:4",
    "C5:2 C5:1 -:1 E5:2 G5:2 C6:4 E6:4",
    "B4:4 D#5:4 F#5:4 -:4",

    // 13-20: Bメロ
    "F4:2 F4:1 -:1 Ab4:2 Bb4:2 C5:4 F5:4",
    "Db5:2 Db5:1 -:1 F5:2 Ab5:2 Db6:4 F6:4",
    "Bb4:2 Bb4:1 -:1 Db5:2 F5:2 Bb5:4 Db6:4",
    "G4:4 Bb4:4 E4:4 -:4",
    "F4:2 Ab4:2 C5:4 Db5:2 C5:2 Bb4:2 Ab4:2",
    "Ab4:2 C5:2 Eb5:4 Ab5:2 G5:2 F5:2 Eb5:2",
    "Db5:2 F5:2 Ab5:4 G5:2 F5:2 Eb5:2 Db5:2",
    "D#4:4 F#4:4 B4:4 -:4",

    // 21-28: サビ
    "E5:2 G5:2 B5:2 E6:2 B5:2 G5:2 E5:2 G5:2",
    "D5:2 F#5:2 A5:2 D6:2 A5:2 F#5:2 D5:2 F#5:2",
    "C5:2 E5:2 G5:2 C6:2 G5:2 E5:2 C5:2 E5:2",
    "B4:2 D#5:2 F#5:2 B5:2 F#5:2 D#5:2 B4:4",
    "E5:2 G5:2 B5:4 A5:2 G5:2 F#5:2 E5:2",
    "G5:2 B5:2 D6:4 C6:2 B5:2 A5:2 G5:2",
    "A5:2 C6:2 E6:4 D6:2 C6:2 B5:2 A5:2",
    "B5:4 D#6:4 F#6:4 -:4",

    // 29-32: ループブリッジ
    "C5:4 E5:4 G5:4 C6:4",
    "D5:4 F#5:4 A5:4 D6:4",
    "D#4:2 F#4:2 A4:2 C5:2 D#5:2 F#5:2 A5:2 C6:2",
    "B5:4 -:4 B4:4 -:4",
  ];

  const stringsScore = [
    // 1-4: イントロ
    "B4:1 C5:1 B4:1 C5:1 B4:1 C5:1 B4:1 C5:1 G4:4 -:4",
    "B4:1 C5:1 B4:1 C5:1 B4:1 C5:1 B4:1 C5:1 G4:4 -:4",
    "G4:2 Bb4:2 D#5:2 E5:4 G5:4 F#5:2",
    "G5:4 D#5:4 B4:4 -:4",

    // 5-12: Aメロ
    "-:6 E4:2 G4:2 B4:2 E5:2 G5:2",
    "A5:2 G5:2 E5:2 C5:2 A4:4 C5:4",
    "F#5:2 E5:2 C5:2 A4:2 F#4:4 A4:4",
    "B4:4 D#4:4 F#4:4 -:4",
    "G4:4 B4:4 D5:2 C5:2 B4:2 A4:2",
    "B4:4 D5:4 G5:2 F#5:2 E5:2 D5:2",
    "E5:4 G5:4 C6:2 B5:2 A5:2 G5:2",
    "F#5:4 D#5:4 B4:4 -:4",

    // 13-20: Bメロ
    "-:4 F4:4 Ab4:4 C5:4",
    "Db5:4 F4:4 Ab4:4 -:4",
    "-:4 Bb4:4 Db5:4 F5:4",
    "E5:4 C5:4 G4:4 -:4",
    "-:4 F4:4 Ab4:4 C5:4",
    "Eb5:4 C5:4 Ab4:4 -:4",
    "Db5:2 C5:2 Bb4:4 Ab4:2 G4:2 F4:4",
    "F#5:4 D#5:4 B4:4 -:4",

    // 21-28: サビ
    "G5:6 E5:2 B4:4 G4:4",
    "A5:4 F#5:2 D5:2 A4:4 D5:4",
    "E5:6 G5:2 E5:4 C5:4",
    "F#5:4 D#5:2 B4:2 F#4:4 -:4",
    "G5:3 A5:1 B5:4 A5:2 G5:2 F#5:4",
    "D5:3 E5:1 F#5:4 E5:2 D5:2 C5:4",
    "E5:2 G5:2 C6:4 B5:2 A5:2 G5:4",
    "F#5:4 D#5:4 B4:4 -:4",

    // 29-32: ループブリッジ
    "E5:4 G5:4 C6:4 E6:4",
    "F#5:4 A5:4 D6:4 F#6:4",
    "D#5:4 F#5:4 A5:4 C6:4",
    "B5:4 -:4 B4:4 -:4",
  ];

  const bassScore = [
    // 1-4: イントロ
    "E2:2 -:2 E2:1 E2:1 E3:2 E2:1 E2:1 D3:2 E2:1 E2:1 C3:2",
    "E2:1 E2:1 B2:2 E2:1 E2:1 A2:2 E2:1 E2:1 G2:2 F#2:2 D#2:2",
    "E2:1 E2:1 E3:2 E2:1 E2:1 E3:2 E2:1 E2:1 D3:2 E2:1 E2:1 C3:2",
    "B2:4 F#2:4 D#2:4 -:4",

    // 5-12: Aメロ
    "E2:1 E2:1 E3:2 E2:1 E2:1 B2:2 E2:1 E2:1 E3:2 B2:2 E2:2",
    "C2:1 C2:1 C3:2 C2:1 C2:1 G2:2 C2:1 C2:1 C3:2 G2:2 C2:2",
    "A2:1 A2:1 A3:2 A2:1 A2:1 E2:2 A2:1 A2:1 A3:2 E2:2 A2:2",
    "B2:1 B2:1 B3:2 B2:1 B2:1 F#2:2 B2:1 B2:1 B3:2 F#2:2 B2:2",
    "E2:1 E2:1 E3:2 E2:1 E2:1 B2:2 E2:1 E2:1 E3:2 B2:2 E2:2",
    "G2:1 G2:1 G3:2 G2:1 G2:1 D3:2 G2:1 G2:1 G3:2 D3:2 G2:2",
    "C2:1 C2:1 C3:2 C2:1 C2:1 G2:2 C2:1 C2:1 C3:2 G2:2 C2:2",
    "B2:4 F#2:4 D#2:4 -:4",

    // 13-20: Bメロ
    "F2:1 F2:1 F3:2 F2:1 F2:1 C3:2 F2:1 F2:1 F3:2 C3:2 F2:2",
    "Db2:1 Db2:1 Db3:2 Db2:1 Db2:1 Ab2:2 Db2:1 Db2:1 Db3:2 Ab2:2 Db2:2",
    "Bb2:1 Bb2:1 Bb3:2 Bb2:1 Bb2:1 F2:2 Bb2:1 Bb2:1 Bb3:2 F2:2 Bb2:2",
    "C2:1 C2:1 C3:2 C2:1 C2:1 G2:2 C2:1 C2:1 C3:2 G2:2 C2:2",
    "F2:1 F2:1 F3:2 F2:1 F2:1 C3:2 F2:1 F2:1 F3:2 C3:2 F2:2",
    "Ab2:1 Ab2:1 Ab3:2 Ab2:1 Ab2:1 Eb3:2 Ab2:1 Ab2:1 Ab3:2 Eb3:2 Ab2:2",
    "Db2:1 Db2:1 Db3:2 Db2:1 Db2:1 Ab2:2 Db2:1 Db2:1 Db3:2 Ab2:2 Db2:2",
    "B2:4 F#2:4 D#2:4 -:4",

    // 21-28: サビ
    "E2:1 E2:1 E3:2 E2:1 E2:1 E3:2 E2:1 E2:1 B2:2 D3:2 E3:2",
    "D2:1 D2:1 D3:2 D2:1 D2:1 D3:2 D2:1 D2:1 A2:2 C3:2 D3:2",
    "C2:1 C2:1 C3:2 C2:1 C2:1 C3:2 C2:1 C2:1 G2:2 B2:2 C3:2",
    "B2:1 B2:1 B3:2 B2:1 B2:1 B3:2 B2:1 B2:1 F#2:2 A2:2 B2:2",
    "E2:1 E2:1 E3:2 E2:1 E2:1 B2:2 E2:1 E2:1 E3:2 B2:2 E2:2",
    "G2:1 G2:1 G3:2 G2:1 G2:1 D3:2 G2:1 G2:1 G3:2 D3:2 G2:2",
    "A2:1 A2:1 A3:2 A2:1 A2:1 E2:2 A2:1 A2:1 A3:2 E2:2 A2:2",
    "B2:4 F#2:4 D#2:4 -:4",

    // 29-32: ループブリッジ
    "C2:2 C2:2 E3:2 G3:2 C2:2 C2:2 E3:2 G3:2",
    "D2:2 D2:2 F#3:2 A3:2 D2:2 D2:2 F#3:2 A3:2",
    "D#2:2 F#2:2 A2:2 C3:2 D#3:2 F#3:2 A3:2 C4:2",
    "B2:4 -:4 B1:4 -:4",
  ];

  const lead = [], guitar = [], strings = [], bass = [], piano = [];
  const kick = [], snare = [], hats = [];

  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]];
    const climax = bar >= 20 && bar < 28;
    const lift = climax ? 1.0 : 0.94;

    // 1. リードブラス（警報サイレン＆主題）
    lead.push(...parseBar(riff[bar]).map(([n, l], i) => [n, l, lift * (i % 2 === 0 ? 1 : 0.9)]));

    // 2. スティールギター（鋭利なヘヴィリフ＆アルペジオ）
    guitar.push(...parseBar(guitarScore[bar]).map(([n, l], i) => [n, l, lift * 0.92]));

    // 3. ストリングス（包囲網カウンター）
    strings.push(...parseBar(stringsScore[bar]).map(([n, l], i) => [n, l, lift * 0.88]));

    // 4. スラップベース（16分暴走チョッパー）
    bass.push(...parseBar(bassScore[bar]));

    // 5. ピアノ（不穏なクラスター打鍵＆スタッカート）
    if (bar === 0) {
      piano.push(...parseBar("E3:2 -:14"));
    } else if (bar === 1) {
      piano.push(...parseBar("-:8 E4:2 G4:2 Bb4:2 B4:2"));
    } else if (bar === 2) {
      piano.push(...parseBar("G4:2 Bb4:2 B4:2 E5:2 G5:2 F#5:2 E5:2 D#5:2"));
    } else if (bar === 3 || bar === 11 || bar === 19 || bar === 27) {
      piano.push(...parseBar(`${c[0]}:4 ${c[1]}:4 ${c[2]}:4 -:4`));
    } else if (bar === 28) {
      piano.push(...parseBar("C4:2 E4:2 G4:2 C5:2 C4:2 E4:2 G4:2 C5:2"));
    } else if (bar === 29) {
      piano.push(...parseBar("D4:2 F#4:2 A4:2 D5:2 D4:2 F#4:2 A4:2 D5:2"));
    } else if (bar === 30) {
      piano.push(...parseBar("D#4:2 F#4:2 A4:2 C5:2 D#5:2 F#5:2 A5:2 C6:2"));
    } else if (bar === 31) {
      piano.push(...parseBar("B4:4 -:4 B3:4 -:4"));
    } else if (climax) {
      piano.push(...parseBar(`${c[0]}:1 ${c[1]}:1 ${c[2]}:1 ${c[3] || c[0]}:1 ${octave(c[0], 5)}:1 ${c[2]}:1 ${c[1]}:1 ${c[0]}:1 ${c[0]}:1 ${c[1]}:1 ${c[2]}:1 ${c[3] || c[0]}:1 ${octave(c[0], 5)}:1 ${c[2]}:1 ${c[1]}:1 ${c[0]}:1`));
    } else {
      piano.push(...parseBar(`${c[0]}:2 -:1 ${c[2]}:1 ${c[1]}:2 -:1 ${c[2]}:1 ${c[0]}:2 -:1 ${c[2]}:1 ${c[1]}:2 -:2`));
    }

    // 6. キック
    if (bar === 0) {
      kick.push(...parseBar("C2:2 -:14"));
    } else if (bar === 1) {
      kick.push(...parseBar("-:8 C2:2 -:2 C2:2 C2:2"));
    } else if (bar === 2) {
      kick.push(...parseBar("C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 -:2"));
    } else if (bar === 3 || bar === 11 || bar === 19 || bar === 27) {
      kick.push(...parseBar("C2:4 C2:4 C2:4 -:4"));
    } else if (bar === 28 || bar === 29) {
      kick.push(...parseBar("C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2"));
    } else if (bar === 30) {
      kick.push(...parseBar("C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1"));
    } else if (bar === 31) {
      kick.push(...parseBar("C2:4 -:4 C2:4 -:4"));
    } else {
      kick.push(...parseBar("C2:2 -:2 C2:2 C2:1 C2:1 C2:2 -:2 C2:2 C2:2"));
    }

    // 7. スネア
    if (bar === 0) {
      snare.push(...parseBar("C2:2 -:14"));
    } else if (bar === 1) {
      snare.push(...parseBar("-:16"));
    } else if (bar === 2) {
      snare.push(...parseBar("-:8 C2:2 C2:2 C2:2 C2:2"));
    } else if (bar === 3 || bar === 11 || bar === 19 || bar === 27) {
      snare.push(...parseBar("C2:4 C2:4 C2:4 -:4"));
    } else if (bar === 29) {
      snare.push(...parseBar("C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2"));
    } else if (bar === 30) {
      snare.push(...parseBar("C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1"));
    } else if (bar === 31) {
      snare.push(...parseBar("C2:4 -:4 C2:4 -:4"));
    } else {
      snare.push(...parseBar("-:4 C2:4 -:4 C2:4"));
    }

    // 8. ハット
    if (bar === 0) {
      hats.push(...parseBar("-:16"));
    } else if (bar === 1) {
      hats.push(...parseBar("-:8 C5:2 C5:2 C5:2 C5:2"));
    } else if (bar === 3 || bar === 11 || bar === 19 || bar === 27) {
      hats.push(...parseBar("C5:4 C5:4 C5:4 -:4"));
    } else if (bar === 30) {
      hats.push(...parseBar("C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1"));
    } else if (bar === 31) {
      hats.push(...parseBar("C5:4 -:4 C5:4 -:4"));
    } else {
      hats.push(...parseBar("C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2"));
    }
  }

  return {
    name: "monster_house", title: "突破口", tempo: 162, loop: true, bars: 32,
    desc: "E短調。32小節・約47秒。モンスターハウス（MH）テーマ。部屋に突入した瞬間のけたたましい警報サイレン動機から雪崩れ込む、超高速162 BPMのサバイバル戦闘アンサンブル。唸るスラップベースの暴走チョッパー、スティールギターとブラスリードが切り裂くヘヴィメタル・ユニゾン、Fマイナーへの半音跳躍転調による逃げ場なき切迫感、そして包囲網をなぎ倒す怒涛のサビと全パート一斉ブレイク。",
    tracks: [
      { type: "sine", instrument: "brassLead", volume: 0.30, gate: 0.88, pan: -0.08, cutoff: 4800, roomSend: 0.22, notes: lead },
      { type: "sine", instrument: "steelGuitar", volume: 0.28, gate: 0.82, pan: 0.25, cutoff: 4600, roomSend: 0.18, notes: guitar },
      { type: "sine", instrument: "feltPiano", volume: 0.20, gate: 0.68, pan: -0.26, cutoff: 3600, roomSend: 0.16, notes: piano },
      { type: "sine", instrument: "softStrings", volume: 0.16, gate: 0.90, pan: 0.40, cutoff: 3200, roomSend: 0.28, notes: strings },
      { type: "sine", instrument: "slapBass", volume: 0.40, gate: 0.74, pan: 0, cutoff: 880, notes: bass },
      { type: "sine", instrument: "drumKick", volume: 0.32, pan: 0, cutoff: 1200, notes: kick },
      { type: "sine", instrument: "drumSnare", volume: 0.26, pan: 0.06, cutoff: 5000, roomSend: 0.10, notes: snare },
      { type: "sine", instrument: "drumHat", volume: 0.14, pan: 0.28, cutoff: 7500, notes: hats },
    ],
  };
}
export const BGM_MONSTER_HOUSE = monsterHouseTheme();

// 店・行商人テーマ。G長調・116 BPM。ドラムレスのアコーディオン・マリンバ・ピチカートによるミュゼット風アンサンブル。
function shopTheme() {
  const chords = [
    // 1-8: 主題A 蚤の市の朝・ランプの灯り
    "G", "Em", "Am", "D", "G", "E7", "Am", "D",
    // 9-16: 主題B 珍品のショーケース・品定め
    "C", "G", "Am", "D", "Bm", "Em", "Am", "D",
    // 17-24: 展開部C 奥の小部屋・秘密の骨董品
    "Em", "Bm", "C", "G", "Am", "B", "Em", "D",
    // 25-32: サビ〜クライマックスD 掘り出し物のダンス・温かい見送り
    "G", "E7", "Am", "D", "Bm", "Em", "Am", "G",
  ];

  const melody = [
    // 1-8
    "B4:3 C5:1 D5:2 B4:2 G4:3 A4:1 B4:4", "G4:3 A4:1 B4:2 G4:2 E4:4 G4:4",
    "A4:3 B4:1 C5:2 E5:2 A5:4 G5:2 E5:2", "F#5:3 E5:1 D5:2 F#4:2 A4:4 D5:4",
    "B4:3 C5:1 D5:2 G5:2 B5:4 A5:2 G5:2", "G#5:3 F#5:1 E5:2 D5:2 B4:4 E5:4",
    "C5:2 E5:2 A5:4 F#5:3 E5:1 D5:4", "G4:4 B4:4 D5:4 -:4",
    // 9-16
    "E5:3 F#5:1 G5:4 C6:4 B5:2 A5:2", "D5:3 E5:1 F#5:4 B5:4 A5:2 G5:2",
    "C5:2 E5:2 A5:4 G5:2 F#5:2 E5:4", "F#5:3 G5:1 A5:4 D6:4 -:4",
    "F#5:3 G5:1 A5:2 F#5:2 D5:4 F#5:4", "G5:3 A5:1 B5:2 G5:2 E5:4 G5:4",
    "A5:3 B5:1 C6:2 B5:2 A5:2 G5:2 F#5:2 E5:2", "D5:4 F#5:4 A5:4 -:4",
    // 17-24
    "E5:4 G5:2 B5:2 E6:4 D6:2 B5:2", "D6:4 B5:2 F#5:2 D5:4 F#5:4",
    "E5:4 G5:2 C6:2 E6:4 D6:2 C6:2", "B5:4 G5:2 D5:2 B4:4 D5:4",
    "C5:2 E5:2 A5:4 G5:2 E5:2 C5:4", "D#5:2 F#5:2 B5:4 A5:2 F#5:2 D#5:4",
    "E5:6 -:2 G5:4 B5:4", "A5:4 F#5:4 D5:4 -:4",
    // 25-32
    "B5:3 C6:1 D6:2 B5:2 G5:3 A5:1 B5:4", "G#5:3 A5:1 B5:2 D6:2 E6:4 B5:4",
    "C6:3 B5:1 A5:2 G5:2 F#5:2 G5:2 A5:4", "D6:4 B5:2 A5:2 G5:4 F#5:4",
    "F#5:2 G5:2 A5:4 D5:2 F#5:2 A5:4", "G5:2 A5:2 B5:4 E5:2 G5:2 B5:4",
    "C6:2 B5:2 A5:2 G5:2 F#5:4 D5:4", "G5:8 -:8",
  ];

  const lead = [], comping = [], marimba = [], pizz = [], bass = [];

  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]];
    const bridge = bar >= 16 && bar < 24;
    const climax = bar >= 24;
    const lift = climax ? 1.0 : bridge ? 0.94 : 0.96;

    // 1. アコーディオン主旋律（ミュゼット・シャンソン風の豊かな表情）
    lead.push(...parseBar(melody[bar]).map(([note, length], index) => [
      note,
      length,
      lift * (index % 3 === 0 ? 1 : 0.92),
    ]));

    // 2. アコーディオン伴奏（小気味良い裏打ちスタッカート: ズッ・チャッ・ズッ・チャッ）
    comping.push(...parseBar(
      `-:2 ${c[1]}:2:0.64 -:2 ${c[2]}:2:0.56 -:2 ${c[1]}:2:0.66 -:2 ${c[3] || c[0]}:2:0.58`
    ));

    // 3. マリンバ（木琴・トイパーカッション）: コロコロと転がる愛らしい装飾・アルペジオ
    marimba.push(...parseBar(bar % 2 === 1
      ? `-:8 ${octave(c[2], 5)}:2:0.62 ${octave(c[1], 5)}:2:0.55 ${octave(c[0], 5)}:2:0.58 -:2`
      : climax
        ? `${octave(c[0], 5)}:2:0.55 ${octave(c[1], 5)}:2:0.5 ${octave(c[2], 5)}:2:0.58 ${octave(c[3] || c[0], 5)}:2:0.52 -:8`
        : "-:16"
    ));

    // 4. ピチカート弦: 愛嬌たっぷりの対位ライン・指弾きステップ
    pizz.push(...parseBar(bridge
      ? `${octave(c[0], 4)}:4:0.7 ${octave(c[2], 4)}:4:0.6 ${octave(c[1], 4)}:4:0.65 ${octave(c[2], 4)}:4:0.58`
      : `${octave(c[0], 4)}:2:0.75 -:2 ${octave(c[2], 4)}:2:0.62 -:2 ${octave(c[1], 4)}:2:0.68 -:2 ${octave(c[2], 4)}:2:0.6 -:2`
    ));

    // 5. ウッドベース: どっしりと温かい2ビート低音
    const root = octave(c[0], 2), fifth = octave(c[2], 2);
    bass.push(...parseBar(climax
      ? `${root}:3:0.8 -:1 ${fifth}:3:0.68 -:1 ${root}:3:0.75 -:1 ${fifth}:3:0.65 -:1`
      : `${root}:4:0.78 -:4 ${fifth}:4:0.72 -:4`
    ));
  }

  return {
    name: "shop", title: "小さな灯の店", tempo: 116, loop: true, bars: 32,
    desc: "G長調。32小節・約66秒。店・行商人テーマ。ドラムセットを完全廃止し、哀愁漂うアコーディオンのミュゼット旋律、コロコロと転がるマリンバ（木琴）、小気味良いピチカート弦と温かいウッドベースで紡ぐ、フレンチ・カフェ＆蚤の市風アコースティック・アンサンブル。",
    tracks: [
      { type: "sine", instrument: "accordion", volume: 0.32, gate: 0.88, pan: -0.08, cutoff: 4600, roomSend: 0.24, notes: lead },
      { type: "sine", instrument: "accordion", volume: 0.20, gate: 0.65, pan: 0.24, cutoff: 3600, roomSend: 0.18, notes: comping },
      { type: "sine", instrument: "marimba", volume: 0.24, gate: 0.70, pan: 0.36, cutoff: 5200, roomSend: 0.28, notes: marimba },
      { type: "sine", instrument: "pizzicato", volume: 0.26, gate: 0.75, pan: -0.32, cutoff: 3800, roomSend: 0.22, notes: pizz },
      { type: "sine", instrument: "roundBass", volume: 0.36, gate: 0.80, pan: 0, cutoff: 700, notes: bass },
    ],
  };
}
export const BGM_SHOP = shopTheme();

// ボス戦テーマ。D短調・158 BPM。FF3『バトル2』をオマージュした超高速・怒涛のバトルアンサンブル。
function bossBattleTheme() {
  const chords = [
    // 1-4: 【衝撃のイントロ】Dm一撃打 ➔ 狂気の16分ベースラン ➔ 緊迫のファンファーレ
    "Dm", "Dm", "Dm", "A",
    // 5-12: 【Aメロ】疾走する第1主題（和声短調・対位法・マシンガンベース）
    "Dm", "Gm", "C", "F", "Bb", "Gm", "A", "A",
    // 13-20: 【Bメロ】劇的転調（Bbマイナー・Dbへの突入・カノンの掛け合い）
    "Bbm", "Gb", "Ab", "Db", "Ebm", "Fm", "Gb", "A",
    // 21-28: 【サビ】哀愁と熱狂のクライマックス（限界突破・ハイスピード解放）
    "Dm", "C", "Bb", "A", "Dm", "Gm", "C", "F",
    // 29-32: 【ループブリッジ】ディミニッシュの減七テンション ➔ 全パート一斉ブレイク
    "Bb", "C", "CsharpDim", "A",
  ];

  const riff = [
    // 1-4: イントロ
    "D5:2 -:2 -:4 -:8",
    "-:8 A4:2 D5:2 E5:2 F5:2",
    "G5:2 A5:4 D6:4 C#6:2 D6:4",
    "E6:4 C#6:4 A5:4 -:4",

    // 5-12: Aメロ
    "D5:2 D5:1 -:1 F5:2 G5:2 A5:4 D6:4",
    "Bb5:3 A5:1 G5:2 F5:2 E5:4 G5:4",
    "C5:2 C5:1 -:1 E5:2 F5:2 G5:4 C6:4",
    "A5:3 G5:1 F5:2 E5:2 D5:4 F5:4",
    "Bb5:2 D6:2 F6:4 E6:2 D6:2 C#6:2 D6:2",
    "G5:2 Bb5:2 D6:4 C6:2 Bb5:2 A5:2 G5:2",
    "E5:2 G5:2 C#6:4 Bb5:2 A5:2 G5:2 E5:2",
    "A5:4 C#6:4 E6:4 -:4",

    // 13-20: Bメロ（転調）
    "F5:4 Bb5:4 Db6:4 C6:2 Bb5:2",
    "Gb5:4 Bb5:4 Db6:4 Bb5:4",
    "Ab5:4 C6:4 Eb6:4 Db6:2 C6:2",
    "F5:4 Ab5:4 Db6:4 -:4",
    "Gb5:3 F5:1 Eb5:2 Gb5:2 Bb5:4 Ab5:2 Gb5:2",
    "Ab5:3 G5:1 F5:2 Ab5:2 C6:4 Bb5:2 Ab5:2",
    "Bb5:2 Db6:2 Gb6:4 F6:2 Eb6:2 Db6:2 C6:2",
    "C#6:4 A5:4 E5:4 -:4",

    // 21-28: サビ
    "D6:6 A5:2 F5:4 D5:4",
    "E6:4 C6:2 G5:2 E5:4 G5:4",
    "F6:6 D6:2 Bb5:4 G5:4",
    "A6:4 E6:2 C#6:2 A5:4 -:4",
    "D6:3 E6:1 F6:4 E6:2 D6:2 C6:4",
    "Bb5:3 C6:1 D6:4 C6:2 Bb5:2 A5:4",
    "G5:2 C6:2 E6:4 D6:2 C6:2 B5:4",
    "A5:4 C6:4 F6:4 -:4",

    // 29-32: ループブリッジ
    "D6:3 C6:1 Bb5:2 A5:2 Bb5:4 D6:4",
    "E6:3 D6:1 C6:2 B5:2 C6:4 E6:4",
    "G6:2 F6:2 E6:2 D6:2 C#6:2 D6:2 E6:2 G6:2",
    "A6:4 -:4 A5:4 -:4",
  ];

  const stringsScore = [
    // 1-4: イントロ
    "D4:2 -:2 -:4 -:8",
    "-:8 D4:2 F4:2 G4:2 A4:2",
    "Bb4:2 C5:4 F5:4 E5:2 F5:4",
    "G5:4 E5:4 C#5:4 -:4",

    // 5-12: Aメロ（主旋律との対位法・隙間を埋めるカウンター）
    "-:6 D4:2 F4:2 A4:2 D5:2 F5:2",
    "G5:2 F5:2 D5:2 Bb4:2 G4:4 Bb4:4",
    "-:6 C4:2 E4:2 G4:2 C5:2 E5:2",
    "F5:2 E5:2 C5:2 A4:2 F4:4 A4:4",
    "D5:4 F5:4 G5:2 F5:2 E5:2 D5:2",
    "Bb4:4 D5:4 E5:2 D5:2 C5:2 Bb4:2",
    "G4:4 Bb4:4 A4:2 G4:2 F#4:2 G4:2",
    "A4:4 E4:4 C#4:4 -:4",

    // 13-20: Bメロ（カノン・追唱）
    "-:4 F4:4 Bb4:4 Db5:4",
    "Eb5:4 Gb4:4 Bb4:4 Gb4:4",
    "-:4 Ab4:4 C5:4 Eb5:4",
    "Db5:4 F4:4 Ab4:4 -:4",
    "-:4 Gb4:4 Bb4:4 Db5:4",
    "-:4 Ab4:4 C5:4 Eb5:4",
    "Db5:2 F5:2 Bb5:4 Ab5:2 Gb5:2 F5:2 Eb5:2",
    "E5:4 C#5:4 A4:4 -:4",

    // 21-28: サビ（伸びやかな和声オブリガート）
    "F5:6 D5:2 A4:4 F4:4",
    "G5:4 E5:2 C5:2 G4:4 C5:4",
    "D5:6 F5:2 D5:4 Bb4:4",
    "E5:4 C#5:2 A4:2 E4:4 -:4",
    "F5:3 G5:1 A5:4 G5:2 F5:2 E5:4",
    "D5:3 E5:1 F5:4 E5:2 D5:2 C5:4",
    "B4:2 E5:2 G5:4 F5:2 E5:2 D5:4",
    "C5:4 F5:4 A5:4 -:4",

    // 29-32: ループブリッジ
    "Bb4:4 D5:4 F5:4 Bb5:4",
    "C5:4 E5:4 G5:4 C6:4",
    "C#5:4 E5:4 G5:4 Bb5:4",
    "A5:4 -:4 A4:4 -:4",
  ];

  const bassScore = [
    // 1-4: イントロ（衝撃のD2一撃打 ➔ 狂気の16分ベースラン）
    "D2:2 -:2 D2:1 D2:1 D3:2 D2:1 D2:1 C3:2 D2:1 D2:1 Bb2:2",
    "D2:1 D2:1 A2:2 D2:1 D2:1 G2:2 D2:1 D2:1 F2:2 E2:2 C#2:2",
    "D2:1 D2:1 D3:2 D2:1 D2:1 D3:2 D2:1 D2:1 C3:2 D2:1 D2:1 Bb2:2",
    "A2:4 E2:4 C#2:4 -:4",

    // 5-12: Aメロ（16分ノンストップ・マシンガンベースラン）
    "D2:1 D2:1 D3:2 D2:1 D2:1 A2:2 D2:1 D2:1 D3:2 A2:2 D2:2",
    "G2:1 G2:1 G3:2 G2:1 G2:1 D3:2 G2:1 G2:1 G3:2 D3:2 G2:2",
    "C2:1 C2:1 C3:2 C2:1 C2:1 G2:2 C2:1 C2:1 C3:2 G2:2 C2:2",
    "F2:1 F2:1 F3:2 F2:1 F2:1 C3:2 F2:1 F2:1 F3:2 C3:2 F2:2",
    "Bb2:1 Bb2:1 Bb3:2 Bb2:1 Bb2:1 F2:2 Bb2:1 Bb2:1 Bb3:2 F2:2 Bb2:2",
    "G2:1 G2:1 G3:2 G2:1 G2:1 D3:2 G2:1 G2:1 G3:2 D3:2 G2:2",
    "A2:1 A2:1 A3:2 A2:1 A2:1 E2:2 A2:1 A2:1 A3:2 G2:2 E2:2",
    "A2:4 E2:4 C#2:4 -:4",

    // 13-20: Bメロ（転調ベースラン）
    "Bb2:1 Bb2:1 Bb3:2 Bb2:1 Bb2:1 F2:2 Bb2:1 Bb2:1 Bb3:2 F2:2 Bb2:2",
    "Gb2:1 Gb2:1 Gb3:2 Gb2:1 Gb2:1 Db3:2 Gb2:1 Gb2:1 Gb3:2 Db3:2 Gb2:2",
    "Ab2:1 Ab2:1 Ab3:2 Ab2:1 Ab2:1 Eb3:2 Ab2:1 Ab2:1 Ab3:2 Eb3:2 Ab2:2",
    "Db2:1 Db2:1 Db3:2 Db2:1 Db2:1 Ab2:2 Db2:1 Db2:1 Db3:2 Ab2:2 Db2:2",
    "Eb2:1 Eb2:1 Eb3:2 Eb2:1 Eb2:1 Bb2:2 Eb2:1 Eb2:1 Eb3:2 Bb2:2 Eb2:2",
    "F2:1 F2:1 F3:2 F2:1 F2:1 C3:2 F2:1 F2:1 F3:2 C3:2 F2:2",
    "Gb2:1 Gb2:1 Gb3:2 Gb2:1 Gb2:1 Db3:2 Gb2:1 Gb2:1 Gb3:2 Db3:2 Gb2:2",
    "A2:4 E2:4 C#2:4 -:4",

    // 21-28: サビ（ドライブする16分疾走）
    "D2:1 D2:1 D3:2 D2:1 D2:1 D3:2 D2:1 D2:1 A2:2 C3:2 D3:2",
    "C2:1 C2:1 C3:2 C2:1 C2:1 C3:2 C2:1 C2:1 G2:2 B2:2 C3:2",
    "Bb2:1 Bb2:1 Bb3:2 Bb2:1 Bb2:1 Bb3:2 Bb2:1 Bb2:1 F2:2 A2:2 Bb2:2",
    "A2:1 A2:1 A3:2 A2:1 A2:1 A3:2 A2:1 A2:1 E2:2 G2:2 A2:2",
    "D2:1 D2:1 D3:2 D2:1 D2:1 A2:2 D2:1 D2:1 D3:2 A2:2 D2:2",
    "G2:1 G2:1 G3:2 G2:1 G2:1 D3:2 G2:1 G2:1 G3:2 D3:2 G2:2",
    "C2:1 C2:1 C3:2 C2:1 C2:1 G2:2 C2:1 C2:1 C3:2 G2:2 C2:2",
    "F2:4 C2:4 F2:4 -:4",

    // 29-32: ループブリッジ
    "Bb2:2 Bb2:2 D3:2 F3:2 Bb2:2 Bb2:2 D3:2 F3:2",
    "C2:2 C2:2 E3:2 G3:2 C2:2 C2:2 E3:2 G3:2",
    "C#2:2 E2:2 G2:2 Bb2:2 C#3:2 E3:2 G3:2 Bb3:2",
    "A2:4 -:4 A1:4 -:4",
  ];

  const lead = [], piano = [], strings = [], bass = [];
  const kick = [], snare = [], hats = [];

  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]];
    const climax = bar >= 20 && bar < 28;
    const lift = climax ? 1.0 : 0.94;

    // 1. リードブラス（切り裂く主旋律）
    lead.push(...parseBar(riff[bar]).map(([n, l], i) => [n, l, lift * (i % 2 === 0 ? 1 : 0.9)]));

    // 2. ピアノ（超高速アルペジオ＆スタッカート）
    if (bar === 0) {
      piano.push(...parseBar("D4:2 -:14"));
    } else if (bar === 1) {
      piano.push(...parseBar("-:8 D5:2 F5:2 A5:2 D6:2"));
    } else if (bar === 2) {
      piano.push(...parseBar("F5:2 A5:2 D6:2 F6:2 E6:2 D6:2 C#6:2 E6:2"));
    } else if (bar === 3 || bar === 11 || bar === 19 || bar === 27) {
      piano.push(...parseBar(`${c[0]}:4 ${c[1]}:4 ${c[2]}:4 -:4`));
    } else if (bar === 30) {
      piano.push(...parseBar("C#4:2 E4:2 G4:2 Bb4:2 C#5:2 E5:2 G5:2 Bb5:2"));
    } else if (bar === 31) {
      piano.push(...parseBar("A4:4 -:4 A4:4 -:4"));
    } else if (climax) {
      piano.push(...parseBar(`${c[0]}:1 ${c[1]}:1 ${c[2]}:1 ${c[3] || c[0]}:1 ${octave(c[0], 5)}:1 ${c[2]}:1 ${c[1]}:1 ${c[0]}:1 ${c[0]}:1 ${c[1]}:1 ${c[2]}:1 ${c[3] || c[0]}:1 ${octave(c[0], 5)}:1 ${c[2]}:1 ${c[1]}:1 ${c[0]}:1`));
    } else {
      piano.push(...parseBar(`${c[0]}:2 -:1 ${c[2]}:1 ${c[1]}:2 -:1 ${c[2]}:1 ${c[0]}:2 -:1 ${c[2]}:1 ${c[1]}:2 -:2`));
    }

    // 3. ストリングス（対位法・カウンター旋律）
    strings.push(...parseBar(stringsScore[bar]).map(([n, l], i) => [n, l, lift * 0.9]));

    // 4. スラップベース（怒涛の16分マシンガン）
    bass.push(...parseBar(bassScore[bar]));

    // 5. キック
    if (bar === 0) {
      kick.push(...parseBar("C2:2 -:14"));
    } else if (bar === 1) {
      kick.push(...parseBar("-:8 C2:2 -:2 C2:2 C2:2"));
    } else if (bar === 2) {
      kick.push(...parseBar("C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 -:2"));
    } else if (bar === 3 || bar === 11 || bar === 19 || bar === 27) {
      kick.push(...parseBar("C2:4 C2:4 C2:4 -:4"));
    } else if (bar === 28 || bar === 29) {
      kick.push(...parseBar("C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2"));
    } else if (bar === 30) {
      kick.push(...parseBar("C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1 C2:1"));
    } else if (bar === 31) {
      kick.push(...parseBar("C2:4 -:4 C2:4 -:4"));
    } else {
      kick.push(...parseBar("C2:2 -:2 C2:2 C2:1 C2:1 C2:2 -:2 C2:2 C2:2"));
    }

    // 6. スネア
    if (bar === 0) {
      snare.push(...parseBar("C2:2 -:14"));
    } else if (bar === 1) {
      snare.push(...parseBar("-:16"));
    } else if (bar === 2) {
      snare.push(...parseBar("-:8 C2:2 C2:2 C2:2 C2:2"));
    } else if (bar === 3 || bar === 11 || bar === 19 || bar === 27) {
      snare.push(...parseBar("C2:4 C2:4 C2:4 -:4"));
    } else if (bar === 30) {
      snare.push(...parseBar("C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2 C2:2"));
    } else if (bar === 31) {
      snare.push(...parseBar("C2:4 -:4 C2:4 -:4"));
    } else {
      snare.push(...parseBar("-:4 C2:4 -:4 C2:4"));
    }

    // 7. ハット
    if (bar === 0) {
      hats.push(...parseBar("-:16"));
    } else if (bar === 1) {
      hats.push(...parseBar("-:8 C5:2 C5:2 C5:2 C5:2"));
    } else if (bar === 3 || bar === 11 || bar === 19 || bar === 27) {
      hats.push(...parseBar("C5:4 C5:4 C5:4 -:4"));
    } else if (bar === 30) {
      hats.push(...parseBar("C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1 C5:1"));
    } else if (bar === 31) {
      hats.push(...parseBar("C5:4 -:4 C5:4 -:4"));
    } else {
      hats.push(...parseBar("C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2"));
    }
  }

  return {
    name: "boss", title: "誓いの刃", tempo: 158, loop: true, bars: 32,
    desc: "D短調。32小節・約48秒。ボス戦テーマ。FF3『バトル2』の熱狂と緊迫感をオマージュした超高速バトルアンサンブル。一撃打から雪崩れ込む狂気の16分マシンガンベースラン、和声短調を切り裂く分厚いブラスリード、主旋律と激しく追走する対位法ストリングス、Bbマイナーへのドラマチックな転調とディミニッシュの減七緊張、全パート一斉ブレイクが織りなす極限の死闘。",
    tracks: [
      { type: "sine", instrument: "brassLead", volume: 0.32, gate: 0.88, pan: -0.06, cutoff: 4800, roomSend: 0.22, notes: lead },
      { type: "sine", instrument: "feltPiano", volume: 0.22, gate: 0.68, pan: 0.28, cutoff: 3600, roomSend: 0.18, notes: piano },
      { type: "sine", instrument: "softStrings", volume: 0.18, gate: 0.90, pan: -0.42, cutoff: 3200, roomSend: 0.30, notes: strings },
      { type: "sine", instrument: "slapBass", volume: 0.40, gate: 0.74, pan: 0, cutoff: 850, notes: bass },
      { type: "sine", instrument: "drumKick", volume: 0.32, pan: 0, cutoff: 1200, notes: kick },
      { type: "sine", instrument: "drumSnare", volume: 0.25, pan: 0.06, cutoff: 5000, roomSend: 0.10, notes: snare },
      { type: "sine", instrument: "drumHat", volume: 0.14, pan: 0.28, cutoff: 7500, notes: hats },
    ],
  };
}
export const BGM_BOSS = bossBattleTheme();

// ゲームオーバーテーマ。D短調・66 BPM。力尽きた冒険者の魂に捧げる荘厳で切ないレクイエム。
function gameOverTheme() {
  const chords = [
    // 1-2: 命の灯火が消える瞬間
    "Dm", "Bb",
    // 3-4: 後悔と冷たい静寂
    "Gm", "A",
    // 5-6: 走馬灯・冒険の記憶
    "Dm", "Bb",
    // 7-8: 永遠の眠り・終止
    "Gm", "Dm",
  ];

  const melody = [
    "A5:4 F5:4 E5:4 D5:4",
    "F5:4 D5:2 F5:2 Bb5:4 -:4",
    "G5:4 Bb5:2 D6:2 C6:4 Bb5:4",
    "A5:6 G5:2 E5:4 C#5:4",
    "D5:4 F5:2 A5:2 D6:4 C6:2 Bb5:2",
    "A5:4 F5:2 D5:2 Bb4:4 D5:4",
    "E5:4 G5:2 Bb5:2 A5:4 G5:4",
    "E5:4 C#5:4 D5:8",
  ];

  const stringsScore = [
    "F4:8 A4:8", "D4:8 F4:8", "Bb4:8 D5:8", "C#4:8 E4:8",
    "F4:8 A4:8", "D4:8 F4:8", "Bb3:8 D4:8", "A3:4 C#4:4 D4:8",
  ];

  const pianoScore = [
    "D4:2 F4:2 A4:2 D5:2 F5:2 A5:2 F5:2 D5:2",
    "Bb3:2 D4:2 F4:2 Bb4:2 D5:2 F5:2 D5:2 Bb4:2",
    "G3:2 Bb3:2 D4:2 G4:2 Bb4:2 D5:2 Bb4:2 G4:2",
    "A3:2 C#4:2 E4:2 A4:2 C#5:2 E5:2 C#5:2 A4:2",
    "D4:2 F4:2 A4:2 D5:2 F5:2 A5:2 F5:2 D5:2",
    "Bb3:2 D4:2 F4:2 Bb4:2 D5:2 F5:2 D5:2 Bb4:2",
    "G3:2 Bb3:2 D4:2 G4:2 Bb4:2 D5:2 Bb4:2 G4:2",
    "A3:2 C#4:2 E4:2 G4:2 D4:4 -:4",
  ];

  const bassScore = [
    "D2:8 -:8", "Bb1:8 -:8", "G1:8 -:8", "A1:8 -:8",
    "D2:8 -:8", "Bb1:8 -:8", "G1:8 -:8", "A1:4 -:4 D1:8",
  ];

  const kickScore = [
    "C2:4 -:12", "C2:4 -:12", "C2:4 -:12", "C2:4 -:12",
    "C2:4 -:12", "C2:4 -:12", "C2:4 -:12", "-:16",
  ];

  const flute = [], piano = [], strings = [], bass = [], kick = [];

  for (let bar = 0; bar < chords.length; bar++) {
    flute.push(...parseBar(melody[bar]).map(([n, l]) => [n, l, 0.88]));
    strings.push(...parseBar(stringsScore[bar]).map(([n, l]) => [n, l, 0.82]));
    piano.push(...parseBar(pianoScore[bar]).map(([n, l]) => [n, l, 0.72]));
    bass.push(...parseBar(bassScore[bar]));
    kick.push(...parseBar(kickScore[bar]));
  }

  return {
    name: "gameover", title: "灯りの消える頃", tempo: 66, loop: false, bars: 8,
    desc: "D短調。8小節・約29秒。ゲームオーバーテーマ。力尽きた冒険者の魂に捧げる荘厳で切ないレクイエム。冷たい石畳に降る雨のように静かに響くピアノアルペジオ、息遣いと哀愁を帯びた木管フルートの旋律、重く悲哀を湛えるストリングスと深淵のベース、そして心臓の鼓動のようにゆっくりと消えゆく余韻。",
    tracks: [
      { type: "sine", instrument: "woodFlute", volume: 0.26, gate: 0.90, pan: -0.06, cutoff: 4000, roomSend: 0.32, notes: flute },
      { type: "sine", instrument: "feltPiano", volume: 0.24, gate: 0.75, pan: 0.28, cutoff: 3400, roomSend: 0.24, notes: piano },
      { type: "sine", instrument: "softStrings", volume: 0.20, gate: 0.94, pan: -0.38, cutoff: 2800, roomSend: 0.35, notes: strings },
      { type: "sine", instrument: "roundBass", volume: 0.36, gate: 0.85, pan: 0, cutoff: 650, notes: bass },
      { type: "sine", instrument: "drumKick", volume: 0.28, pan: 0, cutoff: 800, notes: kick },
    ],
  };
}
export const BGM_GAMEOVER = gameOverTheme();
// ゲームクリア・帰還テーマ。C長調・116 BPM。死線を越えた冒険者を称える壮大なシンフォニック・ファンファーレ＆讃歌。
function gameClearTheme() {
  const chords = [
    // 1-4: 凱旋ファンファーレ
    "C", "F", "G", "C",
    // 5-8: Aメロ（朝光の讃歌）
    "C", "Em", "F", "G",
    // 9-12: Bメロ（旅路の追想）
    "Am", "Em", "F", "G",
    // 13-16: サビ〜グランドフィナーレ
    "F", "G", "C", "C",
  ];

  const melody = [
    // 1-4: ファンファーレ
    "C5:4 E5:4 G5:4 C6:4",
    "A5:3 B5:1 C6:2 B5:2 A5:4 F5:4",
    "B5:3 C6:1 D6:2 C6:2 B5:4 G5:4",
    "C6:6 E5:2 G5:4 C6:4",
    // 5-8: Aメロ
    "E5:4 G5:2 C6:2 B5:4 A5:2 G5:2",
    "G5:4 B5:2 E6:2 D6:4 C6:2 B5:2",
    "A5:3 B5:1 C6:2 D6:2 C6:4 A5:4",
    "B5:6 G5:2 D5:4 G5:4",
    // 9-12: Bメロ
    "C6:4 B5:2 A5:2 E5:4 A5:4",
    "B5:4 A5:2 G5:2 E5:4 G5:4",
    "A5:2 B5:2 C6:4 D6:2 E6:2 F6:4",
    "D6:6 C6:2 B5:4 D6:4",
    // 13-16: フィナーレ
    "C6:4 D6:2 E6:2 F6:4 E6:2 D6:2",
    "D6:4 E6:2 F6:2 G6:4 F6:2 E6:2",
    "E6:3 F6:1 G6:2 F6:2 E6:4 D6:4",
    "C6:12 -:4",
  ];

  const fluteScore = [
    "-:8 G5:4 C6:4",
    "C6:4 -:4 C6:4 A5:4",
    "-:4 D6:4 B5:4 G5:4",
    "E6:4 G6:4 C6:4 -:4",
    "-:8 G5:2 C6:2 E6:4",
    "-:8 B5:2 E6:2 G6:4",
    "F6:4 E6:2 D6:2 C6:4 A5:4",
    "G5:4 B5:2 D6:2 G6:4 -:4",
    "E6:4 D6:2 C6:2 A5:4 C6:4",
    "G6:4 F6:2 E6:2 B5:4 E6:4",
    "F6:4 G6:2 A6:2 F6:4 C6:4",
    "B5:4 C6:2 D6:2 B5:4 G5:4",
    "A5:4 B5:2 C6:2 D6:4 C6:4",
    "B5:4 C6:2 D6:2 E6:4 D6:4",
    "G6:4 F6:2 E6:2 D6:4 B5:4",
    "C6:12 -:4",
  ];

  const stringsScore = [
    "E4:8 G4:8", "F4:8 A4:8", "G4:8 B4:8", "E4:8 G4:8",
    "G4:8 C5:8", "G4:8 B4:8", "A4:8 C5:8", "B4:8 D5:8",
    "C5:8 E5:8", "B4:8 D5:8", "A4:8 C5:8", "B4:8 D5:8",
    "A4:8 C5:8", "B4:8 D5:8", "C5:8 E5:8", "E4:12 -:4",
  ];

  const bassScore = [
    "C3:4 -:4 C3:4 -:4", "F2:4 -:4 F2:4 -:4", "G2:4 -:4 G2:4 -:4", "C3:6 -:2 C3:4 -:4",
    "C3:4 G2:4 C3:4 E3:4", "E3:4 B2:4 E3:4 G3:4", "F2:4 C3:4 F2:4 A2:4", "G2:4 D3:4 G2:4 B2:4",
    "A2:4 E3:4 A2:4 C3:4", "E2:4 B2:4 E2:4 G2:4", "F2:4 C3:4 F2:4 A2:4", "G2:4 D3:4 G2:4 B2:4",
    "F2:4 C3:4 F2:4 A2:4", "G2:4 D3:4 G2:4 B2:4", "C3:4 G2:4 C3:4 G2:4", "C3:12 -:4",
  ];

  const kickScore = [
    "C2:4 -:4 C2:4 -:4", "C2:4 -:4 C2:4 -:4", "C2:4 -:4 C2:4 -:4", "C2:4 C2:4 C2:4 -:4",
    "C2:4 -:4 C2:4 -:4", "C2:4 -:4 C2:4 -:4", "C2:4 -:4 C2:4 -:4", "C2:4 -:4 C2:4 -:4",
    "C2:4 -:4 C2:4 -:4", "C2:4 -:4 C2:4 -:4", "C2:4 -:4 C2:4 -:4", "C2:4 C2:2 C2:2 C2:4 C2:4",
    "C2:4 -:4 C2:4 -:4", "C2:4 -:4 C2:4 -:4", "C2:4 C2:4 C2:4 C2:4", "C2:4 -:12",
  ];

  const snareScore = [
    "-:4 C2:4 -:4 C2:4", "-:4 C2:4 -:4 C2:4", "-:4 C2:4 -:4 C2:4", "-:4 C2:4 C2:4 -:4",
    "-:16", "-:16", "-:4 C2:4 -:4 C2:4", "-:4 C2:4 -:2 C2:2 C2:4",
    "-:4 C2:4 -:4 C2:4", "-:4 C2:4 -:4 C2:4", "-:4 C2:4 -:4 C2:4", "-:4 C2:4 C2:2 C2:2 C2:4",
    "-:4 C2:4 -:4 C2:4", "-:4 C2:4 -:4 C2:4", "C2:2 C2:2 C2:2 C2:2 C2:4 C2:4", "C2:4 -:12",
  ];

  const hatScore = [
    "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2", "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2",
    "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2", "C5:4 C5:4 C5:4 -:4",
    "C5:4 C5:4 C5:4 C5:4", "C5:4 C5:4 C5:4 C5:4", "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2", "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2",
    "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2", "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2", "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2", "C5:4 C5:4 C5:4 C5:4",
    "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2", "C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2 C5:2", "C5:2 C5:2 C5:2 C5:2 C5:4 C5:4", "C5:4 -:12",
  ];

  const lead = [], flute = [], piano = [], strings = [], bass = [];
  const kick = [], snare = [], hats = [];

  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]];
    const climax = bar >= 12;
    const lift = climax ? 1.0 : 0.94;

    lead.push(...parseBar(melody[bar]).map(([n, l], i) => [n, l, lift * (i % 2 === 0 ? 1 : 0.9)]));
    flute.push(...parseBar(fluteScore[bar]).map(([n, l]) => [n, l, 0.88]));
    strings.push(...parseBar(stringsScore[bar]).map(([n, l]) => [n, l, lift * 0.85]));
    bass.push(...parseBar(bassScore[bar]));

    let pnoStr = "";
    if (bar < 4) {
      pnoStr = `${c[0]}:2 ${c[1]}:2 ${c[2]}:2 ${c[3] || c[0]}:2 ${octave(c[0], 5)}:2 ${c[2]}:2 ${c[1]}:2 ${c[0]}:2`;
    } else if (bar === 15) {
      pnoStr = `${c[0]}:4 ${c[1]}:4 ${c[2]}:4 -:4`;
    } else {
      pnoStr = `${c[0]}:2 -:1 ${c[2]}:1 ${c[1]}:2 -:2 ${c[0]}:2 -:1 ${c[2]}:1 ${c[1]}:2 ${c[2]}:2`;
    }
    piano.push(...parseBar(pnoStr).map(([n, l]) => [n, l, 0.75]));

    kick.push(...parseBar(kickScore[bar]));
    snare.push(...parseBar(snareScore[bar]));
    hats.push(...parseBar(hatScore[bar]));
  }

  return {
    name: "gameclear", title: "帰還の朝", tempo: 116, loop: false, bars: 16,
    desc: "C長調。16小節・約33秒。ゲームクリア・帰還テーマ。死線を越えて生還した冒険者を称える壮大なシンフォニック・ファンファーレ＆讃歌。誇り高く鳴り響く凱旋のトランペット、澄み渡る朝光のようなフルートのオブリガート、優しく包み込むピアノのアルペジオとストリングス、そして全パートが一体となり余韻を残して静かに結ぶ大団円のグランドフィナーレ。",
    tracks: [
      { type: "sine", instrument: "brassLead", volume: 0.30, gate: 0.90, pan: -0.06, cutoff: 4800, roomSend: 0.22, notes: lead },
      { type: "sine", instrument: "woodFlute", volume: 0.24, gate: 0.88, pan: 0.28, cutoff: 4200, roomSend: 0.24, notes: flute },
      { type: "sine", instrument: "feltPiano", volume: 0.22, gate: 0.70, pan: -0.28, cutoff: 3600, roomSend: 0.20, notes: piano },
      { type: "sine", instrument: "softStrings", volume: 0.18, gate: 0.92, pan: 0.38, cutoff: 3200, roomSend: 0.30, notes: strings },
      { type: "sine", instrument: "roundBass", volume: 0.35, gate: 0.80, pan: 0, cutoff: 750, notes: bass },
      { type: "sine", instrument: "drumKick", volume: 0.30, pan: 0, cutoff: 1100, notes: kick },
      { type: "sine", instrument: "drumSnare", volume: 0.24, pan: 0.06, cutoff: 4800, roomSend: 0.12, notes: snare },
      { type: "sine", instrument: "drumHat", volume: 0.14, pan: 0.28, cutoff: 7200, notes: hats },
    ],
  };
}
export const BGM_GAMECLEAR = gameClearTheme();

export const ALL_BGM_TRACKS = [BGM_HUB, BGM_DUNGEON_SHALLOW, BGM_DUNGEON_DEEP, BGM_DUNGEON_ABYSS,
  BGM_MONSTER_HOUSE, BGM_SHOP, BGM_BOSS, BGM_GAMEOVER, BGM_GAMECLEAR];
