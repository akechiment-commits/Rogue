import { describe, it, expect } from "vitest";
import {
  axisToDir,
  edgeDown,
  edgeUp,
  buttonPressed,
  hasNearbyMonster,
  QUICK_MENU_ITEMS,
} from "../gamepadInput.js";

describe("axisToDir", () => {
  it("returns null inside deadzone", () => {
    expect(axisToDir(0.1, 0.1)).toBeNull();
    expect(axisToDir(0, 0)).toBeNull();
  });
  it("maps cardinals", () => {
    expect(axisToDir(0, -0.9)).toEqual({ dx: 0, dy: -1 });
    expect(axisToDir(0.9, 0)).toEqual({ dx: 1, dy: 0 });
  });
  it("maps diagonals", () => {
    expect(axisToDir(0.8, 0.8)).toEqual({ dx: 1, dy: 1 });
    expect(axisToDir(-0.8, -0.8)).toEqual({ dx: -1, dy: -1 });
  });
});

describe("edges", () => {
  it("detects down and up", () => {
    expect(edgeDown({ 0: false }, { 0: true }, 0)).toBe(true);
    expect(edgeDown({ 0: true }, { 0: true }, 0)).toBe(false);
    expect(edgeUp({ 0: true }, { 0: false }, 0)).toBe(true);
  });
});

describe("buttonPressed", () => {
  it("reads pressed / value", () => {
    const gp = {
      buttons: [
        { pressed: true, value: 1 },
        { pressed: false, value: 0.2 },
        { pressed: false, value: 0.8 },
      ],
    };
    expect(buttonPressed(gp, 0)).toBe(true);
    expect(buttonPressed(gp, 1)).toBe(false);
    expect(buttonPressed(gp, 2)).toBe(true);
  });
});

describe("hasNearbyMonster", () => {
  it("3マス以内の敵を足踏み停止対象にする", () => {
    expect(hasNearbyMonster({ x: 5, y: 5 }, { monsters: [{ x: 8, y: 7 }] })).toBe(true);
    expect(hasNearbyMonster({ x: 5, y: 5 }, { monsters: [{ x: 9, y: 5 }] })).toBe(false);
  });
});

describe("QUICK_MENU_ITEMS", () => {
  it("includes required commands", () => {
    const ids = QUICK_MENU_ITEMS.map((x) => x.id);
    for (const id of ["item", "map", "arrow", "look", "log", "underfoot", "magic", "settings", "scores", "tiles", "traps", "interrupt"]) {
      expect(ids).toContain(id);
    }
  });
});

import { dirToArrow, modalDirToArrow, getGamepadArrow } from "../useGamepad.js";

describe("dirToArrow vs modalDirToArrow", () => {
  it("通常移動用 dirToArrow は斜め入力時に Numpad1/3/7/9 を返す", () => {
    expect(dirToArrow(-1, -1)).toEqual({ key: "7", code: "Numpad7" });
    expect(dirToArrow(1, -1)).toEqual({ key: "9", code: "Numpad9" });
    expect(dirToArrow(-1, 1)).toEqual({ key: "1", code: "Numpad1" });
    expect(dirToArrow(1, 1)).toEqual({ key: "3", code: "Numpad3" });
  });

  it("モーダル用 modalDirToArrow は斜め入力を上下左右（Arrow*）に正規化し、Numpadを発火しない", () => {
    // 縦横単独
    expect(modalDirToArrow(0, -1)).toEqual({ key: "ArrowUp", code: "ArrowUp" });
    expect(modalDirToArrow(0, 1)).toEqual({ key: "ArrowDown", code: "ArrowDown" });
    expect(modalDirToArrow(-1, 0)).toEqual({ key: "ArrowLeft", code: "ArrowLeft" });
    expect(modalDirToArrow(1, 0)).toEqual({ key: "ArrowRight", code: "ArrowRight" });

    // 斜め入力時：上下優先または左右の Arrow キーに丸められ、決して数字やNumpadキーにならない
    const res1 = modalDirToArrow(-1, 1);
    expect(res1.code.startsWith("Arrow")).toBe(true);
    expect(res1.key.startsWith("Arrow")).toBe(true);

    const res2 = modalDirToArrow(1, -1);
    expect(res2.code.startsWith("Arrow")).toBe(true);
    expect(res2.key.startsWith("Arrow")).toBe(true);
  });

  it("getGamepadArrow はモードに応じて適切な方向変換を選択する", () => {
    // 一般メニュー（デフォルト）: 斜めは Arrow* に丸められる
    const menuResult = getGamepadArrow({}, 1, 1);
    expect(menuResult.code.startsWith("Arrow")).toBe(true);

    // 見渡す（lookMode）: 斜め入力が Numpad3 としてそのまま通る
    expect(getGamepadArrow({ isLook: true }, 1, 1)).toEqual({ key: "3", code: "Numpad3" });

    // 投擲・射撃・杖振り（throwMode）: 斜め入力が Numpad7 としてそのまま通る
    expect(getGamepadArrow({ isThrow: true }, -1, -1)).toEqual({ key: "7", code: "Numpad7" });

    // テレポート場所選択（tpSelectMode）: 斜め入力が Numpad9 としてそのまま通る
    expect(getGamepadArrow({ isTpSelect: true }, 1, -1)).toEqual({ key: "9", code: "Numpad9" });
  });
});

