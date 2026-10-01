/** 音色レシピと表示名を一元化し、サウンドテストとゲームで同じ音を使う。 */
const tone = (freq, duration, gain, type = "sine", start = 0, pitchSlideTo = null) =>
  ({ kind: "tone", freq, duration, gain, type, start, pitchSlideTo });
const noise = (duration, gain, filterFreq, start = 0, filterSlideTo = null, filterType = "lowpass") =>
  ({ kind: "noise", duration, gain, filterFreq, start, filterSlideTo, filterType });
const chime = (frequencies, spacing = 0.1, gain = 0.11, type = "sine", duration = 0.45) =>
  frequencies.map((freq, index) => tone(freq, duration, gain, type, index * spacing));
const thump = (freq, end, duration, gain, start = 0) =>
  ({ ...tone(freq, duration, gain, "sine", start, end), pitchSlideTime: 0.055 });
const ring = (freq, duration, gain, start = 0) => [
  tone(freq, duration, gain, "sine", start),
  tone(freq * 2.73, duration * 0.63, gain * 0.3, "sine", start + 0.012),
];
const effect = (id, name, desc, voices) => ({ id, name, desc, voices });

export const SOUND_EFFECTS = Object.fromEntries([
  effect("hit", "攻撃ヒット", "近接攻撃が命中", [thump(165, 62, 0.42, 0.22), noise(0.12, 0.15, 2100, 0, 550), ...ring(390, 0.48, 0.045, 0.015)]),
  effect("crit", "会心の一撃", "会心・痛恨・強烈な一撃", [thump(190, 46, 0.62, 0.26), noise(0.22, 0.2, 3200, 0, 260), ...ring(480, 0.82, 0.09, 0.018), noise(0.48, 0.055, 750, 0.055, 120)]),
  effect("miss", "空振り・回避", "近接攻撃や飛び道具が外れた", [noise(0.24, 0.09, 1900, 0, 550, "bandpass")]),
  effect("playerDamage", "被ダメージ", "敵・罠・毒・反動などでダメージを受けた", [thump(130, 46, 0.55, 0.23), noise(0.2, 0.16, 1100, 0, 180), tone(87, 0.42, 0.055, "triangle", 0.035)]),
  effect("defeat", "敵撃破", "モンスターを倒した", [tone(294, 0.5, 0.1, "triangle", 0, 110), thump(110, 40, 0.65, 0.12, 0.035), noise(0.55, 0.09, 1400, 0.025, 180)]),
  effect("levelUp", "レベルアップ", "プレイヤーのレベルが上がった", [...chime([392, 494, 587, 784, 988, 1175], 0.115, 0.1, "triangle", 0.58), ...ring(392, 0.95, 0.045, 0.46)]),
  effect("stairs", "階層移動", "階段や落下で別の階へ移動", chime([587, 494, 392, 294], 0.12, 0.085, "sine", 0.42)),
  effect("pickup", "アイテム拾得", "床や容器から道具を所持品へ入れた", chime([587, 880], 0.065, 0.075, "sine", 0.28)),
  effect("useItem", "道具使用", "その他の道具を使った", chime([440, 660], 0.09, 0.075, "triangle", 0.34)),
  effect("drink", "薬を飲む", "薬・泉の水を飲んだ", [tone(240, 0.14, 0.11, "sine", 0.015, 380), tone(310, 0.17, 0.1, "sine", 0.19, 470), tone(280, 0.18, 0.075, "sine", 0.37, 400), noise(0.42, 0.045, 800, 0.05, 180)]),
  effect("scroll", "巻物を読む", "巻物を読んで効果が発動", [noise(0.26, 0.065, 2100, 0, 700, "bandpass"), ...chime([523, 784, 1047], 0.12, 0.075, "sine", 0.52)]),
  effect("eat", "食べる", "食料を食べた", [thump(180, 95, 0.16, 0.09), thump(220, 110, 0.18, 0.08, 0.2), noise(0.13, 0.065, 1500, 0.018, 400), noise(0.15, 0.055, 1300, 0.22, 350)]),
  effect("throw", "投げる", "道具・石などを投げた", [noise(0.26, 0.08, 2300, 0, 650, "bandpass"), tone(200, 0.22, 0.055, "sine", 0, 480)]),
  effect("shoot", "矢・弾の発射", "矢や特殊飛び道具を発射", [thump(410, 120, 0.23, 0.095), noise(0.18, 0.09, 3600, 0.012, 800), ...ring(660, 0.32, 0.028, 0.02)]),
  effect("shatter", "壺・瓶・道具の破壊", "壺・瓶・大箱・装備などが壊れた", [noise(0.2, 0.16, 4500, 0, 1000, "highpass"), ...ring(1100, 0.68, 0.045), ...ring(1580, 0.5, 0.03, 0.07), noise(0.36, 0.035, 3000, 0.17, 800, "highpass")]),
  effect("trap", "罠作動", "罠が発動・作動した", [thump(420, 100, 0.25, 0.12), noise(0.17, 0.13, 1700, 0.025, 250), ...ring(610, 0.46, 0.04, 0.03)]),
  effect("explosion", "爆発", "地雷・時限爆弾・火薬・自爆などが爆発", [thump(115, 34, 0.95, 0.27), noise(0.32, 0.22, 2300, 0, 350), noise(1.18, 0.13, 900, 0.045, 90), thump(70, 30, 0.85, 0.1, 0.12)]),
  effect("magic", "魔法・杖", "魔法を唱えた、杖の魔法弾を放った", [tone(330, 0.38, 0.075, "triangle", 0, 660), ...chime([660, 880, 1320], 0.13, 0.07, "sine", 0.7), noise(0.72, 0.035, 2200, 0.13, 600, "bandpass")]),
  effect("heal", "HP回復", "薬・魔法などの回復効果", [...chime([523, 659, 784, 1047], 0.16, 0.075, "sine", 0.74), tone(262, 0.92, 0.04, "sine", 0.16), tone(392, 0.82, 0.03, "sine", 0.32)]),
  effect("revive", "復活", "MP・魔方陣・骨などから復活", [...chime([294, 440, 587, 880, 1175], 0.18, 0.085, "triangle", 0.72), tone(147, 1.15, 0.05, "sine", 0.2), ...ring(587, 0.88, 0.045, 0.58)]),
  effect("gold", "金貨拾得", "金貨・ゴールドを拾った", [...ring(1320, 0.4, 0.05), ...ring(1980, 0.3, 0.028, 0.065)]),
  effect("equip", "装備・装備解除", "武器・防具・矢・指輪の装備状態が変わった", [noise(0.1, 0.06, 2400, 0, 700), ...ring(520, 0.34, 0.055, 0.025), thump(150, 95, 0.18, 0.07)]),
  effect("identify", "識別", "道具・大箱の正体が明らかになった", chime([659, 988, 1319], 0.12, 0.07, "sine", 0.57)),
  effect("buff", "強化・祝福", "能力強化・祝福・倍速などが付いた", chime([392, 494, 659], 0.13, 0.075, "triangle", 0.56)),
  effect("curse", "呪い", "道具や装備が呪われた", [tone(233, 0.7, 0.075, "triangle", 0, 110), tone(246, 0.72, 0.055, "sine", 0.08, 116), tone(58, 0.68, 0.045, "sine", 0.12)]),
  effect("status", "状態異常", "毒・眠り・混乱・凍結などが付いた", [tone(330, 0.46, 0.07, "triangle", 0, 155), tone(294, 0.52, 0.055, "sine", 0.13, 140)]),
  effect("statusClear", "状態回復", "状態異常が治った、呪いが解けた", chime([440, 554, 740], 0.11, 0.055, "sine", 0.52)),
  effect("teleport", "転送・ワープ", "プレイヤーがテレポートやポータル転送", [tone(260, 0.38, 0.07, "sine", 0, 1320), tone(1320, 0.5, 0.055, "sine", 0.28, 480), ...ring(660, 0.58, 0.028, 0.3)]),
  effect("knockback", "吹き飛ばし", "プレイヤーが吹き飛ばされた", [noise(0.38, 0.09, 2000, 0, 250), thump(190, 65, 0.38, 0.1, 0.015)]),
  effect("wallBreak", "壁を壊す", "壁・石像を掘る、壊す", [noise(0.24, 0.14, 1300, 0, 180), thump(125, 45, 0.45, 0.14), noise(0.44, 0.05, 700, 0.12, 110)]),
  effect("container", "容器への出し入れ", "壺・大箱へ道具を入れた、取り出した", [...ring(270, 0.28, 0.05), noise(0.08, 0.045, 1200, 0.03, 500)]),
  effect("shopBuy", "購入", "店で道具を購入、代金を払った", chime([784, 988, 1175], 0.09, 0.055, "sine", 0.36)),
  effect("shopSell", "売却・換金", "店へ売却、巻物などで換金した", chime([1175, 988, 784], 0.085, 0.055, "sine", 0.36)),
  effect("gacha", "ガチャ", "ガチャを回して景品が出た", [...chime([392, 494, 587, 494, 587, 784, 988], 0.095, 0.07, "triangle", 0.32), ...ring(784, 0.62, 0.035, 0.55)]),
  effect("water", "水・泉", "水に入った、泉へ道具を浸した、薬液が飛散", [noise(0.52, 0.065, 1900, 0, 350, "bandpass"), tone(290, 0.17, 0.035, "sine", 0.035, 130), tone(420, 0.15, 0.025, "sine", 0.21, 210)]),
  effect("footstep", "足音", "ダンジョンを歩いた（控えめな短い音）", [noise(0.07, 0.025, 500, 0, 160), thump(105, 65, 0.075, 0.02)]),
  effect("cursor", "カーソル移動", "メニューの選択肢を動かした", [tone(740, 0.045, 0.035, "triangle")]),
  effect("select", "決定", "メニューを開いた、項目を決定した", chime([660, 880], 0.045, 0.04, "sine", 0.13)),
  effect("cancel", "キャンセル", "メニューを閉じた、戻った", chime([660, 494], 0.04, 0.035, "sine", 0.11)),
  effect("alert", "ピンチ・空腹警告", "ピンチや空腹ダメージが発生", [tone(880, 0.14, 0.08, "triangle"), tone(740, 0.18, 0.07, "triangle", 0.18)]),
].map(sound => [sound.id, sound]));

export const ALL_SE_LIST = Object.values(SOUND_EFFECTS).map(({ id, name, desc }) => ({ id, name, desc }));

export function soundEffectDuration(id) {
  return Math.max(0, ...(SOUND_EFFECTS[id]?.voices || []).map(voice => voice.start + voice.duration));
}
