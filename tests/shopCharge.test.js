import { describe, it, expect } from "vitest";
import {
  calcShopBuyPrice,
  applyShopUnpaidCharge,
  getShopItemCharge,
  placeItemAt,
} from "../items.js";
import { T, MW, MH } from "../utils.js";

function makeShopRoom() {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  for (let y = 10; y < 15; y++) for (let x = 10; x < 15; x++) map[y][x] = T.FLOOR;
  const shopId = "s1";
  const sk = {
    id: "sk1", name: "店主", hp: 200, maxHp: 200, atk: 1, def: 1,
    speed: 1, tile: 99, type: "shopkeeper", state: "blocking",
    blockPos: { x: 12, y: 14 }, homePos: { x: 12, y: 11 },
    x: 12, y: 11, turnAccum: 0, aware: false, dir: { x: 0, y: 1 }, lastPx: 0, lastPy: 0,
  };
  const shop = {
    id: shopId,
    room: { x: 10, y: 10, w: 5, h: 5 },
    entrance: { x: 12, y: 14 },
    shopkeeperId: sk.id,
    unpaidTotal: 0,
  };
  const dg = {
    map,
    rooms: [{ x: 10, y: 10, w: 5, h: 5 }],
    items: [],
    monsters: [sk],
    shops: [shop],
    pentacles: [],
    traps: [],
    springs: [],
    bigboxes: [],
    statues: [],
  };
  return { dg, shop, sk, shopId };
}

describe("shop charge / refund with markup ring", () => {
  it("値上げで請求した金額を戻すと未払いがゼロになる", () => {
    const { dg, shop, shopId } = makeShopRoom();
    const p = { rings: [{ effect: "markup_ring" }] };
    const item = {
      id: "it1", name: "薬", type: "potion", effect: "heal", tile: 16,
      shopPrice: 100, _shopId: shopId,
    };
    expect(calcShopBuyPrice(p, 100)).toBe(150);
    const charged = applyShopUnpaidCharge(item, shop, p);
    expect(charged).toBe(150);
    expect(shop.unpaidTotal).toBe(150);
    expect(getShopItemCharge(item)).toBe(150);
    expect(item.shopPrice).toBe(100); /* list 価格は維持 */

    /* 店内に戻す */
    const ml = [];
    const ok = placeItemAt(dg, 12, 12, item, ml, new Set(), 0, p);
    expect(ok).toBe(true);
    expect(shop.unpaidTotal).toBe(0);
    expect(item._shopCharge).toBeUndefined();
    expect(ml.some((m) => /残高がゼロ|入り口を開け/.test(m))).toBe(true);
  });

  it("値切りでも請求額と返金額が一致する", () => {
    const { dg, shop, shopId } = makeShopRoom();
    const p = { rings: [{ effect: "bargain_ring" }] };
    const item = {
      id: "it2", name: "薬", type: "potion", effect: "heal", tile: 16,
      shopPrice: 100, _shopId: shopId,
    };
    applyShopUnpaidCharge(item, shop, p);
    expect(shop.unpaidTotal).toBe(70);
    placeItemAt(dg, 12, 12, item, [], new Set(), 0, p);
    expect(shop.unpaidTotal).toBe(0);
  });

  it("指輪なしは従来どおり shopPrice で完結", () => {
    const { dg, shop, shopId } = makeShopRoom();
    const p = { rings: [] };
    const item = {
      id: "it3", name: "薬", type: "potion", effect: "heal", tile: 16,
      shopPrice: 100, _shopId: shopId,
    };
    applyShopUnpaidCharge(item, shop, p);
    expect(shop.unpaidTotal).toBe(100);
    placeItemAt(dg, 12, 12, item, [], new Set(), 0, p);
    expect(shop.unpaidTotal).toBe(0);
  });
});
