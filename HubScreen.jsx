import { useState, useMemo } from "react";
import { uid, sortWarehouseItems } from "./utils.js";
import { clearSave } from "./SaveData.js";
import { hasGameSave } from "./GameSave.js";
import { itemPrice, ITEMS, WANDS, POTS, RINGS, TRAPS, BB_TYPES, WEAPON_ABILITIES, ARMOR_ABILITIES } from "./items.js";

/* ===== 拠点ショップのアイテムプール ===== */
const SHOP_POOL = [
  ...ITEMS.filter(it => it.type !== "gold"),
  ...WANDS,
  ...POTS,
  ...RINGS,
];

/* ===== 共通スタイル ===== */
const BG   = "#09090f";
const CARD = "#111118";
const BDR  = "#2a2a3a";
const TXT  = "#ccc";
const GOLD = "#f0c040";
const BTN  = { fontFamily:"monospace", cursor:"pointer", borderRadius:5, border:`1px solid ${BDR}`, fontSize:13 };

const Btn = ({ label, onClick, color="#8cf", style={} }) => (
  <button
    onClick={onClick}
    style={{ ...BTN, padding:"10px 18px", background:CARD, color, ...style }}
  >
    {label}
  </button>
);

/* ===== PANEL COMPONENT ===== */
function Panel({ title, onClose, children, wide }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.88)",
      display:"flex", alignItems:"flex-start", justifyContent:"center",
      paddingTop:"max(24px, env(safe-area-inset-top, 24px))",
      paddingBottom:16, overflowY:"auto", zIndex:50,
    }}>
      <div style={{
        background:CARD, border:`1px solid ${BDR}`, borderRadius:8,
        width: wide ? "min(680px,96vw)" : "min(420px,96vw)",
        maxHeight:"calc(100dvh - max(40px, env(safe-area-inset-top, 40px)) - 16px)",
        overflow:"auto", padding:0, display:"flex", flexDirection:"column",
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:`1px solid ${BDR}` }}>
          <span style={{ color:"#fff", fontWeight:"bold", fontSize:15 }}>{title}</span>
          <button onClick={onClose} style={{ ...BTN, padding:"2px 10px", color:"#888", fontSize:13 }}>✕</button>
        </div>
        <div style={{ padding:14, flex:1, overflow:"auto" }}>{children}</div>
      </div>
    </div>
  );
}

/* ===== 地上アイテムのラベル（地上では常に正体判明） ===== */
function hubItemLabel(it) {
  if (!it) return "";
  const bc = it.blessed ? "【祝】" : it.cursed ? "【呪】" : "";
  let s = it.name;
  if (it.type === "arrow") {
    s += ` (${it.count}${(it.stone || it.magicStone) ? "個" : "本"})`;
  } else if (it.type === "weapon") {
    if (it.plus) s += (it.plus > 0 ? "+" : "") + it.plus;
    s += ` (攻+${it.atk + (it.plus || 0)})`;
    const ids = [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])])];
    const names = ids.map(id => WEAPON_ABILITIES.find(a => a.id === id)?.name).filter(Boolean);
    if (names.length) s += ` [${names.join("・")}]`;
  } else if (it.type === "armor") {
    if (it.plus) s += (it.plus > 0 ? "+" : "") + it.plus;
    s += ` (防+${it.def + (it.plus || 0)})`;
    const ids = [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])])];
    const names = ids.map(id => ARMOR_ABILITIES.find(a => a.id === id)?.name).filter(Boolean);
    if (names.length) s += ` [${names.join("・")}]`;
  } else if ((it.type === "wand" || it.type === "pen" || it.type === "marker") && it.charges != null) {
    s += ` [${it.charges}回]`;
  } else if (it.type === "pot") {
    s += ` [${it.contents?.length || 0}/${it.capacity}]`;
  } else if (it.type === "ring" && ["power_ring","defense_ring","life_ring"].includes(it.effect)) {
    s += `+${it.plus || 0}`;
  } else if (it.type === "potion" && it.effect === "heal") {
    s += ` (HP+${it.value})`;
  }
  return bc + s;
}

