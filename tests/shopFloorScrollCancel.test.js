import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => []);
vi.mock("react", () => ({ useCallback: fn => fn, useRef: current => ({ current }), useEffect: fn => effects.push(fn) }));
import { useItemActions } from "../useItemActions.js";
import { useKeyHandler } from "../useKeyHandler.js";
import { applyShopUnpaidCharge, checkShopTheft, shopPriceNote } from "../items.js";
import { itemDisplayName } from "../render.js";
import { hasForcedTurn } from "../turnUpkeep.js";
import { getShops, clearDimensionalVaultItemCounter, MH, MW } from "../utils.js";
import { soundEngine } from "../soundEngine.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { saveGameState, loadGameState } from "../GameSave.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function floorActionFixture({ debt = 0, precharged = false, bargain = false, effect = "identify", floorItem, inventory, maxInventory } = {}) {
  const room = { x: 4, y: 4, w: 3, h: 3 };
  const shop = { id: "shop", shopkeeperId: "keeper", room, unpaidTotal: debt };
  const keeper = { id: "keeper", type: "shopkeeper", state: debt ? "blocking" : "friendly", hp: 100, x: 6, y: 4 };
  const scroll = { id: "scroll", name: "巻物", type: "scroll", effect, x: 5, y: 5,
    shopPrice: 250, _shopId: shop.id, ...(precharged ? { _shopCharge: debt } : {}), ...floorItem };
  const gear = { id: "gear", name: "短剣", type: "weapon", atk: 4 };
  const visibility = () => Array.from({ length: MH }, () => Array(MW).fill(false));
  const dungeon = makeEmptyDg({ shop, rooms: [room], items: [scroll], monsters: [keeper],
    visible: visibility(), explored: visibility() });
  const player = makePlayer({ x: 5, y: 5, inventory: inventory || [gear], maxInventory, gold: 1000,
    rings: bargain ? [{ type: "ring", effect: "bargain_ring" }] : [] });
  const sr = { current: { player, dungeon, ident: new Set(["s:identify"]), fakeNames: {} } };
  let dialog = null;
  const noop = () => {};
  const identifyCancelRef = { current: null };
  const modalTypeRef = { current: null }, throwModeRef = { current: null }, floorThrowReturnRef = { current: null };
  const source = readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const stateStart = source.indexOf("  const setIdentifyMode =");
  const stateEnd = source.indexOf("  const setNicknameMode", stateStart);
  const throwStart = source.indexOf("  const setThrowMode =");
  const throwEnd = source.indexOf("  /* ── modal state", throwStart);
  const dispatchModal = action => {
    modalTypeRef.current = action.modal ?? null;
    dialog = action.data ?? null;
  };
  const { setIdentifyMode, setThrowMode } = new Function("identifyCancelRef", "modalTypeRef", "dispatchModal",
    "throwModeRef", "floorThrowReturnRef", "_setThrowMode",
    `${source.slice(stateStart, stateEnd)}\n${source.slice(throwStart, throwEnd)}\nreturn { setIdentifyMode, setThrowMode };`,
  )(identifyCancelRef, modalTypeRef, dispatchModal, throwModeRef, floorThrowReturnRef, noop);
  const endTurn = vi.fn();
  const setters = { setMsgs: vi.fn(), setGs: vi.fn(), setSelIdx: noop, setShowInv: noop, setShowDesc: noop,
    setIdentifyMode, setThrowMode, setInvMenuSel: noop };
  const actions = useItemActions({ sr, ...setters, endTurn, dnameRef: it => it.name });
  const start = source.indexOf("  const _chargeShopFloorItem =");
  const end = source.indexOf("  const _doFloorWaveWand =", start);
  const deps = { sr, ...setters, hasForcedTurn, getShops, applyShopUnpaidCharge, shopPriceNote, itemDisplayName,
    clearDimensionalVaultItemCounter, trackItem: noop, identifyCancelRef, modalTypeRef, throwModeRef, floorThrowReturnRef };
  const floorItemAction = new Function(...Object.keys(deps), `${source.slice(start, end)}; return _doFloorItemAction;`)(...Object.values(deps));
  const invActRef = { current: { use: actions.doUseItem, throw: actions.doThrow, floorItemAction } };
  const listeners = {};
  vi.stubGlobal("window", { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: noop });
  vi.spyOn(soundEngine, "unlock").mockImplementation(noop);
  const press = (key, options) => {
    effects.length = 0;
    useKeyHandler({ sr, gs: sr.current, ...setters, invActRef, identifyCancelRef, endTurn, identifyMode: dialog, throwMode: throwModeRef.current,
      shiftRef: { current: false }, aRef: { current: false }, arrowHeldRef: { current: {} }, execRef: { current: null }, ...options });
    effects.splice(0).forEach(effect => effect());
    listeners.keydown({ key, code: key, preventDefault: noop });
  };
  const floorMenu = invMenuSel => press("Enter", { showInv: true, invPage: 1, selIdx: 0, invMenuSel });
  const choose = key => {
    press(key, { identifyMode: dialog });
    expect(dialog).toBeNull();
  };
  const autosaveStart = source.indexOf("  useEffect(() => {", source.indexOf("/* ── 自動セーブ:"));
  const autosaveEnd = source.indexOf("\n  useEffect(", autosaveStart + 1);
  const autosave = async () => {
    let pending;
    const deps = { sr, gs: sr.current, dead: false, showEnding: false, saveStoppedRef: { current: false },
      modalTypeRef, identifyCancelRef, floorThrowReturnRef, runTimerRef: { current: null },
      msgsRef: { current: [] }, dungeonConfig: null, getDiscoveries: () => null, saveFailedRef: { current: false },
      setMsgs: setters.setMsgs, useEffect: effect => effect(),
      saveGameState: (...args) => { pending = saveGameState(...args); return pending; } };
    new Function(...Object.keys(deps), source.slice(autosaveStart, autosaveEnd))(...Object.values(deps));
    return pending;
  };
  return { shop, keeper, scroll, gear, dungeon, player, endTurn, choose, floorMenu, press, getDialog: () => dialog,
    throwModeRef, identifyCancelRef, autosave };
}

