import { afterEach, describe, expect, it, vi } from "vitest";
import { soundEngine } from "../soundEngine.js";
import { classifySoundMessages, snapshotSoundState, soundStateChanges, soundForInterfaceKey, animationSounds } from "../soundRules.js";
import { processActionMessages, createMessageSoundObserver, queueAnimationSounds, stopBgm } from "../soundEvents.js";
import { SOUND_EFFECTS } from "../soundEffectData.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";

afterEach(() => { stopBgm(); vi.restoreAllMocks(); });

describe("効果音の発火範囲", () => {
  it.each([
    ["矢を射った。", "shoot"], ["魔法の石を射った。", "shoot"],
    ["魚雷を発射した。", "shoot"], ["短剣を投げた。", "throw"],
    ["回復の巻物を読んだ！", "scroll"], ["魔法を唱えた！", "magic"],
    ["回復薬を飲んだ。", "drink"], ["パンを食べた。", "eat"],
    ["HPが10回復した！", "heal"], ["残りMP20でHP20として復活！", "revive"],
    ["時限爆弾の罠が大爆発した！", "explosion"], ["矢の罠が発動！", "trap"],
    ["大箱から短剣を取り出した。", "container"], ["壁を叩き壊した！", "wallBreak"],
    ["短剣を500Gで購入した。", "shopBuy"], ["短剣を250Gで換金した！", "shopSell"],
    ["ガチャを回した！", "gacha"], ["正体が明らかになった！", "identify"],
    ["ガチャマシーンから短剣が出てきた。", "gacha"],
    ["短剣を250Gで買い取った。", "shopSell"],
    ["短剣が祝福された！", "buff"], ["短剣が呪われた！", "curse"],
    ["ポータルから地下2階のポータルへ抜けた！", "teleport"],
  ])("実際の文型を認識する: %s", (text, sound) => {
    expect(classifySoundMessages([text])).toContain(sound);
  });

  it("命中・撃破・反撃を1種類に打ち切らず、同じ種類の連打だけをまとめる", () => {
    const play = vi.spyOn(soundEngine, "playSE").mockImplementation(() => {});
    processActionMessages([
      "ゆうの攻撃！スライムに8ダメージ！", "スライムを倒した！",
      "ゴブリンの攻撃！5ダメージ！", "オークの攻撃！4ダメージ！",
    ], { playerName: "ゆう" });
    expect(play.mock.calls.map(([id]) => id)).toEqual(["hit", "defeat", "playerDamage"]);
  });

  it("会心と通常命中、ログとアニメーションの重複を抑える", () => {
    const play = vi.spyOn(soundEngine, "playSE").mockImplementation(() => {});
    const observer = createMessageSoundObserver();
    queueAnimationSounds({ attacks: [{ type: "attack" }], damages: [{ type: "damage", value: 20, color: "#ffff00" }] });
    const messages = [{ text: "会心の一撃！スライムに20ダメージ！" }];
    observer(messages); observer(messages);
    expect(play.mock.calls.map(([id]) => id)).toEqual(["crit"]);
  });

  it("履歴上限後も追加を拾い、復元履歴と状態初期化では鳴らさない", () => {
    const play = vi.spyOn(soundEngine, "playSE").mockImplementation(() => {});
    const observer = createMessageSoundObserver();
    const state = { player: makePlayer({ depth: 1 }), dungeon: makeEmptyDg() };
    const history = Array.from({ length: 81 }, () => ({ text: "回復薬を飲んだ。" }));
    observer(history, { reset: true, state });
    expect(play).not.toHaveBeenCalled();
    const next = [...history.slice(-80), { text: "矢を射った。" }];
    observer(next, { state }); observer(next, { state });
    expect(play.mock.calls.map(([id]) => id)).toEqual(["shoot"]);
  });

  it("同じplayerオブジェクトを書き換えても、HP・装備・状態の変化を捕まえる", () => {
    const play = vi.spyOn(soundEngine, "playSE").mockImplementation(() => {});
    const state = { player: makePlayer({ depth: 1 }), dungeon: makeEmptyDg() };
    const observer = createMessageSoundObserver();
    observer([], { state });
    state.player.hp -= 4;
    state.player.weapon = { id: "sword", name: "短剣" };
    state.player.slowTurns = 10;
    observer([], { state });
    expect(play.mock.calls.map(([id]) => id)).toEqual(["playerDamage", "equip", "status"]);
  });

  it("転送時に足音を重ねず、自然回復や罠の説明だけでは効果音を鳴らさない", () => {
    const play = vi.spyOn(soundEngine, "playSE").mockImplementation(() => {});
    processActionMessages(["テレポートした！"], { changes: ["footstep"] });
    expect(play.mock.calls.map(([id]) => id)).toEqual(["teleport"]);
    play.mockClear();
    const state = { player: makePlayer({ hp: 90, depth: 1 }), dungeon: makeEmptyDg() };
    const before = snapshotSoundState(state);
    state.player.hp++;
    expect(soundStateChanges(before, snapshotSoundState(state))).toEqual([]);
    processActionMessages(["足元に地雷がある。", "これは回復薬。飲むとHPが回復する。"]);
    expect(play).not.toHaveBeenCalled();
    const notices = classifySoundMessages(["祝福された雷の杖を振った！", "呪われた爆発の魔方陣が炎を打ち消した！"]);
    expect(notices).not.toContain("buff");
    expect(notices).not.toContain("curse");
  });

  it("回復と雷の描画を爆発音として扱わない", () => {
    expect(animationSounds({ explosions: [{ type: "heal" }, { type: "lightning" }] })).toEqual(["heal", "magic"]);
  });

  it.each(["Numpad8", "Numpad2", "Numpad4", "Numpad6"])("テンキーでもメニュー移動音が鳴る: %s", code => {
    expect(soundForInterfaceKey({ key: code.slice(-1), code })).toBe("cursor");
  });
  it("名前入力中の文字・矢印操作ではメニュー音を鳴らさない", () => {
    expect(soundForInterfaceKey({ key: "z", target: { tagName: "INPUT" } })).toBeNull();
    expect(soundForInterfaceKey({ key: "ArrowLeft", target: { tagName: "TEXTAREA" } })).toBeNull();
  });

  it("全カタログの音に発音レシピがあり、長さ・音量・音高が有限値", () => {
    expect(Object.keys(SOUND_EFFECTS)).toHaveLength(40);
    for (const effect of Object.values(SOUND_EFFECTS)) for (const voice of effect.voices) {
      expect(Number.isFinite(voice.duration) && voice.duration > 0).toBe(true);
      expect(Number.isFinite(voice.gain) && voice.gain >= 0 && voice.gain <= 1).toBe(true);
      if (voice.kind === "tone") expect(Number.isFinite(voice.freq) && voice.freq > 0).toBe(true);
    }
  });
});