/* ===== 荷物管理パネル（持参インベントリ ＋ 倉庫） ===== */
function ItemManagementPanel({ saveData, updateSave, onClose }) {
  const [tab, setTab] = useState("carry"); // "carry" | "warehouse"
  const [selIdx, setSelIdx] = useState(null);
  const [showDescIdx, setShowDescIdx] = useState(null);

  const hubInv = saveData.hubInventory || [];
  const wh     = saveData.warehouse    || [];
  const MAX    = saveData.warehouseMax || 100;
  const gold   = saveData.hubGold      || 0;
  const EXPAND_COST = 500;

  const isCarry = tab === "carry";
  const list    = isCarry ? hubInv : wh;

  const tabStyle = (t) => ({
    ...BTN, padding:"6px 16px",
    background: tab === t ? "#1a1a30" : CARD,
    color:      tab === t ? "#8af"    : "#666",
    borderColor:tab === t ? "#44f"    : BDR,
    fontSize: 13,
  });

  const select = (idx) => {
    setSelIdx(selIdx === idx ? null : idx);
    setShowDescIdx(null);
  };

  const moveToWarehouse = (idx) => {
    if (wh.length >= MAX) return;
    updateSave(prev => {
      const inv  = prev.hubInventory || [];
      const item = inv[idx];
      if (!item) return prev;
      return {
        ...prev,
        hubInventory: inv.filter((_, i) => i !== idx),
        warehouse: sortWarehouseItems(
          [...(prev.warehouse || []), { ...item }].slice(0, prev.warehouseMax || 100)
        ),
      };
    });
    setSelIdx(null); setShowDescIdx(null);
  };

  const moveToCarry = (idx) => {
    updateSave(prev => {
      const warehouse = prev.warehouse || [];
      const item      = warehouse[idx];
      if (!item) return prev;
      return {
        ...prev,
        warehouse:    warehouse.filter((_, i) => i !== idx),
        hubInventory: [...(prev.hubInventory || []), { ...item }],
      };
    });
    setSelIdx(null); setShowDescIdx(null);
  };

  const sellFromWarehouse = (idx) => {
    updateSave(prev => {
      const warehouse = prev.warehouse || [];
      const item      = warehouse[idx];
      if (!item) return prev;
      const price = Math.max(1, Math.floor(itemPrice(item) / 2));
      return {
        ...prev,
        warehouse: warehouse.filter((_, i) => i !== idx),
        hubGold:   (prev.hubGold || 0) + price,
      };
    });
    setSelIdx(null); setShowDescIdx(null);
  };

  const expandWarehouse = () => {
    if (gold < EXPAND_COST) return;
    updateSave(prev => ({
      ...prev,
      hubGold:      (prev.hubGold      || 0)   - EXPAND_COST,
      warehouseMax: (prev.warehouseMax || 100) + 50,
    }));
  };

  return (
    <Panel title="荷物管理" onClose={onClose} wide>
      {/* 所持金 */}
      <div style={{ color:GOLD, fontSize:13, marginBottom:10 }}>
        所持G: <strong>{gold}G</strong>
      </div>

      {/* タブ */}
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        <button onClick={() => { setTab("carry"); setSelIdx(null); setShowDescIdx(null); }} style={tabStyle("carry")}>
          持参アイテム ({hubInv.length})
        </button>
        <button onClick={() => { setTab("warehouse"); setSelIdx(null); setShowDescIdx(null); }} style={tabStyle("warehouse")}>
          倉庫 ({wh.length}/{MAX})
        </button>
      </div>

      {/* 倉庫タブのみ：拡張ボタン */}
      {!isCarry && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          marginBottom:10, padding:"6px 8px", background:"#0d0d18", borderRadius:4, border:`1px solid ${BDR}` }}>
          <span style={{ color:"#888", fontSize:12 }}>倉庫を拡張 +50スロット</span>
          <button
            onClick={expandWarehouse}
            disabled={gold < EXPAND_COST}
            style={{ ...BTN, padding:"4px 12px", fontSize:12,
              color:       gold >= EXPAND_COST ? GOLD  : "#555",
              background:  "#0a1800",
              borderColor: gold >= EXPAND_COST ? "#3a2a00" : "#222" }}
          >
            {EXPAND_COST}G
          </button>
        </div>
      )}

      {/* ヒント */}
      <div style={{ color:"#555", fontSize:11, marginBottom:8 }}>
        {isCarry
          ? "ダンジョンに持っていくアイテム（インベントリ上限は30枠）"
          : "倉庫のアイテム。タップして操作できます。"}
      </div>

      {/* アイテムリスト */}
      {list.length === 0 ? (
        <div style={{ color:"#555", textAlign:"center", padding:"24px 0", fontSize:13, whiteSpace:"pre-wrap" }}>
          {isCarry
            ? "持参するアイテムがありません。\n「倉庫」タブから「持参する」で追加できます。"
            : "倉庫は空です。"}
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
          {list.map((item, idx) => {
            const isSel        = selIdx === idx;
            const isDescShow   = showDescIdx === idx;
            const sellPrice    = Math.max(1, Math.floor(itemPrice(item) / 2));
            const label        = hubItemLabel(item);
            const itemColor    = item.blessed ? "#ffd060" : item.cursed ? "#cc88ff" : TXT;

            return (
              <div key={idx}>
                {/* アイテム行 */}
                <div
                  onClick={() => select(idx)}
                  style={{
                    display:"flex", alignItems:"center", gap:8, padding:"7px 8px",
                    background:  isSel ? "#1a1a30" : "#0d0d18",
                    border:      `1px solid ${isSel ? "#44f" : "#222"}`,
                    borderRadius: isSel ? "4px 4px 0 0" : 4,
                    cursor:"pointer",
                  }}
                >
                  <span style={{ flex:1, color:itemColor, fontSize:13 }}>{label}</span>
                  <span style={{ color:"#555", fontSize:11 }}>{isSel ? "▲" : "▼"}</span>
                </div>

                {/* 選択時：操作エリア */}
                {isSel && (
                  <div style={{ padding:"6px 8px 8px", background:"#0d0d18",
                    border:"1px solid #222", borderTop:"none", borderRadius:"0 0 4px 4px" }}>

                    {/* 壺の中身 */}
                    {item.type === "pot" && (
                      <div style={{ color:"#ca8", fontSize:12, marginBottom:6 }}>
                        {item.contents?.length > 0
                          ? `中身: ${item.contents.map(c => c.name).join(", ")}`
                          : "中身: （空）"}
                      </div>
                    )}

                    {/* 操作ボタン */}
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                      {isCarry ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveToWarehouse(idx); }}
                          disabled={wh.length >= MAX}
                          style={{ ...BTN, padding:"4px 10px", fontSize:12, background:"#0d0d18",
                            color: wh.length >= MAX ? "#555" : "#aaa",
                            opacity: wh.length >= MAX ? 0.4 : 1 }}
                        >
                          → 倉庫へ戻す
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); moveToCarry(idx); }}
                            style={{ ...BTN, padding:"4px 10px", fontSize:12, background:"#081828", color:"#8cf" }}
                          >
                            ← 持参する
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); sellFromWarehouse(idx); }}
                            style={{ ...BTN, padding:"4px 10px", fontSize:12, background:"#0a1800", color:GOLD }}
                          >
                            売る ({sellPrice}G)
                          </button>
                        </>
                      )}
                      {item.desc && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowDescIdx(isDescShow ? null : idx); }}
                          style={{ ...BTN, padding:"4px 10px", fontSize:12, background:"#0d0d18",
                            color:       isDescShow ? "#8af" : "#666",
                            borderColor: isDescShow ? "#44f" : BDR }}
                        >
                          説明
                        </button>
                      )}
                    </div>

                    {/* 説明文 */}
                    {isDescShow && item.desc && (
                      <div style={{
                        background:"#18182a", border:"1px solid #3a3a5a", borderRadius:4,
                        padding:"6px 8px", color:"#aab", fontSize:12, lineHeight:"1.5em",
                        marginTop:2, whiteSpace:"pre-wrap",
                      }}>
                        {item.desc}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ===== 図鑑パネル ===== */
function EncyclopediaPanel({ saveData, onClose }) {
  const [tab, setTab] = useState("items");
  const [selKey, setSelKey] = useState(null);
  const disc = saveData.discovered || {};

  const tabStyle = (t) => ({
    ...BTN, padding:"6px 16px",
    background: tab === t ? "#1a1a30" : CARD,
    color:      tab === t ? "#8af"    : "#666",
    borderColor:tab === t ? "#44f"    : BDR,
  });

  const _allItems = useMemo(() => [...ITEMS, ...WANDS, ...POTS, ...RINGS], []);
  const lookupDesc = (key, tabName) => {
    if (tabName === "traps") {
      const t = TRAPS.find(t => t.effect === key || t.name === key);
      return t?.desc || null;
    }
    if (tabName === "bigboxes") {
      const b = BB_TYPES.find(b => b.kind === key);
      return b?.desc || null;
    }
    if (tabName === "items") {
      const it = _allItems.find(it => (it.effect || (it.type + '_' + it.name)) === key);
      return it?.desc || null;
    }
    return null;
  };

  const renderList = (entries, tabName) => {
    const items = Object.values(entries);
    if (items.length === 0)
      return <div style={{ color:"#555", padding:"20px 0", textAlign:"center" }}>まだ発見がありません。</div>;
    const sorted = items.sort((a,b) => a.name.localeCompare(b.name, "ja"));
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
        {sorted.map((e, i) => {
          const key  = Object.keys(entries).find(k => entries[k] === e);
          const isSel = selKey === key;
          const desc  = isSel ? lookupDesc(key, tabName) : null;
          return (
            <div key={i} onClick={() => setSelKey(isSel ? null : key)}
              style={{ padding:"5px 8px", background: isSel ? "#141428" : "#0d0d18",
                borderRadius:3, color:TXT, cursor:"pointer",
                border: isSel ? "1px solid #44f" : "1px solid transparent" }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span>{e.name}</span>
                <span style={{ color:"#555" }}>{e.count}回</span>
              </div>
              {isSel && desc && (
                <div style={{ color:"#8899aa", fontSize:12, marginTop:4, whiteSpace:"pre-wrap", lineHeight:"1.5em" }}>
                  {desc}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Panel title="図鑑" onClose={onClose} wide>
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        <button onClick={() => { setTab("items");    setSelKey(null); }} style={tabStyle("items")}>アイテム</button>
        <button onClick={() => { setTab("monsters"); setSelKey(null); }} style={tabStyle("monsters")}>モンスター</button>
        <button onClick={() => { setTab("traps");    setSelKey(null); }} style={tabStyle("traps")}>罠</button>
        <button onClick={() => { setTab("bigboxes"); setSelKey(null); }} style={tabStyle("bigboxes")}>大箱</button>
      </div>
      <div style={{ color:"#555", fontSize:11, marginBottom:8 }}>
        {tab === "items"    && `発見アイテム: ${Object.keys(disc.items    || {}).length}種`}
        {tab === "monsters" && `遭遇モンスター: ${Object.keys(disc.monsters || {}).length}種`}
        {tab === "traps"    && `踏んだ罠: ${Object.keys(disc.traps    || {}).length}種`}
        {tab === "bigboxes" && `識別済み大箱: ${Object.keys(disc.bigboxes || {}).length}種`}
      </div>
      {tab === "items"    && renderList(disc.items    || {}, "items")}
      {tab === "monsters" && renderList(disc.monsters || {}, "monsters")}
      {tab === "traps"    && renderList(disc.traps    || {}, "traps")}
      {tab === "bigboxes" && renderList(disc.bigboxes || {}, "bigboxes")}
    </Panel>
  );
}

/* ===== 拠点ショップパネル ===== */
function HubShopPanel({ saveData, updateSave, onClose }) {
  const [selected, setSelected] = useState(null);
  const gold = saveData.hubGold || 0;

  const shopItems = useMemo(() => {
    const pool = [...SHOP_POOL];
    const result = [];
    while (result.length < 8 && pool.length > 0) {
      const total = pool.reduce((s, x) => s + (x.weight ?? 1), 0);
      let r = Math.random() * total;
      let idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= (pool[i].weight ?? 1);
        if (r <= 0) { idx = i; break; }
      }
      const picked = pool[idx];
      const _plusRings = new Set(["power_ring","defense_ring","life_ring"]);
      const entry = (picked.type === "ring" && _plusRings.has(picked.effect))
        ? { ...picked, plus: Math.floor(Math.random() * 3) + 1 }
        : picked;
      result.push(entry);
      pool.splice(idx, 1);
    }
    return result;
  }, []);

  const buy = (item) => {
    const price = itemPrice(item);
    if (gold < price) return;
    updateSave(prev => ({
      ...prev,
      hubGold:   prev.hubGold - price,
      warehouse: sortWarehouseItems(
        [...(prev.warehouse || []), { ...item, id: uid() }].slice(0, prev.warehouseMax || 100)
      ),
    }));
  };

  return (
    <Panel title="拠点ショップ" onClose={onClose} wide>
      <div style={{ color:GOLD, marginBottom:10, fontSize:14 }}>
        所持G: <strong>{gold}G</strong>
        <span style={{ color:"#555", fontSize:11, marginLeft:10 }}>購入品は倉庫に追加されます</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {shopItems.map((item, i) => {
          const price  = itemPrice(item);
          const canBuy = gold >= price;
          const isSel  = selected === i;
          return (
            <div key={i} onClick={() => setSelected(i === selected ? null : i)}
              style={{
                display:"flex", alignItems:"center", gap:10, padding:"7px 10px",
                background: isSel ? "#141428" : "#0d0d18",
                border: `1px solid ${isSel ? "#44f" : "#222"}`,
                borderRadius:4, cursor:"pointer",
              }}
            >
              <span style={{ color: canBuy ? TXT : "#444", flex:1 }}>
                {item.name}{item.plus ? `+${item.plus}` : ""}
                <span style={{ color:"#555", fontSize:11, marginLeft:6 }}>{item.desc}</span>
              </span>
              <span style={{ color: canBuy ? GOLD : "#444", minWidth:50, textAlign:"right" }}>
                {price}G
              </span>
              {isSel && (
                <button
                  onClick={e => { e.stopPropagation(); buy(item); }}
                  disabled={!canBuy}
                  style={{ ...BTN, padding:"4px 12px", color: canBuy ? "#0f0" : "#444",
                    background: canBuy ? "#0a1a0a" : "#111", borderColor: canBuy ? "#2a4a2a" : "#222" }}
                >
                  購入
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ===== ダンジョン入口パネル ===== */
function DungeonEntrancePanel({ onClose, onStart, saveData }) {
  const [startDepth, setStartDepth] = useState(1);
  const hubInv   = saveData.hubInventory || [];
  const bestDepth = saveData.bestDepth || 0;

  const DUNGEON_TYPES = [
    { id:"beginner",     label:"初心者ダンジョン",   desc:"全10階",                                    color:"#8cf", maxFloors:10  },
    { id:"intermediate", label:"中級者ダンジョン",   desc:"全20階",                                    color:"#fc8", maxFloors:20  },
    { id:"advanced",     label:"上級者ダンジョン",   desc:"全30階",                                    color:"#f88", maxFloors:30  },
    { id:"legend",       label:"超上級者ダンジョン", desc:"全50階・超難度。深淵の禁書を持ち帰れ",      color:"#c84fff", maxFloors:50 },
    { id:"debug",        label:"デバッグダンジョン", desc:"全アイテム・全モンスター配置（テスト用）", color:"#fa0", maxFloors:null },
  ];
  const [dtype, setDtype] = useState("beginner");
  const currentType = DUNGEON_TYPES.find(dt => dt.id === dtype);
  const isDebug  = dtype === "debug";
  const maxStart = isDebug ? 1 : Math.min(Math.max(1, bestDepth), currentType.maxFloors);

  const handleStart = () => {
    onStart({
      dungeonType: dtype,
      startDepth:  isDebug ? 1 : startDepth,
      maxFloors:   currentType.maxFloors,
      startGold:   0,
      startInventory: hubInv,
    });
  };

  return (
    <Panel title="ダンジョン入口" onClose={onClose}>
      {/* ダンジョン種別 */}
      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14 }}>
        {DUNGEON_TYPES.map(dt => (
          <div key={dt.id} onClick={() => setDtype(dt.id)}
            style={{
              padding:"10px 12px", borderRadius:5, cursor:"pointer",
              background: dtype === dt.id ? "#121230" : "#0d0d18",
              border:`1px solid ${dtype === dt.id ? "#44f" : "#222"}`,
            }}
          >
            <div style={{ color: dtype === dt.id ? dt.color : "#666", fontWeight:"bold" }}>{dt.label}</div>
            <div style={{ color:"#555", fontSize:11, marginTop:2 }}>{dt.desc}</div>
          </div>
        ))}
      </div>

      {/* 開始階選択（デバッグ以外） */}
      {!isDebug && (
        <div style={{ marginBottom:12 }}>
          <div style={{ color:"#888", fontSize:12, marginBottom:6 }}>開始階: B{startDepth}F</div>
          <input type="range" min={1} max={maxStart} value={Math.min(startDepth, maxStart)}
            onChange={e => setStartDepth(Number(e.target.value))}
            style={{ width:"100%", accentColor:"#44f" }} />
          <div style={{ color:"#555", fontSize:11 }}>
            解放済み: B{maxStart}F {bestDepth === 0 && "(B1Fのみ)"}
          </div>
        </div>
      )}

      {/* 持参アイテムプレビュー */}
      <div style={{ marginBottom:14, padding:"8px 10px", background:"#0d0d18",
        border:"1px solid #222", borderRadius:4 }}>
        <div style={{ color:"#888", fontSize:12, marginBottom: hubInv.length > 0 ? 6 : 0 }}>
          持参アイテム: {hubInv.length > 0 ? `${hubInv.length}個` : "なし"}
          {hubInv.length > 30 && (
            <span style={{ color:"#f84", marginLeft:6, fontSize:11 }}>※30個を超えた分は持込不可</span>
          )}
        </div>
        {hubInv.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:1, maxHeight:110, overflowY:"auto" }}>
            {hubInv.slice(0, 30).map((it, i) => (
              <div key={i} style={{
                color: it.blessed ? "#ffd060" : it.cursed ? "#cc88ff" : "#aaa",
                fontSize:11,
              }}>
                · {hubItemLabel(it)}
              </div>
            ))}
          </div>
        )}
        <div style={{ color:"#444", fontSize:10, marginTop: hubInv.length > 0 ? 6 : 0 }}>
          ※荷物管理でアイテムを変更できます
        </div>
      </div>

      <Btn label="▶ 冒険に出発！" onClick={handleStart} color="#0f0"
        style={{ width:"100%", padding:"12px 0", fontSize:15, fontWeight:"bold",
          background:"#081808", borderColor:"#2a4a2a" }} />
    </Panel>
  );
}

/* ===== セーブデータ管理パネル ===== */
function SaveDataPanel({ saveData, onClearSave, onClose }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Panel title="セーブデータ管理" onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:8, color:TXT }}>
        <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${BDR}` }}>
          <span style={{ color:"#888" }}>総探索回数</span>
          <span>{saveData.totalRuns || 0} 回</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${BDR}` }}>
          <span style={{ color:"#888" }}>最深到達階</span>
          <span>B{saveData.bestDepth || 0}F</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${BDR}` }}>
          <span style={{ color:"#888" }}>最高取得金貨</span>
          <span style={{ color:GOLD }}>{saveData.bestGold || 0}G</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${BDR}` }}>
          <span style={{ color:"#888" }}>図鑑 (アイテム)</span>
          <span>{Object.keys(saveData.discovered?.items || {}).length} 種</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${BDR}` }}>
          <span style={{ color:"#888" }}>図鑑 (大箱)</span>
          <span>{Object.keys(saveData.discovered?.bigboxes || {}).length} 種</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${BDR}` }}>
          <span style={{ color:"#888" }}>図鑑 (モンスター)</span>
          <span>{Object.keys(saveData.discovered?.monsters || {}).length} 種</span>
        </div>
      </div>
      <div style={{ marginTop:20 }}>
        {!confirm ? (
          <Btn label="セーブデータを消去" onClick={() => setConfirm(true)} color="#f44"
            style={{ fontSize:12, background:"#180808" }} />
        ) : (
          <div>
            <div style={{ color:"#f44", marginBottom:10, fontSize:13 }}>本当に消去しますか？この操作は取り消せません。</div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn label="消去する" onClick={() => { onClearSave(); onClose(); }} color="#f44" />
              <Btn label="キャンセル" onClick={() => setConfirm(false)} color="#888" />
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ===== メインHUBスクリーン ===== */
export default function HubScreen({ saveData, updateSave, onStartDungeon, onResumeDungeon, onClearSave }) {
  const [panel, setPanel] = useState(null); /* "dungeon" | "items" | "shop" | "encyclopedia" | "savedata" */

  const hubGold      = saveData.hubGold      || 0;
  const hubInvCount  = (saveData.hubInventory || []).length;
  const warehouseCount = (saveData.warehouse  || []).length;

  const handleStartDungeon = (config) => {
    setPanel(null);
    onStartDungeon(config);
  };

  const HubBtn = ({ icon, label, sub, onClick, color="#8cf" }) => (
    <button onClick={onClick} style={{
      ...BTN, display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", gap:4,
      padding:"16px 0", flex:1, minWidth:100, maxWidth:160,
      background:CARD, color,
    }}>
      <span style={{ fontSize:22 }}>{icon}</span>
      <span style={{ fontSize:13, fontWeight:"bold" }}>{label}</span>
      {sub && <span style={{ fontSize:10, color:"#555" }}>{sub}</span>}
    </button>
  );

  return (
    <div style={{
      background:BG, minHeight:"100dvh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      fontFamily:"monospace", color:TXT, padding:16,
    }}>

      {/* タイトル */}
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ fontSize:28, fontWeight:"bold", color:"#fff",
          textShadow:"0 0 16px #446", letterSpacing:4 }}>
          ⚔ 地 上 ⚔
        </div>
        <div style={{ color:"#555", fontSize:12, marginTop:4 }}>
          冒険者の拠点
        </div>
      </div>

      {/* ステータスバー */}
      <div style={{
        display:"flex", gap:24, marginBottom:24, padding:"10px 20px",
        background:CARD, border:`1px solid ${BDR}`, borderRadius:8,
      }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ color:GOLD, fontWeight:"bold", fontSize:18 }}>{hubGold}G</div>
          <div style={{ color:"#555", fontSize:10 }}>所持金</div>
        </div>
        <div style={{ width:1, background:BDR }} />
        <div style={{ textAlign:"center" }}>
          <div style={{ color:"#8af", fontWeight:"bold", fontSize:18 }}>
            {hubInvCount}/{warehouseCount}
          </div>
          <div style={{ color:"#555", fontSize:10 }}>持参/倉庫</div>
        </div>
        <div style={{ width:1, background:BDR }} />
        <div style={{ textAlign:"center" }}>
          <div style={{ color:"#f80", fontWeight:"bold", fontSize:18 }}>B{saveData.bestDepth || 0}F</div>
          <div style={{ color:"#555", fontSize:10 }}>最深</div>
        </div>
        <div style={{ width:1, background:BDR }} />
        <div style={{ textAlign:"center" }}>
          <div style={{ color:"#aaa", fontWeight:"bold", fontSize:18 }}>{saveData.totalRuns || 0}</div>
          <div style={{ color:"#555", fontSize:10 }}>探索回数</div>
        </div>
      </div>

      {/* 中断データがある場合：再開ボタン */}
      {hasGameSave() && onResumeDungeon && (
        <button
          onClick={onResumeDungeon}
          style={{
            ...BTN, width:"min(360px,90vw)", padding:"18px 0", marginBottom:8,
            background:"#1a2808", color:"#8f4",
            borderColor:"#3a5a1a", fontSize:17, fontWeight:"bold",
            boxShadow:"0 0 16px #283808",
          }}
        >
          ▶ 冒険を再開する
        </button>
      )}

      {/* メインボタン：ダンジョンへ */}
      <button
        onClick={() => setPanel("dungeon")}
        style={{
          ...BTN, width:"min(360px,90vw)", padding:"18px 0", marginBottom:16,
          background:"#081828", color:"#4df",
          borderColor:"#1a3a5a", fontSize:17, fontWeight:"bold",
          boxShadow:"0 0 16px #082838",
        }}
      >
        ▶ ダンジョンへ出発
      </button>

      {/* サブ機能ボタン */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center",
        width:"min(360px,90vw)", marginBottom:20 }}>
        <HubBtn icon="🎒" label="荷物管理"
          sub={`持参${hubInvCount}・倉庫${warehouseCount}`}
          onClick={() => setPanel("items")} color="#8af" />
        <HubBtn icon="🏪" label="ショップ" sub="装備・道具"
          onClick={() => setPanel("shop")} color={GOLD} />
        <HubBtn icon="📖" label="図鑑"     sub="発見記録"
          onClick={() => setPanel("encyclopedia")} color="#a8f" />
        <HubBtn icon="💾" label="データ"   sub="セーブ管理"
          onClick={() => setPanel("savedata")} color="#888" />
      </div>

      {/* ヒント */}
      <div style={{ color:"#333", fontSize:11, textAlign:"center" }}>
        ダンジョンで獲得した金貨の50%が地上に持ち帰られます
      </div>
      <div style={{ color:"#2a2a2a", fontSize:9, textAlign:"center", marginTop:8 }}>
        Tiles: <a href="https://opengameart.org/content/dawnlike-16x16-universal-rogue-like-tileset-v181" target="_blank" rel="noopener" style={{color:"#3a3a3a"}}>DawnLike</a> by DragonDePlatino / Palette by DawnBringer (CC-BY-SA 3.0)
      </div>

      {/* パネル */}
      {panel === "dungeon" && (
        <DungeonEntrancePanel
          saveData={saveData}
          onClose={() => setPanel(null)}
          onStart={handleStartDungeon}
        />
      )}
      {panel === "items" && (
        <ItemManagementPanel
          saveData={saveData}
          updateSave={updateSave}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "shop" && (
        <HubShopPanel
          saveData={saveData}
          updateSave={updateSave}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "encyclopedia" && (
        <EncyclopediaPanel
          saveData={saveData}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "savedata" && (
        <SaveDataPanel
          saveData={saveData}
          onClearSave={onClearSave}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
