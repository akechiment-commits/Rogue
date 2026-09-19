import { useEffect, useRef } from "react";
import {
  BTN,
  MOVE_REPEAT_MS,
  MOVE_REPEAT_DELAY_MS,
  pickFirstGamepad,
  snapshotButtons,
  edgeDown,
  buttonPressed,
  readMoveDir,
} from "./gamepadInput.js";

/** keyCode map for older handlers / focus quirks */
const KEY_CODES = {
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  z: 90,
  Z: 90,
  x: 88,
  X: 88,
  Escape: 27,
  Enter: 13,
  Shift: 16,
  " ": 32,
};

function fireKey(key, code, type = "keydown") {
  if (typeof window === "undefined") return;
  const keyCode = KEY_CODES[key] ?? 0;
  const init = {
    key,
    code,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
  };
  const ev = new KeyboardEvent(type, init);
  /* Some browsers ignore keyCode in constructor — force if possible */
  try {
    Object.defineProperty(ev, "keyCode", { get: () => keyCode });
    Object.defineProperty(ev, "which", { get: () => keyCode });
  } catch {
    /* ignore */
  }
  window.dispatchEvent(ev);
}

function dpadPressed(gp) {
  return (
    buttonPressed(gp, BTN.UP) ||
    buttonPressed(gp, BTN.DOWN) ||
    buttonPressed(gp, BTN.LEFT) ||
    buttonPressed(gp, BTN.RIGHT)
  );
}

function readDpadDir(gp) {
  let dx = 0;
  let dy = 0;
  if (buttonPressed(gp, BTN.UP)) dy -= 1;
  if (buttonPressed(gp, BTN.DOWN)) dy += 1;
  if (buttonPressed(gp, BTN.LEFT)) dx -= 1;
  if (buttonPressed(gp, BTN.RIGHT)) dx += 1;
  if (dx === 0 && dy === 0) return null;
  return { dx: Math.sign(dx), dy: Math.sign(dy) };
}

function dirToArrow(dx, dy) {
  if (dy < 0 && dx === 0) return { key: "ArrowUp", code: "ArrowUp" };
  if (dy > 0 && dx === 0) return { key: "ArrowDown", code: "ArrowDown" };
  if (dx < 0 && dy === 0) return { key: "ArrowLeft", code: "ArrowLeft" };
  if (dx > 0 && dy === 0) return { key: "ArrowRight", code: "ArrowRight" };
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0
      ? { key: "ArrowUp", code: "ArrowUp" }
      : { key: "ArrowDown", code: "ArrowDown" };
  }
  return dx < 0
    ? { key: "ArrowLeft", code: "ArrowLeft" }
    : { key: "ArrowRight", code: "ArrowRight" };
}

function pulseKey(key, code) {
  fireKey(key, code, "keydown");
  /* keyup を少し遅らせて、keydown 処理が終わるのを待つ */
  setTimeout(() => fireKey(key, code, "keyup"), 0);
}

/**
 * 地上ハブ用 Gamepad → 既存 keydown 橋渡し。
 * B/Start=決定(z/Enter) / A=戻る(x+Escape) / 十字・左スティック=矢印
 * LB or Select=Shift（倉庫タブ切替）
 */
export function useHubGamepad(enabled = true) {
  const prevBtnRef = useRef({});
  const moveHeldRef = useRef(null);
  const moveFirstAtRef = useRef(0);
  const moveRepeatAtRef = useRef(0);
  const seenPadRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let raf = 0;
    let alive = true;

    const onConnect = () => {
      seenPadRef.current = true;
    };
    window.addEventListener("gamepadconnected", onConnect);

    const tick = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);

      const list = navigator.getGamepads?.();
      if (!list) return;
      const gp = pickFirstGamepad(list);
      if (!gp) return;
      seenPadRef.current = true;

      const next = snapshotButtons(gp);
      const prev = prevBtnRef.current;

      /* 決定 */
      if (edgeDown(prev, next, BTN.B)) pulseKey("z", "KeyZ");
      if (edgeDown(prev, next, BTN.START)) pulseKey("Enter", "Enter");

      /* 戻る・キャンセル（ハブは x / Escape の両方を見る） */
      if (edgeDown(prev, next, BTN.A)) {
        pulseKey("x", "KeyX");
        pulseKey("Escape", "Escape");
      }

      /* 倉庫などのタブ切替（キーボードは Shift） */
      if (edgeDown(prev, next, BTN.LB) || edgeDown(prev, next, BTN.SELECT)) {
        pulseKey("Shift", "ShiftLeft");
      }

      /* Y: スペース（ページ送り等がある画面向け） */
      if (edgeDown(prev, next, BTN.Y)) pulseKey(" ", "Space");

      const dpad = readDpadDir(gp);
      const stick = dpadPressed(gp) ? null : readMoveDir(gp);
      const move = dpad || stick;

      if (move) {
        const key = `${move.dx},${move.dy}`;
        const isNew = moveHeldRef.current !== key;
        if (isNew) {
          moveHeldRef.current = key;
          moveFirstAtRef.current = now;
          moveRepeatAtRef.current = now;
          const arrow = dirToArrow(move.dx, move.dy);
          if (arrow) pulseKey(arrow.key, arrow.code);
        } else if (
          now - moveFirstAtRef.current >= MOVE_REPEAT_DELAY_MS &&
          now - moveRepeatAtRef.current >= MOVE_REPEAT_MS
        ) {
          moveRepeatAtRef.current = now;
          const arrow = dirToArrow(move.dx, move.dy);
          if (arrow) pulseKey(arrow.key, arrow.code);
        }
      } else {
        moveHeldRef.current = null;
      }

      prevBtnRef.current = next;
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("gamepadconnected", onConnect);
    };
  }, [enabled]);
}
