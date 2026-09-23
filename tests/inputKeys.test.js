import { describe, it, expect } from "vitest";
import { isKeyUp, isKeyDown, isKeyLeft, isKeyRight, getDigitNumber } from "../inputKeys.js";

describe("inputKeys helper tests", () => {
  it("矢印キーとテンキーを正しく判定する", () => {
    expect(isKeyUp({ key: "ArrowUp", code: "ArrowUp" })).toBe(true);
    expect(isKeyUp({ key: "8", code: "Numpad8" })).toBe(true);
    expect(isKeyUp({ key: "ArrowDown", code: "ArrowDown" })).toBe(false);

    expect(isKeyDown({ key: "ArrowDown", code: "ArrowDown" })).toBe(true);
    expect(isKeyDown({ key: "2", code: "Numpad2" })).toBe(true);
    expect(isKeyDown({ key: "ArrowUp", code: "ArrowUp" })).toBe(false);

    expect(isKeyLeft({ key: "ArrowLeft", code: "ArrowLeft" })).toBe(true);
    expect(isKeyLeft({ key: "4", code: "Numpad4" })).toBe(true);
    expect(isKeyLeft({ key: "ArrowRight", code: "ArrowRight" })).toBe(false);

    expect(isKeyRight({ key: "ArrowRight", code: "ArrowRight" })).toBe(true);
    expect(isKeyRight({ key: "6", code: "Numpad6" })).toBe(true);
    expect(isKeyRight({ key: "ArrowLeft", code: "ArrowLeft" })).toBe(false);
  });

  it("getDigitNumber はキーボード上部数字キー(Digit1〜9)のみ数値を返し、テンキー(Numpad)はnullを返す", () => {
    // Digit1〜9 は数値を返す
    expect(getDigitNumber({ key: "1", code: "Digit1" })).toBe(1);
    expect(getDigitNumber({ key: "2", code: "Digit2" })).toBe(2);
    expect(getDigitNumber({ key: "9", code: "Digit9" })).toBe(9);

    // テンキー(Numpad)は移動・斜め移動用のため null を返す（誤爆防止）
    expect(getDigitNumber({ key: "1", code: "Numpad1" })).toBe(null);
    expect(getDigitNumber({ key: "2", code: "Numpad2" })).toBe(null);
    expect(getDigitNumber({ key: "4", code: "Numpad4" })).toBe(null);
    expect(getDigitNumber({ key: "8", code: "Numpad8" })).toBe(null);

    // 0 や英字キーは null を返す
    expect(getDigitNumber({ key: "0", code: "Digit0" })).toBe(null);
    expect(getDigitNumber({ key: "z", code: "KeyZ" })).toBe(null);
    expect(getDigitNumber({ key: "Enter", code: "Enter" })).toBe(null);
    expect(getDigitNumber(null)).toBe(null);
  });
});
