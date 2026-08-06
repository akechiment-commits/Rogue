import { describe, it, expect } from "vitest";
import { T, MW, MH, removeFloorItem } from "../utils.js";
import { monsterAI } from "../monsters.js";
import { applyShopUnpaidCharge, checkShopTheft, declareShopTheft, canCalmShopkeeper } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeShopDg() {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  // 5x5 shop room at (10,10)
  for (let y = 10; y < 15; y++) for (let x = 10; x < 15; x++) map[y][x] = T.FLOOR;
  map[14][12] = T.SD; // entrance at bottom center
  const shopId = "shop1";
  const blockPos = { x: 12, y: 14 };
  const homePos = { x: 12, y: 11 };
  const sk = {
    id: "sk1", name: "店主", hp: 200, maxHp: 200, atk: 100, def: 100,
    speed: 1, tile: 99, type: "shopkeeper", state: "blocking",
    blockPos, homePos, x: homePos.x, y: homePos.y,
    turnAccum: 0, aware: false, dir: { x: 0, y: 1 }, lastPx: 0, lastPy: 0,
  };
  const shopItem = {
    id: "it1", name: "薬", type: "potion", effect: "heal", tile: 16,
    x: 11, y: 12, shopPrice: 100, _shopId: shopId,
  };
  return {
    dg: makeEmptyDg({
      map,
      rooms: [{ x: 10, y: 10, w: 5, h: 5 }],
      items: [shopItem],
      monsters: [sk],
      shops: [{ id: shopId, room: { x: 10, y: 10, w: 5, h: 5 }, entrance: blockPos, shopkeeperId: sk.id, unpaidTotal: 100 }],
      visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
      explored: Array.from({ length: MH }, () => Array(MW).fill(true)),
    }),
    sk,
    shopItem,
    blockPos,
    shopId,
  };
}

function simulateItemMap(dg, flying = new Set()) {
  const _k = (x, y) => y * MW + x;
  const map = new Map();
  for (const i of dg.items) {
    if (!map.has(_k(i.x, i.y)) && !flying.has(i)) map.set(_k(i.x, i.y), i);
  }
  return map;
}

describe("shop item pickup rendering state", () => {
  it("拾った店商品は床リストから除去され、座標インデックスに残らない", () => {
    const { dg, shopItem } = makeShopDg();
    const p = makePlayer({ x: 11, y: 12, inventory: [] });
    p.inventory.push(shopItem);
    removeFloorItem(dg, shopItem);
    const itemMap = simulateItemMap(dg);
    expect(dg.items).not.toContain(shopItem);
    expect(itemMap.has(shopItem.y * MW + shopItem.x)).toBe(false);
  });

  it("拾った商品がflyingItemsRefに残っていても床に描画されない", () => {
    const { dg, shopItem } = makeShopDg();
    const p = makePlayer({ x: 11, y: 12, inventory: [] });
    p.inventory.push(shopItem);
    removeFloorItem(dg, shopItem);
    const flying = new Set([shopItem]);
    const itemMap = simulateItemMap(dg, flying);
    expect(itemMap.size).toBe(0);
  });
});

describe("shop floor item claim", () => {
  it("足元から使う請求後もshopPriceと_shopIdが残る（拾った場合と同様）", () => {
    const { dg, shopItem, shopId, sk } = makeShopDg();
    sk.state = "friendly";
    dg.shops[0].unpaidTotal = 0;
    const p = makePlayer({ x: 11, y: 12 });
    applyShopUnpaidCharge(shopItem, dg.shops[0], p);
    if (sk.state === "friendly") sk.state = "blocking";
    expect(shopItem.shopPrice).toBe(100);
    expect(shopItem._shopId).toBe(shopId);
    expect(dg.shops[0].unpaidTotal).toBe(100);
    expect(sk.state).toBe("blocking");
  });
});

describe("shop theft declare", () => {
  it("テレポート離脱相当：checkShopTheft が shopTheft と警備員スポーン準備を立てる", () => {
    const { dg, sk, shopId } = makeShopDg();
    sk.state = "friendly";
    dg.shops[0].unpaidTotal = 150;
    dg.shopTheft = false;
    const p = makePlayer({ x: 1, y: 1, turns: 20 }); /* 店外 */
    p.isThief = false;
    const ml = [];
    checkShopTheft(p, dg, ml);
    expect(p.isThief).toBe(true);
    expect(dg.shopTheft).toBe(true);
    expect(sk.state).toBe("hostile");
    expect(dg.nextGuardSpawnTurn).toBe(20);
    expect(ml.some((m) => /泥棒/.test(m))).toBe(true);
  });

  it("泥棒中は店主を全快させても敵対が解けない", () => {
    const { dg, sk } = makeShopDg();
    sk.state = "hostile";
    sk.hp = sk.maxHp;
    dg.shopTheft = true;
    const p = makePlayer({ x: 1, y: 1, isThief: true });
    expect(canCalmShopkeeper(sk, dg, p)).toBe(false);
    dg.shopTheft = false;
    p.isThief = false;
    dg.shops[0].unpaidTotal = 0;
    expect(canCalmShopkeeper(sk, dg, p)).toBe(true);
  });

  it("declareShopTheft は値札を外して未払い店主を敵対にする", () => {
    const { dg, sk, shopId } = makeShopDg();
    sk.state = "blocking";
    dg.shops[0].unpaidTotal = 80;
    const p = makePlayer({
      x: 12, y: 12,
      inventory: [{ name: "薬", type: "potion", shopPrice: 80, _shopId: shopId }],
    });
    declareShopTheft(p, dg, [], { message: "店から盗んで逃げた！" });
    expect(p.inventory[0].shopPrice).toBeUndefined();
    expect(sk.state).toBe("hostile");
    expect(dg.shopTheft).toBe(true);
  });
});

describe("shopkeeper blocking AI", () => {
  it("未払い時に入口へ移動した後、プレイヤーが店内にいれば毎ターン同じ位置に留まる", () => {
    const { dg, sk, blockPos } = makeShopDg();
    const p = makePlayer({ x: 12, y: 12 });
    const positions = [];
    for (let t = 0; t < 15; t++) {
      const before = { x: sk.x, y: sk.y };
      monsterAI(sk, dg, p, [], { moveOnly: true });
      positions.push({ x: sk.x, y: sk.y });
      // 最初の数ターンで入口到達後は動かないはず
      if (t > 3) {
        expect(sk.x).toBe(blockPos.x);
        expect(sk.y).toBe(blockPos.y);
      }
      void before;
    }
    const unique = new Set(positions.map((pos) => `${pos.x},${pos.y}`));
    expect(unique.size).toBeLessThanOrEqual(2); // home → blockPos のみ
  });

  it("blocking状態でもmonsterAIが例外を投げない", () => {
    const { dg, sk } = makeShopDg();
    const p = makePlayer({ x: 12, y: 12 });
    expect(() => monsterAI(sk, dg, p, [], { moveOnly: true })).not.toThrow();
  });
});