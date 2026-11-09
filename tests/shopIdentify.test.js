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
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { WANDS, POTS, getIdentKey } from "../items.js";

const textOf = node => node == null ? "" : Array.isArray(node) ? node.map(textOf).join("")
  : typeof node === "object" ? textOf(node.props?.children) : String(node);
function buttonWith(node, label) {
  if (!node) return null;
  if (Array.isArray(node)) return node.map(n => buttonWith(n, label)).find(Boolean);
  if (typeof node !== "object") return null;
  if (node.type === "button" && textOf(node).startsWith(label)) return node;
  return buttonWith(node.props?.children, label);
}

describe("店での識別サービス", () => {
  let listeners;
  beforeEach(() => {
    listeners = {};
    vi.stubGlobal("React", React);
    vi.stubGlobal("window", {
      addEventListener: (name, fn) => { listeners[name] = fn; },
      removeEventListener: vi.fn(),
      dispatchEvent: event => listeners[event.type]?.(event),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setupIdentifyTest({ mode = "identify", gold = 5000 } = {}) {
    // 2つの未識別アイテムを用意
    const wandItem = { ...WANDS[0], id: "wand_1", charges: 5 };
    const potItem = { ...POTS[0], id: "pot_1", capacity: 3, contents: [] };
    const shop = { id: "shop", unpaidTotal: 0, shopkeeperId: "sk", room: { x: 2, y: 2, w: 8, h: 8 } };
    const sk = { id: "sk", name: "店主", type: "shopkeeper", state: "friendly", x: 5, y: 6, homePos: { x: 5, y: 6 } };
    const player = makePlayer({ gold, depth: 1, inventory: [wandItem, potItem] });
    const dungeon = makeEmptyDg({ shop, shops: [shop], monsters: [sk], rooms: [] });
    const fakeNames = { [wandItem.name]: "木の杖", [potItem.name]: "青い壺" };
    const ident = new Set();
    const sr = { current: { player, dungeon, fakeNames, ident, nicknames: {} } };
    const shopActionsRef = { current: null };
    const setters = {
      setMode: vi.fn(),
      setMenuSel: vi.fn(),
      setMsgs: vi.fn(),
      setGs: vi.fn(),
    };
    return { player, dungeon, sr, shopActionsRef, setters, wandItem, potItem };
  }

  it("1回識別してもウィンドウを閉じず、連続で識別可能である", () => {
    const { player, sr, shopActionsRef, setters, wandItem, potItem } = setupIdentifyTest();

    // 初回描画（identify モード）
    let tree = ShopModal({
      ...setters,
      mode: "identify",
      gs: sr.current,
      sr,
      menuSel: 0,
      shopActionsRef,
    });

    // 1つ目の候補（wandItem）を識別
    shopActionsRef.current.confirm(0);

    // setMode(null) が呼ばれていないことを確認（ウィンドウが閉じない）
    expect(setters.setMode).not.toHaveBeenCalled();
    // wandItem が識別されていること
    expect(wandItem.fullIdent).toBe(true);
    expect(sr.current.ident.has(getIdentKey(wandItem))).toBe(true);
    // setGs が呼ばれて状態が更新されたこと
    expect(setters.setGs).toHaveBeenCalled();
    // setMenuSel が呼ばれてクランプされていること
    expect(setters.setMenuSel).toHaveBeenCalled();

    // 2回目の描画（更新後の状態）
    tree = ShopModal({
      ...setters,
      mode: "identify",
      gs: sr.current,
      sr,
      menuSel: 0,
      shopActionsRef,
    });

    // 2つ目の候補（potItem）を識別
    shopActionsRef.current.confirm(0);

    // 引き続き setMode(null) は呼ばれない
    expect(setters.setMode).not.toHaveBeenCalled();
    // potItem も識別されたこと
    expect(potItem.fullIdent).toBe(true);
    expect(sr.current.ident.has(getIdentKey(potItem))).toBe(true);

    // 3回目の描画（未識別アイテムが0個になった状態）
    tree = ShopModal({
      ...setters,
      mode: "identify",
      gs: sr.current,
      sr,
      menuSel: 0,
      shopActionsRef,
    });

    // 「戻る」ボタンが存在し、押すと戻りモードに遷移すること
    const backBtn = buttonWith(tree, "戻る");
    expect(backBtn).toBeTruthy();
    backBtn.props.onClick();
    expect(setters.setMode).toHaveBeenCalledWith("browse");
  });

  it("identifyFromSell モードでの連続識別後に戻るを押すと sell モードに戻る", () => {
    const { sr, shopActionsRef, setters } = setupIdentifyTest({ mode: "identifyFromSell" });

    // 描画（identifyFromSell モード）
    let tree = ShopModal({
      ...setters,
      mode: "identifyFromSell",
      gs: sr.current,
      sr,
      menuSel: 0,
      shopActionsRef,
    });

    // 1つ識別
    shopActionsRef.current.confirm(0);
    expect(setters.setMode).not.toHaveBeenCalled();

    // 描画し直して「戻る」を押す
    tree = ShopModal({
      ...setters,
      mode: "identifyFromSell",
      gs: sr.current,
      sr,
      menuSel: 0,
      shopActionsRef,
    });
    const backBtn = buttonWith(tree, "戻る");
    backBtn.props.onClick();
    expect(setters.setMode).toHaveBeenCalledWith("sell");
  });
});
