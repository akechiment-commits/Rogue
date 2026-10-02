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

// ゲーム全体の顔になる拠点テーマ。鍵盤で示した動機を笛が歌い、弦が支える。
const HUB_THEME = [
  "D5:2 G5:4 A5:2 B5:4 A5:2 G5:2", "E5:4 G5:2 C6:2 B5:4 G5:4",
  "G5:4 F#5:2 E5:2 B4:4 E5:4", "F#5:4 A5:2 G5:2 F#5:4 D5:2 -:2",
  "E5:2 G5:2 C6:4 B5:2 A5:2 G5:4", "B5:3 A5:1 G5:4 D5:4 B4:4",
  "C5:2 E5:2 A5:4 G5:2 E5:2 C5:4", "D5:4 F#5:2 A5:2 G5:4 F#5:2 -:2",
];
function hubTheme() {
  const chords = ["G","C","G","D", "G","C","Em","D","C","G","Am","D",
    "C","D","G","Em","C","G","Am","D", "Em","C","G","D","Am","Em","C","D",
    "G","C","Em","D","C","G","Am","D", "C","G","Am","D"];
  const introduction = [
    "D4:2 G4:2 A4:2 B4:2 D5:4 B4:2 A4:2", "E4:4 G4:2 C5:2 B4:4 G4:4",
    "B4:4 A4:2 G4:2 D4:4 G4:4", "A4:4 F#4:4 D4:4 -:4",
  ];
  const melody = ["-:16", "-:16", "-:16", "-:16", ...HUB_THEME,
    "G5:4 C6:6 B5:2 A5:4", "A5:4 D6:4 C6:2 B5:2 A5:4",
    "B5:4 A5:2 G5:2 D5:4 G5:4", "E5:2 G5:2 B5:4 A5:2 G5:2 E5:4",
    "G5:4 E5:2 C5:2 G5:4 C6:4", "B5:3 A5:1 G5:6 -:2 D5:2 B4:2",
    "A5:4 G5:2 E5:2 C5:4 E5:4", "F#5:2 A5:2 D6:4 C6:2 A5:2 F#5:4",
    "B4:6 G4:2 E5:4 -:4", "E5:4 C5:4 G4:4 -:4",
    "D5:4 B4:4 G4:4 B4:4", "A4:4 D5:4 F#5:4 -:4",
    "C5:4 E5:4 A5:4 G5:4", "E5:6 D5:2 B4:4 -:4",
    "G4:2 C5:2 E5:4 G5:4 E5:4", "F#5:4 A5:4 D6:4 -:4",
    ...HUB_THEME,
    "E5:4 G5:4 C6:4 B5:4", "A5:2 G5:2 D5:4 B4:4 G4:4",
    "C5:4 E5:4 A5:4 G5:4", "F#5:4 D5:4 A4:4 -:4"];
  const lead = [], piano = [], response = [], inner = [], upper = [], bass = [];
  for (let bar = 0; bar < chords.length; bar++) {
    const c = CHORDS[chords[bar]], quiet = bar >= 20 && bar < 28;
    const lift = bar < 4 ? 0.58 : quiet ? 0.65 : bar >= 28 && bar < 36 ? 0.98 : bar >= 12 && bar < 20 ? 0.93 : 0.84;
    lead.push(...parseBar(melody[bar]).map(([note, length], index) => [note, length, lift * (index % 3 === 0 ? 1 : 0.9)]));
    piano.push(...parseBar(bar < 4 ? introduction[bar] : quiet
      ? `${c[0]}:4:0.55 -:4 ${c[2]}:4:0.4 -:4`
      : `${c[0]}:2:0.65 -:2 ${c[2]}:2:0.46 ${c[1]}:2:0.5 -:2 ${c[3]}:2:0.35 ${c[2]}:2:0.45 -:2`));
    response.push(...parseBar(bar < 4 || quiet ? "-:16" : bar % 4 === 3
      ? `-:8 ${octave(c[1], 5)}:2:0.52 ${octave(c[2], 5)}:2:0.46 ${octave(c[3], 5)}:2:0.38 -:2`
      : "-:16"));
    inner.push(...parseBar(bar < 2 ? "-:16" : `${octave(c[1], 3)}:16:${lift * 0.7}`));
    upper.push(...parseBar(bar < 4 || quiet || bar >= 36 ? "-:16" : `${octave(c[2], 4)}:16:${lift * 0.6}`));
    bass.push(...parseBar(bar < 4 || quiet || bar >= 36
      ? `${octave(c[0], 2)}:12:0.68 -:4`
      : `${octave(c[0], 2)}:6:0.7 -:2 ${octave(c[2], 2)}:6:0.52 -:2`));
  }
  return {
    name: "hub", title: "冒険の待つ場所", tempo: 104, loop: true, bars: 40,
    desc: "G長調。40小節・約92秒。鍵盤の導入から笛が歌う主題、弦が広がる中間部、穏やかな橋渡し、主題の再現へ進む拠点テーマ。冒険へ向かう期待と、帰ってきた安心感を柔らかい室内楽の6パートで描く。",
    tracks: [
      { type: "sine", instrument: "woodFlute", volume: 0.23, gate: 0.93, pan: -0.07, cutoff: 3900, roomSend: 0.3, notes: lead },
      { type: "sine", instrument: "feltPiano", volume: 0.21, gate: 0.86, pan: -0.28, cutoff: 3000, roomSend: 0.23, notes: piano },
      { type: "sine", instrument: "feltPiano", volume: 0.13, gate: 0.82, pan: 0.34, cutoff: 3200, roomSend: 0.3, notes: response },
      { type: "sine", instrument: "softStrings", volume: 0.14, gate: 0.96, pan: -0.48, cutoff: 2200, roomSend: 0.4, notes: inner },
      { type: "sine", instrument: "softStrings", volume: 0.105, gate: 0.96, pan: 0.46, cutoff: 2500, roomSend: 0.4, notes: upper },
      { type: "sine", instrument: "roundBass", volume: 0.26, gate: 0.9, pan: 0, cutoff: 550, notes: bass },
    ],
  };
}
export const BGM_HUB = hubTheme();

