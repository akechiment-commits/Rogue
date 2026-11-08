/** ガチャマシーンの共通ルール。ゲーム本体から独立させ、抽選条件を一か所で管理する。 */
export const GACHA_COST = 1000;
export const GACHA_BOX_TOTAL = 100;
export const GACHA_BOX_SLOTS = Object.freeze({
  A: 2,
  B: 5,
  C: 15,
  D: 30,
  E: 48,
});
export const GACHA_RARITY_RATES = Object.freeze({ A: 0.02, B: 0.05, C: 0.10 });
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

/** 100個のレア度枠を持つBoxを生成してシャッフルする */
export function createGachaBox(randomFn = Math.random) {
  const slots = [];
  for (const [rarity, count] of Object.entries(GACHA_BOX_SLOTS)) {
    for (let i = 0; i < count; i++) slots.push(rarity);
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

/** ガチャマシーンから1つ引く。未初期化なら自動初期化、空ならnullを返す */
export function drawFromGachaBox(machine, randomFn = Math.random) {
  if (!machine) return null;
  if (!Array.isArray(machine.box)) {
    machine.box = createGachaBox(randomFn);
  }
  if (machine.box.length === 0) return null;
  return machine.box.pop();
}

/** ガチャマシーンの残り個数を取得する */
export function getGachaBoxRemaining(machine) {
  if (!machine) return 0;
  if (!Array.isArray(machine.box)) return GACHA_BOX_TOTAL;
  return machine.box.length;
}

/** ガチャマシーンオブジェクトを生成する */
export function makeGachaMachine(x, y, options = {}) {
  return {
    id: options.id,
    x,
    y,
    tile: options.tile ?? 118,
    type: "gacha",
    kind: "gacha_machine",
    name: options.name || "ガチャマシーン",
    shopId: options.shopId ?? null,
    box: options.box ?? createGachaBox(options.randomFn || Math.random),
  };
}

/** ガチャ抽選のレア度を決める（互換性用単体抽選）。null はD/E枠を表す。 */
export function rollGachaRarity(randomFn = Math.random) {
  const roll = randomFn();
  if (roll < GACHA_RARITY_RATES.A) return "A";
  if (roll < GACHA_RARITY_RATES.A + GACHA_RARITY_RATES.B) return "B";
  if (roll < GACHA_RARITY_RATES.A + GACHA_RARITY_RATES.B + GACHA_RARITY_RATES.C) return "C";
  return null;
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
