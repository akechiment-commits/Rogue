import { describe, expect, it, vi } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const hooks = vi.hoisted(() => ({ refs: [], index: 0, effects: [] }));
const resolveEvent = vi.hoisted(() => vi.fn(() => null));
vi.mock("react", () => ({
  useRef(initial) {
    const index = hooks.index++;
    if (!hooks.refs[index]) hooks.refs[index] = { current: initial };
    return hooks.refs[index];
  },
  useCallback: fn => fn,
  useEffect: fn => hooks.effects.push(fn),
}));
vi.mock("../portraits.js", async importOriginal => ({
  ...await importOriginal(), resolvePortraitEvent: resolveEvent,
}));
import { usePortrait } from "../usePortrait.js";

describe("立ち絵の新規ログ検出", () => {
  it("復元した履歴は再発火せず、上限で件数が変わらなくても追加行を検出する", () => {
    hooks.refs = [];
    resolveEvent.mockClear();
    const player = makePlayer();
    const dungeon = makeEmptyDg();
    const render = messages => {
      hooks.index = 0;
      hooks.effects = [];
      usePortrait({ gs: { player, dungeon }, msgs: messages, setPortraitSrc: vi.fn() });
      hooks.effects.at(-1)();
    };
    const history = Array.from({ length: 81 }, (_, index) => ({ text: `履歴${index}`, turn: index }));
    render(history);
    expect(resolveEvent.mock.calls.at(-1)[0].newMsgs).toEqual([]);
    const next = [...history.slice(-80), { text: "回復薬を飲んだ。", turn: 82 }];
    render(next);
    expect(resolveEvent.mock.calls.at(-1)[0].newMsgs).toEqual(["回復薬を飲んだ。"]);
    render(next);
    expect(resolveEvent.mock.calls.at(-1)[0].newMsgs).toEqual([]);
  });

  it("同じ罠メッセージが連続しても2回目を新規ログとして検出する", () => {
    hooks.refs = [];
    resolveEvent.mockClear();
    const player = makePlayer();
    const dungeon = makeEmptyDg();
    const render = messages => {
      hooks.index = 0;
      hooks.effects = [];
      usePortrait({ gs: { player, dungeon }, msgs: messages, setPortraitSrc: vi.fn() });
      hooks.effects.at(-1)();
    };
    const trapMessage = "転倒の罠が発動！";

    render(["前のログ", trapMessage]);
    expect(resolveEvent.mock.calls.at(-1)[0].newMsgs).toEqual([]);
    render(["前のログ", trapMessage, trapMessage]);
    expect(resolveEvent.mock.calls.at(-1)[0].newMsgs).toEqual([trapMessage]);
  });
});