const DEEP_A = [
  "-:4 C5:3 Db5:1 G4:4 Eb5:2 Db5:2", "C5:6 -:2 Ab4:2 G4:2 Eb4:4",
  "Db5:3 C5:1 Ab4:4 F5:2 Eb5:2 Db5:4", "D5:2 Eb5:2 G5:4 F5:2 Eb5:2 D5:4",
  "Eb5:4 G5:2 Bb5:2 G5:4 -:4", "F5:3 Eb5:1 C5:4 Ab4:2 C5:2 Eb5:4",
  "B4:2 D5:2 G5:4 F5:2 D5:2 B4:4", "Db5:2 B4:2 G4:4 -:4 G4:2 B4:2",
];
export const BGM_DUNGEON_DEEP = arrange({
  name: "dungeon_deep", title: "忘れられた回廊", tempo: 96, style: "shadow",
  desc: "C短調。24小節。低い脈動と半音の影、疎な旋律から高音の応答へ展開する。",
  chords: ["Cm","Ab","Db","G7","Eb","Ab","G7","G7", "Cm","Cm","Ab","Db","Eb","Ab","G7","G7",
    "Cm","Ab","Db","G7","Eb","Ab","Db","G7"],
  melody: [...DEEP_A,
    "G5:2 Eb5:2 C5:4 -:2 G4:2 C5:4", "Eb5:3 D5:1 C5:2 G4:2 Eb5:4 -:4",
    "Ab5:4 G5:2 Eb5:2 C5:4 Ab4:4", "F5:2 Ab5:2 Db6:4 C6:2 Ab5:2 F5:4",
    "G5:4 F5:2 Eb5:2 Bb4:2 D5:2 G5:4", "Ab5:3 G5:1 Eb5:4 C5:4 -:4",
    "D5:2 F5:2 B5:4 G5:2 F5:2 D5:4", "B4:4 Db5:2 D5:2 G4:4 -:4",
    ...DEEP_A.slice(0, 6), "F5:4 Db5:2 C5:2 Ab4:4 -:4", "B4:3 G4:1 D5:4 Db5:2 B4:2 G4:2 -:2"],
});

