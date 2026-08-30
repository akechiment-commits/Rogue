/** ガチャマシーンの共通ルール。ゲーム本体から独立させ、抽選条件を一か所で管理する。 */
export const GACHA_COST = 1000;
export const GACHA_JACKPOT_RATE = 0.03;
export const GACHA_SPAWN_RATE = 0.05;

export function isGachaMachine(value) {
  return !!value && (value.type === "gacha" || value.kind === "gacha_machine" || value.tile === 118);
}

export function isInsideRoom(room, x, y) {
  return !!room && x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

export function isInsideGachaShop(machine, dungeon, x = machine?.x, y = machine?.y) {
  if (!machine || !dungeon || machine.shopId == null) return false;
  const shop = (dungeon.shops || []).concat(dungeon.shop ? [dungeon.shop] : [])
    .find((entry) => entry?.id === machine.shopId);
  return isInsideRoom(shop?.room, x, y);
}

export function rollGachaJackpot(randomFn = Math.random) {
  return randomFn() < GACHA_JACKPOT_RATE;
}

/**
 * 候補から抽選する小さな純粋関数。重みは呼び出し側のテンプレートに合わせる。
 * 重み0は除外し、全候補が0なら一様抽選へフォールバックする。
 */
export function pickGachaTemplate(pool, randomFn = Math.random) {
  if (!pool?.length) return null;
  const weighted = pool.filter((entry) => (entry?.weight ?? 1) > 0);
  const candidates = weighted.length ? weighted : pool;
  const total = candidates.reduce((sum, entry) => sum + (entry?.weight ?? 1), 0);
  let roll = randomFn() * total;
  for (const entry of candidates) {
    roll -= entry?.weight ?? 1;
    if (roll <= 0) return entry;
  }
  return candidates[candidates.length - 1];
}
