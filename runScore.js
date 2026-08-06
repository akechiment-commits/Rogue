import { itemPrice } from "./items.js";

/**
 * 探索終了時のスコア（所持金 + 所持品の売却相当価値）。
 * @param {object} player
 */
export function computeRunScore(player) {
  const inv = player?.inventory || [];
  let itemsValue = 0;
  for (const it of inv) {
    try {
      itemsValue += itemPrice(it) || 0;
    } catch {
      /* 壊れたアイテムは 0 */
    }
  }
  const gold = player?.gold || 0;
  return {
    gold,
    itemsValue,
    score: gold + itemsValue,
    turns: player?.turns || 0,
    depth: player?.depth || 0,
    level: player?.level || 0,
  };
}

/**
 * ミリ秒を表示用文字列に（例: 1:05 / 1:02:03）。
 * @param {number} ms
 */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000);
  const s = Math.floor(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * 帰還／ゲームオーバー payload 用のスコア＋時間フィールド。
 * @param {object} player
 * @param {{ getElapsedMs?: () => number }|null} timer
 */
export function buildRunResultExtras(player, timer = null) {
  const base = computeRunScore(player);
  const elapsedMs = timer && typeof timer.getElapsedMs === "function"
    ? Math.max(0, Math.floor(timer.getElapsedMs()))
    : 0;
  return { ...base, elapsedMs };
}
