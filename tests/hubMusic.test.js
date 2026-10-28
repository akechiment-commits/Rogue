import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => []);
const audio = vi.hoisted(() => ({ updateHubBgm: vi.fn(), unlockAudio: vi.fn(), stopBgm: vi.fn() }));
vi.mock("react", () => ({ useEffect: fn => effects.push(fn) }));
vi.mock("../soundEvents.js", () => audio);
import { useHubMusic } from "../useHubMusic.js";

let listeners, cleanup;
beforeEach(() => {
  effects.length = 0; vi.clearAllMocks(); listeners = new Map(); cleanup = null;
  vi.stubGlobal("window", {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  });
});
afterEach(() => { cleanup?.(); vi.unstubAllGlobals(); });
const mount = () => { useHubMusic(); cleanup = effects.at(-1)(); };

describe("拠点テーマの接続", () => {
  it("表示でテーマを予約し、タッチ・クリック・キー操作では音声だけを有効化して曲を巻き戻さない", () => {
    mount();
    expect(audio.updateHubBgm).toHaveBeenCalledOnce();
    listeners.get("pointerdown")({ pointerType: "touch" });
    listeners.get("click")({});
    listeners.get("keydown")({ key: "8", code: "Numpad8" });
    listeners.get("keydown")({ key: "a", target: { tagName: "INPUT" } });
    expect(audio.unlockAudio).toHaveBeenCalledTimes(4);
    expect(audio.updateHubBgm).toHaveBeenCalledOnce();
  });
  it("出発時に曲と入力監視を片付け、帰還で新たにテーマを予約する", () => {
    mount(); cleanup(); cleanup = null;
    expect(listeners.size).toBe(0);
    expect(audio.stopBgm).toHaveBeenCalledOnce();
    mount();
    expect(audio.updateHubBgm).toHaveBeenCalledTimes(2);
    expect(listeners.size).toBe(3);
  });
});
