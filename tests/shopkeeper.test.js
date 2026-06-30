import { describe, it, expect } from "vitest";
import { T, MW, MH, removeFloorItem } from "../utils.js";
import { monsterAI } from "../monsters.js";
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