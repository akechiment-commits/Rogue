/** 音色レシピと表示名を一元化し、サウンドテストとゲームで同じ音を使う。 */
const tone = (freq, duration, gain, type = "sine", start = 0, pitchSlideTo = null, opts = {}) =>
  ({ kind: "tone", freq, duration, gain, type, start, pitchSlideTo, ...opts });
const noise = (duration, gain, filterFreq, start = 0, filterSlideTo = null, filterType = "lowpass", filterQ = 1, opts = {}) =>
  ({ kind: "noise", duration, gain, filterFreq, start, filterSlideTo, filterType, filterQ, ...opts });
const chime = (frequencies, spacing = 0.1, gain = 0.22, type = "triangle", duration = 0.45) =>
  frequencies.map((freq, index) => tone(freq, duration, gain, type, index * spacing));
const thump = (freq, end, duration, gain, start = 0, type = "sawtooth", filterFreq = null) =>
  tone(freq, duration, gain, type, start, end, { pitchSlideTime: 0.055, filterFreq: filterFreq ?? Math.min(2400, freq * 3) });
const ring = (freq, duration, gain, start = 0) => [
  tone(freq, duration, gain, "sine", start),
  tone(freq * 2.73, duration * 0.63, gain * 0.35, "triangle", start + 0.012),
];
const effect = (id, name, desc, voices) => ({ id, name, desc, voices });

