/**
 * 探索の実時間計測。
 * - タブ前面かつプレイ中のみ加算
 * - 別タブ／最小化では停止
 * - freeze() で確定（死亡・クリア後は止まったまま）
 * - ゲーム状態の再描画とは独立して、1冒険につき1本だけ動かす
 */

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isDocumentVisible() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

/**
 * @param {number} [initialMs=0] 中断セーブから復元する累積ms
 */
export function createRunTimer(initialMs = 0) {
  let accumulated = Math.max(0, Number(initialMs) || 0);
  let segmentStart = null;
  let running = false;
  let frozen = false;

  function flush() {
    if (!running || segmentStart == null) return;
    accumulated += nowMs() - segmentStart;
    segmentStart = null;
    running = false;
  }

  function start() {
    if (frozen || running) return;
    if (!isDocumentVisible()) return;
    running = true;
    segmentStart = nowMs();
  }

  function pause() {
    flush();
  }

  function onVisibilityChange() {
    if (frozen) return;
    if (isDocumentVisible()) start();
    else pause();
  }

  /** 結果確定。以降は加算しない */
  function freeze() {
    flush();
    frozen = true;
  }

  function getElapsedMs() {
    if (running && segmentStart != null) {
      return Math.floor(accumulated + (nowMs() - segmentStart));
    }
    return Math.floor(accumulated);
  }

  /**
   * visibility リスナを張り、計測開始。
   * @returns {() => void} cleanup
   */
  function attach() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    start();
    return () => {
      pause();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }

  return {
    start,
    pause,
    freeze,
    getElapsedMs,
    attach,
    isFrozen: () => frozen,
    isRunning: () => running,
  };
}
