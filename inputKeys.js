/* ===== PCキーボード: 矢印キー ⇔ テンキー対応 =====
   モーダルやメニューの上下左右選択で矢印キーと同じ役割をテンキーにも持たせる。
   判定には e.key ではなく e.code（Numpad*）を併用すること（e.key は環境で "2" 等になる）。
   開発ルール: CLAUDE.md「キーボード操作」参照。 */

export function isKeyUp(e) {
  return e.key?.toLowerCase() === "arrowup" || e.code === "Numpad8";
}

export function isKeyDown(e) {
  return e.key?.toLowerCase() === "arrowdown" || e.code === "Numpad2";
}

export function isKeyLeft(e) {
  return e.key?.toLowerCase() === "arrowleft" || e.code === "Numpad4";
}

export function isKeyRight(e) {
  return e.key?.toLowerCase() === "arrowright" || e.code === "Numpad6";
}

/**
 * キーボード上部の数字キー（Digit1〜Digit9）のみを判定し、1〜9の数値を返す。
 * テンキー（Numpad1〜Numpad9）は移動・斜め移動用のため除外する。
 * @param {KeyboardEvent} e
 * @returns {number | null} 1〜9 の数値、または null
 */
export function getDigitNumber(e) {
  if (e?.code && /^Digit([1-9])$/.test(e.code)) {
    return Number(e.code.slice(5));
  }
  return null;
}
