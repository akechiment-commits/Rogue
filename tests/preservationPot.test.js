import { readFileSync } from "node:fs";
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
import { isPreservationPot, canTakeFromPot, canShowPotTakeAction, potOccupancyCount, getIdentKey, randPotCapacity } from "../items.js";
import { getPotItemActions, stagePotItemToInventory, restorePotReturnItem } from "../potActionRules.js";
import { canUseInventoryItem, getInventoryUseLabel } from "../inventoryRules.js";
import { useItemActions } from "../useItemActions.js";
import { useKeyHandler } from "../useKeyHandler.js";
import { PotPutModal, InventoryModal } from "../GameModals.jsx";
import { msgToActionKey } from "../portraits.js";
import { resetDiscoveries } from "../DiscoveryTracker.js";
import { saveGameState, loadGameState } from "../GameSave.js";
import { MH, MW } from "../utils.js";
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

  it("保存の壺の初期容量 randPotCapacity('none') は 4〜6 を返す", () => {
    const seen = new Set();
    for (let i = 0; i < 120; i++) {
      const cap = randPotCapacity("none");
      expect(cap).toBeGreaterThanOrEqual(4);
      expect(cap).toBeLessThanOrEqual(6);
      seen.add(cap);
    }
    expect(seen).toEqual(new Set([4, 5, 6]));
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

  it("PotPutModal の取り出しモードでアイテム選択→サブメニュー展開→行動実行・説明表示・切替ができる", () => {
    const items = [
      { id: "i0", name: "おにぎり", type: "food", value: 30, desc: "満腹度が回復する" },
      { id: "i1", name: "鉄の矢", type: "arrow", count: 5, atk: 4, desc: "まっすぐ飛ぶ矢" },
      { id: "i2", name: "カタナ", type: "weapon", atk: 8, desc: "よく切れる刀" },
    ];
    const pot = { id: "p1", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: items };
    const player = makePlayer({ inventory: [pot] });
    const gs = { player, dungeon: makeEmptyDg(), ident: new Set(["o:none"]), fakeNames: {}, nicknames: {} };
    const execPotAction = vi.fn();
    const setMode = vi.fn();

    const baseProps = {
      setMode,
      p: player,
      gs,
      putPage: 0,
      putMenuSel: 0,
      setPutPage: vi.fn(),
      setPutMenuSel: vi.fn(),
      doPutItem: vi.fn(),
      doPutFloorItem: vi.fn(),
      doTakeFromPot: vi.fn(),
      execPotAction,
      canUse: canUseInventoryItem,
      useLabel: (it) => getInventoryUseLabel(it, player),
      onCancel: vi.fn(),
      iLabel: it => it.name,
      dname: it => it.name,
      mobile: false,
    };

    const tree = PotPutModal({ ...baseProps, mode: { action: "take", potIdx: 0 } });
    expect(collectText(tree)).toContain("中のアイテムを選んでください");
    const rowBoxes = findElements(tree, n => n.type === "div" && typeof n.props?.onClick === "function");
    expect(rowBoxes).toHaveLength(3);
    rowBoxes[1].props.onClick();
    expect(setMode).toHaveBeenCalledWith({ action: "take", potIdx: 0, selectedIdx: 1, actSel: 0 });

    const expandedArrowTree = PotPutModal({
      ...baseProps,
      putMenuSel: 1,
      mode: { action: "take", potIdx: 0, selectedIdx: 1, actSel: 0 },
    });
    const arrowBtnLabels = findElements(expandedArrowTree, n => n.type === "button" && !["入れる", "✕", "やめる"].includes(collectText(n)))
      .map(collectText);
    expect(arrowBtnLabels).toEqual(["射る", "出す", "置く", "投げる(束)", "説明"]);
    expect(arrowBtnLabels).not.toContain("装備");

    const shootBtn = findElements(expandedArrowTree, n => n.type === "button" && collectText(n) === "射る")[0];
    shootBtn.props.onClick();
    expect(execPotAction).toHaveBeenCalledWith(1, "shoot");

    const bundleThrowBtn = findElements(expandedArrowTree, n => n.type === "button" && collectText(n) === "投げる(束)")[0];
    bundleThrowBtn.props.onClick();
    expect(execPotAction).toHaveBeenCalledWith(1, "throw");

    const descTree = PotPutModal({
      ...baseProps,
      mode: { action: "take", potIdx: 0, descIdx: 0 },
    });
    expect(collectText(descTree)).toContain("満腹度が回復する");

    const switchBtn = findElements(tree, n => n.type === "button" && collectText(n) === "入れる");
    expect(switchBtn).toHaveLength(1);
    switchBtn[0].props.onClick();
    expect(setMode).toHaveBeenCalledWith({ potIdx: 0 });

    const putModeTree = PotPutModal({
      ...baseProps,
      mode: { potIdx: 0 },
    });
    const toTakeBtn = findElements(putModeTree, n => n.type === "button" && collectText(n) === "出す");
    expect(toTakeBtn).toHaveLength(1);
    toTakeBtn[0].props.onClick();
    expect(setMode).toHaveBeenLastCalledWith({ potIdx: 0, action: "take" });
  });

  it("useKeyHandler の取り出しモードで矢印・テンキー移動、サブメニュー開閉、キャンセル戻りが動く", () => {
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
    let putMode = { action: "take", potIdx: 0 };
    let putMenuSel = 0;
    let putPage = 0;
    const setPutMode = vi.fn(v => { putMode = v; });
    const setPutMenuSel = vi.fn(v => { putMenuSel = typeof v === "function" ? v(putMenuSel) : v; });
    const setPutPage = vi.fn(v => { putPage = typeof v === "function" ? v(putPage) : v; });
    const execPotAction = vi.fn();
    const cancelPut = vi.fn();

    const mountKeys = () => {
      effects.length = 0;
      useKeyHandler({
        sr,
        gs: sr.current,
        putMode,
        putMenuSel,
        putPage,
        setPutMode,
        setPutMenuSel,
        setPutPage,
        invActRef: { current: { execPotAction, cancelPut } },
        shiftRef: { current: false },
        aRef: { current: false },
        arrowHeldRef: { current: {} },
        execRef: { current: null },
        setMsgs: vi.fn(),
      });
      effects.splice(0).forEach(fn => fn());
    };

    mountKeys();
    listeners.keydown(new KeyboardEvent("keydown", { key: "2", code: "Numpad2", location: 3 }));
    expect(putMenuSel).toBe(1);

    mountKeys();
    listeners.keydown(new KeyboardEvent("keydown", { key: "6", code: "Numpad6", location: 3 }));
    expect(putPage).toBe(1);
    expect(putMenuSel).toBe(0);

    mountKeys();
    listeners.keydown(new KeyboardEvent("keydown", { key: "z", code: "KeyZ" }));
    expect(putMode).toEqual({ action: "take", potIdx: 0, selectedIdx: 10, actSel: 0 });
    expect(execPotAction).not.toHaveBeenCalled();

    /* サブメニュー展開中：Numpad6 / ArrowRight で「食べる」→「出す」へ移動して Z で決定 */
    mountKeys();
    listeners.keydown(new KeyboardEvent("keydown", { key: "6", code: "Numpad6", location: 3 }));
    expect(putMode.actSel).toBe(1);

    mountKeys();
    listeners.keydown(new KeyboardEvent("keydown", { key: "z", code: "KeyZ" }));
    expect(execPotAction).toHaveBeenCalledWith(10, "take");

    /* サブメニュー展開中に X で一覧に戻る（壺モーダル自体は閉じない） */
    mountKeys();
    listeners.keydown(new KeyboardEvent("keydown", { key: "x", code: "KeyX" }));
    expect(putMode).toEqual({ action: "take", potIdx: 0, selectedIdx: null, actSel: 0 });
    expect(cancelPut).not.toHaveBeenCalled();

    /* 一覧状態でもう一度 X を押すと壺モーダルを閉じる */
    mountKeys();
    listeners.keydown(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
    expect(cancelPut).toHaveBeenCalledTimes(1);
  });

  it("msgToActionKey が保存の壺から取り出すログを act_pot として認識する", () => {
    expect(msgToActionKey("保存の壺から回復薬を取り出した。")).toBe("act_pot");
  });
});

describe("保存の壺の中身コマンド規則と一時退避・復元", () => {
  it.each([
    { onFloor: false, result: "cancel", charges: 3 },
    { onFloor: true, result: "wave", charges: 2 },
    { onFloor: false, result: "consume", charges: null },
  ])("保存の壺の仮移動を保存せず、操作後の結果は保存する ($result)", async ({ onFloor, result, charges }) => {
    const storage = new Map();
    vi.stubGlobal("localStorage", { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value) });
    const wand = { id: "wand", type: "wand", name: "杖", charges: 3 };
    const pot = { id: "pot", type: "pot", potEffect: "none", capacity: 4, x: 5, y: 5, contents: [wand] };
    const player = makePlayer({ inventory: onFloor ? [] : [pot] });
    const visibility = () => Array.from({ length: MH }, () => Array(MW).fill(false));
    const dungeon = makeEmptyDg({ items: onFloor ? [pot] : [], visible: visibility(), explored: visibility() });
    const sr = { current: { player, dungeon, floorTurns: 0 } };
    const potReturnRef = { current: null };
    const source = readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
    const start = source.indexOf("  useEffect(() => {", source.indexOf("/* ── 自動セーブ:"));
    const end = source.indexOf("\n  useEffect(", start + 1);
    const save = vi.fn(saveGameState);
    const deps = { sr, gs: sr.current, dead: false, showEnding: false, saveStoppedRef: { current: false },
      modalTypeRef: { current: null }, identifyCancelRef: { current: null }, floorThrowReturnRef: { current: null },
      potReturnRef, runTimerRef: { current: null }, msgsRef: { current: [] }, dungeonConfig: null,
      getDiscoveries: () => null, saveFailedRef: { current: false }, setMsgs: vi.fn(),
      useEffect: effect => effect(), saveGameState: save };
    const autosave = new Function(...Object.keys(deps), source.slice(start, end));
    const runAutosave = () => autosave(...Object.values(deps));
    const readPot = state => (onFloor ? state.dungeon.items : state.player.inventory)[0];

    runAutosave();
    expect(await save.mock.results[0].value).toBe(true);
    potReturnRef.current = stagePotItemToInventory(player, pot, 0);
    expect(player.inventory).toContain(wand);
    runAutosave();
    expect(save).toHaveBeenCalledOnce();
    const resumed = await loadGameState();
    expect(resumed.player.inventory.map(item => item.id)).not.toContain(wand.id);
    expect(readPot(resumed).contents).toMatchObject([{ id: wand.id, charges: 3 }]);

    if (result === "consume") player.inventory.pop();
    else {
      if (result === "wave") wand.charges--;
      runAutosave();
      expect(save).toHaveBeenCalledOnce();
      expect(restorePotReturnItem({ player, dungeon, entry: potReturnRef.current }).returned).toBe(true);
      potReturnRef.current = null;
    }
    sr.current.floorTurns = result === "cancel" ? 0 : 1;
    runAutosave();
    expect(save).toHaveBeenCalledTimes(2);
    expect(await save.mock.results[1].value).toBe(true);
    const saved = await loadGameState();
    expect(saved.floorTurns).toBe(sr.current.floorTurns);
    expect(saved.player.inventory.map(item => item.id)).not.toContain(wand.id);
    expect(readPot(saved).contents).toMatchObject(charges === null ? [] : [{ id: wand.id, charges }]);
  });

  it("武器・防具・指輪・矢・壺の直接装備/入れ子は禁止し、矢束は射ると投げる(束)の両方を持つ", () => {
    const sword = { id: "w1", name: "鉄の剣", type: "weapon", atk: 5 };
    const armor = { id: "a1", name: "皮の盾", type: "armor", def: 4 };
    const ring = { id: "r1", name: "謎の指輪", type: "ring", effect: "power_ring" };
    const arrow = { id: "ar1", name: "鉄の矢", type: "arrow", count: 8, atk: 5 };
    const wand = { id: "wa1", name: "吹き飛ばしの杖", type: "wand", effect: "knockback", charges: 4 };
    const marker = { id: "m1", name: "マジックマーカー", type: "marker", charges: 3 };
    const herb = { id: "p1", name: "回復薬", type: "potion", effect: "heal" };
    const book = { id: "b1", name: "火球の魔法書", type: "spellbook", spell: "fireball" };

    expect(getPotItemActions(sword).map(a => a.id)).toEqual(["take", "drop", "throw", "desc"]);
    expect(getPotItemActions(armor).map(a => a.id)).toEqual(["take", "drop", "throw", "desc"]);
    expect(getPotItemActions(ring, { ident: new Set() }).map(a => a.id)).toEqual(["take", "drop", "throw", "desc", "nickname"]);
    expect(getPotItemActions(ring, { ident: new Set(["r:power_ring"]) }).map(a => a.id)).toEqual(["take", "drop", "throw", "desc"]);

    const arrowActs = getPotItemActions(arrow);
    expect(arrowActs.map(a => [a.id, a.label])).toEqual([
      ["shoot", "射る"],
      ["take", "出す"],
      ["drop", "置く"],
      ["throw", "投げる(束)"],
      ["desc", "説明"],
    ]);

    expect(getPotItemActions(wand).map(a => [a.id, a.label])).toEqual([
      ["wave", "振る"],
      ["breakWand", "壊す"],
      ["take", "出す"],
      ["drop", "置く"],
      ["throw", "投げる"],
      ["desc", "説明"],
    ]);
    expect(getPotItemActions(marker).map(a => a.id)).toEqual(["marker", "take", "drop", "throw", "desc"]);
    expect(getPotItemActions(herb).map(a => a.id)).toEqual(["use", "take", "drop", "throw", "desc"]);
    expect(getPotItemActions(book).map(a => a.id)).toEqual(["readSpellbook", "take", "drop", "throw", "desc"]);
  });

  it("持ち物30個満杯状態からでも壺の中身を直接使え、残数・不発・キャンセル時は元の保存の壺へ戻る", () => {
    const filler = Array.from({ length: 29 }, (_, i) => ({ id: `f-${i}`, name: `石${i}`, type: "food", value: 5 }));
    const arrow = { id: "a1", name: "鉄の矢", type: "arrow", count: 5, atk: 5 };
    const wand = { id: "w1", name: "火炎の杖", type: "wand", effect: "flame", charges: 3 };
    const pot = { id: "pot", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [arrow, wand] };
    const player = makePlayer({ hp: 50, maxInventory: 30, inventory: [pot, ...filler] });
    const dungeon = makeEmptyDg();
    expect(player.inventory).toHaveLength(30);

    /* 1. 矢束を取り出してから1本射った残り(count:4)が元の位置に戻る */
    const stagedArrow = stagePotItemToInventory(player, pot, 0);
    expect(stagedArrow.tmpIdx).toBe(30);
    expect(pot.contents).toEqual([wand]);
    arrow.count -= 1;
    const arrowRestore = restorePotReturnItem({ player, dungeon, entry: stagedArrow });
    expect(arrowRestore).toEqual({ returned: true, destination: "pot" });
    expect(player.inventory).toHaveLength(30);
    expect(pot.contents).toEqual([arrow, wand]);
    expect(pot.contents[0].count).toBe(4);

    /* 2. 消費されたアイテム（投擲・飲用など）は二重に戻されない */
    const stagedWand = stagePotItemToInventory(player, pot, 1);
    player.inventory.splice(stagedWand.tmpIdx, 1);
    expect(restorePotReturnItem({ player, dungeon, entry: stagedWand })).toEqual({
      returned: false,
      reason: "already_removed",
    });
    expect(pot.contents).toEqual([arrow]);

    /* 3. ターン経過等で壺が消滅していた場合でもアイテムは足元に落ちて消失しない */
    pot.contents.push(wand);
    const floorPot = { id: "fp", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [wand], x: 5, y: 5 };
    player.x = 7;
    player.y = 8;
    const stagedFloorWand = stagePotItemToInventory(player, floorPot, 0);
    const msgs = [];
    const fallbackRes = restorePotReturnItem({
      player,
      dungeon,
      entry: stagedFloorWand,
      msgs,
      dnameFn: it => it.name,
    });
    expect(fallbackRes).toEqual({ returned: true, destination: "floor" });
    expect(dungeon.items).toContain(wand);
    expect(wand.x).toBe(7);
    expect(wand.y).toBe(8);
    expect(msgs.some(m => m.includes("足元に落ちた"))).toBe(true);
  });

  it("useItemActions 経由で保存の壺内の矢を「射る」と1本だけ消費して残りが壺に戻り、「投げる(束)」は束ごと消費される", () => {
    const arrow = { id: "a1", name: "鉄の矢", type: "arrow", count: 5, atk: 5 };
    const pot = { id: "pot", name: "保存の壺", type: "pot", potEffect: "none", capacity: 6, contents: [arrow] };
    const player = makePlayer({ hp: 50, x: 5, y: 5, inventory: [pot] });
    const dungeon = makeEmptyDg();
    const sr = { current: { player, dungeon, ident: new Set(["o:none"]), fakeNames: {}, nicknames: {} } };
    let throwModeState = null;
    const h = {
      sr,
      setGs: vi.fn(),
      setMsgs: vi.fn(),
      setShowInv: vi.fn(),
      setSelIdx: vi.fn(),
      setShowDesc: vi.fn(),
      setPutMode: vi.fn(),
      putMode: null,
      setPutMenuSel: vi.fn(),
      setPutPage: vi.fn(),
      setThrowMode: vi.fn(v => { throwModeState = v; }),
      throwMode: throwModeState,
      setWishMode: vi.fn(),
      lu: vi.fn(),
      endTurn: vi.fn(),
      withPitfallBag: fn => fn(),
      bigboxAddItem: vi.fn(),
      setIdentifyMode: vi.fn(),
      dnameRef: it => it.name,
    };

    const actions = useItemActions(h);
    const stagedShoot = stagePotItemToInventory(player, pot, 0);
    actions.doShoot(stagedShoot.tmpIdx);
    expect(throwModeState).toEqual({ idx: stagedShoot.tmpIdx, mode: "shoot" });

    useItemActions({ ...h, throwMode: throwModeState }).execDirection(1, 0);
    expect(arrow.count).toBe(4);
    expect(restorePotReturnItem({ player, dungeon, entry: stagedShoot })).toEqual({
      returned: true,
      destination: "pot",
    });
    expect(pot.contents).toEqual([arrow]);
    expect(pot.contents[0].count).toBe(4);
    expect(player.inventory).toEqual([pot]);

    const stagedThrow = stagePotItemToInventory(player, pot, 0);
    useItemActions({ ...h, throwMode: throwModeState }).doThrow(stagedThrow.tmpIdx);
    expect(throwModeState).toEqual({ idx: stagedThrow.tmpIdx, mode: "throw", bundle: true });
    useItemActions({ ...h, throwMode: throwModeState }).execDirection(1, 0);
    expect(restorePotReturnItem({ player, dungeon, entry: stagedThrow })).toEqual({
      returned: false,
      reason: "already_removed",
    });
    expect(pot.contents).toEqual([]);
    expect(player.inventory).toEqual([pot]);
  });
});
