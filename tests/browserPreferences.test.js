import { afterEach, describe, expect, it, vi } from "vitest";
import { readPreference, writePreference, readDesktopViewportWidth } from "../browserPreferences.js";
import { soundEngine } from "../soundEngine.js";

afterEach(() => vi.unstubAllGlobals());

describe("ブラウザ設定の保存拒否", () => {
  it.each(["bad", "NaN", "Infinity", "", "-21", "999"])("異常な画面幅の設定を初期値へ戻す: %s", value => {
    vi.stubGlobal("localStorage", { getItem: () => value });
    expect(readDesktopViewportWidth()).toBe(25);
  });
  it.each([21, 25, 27, 33])("保存した画面幅を維持する: %s", value => {
    vi.stubGlobal("localStorage", { getItem: () => String(value) });
    expect(readDesktopViewportWidth()).toBe(value);
  });
  it.each(["bad", "NaN", "Infinity", ""])("音量へNaNや無限大を復元しない: %s", value => {
    const storage = { getItem: () => value };
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    const engine = new soundEngine.constructor();
    expect(engine.bgmVolume).toBe(0.4);
    expect(engine.seVolume).toBe(0.5);
  });
  it("設定の取得・保存と音量初期化で例外を外へ出さない", () => {
    vi.stubGlobal("localStorage", {
      getItem() { throw new Error("storage denied"); },
      setItem() { throw new Error("storage denied"); },
    });
    const deniedWindow = {};
    Object.defineProperty(deniedWindow, "localStorage", { get() { throw new Error("storage denied"); } });
    vi.stubGlobal("window", deniedWindow);
    expect(readPreference("roguelike_tileset", "default")).toBe("default");
    expect(readPreference("roguelike_desktop_vw", "25")).toBe("25");
    expect(writePreference("roguelike_tileset", "default")).toBe(false);
    expect(() => new soundEngine.constructor()).not.toThrow();
    expect(() => soundEngine._saveSettings()).not.toThrow();
  });
});
