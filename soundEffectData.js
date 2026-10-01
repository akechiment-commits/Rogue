/** 音色レシピと表示名を一元化し、サウンドテストとゲームで同じ音を使う。 */
const tone = (freq, duration, gain, type = "sine", start = 0, pitchSlideTo = null) =>
  ({ kind: "tone", freq, duration, gain, type, start, pitchSlideTo });
const noise = (duration, gain, filterFreq, start = 0, filterSlideTo = null, filterType = "lowpass") =>
  ({ kind: "noise", duration, gain, filterFreq, start, filterSlideTo, filterType });
const chime = (frequencies, spacing = 0.065, gain = 0.16, type = "triangle") =>
  frequencies.map((freq, index) => tone(freq, 0.14, gain, type, index * spacing));
const effect = (id, name, desc, voices) => ({ id, name, desc, voices });

export const SOUND_EFFECTS = Object.fromEntries([
  effect("hit", "攻撃ヒット", "近接攻撃が命中", [tone(190, 0.085, 0.22, "triangle", 0, 65), noise(0.065, 0.2, 1800, 0, 350)]),
  effect("crit", "会心の一撃", "会心・痛恨・強烈な一撃", [tone(430, 0.13, 0.23, "triangle", 0, 65), tone(860, 0.1, 0.13, "square", 0.016, 170), noise(0.17, 0.27, 2900, 0, 150)]),
  effect("miss", "空振り・回避", "近接攻撃や飛び道具が外れた", [noise(0.1, 0.09, 1700, 0, 600, "bandpass")]),
  effect("playerDamage", "被ダメージ", "敵・罠・毒・反動などでダメージを受けた", [tone(145, 0.14, 0.23, "triangle", 0, 48), noise(0.12, 0.22, 1000, 0, 160)]),
  effect("defeat", "敵撃破", "モンスターを倒した", [tone(260, 0.16, 0.15, "triangle", 0, 55), noise(0.14, 0.12, 1400, 0.025, 250)]),
  effect("levelUp", "レベルアップ", "プレイヤーのレベルが上がった", chime([392, 494, 587, 784, 988, 1175], 0.075, 0.17)),
  effect("stairs", "階層移動", "階段や落下で別の階へ移動", chime([587, 494, 392, 294], 0.065, 0.12)),
  effect("pickup", "アイテム拾得", "床や容器から道具を所持品へ入れた", chime([587, 880], 0.04, 0.12)),
  effect("useItem", "道具使用", "その他の道具を使った", chime([440, 660], 0.055, 0.12)),
  effect("drink", "薬を飲む", "薬・泉の水を飲んだ", [tone(320, 0.08, 0.13, "sine", 0, 480), tone(410, 0.09, 0.12, "sine", 0.065, 610), noise(0.08, 0.05, 800, 0.025, 180)]),
  effect("scroll", "巻物を読む", "巻物を読んで効果が発動", [noise(0.1, 0.07, 2100, 0, 700, "bandpass"), ...chime([523, 784, 1047], 0.05, 0.1)]),
  effect("eat", "食べる", "食料を食べた", [tone(180, 0.045, 0.15, "triangle", 0, 250), tone(220, 0.055, 0.13, "triangle", 0.075, 300), noise(0.04, 0.065, 1500, 0.018, 400)]),
  effect("throw", "投げる", "道具・石などを投げた", [noise(0.105, 0.08, 2300, 0, 650, "bandpass"), tone(240, 0.08, 0.08, "sine", 0, 580)]),
  effect("shoot", "矢・弾の発射", "矢や特殊飛び道具を発射", [tone(470, 0.07, 0.13, "triangle", 0, 110), noise(0.075, 0.12, 3600, 0.012, 800)]),
  effect("shatter", "壺・瓶・道具の破壊", "壺・瓶・大箱・装備などが壊れた", [noise(0.18, 0.2, 4500, 0, 1000, "highpass"), ...chime([1500, 2100, 2800], 0.02, 0.035, "sine")]),
  effect("trap", "罠作動", "罠が発動・作動した", [tone(780, 0.07, 0.16, "triangle", 0, 130), noise(0.1, 0.15, 1700, 0.025, 250)]),
  effect("explosion", "爆発", "地雷・時限爆弾・火薬・自爆などが爆発", [tone(110, 0.3, 0.3, "sine", 0, 28), noise(0.38, 0.35, 1300, 0, 100), noise(0.1, 0.12, 3800, 0, 300)]),
  effect("magic", "魔法・杖", "魔法を唱えた、杖の魔法弾を放った", [tone(440, 0.15, 0.1, "triangle", 0, 1150), tone(880, 0.17, 0.085, "sine", 0.045, 1450)]),
  effect("heal", "HP回復", "薬・魔法などの回復効果", chime([523, 659, 784, 1047], 0.065, 0.1, "sine")),
  effect("revive", "復活", "MP・魔方陣・骨などから復活", chime([294, 440, 587, 880, 1175], 0.07, 0.15)),
  effect("gold", "金貨拾得", "金貨・ゴールドを拾った", [tone(1320, 0.09, 0.07, "sine"), tone(1980, 0.14, 0.06, "sine", 0.045)]),
  effect("equip", "装備・装備解除", "武器・防具・矢・指輪の装備状態が変わった", [noise(0.035, 0.08, 2400, 0, 700), tone(740, 0.08, 0.085, "triangle", 0.02, 930)]),
  effect("identify", "識別", "道具・大箱の正体が明らかになった", chime([659, 988, 1319], 0.055, 0.09, "sine")),
  effect("buff", "強化・祝福", "能力強化・祝福・倍速などが付いた", chime([392, 494, 659], 0.06, 0.09)),
  effect("curse", "呪い", "道具や装備が呪われた", [tone(233, 0.2, 0.095, "triangle", 0, 110), tone(246, 0.19, 0.065, "sine", 0.03, 116)]),
  effect("status", "状態異常", "毒・眠り・混乱・凍結などが付いた", [tone(330, 0.12, 0.085, "triangle", 0, 155), tone(294, 0.13, 0.06, "sine", 0.065, 140)]),
  effect("statusClear", "状態回復", "状態異常が治った、呪いが解けた", chime([440, 554, 740], 0.05, 0.07, "sine")),
  effect("teleport", "転送・ワープ", "プレイヤーがテレポートやポータル転送", [tone(260, 0.17, 0.09, "sine", 0, 1500), tone(1500, 0.14, 0.06, "sine", 0.12, 480)]),
  effect("knockback", "吹き飛ばし", "プレイヤーが吹き飛ばされた", [noise(0.13, 0.1, 2000, 0, 250), tone(190, 0.1, 0.095, "sine", 0.015, 70)]),
  effect("wallBreak", "壁を壊す", "壁・石像を掘る、壊す", [noise(0.13, 0.16, 1300, 0, 180), tone(100, 0.085, 0.12, "triangle", 0, 45)]),
  effect("container", "容器への出し入れ", "壺・大箱へ道具を入れた、取り出した", [tone(270, 0.055, 0.07, "triangle", 0, 160), noise(0.035, 0.05, 1200, 0.03, 500)]),
  effect("shopBuy", "購入", "店で道具を購入、代金を払った", chime([784, 988, 1175], 0.055, 0.07)),
  effect("shopSell", "売却・換金", "店へ売却、巻物などで換金した", chime([1175, 988, 784], 0.045, 0.07)),
  effect("gacha", "ガチャ", "ガチャを回して景品が出た", chime([392, 494, 587, 494, 587, 784, 988], 0.055, 0.09)),
  effect("water", "水・泉", "水に入った、泉へ道具を浸した、薬液が飛散", [noise(0.14, 0.075, 1900, 0, 350, "bandpass"), tone(290, 0.07, 0.045, "sine", 0.035, 130)]),
  effect("footstep", "足音", "ダンジョンを歩いた（控えめな短い音）", [noise(0.025, 0.035, 500, 0, 160), tone(105, 0.02, 0.025, "sine", 0, 65)]),
  effect("cursor", "カーソル移動", "メニューの選択肢を動かした", [tone(740, 0.022, 0.045, "triangle")]),
  effect("select", "決定", "メニューを開いた、項目を決定した", chime([660, 880], 0.035, 0.055)),
  effect("cancel", "キャンセル", "メニューを閉じた、戻った", chime([660, 494], 0.03, 0.045)),
  effect("alert", "ピンチ・空腹警告", "ピンチや空腹ダメージが発生", [tone(880, 0.06, 0.12, "triangle"), tone(740, 0.07, 0.1, "triangle", 0.12)]),
].map(sound => [sound.id, sound]));

export const ALL_SE_LIST = Object.values(SOUND_EFFECTS).map(({ id, name, desc }) => ({ id, name, desc }));
