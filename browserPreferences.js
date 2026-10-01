/** 設定を保存できないブラウザでも、初期値でゲームを続行する。 */
export const DESKTOP_VW_OPTIONS = [
  { value: 21, label: "特大" },
  { value: 25, label: "大" },
  { value: 27, label: "中" },
  { value: 33, label: "小" },
];

export function readDesktopViewportWidth() {
  const value = Number(readPreference("roguelike_desktop_vw", "25"));
  return DESKTOP_VW_OPTIONS.some(option => option.value === value) ? value : 25;
}

export function readPreference(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function writePreference(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch { return false; }
}
