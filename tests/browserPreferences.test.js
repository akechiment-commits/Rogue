import { afterEach, describe, expect, it, vi } from "vitest";
import { readPreference, writePreference } from "../browserPreferences.js";
import { soundEngine } from "../soundEngine.js";

afterEach(() => vi.unstubAllGlobals());

describe("ブラウザ設定の保存拒否", () => {
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
