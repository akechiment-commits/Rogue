import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async () => ({
  ...await vi.importActual("react"),
  useCallback: fn => fn,
  useRef: value => ({ current: value }),
  useState: value => [value, vi.fn()],
  useEffect: fn => fn(),
}));
import * as React from "react";
import { ShopModal } from "../GameModals.jsx";
import { useKeyHandler } from "../useKeyHandler.js";
import { useGamepad } from "../useGamepad.js";
import { BTN } from "../gamepadInput.js";
import { soundEngine } from "../soundEngine.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { placeItemAt } from "../items.js";

const textOf = node => node == null ? "" : Array.isArray(node) ? node.map(textOf).join("")
  : typeof node === "object" ? textOf(node.props?.children) : String(node);
function buttonWith(node, label) {
  if (!node) return null;
  if (Array.isArray(node)) return node.map(n => buttonWith(n, label)).find(Boolean);
  if (typeof node !== "object") return null;
  if (node.type === "button" && textOf(node).startsWith(label)) return node;
  return buttonWith(node.props?.children, label);
}

let listeners, tick;
beforeEach(() => {
  listeners = {};
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: vi.fn(),
    dispatchEvent: event => listeners[event.type]?.(event),
  });
  vi.stubGlobal("requestAnimationFrame", fn => { tick = fn; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("KeyboardEvent", class {
    constructor(type, args) { Object.assign(this, { type }, args); }
    preventDefault() {}
  });
  vi.spyOn(soundEngine, "unlock").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup({ mode = "browseConfirm", selection = 1, rings = [], twoShops = false, gold = 2000 } = {}) {
  const item = { id: "sword", name: "剣", type: "weapon", sellPrice: 1000, atk: 10 };
  const shop = { id: "shop", unpaidTotal: 0, shopkeeperId: "sk", room: { x: 2, y: 2, w: 8, h: 8 } };
  const other = { id: "other", unpaidTotal: 200, shopkeeperId: "sk2", room: { x: 15, y: 2, w: 8, h: 8 } };
  const sk = { id: "sk", name: "店主", type: "shopkeeper", state: "friendly", x: 5, y: 6, homePos: { x: 5, y: 6 } };
  const player = makePlayer({ gold, depth: 1, rings, inventory: [item] });
  const dungeon = makeEmptyDg({ shop, shops: twoShops ? [shop, other] : [shop], monsters: [sk], rooms: [] });
  const sr = { current: { player, dungeon } }, shopActionsRef = { current: null };
  const setters = { setMode: vi.fn(), setMenuSel: vi.fn(), setMsgs: vi.fn(), setGs: vi.fn() };
  const tree = ShopModal({ ...setters, mode, gs: sr.current, sr, menuSel: selection, shopActionsRef });
  useKeyHandler({ sr, shopMode: mode, shopMenuSel: selection, shopActionsRef,
    setShopMode: setters.setMode, setShopMenuSel: setters.setMenuSel });
  return { tree, player, item, shop, other, dungeon, sr, shopActionsRef, ...setters };
}

function choose(state, input, label, selection) {
  if (input === "click" || input === "tap") buttonWith(state.tree, label).props.onClick();
  else if (input === "mobileConfirm") state.shopActionsRef.current.confirm(selection);
  else if (input === "keyboard") listeners.keydown(new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }));
  else {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    buttons[BTN.B] = { pressed: true, value: 1 };
    vi.stubGlobal("navigator", { getGamepads: () => [{ connected: true, mapping: "standard", buttons, axes: [0, 0, 0, 0] }] });
    useGamepad({ modalType: "shop", sr: state.sr });
    tick(1000);
  }
}

