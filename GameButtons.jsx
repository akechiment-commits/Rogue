import { useRef, useEffect, useCallback } from "react";

/* 長押しリピート対応モバイルボタン
 * 初回押下即時発火 → REPEAT_DELAY ms 後からリピート開始 → REPEAT_INTERVAL ms 間隔で連続発火
 * ※コンポーネント外で定義することで、ゲーム状態更新時のアンマウントを防ぎタイマーを維持する */
const REPEAT_DELAY = 350;
const REPEAT_INTERVAL = 110;
export function MobileBtn({ label, sub, onClick, w, h, fs, color, style: s = {} }) {
  const timers = useRef({ delay: null, interval: null });
  const cbRef  = useRef(onClick);
  cbRef.current = onClick;
  const stop = useCallback(() => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.interval);
    timers.current.delay = timers.current.interval = null;
  }, []);
  /* アンマウント時にタイマーをクリア（画面遷移でリピートが残る問題の防止） */
  useEffect(() => stop, [stop]);
  const start = (e) => {
    e.preventDefault();
    cbRef.current();
    timers.current.delay = setTimeout(() => {
      timers.current.interval = setInterval(() => cbRef.current(), REPEAT_INTERVAL);
    }, REPEAT_DELAY);
  };
  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      style={{
        width: w, height: h,
        background: "#181828", color: color ?? "#8f8",
        border: "1px solid #3a3a4a", borderRadius: 8,
        fontSize: fs ?? 15, fontWeight: "bold",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        cursor: "pointer", touchAction: "manipulation",
        userSelect: "none", WebkitTapHighlightColor: "transparent",
        padding: sub ? "2px 3px" : undefined,
        ...s,
      }}
    >
      {sub ? <><span style={{ fontSize: 17 }}>{label}</span><span style={{ fontSize: 9, opacity: 0.5 }}>{sub}</span></> : label}
    </button>
  );
}
export function B({ label, onClick, w = 52, h = 52, fs = 18, style: s = {} }) {
  return <MobileBtn label={label} onClick={onClick} w={w} h={h} fs={fs} style={s} />;
}
export function AB({ label, sub, onClick, color = "#8f8", small }) {
  return <MobileBtn label={label} sub={sub} onClick={onClick} color={color}
    style={{ flex: 1, minWidth: small ? 36 : 44, height: small ? 40 : 48, fontSize: small ? 13 : 15 }} />;
}
const TBS = { background: "#2a1a1a", border: "1px solid #5a3a3a", color: "#f88" };
const DBS = { background: "#1a1a2a", border: "1px solid #4a3a6a", color: "#c8f" };
export function DPad({ onClick, throwMode, dashMode, facingMode, setFacingMode, setThrowMode, setDashMode, setMsgs }) {
  const ds = throwMode ? TBS : dashMode ? DBS : {};
  const fs = facingMode ? { background: "#2a2a0a", border: "1px solid #aa0" } : ds;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <div style={{ display: "flex", gap: 2 }}>
        <B label="↖" onClick={() => onClick(-1, -1)} style={fs} />
        <B label="↑"  onClick={() => onClick(0, -1)} style={fs} />
        <B label="↗" onClick={() => onClick(1, -1)}  style={fs} />
      </div>
      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
        <B label="←" onClick={() => onClick(-1, 0)} style={fs} />
        <B
          label={facingMode ? "✕" : throwMode ? "✕" : dashMode ? "⇒" : "向"}
          fs={facingMode || throwMode || dashMode ? 18 : 13}
          onClick={() => {
            if (facingMode) { setFacingMode(false); }
            else if (throwMode) { setThrowMode(null); setMsgs(prev => [...prev.slice(-80), "やめた。"]); }
            else if (dashMode) { setDashMode(false); }
            else { setFacingMode(f => !f); }
          }}
          style={
            facingMode ? { background: "#2a2a0a", border: "1px solid #aa0", color: "#ff4" }
            : throwMode ? { background: "#1a1a1a", border: "1px solid #555", color: "#888" }
            : dashMode  ? { background: "#1a1a2a", border: "1px solid #4a3a6a", color: "#c8f" }
            : { opacity: 0.7 }
          }
        />
        <B label="→" onClick={() => onClick(1, 0)} style={fs} />
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        <B label="↙" onClick={() => onClick(-1, 1)} style={fs} />
        <B label="↓"  onClick={() => onClick(0, 1)} style={fs} />
        <B label="↘" onClick={() => onClick(1, 1)}  style={fs} />
      </div>
    </div>
  );
}