const BATTLE_A = [
  "E5:3 -:1 E5:2 G5:2 B5:4 A5:2 G5:2", "D5:2 G5:2 B5:3 A5:1 G5:2 D5:2 B4:4",
  "C5:2 E5:2 A5:4 G5:2 E5:2 C5:4", "F#5:3 E5:1 D5:2 A4:2 F#5:4 -:2 A5:2",
  "G5:2 E5:2 B4:2 E5:2 G5:4 B5:2 A5:2", "G5:4 E5:2 C5:2 D5:2 E5:2 G5:4",
  "F#5:2 D#5:2 B4:2 F#5:2 A5:4 F#5:2 D#5:2", "B4:2 D#5:2 F#5:2 A5:2 B5:4 -:4",
];
export const BGM_MONSTER_HOUSE = arrange({
  name: "monster_house", title: "突破口", tempo: 160, style: "battle",
  desc: "E短調。16小節。警報の短い動機、跳躍する応答、細かいキックで包囲の緊張を作る。",
  chords: ["Em","G","Am","D","Em","C","B","B", "C","D","Em","G","Am","C","B","B"],
  melody: [...BATTLE_A,
    "G5:2 E5:2 C5:4 E5:2 G5:2 B5:4", "A5:3 F#5:1 D5:4 F#5:2 A5:2 C6:4",
    "B5:2 G5:2 E5:4 G5:2 F#5:2 E5:4", "D5:2 G5:2 B5:4 A5:2 G5:2 D5:4",
    "C6:2 B5:2 A5:2 G5:2 E5:4 C5:4", "E5:2 G5:2 C6:4 B5:2 G5:2 E5:4",
    "F#5:1 G5:1 A5:2 F#5:2 D#5:2 B4:2 D#5:2 F#5:4", "A5:2 F#5:2 D#5:4 B4:4 -:4"],
});

export const BGM_SHOP = arrange({
  name: "shop", title: "小さな灯の店", tempo: 104, style: "shop",
  desc: "G長調。16小節。跳ねる三角波の旋律と歩くベース、控えめなブラシ風ドラム。",
  chords: ["G","Em","Am","D","G","C","Am","D", "C","G","Am","D","Em","C","D","G"],
  melody: [
    "B4:3 D5:1 G5:2 D5:2 B4:3 A4:1 G4:4", "B4:3 G4:1 E5:2 G5:2 F#5:3 E5:1 B4:4",
    "C5:3 E5:1 A5:2 E5:2 C5:3 B4:1 A4:4", "F#5:3 E5:1 D5:2 A4:2 C5:3 A4:1 F#4:4",
    "G4:3 B4:1 D5:2 G5:2 B5:3 A5:1 G5:4", "E5:3 G5:1 C6:2 B5:2 G5:3 E5:1 C5:4",
    "A4:3 C5:1 E5:2 G5:2 E5:3 C5:1 B4:4", "A4:3 F#4:1 D5:4 -:4 F#4:2 A4:2",
    "G5:3 E5:1 C5:2 E5:2 G5:4 -:4", "B4:3 D5:1 G5:4 F#5:3 D5:1 B4:4",
    "E5:3 C5:1 A4:2 C5:2 E5:3 G5:1 A5:4", "F#5:3 A5:1 C6:4 A5:3 F#5:1 D5:4",
    "G5:3 F#5:1 E5:4 B4:2 G4:2 E5:4", "E5:3 G5:1 C6:4 B5:2 G5:2 E5:4",
    "A5:3 F#5:1 D5:2 C5:2 A4:3 F#4:1 D5:4", "B4:3 D5:1 G5:6 -:2 D5:2 B4:2"],
});

