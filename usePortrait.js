import { useCallback, useEffect, useRef } from "react";
import { isPlayerFloating } from "./items.js";
import {
  PORTRAIT_COOLDOWN_MS,
  PORTRAIT_WALK_COOLDOWN_MS,
  PORTRAIT_WALK_STEPS_MIN,
  PORTRAIT_WALK_STEPS_JITTER,
  pickPortraitForPlayer,
  idleStandKey,
  resolvePortraitEvent,
  snapshotPlayer,
} from "./portraits.js";

export function usePortrait({
  gs,
  msgs,
  setPortraitSrc,
  bigboxMode,
  putMode,
}) {
  const prevGsRef = useRef(null);
  const prevMsgCountRef = useRef(0);
  const portraitCooldownRef = useRef(0);
  const walkStepRef = useRef(0);
  /** 状態異常立ち絵をキー単位で保持（毎回 random し直さない） */
  const heldStatusKeyRef = useRef(null);
  const dynamicEnabledRef = useRef(true);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;

  useEffect(() => {
    const saved = localStorage.getItem("roguelike_portrait");
    if (saved) {
      setPortraitSrc(saved);
      dynamicEnabledRef.current = false;
    }
  }, [setPortraitSrc]);

  const pickAndSet = useCallback((key) => {
    setPortraitSrc(pickPortraitForPlayer(key, gs?.player));
    portraitCooldownRef.current = Date.now() + PORTRAIT_COOLDOWN_MS;
  }, [setPortraitSrc, gs]);

  const forcePortrait = useCallback((key) => {
    if (!dynamicEnabledRef.current) return;
    heldStatusKeyRef.current = null;
    pickAndSet(key);
  }, [pickAndSet]);

  const tryPortrait = useCallback((key) => {
    if (!dynamicEnabledRef.current) return false;
    const now = Date.now();
    if (now < portraitCooldownRef.current) return false;
    heldStatusKeyRef.current = null;
    pickAndSet(key);
    return true;
  }, [pickAndSet]);

  const pauseDynamic = useCallback(() => {
    dynamicEnabledRef.current = false;
  }, []);

  const resumeDynamic = useCallback(() => {
    dynamicEnabledRef.current = true;
    portraitCooldownRef.current = 0;
    heldStatusKeyRef.current = null;
    if (gs?.player) {
      setPortraitSrc(pickPortraitForPlayer(idleStandKey(gs.player), gs.player));
    }
  }, [gs, setPortraitSrc]);

  useEffect(() => {
    if (bigboxMode) forcePortrait("act_chest");
  }, [bigboxMode, forcePortrait]);

  useEffect(() => {
    if (putMode) forcePortrait("act_pot");
  }, [putMode, forcePortrait]);

  useEffect(() => {
    if (!dynamicEnabledRef.current || !gs?.player) return;

    const p = gs.player;
    const prev = prevGsRef.current;
    const floating = isPlayerFloating(p, gs?.dungeon);
    prevGsRef.current = snapshotPlayer(p, { floating });

    const msgToText = (m) => m?.text ?? m;
    const recentMsgs = msgsRef.current.slice(-12).map(msgToText);
    const lastMsg = recentMsgs[recentMsgs.length - 1] ?? "";
    const newCount = msgsRef.current.length - prevMsgCountRef.current;
    const newMsgs = newCount > 0
      ? msgsRef.current.slice(-newCount).map(msgToText)
      : [];
    prevMsgCountRef.current = msgsRef.current.length;
    const dashed = !!p._portraitDash;
    if (p._portraitDash) delete p._portraitDash;
    const event = resolvePortraitEvent({ player: p, prev, lastMsg, recentMsgs, newMsgs, floating, dashed });

    if (!event) return;

    const now = Date.now();

    /* 状態異常の維持：同じ holdKey なら立ち絵を差し替えない */
    if (event.holdKey) {
      if (heldStatusKeyRef.current !== event.holdKey) {
        heldStatusKeyRef.current = event.holdKey;
        setPortraitSrc(event.src);
        portraitCooldownRef.current = event.cooldownUntil ?? (now + PORTRAIT_COOLDOWN_MS);
      } else {
        /* クールダウンを延長し、歩行・被ダメが割り込みにくくする */
        portraitCooldownRef.current = Math.max(
          portraitCooldownRef.current,
          now + PORTRAIT_WALK_COOLDOWN_MS,
        );
      }
      return;
    }

    heldStatusKeyRef.current = null;

    if (event.src) {
      const canApply =
        event.force ||
        event.bypassCooldown ||
        now >= portraitCooldownRef.current;
      if (canApply) {
        setPortraitSrc(event.src);
        portraitCooldownRef.current = event.cooldownUntil ?? (now + PORTRAIT_COOLDOWN_MS);
      }
      return;
    }

    /* 低優先フォールバック：歩行・瀕死。クールダウン中は何もしない */
    const isLow = event.isLow;
    if (now < portraitCooldownRef.current) {
      if (isLow) return;
      return;
    }

    if (event.moved) {
      walkStepRef.current++;
      const threshold = PORTRAIT_WALK_STEPS_MIN + Math.floor(Math.random() * PORTRAIT_WALK_STEPS_JITTER);
      if (walkStepRef.current >= threshold) {
        walkStepRef.current = 0;
        if (tryPortrait("walk")) {
          portraitCooldownRef.current = now + PORTRAIT_WALK_COOLDOWN_MS;
        } else if (isLow) {
          forcePortrait("hp_low");
        }
      }
      return;
    }

    walkStepRef.current = 0;

    /* 立ち止まっているとき：装備に応じた待機立ち絵へ戻す（歩行・ダッシュの張り付き防止） */
    tryPortrait(idleStandKey(p));
  }, [gs, setPortraitSrc, tryPortrait, forcePortrait]);

  return { pauseDynamic, resumeDynamic };
}
