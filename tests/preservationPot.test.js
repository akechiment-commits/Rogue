import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => []);
vi.mock("react", async () => ({
  ...await vi.importActual("react"),
  useCallback: fn => fn,
  useRef: value => ({ current: value }),
  useEffect: fn => { effects.push(fn); },
  useLayoutEffect: fn => { effects.push(fn); },
}));
import * as React from "react";
import {
  isPreservationPot,
  canTakeFromPot,
  canShowPotTakeAction,
  potOccupancyCount,
  getIdentKey,
} from "../items.js";
import { useItemActions } from "../useItemActions.js";
import { useKeyHandler } from "../useKeyHandler.js";
import { PotPutModal, InventoryModal } from "../GameModals.jsx";
import { msgToActionKey } from "../portraits.js";
import { resetDiscoveries } from "../DiscoveryTracker.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function findElements(node, predicate, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, out);
    return out;
  }
  if (typeof node !== "object") return out;
  if (predicate(node)) out.push(node);
  return findElements(node.props?.children, predicate, out);
}

function collectText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  return collectText(node.props?.children);
}

function makeActionsHarness({ player, dungeon, ident = new Set(), fakeNames = {}, putMode = null } = {}) {
  const sr = { current: { player, dungeon, ident, fakeNames, nicknames: {} } };
  const msgs = [];
  const state = { putMode, putMenuSel: 0, putPage: 0 };
  const setMsgs = vi.fn(fnOrArr => {
    const next = typeof fnOrArr === "function" ? fnOrArr(msgs) : fnOrArr;
    msgs.splice(0, msgs.length, ...next);
  });
  const setPutMode = vi.fn(v => { state.putMode = v; });
  const setPutMenuSel = vi.fn(v => { state.putMenuSel = typeof v === "function" ? v(state.putMenuSel) : v; });
  const setPutPage = vi.fn(v => { state.putPage = typeof v === "function" ? v(state.putPage) : v; });
  const endTurn = vi.fn();
  const props = {
    sr,
    setGs: vi.fn(),
    setMsgs,
    setShowInv: vi.fn(),
    setSelIdx: vi.fn(),
    setShowDesc: vi.fn(),
    setPutMode,
    get putMode() { return state.putMode; },
    setPutMenuSel,
    setPutPage,
    setWishMode: vi.fn(),
    lu: vi.fn(),
    endTurn,
    dnameRef: item => {
      const k = getIdentKey(item);
      if (k && !sr.current.ident.has(k) && sr.current.fakeNames?.[k]) return sr.current.fakeNames[k];
      return item.name;
    },
  };
  return {
    sr,
    msgs,
    state,
    endTurn,
    setPutMode,
    setPutMenuSel,
    setPutPage,
    props,
    get actions() { return useItemActions(props); },
  };
}

