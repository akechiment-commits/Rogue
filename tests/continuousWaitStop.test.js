import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookState = vi.hoisted(() => ({
  refs: [],
  refIdx: 0,
  states: [],
  stateIdx: 0,
  effects: [],
  effectIdx: 0,
}));

vi.mock("react", () => ({
  useCallback: (fn) => fn,
  useRef: (init) => {
    const idx = hookState.refIdx++;
    if (!(idx in hookState.refs)) hookState.refs[idx] = { current: init };
    return hookState.refs[idx];
  },
  useState: (init) => {
    const idx = hookState.stateIdx++;
    if (!(idx in hookState.states)) hookState.states[idx] = init;
    const set = (v) => {
      hookState.states[idx] = typeof v === "function" ? v(hookState.states[idx]) : v;
    };
    return [hookState.states[idx], set];
  },
  useEffect: (fn, deps) => {
    const idx = hookState.effectIdx++;
    const prev = hookState.effects[idx];
    const changed =
      !prev ||
      !deps ||
      !prev.deps ||
      deps.length !== prev.deps.length ||
      deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) {
      prev?.cleanup?.();
      const cleanup = fn();
      hookState.effects[idx] = { deps, cleanup };
    }
  },
}));

import { useGamepad } from "../useGamepad.js";
import { useKeyHandler } from "../useKeyHandler.js";
import { BTN } from "../gamepadInput.js";
import { soundEngine } from "../soundEngine.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function beginRender() {
  hookState.refIdx = 0;
  hookState.stateIdx = 0;
  hookState.effectIdx = 0;
}

function resetHookRuntime() {
  for (const eff of hookState.effects) eff?.cleanup?.();
  hookState.refs = [];
  hookState.states = [];
  hookState.effects = [];
  beginRender();
}

