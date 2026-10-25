import { useEffect, useRef } from "react";
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
        <div style={{ color: "#777", fontSize: 11, textAlign: "right" }}>十字 / 左スティック:選択　B:決定　A/Y:閉じる</div>
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

const CONTROL_SECTIONS = [
  {
    title: "移動・戦闘",
    rows: [
      ["十字キー / 左スティック", "移動。押し続けると一定間隔で連続移動"],
      ["A 短押し", "アイテム欄を開く / メニューを戻る"],
      ["Aを押しながら方向", "ダッシュ"],
      ["B", "攻撃・アクション / メニュー決定"],
      ["X + 方向", "向きだけ変更（移動しない）"],
      ["X 短押し", "隣接する敵へ向きを切り替え"],
      ["LB + 方向", "その方向へ矢を射る"],
      ["LB", "向いている方向へ矢を射る"],
      ["RB + 斜め方向", "斜め移動だけに固定"],
      ["A + B 長押し", "足踏み。敵が近づくと自動停止"],
    ],
  },
  {
    title: "便利操作",
    rows: [
      ["LT + A", "足元の道具・階段などを操作"],
      ["LT + B", "罠を探る"],
      ["LT + X", "見渡す"],
      ["LT + Y", "冒険ログ"],
      ["RT + 方向", "便利ダッシュ。道具や出口まで進む"],
      ["右スティック", "見渡す / 見渡し中にカーソル移動"],
      ["Select", "マップ"],
      ["Start", "登録アイテムを使う"],
      ["Y", "クイックメニューを開く"],
    ],
  },
  {
    title: "画面ごとの操作",
    rows: [
      ["メニュー全般", "十字/左スティックで選択、Bで決定、Aで戻る"],
      ["クイックメニュー", "Yで開く。十字/左スティックで選択、Bで実行、A/Yで閉じる"],
      ["アイテム欄のX", "所持品を整頓"],
      ["アイテム欄のY", "置くモードを切替。赤い表示中に所持品を選ぶと足元へ置く"],
      ["拠点・ダンジョン選択", "十字/左スティックで選択、B/Startで決定、Aで戻る"],
      ["拠点のLB / Select", "持参品と倉庫のタブを切替"],
      ["拠点のY", "ページ送り"],
    ],
  },
];

/** Yクイックメニューから開く、ゲームパッド操作の一覧。 */
export function GamepadControlsGuide({ open, onClose }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div
      onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 240, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 12, boxSizing: "border-box", background: "rgba(0,0,0,0.82)" }}
    >
      <div
        data-gamepad-controls-guide
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="コントローラー操作ガイド"
        tabIndex={0}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") { event.preventDefault(); onClose?.(); }
        }}
        style={{ width: 680, maxWidth: "96vw", maxHeight: "88dvh", overflowY: "auto", outline: "none",
          background: "#10101b", border: "1px solid #56617c", borderRadius: 9, padding: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.75)", color: "#dde5f5" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ color: "#9cc8ff", fontSize: 19, fontWeight: "bold" }}>コントローラー操作ガイド</div>
            <div style={{ color: "#78839b", fontSize: 11, marginTop: 2 }}>Yメニュー → 操作ガイド（標準配列 / Xbox表記）</div>
          </div>
          <button onClick={onClose} style={{ background: "#242432", color: "#ddd", border: "1px solid #4b4b60",
            borderRadius: 4, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>閉じる</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 9 }}>
          {CONTROL_SECTIONS.map((section) => (
            <section key={section.title} style={{ background: "#151522", border: "1px solid #303044", borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ color: "#f4c975", fontWeight: "bold", fontSize: 13, borderBottom: "1px solid #343044", paddingBottom: 5, marginBottom: 5 }}>
                {section.title}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(92px, auto) 1fr", gap: "4px 9px", fontSize: 11, lineHeight: 1.45 }}>
                {section.rows.map(([button, action]) => (
                  <div key={button} style={{ display: "contents" }}>
                    <span style={{ color: "#b5c9ee", fontWeight: "bold" }}>{button}</span>
                    <span style={{ color: "#bec2cf" }}>{action}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div style={{ color: "#71798c", textAlign: "center", fontSize: 11, marginTop: 10 }}>
          十字キー / 左スティック:スクロール　A・B・X・Y:閉じる
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
