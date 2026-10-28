import { describe, it, expect } from "vitest";
import { isRepeatBlockedKey } from "../useKeyHandler.js";

const makeKeyEvent = (key, repeat = false, target = null) => ({
  key,
  repeat,
  target,
  preventDefault: () => {},
});

describe("isRepeatBlockedKey", () => {
  it("初回押下（repeat: false）では全てのキーを通す", () => {
    const keys = ["x", "c", "i", "m", "Escape", "s", "z", "ArrowUp", "Numpad8"];
    for (const key of keys) {
      expect(isRepeatBlockedKey(makeKeyEvent(key, false))).toBe(false);
    }
  });

  it("押しっぱなし（repeat: true）時にメニュー開閉・キャンセルキーをブロックする", () => {
    // x: インベントリ開閉・キャンセル
    expect(isRepeatBlockedKey(makeKeyEvent("x", true))).toBe(true);
    expect(isRepeatBlockedKey(makeKeyEvent("X", true))).toBe(true);

    // c: 魔法一覧開閉
    expect(isRepeatBlockedKey(makeKeyEvent("c", true))).toBe(true);
    expect(isRepeatBlockedKey(makeKeyEvent("C", true))).toBe(true);

    // i: インベントリ開閉
    expect(isRepeatBlockedKey(makeKeyEvent("i", true))).toBe(true);

    // m: メッセージログ開閉
    expect(isRepeatBlockedKey(makeKeyEvent("m", true))).toBe(true);

    // Escape: キャンセル
    expect(isRepeatBlockedKey(makeKeyEvent("Escape", true))).toBe(true);
  });

  it("押しっぱなし（repeat: true）時でも、連続実行したいアクションキー（s, z, 移動キー）はブロックしない", () => {
    // s: 足踏み・罠探索（ターン送り、HP回復）
    expect(isRepeatBlockedKey(makeKeyEvent("s", true))).toBe(false);
    expect(isRepeatBlockedKey(makeKeyEvent("S", true))).toBe(false);

    // z: 正面調べる・連続攻撃
    expect(isRepeatBlockedKey(makeKeyEvent("z", true))).toBe(false);
    expect(isRepeatBlockedKey(makeKeyEvent("Z", true))).toBe(false);

    // 移動キー
    expect(isRepeatBlockedKey(makeKeyEvent("ArrowUp", true))).toBe(false);
    expect(isRepeatBlockedKey(makeKeyEvent("ArrowDown", true))).toBe(false);
    expect(isRepeatBlockedKey(makeKeyEvent("ArrowLeft", true))).toBe(false);
    expect(isRepeatBlockedKey(makeKeyEvent("ArrowRight", true))).toBe(false);
    expect(isRepeatBlockedKey(makeKeyEvent("Numpad8", true))).toBe(false);

    // 待機・射撃
    expect(isRepeatBlockedKey(makeKeyEvent(".", true))).toBe(false);
    expect(isRepeatBlockedKey(makeKeyEvent("q", true))).toBe(false);
  });

  it("INPUTやTEXTAREAへのフォーカス時はrepeat: trueでもブロックしない（テキスト連続入力用）", () => {
    const inputEl = { tagName: "INPUT" };
    const textareaEl = { tagName: "TEXTAREA" };

    expect(isRepeatBlockedKey(makeKeyEvent("x", true, inputEl))).toBe(false);
    expect(isRepeatBlockedKey(makeKeyEvent("c", true, inputEl))).toBe(false);
    expect(isRepeatBlockedKey(makeKeyEvent("x", true, textareaEl))).toBe(false);
  });
});
