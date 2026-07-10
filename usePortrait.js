import { useCallback, useEffect, useRef } from "react";
import { isPlayerFloating } from "./items.js";
import {
  PORTRAIT_COOLDOWN_MS,
  pickPortrait,
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
    setPortraitSrc(pickPortrait(key));
    portraitCooldownRef.current = Date.now() + PORTRAIT_COOLDOWN_MS;
  }, [setPortraitSrc]);

  const forcePortrait = useCallback((key) => {
    if (!dynamicEnabledRef.current) return;
    pickAndSet(key);
  }, [pickAndSet]);

  const tryPortrait = useCallback((key) => {
    if (!dynamicEnabledRef.current) return false;
    const now = Date.now();
    if (now < portraitCooldownRef.current) return false;
    pickAndSet(key);
    return true;
  }, [pickAndSet]);

  const pauseDynamic = useCallback(() => {
    dynamicEnabledRef.current = false;
  }, []);

  const resumeDynamic = useCallback(() => {
    dynamicEnabledRef.current = true;
    portraitCooldownRef.current = 0;
    if (gs?.player) {
      setPortraitSrc(pickPortrait(
        gs.player.hp / gs.player.maxHp <= 0.25 ? "hp_low" : "hp_full",
      ));
    }
  }, [gs, setPortraitSrc]);

  useEffect(() => {
    if (bigboxMode) tryPortrait("act_chest");
  }, [bigboxMode, tryPortrait]);

  useEffect(() => {
    if (putMode) tryPortrait("act_pot");
  }, [putMode, tryPortrait]);

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
    const event = resolvePortraitEvent({ player: p, prev, lastMsg, recentMsgs, newMsgs, floating });

    if (!event) return;

    if (event.src) {
      if (event.force || Date.now() >= portraitCooldownRef.current) {
        setPortraitSrc(event.src);
        portraitCooldownRef.current = event.cooldownUntil;
      }
      return;
    }

    const isLow = event.isLow;
    if (event.moved) {
      walkStepRef.current++;
      const threshold = 3 + Math.floor(Math.random() * 3);
      if (walkStepRef.current >= threshold) {
        walkStepRef.current = 0;
        if (!tryPortrait("walk") && isLow) forcePortrait("hp_low");
      } else if (isLow) {
        tryPortrait("hp_low");
      }
      return;
    }

    if (isLow && Date.now() >= portraitCooldownRef.current) {
      forcePortrait("hp_low");
    }
  }, [gs, setPortraitSrc, tryPortrait, forcePortrait]);

  return { pauseDynamic, resumeDynamic };
}