function openFloorScroll(options) {
  const fixture = floorActionFixture(options);
  fixture.floorMenu(1);
  expect(fixture.getDialog()?.mode).toBe(options?.mode || options?.effect || "identify");
  return fixture;
}

it("店の巻物を足元から読んでキャンセルすると商品が戻り、未払いや泥棒扱いが残らない", () => {
  const { shop, keeper, scroll, gear, dungeon, player, endTurn, choose } = openFloorScroll({ bargain: true });
  expect(shop.unpaidTotal).toBe(175);
  choose("Escape");
  expect(shop.unpaidTotal).toBe(0);
  expect(scroll._shopCharge).toBeUndefined();
  expect(scroll.shopPrice).toBe(250);
  expect(keeper.state).toBe("friendly");
  expect(dungeon.items).toEqual([scroll]);
  expect(player.inventory).toEqual([gear]);
  expect(endTurn).not.toHaveBeenCalled();
  player.x = 7;
  checkShopTheft(player, dungeon, []);
  expect(player.isThief).toBeFalsy();
});

it.each([false, true])("キャンセルで元からある未払いは取り消さない（同じ商品: %s）", (precharged) => {
  const { shop, keeper, scroll, choose } = openFloorScroll({ debt: 125, precharged });
  choose("Escape");
  expect(shop.unpaidTotal).toBe(125);
  expect(scroll._shopCharge).toBe(precharged ? 125 : undefined);
  expect(keeper.state).toBe("blocking");
});

it("効果の対象を確定した場合は巻物を消費し、代金を請求する", () => {
  const { shop, keeper, gear, dungeon, player, endTurn, choose } = openFloorScroll();
  choose("Enter");
  expect(shop.unpaidTotal).toBe(250);
  expect(keeper.state).toBe("blocking");
  expect(dungeon.items).toEqual([]);
  expect(player.inventory).toEqual([gear]);
  expect(gear.fullIdent).toBe(true);
  expect(endTurn).toHaveBeenCalledOnce();
});