export const BGM_BOSS = arrange({
  name: "boss", title: "誓いの刃", tempo: 148, style: "battle",
  desc: "E短調。32小節。低い主題から高音のサビへ進み、息を置く橋渡しを経て決戦の主題へ戻る。",
  chords: ["Em","C","G","D","Am","Em","C","B", "Em","C","G","D","Am","C","B","B",
    "C","G","Am","Em","C","D","B","B", "Em","G","Am","D","C","Am","B","B"],
  melody: [
    "E4:2 E4:1 -:1 G4:2 B4:2 E5:4 D5:2 B4:2", "C5:3 B4:1 G4:2 E4:2 G4:4 C5:4",
    "D5:2 B4:2 G4:4 B4:2 D5:2 G5:4", "F#5:3 E5:1 D5:2 A4:2 F#5:4 -:4",
    "E5:2 C5:2 A4:4 C5:2 E5:2 G5:4", "F#5:2 E5:2 B4:4 G4:2 A4:2 B4:4",
    "C5:2 E5:2 G5:3 F#5:1 E5:2 C5:2 B4:4", "D#5:2 F#5:2 B5:4 A5:2 F#5:2 D#5:2 -:2",
    "E5:2 G5:2 B5:4 A5:2 G5:2 F#5:4", "G5:3 E5:1 C5:2 E5:2 G5:4 B5:4",
    "D6:4 B5:2 G5:2 A5:2 B5:2 G5:4", "A5:3 F#5:1 D5:2 F#5:2 A5:4 C6:4",
    "C6:2 B5:2 A5:4 G5:2 E5:2 C5:4", "E5:2 G5:2 C6:4 B5:2 G5:2 E5:4",
    "F#5:2 D#5:2 B4:2 F#5:2 A5:4 B5:4", "D#6:4 B5:2 F#5:2 A5:2 F#5:2 D#5:2 -:2",
    "G5:6 -:2 E5:4 C5:4", "B4:4 D5:2 G5:2 F#5:4 D5:4",
    "E5:6 -:2 C5:4 A4:4", "G4:4 B4:2 E5:2 D5:4 B4:4",
    "C5:2 E5:2 G5:4 E5:2 G5:2 C6:4", "A5:2 F#5:2 D5:4 F#5:2 A5:2 C6:4",
    "B5:3 A5:1 F#5:2 D#5:2 B4:4 -:4", "D#5:2 F#5:2 A5:2 B5:2 D#6:4 -:4",
    ...BATTLE_A.slice(0, 4),
    "G5:2 E5:2 C5:4 E5:2 G5:2 B5:4", "A5:2 E5:2 C5:4 G5:2 E5:2 A4:4",
    "D#5:2 F#5:2 B5:2 A5:2 F#5:4 D#5:4", "B4:2 D#5:2 F#5:2 A5:2 B5:4 -:4"],
});

export const BGM_GAMEOVER = arrange({
  name: "gameover", title: "灯りの消える頃", tempo: 72, loop: false, style: "shadow",
  desc: "4小節の終止曲。探索主題の断片をゆっくり下げ、最後の響きを残して停止する。",
  chords: ["Dm","Bb","A","Dm"],
  melody: ["A4:4 F4:4 E4:4 D4:4", "F4:6 D4:2 Bb3:4 -:4", "E4:4 C#4:4 A3:4 C#4:4", "D4:12 -:4"],
  harmony: ["F3:8 A3:8", "D3:8 F3:8", "C#3:8 E3:8", "F3:12 -:4"],
});
export const BGM_GAMECLEAR = arrange({
  name: "gameclear", title: "帰還の朝", tempo: 120, loop: false,
  desc: "8小節の勝利曲。探索主題を長調のファンファーレとして解決し、余韻の後に停止する。",
  chords: ["C","G","Am","F","C","F","G","C"],
  melody: ["C5:2 E5:2 G5:4 -:2 G5:2 A5:2 B5:2", "D6:6 B5:2 G5:8",
    "C6:4 B5:2 A5:2 E5:4 G5:4", "A5:4 G5:2 F5:2 C6:4 A5:4",
    "G5:2 E5:2 C5:2 E5:2 G5:4 C6:4", "A5:3 G5:1 F5:4 A5:2 C6:2 F6:4",
    "D6:2 B5:2 G5:4 A5:2 B5:2 D6:4", "C6:12 -:4"],
  harmony: ["E4:4 G4:4 C5:8", "B4:8 D5:8", "E5:8 C5:8", "F5:8 C5:8",
    "E5:8 G5:8", "F5:8 A5:8", "B4:8 D5:8", "E5:12 -:4"],
});

export const ALL_BGM_TRACKS = [BGM_HUB, BGM_DUNGEON_SHALLOW, BGM_DUNGEON_DEEP, BGM_MONSTER_HOUSE,
  BGM_SHOP, BGM_BOSS, BGM_GAMEOVER, BGM_GAMECLEAR];