export const SOUND_EFFECTS = Object.fromEntries([
  // 近接攻撃ヒット: 鋭い斬撃ノイズ + 重い肉体衝撃キック + 刃のめり込み余韻
  effect("hit", "攻撃ヒット", "近接攻撃が命中", [
    noise(0.14, 0.42, 3800, 0, 750, "bandpass", 2.2),
    tone(260, 0.22, 0.48, "sawtooth", 0, 48, { filterFreq: 1200, filterSlideTo: 220 }),
    tone(520, 0.35, 0.12, "triangle", 0.012),
  ]),

  // 会心の一撃: 稲妻・大斬撃のような強烈なアタックノイズ + 重低音サブベース + 鋭く鳴り響くクリティカルベル
  effect("crit", "会心の一撃", "会心・痛恨・強烈な一撃", [
    noise(0.32, 0.58, 4800, 0, 320, "bandpass", 3.0),
    tone(340, 0.42, 0.65, "sawtooth", 0, 32, { filterFreq: 1600, filterSlideTo: 180 }),
    tone(880, 0.65, 0.24, "sine", 0.015),
    tone(1760, 0.55, 0.20, "triangle", 0.02),
    tone(2640, 0.45, 0.16, "sine", 0.03),
    tone(65, 0.50, 0.35, "sine", 0.04, 30),
  ]),

  // 空振り・回避: 風を鋭く切り裂く「ビュンッ！」「ヒュオッ！」
  effect("miss", "空振り・回避", "近接攻撃や飛び道具が外れた", [
    noise(0.22, 0.32, 2600, 0, 320, "bandpass", 4.5),
    tone(320, 0.18, 0.14, "sine", 0, 80),
  ]),

  // 被ダメージ: 肉体にめり込む鈍痛の衝撃 + 抉られるクラッシュノイズ + 危険な低音振動
  effect("playerDamage", "被ダメージ", "敵・罠・毒・反動などでダメージを受けた", [
    tone(180, 0.38, 0.55, "sawtooth", 0, 35, { filterFreq: 800, filterSlideTo: 140 }),
    noise(0.24, 0.45, 1200, 0, 160, "lowpass", 1.8),
    tone(75, 0.45, 0.38, "triangle", 0.02, 28),
  ]),

  // 敵撃破: 撃砕の重低音キック + 砕け散る破片ノイズ + 昇天・消滅のファンタジックな上昇トーン
  effect("defeat", "敵撃破", "モンスターを倒した", [
    tone(240, 0.35, 0.48, "sawtooth", 0, 40, { filterFreq: 1000, filterSlideTo: 160 }),
    noise(0.48, 0.38, 2800, 0.015, 240, "bandpass", 2.0),
    tone(330, 0.55, 0.24, "triangle", 0.03, 784),
    tone(1320, 0.65, 0.14, "sine", 0.06),
  ]),

  // レベルアップ: 力強いファンファーレ・アルペジオ + 頂点での輝くベル和音 + 全身に力が漲る低音ベース
  effect("levelUp", "レベルアップ", "プレイヤーのレベルが上がった", [
    tone(261.6, 0.35, 0.28, "triangle", 0),
    tone(329.6, 0.35, 0.28, "triangle", 0.09),
    tone(392.0, 0.35, 0.30, "triangle", 0.18),
    tone(523.3, 0.45, 0.32, "triangle", 0.27),
    tone(659.3, 0.45, 0.32, "triangle", 0.36),
    tone(784.0, 0.55, 0.35, "triangle", 0.45),
    tone(1046.5, 0.85, 0.44, "triangle", 0.54),
    tone(1318.5, 0.80, 0.22, "sine", 0.54),
    tone(2093.0, 0.90, 0.18, "sine", 0.56),
    tone(130.8, 0.70, 0.35, "sawtooth", 0.54, null, { filterFreq: 400 }),
  ]),

  // 階層移動: 重い石階段を降りる足音 + 深淵へ潜る重厚なドローン下降音 + 神秘的な鐘の響き
  effect("stairs", "階層移動", "階段や落下で別の階へ移動", [
    noise(0.12, 0.28, 800, 0, 200),
    noise(0.12, 0.28, 750, 0.14, 180),
    tone(220, 0.58, 0.35, "sawtooth", 0.08, 73, { filterFreq: 650, filterSlideTo: 160 }),
    tone(440, 0.70, 0.18, "sine", 0.25),
  ]),

  // アイテム拾得: 軽快に手元に入る澄んだ取得音
  effect("pickup", "アイテム拾得", "床や容器から道具を所持品へ入れた", [
    tone(659, 0.08, 0.26, "triangle", 0),
    tone(988, 0.20, 0.30, "sine", 0.055),
  ]),

  // 道具使用: 魔力や道具を起動したシュピーン音
  effect("useItem", "道具使用", "その他の道具を使った", [
    tone(523, 0.12, 0.24, "triangle", 0),
    tone(784, 0.22, 0.28, "triangle", 0.07),
    tone(1046, 0.35, 0.28, "sine", 0.14),
  ]),

  // 薬を飲む: リアルな嚥下音「ゴクッ…ゴクッ…」+ 体内に染み渡る神秘的なキラメキ
  effect("drink", "薬を飲む", "薬・泉の水を飲んだ", [
    tone(240, 0.13, 0.38, "sine", 0.02, 420),
    tone(420, 0.11, 0.30, "sine", 0.07, 160),
    tone(280, 0.14, 0.40, "sine", 0.20, 480),
    tone(480, 0.12, 0.32, "sine", 0.26, 180),
    noise(0.38, 0.18, 1200, 0.22, 300, "bandpass", 1.8),
    tone(784, 0.45, 0.25, "sine", 0.38),
    tone(1175, 0.40, 0.18, "triangle", 0.42),
  ]),

  // 巻物を読む: 羊皮紙を広げる乾いた音 + 解き放たれる魔力のグリッサンド・チャイム
  effect("scroll", "巻物を読む", "巻物を読んで効果が発動", [
    noise(0.16, 0.35, 2800, 0, 900, "bandpass", 1.8),
    tone(587, 0.45, 0.24, "triangle", 0.12),
    tone(880, 0.50, 0.26, "triangle", 0.22),
    tone(1175, 0.55, 0.28, "triangle", 0.32),
    tone(1760, 0.65, 0.30, "sine", 0.42),
    tone(293.7, 0.60, 0.22, "sine", 0.25),
  ]),

  // 食べる: リズミカルな咀嚼音「モグッ、モグッ」+ 飲み込むゴクン
  effect("eat", "食べる", "食料を食べた", [
    tone(150, 0.12, 0.34, "sine", 0, 240),
    noise(0.10, 0.24, 1400, 0, 400),
    tone(170, 0.13, 0.36, "sine", 0.16, 260),
    noise(0.10, 0.26, 1500, 0.16, 450),
    tone(220, 0.16, 0.40, "sine", 0.34, 110),
  ]),

  // 投げる: 勢いよくアイテムを投げつける鋭い風切り音
  effect("throw", "投げる", "道具・石などを投げた", [
    noise(0.24, 0.35, 2600, 0, 450, "bandpass", 3.0),
    tone(260, 0.20, 0.24, "sine", 0, 520),
  ]),

  // 矢・弾の発射: 弓弦が弾ける「バツンッ！」+ 風を切り飛翔する「ヒュンッ！」
  effect("shoot", "矢・弾の発射", "矢や特殊飛び道具を発射", [
    tone(480, 0.18, 0.45, "triangle", 0, 110),
    noise(0.08, 0.35, 3800, 0, 1200, "highpass"),
    noise(0.25, 0.28, 3200, 0.03, 600, "bandpass", 3.5),
  ]),

  // 壺・瓶・道具の破壊: 初期衝撃 + 粉々に砕け散る破片クラッシュノイズ + 複数の不協和音金属リング
  effect("shatter", "壺・瓶・道具の破壊", "壺・瓶・大箱・装備などが壊れた", [
    tone(320, 0.20, 0.48, "sawtooth", 0, 70, { filterFreq: 1400, filterSlideTo: 300 }),
    noise(0.38, 0.55, 5200, 0, 900, "highpass", 1.8),
    tone(1050, 0.60, 0.20, "sine", 0.01),
    tone(1480, 0.50, 0.16, "triangle", 0.03),
    tone(2120, 0.45, 0.14, "sine", 0.06),
  ]),

  // 罠作動: 鋭いスイッチクリック音 + 直後の跳ね起きるバネ・槍の強烈な機械作動音
  effect("trap", "罠作動", "罠が発動・作動した", [
    tone(2800, 0.035, 0.48, "triangle", 0),
    noise(0.04, 0.38, 4500, 0, 1500, "highpass"),
    tone(380, 0.28, 0.55, "sawtooth", 0.045, 75, { filterFreq: 1200, filterSlideTo: 220 }),
    noise(0.24, 0.42, 2400, 0.045, 400, "bandpass", 2.5),
  ]),

  // 爆発: 超重低音の地響きキック + 炸裂の瞬間ノイズ + 大地を震わせる長大な減衰ランブル
  effect("explosion", "爆発", "地雷・時限爆弾・火薬・自爆などが爆発", [
    tone(140, 1.10, 0.78, "sawtooth", 0, 24, { filterFreq: 800, filterSlideTo: 80 }),
    noise(0.38, 0.68, 4500, 0, 280, "lowpass", 1.5),
    noise(1.40, 0.48, 600, 0.05, 50, "lowpass", 2.0),
    noise(0.60, 0.38, 1800, 0.08, 200, "bandpass", 3.0),
  ]),

  // 魔法・杖: 魔力チャージ＆高速スウィープ + 鋭い魔法ビーム + 神秘的な倍音リング
  effect("magic", "魔法・杖", "魔法を唱えた、杖の魔法弾を放った", [
    tone(440, 0.36, 0.45, "sawtooth", 0, 1850, { filterFreq: 3200, filterSlideTo: 1400 }),
    noise(0.32, 0.30, 3600, 0.02, 1200, "bandpass", 4.0),
    tone(880, 0.60, 0.22, "sine", 0.10),
    tone(1320, 0.65, 0.24, "triangle", 0.15),
    tone(1760, 0.70, 0.18, "sine", 0.20),
  ]),

  // HP回復: 豊かな温かいメジャー和音の広がり + 心身を包む低音 + キラキラした光の粒子
  effect("heal", "HP回復", "薬・魔法などの回復効果", [
    tone(392, 0.75, 0.26, "sine", 0),
    tone(494, 0.75, 0.26, "sine", 0.10),
    tone(587, 0.80, 0.28, "sine", 0.20),
    tone(784, 0.90, 0.30, "sine", 0.30),
    tone(988, 0.95, 0.26, "sine", 0.40),
    tone(196, 0.85, 0.32, "triangle", 0.05),
    tone(1568, 0.60, 0.16, "sine", 0.35),
  ]),

  // 復活: 魂の蘇りドローン + 奇跡の上昇アルペジオ（Dメジャー） + 輝く復活のベル
  effect("revive", "復活", "MP・魔方陣・骨などから復活", [
    tone(147, 0.90, 0.38, "sawtooth", 0, null, { filterFreq: 500 }),
    tone(294, 0.45, 0.32, "triangle", 0.15),
    tone(370, 0.45, 0.34, "triangle", 0.28),
    tone(440, 0.50, 0.38, "triangle", 0.41),
    tone(587, 0.60, 0.40, "triangle", 0.54),
    tone(880, 0.85, 0.46, "triangle", 0.67),
    tone(1175, 1.10, 0.45, "sine", 0.80),
    tone(1760, 0.90, 0.28, "sine", 0.80),
  ]),

  // 金貨拾得: 硬貨が触れ合う澄んだ高音ダブルトーン
  effect("gold", "金貨拾得", "金貨・ゴールドを拾った", [
    tone(2489, 0.32, 0.24, "sine", 0),
    tone(4978, 0.18, 0.09, "sine", 0.005),
    tone(3136, 0.38, 0.28, "sine", 0.065),
    tone(6272, 0.22, 0.10, "sine", 0.070),
  ]),

  // 装備・装備解除: バックル・金属金具のカチャリ + 刃を抜き差しするシャキ音
  effect("equip", "装備・装備解除", "武器・防具・矢・指輪の装備状態が変わった", [
    noise(0.08, 0.30, 4200, 0, 1500, "highpass"),
    tone(620, 0.22, 0.28, "triangle", 0.015),
    tone(1240, 0.28, 0.24, "sine", 0.040),
    tone(1860, 0.20, 0.16, "sine", 0.050),
  ]),

  // 識別: アイテムの真価が判明した澄み渡る和音チャイム
  effect("identify", "識別", "道具・大箱の正体が明らかになった", [
    tone(659, 0.35, 0.28, "sine", 0),
    tone(830, 0.40, 0.30, "sine", 0.09),
    tone(988, 0.45, 0.32, "sine", 0.18),
    tone(1319, 0.60, 0.38, "sine", 0.27),
  ]),

  // 強化・祝福: 勇気が湧く力強い長三度上昇 + きらめくゴールドベル
  effect("buff", "強化・祝福", "能力強化・祝福・倍速などが付いた", [
    tone(523, 0.35, 0.34, "triangle", 0),
    tone(659, 0.40, 0.38, "triangle", 0.10),
    tone(784, 0.60, 0.40, "triangle", 0.20),
    tone(1046, 0.70, 0.45, "triangle", 0.30),
    tone(2093, 0.70, 0.22, "sine", 0.30),
  ]),

  // 呪い: 減五度（悪魔の音程・トライトーン）の重低音不協和音 + 暗黒のざわめき
  effect("curse", "呪い", "道具や装備が呪われた", [
    tone(116.5, 0.85, 0.45, "sawtooth", 0, 58, { filterFreq: 450 }),
    tone(164.8, 0.85, 0.40, "triangle", 0.05, 82),
    noise(0.70, 0.28, 800, 0.02, 120, "lowpass", 2.5),
  ]),

  // 状態異常: 毒・混乱・麻痺の嫌な感触、不快な揺らぎトーン + 毒素ノイズ
  effect("status", "状態異常", "毒・眠り・混乱・凍結などが付いた", [
    tone(330, 0.55, 0.35, "sawtooth", 0, 130, { filterFreq: 700, filterSlideTo: 200 }),
    tone(311, 0.55, 0.32, "sawtooth", 0.08, 120, { filterFreq: 650, filterSlideTo: 180 }),
    noise(0.45, 0.25, 1600, 0, 300, "bandpass", 2.0),
  ]),

  // 状態回復: 解毒・呪い解除の爽快なメジャートライアド上昇
  effect("statusClear", "状態回復", "状態異常が治った、呪いが解けた", [
    tone(587, 0.40, 0.30, "sine", 0),
    tone(740, 0.40, 0.32, "sine", 0.10),
    tone(880, 0.60, 0.36, "sine", 0.20),
    tone(1175, 0.70, 0.38, "sine", 0.30),
  ]),

  // 転送・ワープ: 空間がねじれてワープする空間収束＆発射スウィープ + 共鳴リング
  effect("teleport", "転送・ワープ", "プレイヤーがテレポートやポータル転送", [
    tone(220, 0.35, 0.40, "sine", 0, 1760),
    tone(1760, 0.45, 0.38, "sine", 0.22, 330),
    tone(880, 0.60, 0.24, "triangle", 0.25),
  ]),

  // 吹き飛ばし: 激突の重衝撃 + 吹き飛ばされる突風ノイズ
  effect("knockback", "吹き飛ばし", "プレイヤーが吹き飛ばされた", [
    tone(220, 0.38, 0.55, "sawtooth", 0, 45, { filterFreq: 1000, filterSlideTo: 160 }),
    noise(0.42, 0.40, 2200, 0, 300, "lowpass", 2.0),
  ]),

  // 壁を壊す: ツルハシの鋭い打撃 + 岩石が崩落するガラガラ音 + 地響き
  effect("wallBreak", "壁を壊す", "壁・石像を掘る、壊す", [
    tone(380, 0.15, 0.50, "triangle", 0, 95),
    noise(0.12, 0.48, 3200, 0, 600, "highpass"),
    noise(0.50, 0.45, 1100, 0.08, 140, "lowpass", 1.5),
    tone(95, 0.45, 0.40, "sawtooth", 0.08, 35, { filterFreq: 500 }),
  ]),

  // 容器への出し入れ: 陶器のコトッ + 道具が収まる金属リング
  effect("container", "容器への出し入れ", "壺・大箱へ道具を入れた、取り出した", [
    tone(340, 0.18, 0.35, "sine", 0, 120),
    noise(0.08, 0.24, 1800, 0, 600),
    tone(780, 0.22, 0.18, "triangle", 0.03),
  ]),

  // 購入: レジ・金貨の華やかなジャリン + コインの重み
  effect("shopBuy", "購入", "店で道具を購入、代金を払った", [
    tone(1568, 0.25, 0.26, "sine", 0),
    tone(1975, 0.30, 0.28, "sine", 0.08),
    tone(2349, 0.40, 0.32, "sine", 0.16),
    tone(784, 0.35, 0.22, "triangle", 0.05),
  ]),

  // 売却・換金: 下降コインチャイム
  effect("shopSell", "売却・換金", "店へ売却、巻物などで換金した", [
    tone(2349, 0.25, 0.28, "sine", 0),
    tone(1975, 0.28, 0.30, "sine", 0.07),
    tone(1568, 0.35, 0.32, "sine", 0.14),
  ]),

  // ガチャ: ガラガラ音 + カプセルが落ちて開くポンッ + 景品登場のキラメキ
  effect("gacha", "ガチャ", "ガチャを回して景品が出た", [
    noise(0.12, 0.30, 1600, 0, 400),
    noise(0.12, 0.32, 1800, 0.12, 450),
    tone(350, 0.22, 0.48, "sine", 0.26, 80),
    tone(1175, 0.50, 0.28, "triangle", 0.32),
    tone(1760, 0.60, 0.24, "sine", 0.40),
  ]),

  // 水・泉: 水滴が落ちるポチャン + 水しぶきの飛散ノイズ
  effect("water", "水・泉", "水に入った、泉へ道具を浸した、薬液が飛散", [
    tone(340, 0.16, 0.38, "sine", 0, 680),
    tone(520, 0.14, 0.30, "sine", 0.12, 920),
    noise(0.45, 0.30, 2200, 0.04, 500, "bandpass", 2.2),
  ]),

  // 足音: 心地よく控えめな石畳のタップ
  effect("footstep", "足音", "ダンジョンを歩いた（控えめな短い音）", [
    noise(0.05, 0.12, 900, 0, 250),
    tone(140, 0.06, 0.14, "sine", 0, 80),
  ]),

  // カーソル移動: 軽快でクリアなUI音
  effect("cursor", "カーソル移動", "メニューの選択肢を動かした", [
    tone(880, 0.04, 0.16, "triangle", 0),
  ]),

  // 決定: 明るく心地よい決定音
  effect("select", "決定", "メニューを開いた、項目を決定した", [
    tone(880, 0.06, 0.18, "triangle", 0),
    tone(1320, 0.08, 0.22, "sine", 0.04),
  ]),

  // キャンセル: 控えめな戻り音
  effect("cancel", "キャンセル", "メニューを閉じた、戻った", [
    tone(880, 0.05, 0.16, "triangle", 0),
    tone(660, 0.08, 0.15, "triangle", 0.04),
  ]),

  // ピンチ・空腹警告: プレイヤーが即座に気づく鋭い高音ビープ2連打
  effect("alert", "ピンチ・空腹警告", "ピンチや空腹ダメージが発生", [
    tone(1046, 0.12, 0.38, "square", 0),
    tone(1318, 0.15, 0.42, "square", 0.12),
  ]),
].map(sound => [sound.id, sound]));

export const ALL_SE_LIST = Object.values(SOUND_EFFECTS).map(({ id, name, desc }) => ({ id, name, desc }));

export function soundEffectDuration(id) {
  return Math.max(0, ...(SOUND_EFFECTS[id]?.voices || []).map(voice => voice.start + voice.duration));
}