describe("連続ターンスキップ中の敵接近オートストップ", () => {
  let listeners;
  let rafTick;
  let buttons;

  beforeEach(() => {
    resetHookRuntime();
    listeners = {};
    rafTick = null;
    buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    vi.spyOn(soundEngine, "unlock").mockImplementation(() => {});
    vi.stubGlobal("window", {
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("requestAnimationFrame", (fn) => {
      rafTick = fn;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("navigator", {
      getGamepads: () => [{ connected: true, mapping: "standard", buttons, axes: [0, 0, 0, 0] }],
    });
  });

  afterEach(() => {
    resetHookRuntime();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ゲームパッド A+B 長押し中、再レンダーを挟んでも敵が距離3に入ったら自動停止し、離して押し直すまで再開しない", () => {
    const player = makePlayer({ x: 5, y: 5 });
    const monster = { id: 1, x: 10, y: 5, hp: 10 };
    const dungeon = makeEmptyDg({ monsters: [monster] });
    const sr = { current: { player, dungeon } };
    const aRef = { current: false };
    const shiftRef = { current: false };
    const keyboardDashRef = { current: false };
    const gamepadDashRef = { current: false };
    const keyboardShiftRef = { current: false };
    const gamepadShiftRef = { current: false };
    const arrowHeldRef = { current: {} };
    const invActRef = { current: null };
    const showInvRef = { current: false };
    const dropModeRef = { current: false };
    const spellListModeRef = { current: false };
    const spellConfirmRef = { current: null };
    const msgsRef = { current: [] };

    const act = vi.fn((type) => {
      if (type === "wait") {
        monster.x -= 1;
        sr.current = { ...sr.current };
        renderPad();
      }
    });

    function renderPad() {
      beginRender();
      useGamepad({
        enabled: true,
        aRef,
        shiftRef,
        keyboardDashRef,
        gamepadDashRef,
        keyboardShiftRef,
        gamepadShiftRef,
        arrowHeldRef,
        sr,
        invActRef,
        act,
        doDash: vi.fn(),
        dead: false,
        showInvRef,
        dropModeRef,
        spellListModeRef,
        spellConfirmRef,
        msgsRef,
        /* Game.jsx と同様に毎レンダー新しい関数参照を渡す */
        setSpellListMode: () => {},
        setSpellMenuSel: () => {},
        setSpellPage: () => {},
        setMapMode: () => {},
        setNicknameMode: () => {},
        setNicknameInput: () => {},
        setShowSettings: () => {},
        setShowSound: () => {},
        setShowScores: () => {},
        setShowTileEditor: () => {},
        setExitHubConfirm: () => {},
        setFacingMode: () => {},
        setGs: () => {},
        setRbHeldUi: () => {},
        getLookDesc: () => "",
        setMsgs: () => {},
      });
    }

    renderPad();
    buttons[BTN.A] = { pressed: true, value: 1 };
    buttons[BTN.B] = { pressed: true, value: 1 };

    // 1ターン目: x=10 -> x=9 (距離4)
    rafTick(1000);
    expect(act).toHaveBeenCalledTimes(1);
    expect(monster.x).toBe(9);

    // 2ターン目: x=9 -> x=8 (距離3)
    rafTick(1150);
    expect(act).toHaveBeenCalledTimes(2);
    expect(monster.x).toBe(8);

    // 距離3に入った後は A+B を押し続けても停止したまま
    rafTick(1300);
    rafTick(1450);
    rafTick(1600);
    expect(act).toHaveBeenCalledTimes(2);
    expect(monster.x).toBe(8);

    // 一度 B を離して押し直すと1ターンだけ進むが、敵が近いままなので連続実行は止まる
    buttons[BTN.B] = { pressed: false, value: 0 };
    rafTick(1700);
    buttons[BTN.B] = { pressed: true, value: 1 };
    rafTick(1750);
    expect(act).toHaveBeenCalledTimes(3);
    expect(monster.x).toBe(7);

    rafTick(1950);
    rafTick(2150);
    expect(act).toHaveBeenCalledTimes(3);
    expect(monster.x).toBe(7);
  });

  it.each([
    { label: ". キー", key: ".", code: "Period", action: "wait" },
    { label: "S キー", key: "s", code: "KeyS", action: "search_traps" },
    { label: "大文字 S キー", key: "S", code: "KeyS", action: "search_traps" },
    { label: "テンキー 5", key: "5", code: "Numpad5", action: "wait" },
  ])("$label の押しっぱなし中、敵が3マス以内に入ったら連続スキップを停止し、離して押し直すまで再開しない", ({ key, code, action }) => {
    const player = makePlayer({ x: 5, y: 5 });
    const monster = { id: 1, x: 10, y: 5, hp: 10 };
    const dungeon = makeEmptyDg({ monsters: [monster] });
    const sr = { current: { player, dungeon } };

    const act = vi.fn((type) => {
      if (type === action) monster.x -= 1;
    });

    useKeyHandler({
      sr,
      gs: sr.current,
      throwMode: null,
      shiftRef: { current: false },
      aRef: { current: false },
      arrowHeldRef: { current: {} },
      act,
      doDash: vi.fn(),
    });

    let nowMs = 5000;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);

    const sendKey = (type, repeat = false) => {
      nowMs += 60;
      return listeners[type]({
        key,
        code,
        repeat,
        location: code === "Numpad5" ? 3 : 0,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      });
    };

    // 初回押下: 10 -> 9 (距離4)
    sendKey("keydown", false);
    expect(act).toHaveBeenCalledTimes(1);
    expect(act).toHaveBeenLastCalledWith(action);
    expect(monster.x).toBe(9);

    // 押しっぱなし2回目: 9 -> 8 (距離3に到達)
    sendKey("keydown", true);
    expect(act).toHaveBeenCalledTimes(2);
    expect(monster.x).toBe(8);

    // 距離3に入った後のリピートは停止する
    sendKey("keydown", true);
    sendKey("keydown", true);
    expect(act).toHaveBeenCalledTimes(2);
    expect(monster.x).toBe(8);

    // 一旦キーを離して押し直すと1ターンだけ進み、また連続実行は止まる
    sendKey("keyup", false);
    sendKey("keydown", false);
    expect(act).toHaveBeenCalledTimes(3);
    expect(monster.x).toBe(7);

    sendKey("keydown", true);
    sendKey("keydown", true);
    expect(act).toHaveBeenCalledTimes(3);
    expect(monster.x).toBe(7);
  });

  it("初回押下時点で既に敵が3マス以内にいる場合も、1ターン実行後に押しっぱなし連打は止まる", () => {
    const player = makePlayer({ x: 5, y: 5 });
    const monster = { id: 1, x: 7, y: 5, hp: 10 };
    const dungeon = makeEmptyDg({ monsters: [monster] });
    const sr = { current: { player, dungeon } };
    const act = vi.fn();

    useKeyHandler({
      sr,
      gs: sr.current,
      throwMode: null,
      shiftRef: { current: false },
      aRef: { current: false },
      arrowHeldRef: { current: {} },
      act,
      doDash: vi.fn(),
    });

    listeners.keydown({ key: ".", code: "Period", repeat: false, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() });
    listeners.keydown({ key: ".", code: "Period", repeat: true, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() });
    listeners.keydown({ key: ".", code: "Period", repeat: true, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() });
    expect(act).toHaveBeenCalledTimes(1);
  });
});
