import { QUICK_MENU_ITEMS } from "./gamepadInput.js";

export const QUICK_MENU_COLS = 2;

/**
 * Yボタン/モバイル「メニュー」のクイックメニュー（2列グリッド、方向で選択、B/タップで決定）
 */
export function GamepadQuickMenu({ open, sel = 0, items = QUICK_MENU_ITEMS, onSelect, onClose }) {
  if (!open) return null;
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        zIndex: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#111",
          border: "1px solid #333",
          borderRadius: 8,
          width: 360,
          maxWidth: "92vw",
          padding: "14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>クイックメニュー</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#666", fontSize: 11 }}>決定 / 閉じる</span>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="メニューを閉じる"
                style={{
                  background: "#222",
                  color: "#aaa",
                  border: "1px solid #444",
                  borderRadius: 4,
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: "1.2",
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
          }}
        >
          {items.map((it, i) => {
            const active = i === sel;
            return (
              <div
                key={it.id}
                onClick={() => onSelect?.(it.id)}
                style={{
                  padding: "10px 8px",
                  borderRadius: 4,
                  background: active ? "#1a3a2a" : "#151515",
                  border: active ? "1px solid #3a7a5a" : "1px solid #2a2a2a",
                  color: active ? "#8f8" : "#bbb",
                  fontSize: 13,
                  fontWeight: active ? "bold" : "normal",
                  textAlign: "center",
                  cursor: "pointer",
                  touchAction: "manipulation",
                  userSelect: "none",
                }}
              >
                {it.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** LT押し中のショートカット説明 */
export function GamepadLtHint({ show }) {
  if (!show) return null;
  const rows = [
    ["LT + A", "足元"],
    ["LT + B", "罠探る"],
    ["LT + X", "見渡す"],
    ["LT + Y", "履歴"],
  ];
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 28,
        transform: "translateX(-50%)",
        zIndex: 230,
        background: "rgba(10,10,18,0.92)",
        border: "1px solid #3a3a5a",
        borderRadius: 8,
        padding: "10px 14px",
        color: "#dde",
        fontSize: 13,
        boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
        pointerEvents: "none",
      }}
    >
      <div style={{ color: "#8af", fontWeight: "bold", marginBottom: 6, textAlign: "center" }}>LTショートカット</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 16px" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <span style={{ color: "#aaa" }}>{k}</span>
            <span style={{ color: "#efe" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
