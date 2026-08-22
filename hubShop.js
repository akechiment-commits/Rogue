import { ITEMS, WANDS, POTS, RINGS } from "./items.js";

/** 拠点ショップの抽選プール（金貨以外の全ITEMS + 杖・壺・指輪） */
export const HUB_SHOP_POOL = [
  ...ITEMS.filter((it) => it.type !== "gold"),
  ...WANDS,
  ...POTS,
  ...RINGS,
];

const PLUS_RING_EFFECTS = new Set(["power_ring", "defense_ring", "life_ring"]);

/**
 * 拠点ショップの在庫を5〜9点ロールする。
 * 各アイテムの weight（未設定なら1）で重み付き抽選。同じ帰還では同一商品を重複させない。
 */
export function rollHubShopStock(rng = Math.random) {
  const pool = [...HUB_SHOP_POOL];
  const stockCount = Math.floor(rng() * 5) + 5;
  const stock = [];
  for (let n = 0; n < stockCount && pool.length > 0; n++) {
    const total = pool.reduce((s, x) => s + (x.weight ?? 1), 0);
    let r = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight ?? 1;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    const picked = pool.splice(idx, 1)[0];
    if (picked.type === "ring" && PLUS_RING_EFFECTS.has(picked.effect)) {
      stock.push({ ...picked, plus: Math.floor(rng() * 3) + 1 });
    } else {
      stock.push({ ...picked });
    }
  }
  return stock;
}
