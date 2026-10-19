import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => []);
vi.mock("react", async () => ({
  ...await vi.importActual("react"), useCallback: fn => fn, useRef: value => ({ current: value }),
  useEffect: fn => { effects.push(fn); }, useLayoutEffect: fn => { effects.push(fn); },
  useState: value => [value, vi.fn()],
}));
import * as React from "react";
import { IdentifyModal } from "../GameModals.jsx";
import { useKeyHandler } from "../useKeyHandler.js";
import { useGamepad } from "../useGamepad.js";
import { BTN } from "../gamepadInput.js";
import { soundEngine } from "../soundEngine.js";
import { ITEMS, WANDS, POTS, RINGS, MAGIC_MARKER, EXCALIBUR_T } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

beforeEach(() => {
  effects.length = 0;
  vi.stubGlobal("React", React);
  vi.spyOn(soundEngine, "unlock").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function findTarget(node) {
  if (node == null) return null;
  if (Array.isArray(node)) return node.map(findTarget).find(Boolean);
  if (typeof node !== "object") return null;
  if (node.type === "div" && node.key === "0" && node.props.onClick) return node;
  return findTarget(node.props?.children);
}
function choose(input, source, action = "duplicate", modifiers = {}) {
  effects.length = 0;
  const target = structuredClone({ ...source, id: "target" });
  const scroll = { id: "scroll", name: "使用する巻物", type: "scroll", effect: action };
  const player = makePlayer({ inventory: [target, scroll], mp: 100, atk: 10, def: 5 });
  const sr = { current: { player, dungeon: makeEmptyDg({ rooms: [] }), ident: new Set(), fakeNames: {}, nicknames: {}, floors: {} } };
  const mode = { mode: action, sel: 0, scrollIdx: 1, ...modifiers };
  const endTurn = vi.fn(), identifyConfirmRef = { current: null }, listeners = {};
  const props = { sr, gs: sr.current, endTurn, setMode: vi.fn(), setGs: vi.fn(), setMsgs: vi.fn(), iLabel: item => item.name };
  const tree = IdentifyModal({ ...props, mode, identifyConfirmRef });
  vi.stubGlobal("window", {
    addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {},
    dispatchEvent: event => listeners[event.type]?.(event),
  });
  vi.stubGlobal("KeyboardEvent", class {
    constructor(type, args) { Object.assign(this, { type }, args); }
    preventDefault() {}
  });
  useKeyHandler({ ...props, identifyMode: mode, setIdentifyMode: props.setMode, identifyConfirmRef,
    shiftRef: { current: false }, aRef: { current: false }, arrowHeldRef: { current: {} }, execRef: { current: null } });
  effects.splice(0).forEach(fn => fn());
  if (input === "click" || input === "tap") findTarget(tree).props.onClick();
  else if (input === "mobileConfirm") identifyConfirmRef.current(0);
  else if (input === "keyboard") listeners.keydown(new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }));
  else {
    let tick;
    vi.stubGlobal("requestAnimationFrame", fn => { tick = fn; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    buttons[BTN.B] = { pressed: true, value: 1 };
    vi.stubGlobal("navigator", { getGamepads: () => [{ connected: true, mapping: "standard", buttons, axes: [0, 0, 0, 0] }] });
    useGamepad({ modalType: "identify", sr });
    effects.splice(0).forEach(fn => fn());
    tick(1000);
  }
  expect(endTurn).toHaveBeenCalledTimes(1);
  expect(player.inventory).not.toContain(scroll);
  return { player, target, copy: player.inventory[1], mode, sr };
}

const inputs = ["click", "tap", "keyboard", "controller", "mobileConfirm"];
describe.each(inputs)("複製の新品生成: %s", input => {
  it("消耗した杖は新品の使用回数になり、元の杖は変更しない", () => {
    const source = WANDS.find(w => w.effect === "fire_wand");
    const { target, copy } = choose(input, { ...source, charges: 1, shopPrice: 600, _shopCharge: 600 });
    expect(copy.charges).toBe(source.charges);
    expect(copy.shopPrice).toBeUndefined();
    expect(copy._shopCharge).toBeUndefined();
    expect(target.charges).toBe(1);
  });
  it("武器の合成能力と強化値を引き継がない", () => {
    const source = ITEMS.find(i => i.name === "ロングソード");
    const { target, copy } = choose(input, { ...source, plus: 9, ability: "bane_dragon", abilities: ["bane_dragon"] });
    expect(copy.name).toBe(source.name);
    expect(copy.plus || 0).toBe(0);
    expect(copy.abilities).toBeUndefined();
    expect(copy.ability).toBeUndefined();
    expect(target.plus).toBe(9);
  });
  it("新品に本来備わる固有能力はカタログから復元する", () => {
    const { copy } = choose(input, { ...EXCALIBUR_T, abilities: [EXCALIBUR_T.ability, "bane_dragon"], plus: 8 });
    expect(copy.ability).toBe(EXCALIBUR_T.ability);
    expect(copy.abilities).toBeUndefined();
  });
  it("壺は新品の容量・空の中身になり、捕獲した敵を複製しない", () => {
    const source = POTS.find(p => p.potEffect === "none");
    const { copy } = choose(input, { ...source, capacity: 20, contents: [{ name: "中身" }], confinedMonsters: [{ name: "敵" }] });
    expect(copy.capacity).toBeGreaterThanOrEqual(6);
    expect(copy.capacity).toBeLessThanOrEqual(9);
    expect(copy.contents).toEqual([]);
    expect(copy.confinedMonsters).toEqual([]);
  });
  it("魔法の筆も増量・消耗した回数を引き継がない", () => {
    const { copy } = choose(input, { ...MAGIC_MARKER, charges: 30 });
    expect(copy.charges).toBe(MAGIC_MARKER.charges);
  });
  it("指輪の付与能力と強化値をリセットする", () => {
    const source = RINGS.find(r => r.effect === "life_ring");
    const { copy } = choose(input, { ...source, plus: 8, abilities: ["regen"] });
    expect(copy.effect).toBe("life_ring");
    expect(copy.plus || 0).toBe(0);
    expect(copy.abilities).toBeUndefined();
  });
  it("祝福の複製では新品に祝福し、元の呪いはコピーしない", () => {
    const source = WANDS.find(w => w.effect === "fire_wand");
    const { copy } = choose(input, { ...source, charges: 1, cursed: true }, "duplicate", { blessed: true });
    expect(copy).toMatchObject({ charges: source.charges, blessed: true, cursed: false });
  });
});
