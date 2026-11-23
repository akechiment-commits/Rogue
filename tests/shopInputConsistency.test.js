import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async () => ({
  ...await vi.importActual("react"),
  useCallback: fn => fn,
  useRef: value => ({ current: value }),
  useState: value => [value, vi.fn()],
  useEffect: fn => fn(),
}));
import * as React from "react";
import { MerchantModal, ShopModal } from "../GameModals.jsx";
import { useKeyHandler } from "../useKeyHandler.js";
import { useGamepad } from "../useGamepad.js";
import { BTN } from "../gamepadInput.js";
import { soundEngine } from "../soundEngine.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { applyShopUnpaidCharge, calcShopBuyPrice, gemSellPrice, itemPrice, placeItemAt, shopResaleListPrice } from "../items.js";
import { uid } from "../utils.js";

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

it.each([[false, 1], [true, 1], [false, 2], [true, 2]])("通常店で宝石を繰り返し売って買い戻しても価格が一定（床から売却: %s、買い物上手: %d）", (floorSale, count) => {
  const state = setup({ gold: 10000, rings: Array.from({ length: count }, () => ({ effect: "bargain_ring" })) });
  const { player, dungeon, shop, sr } = state;
  const gem = { id: "gem", name: "トパーズ", type: "gem", basePrice: 500, originDepth: 2, _gemBuyPrice: 500, x: 5, y: 5 };
  const renderShop = mode => ShopModal({ mode, gs: sr.current, sr, setMode: state.setMode,
    setGs: state.setGs, setMsgs: state.setMsgs, menuSel: 0, setMenuSel: state.setMenuSel });
  player.depth = 12;
  player.inventory = [gem];
  for (let sale = 0; sale < 3; sale++) {
    const startingGold = player.gold;
    if (floorSale) dungeon.items.push(player.inventory.pop());
    buttonWith(renderShop(floorSale ? "sell" : "browseConfirm"), floorSale ? "トパーズ" : "はい、全て売る").props.onClick();
    expect(player.gold).toBe(startingGold + 2250);
    expect(gem.shopPrice).toBe(4500);
    if (floorSale) {
      player.inventory.push(dungeon.items.pop());
      applyShopUnpaidCharge(gem, shop, player);
    }
    buttonWith(renderShop("buy"), "トパーズ").props.onClick();
    expect(player.gold).toBe(startingGold - (count === 2 ? 0 : 900));
    expect(shop.unpaidTotal).toBe(0);
  }
});

it.each([
  [[], 4500],
  [[{ effect: "bargain_ring" }], 3150],
  [[{ effect: "bargain_ring" }, { effect: "bargain_ring" }], 2250],
  [[{ effect: "markup_ring" }], 6750],
  [[{ effect: "markup_ring" }, { effect: "markup_ring" }], 10125],
])(
  "行商人も同じ価格で繰り返し宝石を売り直す（指輪: %j）", (rings, price) => {
    const state = setup({ rings, gold: 30000 });
    const { player, dungeon, sr } = state;
    player.depth = 12;
    player.inventory = [{ id: "gem", name: "トパーズ", type: "gem", basePrice: 500, originDepth: 2, _gemBuyPrice: 500 }];
    const merchant = { id: "merchant", isWanderingMerchant: true, state: "friendly", merchantShopId: "stock" };
    const shop = { id: "stock", stock: [] };
    dungeon.merchantShops = [shop];
    const merchantRef = { current: merchant };
    const name = item => item.name;
    const deps = { sr, merchantRef, useCallback: fn => fn, uid, trackItem: vi.fn(), itemDisplayName: name,
      calcShopBuyPrice, gemSellPrice, itemPrice, shopResaleListPrice, setGs: state.setGs, setMsgs: state.setMsgs, setMerchantMenuSel: state.setMenuSel };
    const source = readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
    const start = source.indexOf("  const doMerchantBuy =");
    const end = source.indexOf("  doOfferFoodRef.current", start);
    const { doMerchantBuy, doMerchantSell } = new Function(...Object.keys(deps),
      source.slice(start, end) + ";return { doMerchantBuy, doMerchantSell };",
    )(...Object.values(deps));
    const modal = mode => MerchantModal({ mode, gs: sr.current, merchantRef, menuSel: 0,
      setMode: state.setMode, setMenuSel: state.setMenuSel, onBuy: doMerchantBuy, onSell: doMerchantSell, dname: name });

    for (let sale = 0; sale < 3; sale++) {
      const startingGold = player.gold;
      buttonWith(modal("sell"), "1. トパーズ　2250G").props.onClick();
      expect(player.gold).toBe(startingGold + 2250);
      buttonWith(modal("buy"), `1. トパーズ　${price}G`).props.onClick();
      expect(player.gold).toBe(startingGold + 2250 - price);
      expect(shop.stock).toEqual([]);
      expect(player.inventory[0]).toMatchObject({ name: "トパーズ", originDepth: 2 });
    }
  },
);

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
      expect(state.setMode).toHaveBeenCalledWith("buy");
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
    expect(state.item).toMatchObject({ shopPrice: 1000, _shopCharge: 1000 });
    expect(state.shop.unpaidTotal).toBe(1000);
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
  expect(state.setMode).toHaveBeenCalledWith("sell");
});
