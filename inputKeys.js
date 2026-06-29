/* ===== PCキーボード: 矢印キー ⇔ テンキー対応 =====
   モーダルやメニューの上下左右選択で矢印キーと同じ役割をテンキーにも持たせる。
   判定には e.key ではなく e.code（Numpad*）を併用すること（e.key は環境で "2" 等になる）。
   開発ルール: CLAUDE.md「キーボード操作」参照。 */

export function isKeyUp(e) {
  const k = e.key?.toLowerCase();
  return k === "arrowup" || k === "h" || e.code === "Numpad8";
}

export function isKeyDown(e) {
  const k = e.key?.toLowerCase();
  return k === "arrowdown" || k === "l" || e.code === "Numpad2";
}

export function isKeyLeft(e) {
  const k = e.key?.toLowerCase();
  return k === "arrowleft" || k === "h" || e.code === "Numpad4";
}

export function isKeyRight(e) {
  const k = e.key?.toLowerCase();
  return k === "arrowright" || k === "l" || e.code === "Numpad6";
}