import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => []);
const play = vi.hoisted(() => vi.fn());
vi.mock("react", () => ({ useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) }));
vi.mock("../soundEvents.js", () => ({ triggerSE: play, unlockAudio: vi.fn() }));
import { useInterfaceSounds } from "../useInterfaceSounds.js";

let listeners, cleanups;
beforeEach(() => {
  effects.length = 0; play.mockClear(); listeners = new Map();
  vi.stubGlobal("window", {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  });
});
afterEach(() => { for (const cleanup of cleanups || []) cleanup?.(); vi.unstubAllGlobals(); });
const mount = active => { useInterfaceSounds(active); cleanups = effects.map(effect => effect()); };

describe("メニュー効果音の接続", () => {
  it("キーボードとゲームパッドが送る同じ方向キーに反応し、閉じたメニューでは鳴らさない", () => {
    mount(true);
    listeners.get("keydown")({ key: "2", code: "Numpad2" });
    listeners.get("keydown")({ key: "Enter" });
    listeners.get("keydown")({ key: "Escape" });
    expect(play.mock.calls.map(([id]) => id)).toEqual(["cursor", "select", "cancel"]);
    cleanups.forEach(cleanup => cleanup?.());
    expect(listeners.size).toBe(0);
    effects.length = 0; play.mockClear(); mount(false);
    listeners.get("keydown")({ key: "ArrowUp" });
    expect(play).not.toHaveBeenCalled();
  });
  it("有効なボタンの決定とキャンセルを鳴らし、無効ボタンと音源テストを重複させない", () => {
    mount(true);
    const click = button => listeners.get("click")({ target: { closest: () => button } });
    click({ textContent: "購入する", disabled: false, closest: () => null });
    click({ textContent: "戻る", disabled: false, closest: () => null });
    click({ textContent: "購入する", disabled: true, closest: () => null });
    click({ textContent: "SEを試聴", disabled: false, closest: () => ({}) });
    expect(play.mock.calls.map(([id]) => id)).toEqual(["select", "cancel"]);
  });
});
