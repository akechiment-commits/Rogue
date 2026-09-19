import { useEffect, useRef, useState, useCallback } from "react";
import {
  BTN,
  A_TAP_MS,
  MOVE_REPEAT_MS,
  MOVE_REPEAT_DELAY_MS,
  QUICK_MENU_ITEMS,
  pickFirstGamepad,
  snapshotButtons,
  edgeDown,
  edgeUp,
  buttonPressed,
  hasNearbyMonster,
  readMoveDir,
  readLookDir,
} from "./gamepadInput.js";

const QUICK_MENU_COLS = 2;
const WAIT_REPEAT_MS = 130;

function fireKey(key, code, type = "keydown") {
  if (typeof window === "undefined") return;
  const ev = new KeyboardEvent(type, {
    key,
    code,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(ev);
}

function dirToArrow(dx, dy) {
  if (dx === -1 && dy === -1) return { key: "7", code: "Numpad7" };
  if (dx === 0 && dy === -1) return { key: "ArrowUp", code: "ArrowUp" };
  if (dx === 1 && dy === -1) return { key: "9", code: "Numpad9" };
  if (dx === -1 && dy === 0) return { key: "ArrowLeft", code: "ArrowLeft" };
  if (dx === 1 && dy === 0) return { key: "ArrowRight", code: "ArrowRight" };
  if (dx === -1 && dy === 1) return { key: "1", code: "Numpad1" };
  if (dx === 0 && dy === 1) return { key: "ArrowDown", code: "ArrowDown" };
  if (dx === 1 && dy === 1) return { key: "3", code: "Numpad3" };
  return null;
}

function dpadPressed(gp) {
  return (
    buttonPressed(gp, BTN.UP) ||
    buttonPressed(gp, BTN.DOWN) ||
    buttonPressed(gp, BTN.LEFT) ||
    buttonPressed(gp, BTN.RIGHT)
  );
}

/** D-pad only (ignore stick) — avoids double-fire when pads mirror hat onto axes. */
function readDpadDir(gp) {
  if (!gp) return null;
  let dx = 0;
  let dy = 0;
  if (buttonPressed(gp, BTN.UP)) dy -= 1;
  if (buttonPressed(gp, BTN.DOWN)) dy += 1;
  if (buttonPressed(gp, BTN.LEFT)) dx -= 1;
  if (buttonPressed(gp, BTN.RIGHT)) dx += 1;
  if (dx === 0 && dy === 0) return null;
  return { dx: Math.sign(dx), dy: Math.sign(dy) };
}

/**
 * Gamepad → existing keyboard / act / doDash bridge.
 */
export function useGamepad({
  enabled = true,
  aRef,
  shiftRef,
  arrowHeldRef,
  sr,
  invActRef,
  act,
  doDash,
  dead,
  showInv,
  lookMode,
  mapMode,
  msgLogMode,
  spellListMode,
  exitHubConfirm,
  showSettings,
  showScores,
  throwMode,
  debugSpellMode,
  facingMode,
  modalType,
  showSign,
  miniTip,
  showTileEditor,
  showEnding,
  setLookMode,
  setMapMode,
  setMsgLogMode,
  setMsgLogScrollTop,
  msgsRef,
  setSpellListMode,
  setSpellMenuSel,
  setShowSettings,
  setShowScores,
  setExitHubConfirm,
  setFacingMode,
  setGs,
  setRbHeldUi,
  getLookDesc,
  setMsgs,
}) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSel, setQuickSel] = useState(0);
  const [ltHeld, setLtHeld] = useState(false);
  const ltHeldUiRef = useRef(false);
  const [rbHeld, setRbHeld] = useState(false);
  const rbHeldUiRef = useRef(false);
  const quickOpenRef = useRef(false);
  quickOpenRef.current = quickOpen;
  const quickSelRef = useRef(0);
  quickSelRef.current = quickSel;
  const facingModeRef = useRef(!!facingMode);
  facingModeRef.current = !!facingMode;
  const showSettingsRef = useRef(!!showSettings);
  showSettingsRef.current = !!showSettings;
  const showScoresRef = useRef(!!showScores);
  showScoresRef.current = !!showScores;
  const showInvRef = useRef(!!showInv);
  showInvRef.current = !!showInv;
  const lookModeRef = useRef(lookMode);
  lookModeRef.current = lookMode;
  const mapModeRef = useRef(mapMode);
  mapModeRef.current = mapMode;
  const msgLogModeRef = useRef(!!msgLogMode);
  msgLogModeRef.current = !!msgLogMode;
  const spellListModeRef = useRef(spellListMode);
  spellListModeRef.current = spellListMode;
  const exitHubConfirmRef = useRef(!!exitHubConfirm);
  exitHubConfirmRef.current = !!exitHubConfirm;
  const throwModeRef = useRef(throwMode);
  throwModeRef.current = throwMode;
  const debugSpellModeRef = useRef(debugSpellMode);
  debugSpellModeRef.current = debugSpellMode;
  const modalTypeRef = useRef(modalType);
  modalTypeRef.current = modalType;
  const showSignRef = useRef(showSign);
  showSignRef.current = showSign;
  const miniTipRefPad = useRef(miniTip);
  miniTipRefPad.current = miniTip;
  const showTileEditorRefPad = useRef(!!showTileEditor);
  showTileEditorRefPad.current = !!showTileEditor;
  const showEndingRef = useRef(!!showEnding);
  showEndingRef.current = !!showEnding;

  const prevBtnRef = useRef({});
  const aDownAtRef = useRef(0);
  const aUsedDashRef = useRef(false);
  const waitHeldRef = useRef(false);
  const waitStoppedRef = useRef(false);
  const waitRepeatAtRef = useRef(0);
  const moveHeldRef = useRef(null);
  const moveRepeatAtRef = useRef(0);
  const moveFirstAtRef = useRef(0);
  const lookStickActiveRef = useRef(false);
  const xHeldRef = useRef(false);
  const xUsedDirRef = useRef(false);

  const anyModalUi = useCallback(() => {
    /* modalType: spring/wish/bigbox/gacha/altar/merchant/shop/put/marker/
       spellList/tpSelect/look/map/floorSelect/identify/nickname/reveal/debugSpell など全部 */
    return !!(
      quickOpenRef.current ||
      showInvRef.current ||
      lookModeRef.current ||
      mapModeRef.current ||
      msgLogModeRef.current ||
      spellListModeRef.current ||
      exitHubConfirmRef.current ||
      showSettingsRef.current ||
      showScoresRef.current ||
      throwModeRef.current ||
      debugSpellModeRef.current ||
      modalTypeRef.current ||
      showSignRef.current ||
      miniTipRefPad.current ||
      showTileEditorRefPad.current ||
      showEndingRef.current
    );
  }, []);

  const openMsgLog = useCallback(() => {
    const total = msgsRef?.current?.length || 0;
    setMsgLogScrollTop?.(Math.max(0, total - 20));
    setMsgLogMode?.(true);
  }, [msgsRef, setMsgLogMode, setMsgLogScrollTop]);

  const openLook = useCallback(() => {
    const { player: lp, dungeon: ld } = sr?.current || {};
    if (!lp || !ld) return;
    setLookMode?.({ cx: lp.x, cy: lp.y });
    const desc = getLookDesc?.(lp.x, lp.y, ld);
    setMsgs?.((prev) => [
      ...prev.slice(-80),
      `[見渡す] 矢印キーで移動、xでキャンセル / ${desc || ""}`,
    ]);
  }, [sr, setLookMode, getLookDesc, setMsgs]);

  const runQuickAction = useCallback(
    (id) => {
      setQuickOpen(false);
      switch (id) {
        case "item":
          act?.("inventory");
          break;
        case "map":
          setMapMode?.(true);
          break;
        case "history":
        case "log":
          openMsgLog();
          break;
        case "look":
          openLook();
          break;
        case "underfoot":
          act?.("interact");
          break;
        case "magic":
          setSpellListMode?.((f) => !f);
          setSpellMenuSel?.(0);
          break;
        case "settings":
          setShowSettings?.(true);
          break;
        case "scores":
          setShowScores?.(true);
          break;
        case "traps":
          act?.("search_traps");
          break;
        case "interrupt":
          setExitHubConfirm?.(true);
          break;
        default:
          break;
      }
    },
    [
      act,
      setMapMode,
      openMsgLog,
      openLook,
      setSpellListMode,
      setSpellMenuSel,
      setShowSettings,
      setShowScores,
      setExitHubConfirm,
    ],
  );

  const tryRegisteredItem = useCallback(() => {
    const p = sr?.current?.player;
    if (!p) return;
    const idx = p.registeredIdx;
    if (typeof idx === "number" && idx >= 0 && idx < (p.inventory?.length || 0)) {
      invActRef?.current?.use?.(idx);
      return;
    }
    setMsgs?.((prev) => [...prev.slice(-80), "登録アイテムがありません"]);
  }, [sr, invActRef, setMsgs]);

  const applyMove = useCallback(
    (dx, dy, { convenient, dash } = {}) => {
      if (dead) return;
      if (quickOpenRef.current) return;
      if (showScoresRef.current || showSettingsRef.current || showInvRef.current) return;
      if (mapModeRef.current || lookModeRef.current || msgLogModeRef.current) return;
      if (spellListModeRef.current || exitHubConfirmRef.current || throwModeRef.current || debugSpellModeRef.current) return;
      /* 振り向き中・X押し中は絶対に移動しない */
      if (xHeldRef.current || facingModeRef.current) return;
      if (convenient) {
        doDash?.(dx, dy, { convenient: true });
        return;
      }
      if (dash || aRef?.current) {
        if (aRef) aRef.current = true;
        aUsedDashRef.current = true;
        doDash?.(dx, dy);
        return;
      }
      act?.("move", dx, dy);
    },
    [dead, doDash, act, aRef],
  );

  const cancelModal = useCallback(() => {
    if (quickOpenRef.current) {
      setQuickOpen(false);
      return true;
    }
    if (showSettingsRef.current) {
      setShowSettings?.(false);
      return true;
    }
    if (showScoresRef.current) {
      setShowScores?.(false);
      return true;
    }
    if (facingModeRef.current) {
      setFacingMode?.(false);
      facingModeRef.current = false;
      return true;
    }
    /* 既存キーハンドラに任せる（インベントリ・マップ・ログ等） */
    fireKey("Escape", "Escape");
    return true;
  }, [setShowSettings, setShowScores, setFacingMode]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let raf = 0;
    let alive = true;

    const tick = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      const gp = pickFirstGamepad(navigator.getGamepads?.() || []);
      if (!gp) {
        if (shiftRef) shiftRef.current = false;
        waitHeldRef.current = false;
        waitStoppedRef.current = false;
        if (rbHeldUiRef.current) {
          rbHeldUiRef.current = false;
          setRbHeld(false);
          setRbHeldUi?.(false);
        }
        return;
      }

      const next = snapshotButtons(gp);
      const prev = prevBtnRef.current;

      const _rbNow = buttonPressed(gp, BTN.RB);
      if (shiftRef) shiftRef.current = _rbNow;
      if (_rbNow !== rbHeldUiRef.current) {
        rbHeldUiRef.current = _rbNow;
        setRbHeld(_rbNow);
        setRbHeldUi?.(_rbNow);
      }

      const lt = buttonPressed(gp, BTN.LT);
      if (lt !== ltHeldUiRef.current) {
        ltHeldUiRef.current = lt;
        setLtHeld(lt);
      }
      const rt = buttonPressed(gp, BTN.RT);
      const aHeld = buttonPressed(gp, BTN.A);
      const bHeld = buttonPressed(gp, BTN.B);
      const xHeld = buttonPressed(gp, BTN.X) && !lt;
      xHeldRef.current = xHeld;
      const waitChord = aHeld && bHeld && !lt;
      if (!waitChord) {
        waitHeldRef.current = false;
        waitStoppedRef.current = false;
      } else if (quickOpenRef.current || showScoresRef.current) {
        waitHeldRef.current = true;
        waitStoppedRef.current = true;
      }

      /* —— Yクイックメニュー（十字のみ。スティック併用で2マス飛ぶのを防ぐ） —— */
      if (quickOpenRef.current) {
        const n = QUICK_MENU_ITEMS.length;
        const cols = QUICK_MENU_COLS;
        const moveSel = (dx, dy) => {
          setQuickSel((s) => {
            let col = s % cols;
            let row = Math.floor(s / cols);
            const rows = Math.ceil(n / cols);
            col = (col + dx + cols) % cols;
            row = (row + dy + rows) % rows;
            let next = row * cols + col;
            if (next >= n) next = n - 1;
            return next;
          });
        };
        const up = edgeDown(prev, next, BTN.UP);
        const down = edgeDown(prev, next, BTN.DOWN);
        const left = edgeDown(prev, next, BTN.LEFT);
        const right = edgeDown(prev, next, BTN.RIGHT);
        if (up) { moveSel(0, -1); moveHeldRef.current = "menu-dpad"; }
        else if (down) { moveSel(0, 1); moveHeldRef.current = "menu-dpad"; }
        else if (left) { moveSel(-1, 0); moveHeldRef.current = "menu-dpad"; }
        else if (right) { moveSel(1, 0); moveHeldRef.current = "menu-dpad"; }
        else if (!dpadPressed(gp)) {
          const stick = readMoveDir(gp);
          if (stick && (stick.dy !== 0 || stick.dx !== 0)) {
            const key = `menu-stick:${stick.dx},${stick.dy}`;
            if (moveHeldRef.current !== key) {
              moveHeldRef.current = key;
              moveSel(stick.dx, stick.dy);
            }
          } else {
            moveHeldRef.current = null;
          }
        }
        if (edgeDown(prev, next, BTN.B)) {
          const item = QUICK_MENU_ITEMS[quickSelRef.current];
          if (item) runQuickAction(item.id);
        }
        if (edgeDown(prev, next, BTN.A) || edgeDown(prev, next, BTN.Y)) {
          setQuickOpen(false);
        }
        prevBtnRef.current = next;
        return;
      }

      /* —— 冒険記録：背景操作を完全遮断。十字はスクロール、A/Bで閉じる —— */
      if (showScoresRef.current) {
        const up = edgeDown(prev, next, BTN.UP) || edgeDown(prev, next, BTN.LEFT);
        const down = edgeDown(prev, next, BTN.DOWN) || edgeDown(prev, next, BTN.RIGHT);
        if (up || down) {
          const el = typeof document !== "undefined" ? document.querySelector("[data-scores-modal]") : null;
          if (el) el.scrollTop = Math.max(0, el.scrollTop + (up ? -96 : 96));
        } else if (!dpadPressed(gp)) {
          const stick = readMoveDir(gp);
          if (stick) {
            const key = `scores:${stick.dx},${stick.dy}`;
            if (moveHeldRef.current !== key) {
              moveHeldRef.current = key;
              const el = typeof document !== "undefined" ? document.querySelector("[data-scores-modal]") : null;
              if (el) {
                const delta = stick.dy !== 0 ? stick.dy : stick.dx;
                el.scrollTop = Math.max(0, el.scrollTop + (delta < 0 ? -96 : 96));
              }
            }
          } else {
            moveHeldRef.current = null;
          }
        }
        if (edgeDown(prev, next, BTN.A) || edgeDown(prev, next, BTN.B) || edgeDown(prev, next, BTN.Y)) {
          setShowScores?.(false);
        }
        /* RB矢印UIは冒険記録中も更新不要だが状態は落とさない */
        prevBtnRef.current = next;
        return;
      }

      /* LTコード：通常プレイ中だけ有効。モーダル・死亡・クリア後は背景へ操作を通さない。 */
      if (lt && !anyModalUi() && !dead && !facingModeRef.current) {
        if (edgeDown(prev, next, BTN.A)) act?.("interact");
        else if (edgeDown(prev, next, BTN.B)) act?.("search_traps");
        else if (edgeDown(prev, next, BTN.X)) openLook();
        else if (edgeDown(prev, next, BTN.Y)) openMsgLog();
      }

      /* A: メニュー中=キャンセル / タップ=インベントリ / 長押し=ダッシュ修飾 */
      if (edgeDown(prev, next, BTN.A) && !lt) {
        aDownAtRef.current = now;
        aUsedDashRef.current = false;
        if (anyModalUi() || facingModeRef.current) {
          cancelModal();
          aUsedDashRef.current = true;
        }
      }
      if (aHeld && !lt && !anyModalUi() && !facingModeRef.current) {
        if (aRef && now - aDownAtRef.current >= A_TAP_MS) aRef.current = true;
      }
      if (edgeUp(prev, next, BTN.A) && !lt) {
        const dur = now - aDownAtRef.current;
        if (aRef) aRef.current = false;
        if (
          !aUsedDashRef.current &&
          dur > 0 &&
          dur < A_TAP_MS &&
          !anyModalUi() &&
          !facingModeRef.current &&
          !dead
        ) {
          act?.("inventory");
        }
        aDownAtRef.current = 0;
      }

      /* B: 攻撃/決定 */
      if (edgeDown(prev, next, BTN.B) && !lt && !waitChord) {
        fireKey("z", "KeyZ");
      }

      /* A+B長押し：一般的な足踏み。敵が近づいたら離すまで停止する。 */
      if (waitChord) {
        const blocked = anyModalUi() || facingModeRef.current || dead;
        if (blocked) {
          waitHeldRef.current = true;
          waitStoppedRef.current = true;
        } else if (!waitStoppedRef.current) {
          const current = sr?.current;
          const nearby = hasNearbyMonster(current?.player, current?.dungeon);
          const firstWaitAfterPress = !waitHeldRef.current;
          if (firstWaitAfterPress || (!nearby && now - waitRepeatAtRef.current >= WAIT_REPEAT_MS)) {
            waitHeldRef.current = true;
            waitRepeatAtRef.current = now;
            aUsedDashRef.current = true;
            act?.("wait");
            /* 押し直し時は、敵が近くてもこの1ターンだけ飛ばして停止する。 */
            if (nearby) waitStoppedRef.current = true;
          } else if (nearby) {
            waitHeldRef.current = true;
            waitStoppedRef.current = true;
          }
        }
      }

      if (edgeDown(prev, next, BTN.X) && !lt && !dead && !anyModalUi()) {
        xUsedDirRef.current = false;
        facingModeRef.current = true;
        setFacingMode?.(true);
      }
      if (edgeUp(prev, next, BTN.X) && !lt) {
        /* このフレーム先頭で xHeldRef は既に false に更新済みなので、
           単押し判定は「方向を使っていない」だけで見る */
        if (!xUsedDirRef.current && !anyModalUi() && !dead) {
          fireKey("t", "KeyT");
        }
        facingModeRef.current = false;
        setFacingMode?.(false);
      }

      /* Y: クイックメニュー */
      if (edgeDown(prev, next, BTN.Y) && !lt && !dead && !anyModalUi()) {
        setQuickSel(0);
        setQuickOpen(true);
        moveHeldRef.current = null;
      }

      /* Select: マップ */
      if (edgeDown(prev, next, BTN.SELECT) && !dead) {
        /* マップ開閉のみ許可。他オブジェクトUI中は誤発火させない */
        const mt = modalTypeRef.current;
        if (!anyModalUi() || mt === "map" || mapModeRef.current) {
          fireKey(" ", "Space");
        }
      }

      /* Start: 登録アイテム */
      if (edgeDown(prev, next, BTN.START) && !dead && !anyModalUi()) {
        tryRegisteredItem();
      }

      /* 右スティック: 見渡す */
      const lookDir = readLookDir(gp);
      if (lookDir && !dead && !xHeld) {
        if (!lookStickActiveRef.current && !lookModeRef.current) {
          openLook();
          lookStickActiveRef.current = true;
        } else if (lookModeRef.current) {
          const key = `look:${lookDir.dx},${lookDir.dy}`;
          if (moveHeldRef.current !== key) {
            moveHeldRef.current = key;
            const arrow = dirToArrow(lookDir.dx, lookDir.dy);
            if (arrow) fireKey(arrow.key, arrow.code);
          }
        }
      } else if (!lookDir) {
        lookStickActiveRef.current = false;
      }

      /*
       * 方向入力:
       * - モーダル中 → 矢印キーを合成（インベントリ・デバッグ魔法等）
       * - 振り向き中 / X押し中 → 向きだけ（絶対に移動しない）
       * - RB押し中 → 斜め固定（縦横単独では動かない。2方向 or スティック斜めのみ）
       * - 通常 → 移動 / ダッシュ
       */
      const rbHeld = buttonPressed(gp, BTN.RB);
      const dpad = readDpadDir(gp);
      const stick = dpadPressed(gp) ? null : readMoveDir(gp);

      /* RB斜め固定用: 十字の押下状態を arrowHeld に反映（キーボード Shift と同型） */
      if (arrowHeldRef) {
        if (rbHeld) {
          arrowHeldRef.current = {
            up: buttonPressed(gp, BTN.UP) || (!!stick && stick.dy < 0),
            down: buttonPressed(gp, BTN.DOWN) || (!!stick && stick.dy > 0),
            left: buttonPressed(gp, BTN.LEFT) || (!!stick && stick.dx < 0),
            right: buttonPressed(gp, BTN.RIGHT) || (!!stick && stick.dx > 0),
          };
        }
      }

      let move = dpad || stick;
      if (rbHeld && !anyModalUi() && !(xHeld || facingModeRef.current)) {
        const h = arrowHeldRef?.current || {};
        const dx = (h.right ? 1 : 0) - (h.left ? 1 : 0);
        const dy = (h.down ? 1 : 0) - (h.up ? 1 : 0);
        if (dx !== 0 && dy !== 0) move = { dx, dy };
        else if (stick && stick.dx !== 0 && stick.dy !== 0) move = stick;
        else move = null; /* 斜め固定: 縦横だけでは動かない */
      }

      if (move) {
        const key = `${move.dx},${move.dy}${rbHeld ? ":rb" : ""}`;
        const isNew = moveHeldRef.current !== key;
        const inFace = xHeld || facingModeRef.current;
        const inModal = anyModalUi() || dead;

        if (isNew) {
          moveHeldRef.current = key;
          moveFirstAtRef.current = now;
          moveRepeatAtRef.current = now;

          if (inFace) {
            xUsedDirRef.current = true;
            if (sr?.current?.player) {
              sr.current.player.facing = { dx: move.dx, dy: move.dy };
              setGs?.({ ...sr.current });
            }
            if (!xHeld) {
              facingModeRef.current = false;
              setFacingMode?.(false);
            } else {
              facingModeRef.current = true;
              setFacingMode?.(true);
            }
          } else if (inModal) {
            const arrow = dirToArrow(move.dx, move.dy);
            if (arrow) fireKey(arrow.key, arrow.code);
          } else if (buttonPressed(gp, BTN.LB)) {
            if (sr?.current?.player) {
              sr.current.player.facing = { dx: move.dx, dy: move.dy };
            }
            fireKey("q", "KeyQ");
          } else {
            applyMove(move.dx, move.dy, {
              convenient: rt,
              dash: aHeld && now - aDownAtRef.current >= 40,
            });
          }
        } else if (
          !inFace &&
          !inModal &&
          !rt &&
          !buttonPressed(gp, BTN.LB) &&
          now - moveFirstAtRef.current >= MOVE_REPEAT_DELAY_MS &&
          now - moveRepeatAtRef.current >= MOVE_REPEAT_MS
        ) {
          moveRepeatAtRef.current = now;
          applyMove(move.dx, move.dy, {
            convenient: rt,
            dash: aHeld,
          });
        } else if (inModal && !inFace) {
          if (
            now - moveFirstAtRef.current >= MOVE_REPEAT_DELAY_MS &&
            now - moveRepeatAtRef.current >= MOVE_REPEAT_MS
          ) {
            moveRepeatAtRef.current = now;
            const arrow = dirToArrow(move.dx, move.dy);
            if (arrow) fireKey(arrow.key, arrow.code);
          }
        }
      } else if (!move) {
        moveHeldRef.current = null;
        if (!rbHeld && arrowHeldRef?.current) {
          arrowHeldRef.current = { up: false, down: false, left: false, right: false };
        }
      }

      if (edgeDown(prev, next, BTN.LB) && !move && !anyModalUi() && !dead && !xHeld && !facingModeRef.current) {
        fireKey("q", "KeyQ");
      }

      prevBtnRef.current = next;
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (aRef) aRef.current = false;
      if (shiftRef) shiftRef.current = false;
      waitHeldRef.current = false;
      waitStoppedRef.current = false;
    };
  }, [
    enabled,
    aRef,
    shiftRef,
    arrowHeldRef,
    act,
    doDash,
    dead,
    anyModalUi,
    openLook,
    openMsgLog,
    runQuickAction,
    tryRegisteredItem,
    applyMove,
    cancelModal,
    setFacingMode,
    setGs,
    setRbHeldUi,
    sr,
  ]);

  return { quickOpen, quickSel, setQuickOpen, quickItems: QUICK_MENU_ITEMS, ltHeld, rbHeld };
}