beforeEach(() => {
  resetDiscoveries();
  effects.length = 0;
  vi.stubGlobal("React", React);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("保存の壺の純粋ルール", () => {
  it("保存の壺だけが出し入れ可能で、他の壺・未払い壺・とじこめの壺からは取り出せない", () => {
    const sword = { id: "sword", name: "鉄の剣", type: "weapon", atk: 5 };
    const preserve = { id: "p1", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [sword] };
    const emptyPreserve = { id: "p2", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [] };
    const greed = { id: "p3", name: "強欲な壺", type: "pot", potEffect: "greed", capacity: 4, contents: [sword] };
    const imprison = { id: "p4", name: "とじこめの壺", type: "pot", potEffect: "imprison", capacity: 3, contents: [sword] };
    const shopPreserve = { ...preserve, id: "p5", shopPrice: 1500 };

    expect(isPreservationPot(preserve)).toBe(true);
    expect(isPreservationPot(greed)).toBe(false);
    expect(canTakeFromPot(preserve)).toBe(true);
    expect(canTakeFromPot(emptyPreserve)).toBe(false);
    expect(canTakeFromPot(greed)).toBe(false);
    expect(canTakeFromPot(imprison)).toBe(false);
    expect(canTakeFromPot(shopPreserve)).toBe(false);
  });

  it("未識別・識別済みを問わず、中身が入った保存の壺だけに「出す」候補を表示し、他の壺には表示しない", () => {
    const herb = { id: "herb", name: "回復薬", type: "potion", effect: "heal" };
    const preserve = { id: "p1", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [herb] };
    const enhance = { id: "p2", name: "強化の壺", type: "pot", potEffect: "enhance", capacity: 2, contents: [herb] };
    const greed = { id: "p3", name: "強欲な壺", type: "pot", potEffect: "greed", capacity: 4, contents: [herb] };
    const emptyPreserve = { id: "p4", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [] };

    const unknownIdent = new Set();
    expect(canShowPotTakeAction(preserve, unknownIdent, false)).toBe(true);
    expect(canShowPotTakeAction(enhance, unknownIdent, false)).toBe(false);
    expect(canShowPotTakeAction(greed, unknownIdent, false)).toBe(false);
    expect(canShowPotTakeAction(emptyPreserve, unknownIdent, false)).toBe(false);

    const knownIdent = new Set(["o:none", "o:enhance", "o:greed"]);
    expect(canShowPotTakeAction(preserve, knownIdent, false)).toBe(true);
    expect(canShowPotTakeAction(enhance, knownIdent, false)).toBe(false);
    expect(canShowPotTakeAction(enhance, new Set(), true)).toBe(false);
  });
});

describe("保存の壺の出し入れアクション", () => {
  it("所持品の保存の壺へ出し入れでき、空き容量の増減・ターン経過・モーダル維持/終了が正しく動く", () => {
    const herb = { id: "herb", name: "回復薬", type: "potion", effect: "heal" };
    const scroll = { id: "scroll", name: "あかりの巻物", type: "scroll", effect: "light" };
    const pot = { id: "pot", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [herb] };
    const player = makePlayer({ hp: 50, inventory: [pot, scroll] });
    const dungeon = makeEmptyDg();
    const h = makeActionsHarness({ player, dungeon, ident: new Set(["o:none"]) });

    h.state.putMode = { potIdx: 0 };
    h.actions.doPutItem(1);
    expect(player.inventory).toEqual([pot]);
    expect(pot.contents).toEqual([herb, scroll]);
    expect(potOccupancyCount(pot)).toBe(2);
    expect(h.endTurn).toHaveBeenCalledTimes(1);

    h.actions.doOpenTakePot({ potIdx: 0 });
    expect(h.state.putMode).toEqual({ action: "take", potIdx: 0 });
    expect(potOccupancyCount(pot)).toBe(2);

    h.actions.doTakeFromPot(0);
    expect(player.inventory).toEqual([pot, herb]);
    expect(pot.contents).toEqual([scroll]);
    expect(potOccupancyCount(pot)).toBe(1);
    expect(h.endTurn).toHaveBeenCalledTimes(2);
    expect(h.state.putMode).toEqual({ action: "take", potIdx: 0 });
    expect(h.msgs.some(m => m.includes("保存の壺から回復薬を取り出した。"))).toBe(true);

    h.actions.doTakeFromPot(0);
    expect(player.inventory).toEqual([pot, herb, scroll]);
    expect(pot.contents).toEqual([]);
    expect(potOccupancyCount(pot)).toBe(0);
    expect(h.endTurn).toHaveBeenCalledTimes(3);
    expect(h.state.putMode).toBeNull();
  });

  it("未識別の保存の壺から「出す」を実行すると保存の壺と識別され、他の壺では取り出せず識別されない", () => {
    const ring = { id: "ring", name: "力の指輪", type: "ring", effect: "power_ring" };
    const preserve = { id: "p1", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [ring] };
    const greed = { id: "p2", name: "強欲な壺", type: "pot", potEffect: "greed", capacity: 4, contents: [ring] };
    const player = makePlayer({ hp: 50, inventory: [preserve, greed] });
    const h = makeActionsHarness({
      player,
      dungeon: makeEmptyDg(),
      ident: new Set(),
      fakeNames: { "o:none": "縞模様の壺", "o:greed": "赤い壺" },
    });

    h.actions.doOpenTakePot({ potIdx: 1 });
    expect(h.sr.current.ident.has("o:greed")).toBe(false);
    expect(h.state.putMode).toBeNull();
    expect(h.endTurn).not.toHaveBeenCalled();
    expect(h.msgs.some(m => m.includes("赤い壺からは中身を取り出せない！"))).toBe(true);

    h.actions.doOpenTakePot({ potIdx: 0 });
    expect(h.sr.current.ident.has("o:none")).toBe(true);
    expect(h.state.putMode).toEqual({ action: "take", potIdx: 0 });
    expect(h.msgs.some(m => m.includes("縞模様の壺は保存の壺だった！"))).toBe(true);
  });

  it("持ち物が満杯、未払い、足元の壺移動時は安全に取り出しを拒否する", () => {
    const filler = Array.from({ length: 30 }, (_, i) => ({ id: `f-${i}`, name: `石${i}`, type: "food", value: 5 }));
    const arrow = { id: "a1", name: "木の矢", type: "arrow", count: 5 };
    const pot = { id: "pot", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [arrow], x: 5, y: 5 };
    const player = makePlayer({ hp: 50, x: 5, y: 5, maxInventory: 30, inventory: filler });
    const dungeon = makeEmptyDg({ items: [pot] });
    const h = makeActionsHarness({ player, dungeon, ident: new Set(["o:none"]), putMode: { action: "take", floorPot: pot } });

    h.actions.doTakeFromPot(0);
    expect(pot.contents).toEqual([arrow]);
    expect(h.endTurn).not.toHaveBeenCalled();
    expect(h.msgs.some(m => m.includes("持ち物がいっぱいで取り出せない！"))).toBe(true);

    player.inventory.pop();
    h.actions.doTakeFromPot(0);
    expect(player.inventory).toContain(arrow);
    expect(pot.contents).toEqual([]);
    expect(h.endTurn).toHaveBeenCalledTimes(1);

    pot.contents = [{ id: "extra", name: "パン", type: "food", value: 20 }];
    pot.x = 6;
    h.state.putMode = { action: "take", floorPot: pot };
    h.actions.doTakeFromPot(0);
    expect(pot.contents).toHaveLength(1);
    expect(h.state.putMode).toBeNull();
    expect(h.endTurn).toHaveBeenCalledTimes(1);
  });
});

describe("保存の壺のUI・キーボード（テンキー含む）・立ち絵", () => {
  it("InventoryModal は未識別でも保存の壺（中身あり）にだけ「出す」を表示し、他の壺には表示しない", () => {
    const herb = { id: "herb", name: "回復薬", type: "potion", effect: "heal" };
    const preserve = { id: "p1", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [herb] };
    const greed = { id: "p2", name: "強欲な壺", type: "pot", potEffect: "greed", capacity: 4, contents: [herb] };
    const player = makePlayer({ inventory: [preserve, greed] });
    const gs = { player, dungeon: makeEmptyDg(), ident: new Set(), fakeNames: { "o:none": "縞模様の壺", "o:greed": "赤い壺" }, nicknames: {} };
    const doOpenTakePot = vi.fn();

    const treePreserve = InventoryModal({
      show: true, p: player, gs, mobile: false, dropMode: false, dropModeRef: { current: false },
      invPage: 0, selIdx: 0, showDesc: null, invMenuSel: 0,
      setShowInv: vi.fn(), setDropMode: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn(),
      setInvPage: vi.fn(), setInvMenuSel: vi.fn(), setNicknameMode: vi.fn(), setNicknameInput: vi.fn(),
      sortInventory: vi.fn(), canUse: () => true, useLabel: () => "入れる", iLabel: it => it.name,
      doUseItem: vi.fn(), doReadSpellbook: vi.fn(), doShoot: vi.fn(), doWaveWand: vi.fn(), doBreakWand: vi.fn(),
      doUseMarker: vi.fn(), doOpenTakePot, doBreakPot: vi.fn(), doDropItem: vi.fn(), doSwapItem: vi.fn(), doThrow: vi.fn(),
      containerRef: { current: null },
    });
    const takeButtons = findElements(treePreserve, n => n.type === "button" && collectText(n) === "出す");
    expect(takeButtons).toHaveLength(1);
    takeButtons[0].props.onClick();
    expect(doOpenTakePot).toHaveBeenCalledWith({ potIdx: 0 });

    const treeGreed = InventoryModal({
      show: true, p: player, gs, mobile: false, dropMode: false, dropModeRef: { current: false },
      invPage: 0, selIdx: 1, showDesc: null, invMenuSel: 0,
      setShowInv: vi.fn(), setDropMode: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn(),
      setInvPage: vi.fn(), setInvMenuSel: vi.fn(), setNicknameMode: vi.fn(), setNicknameInput: vi.fn(),
      sortInventory: vi.fn(), canUse: () => true, useLabel: () => "入れる", iLabel: it => it.name,
      doUseItem: vi.fn(), doReadSpellbook: vi.fn(), doShoot: vi.fn(), doWaveWand: vi.fn(), doBreakWand: vi.fn(),
      doUseMarker: vi.fn(), doOpenTakePot, doBreakPot: vi.fn(), doDropItem: vi.fn(), doSwapItem: vi.fn(), doThrow: vi.fn(),
      containerRef: { current: null },
    });
    expect(findElements(treeGreed, n => n.type === "button" && collectText(n) === "出す")).toHaveLength(0);
  });

  it("PotPutModal の取り出しモードで一覧表示・切替・クリック取り出しができる", () => {
    const items = [
      { id: "i0", name: "おにぎり", type: "food", value: 30 },
      { id: "i1", name: "回復薬", type: "potion", effect: "heal" },
    ];
    const pot = { id: "p1", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: items };
    const player = makePlayer({ inventory: [pot] });
    const gs = { player, dungeon: makeEmptyDg(), ident: new Set(["o:none"]), fakeNames: {}, nicknames: {} };
    const doTakeFromPot = vi.fn();
    const setMode = vi.fn();

    const tree = PotPutModal({
      mode: { action: "take", potIdx: 0 },
      setMode,
      p: player,
      gs,
      putPage: 0,
      putMenuSel: 0,
      setPutPage: vi.fn(),
      setPutMenuSel: vi.fn(),
      doPutItem: vi.fn(),
      doPutFloorItem: vi.fn(),
      doTakeFromPot,
      onCancel: vi.fn(),
      iLabel: it => it.name,
      dname: it => it.name,
      mobile: false,
    });
    expect(collectText(tree)).toContain("取り出すアイテムを選んでください");
    const rows = findElements(tree, n => n.type === "div" && typeof n.key === "string" && n.key.startsWith("take-"));
    expect(rows).toHaveLength(2);
    rows[1].props.onClick();
    expect(doTakeFromPot).toHaveBeenCalledWith(1);

    const switchBtn = findElements(tree, n => n.type === "button" && collectText(n) === "入れる");
    expect(switchBtn).toHaveLength(1);
    switchBtn[0].props.onClick();
    expect(setMode).toHaveBeenCalledWith({ potIdx: 0 });

    const putModeTree = PotPutModal({
      mode: { potIdx: 0 },
      setMode,
      p: player,
      gs,
      putPage: 0,
      putMenuSel: 0,
      setPutPage: vi.fn(),
      setPutMenuSel: vi.fn(),
      doPutItem: vi.fn(),
      doPutFloorItem: vi.fn(),
      doTakeFromPot,
      onCancel: vi.fn(),
      iLabel: it => it.name,
      dname: it => it.name,
      mobile: false,
    });
    const toTakeBtn = findElements(putModeTree, n => n.type === "button" && collectText(n) === "出す");
    expect(toTakeBtn).toHaveLength(1);
    toTakeBtn[0].props.onClick();
    expect(setMode).toHaveBeenLastCalledWith({ potIdx: 0, action: "take" });
  });

  it("useKeyHandler の取り出しモードで矢印・テンキー移動と決定が動く", () => {
    effects.length = 0;
    const items = Array.from({ length: 12 }, (_, idx) => ({ id: `i-${idx}`, name: `品${idx}`, type: "food", value: 10 }));
    const pot = { id: "p1", name: "保存の壺", type: "pot", potEffect: "none", capacity: 12, contents: items };
    const player = makePlayer({ inventory: [pot] });
    const sr = { current: { player, dungeon: makeEmptyDg(), ident: new Set(["o:none"]), fakeNames: {}, nicknames: {} } };
    const listeners = {};
    vi.stubGlobal("window", {
      addEventListener: (name, fn) => { listeners[name] = fn; },
      removeEventListener: () => {},
    });
    vi.stubGlobal("KeyboardEvent", class {
      constructor(type, args) { Object.assign(this, { type }, args); }
      preventDefault() {}
    });
    let putMenuSel = 0;
    let putPage = 0;
    const setPutMenuSel = vi.fn(v => { putMenuSel = typeof v === "function" ? v(putMenuSel) : v; });
    const setPutPage = vi.fn(v => { putPage = typeof v === "function" ? v(putPage) : v; });
    const takeFromPot = vi.fn();

    useKeyHandler({
      sr,
      gs: sr.current,
      putMode: { action: "take", potIdx: 0 },
      putMenuSel,
      putPage,
      setPutMenuSel,
      setPutPage,
      invActRef: { current: { takeFromPot, cancelPut: vi.fn() } },
      shiftRef: { current: false },
      aRef: { current: false },
      arrowHeldRef: { current: {} },
      execRef: { current: null },
      setMsgs: vi.fn(),
    });
    effects.splice(0).forEach(fn => fn());

    listeners.keydown(new KeyboardEvent("keydown", { key: "2", code: "Numpad2", location: 3 }));
    expect(putMenuSel).toBe(1);

    listeners.keydown(new KeyboardEvent("keydown", { key: "6", code: "Numpad6", location: 3 }));
    expect(putPage).toBe(1);
    expect(putMenuSel).toBe(0);

    listeners.keydown(new KeyboardEvent("keydown", { key: "z", code: "KeyZ" }));
    expect(takeFromPot).toHaveBeenCalledWith(0);
  });

  it("msgToActionKey が保存の壺から取り出すログを act_pot として認識する", () => {
    expect(msgToActionKey("保存の壺から回復薬を取り出した。")).toBe("act_pot");
  });
});
