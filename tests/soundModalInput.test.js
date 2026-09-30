import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("react", () => ({
  useCallback: fn => fn,
  useRef: value => ({ current: value }),
  useState: value => [value, vi.fn()],
  useEffect: fn => fn(),
}));
import { useKeyHandler } from "../useKeyHandler.js";
import { useGamepad } from "../useGamepad.js";
import { BTN } from "../gamepadInput.js";
import { handleSoundModalKey } from "../SoundModal.jsx";
import { soundEngine } from "../soundEngine.js";

describe("サウンド画面の入力", () => {
  let listeners, tick;
  beforeEach(() => {
    listeners = {};
    vi.stubGlobal("window", { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: vi.fn() });
    vi.stubGlobal("requestAnimationFrame", fn => { tick = fn; return 1; });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("開いている間は待機・移動・射撃・所持品・魔法のキーをゲームへ通さない", () => {
    const act = vi.fn(), close = vi.fn();
    vi.spyOn(soundEngine, "unlock").mockImplementation(() => {});
    useKeyHandler({ showSound: true, act, setShowSound: close });
    for (const key of [".", "ArrowUp", "q", "i", "c"]) listeners.keydown({ key });
    expect(act).not.toHaveBeenCalled();
    listeners.keydown({ key: "Escape" });
    expect(close).toHaveBeenCalledWith(false);
  });
  it("ゲームパッドのLTショートカットやA+B待機もゲームへ通さず、Aで閉じる", () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    for (const index of [BTN.A, BTN.B, BTN.LT]) buttons[index] = { pressed: true, value: 1 };
    vi.stubGlobal("navigator", { getGamepads: () => [{ connected: true, mapping: "standard", buttons, axes: [0, 0, 0, 0] }] });
    vi.stubGlobal("KeyboardEvent", class { constructor(type, data) { Object.assign(this, { type }, data); } });
    window.dispatchEvent = vi.fn();
    const act = vi.fn(), dash = vi.fn(), close = vi.fn();
    useGamepad({ showSound: true, act, doDash: dash, setShowSound: close });
    tick(1000);
    expect(act).not.toHaveBeenCalled();
    expect(dash).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(false);
  });
  it.each([["ArrowRight", "ArrowRight"], ["6", "Numpad6"]])("%sで音量を同じように変更し、ゲーム入力を遮断する", (key, code) => {
    const range = { value: "0.4", dataset: { volume: "bgm" } };
    const panel = { querySelectorAll: () => [range], ownerDocument: { activeElement: range } };
    const volume = vi.spyOn(soundEngine, "setBgmVolume").mockImplementation(() => {});
    const event = { key, code, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    handleSoundModalKey(event, { panel, setBgmVol: vi.fn() });
    expect(volume).toHaveBeenCalledWith(expect.closeTo(0.41));
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
  });
});
