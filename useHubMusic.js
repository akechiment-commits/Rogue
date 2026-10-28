import { useEffect } from "react";
import { updateHubBgm, unlockAudio, stopBgm } from "./soundEvents.js";

/** 拠点の初回表示・帰還と、ブラウザの音声許可を接続する。 */
export function useHubMusic() {
  useEffect(() => {
    updateHubBgm();
    const unlock = () => unlockAudio();
    const events = ["pointerdown", "click", "keydown"];
    for (const event of events) window.addEventListener(event, unlock, true);
    return () => {
      for (const event of events) window.removeEventListener(event, unlock, true);
      stopBgm();
    };
  }, []);
}
