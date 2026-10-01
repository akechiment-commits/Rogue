import { useEffect, useRef } from "react";
import { soundForInterfaceKey } from "./soundRules.js";
import { triggerSE, unlockAudio } from "./soundEvents.js";

/** 拠点とゲーム内メニューのマウス・キーボード・ゲームパッドを同じ音へ接続する。 */
export function useInterfaceSounds(menuActive) {
  const activeRef = useRef(!!menuActive);
  activeRef.current = !!menuActive;
  const previousRef = useRef(!!menuActive);
  useEffect(() => {
    if (menuActive && !previousRef.current) triggerSE("select");
    previousRef.current = !!menuActive;
  }, [menuActive]);
  useEffect(() => {
    const onKey = event => {
      if (!activeRef.current || event.target?.closest?.("[data-audio-panel]")) return;
      const sound = soundForInterfaceKey(event);
      if (sound) { unlockAudio(); triggerSE(sound); }
    };
    const onClick = event => {
      const button = event.target?.closest?.("button");
      if (!activeRef.current || !button || button.disabled || button.closest("[data-audio-panel]")) return;
      unlockAudio();
      triggerSE(/閉じる|戻る|キャンセル|やめる/.test(button.textContent) ? "cancel" : "select");
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("click", onClick, true);
    };
  }, []);
}
