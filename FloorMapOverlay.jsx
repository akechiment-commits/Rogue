import { buildFloorMap, FLOOR_MAP_MARKERS, FLOOR_MAP_TERRAIN } from "./floorMap.js";

const LEGEND_ORDER = ["player", "item", "enemy", "stairs", "trap", "spring", "bigbox", "pentacle", "statue", "vent", "portal", "oil", "bone"];

export function FloorMapOverlay({ dg, p, mobile, onClose }) {
  if (!dg || !p) return null;
  const map = buildFloorMap(dg, p);
  return (
    <div
      role="dialog"
      aria-label="フロアマップ"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: mobile ? 6 : 18,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          width: "min(96%, 900px)",
          maxHeight: "94%",
          overflowY: "auto",
          background: "rgba(8, 11, 20, 0.98)",
          border: "1px solid #4b6485",
          borderRadius: 8,
          boxShadow: "0 0 30px rgba(0,0,0,0.75)",
          padding: mobile ? "8px 8px 10px" : "12px 14px 14px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ color: "#9ed0ff", fontWeight: "bold", fontSize: mobile ? 15 : 18 }}>
            B{p.depth}F フロアマップ
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "#20283a", color: "#d8e8ff", border: "1px solid #526987", borderRadius: 4, minWidth: 34, height: 28, cursor: "pointer" }}
          >
            ×
          </button>
        </div>
        <div style={{ color: "#8994a8", fontSize: mobile ? 10 : 12, marginBottom: 8 }}>
          判明している地形と、現在見えている・識別済みのものを表示
        </div>
        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: `repeat(${map.width}, minmax(0, 1fr))`,
            border: "1px solid #253149",
            background: FLOOR_MAP_TERRAIN.unknown,
            gap: 1,
            padding: 2,
            boxSizing: "border-box",
          }}
        >
          {map.cells.map((cell) => {
            const marker = cell.marker ? FLOOR_MAP_MARKERS[cell.marker] : null;
            return (
              <div
                key={`${cell.x}-${cell.y}`}
                title={marker?.label || undefined}
                style={{
                  aspectRatio: "1",
                  minWidth: 0,
                  background: FLOOR_MAP_TERRAIN[cell.terrain],
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {marker && (
                  <span style={{ width: "72%", height: "72%", borderRadius: "50%", background: marker.color, boxShadow: `0 0 3px ${marker.color}`, display: "block" }} />
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: mobile ? "5px 9px" : "6px 12px", marginTop: 9, color: "#c3cada", fontSize: mobile ? 10 : 12 }}>
          <span><i style={{ display: "inline-block", width: 10, height: 10, background: FLOOR_MAP_TERRAIN.wall, marginRight: 3 }} />壁</span>
          <span><i style={{ display: "inline-block", width: 10, height: 10, background: FLOOR_MAP_TERRAIN.floor, marginRight: 3 }} />床</span>
          {LEGEND_ORDER.map((key) => {
            const marker = FLOOR_MAP_MARKERS[key];
            return <span key={key}><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: marker.color, marginRight: 3 }} />{marker.label}</span>;
          })}
        </div>
        <div style={{ color: "#8994a8", fontSize: mobile ? 10 : 12, textAlign: "center", marginTop: 9 }}>
          スペース／X／Esc、または「地図」ボタンで閉じる
        </div>
      </div>
    </div>
  );
}
