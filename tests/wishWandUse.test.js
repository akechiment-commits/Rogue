import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useRef: current => ({ current }), useEffect: () => {} }));
import { useItemActions } from "../useItemActions.js";
import { applyShopUnpaidCharge, chargeShopItem, shopPriceNote } from "../items.js";
import { grantWish } from "../wish.js";
import { hasForcedTurn } from "../turnUpkeep.js";
import { getShops, removeFloorItem } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const source = readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start) + 1));
const bind = (deps, code) => new Function(...Object.keys(deps), code)(...Object.values(deps));
const wish = { kind: "preset", id: "full_restore" };

function openWish(onFloor) {
  const shop = { id: "shop", shopkeeperId: "keeper", unpaidTotal: 0 };
  const keeper = { id: "keeper", type: "shopkeeper", state: "friendly", hp: 100 };
  const wand = { id: "wish-wand", type: "wand", effect: "wish", name: "願いの杖", charges: 1, x: 5, y: 5,
    ...(onFloor ? { shopPrice: 500, _shopId: shop.id } : {}) };
  const player = makePlayer({ hp: 18, maxInventory: 1, inventory: onFloor ? [{ type: "food", name: "リンゴ" }] : [wand] });
  const dungeon = makeEmptyDg({ rooms: [], shop, items: onFloor ? [wand] : [], monsters: [keeper] });
  const sr = { current: { player, dungeon, ident: new Set() } };
  const floorWandRef = { current: null }, wishModeRef = { current: null };
  const noop = () => {};
  let throwMode = null;
  const endTurn = vi.fn();
  const setWishMode = bind({ wishModeRef, dispatchModal: noop },
    section("  const setWishMode =", "  const setBigboxMode") + ";return setWishMode;");
  const shared = { sr, endTurn, useCallback: fn => fn, setMsgs: vi.fn(), setGs: noop, setShowInv: noop,
    setShowDesc: noop, setSelIdx: noop, setSpringMode: noop, setPutMode: noop, lu: noop, dnameRef: item => item.name,
    setThrowMode: mode => { throwMode = mode; }, setWishMode, floorWandRef };
  const actions = useItemActions(shared);
  if (onFloor) {
    const floorWandAction = bind({ ...shared, getShops, hasForcedTurn, applyShopUnpaidCharge, shopPriceNote,
      trackItem: noop, doWaveWand: actions.doWaveWand },
    section("  const _chargeShopFloorItem =", "  const _doFloorItemAction =") +
    section("  const _doFloorWaveWand =", "  const _doFloorPen =") + ";return _doFloorWaveWand;");
    floorWandAction(wand);
  } else {
    actions.doWaveWand(0);
  }
  expect(throwMode?.mode).toBe("wand_wave");
  useItemActions({ ...shared, throwMode }).execDirection(1, 0);
  expect(throwMode).toBeNull();
  expect(wishModeRef.current).toMatchObject({ source: "wand", wandId: wand.id, wandOnFloor: onFloor });
  const { confirmWish, cancelWish } = bind({ ...shared, wishModeRef, grantWish, drySpringAlways: noop, chargeShopItem, removeFloorItem },
    section("  const confirmWish =", "  const springDrink =") + ";return { confirmWish, cancelWish };");
  return { confirmWish, cancelWish, player, dungeon, wand, endTurn, shop, keeper };
}

it.each([true, false])("願いが叶った時に杖が一度だけ消える（足元: %s）", onFloor => {
  const { confirmWish, player, dungeon, wand, endTurn, shop } = openWish(onFloor);
  expect(shop.unpaidTotal).toBe(0);
  if (onFloor) {
    expect(dungeon.items).toEqual([wand]);
    expect(player.inventory).toHaveLength(1);
    expect(player.inventory).not.toContain(wand);
  }
  confirmWish(wish);
  confirmWish(wish);
  expect(player.hp).toBe(100);
  expect(wand.charges).toBe(0);
  expect(dungeon.items).not.toContain(wand);
  expect(player.inventory).not.toContain(wand);
  expect(shop.unpaidTotal).toBe(onFloor ? 500 : 0);
  expect(endTurn).toHaveBeenCalledOnce();
});

it("足元の願いをキャンセルしても杖の回数と商品を維持する", () => {
  const { cancelWish, confirmWish, player, dungeon, wand, endTurn, shop, keeper } = openWish(true);
  cancelWish();
  confirmWish(wish);
  expect(dungeon.items).toEqual([wand]);
  expect(wand.charges).toBe(1);
  expect(shop.unpaidTotal).toBe(0);
  expect(keeper.state).toBe("friendly");
  expect(player.hp).toBe(18);
  expect(endTurn).not.toHaveBeenCalled();
});

it("願い元の杖がすでに床から消えた場合は願いを叶えない", () => {
  const { confirmWish, player, dungeon, wand, endTurn } = openWish(true);
  removeFloorItem(dungeon, wand);
  confirmWish(wish);
  expect(player.hp).toBe(18);
  expect(endTurn).not.toHaveBeenCalled();
});
