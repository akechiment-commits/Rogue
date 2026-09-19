/**
 * Browser Gamepad API helpers (Xbox / Standard mapping).
 * Pure functions — no React, safe for unit tests.
 */

export const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
};

export const AXIS = {
  LX: 0,
  LY: 1,
  RX: 2,
  RY: 3,
};

export const DEFAULT_DEADZONE = 0.35;
export const A_TAP_MS = 220;
export const MOVE_REPEAT_MS = 110;
export const MOVE_REPEAT_DELAY_MS = 280;
export const WAIT_STOP_RADIUS = 3;

/** @returns {{ dx: number, dy: number } | null} */
export function axisToDir(x, y, deadzone = DEFAULT_DEADZONE) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax < deadzone && ay < deadzone) return null;
  const dx = ax >= deadzone ? (x > 0 ? 1 : -1) : 0;
  const dy = ay >= deadzone ? (y > 0 ? 1 : -1) : 0;
  if (dx === 0 && dy === 0) return null;
  return { dx, dy };
}

export function buttonValue(gp, index) {
  const b = gp?.buttons?.[index];
  if (!b) return 0;
  if (typeof b === "number") return b;
  if (typeof b.value === "number") return b.value;
  return b.pressed ? 1 : 0;
}

export function buttonPressed(gp, index, threshold = 0.5) {
  return buttonValue(gp, index) >= threshold;
}

/** D-pad + left stick → cardinal/diagonal unit vector (or null). */
export function readMoveDir(gp, deadzone = DEFAULT_DEADZONE) {
  if (!gp) return null;
  let dx = 0;
  let dy = 0;
  if (buttonPressed(gp, BTN.UP)) dy -= 1;
  if (buttonPressed(gp, BTN.DOWN)) dy += 1;
  if (buttonPressed(gp, BTN.LEFT)) dx -= 1;
  if (buttonPressed(gp, BTN.RIGHT)) dx += 1;
  if (dx !== 0 || dy !== 0) {
    return { dx: Math.sign(dx), dy: Math.sign(dy) };
  }
  return axisToDir(gp.axes?.[AXIS.LX] ?? 0, gp.axes?.[AXIS.LY] ?? 0, deadzone);
}

export function readLookDir(gp, deadzone = DEFAULT_DEADZONE) {
  if (!gp) return null;
  return axisToDir(gp.axes?.[AXIS.RX] ?? 0, gp.axes?.[AXIS.RY] ?? 0, deadzone);
}

/** Snapshot of digital edges for edge detection. */
export function snapshotButtons(gp, indices = Object.values(BTN)) {
  const out = {};
  for (const i of indices) out[i] = buttonPressed(gp, i);
  return out;
}

export function edgeDown(prev, next, index) {
  return !prev?.[index] && !!next?.[index];
}

export function edgeUp(prev, next, index) {
  return !!prev?.[index] && !next?.[index];
}

export function pickFirstGamepad(list) {
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    if (list[i]) return list[i];
  }
  return null;
}

/** 足踏みを止める敵の近距離判定（8方向移動に合わせたチェビシェフ距離）。 */
export function hasNearbyMonster(player, dungeon, radius = WAIT_STOP_RADIUS) {
  if (!player || !dungeon) return false;
  return (dungeon.monsters || []).some((monster) =>
    Math.max(Math.abs((monster.x ?? 0) - player.x), Math.abs((monster.y ?? 0) - player.y)) <= radius
  );
}

export const QUICK_MENU_ITEMS = [
  { id: "item", label: "アイテム" },
  { id: "map", label: "マップ" },
  { id: "history", label: "履歴" },
  { id: "look", label: "見渡す" },
  { id: "log", label: "ログ" },
  { id: "underfoot", label: "足元" },
  { id: "magic", label: "魔法" },
  { id: "settings", label: "設定" },
  { id: "scores", label: "冒険記録" },
  { id: "traps", label: "罠探る" },
  { id: "interrupt", label: "中断" },
];