const targetedScrolls = ["duplicate", "sell_item", "transform_item", "forge_item", "pot_extract", "weapon_up", "armor_up"];
const unknownWeapon = () => ({ id: "sword", type: "weapon", name: "短剣", atk: 4 });
const scrollTargets = () => [unknownWeapon(), { type: "armor", name: "皮の服", def: 2 },
  { type: "pot", name: "保存の壺", potEffect: "none", contents: [{ type: "food", name: "リンゴ" }] }];

it.each(targetedScrolls)("%sの巻物もキャンセルで元の場所と価格に戻る", effect => {
  const { shop, keeper, scroll, choose, dungeon, player } = openFloorScroll({ effect, inventory: scrollTargets() });
  choose("Escape");
  expect(shop.unpaidTotal).toBe(0);
  expect(keeper.state).toBe("friendly");
  expect(dungeon.items).toEqual([scroll]);
  expect(player.inventory).not.toContain(scroll);
});

it.each(["identify", ...targetedScrolls])("%sの対象選択中は仮移動・請求を自動セーブしない", async effect => {
  const storage = new Map();
  vi.stubGlobal("localStorage", { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) });
  const { scroll, autosave, floorMenu, choose, getDialog } = floorActionFixture({ effect, inventory: scrollTargets() });
  expect(await autosave()).toBe(true);
  floorMenu(1);
  expect(getDialog()?.mode).toBe(effect);
  expect(await autosave()).toBeUndefined();
  const resumed = await loadGameState();
  expect(resumed.dungeon.items.map(item => item.id)).toEqual([scroll.id]);
  expect(resumed.dungeon.shop.unpaidTotal).toBe(0);
  expect(resumed.player.inventory.map(item => item.id)).not.toContain(scroll.id);

  choose("Enter");
  expect(await autosave()).toBe(true);
  const afterUse = await loadGameState();
  expect(afterUse.dungeon.items.map(item => item.id)).not.toContain(scroll.id);
  expect(afterUse.player.inventory.map(item => item.id)).not.toContain(scroll.id);
  expect(afterUse.dungeon.shop.unpaidTotal).toBe(250);
});

it("別の巻物をキャンセルしても足元から装備した武器を床に戻さない", () => {
  const inventory = [{ id: "owned", type: "scroll", name: "識別の巻物", effect: "identify" },
    { id: "unknown", type: "ring", name: "力の指輪", effect: "power_ring" }];
  const { scroll: weapon, choose, dungeon, player, floorMenu, press, identifyCancelRef } = floorActionFixture({
    floorItem: { ...unknownWeapon(), shopPrice: null, _shopId: null }, inventory,
  });
  floorMenu(1);
  expect(player.weapon).toBe(weapon);
  expect(identifyCancelRef.current).toBeNull();
  press("Enter", { showInv: true, invPage: 0, selIdx: 0, invMenuSel: 0 });
  choose("Escape");
  expect(player.weapon).toBe(weapon);
  expect(player.inventory).toContain(weapon);
  expect(dungeon.items).toEqual([]);
});

it("所持品が満杯で足元の道具の投擲をキャンセルすると棚に戻る", () => {
  const { scroll: apple, dungeon, player, shop, keeper, floorMenu, press, throwModeRef, endTurn } = floorActionFixture({
    floorItem: { id: "apple", type: "food", name: "リンゴ" }, maxInventory: 1,
  });
  floorMenu(2);
  expect(throwModeRef.current?.mode).toBe("throw");
  press("Escape");
  expect(throwModeRef.current).toBeNull();
  expect(dungeon.items).toEqual([apple]);
  expect(player.inventory).toHaveLength(1);
  expect(shop.unpaidTotal).toBe(0);
  expect(keeper.state).toBe("friendly");
  expect(endTurn).not.toHaveBeenCalled();
});