const inputs = ["click", "tap", "keyboard", "controller", "mobileConfirm"];
describe.each(inputs)("店の入力一致: %s", input => {
  it.each([[[], 1000], [[{ effect: "bargain_ring" }], 700], [[{ effect: "markup_ring" }], 1500]])(
    "売却・買い戻し・返却精算は指輪%jでも共通", (rings, expectedCharge) => {
      const state = setup({ rings });
      choose(state, input, "はい、全て売る", 1);
      expect(state.player.gold).toBe(2500);
      expect(state.item).toMatchObject({ shopPrice: 1000, _shopCharge: expectedCharge, _shopId: "shop" });
      expect(state.shop.unpaidTotal).toBe(expectedCharge);
      expect(state.dungeon.monsters[0].state).toBe("blocking");
      expect(state.setMode).toHaveBeenCalledWith(null);
      state.player.inventory = [];
      placeItemAt(state.dungeon, 5, 5, state.item, [], new Set(), 0, state.player);
      expect(state.shop.unpaidTotal).toBe(0);
    },
  );

  it("複数店舗の支払いでは会話中の店だけを精算する", () => {
    const state = setup({ mode: "pay", selection: 0, twoShops: true });
    state.shop.unpaidTotal = 100;
    Object.assign(state.item, { shopPrice: 100, _shopCharge: 100, _shopId: "shop" });
    choose(state, input, "支払う", 0);
    expect(state.player.gold).toBe(1900);
    expect(state.shop.unpaidTotal).toBe(0);
    expect(state.other.unpaidTotal).toBe(200);
    expect(state.item.shopPrice).toBeUndefined();
  });

  it("表示から確定までに残高が不足した場合も同じ結果になる", () => {
    const state = setup({ mode: "pay", selection: 0, gold: 50 });
    state.shop.unpaidTotal = 100;
    choose(state, input, "支払う", 0);
    expect(state.player.gold).toBe(50);
    expect(state.shop.unpaidTotal).toBe(100);
    expect(state.setMode).toHaveBeenCalledWith(null);
  });

  it("宝石の売却と再購入でも同じ価格を付ける", () => {
    const state = setup();
    Object.assign(state.item, { type: "gem", basePrice: 500, originDepth: 1, _gemBuyPrice: 800 });
    choose(state, input, "はい、全て売る", 1);
    expect(state.player.gold).toBe(2500);
    expect(state.item).toMatchObject({ shopPrice: 1300, _shopCharge: 1300 });
    expect(state.shop.unpaidTotal).toBe(1300);
  });

  it("床の道具を売った後、残りがある間は選択を続けられる", () => {
    const state = setup({ mode: "sell", selection: 0 });
    // 初回表示には床道具がないため、配置後の画面を描画し直す。
    state.dungeon.items = [
      { id: "floor1", name: "床の剣", type: "weapon", sellPrice: 1000, x: 4, y: 4 },
      { id: "floor2", name: "床の盾", type: "armor", sellPrice: 1000, x: 4, y: 5 },
    ];
    state.tree = ShopModal({ mode: "sell", setMode: state.setMode, gs: state.sr.current, sr: state.sr,
      setGs: state.setGs, setMsgs: state.setMsgs, menuSel: 0, setMenuSel: state.setMenuSel, shopActionsRef: state.shopActionsRef });
    choose(state, input, "床の剣", 0);
    expect(state.player.gold).toBe(2500);
    expect(state.dungeon.items[0].shopPrice).toBe(1000);
    expect(state.dungeon.items[1].shopPrice).toBeUndefined();
    expect(state.setMode).not.toHaveBeenCalled();
    expect(state.setMenuSel.mock.calls[0][0](0)).toBe(0);
  });
});

it("クリックとキーが続けて届いても売却を重複実行しない", () => {
  const state = setup();
  choose(state, "click", "はい、全て売る", 1);
  choose(state, "keyboard", "はい、全て売る", 1);
  expect(state.player.gold).toBe(2500);
  expect(state.shop.unpaidTotal).toBe(1000);
});

it("テンキーでも矢印と同じ選択移動を行う", () => {
  const state = setup({ mode: "browse", selection: 0 });
  listeners.keydown(new KeyboardEvent("keydown", { key: "2", code: "Numpad2" }));
  expect(state.setMenuSel.mock.calls[0][0](0)).toBe(1);
});

it("キャンセル後に届いた古いボタン入力は売却しない", () => {
  const state = setup();
  listeners.keydown(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
  choose(state, "click", "はい、全て売る", 1);
  expect(state.player.gold).toBe(2000);
  expect(state.item.shopPrice).toBeUndefined();
  expect(state.setMode).toHaveBeenCalledWith("browse");
});
