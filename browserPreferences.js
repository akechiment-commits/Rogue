/** 設定を保存できないブラウザでも、初期値でゲームを続行する。 */
export function readPreference(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function writePreference(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch { return false; }
}
