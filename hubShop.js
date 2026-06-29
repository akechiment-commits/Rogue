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
 * 拠点ショップの在庫を1点ロールする。
 * 各アイテムの weight（未設定なら1）で重み付き抽選。同じ帰還で2回は出ない（1点のみ）。
 */
export function rollHubShopStock(rng = Math.random) {
  const pool = [...HUB_SHOP_POOL];
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
  const picked = pool[idx];
  if (picked.type === "ring" && PLUS_RING_EFFECTS.has(picked.effect)) {
    return [{ ...picked, plus: Math.floor(rng() * 3) + 1 }];
  }
  return [{ ...picked }];
}