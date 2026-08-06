import { describe, it, expect } from "vitest";
import {
  calcShopBuyPrice,
  applyShopUnpaidCharge,
  getShopItemCharge,
  getShopUsedCost,
  getShopRefundAmount,
  getShopRemainingRatio,
  placeItemAt,
  itemPrice,
  makeArrowUnitFromStack,
  peelShopArrowUnit,
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

  it("二重請求しない", () => {
    const { shop, shopId } = makeShopRoom();
    const p = { rings: [] };
    const item = {
      id: "it4", name: "薬", type: "potion", effect: "heal", tile: 16,
      shopPrice: 100, _shopId: shopId,
    };
    expect(applyShopUnpaidCharge(item, shop, p)).toBe(100);
    expect(applyShopUnpaidCharge(item, shop, p)).toBe(0);
    expect(shop.unpaidTotal).toBe(100);
  });
});

describe("shop arrow unit peel / flags", () => {
  it("射た1本に店フラグと請求が付き、残束の請求が減る", () => {
    const { dg, shop, shopId } = makeShopRoom();
    const p = { rings: [] };
    const arrows = {
      id: "ar1", name: "矢", type: "arrow", atk: 3, count: 10, tile: 23,
      shopPrice: 100, _shopId: shopId, sellPrice: 10,
    };
    applyShopUnpaidCharge(arrows, shop, p);
    expect(shop.unpaidTotal).toBe(100);
    expect(arrows._shopCharge).toBe(100);

    /* 1本射って着弾 */
    arrows.count--;
    const unit = makeArrowUnitFromStack(arrows);
    expect(unit.count).toBe(1);
    expect(unit.shopPrice).toBeGreaterThan(0);
    expect(unit._shopId).toBe(shopId);
    expect(unit._shopCharge).toBe(10);
    expect(arrows.count).toBe(9);
    expect(arrows._shopCharge).toBe(90);
    expect(arrows.shopPrice).toBe(90);
    expect(shop.unpaidTotal).toBe(100); /* 未払い総額は拾い時のまま */

    /* 着弾した1本を店に戻す */
    placeItemAt(dg, 12, 12, unit, [], new Set(), 0, p);
    expect(shop.unpaidTotal).toBe(90);

    /* 残束を戻す */
    placeItemAt(dg, 12, 12, arrows, [], new Set(), 0, p);
    expect(shop.unpaidTotal).toBe(0);
  });

  it("消滅（落ちない）でも1本分の請求が残る", () => {
    const { shop, shopId } = makeShopRoom();
    const p = { rings: [] };
    const arrows = {
      id: "ar2", name: "矢", type: "arrow", count: 5,
      shopPrice: 50, _shopId: shopId,
    };
    applyShopUnpaidCharge(arrows, shop, p);
    arrows.count--;
    peelShopArrowUnit(arrows); /* 命中で消滅 */
    expect(arrows.count).toBe(4);
    expect(arrows._shopCharge).toBe(40);
    expect(shop.unpaidTotal).toBe(50); /* 使った1本分10Gが未払いに残る */
  });

  it("着弾した店の矢を拾い直しても二重請求しない", () => {
    const { shop, shopId } = makeShopRoom();
    const p = { rings: [] };
    const arrows = {
      id: "ar3", name: "矢", type: "arrow", count: 4,
      shopPrice: 40, _shopId: shopId,
    };
    applyShopUnpaidCharge(arrows, shop, p);
    arrows.count--;
    const unit = makeArrowUnitFromStack(arrows);
    expect(unit._shopCharge).toBe(10);
    expect(applyShopUnpaidCharge(unit, shop, p)).toBe(0);
    expect(shop.unpaidTotal).toBe(40);
  });
});

describe("shop marker charge proration", () => {
  it("魔法の筆の使用分を残して返却できる", () => {
    const { dg, shop, shopId } = makeShopRoom();
    const p = { rings: [] };
    const marker = {
      id: "mk1", name: "魔法の筆", type: "marker", charges: 3, tile: 41,
      shopPrice: itemPrice({ type: "marker", charges: 3, sellPrice: 1500 }),
      _shopId: shopId, sellPrice: 1500,
    };
    const full = marker.shopPrice;
    applyShopUnpaidCharge(marker, shop, p);
    expect(shop.unpaidTotal).toBe(full);
    expect(marker._origCharges).toBe(3);

    marker.charges = 2; /* 1回使用 */
    const used = getShopUsedCost(marker);
    const refund = getShopRefundAmount(marker);
    expect(used + refund).toBe(full);
    expect(used).toBeGreaterThan(0);

    placeItemAt(dg, 12, 12, marker, [], new Set(), 0, p);
    expect(shop.unpaidTotal).toBe(used);
  });
});
