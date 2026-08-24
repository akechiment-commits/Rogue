import { useState, useMemo, useEffect, useRef } from "react";
import { uid, sortWarehouseItems } from "./utils.js";
import { clearSave } from "./SaveData.js";
import { hasGameSave } from "./GameSave.js";
import { itemPrice, ITEMS, WANDS, POTS, RINGS, TRAPS, BB_TYPES, WEAPON_ABILITIES, ARMOR_ABILITIES, potOccupancyCount } from "./items.js";
import { validateHubShopPurchase, validateBulkToWarehouse, canStartAdventure, isWarehouseOverCapacity } from "./hubWarehouse.js";
import { isKeyUp, isKeyDown, isKeyLeft, isKeyRight } from "./inputKeys.js";
import { applyPlayerNameToSave, normalizePlayerName, PLAYER_NAME_MAX, playerLabel } from "./playerLabel.js";
import {
  applyFavoriteFoodToSave,
  normalizeFavoriteFood,
  FAVORITE_FOOD_MAX,
  favoriteFoodLabel,
} from "./favoriteFood.js";
import { fetchRanking, fetchRankingStats, RANKING_DUNGEONS } from "./rankingClient.js";
import { formatElapsed } from "./runScore.js";
import { FIRST_ENCOUNTER_TIPS, getSeenFirstEncounterTips } from "./firstEncounterTips.js";
import {
  getItemCatalogEntry,
  getItemCategoryEntries,
  getKeyItemDescription,
  ITEM_CATEGORY_DEFS,
  NO_ENCYCLOPEDIA_INFO,
} from "./encyclopediaData.js";
import { getMonsterDescription, getMonsterNumber } from "./monsterEncyclopedia.js";

/* ===== 共通スタイル ===== */
const BG   = "#09090f";
const CARD = "#111118";
const BDR  = "#2a2a3a";
const TXT  = "#ccc";
const GOLD = "#f0c040";
const BTN  = { fontFamily:"monospace", cursor:"pointer", borderRadius:5, border:`1px solid ${BDR}`, fontSize:13 };

const GRAPHIC_STYLE_OPTIONS = [
  { id: "mon1", label: "スタイル3:リッチ", desc: "個別イラスト中心" },
  { id: "dawnlike", label: "スタイル2:クラシック", desc: "DawnLikeタイル" },
  { id: "default", label: "スタイル1:シンプル", desc: "シンプルなタイル" },
];

const Btn = ({ label, onClick, color="#8cf", style={} }) => (
  <button
    onClick={onClick}
    style={{ ...BTN, padding:"10px 18px", background:CARD, color, ...style }}
  >
    {label}
  </button>
);

/* ===== PANEL COMPONENT ===== */
function Panel({ title, onClose, children, wide, sticky }) {
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
        overflow:"hidden", padding:0, display:"flex", flexDirection:"column",
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"10px 14px", borderBottom:`1px solid ${BDR}`, flexShrink:0 }}>
          <span style={{ color:"#fff", fontWeight:"bold", fontSize:15 }}>{title}</span>
          <button onClick={onClose} style={{ ...BTN, padding:"2px 10px", color:"#888", fontSize:13 }}>✕</button>
        </div>
        {sticky && (
          <div style={{ padding:"12px 14px 8px", borderBottom:`1px solid #1a1a28`, flexShrink:0 }}>
            {sticky}
          </div>
        )}
        <div style={{ padding: sticky ? "8px 14px 14px" : 14, flex:1, overflowY:"auto" }}>{children}</div>
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
    s += ` [${potOccupancyCount(it)}/${it.capacity}]`;
  } else if (it.type === "ring" && ["power_ring","defense_ring","life_ring"].includes(it.effect)) {
    s += `+${it.plus || 0}`;
  } else if (it.type === "potion" && (it.effect === "heal" || it.effect === "heal_big")) {
    s += ` (HP+${it.value})`;
  }
  return bc + s;
}

/* ===== 荷物管理パネル（持参インベントリ ＋ 倉庫） ===== */
function ItemManagementPanel({ saveData, updateSave, onClose }) {
  const [tab, setTab] = useState("carry"); // "carry" | "warehouse"
  const [focusIdx, setFocusIdx] = useState(0);
  const [actionSel, setActionSel] = useState(0);
  const [showDescIdx, setShowDescIdx] = useState(null);
  const [checkedIdxs, setCheckedIdxs] = useState(new Set());
  const [sellConfirmOpen, setSellConfirmOpen] = useState(false);
  const [sellConfirmSel, setSellConfirmSel] = useState(0); // 0=はい 1=いいえ
  const [expandFocused, setExpandFocused] = useState(false);
  const [notice, setNotice] = useState(null);
  const noticeTimerRef = useRef(null);
  const kbRef = useRef(null);
  const itemRefs = useRef([]);

  const showNotice = (text) => {
    setNotice(text);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2500);
  };
  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  const hubInv = saveData.hubInventory || [];
  const wh     = saveData.warehouse    || [];
  const MAX    = saveData.warehouseMax || 100;
  const gold   = saveData.hubGold      || 0;
  const EXPAND_COST = 500;

  const isCarry = tab === "carry";
  const list    = isCarry ? hubInv : wh;
  const safeFocus = list.length === 0 ? 0 : Math.min(focusIdx, list.length - 1);

  const switchTab = (t) => {
    setTab(t); setFocusIdx(0); setActionSel(0); setShowDescIdx(null);
    setCheckedIdxs(new Set()); setExpandFocused(false);
  };

  const getActions = (item) => {
    if (!item) return [];
    const acts = isCarry
      ? [{ label: "→ 倉庫へ戻す", key: "toWarehouse", color: "#aaa",
           bg: "#0d0d18", bgSel: "#1a1a2a" }]
      : [
          { label: "← 持参する", key: "toCarry", color: "#8cf",
            bg: "#081828", bgSel: "#0a2840" },
          { label: `売る (${Math.max(1, Math.floor(itemPrice(item) / 2))}G)`, key: "sell", color: GOLD,
            bg: "#0a1800", bgSel: "#142000" },
        ];
    if (item.desc) acts.push({ label: "説明", key: "desc", color: "#888", bg: "#0d0d18", bgSel: "#1a1a30" });
    return acts;
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
    setFocusIdx(p => Math.max(0, p - 1)); setActionSel(0); setShowDescIdx(null);
    setCheckedIdxs(prev => { const n = new Set(prev); n.delete(idx); return n; });
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
    setFocusIdx(p => Math.min(p, Math.max(0, wh.length - 2)));
    setActionSel(0); setShowDescIdx(null);
    setCheckedIdxs(prev => { const n = new Set(prev); n.delete(idx); return n; });
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
    setFocusIdx(p => Math.min(p, Math.max(0, wh.length - 2)));
    setActionSel(0); setShowDescIdx(null);
    setCheckedIdxs(prev => { const n = new Set(prev); n.delete(idx); return n; });
  };

  const bulkMoveToCarry = () => {
    if (checkedIdxs.size === 0) return;
    updateSave(prev => {
      const warehouse = prev.warehouse || [];
      const toMove    = warehouse.filter((_, i) => checkedIdxs.has(i));
      const remaining = warehouse.filter((_, i) => !checkedIdxs.has(i));
      return { ...prev, warehouse: remaining, hubInventory: [...(prev.hubInventory || []), ...toMove] };
    });
    setCheckedIdxs(new Set()); setFocusIdx(0); setActionSel(0);
  };

  const bulkSell = () => {
    if (checkedIdxs.size === 0) return;
    updateSave(prev => {
      const warehouse = prev.warehouse || [];
      let earned = 0;
      const remaining = warehouse.filter((item, i) => {
        if (checkedIdxs.has(i)) { earned += Math.max(1, Math.floor(itemPrice(item) / 2)); return false; }
        return true;
      });
      return { ...prev, warehouse: remaining, hubGold: (prev.hubGold || 0) + earned };
    });
    setCheckedIdxs(new Set()); setFocusIdx(0); setActionSel(0);
  };

  const bulkToWarehouse = () => {
    if (checkedIdxs.size === 0) return;
    /* 1個でも溢れるなら移動しない（slice切り捨てによるアイテム消失防止） */
    const moveCount = [...checkedIdxs].filter(i => i < hubInv.length).length;
    const bulkCheck = validateBulkToWarehouse(wh.length, MAX, moveCount);
    if (!bulkCheck.ok) {
      if (bulkCheck.reason === "insufficient_space") {
        showNotice(`倉庫の空きが足りない！（空き${bulkCheck.freeSlots}・選択${bulkCheck.moveCount}個）`);
      }
      return;
    }
    updateSave(prev => {
      const inv    = prev.hubInventory || [];
      const toMove = inv.filter((_, i) => checkedIdxs.has(i));
      const remaining = inv.filter((_, i) => !checkedIdxs.has(i));
      return {
        ...prev,
        hubInventory: remaining,
        warehouse: sortWarehouseItems([...(prev.warehouse || []), ...toMove]),
      };
    });
    setCheckedIdxs(new Set()); setFocusIdx(0); setActionSel(0);
  };

  const executeAction = (idx, actIdx) => {
    const item = list[idx];
    if (!item) return;
    const acts = getActions(item);
    const act = acts[actIdx];
    if (!act) return;
    if      (act.key === "toWarehouse") moveToWarehouse(idx);
    else if (act.key === "toCarry")     moveToCarry(idx);
    else if (act.key === "sell")        sellFromWarehouse(idx);
    else if (act.key === "desc")        setShowDescIdx(prev => prev === idx ? null : idx);
  };

  const expandWarehouse = () => {
    if (gold < EXPAND_COST) return;
    updateSave(prev => ({
      ...prev,
      hubGold:      (prev.hubGold      || 0)   - EXPAND_COST,
      warehouseMax: (prev.warehouseMax || 100) + 50,
    }));
  };

  /* 一括操作用の集計 */
  const checkedWhItems = !isCarry ? [...checkedIdxs].filter(i => i < wh.length).map(i => wh[i]) : [];
  const checkedCarryCount = isCarry ? [...checkedIdxs].filter(i => i < hubInv.length).length : 0;
  const checkedSellTotal  = checkedWhItems.reduce((s, it) => s + Math.max(1, Math.floor(itemPrice(it) / 2)), 0);
  const anyChecked = isCarry ? checkedCarryCount > 0 : checkedWhItems.length > 0;

  /* フォーカス追従スクロール */
  useEffect(() => {
    itemRefs.current[safeFocus]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIdx, tab]);

  /* キーボードハンドラを常に最新状態で参照 */
  kbRef.current = {
    list, safeFocus, actionSel, getActions, executeAction,
    setFocusIdx, setActionSel, setShowDescIdx, setCheckedIdxs, onClose,
    isCarry, switchTab, anyChecked, bulkMoveToCarry, bulkSell, bulkToWarehouse,
    sellConfirmOpen, setSellConfirmOpen, sellConfirmSel, setSellConfirmSel,
    expandFocused, setExpandFocused, expandWarehouse, gold, EXPAND_COST,
  };

  useEffect(() => {
    const fn = (e) => {
      const r = kbRef.current;
      const k = e.key.toLowerCase();

      /* 売却確認ダイアログ中 */
      if (r.sellConfirmOpen) {
        if (isKeyUp(e) || isKeyDown(e)) {
          e.preventDefault();
          r.setSellConfirmSel(p => p === 0 ? 1 : 0);
        } else if (k === "z" || k === "enter") {
          e.preventDefault();
          if (r.sellConfirmSel === 0) r.bulkSell();
          r.setSellConfirmOpen(false); r.setSellConfirmSel(0);
        } else if (k === "x" || k === "escape") {
          e.preventDefault();
          r.setSellConfirmOpen(false); r.setSellConfirmSel(0);
        }
        return;
      }

      /* 倉庫拡張ボタンフォーカス中 */
      if (r.expandFocused) {
        if (isKeyDown(e)) {
          e.preventDefault(); r.setExpandFocused(false); r.setFocusIdx(0);
        } else if (k === "z" || k === "enter") {
          e.preventDefault();
          if (r.gold >= r.EXPAND_COST) r.expandWarehouse();
          r.setExpandFocused(false);
        } else if (k === "x" || k === "escape") {
          r.onClose();
        }
        return;
      }

      if (k === "x" || k === "escape") { r.onClose(); return; }
      if (k === "shift") {
        e.preventDefault();
        r.switchTab(r.isCarry ? "warehouse" : "carry"); return;
      }
      if (k === "s") {
        e.preventDefault();
        if (!r.isCarry && r.anyChecked) { r.setSellConfirmOpen(true); r.setSellConfirmSel(0); }
        return;
      }
      if (k === "f") {
        e.preventDefault();
        if (r.anyChecked) { r.isCarry ? r.bulkToWarehouse() : r.bulkMoveToCarry(); }
        return;
      }

      if (r.list.length === 0) return;
      if (isKeyUp(e)) {
        e.preventDefault();
        if (r.safeFocus === 0 && !r.isCarry) {
          r.setExpandFocused(true);
        } else {
          r.setFocusIdx(p => Math.max(0, p - 1)); r.setActionSel(0); r.setShowDescIdx(null);
        }
      } else if (isKeyDown(e)) {
        e.preventDefault();
        r.setFocusIdx(p => Math.min(r.list.length - 1, p + 1)); r.setActionSel(0); r.setShowDescIdx(null);
      } else if (isKeyLeft(e)) {
        e.preventDefault();
        const acts = r.getActions(r.list[r.safeFocus]);
        if (acts.length) r.setActionSel(p => (p - 1 + acts.length) % acts.length);
      } else if (isKeyRight(e)) {
        e.preventDefault();
        const acts = r.getActions(r.list[r.safeFocus]);
        if (acts.length) r.setActionSel(p => (p + 1) % acts.length);
      } else if (k === "d") {
        e.preventDefault();
        r.setCheckedIdxs(prev => {
          const n = new Set(prev);
          if (n.has(r.safeFocus)) n.delete(r.safeFocus); else n.add(r.safeFocus);
          return n;
        });
      } else if (k === "enter" || k === "z") {
        e.preventDefault(); r.executeAction(r.safeFocus, r.actionSel);
      } else if (k === "pagedown" || k === " ") {
        e.preventDefault();
        r.setFocusIdx(p => Math.min(r.list.length - 1, p + 10)); r.setActionSel(0); r.setShowDescIdx(null);
      } else if (k === "pageup") {
        e.preventDefault();
        r.setFocusIdx(p => Math.max(0, p - 10)); r.setActionSel(0); r.setShowDescIdx(null);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const tabStyle = (t) => ({
    ...BTN, padding:"6px 16px",
    background: tab === t ? "#1a1a30" : CARD,
    color:      tab === t ? "#8af"    : "#666",
    borderColor:tab === t ? "#44f"    : BDR,
    fontSize: 13,
  });

  /* sticky エリア（スクロールしても常に表示） */
  const stickyArea = (
    <>
      {/* 操作ガイド */}
      <div style={{ color:"#8a9ab0", fontSize:11, lineHeight:"1.8em", marginBottom:10,
        padding:"5px 8px", background:"#0d0d18", border:`1px solid ${BDR}`, borderRadius:4 }}>
        <div>Shift:タブ切替　↑↓/テンキー8・2:選択　←→/テンキー4・6:操作切替　Enter/Z:実行　D:チェック</div>
        <div>F:まとめて持参/倉庫へ　S:まとめて売る（確認あり）　X:閉じる</div>
      </div>

      {/* 所持金 */}
      <div style={{ color:GOLD, fontSize:13, marginBottom:8 }}>
        所持G: <strong>{gold}G</strong>
      </div>

      {/* タブ */}
      <div style={{ display:"flex", gap:6, marginBottom:8 }}>
        <button onClick={() => switchTab("carry")} style={tabStyle("carry")}>
          持参アイテム ({hubInv.length})
        </button>
        <button onClick={() => switchTab("warehouse")} style={tabStyle("warehouse")}>
          倉庫 ({wh.length}/{MAX}{wh.length > MAX ? " 超過!" : ""})
        </button>
      </div>

      {/* 倉庫タブのみ：拡張ボタン */}
      {!isCarry && (
        <div onClick={() => setExpandFocused(true)}
          style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
            marginBottom: anyChecked ? 8 : 0, padding:"6px 8px",
            background: expandFocused ? "#141428" : "#0d0d18",
            borderRadius:4,
            border: expandFocused ? "1px solid #88f" : `1px solid ${BDR}`,
            cursor:"pointer" }}>
          <span style={{ color: expandFocused ? "#aaf" : "#888", fontSize:12 }}>
            {expandFocused ? "▶ " : ""}倉庫を拡張 +50スロット
          </span>
          <button onClick={(e) => { e.stopPropagation(); expandWarehouse(); setExpandFocused(false); }}
            disabled={gold < EXPAND_COST}
            style={{ ...BTN, padding:"4px 12px", fontSize:12,
              color: gold >= EXPAND_COST ? GOLD : "#555", background:"#0a1800",
              borderColor: gold >= EXPAND_COST ? "#3a2a00" : "#222" }}>
            {EXPAND_COST}G
          </button>
        </div>
      )}

      {/* 一括操作バー（チェックあり時） */}
      {anyChecked && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center",
          marginTop: !isCarry ? 8 : 0,
          padding:"6px 8px", background:"#0d1820", border:"1px solid #2a4a6a", borderRadius:4 }}>
          <span style={{ color:"#8cf", fontSize:12 }}>
            {isCarry ? checkedCarryCount : checkedWhItems.length}個選択中
          </span>
          {isCarry ? (
            <button onClick={bulkToWarehouse}
              style={{ ...BTN, padding:"4px 10px", fontSize:12, background:"#0d0d18", color:"#aaa" }}>
              まとめて倉庫へ [F]
            </button>
          ) : (
            <>
              <button onClick={bulkMoveToCarry}
                style={{ ...BTN, padding:"4px 10px", fontSize:12, background:"#081828", color:"#8cf" }}>
                まとめて持参 [F]
              </button>
              <button onClick={() => { setSellConfirmOpen(true); setSellConfirmSel(0); }}
                style={{ ...BTN, padding:"4px 10px", fontSize:12, background:"#0a1800", color:GOLD }}>
                まとめて売る [S] ({checkedSellTotal}G)
              </button>
            </>
          )}
          <button onClick={() => setCheckedIdxs(new Set())}
            style={{ ...BTN, padding:"4px 8px", fontSize:11, color:"#555" }}>
            解除
          </button>
        </div>
      )}

      {/* 実行不可メッセージ */}
      {notice && (
        <div style={{ marginTop:8, padding:"6px 8px", background:"#2a0d0d",
          border:"1px solid #6a2a2a", borderRadius:4, color:"#f88", fontSize:12 }}>
          {notice}
        </div>
      )}
    </>
  );

  return (
    <>
      <Panel title="荷物管理" onClose={onClose} wide sticky={stickyArea}>

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
              const isFocus    = safeFocus === idx;
              const isChecked  = checkedIdxs.has(idx);
              const isDescShow = showDescIdx === idx;
              const acts       = getActions(item);
              const label      = hubItemLabel(item);
              const itemColor  = item.blessed ? "#ffd060" : item.cursed ? "#cc88ff" : TXT;

              return (
                <div key={idx} ref={el => itemRefs.current[idx] = el}>
                  {/* アイテム行 */}
                  <div
                    onClick={() => { setFocusIdx(idx); setActionSel(0); setShowDescIdx(null); }}
                    style={{
                      display:"flex", alignItems:"center", gap:6, padding:"7px 8px",
                      background:  isFocus ? "#1a1a30" : "#0d0d18",
                      border:      `1px solid ${isFocus ? "#44f" : "#222"}`,
                      borderRadius: (isFocus && acts.length > 0) ? "4px 4px 0 0" : 4,
                      cursor:"pointer",
                    }}
                  >
                    {/* チェックボックス */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setCheckedIdxs(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
                      }}
                      style={{
                        width:16, height:16, flexShrink:0,
                        border:`1px solid ${isChecked ? "#8cf" : "#444"}`,
                        borderRadius:2, background: isChecked ? "#1a3a5a" : "transparent",
                        display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
                      }}
                    >
                      {isChecked && <span style={{ color:"#8cf", fontSize:11, lineHeight:1 }}>✓</span>}
                    </div>

                    <span style={{ flex:1, color:itemColor, fontSize:13 }}>{label}</span>
                    <span style={{ color:"#555", fontSize:11 }}>{isFocus ? "▲" : "▼"}</span>
                  </div>

                  {/* フォーカス時：操作エリア */}
                  {isFocus && acts.length > 0 && (
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
                        {acts.map((act, ai) => {
                          const isActSel = actionSel === ai;
                          return (
                            <button key={ai}
                              onClick={(e) => { e.stopPropagation(); executeAction(idx, ai); }}
                              style={{ ...BTN, padding:"4px 10px", fontSize:12,
                                background: isActSel ? act.bgSel : act.bg,
                                color: act.color,
                                border: `1px solid ${isActSel ? "#88f" : BDR}`,
                                fontWeight: isActSel ? "bold" : "normal",
                              }}
                            >
                              {act.label}
                            </button>
                          );
                        })}
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

      {/* 売却確認ダイアログ */}
      {sellConfirmOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:100,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:CARD, border:"1px solid #4a4a6a", borderRadius:8,
            padding:"20px 24px", minWidth:280, maxWidth:320, fontFamily:"monospace" }}>
            <div style={{ color:TXT, fontSize:14, marginBottom:6, lineHeight:"1.6em" }}>
              チェックした{checkedWhItems.length}個のアイテムを売りますか？
            </div>
            <div style={{ color:GOLD, fontSize:16, fontWeight:"bold", marginBottom:16 }}>
              合計: {checkedSellTotal}G
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {[
                { label:"はい（売る）", color:GOLD },
                { label:"いいえ（キャンセル）", color:"#888" },
              ].map(({ label, color }, i) => (
                <div key={i}
                  onClick={() => {
                    if (i === 0) bulkSell();
                    setSellConfirmOpen(false); setSellConfirmSel(0);
                  }}
                  style={{
                    padding:"9px 14px", borderRadius:4, cursor:"pointer",
                    background: sellConfirmSel === i ? "#1a1a30" : "#0d0d18",
                    border: `1px solid ${sellConfirmSel === i ? "#88f" : "#333"}`,
                    color, fontWeight: sellConfirmSel === i ? "bold" : "normal",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
            <div style={{ color:"#555", fontSize:11, marginTop:12 }}>
              ↑↓/テンキー8・2:選択　Z/Enter:決定　X:キャンセル
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ===== 図鑑パネル ===== */
function EncyclopediaPanel({ saveData, onClose }) {
  const TABS = ["items", "monsters", "traps", "bigboxes", "tips"];
  const TAB_LABEL = { items:"アイテム", monsters:"モンスター", traps:"罠", bigboxes:"大箱", tips:"Tips" };

  const [tab, setTab] = useState("items");
  const [itemCategory, setItemCategory] = useState(ITEM_CATEGORY_DEFS[0].id);
  const [focusIdx, setFocusIdx] = useState(0);
  const [descKey, setDescKey] = useState(null);
  const kbRef = useRef(null);
  const itemRefs = useRef([]);
  const disc = saveData.discovered || {};
  const seenTips = saveData.seenMiniTips || [];

  const switchTab = (t) => { setTab(t); setFocusIdx(0); setDescKey(null); };

  const lookupDesc = (entry, tabName) => {
    const key = entry.key;
    if (tabName === "traps") { const t = TRAPS.find(t => t.effect === key || t.name === key); return t?.desc || entry.desc || NO_ENCYCLOPEDIA_INFO; }
    if (tabName === "bigboxes") { const b = BB_TYPES.find(b => b.kind === key); return b?.desc || entry.desc || NO_ENCYCLOPEDIA_INFO; }
    if (tabName === "items") {
      return getItemCatalogEntry(key, entry)?.desc || getKeyItemDescription(entry.name) || entry.desc || NO_ENCYCLOPEDIA_INFO;
    }
    if (tabName === "monsters") { return getMonsterDescription(entry.name) || NO_ENCYCLOPEDIA_INFO; }
    if (tabName === "tips") {
      const tip = FIRST_ENCOUNTER_TIPS[key];
      return tip ? `【表示された状況】\n${tip.trigger}\n\n${tip.text.join("\n")}` : NO_ENCYCLOPEDIA_INFO;
    }
    return NO_ENCYCLOPEDIA_INFO;
  };

  const sortedList = useMemo(() => {
    if (tab === "tips") return getSeenFirstEncounterTips(seenTips);
    if (tab === "items") return getItemCategoryEntries(disc.items, itemCategory);
    const entries = disc[tab] || {};
    return Object.entries(entries)
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => {
        if (tab === "monsters") {
          return (getMonsterNumber(a.name) ?? Number.MAX_SAFE_INTEGER) -
            (getMonsterNumber(b.name) ?? Number.MAX_SAFE_INTEGER);
        }
        if (tab === "traps") {
          const ao = TRAPS.findIndex(t => t.effect === a.key || t.name === a.name);
          const bo = TRAPS.findIndex(t => t.effect === b.key || t.name === b.name);
          return (ao < 0 ? Number.MAX_SAFE_INTEGER : ao) - (bo < 0 ? Number.MAX_SAFE_INTEGER : bo);
        }
        if (tab === "bigboxes") {
          const ao = BB_TYPES.findIndex(box => box.kind === a.key);
          const bo = BB_TYPES.findIndex(box => box.kind === b.key);
          return (ao < 0 ? Number.MAX_SAFE_INTEGER : ao) - (bo < 0 ? Number.MAX_SAFE_INTEGER : bo);
        }
        return a.name.localeCompare(b.name, "ja");
      });
  }, [tab, disc, seenTips, itemCategory]);

  const safeFocus = sortedList.length === 0 ? 0 : Math.min(focusIdx, sortedList.length - 1);

  useEffect(() => {
    itemRefs.current[safeFocus]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIdx, tab]);

  const itemCategoryCounts = useMemo(() => new Map(
    ITEM_CATEGORY_DEFS.map(category => [category.id, getItemCategoryEntries(disc.items, category.id).length]),
  ), [disc.items]);
  const selectedCategory = ITEM_CATEGORY_DEFS.find(category => category.id === itemCategory) || ITEM_CATEGORY_DEFS[0];

  kbRef.current = {
    sortedList, safeFocus, setFocusIdx, tab, switchTab, TABS, setDescKey, onClose,
    itemCategory, setItemCategory, itemCategories: ITEM_CATEGORY_DEFS,
  };

  useEffect(() => {
    const fn = (e) => {
      const r = kbRef.current;
      const k = e.key.toLowerCase();
      if (k === "x" || k === "escape") { r.onClose(); return; }
      if (k === "shift") {
        e.preventDefault();
        const idx = r.TABS.indexOf(r.tab);
        r.switchTab(r.TABS[(idx + 1) % r.TABS.length]); return;
      }
      if (r.tab === "items" && (isKeyLeft(e) || isKeyRight(e))) {
        e.preventDefault();
        const idx = r.itemCategories.findIndex(category => category.id === r.itemCategory);
        const next = isKeyRight(e)
          ? (idx + 1) % r.itemCategories.length
          : (idx - 1 + r.itemCategories.length) % r.itemCategories.length;
        r.setItemCategory(r.itemCategories[next].id);
        r.setFocusIdx(0);
        r.setDescKey(null);
        return;
      }
      if (r.sortedList.length === 0) return;
      if (isKeyUp(e)) {
        e.preventDefault(); r.setFocusIdx(p => Math.max(0, p - 1));
      } else if (isKeyDown(e)) {
        e.preventDefault(); r.setFocusIdx(p => Math.min(r.sortedList.length - 1, p + 1));
      } else if (k === "pagedown" || k === " ") {
        e.preventDefault(); r.setFocusIdx(p => Math.min(r.sortedList.length - 1, p + 10));
      } else if (k === "pageup") {
        e.preventDefault(); r.setFocusIdx(p => Math.max(0, p - 10));
      } else if (k === "z" || k === "enter") {
        e.preventDefault();
        const item = r.sortedList[r.safeFocus];
        if (item) r.setDescKey(prev => prev === item.key ? null : item.key);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const tabStyle = (t) => ({
    ...BTN, padding:"6px 16px",
    background: tab === t ? "#1a1a30" : CARD,
    color:      tab === t ? "#8af"    : "#666",
    borderColor:tab === t ? "#44f"    : BDR,
  });

  const countLabel = {
    items:    `発見アイテム: ${Object.keys(disc.items || {}).length}種　${selectedCategory.label}: ${sortedList.length}種`,
    monsters: `遭遇モンスター: ${Object.keys(disc.monsters || {}).length}種`,
    traps:    `踏んだ罠: ${Object.keys(disc.traps    || {}).length}種`,
    bigboxes: `識別済み大箱: ${Object.keys(disc.bigboxes || {}).length}種`,
    tips:     `表示済みTips: ${getSeenFirstEncounterTips(seenTips).length}/${Object.keys(FIRST_ENCOUNTER_TIPS).length}件`,
  };

  const stickyArea = (
    <>
      <div style={{ color:"#8a9ab0", fontSize:11, marginBottom:8 }}>
        Shift:タブ切替　↑↓/テンキー8・2:選択　PageDown/Space:+10　PageUp:-10　Z/Enter:説明　X:閉じる
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => switchTab(t)} style={tabStyle(t)}>{TAB_LABEL[t]}</button>
        ))}
      </div>
      {tab === "items" && (
        <div style={{ display:"flex", gap:4, marginBottom:8, flexWrap:"wrap", maxHeight:76, overflowY:"auto" }}>
          {ITEM_CATEGORY_DEFS.map(category => {
            const selected = itemCategory === category.id;
            return (
              <button key={category.id} onClick={() => { setItemCategory(category.id); setFocusIdx(0); setDescKey(null); }}
                style={{ ...BTN, padding:"4px 8px", fontSize:11,
                  background: selected ? "#1b2140" : CARD,
                  color: selected ? "#9cf" : "#687080",
                  borderColor: selected ? "#4b78cc" : BDR }}>
                {category.label} <span style={{ color: selected ? "#dff" : "#555" }}>({itemCategoryCounts.get(category.id) || 0})</span>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ color:"#666", fontSize:11 }}>{countLabel[tab]}</div>
    </>
  );

  return (
    <Panel title="図鑑" onClose={onClose} wide sticky={stickyArea}>
      {sortedList.length === 0 ? (
        <div style={{ color:"#555", padding:"20px 0", textAlign:"center" }}>
          {tab === "tips" ? "まだ表示されたTipsがありません。" : "まだ発見がありません。"}
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
          {sortedList.map((e, i) => {
            const isFocus = safeFocus === i;
            const isDesc  = descKey === e.key;
            const desc    = isDesc ? lookupDesc(e, tab) : null;
            const number  = tab === "monsters" ? getMonsterNumber(e.name) : null;
            return (
              <div key={i} ref={el => itemRefs.current[i] = el}
                onClick={() => { setFocusIdx(i); setDescKey(prev => prev === e.key ? null : e.key); }}
                style={{ padding:"5px 8px",
                  background: isFocus ? "#141428" : "#0d0d18",
                  borderRadius:3, color:TXT, cursor:"pointer",
                  border: isFocus ? "1px solid #44f" : "1px solid transparent" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span>{number != null ? `No.${String(number).padStart(3, "0")} ` : ""}{e.name}</span>
                  <span style={{ color:"#555" }}>{tab === "tips" ? "既読" : `${e.count}回`}</span>
                </div>
                {isDesc && desc && (
                  <div style={{ color:"#b8c5d8", fontSize:12, marginTop:4, whiteSpace:"pre-wrap", lineHeight:"1.5em" }}>
                    {desc}
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

/* ===== 拠点ショップパネル ===== */
function HubShopPanel({ saveData, updateSave, onClose }) {
  const [focusIdx, setFocusIdx] = useState(0);
  const [notice, setNotice] = useState(null);
  const noticeTimerRef = useRef(null);
  const kbRef = useRef(null);
  const gold = saveData.hubGold || 0;
  const whCount = (saveData.warehouse || []).length;
  const whMax   = saveData.warehouseMax || 100;

  const showNotice = (text) => {
    setNotice(text);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2500);
  };
  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  const shopItems = saveData.hubShopStock || [];

  const buy = (item) => {
    const price = itemPrice(item);
    const purchaseCheck = validateHubShopPurchase(whCount, whMax, gold, price);
    if (!purchaseCheck.ok) {
      if (purchaseCheck.reason === "warehouse_full") {
        showNotice(`倉庫が満杯で購入できない！（${whCount}/${whMax}）`);
      }
      return;
    }
    updateSave(prev => ({
      ...prev,
      hubGold:   prev.hubGold - price,
      warehouse: sortWarehouseItems([...(prev.warehouse || []), { ...item, id: uid() }]),
      hubShopStock: (prev.hubShopStock || []).filter(stockItem => stockItem !== item),
    }));
    setFocusIdx(current => Math.max(0, Math.min(current, shopItems.length - 2)));
  };

  kbRef.current = { shopItems, focusIdx, setFocusIdx, buy, onClose, gold };

  useEffect(() => {
    const fn = (e) => {
      const r = kbRef.current;
      const k = e.key.toLowerCase();
      if (k === "x" || k === "escape") { r.onClose(); return; }
      if (isKeyUp(e)) {
        e.preventDefault(); r.setFocusIdx(p => Math.max(0, p - 1));
      } else if (isKeyDown(e)) {
        e.preventDefault(); r.setFocusIdx(p => Math.min(r.shopItems.length - 1, p + 1));
      } else if (k === "z" || k === "enter") {
        e.preventDefault();
        const item = r.shopItems[r.focusIdx];
        if (item && r.gold >= itemPrice(item)) r.buy(item);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  return (
    <Panel title="拠点ショップ" onClose={onClose} wide>
      <div style={{ color:GOLD, marginBottom:4, fontSize:14 }}>
        所持G: <strong>{gold}G</strong>
      </div>
      <div style={{ color:"#8a9ab0", fontSize:11, marginBottom:10 }}>
        ↑↓/テンキー8・2:選択　Z/Enter:購入　X:閉じる　| 在庫5〜9点・帰還ごとに入荷　購入品は倉庫へ（{whCount}/{whMax}）
      </div>
      {/* 実行不可メッセージ */}
      {notice && (
        <div style={{ marginBottom:10, padding:"6px 8px", background:"#2a0d0d",
          border:"1px solid #6a2a2a", borderRadius:4, color:"#f88", fontSize:12 }}>
          {notice}
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {shopItems.length === 0 && (
          <div style={{ color:"#666", fontSize:13, padding:"16px 8px", textAlign:"center" }}>
            売り切れです。次の冒険から帰還すると新しい商品が入ります。
          </div>
        )}
        {shopItems.map((item, i) => {
          const price  = itemPrice(item);
          const canBuy = gold >= price;
          const isFocus = focusIdx === i;
          return (
            <div key={i} onClick={() => setFocusIdx(i)}
              style={{
                display:"flex", alignItems:"center", gap:10, padding:"7px 10px",
                background: isFocus ? "#141428" : "#0d0d18",
                border: `1px solid ${isFocus ? "#44f" : "#222"}`,
                borderRadius:4, cursor:"pointer",
              }}
            >
              <span style={{ color: canBuy ? TXT : "#444", flex:1 }}>
                {item.name}{item.plus ? `+${item.plus}` : ""}
                <span style={{ color:"#b7c1d2", fontSize:11, marginLeft:6 }}>{item.desc}</span>
              </span>
              <span style={{ color: canBuy ? GOLD : "#444", minWidth:50, textAlign:"right" }}>
                {price}G
              </span>
              {isFocus && (
                <button
                  onClick={e => { e.stopPropagation(); buy(item); }}
                  disabled={!canBuy}
                  style={{ ...BTN, padding:"4px 12px", color: canBuy ? "#0f0" : "#444",
                    background: canBuy ? "#0a1a0a" : "#111", borderColor: canBuy ? "#2a4a2a" : "#222" }}
                >
                  購入 [Z]
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
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [confirmSel, setConfirmSel] = useState(0); // 0=出発する 1=キャンセル
  const [notice, setNotice] = useState(null);
  const noticeTimerRef = useRef(null);
  const kbRef = useRef(null);
  const hubInv   = saveData.hubInventory || [];
  const whCount  = (saveData.warehouse || []).length;
  const whMax    = saveData.warehouseMax || 100;
  const warehouseOver = isWarehouseOverCapacity(whCount, whMax);
  const bestDepth = saveData.bestDepth || 0;

  const showNotice = (text) => {
    setNotice(text);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);
  };
  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  const DUNGEON_TYPES = [
    { id:"tutorial",     label:"チュートリアル",     desc:"全3階。道具を使って危機を越え、生きて帰る短い入門ダンジョン", color:"#8f8", maxFloors:3   },
    { id:"beginner",     label:"初心者ダンジョン",   desc:"全10階",                                    color:"#8cf", maxFloors:10  },
    { id:"intermediate", label:"中級者ダンジョン",   desc:"全20階",                                    color:"#fc8", maxFloors:20  },
    { id:"advanced",     label:"上級者ダンジョン",   desc:"全30階",                                    color:"#f88", maxFloors:30  },
    { id:"legend",       label:"超上級者ダンジョン", desc:"全50階・超難度。深淵の禁書を持ち帰れ",      color:"#c84fff", maxFloors:50 },
    { id:"debug",        label:"デバッグダンジョン", desc:"全アイテム・全モンスター配置（テスト用）", color:"#fa0", maxFloors:null },
  ];
  const [dtype, setDtype] = useState("beginner");
  const currentType = DUNGEON_TYPES.find(dt => dt.id === dtype);
  const isDebug    = dtype === "debug";
  const isTutorial = dtype === "tutorial";
  const maxStart = (isDebug || isTutorial) ? 1 : Math.min(Math.max(1, bestDepth), currentType.maxFloors);

  const doStart = () => {
    const startCheck = canStartAdventure(whCount, whMax);
    if (!startCheck.ok) {
      showNotice("倉庫が容量オーバーです。荷物管理で売却するか、倉庫を拡張してから出発してください。");
      return;
    }
    onStart({
      dungeonType: dtype,
      startDepth:  (isDebug || isTutorial) ? 1 : startDepth,
      maxFloors:   currentType.maxFloors,
      startGold:   0,
      startInventory: hubInv,
    });
  };

  const handleStart = () => {
    if (hasGameSave()) { setConfirmOverwrite(true); setConfirmSel(0); }
    else { doStart(); }
  };

  kbRef.current = {
    confirmOverwrite, setConfirmOverwrite, confirmSel, setConfirmSel,
    dtype, setDtype, DUNGEON_TYPES, doStart, handleStart, onClose,
  };

  useEffect(() => {
    const fn = (e) => {
      const r = kbRef.current;
      const k = e.key.toLowerCase();
      if (r.confirmOverwrite) {
        if (isKeyUp(e) || isKeyDown(e)) {
          e.preventDefault(); r.setConfirmSel(p => p === 0 ? 1 : 0);
        } else if (k === "z" || k === "enter") {
          e.preventDefault();
          if (r.confirmSel === 0) r.doStart();
          else { r.setConfirmOverwrite(false); r.setConfirmSel(0); }
        } else if (k === "x" || k === "escape") {
          e.preventDefault(); r.setConfirmOverwrite(false); r.setConfirmSel(0);
        }
        return;
      }
      if (k === "x" || k === "escape") { r.onClose(); return; }
      const dtIdx = r.DUNGEON_TYPES.findIndex(dt => dt.id === r.dtype);
      if (isKeyUp(e)) {
        e.preventDefault();
        if (dtIdx > 0) r.setDtype(r.DUNGEON_TYPES[dtIdx - 1].id);
      } else if (isKeyDown(e)) {
        e.preventDefault();
        if (dtIdx < r.DUNGEON_TYPES.length - 1) r.setDtype(r.DUNGEON_TYPES[dtIdx + 1].id);
      } else if (k === "z" || k === "enter") {
        e.preventDefault(); r.handleStart();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  return (
    <Panel title="ダンジョン入口" onClose={onClose}>
      {/* 操作ガイド */}
      <div style={{ color:"#8a9ab0", fontSize:11, marginBottom:10 }}>
        ↑↓/テンキー8・2:ダンジョン選択　Z/Enter:出発　X:閉じる
      </div>
      {warehouseOver && (
        <div style={{ marginBottom:10, padding:"8px 10px", background:"#2a1a0d",
          border:"1px solid #6a4a2a", borderRadius:4, color:"#fc8", fontSize:12 }}>
          倉庫が容量オーバー中（{whCount}/{whMax}）。売却または拡張してから出発できます。
        </div>
      )}
      {notice && (
        <div style={{ marginBottom:10, padding:"6px 8px", background:"#2a0d0d",
          border:"1px solid #6a2a2a", borderRadius:4, color:"#f88", fontSize:12 }}>
          {notice}
        </div>
      )}

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
      {!isDebug && !isTutorial && (
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
                color: it.blessed ? "#ffd060" : it.cursed ? "#cc88ff" : "#aaa", fontSize:11,
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

      {confirmOverwrite ? (
        <div style={{ background:"#1a0a00", border:"1px solid #884400", borderRadius:6, padding:"12px 14px" }}>
          <div style={{ color:"#f84", fontSize:13, marginBottom:10 }}>
            ⚠ 中断セーブデータが存在します。<br />
            新たに出発すると中断データは消えますがよろしいですか？
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:8 }}>
            {[
              { label:"出発する", color:"#f84", bg:"#1a0800", bdr: confirmSel === 0 ? "#f84" : "#884400" },
              { label:"キャンセル", color:"#888", bg:CARD, bdr: confirmSel === 1 ? "#88f" : BDR },
            ].map(({ label, color, bg, bdr }, i) => (
              <button key={i}
                onClick={() => { if (i === 0) doStart(); else { setConfirmOverwrite(false); setConfirmSel(0); } }}
                style={{ ...BTN, padding:"10px 0", background:bg, color,
                  borderColor:bdr, fontWeight: confirmSel === i ? "bold" : "normal",
                  boxShadow: confirmSel === i ? `0 0 6px ${bdr}` : "none" }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ color:"#555", fontSize:11 }}>↑↓/テンキー8・2:選択　Z/Enter:決定　X:キャンセル</div>
        </div>
      ) : (
        <Btn label="▶ 冒険に出発！ [Z]" onClick={handleStart} color="#0f0"
          style={{ width:"100%", padding:"12px 0", fontSize:15, fontWeight:"bold",
            background:"#081808", borderColor:"#2a4a2a" }} />
      )}
    </Panel>
  );
}

/* ===== オンラインランキング ===== */
function RankingPanel({ saveData, onClose }) {
  const [scope, setScope] = useState("all"); /* all | mine */
  const [board, setBoard] = useState("score"); /* score | clear */
  const [dungeon, setDungeon] = useState("beginner");
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ totalRuns: 0, clears: {} });
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  /* focusArea: 0=scope 1=board 2=dungeon 3=list */
  const [focusArea, setFocusArea] = useState(0);
  const [listFocus, setListFocus] = useState(0);
  const kbRef = useRef(null);
  const listRowRefs = useRef([]);

  const playerId = saveData.playerId || "";
  const SCOPES = ["all", "mine"];
  const BOARDS = ["score", "clear"];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const [list, st] = await Promise.all([
        fetchRanking({
          board,
          dungeon,
          limit: 50,
          mine: scope === "mine",
          playerId: scope === "mine" ? playerId : undefined,
        }),
        fetchRankingStats(),
      ]);
      if (cancelled) return;
      setOffline(!!(list.offline || st.offline));
      setEntries(list.entries || []);
      setTotal(list.total || 0);
      setStats({ totalRuns: st.totalRuns || 0, clears: st.clears || {} });
      if (!list.ok && list.error && list.error !== "network") setError(list.error);
      setLoading(false);
      setListFocus(0);
    })();
    return () => { cancelled = true; };
  }, [scope, board, dungeon, playerId]);

  useEffect(() => {
    if (focusArea !== 3) return;
    listRowRefs.current[listFocus]?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [listFocus, focusArea, entries]);

  kbRef.current = {
    onClose, focusArea, setFocusArea, listFocus, setListFocus,
    scope, setScope, board, setBoard, dungeon, setDungeon,
    entries, SCOPES, BOARDS, dungeons: RANKING_DUNGEONS,
  };

  useEffect(() => {
    const fn = (e) => {
      const r = kbRef.current;
      const k = e.key.toLowerCase();
      if (k === "x" || k === "escape") {
        e.preventDefault();
        r.onClose();
        return;
      }
      if (isKeyUp(e)) {
        e.preventDefault();
        if (r.focusArea === 3) {
          if (r.listFocus > 0) r.setListFocus(r.listFocus - 1);
          else r.setFocusArea(2);
        } else {
          r.setFocusArea(a => Math.max(0, a - 1));
        }
        return;
      }
      if (isKeyDown(e)) {
        e.preventDefault();
        if (r.focusArea < 3) {
          r.setFocusArea(a => a + 1);
          if (r.focusArea + 1 === 3) r.setListFocus(0);
        } else if (r.entries.length > 0) {
          r.setListFocus(i => Math.min(r.entries.length - 1, i + 1));
        }
        return;
      }
      if (isKeyLeft(e) || isKeyRight(e)) {
        e.preventDefault();
        const dir = isKeyRight(e) ? 1 : -1;
        if (r.focusArea === 0) {
          const i = r.SCOPES.indexOf(r.scope);
          r.setScope(r.SCOPES[(i + dir + r.SCOPES.length) % r.SCOPES.length]);
        } else if (r.focusArea === 1) {
          const i = r.BOARDS.indexOf(r.board);
          r.setBoard(r.BOARDS[(i + dir + r.BOARDS.length) % r.BOARDS.length]);
        } else if (r.focusArea === 2) {
          const i = r.dungeons.findIndex(d => d.id === r.dungeon);
          const ni = (i + dir + r.dungeons.length) % r.dungeons.length;
          r.setDungeon(r.dungeons[ni].id);
        } else if (r.focusArea === 3 && r.entries.length > 0) {
          r.setListFocus(i => {
            const n = r.entries.length;
            return (i + dir + n) % n;
          });
        }
        return;
      }
      /* PageUp/PageDown: 一覧を大きく移動 */
      if (r.focusArea === 3 && r.entries.length > 0) {
        if (k === "pageup") {
          e.preventDefault();
          r.setListFocus(i => Math.max(0, i - 10));
        } else if (k === "pagedown" || k === " ") {
          e.preventDefault();
          r.setListFocus(i => Math.min(r.entries.length - 1, i + 10));
        }
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const focusRing = (active) => active
    ? { outline: "2px solid #4af", outlineOffset: 2, boxShadow: "0 0 8px #2060a0" }
    : {};

  const tabBtn = (id, label, active, onClick, focused) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...BTN, padding:"6px 12px", fontSize:12,
        background: active ? "#1a2840" : CARD,
        color: active ? "#8cf" : "#888",
        borderColor: active ? "#4af" : BDR,
        fontWeight: active ? "bold" : "normal",
        ...focusRing(focused && active),
        ...(focused && !active ? { borderColor: "#446" } : {}),
      }}
    >
      {label}
    </button>
  );

  return (
    <Panel title="ランキング" onClose={onClose} wide>
      <div style={{ color:"#8a9ab0", fontSize:11, marginBottom:10 }}>
        ↑↓/テンキー8・2:項目移動　←→/テンキー4・6:選択変更　X:閉じる
      </div>
      <div style={{
        display:"flex", flexWrap:"wrap", gap:8, marginBottom:10,
        padding: focusArea === 0 ? 4 : 0,
        borderRadius:6,
        border: focusArea === 0 ? "1px solid #2a4a6a" : "1px solid transparent",
      }}>
        {tabBtn("all", "全体", scope === "all", () => { setScope("all"); setFocusArea(0); }, focusArea === 0)}
        {tabBtn("mine", "自分", scope === "mine", () => { setScope("mine"); setFocusArea(0); }, focusArea === 0)}
      </div>
      <div style={{
        display:"flex", flexWrap:"wrap", gap:8, marginBottom:10,
        padding: focusArea === 1 ? 4 : 0,
        borderRadius:6,
        border: focusArea === 1 ? "1px solid #2a4a6a" : "1px solid transparent",
      }}>
        {tabBtn("score", "スコア", board === "score", () => { setBoard("score"); setFocusArea(1); }, focusArea === 1)}
        {tabBtn("clear", "クリアタイム", board === "clear", () => { setBoard("clear"); setFocusArea(1); }, focusArea === 1)}
      </div>
      <div style={{ marginBottom:10 }}>
        <div style={{
          display:"flex", flexWrap:"wrap", gap:6,
          padding: focusArea === 2 ? 4 : 0,
          borderRadius:6,
          border: focusArea === 2 ? "1px solid #2a4a6a" : "1px solid transparent",
        }}>
          {RANKING_DUNGEONS.map((d) => {
            const active = dungeon === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => { setDungeon(d.id); setFocusArea(2); }}
                style={{
                  ...BTN, padding:"8px 12px", fontSize:12,
                  background: active ? "#1a2840" : CARD,
                  color: active ? "#fc8" : "#888",
                  borderColor: active ? "#a80" : BDR,
                  fontWeight: active ? "bold" : "normal",
                  ...focusRing(focusArea === 2 && active),
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{
        display:"flex", gap:16, flexWrap:"wrap", marginBottom:12,
        padding:"8px 10px", background:"#0a0a12", borderRadius:5, fontSize:12, color:"#aaa",
      }}>
        <span>全世界挑戦: <b style={{ color:"#fff" }}>{stats.totalRuns}</b> 回</span>
        <span>このダンジョンクリア: <b style={{ color:"#8f8" }}>{stats.clears?.[dungeon] || 0}</b> 回</span>
        {offline && <span style={{ color:"#f80" }}>
          {scope === "mine" ? "オフライン（自分のローカル記録を表示）" : "オフライン（サーバー未接続）"}
        </span>}
      </div>
      {loading ? (
        <div style={{ color:"#666", padding:20, textAlign:"center" }}>読み込み中…</div>
      ) : error ? (
        <div style={{ color:"#f66", padding:12 }}>{error}</div>
      ) : entries.length === 0 ? (
        <div style={{
          color:"#666", padding:20, textAlign:"center",
          border: focusArea === 3 ? "1px solid #2a4a6a" : "1px solid transparent",
          borderRadius:6,
        }}>
          {scope === "mine" ? "まだ自分の記録がありません。" : "まだ記録がありません。"}
        </div>
      ) : (
        <div style={{
          overflowX:"auto",
          border: focusArea === 3 ? "1px solid #2a4a6a" : "1px solid transparent",
          borderRadius:6,
          padding: focusArea === 3 ? 4 : 0,
        }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, color:TXT }}>
            <thead>
              <tr style={{ color:"#666", textAlign:"left" }}>
                <th style={{ padding:"6px 4px", borderBottom:`1px solid ${BDR}` }}>#</th>
                <th style={{ padding:"6px 4px", borderBottom:`1px solid ${BDR}` }}>名前</th>
                <th style={{ padding:"6px 4px", borderBottom:`1px solid ${BDR}` }}>
                  {board === "clear" ? "時間" : "スコア"}
                </th>
                <th style={{ padding:"6px 4px", borderBottom:`1px solid ${BDR}` }}>T</th>
                <th style={{ padding:"6px 4px", borderBottom:`1px solid ${BDR}` }}>階</th>
                <th style={{ padding:"6px 4px", borderBottom:`1px solid ${BDR}` }}>結果</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const rankLabel = e.rank != null
                  ? (scope === "mine" && e.total ? `${e.rank}/${e.total}` : String(e.rank))
                  : String(i + 1);
                const metric = board === "clear"
                  ? formatElapsed(e.elapsedMs)
                  : `${e.score?.toLocaleString?.() ?? e.score}G`;
                const result = e.cleared ? "クリア" : e.survived ? "生還" : "死亡";
                const resultColor = e.cleared ? "#8f8" : e.survived ? "#8cf" : "#f88";
                const rowFocus = focusArea === 3 && listFocus === i;
                return (
                  <tr
                    key={e.runId || i}
                    ref={(el) => { listRowRefs.current[i] = el; }}
                    onClick={() => { setFocusArea(3); setListFocus(i); }}
                    style={{
                      borderBottom:`1px solid #1a1a28`,
                      background: rowFocus ? "#1a2840" : "transparent",
                      boxShadow: rowFocus ? "inset 0 0 0 1px #4af" : "none",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding:"7px 4px", color:GOLD }}>{rankLabel}</td>
                    <td style={{ padding:"7px 4px", color:"#eee" }}>{e.playerName || "???"}</td>
                    <td style={{ padding:"7px 4px", color:"#fc8" }}>{metric}</td>
                    <td style={{ padding:"7px 4px", color:"#888" }}>{e.turns ?? "-"}</td>
                    <td style={{ padding:"7px 4px", color:"#888" }}>B{e.depth ?? 0}</td>
                    <td style={{ padding:"7px 4px", color:resultColor }}>{result}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {scope === "all" && total > 0 && (
            <div style={{ color:"#555", fontSize:11, marginTop:8 }}>全 {total} 件中 上位を表示</div>
          )}
        </div>
      )}
      <div style={{ color:"#444", fontSize:10, marginTop:12, lineHeight:1.5 }}>
        スコア＝所持金＋所持品価値。クリアタイムは実時間（タブ非表示中は停止）。
        結果が出るたびに記録されます。チュートリアルは対象外。
      </div>
    </Panel>
  );
}

/* ===== 初回プレイヤー名入力 ===== */
function PlayerNameModal({ onConfirm }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const n = normalizePlayerName(value);
    if (!n.ok) {
      setError(n.error);
      return;
    }
    setError("");
    onConfirm(n.name);
  };

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.92)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:100, padding:16, fontFamily:"monospace",
    }}>
      <div style={{
        background:CARD, border:`1px solid ${BDR}`, borderRadius:8,
        width:"min(400px,96vw)", padding:20,
      }}>
        <div style={{ color:"#fff", fontWeight:"bold", fontSize:16, marginBottom:8 }}>
          プレイヤー名を入力
        </div>
        <div style={{ color:"#888", fontSize:12, marginBottom:14, lineHeight:1.5 }}>
          冒険者の名前です。ランキングにもこの名前が表示されます。
          （{PLAYER_NAME_MAX}文字以内）
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={PLAYER_NAME_MAX * 2}
          placeholder="例: しろがね"
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          }}
          style={{
            width:"100%", boxSizing:"border-box", padding:"10px 12px",
            background:"#0a0a12", border:`1px solid ${BDR}`, borderRadius:5,
            color:"#eee", fontFamily:"monospace", fontSize:15, outline:"none",
          }}
        />
        {error && (
          <div style={{ color:"#f66", fontSize:12, marginTop:8 }}>{error}</div>
        )}
        <button
          type="button"
          onClick={submit}
          style={{
            ...BTN, width:"100%", marginTop:16, padding:"12px 0",
            background:"#0c2240", color:"#4df", borderColor:"#1a3a5a",
            fontSize:15, fontWeight:"bold",
          }}
        >
          決定
        </button>
      </div>
    </div>
  );
}

/* ===== 初回：好きな食べ物入力 ===== */
function FavoriteFoodModal({ onConfirm }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const n = normalizeFavoriteFood(value);
    if (!n.ok) {
      setError(n.error);
      return;
    }
    setError("");
    onConfirm(n.name);
  };

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.92)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:100, padding:16, fontFamily:"monospace",
    }}>
      <div style={{
        background:CARD, border:`1px solid ${BDR}`, borderRadius:8,
        width:"min(400px,96vw)", padding:20,
      }}>
        <div style={{ color:"#fff", fontWeight:"bold", fontSize:16, marginBottom:14 }}>
          好きな食べ物は？
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={FAVORITE_FOOD_MAX * 2}
          placeholder=""
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          }}
          style={{
            width:"100%", boxSizing:"border-box", padding:"10px 12px",
            background:"#0a0a12", border:`1px solid ${BDR}`, borderRadius:5,
            color:"#eee", fontFamily:"monospace", fontSize:15, outline:"none",
          }}
        />
        {error && (
          <div style={{ color:"#f66", fontSize:12, marginTop:8 }}>{error}</div>
        )}
        <button
          type="button"
          onClick={submit}
          style={{
            ...BTN, width:"100%", marginTop:16, padding:"12px 0",
            background:"#0c2240", color:"#4df", borderColor:"#1a3a5a",
            fontSize:15, fontWeight:"bold",
          }}
        >
          決定
        </button>
      </div>
    </div>
  );
}

/* ===== 初回：グラフィックスタイル選択 ===== */
function GraphicStyleModal({ onConfirm }) {
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(0);

  useEffect(() => {
    const fn = (e) => {
      if (isKeyUp(e)) {
        e.preventDefault();
        selectedRef.current = (selectedRef.current + GRAPHIC_STYLE_OPTIONS.length - 1) % GRAPHIC_STYLE_OPTIONS.length;
        setSelected(selectedRef.current);
      } else if (isKeyDown(e)) {
        e.preventDefault();
        selectedRef.current = (selectedRef.current + 1) % GRAPHIC_STYLE_OPTIONS.length;
        setSelected(selectedRef.current);
      } else if (e.key.toLowerCase() === "z" || e.key === "Enter") {
        e.preventDefault();
        onConfirm(GRAPHIC_STYLE_OPTIONS[selectedRef.current].id);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onConfirm]);

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.92)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:100, padding:16, fontFamily:"monospace",
    }}>
      <div style={{
        background:CARD, border:`1px solid ${BDR}`, borderRadius:8,
        width:"min(430px,96vw)", padding:20,
      }}>
        <div style={{ color:"#fff", fontWeight:"bold", fontSize:16, marginBottom:8 }}>
          グラフィックスタイルを選択
        </div>
        <div style={{ color:"#888", fontSize:12, marginBottom:14, lineHeight:1.5 }}>
          冒険中に使うタイル画像のスタイルです。あとから設定で変更できます。
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {GRAPHIC_STYLE_OPTIONS.map((option, index) => {
            const active = selected === index;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => { selectedRef.current = index; setSelected(index); onConfirm(option.id); }}
                style={{
                  ...BTN, textAlign:"left", padding:"10px 12px",
                  background: active ? "#1a2940" : "#0d0d16",
                  color: active ? "#fff" : "#aaa",
                  borderColor: active ? "#4d8cff" : BDR,
                }}
              >
                <div style={{ fontWeight:"bold", fontSize:14 }}>{active ? "▶ " : "　"}{option.label}</div>
                <div style={{ color: active ? "#9bc5ff" : "#666", fontSize:11, marginTop:3, paddingLeft:20 }}>{option.desc}</div>
              </button>
            );
          })}
        </div>
        <div style={{ color:"#666", fontSize:11, marginTop:12 }}>↑↓／テンキー8・2:選択　Z／Enter:決定</div>
      </div>
    </div>
  );
}

/* ===== セーブデータ管理パネル ===== */
function SaveDataPanel({ saveData, updateSave, onClearSave, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const [confirmSel, setConfirmSel] = useState(0); /* 0=消去 1=キャンセル */
  const [editMode, setEditMode] = useState(null); /* null | "name" | "food" */
  const [nameDraft, setNameDraft] = useState(saveData.playerName || "");
  const [foodDraft, setFoodDraft] = useState(saveData.favoriteFood || "");
  const [editError, setEditError] = useState("");
  const [btnFocus, setBtnFocus] = useState(0); /* 0=名前 1=食べ物 2=データ消去 */
  const editInputRef = useRef(null);
  const kbRef = useRef(null);

  useEffect(() => {
    if (editMode === "name") {
      setNameDraft(saveData.playerName || "");
      setEditError("");
      setTimeout(() => editInputRef.current?.focus(), 0);
    } else if (editMode === "food") {
      setFoodDraft(saveData.favoriteFood || "");
      setEditError("");
      setTimeout(() => editInputRef.current?.focus(), 0);
    }
  }, [editMode, saveData.playerName, saveData.favoriteFood]);

  const applyEdit = () => {
    if (editMode === "name") {
      const applied = applyPlayerNameToSave(saveData, nameDraft);
      if (!applied.ok) {
        setEditError(applied.error);
        return false;
      }
      updateSave(() => applied.save);
    } else if (editMode === "food") {
      const applied = applyFavoriteFoodToSave(saveData, foodDraft);
      if (!applied.ok) {
        setEditError(applied.error);
        return false;
      }
      updateSave(() => applied.save);
    }
    setEditMode(null);
    setEditError("");
    return true;
  };

  const cancelEdit = () => {
    setEditMode(null);
    setNameDraft(saveData.playerName || "");
    setFoodDraft(saveData.favoriteFood || "");
    setEditError("");
  };

  kbRef.current = {
    onClose, confirm, setConfirm, confirmSel, setConfirmSel,
    editMode, btnFocus, setBtnFocus, applyEdit, cancelEdit,
    setEditMode, onClearSave,
  };

  useEffect(() => {
    const fn = (e) => {
      const r = kbRef.current;
      const k = e.key.toLowerCase();
      const tag = (e.target && e.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA";

      if (r.editMode) {
        if (k === "escape") {
          e.preventDefault();
          r.cancelEdit();
        } else if ((k === "enter" || k === "z") && !e.nativeEvent?.isComposing) {
          /* 入力中の Z は文字として扱う。Enter のみ決定 */
          if (k === "enter") {
            e.preventDefault();
            r.applyEdit();
          }
        }
        return;
      }

      if (typing) return;

      if (r.confirm) {
        if (isKeyUp(e) || isKeyDown(e) || isKeyLeft(e) || isKeyRight(e)) {
          e.preventDefault();
          r.setConfirmSel(s => (s === 0 ? 1 : 0));
        } else if (k === "z" || k === "enter") {
          e.preventDefault();
          if (r.confirmSel === 0) { r.onClearSave(); r.onClose(); }
          else { r.setConfirm(false); r.setConfirmSel(0); }
        } else if (k === "x" || k === "escape") {
          e.preventDefault();
          r.setConfirm(false);
          r.setConfirmSel(0);
        }
        return;
      }

      if (k === "x" || k === "escape") {
        e.preventDefault();
        r.onClose();
        return;
      }
      if (isKeyUp(e)) {
        e.preventDefault();
        r.setBtnFocus(f => (f + 2) % 3);
      } else if (isKeyDown(e)) {
        e.preventDefault();
        r.setBtnFocus(f => (f + 1) % 3);
      } else if (k === "z" || k === "enter") {
        e.preventDefault();
        if (r.btnFocus === 0) r.setEditMode("name");
        else if (r.btnFocus === 1) r.setEditMode("food");
        else { r.setConfirm(true); r.setConfirmSel(0); }
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const btnStyle = (focused, color) => ({
    ...BTN,
    width: "100%",
    padding: "10px 0",
    fontSize: 13,
    color,
    background: focused ? "#1a1a30" : CARD,
    borderColor: focused ? "#44f" : BDR,
    boxShadow: focused ? "0 0 8px #224" : "none",
    fontWeight: focused ? "bold" : "normal",
  });

  return (
    <Panel title="セーブデータ管理" onClose={onClose}>
      <div style={{ color:"#8a9ab0", fontSize:11, marginBottom:10 }}>
        {editMode
          ? "Enter:決定　Esc:キャンセル"
          : confirm
            ? "←→/↑↓:選択　Z/Enter:決定　X:戻る"
            : "↑↓:選択　Z/Enter:決定　X:閉じる"}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8, color:TXT }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"6px 0", borderBottom:`1px solid ${BDR}`, gap:8, flexWrap:"wrap" }}>
          <span style={{ color:"#888" }}>プレイヤー名</span>
          <span style={{ color:"#8cf", fontWeight:"bold" }}>{playerLabel(saveData.playerName)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"6px 0", borderBottom:`1px solid ${BDR}`, gap:8, flexWrap:"wrap" }}>
          <span style={{ color:"#888" }}>好きな食べ物</span>
          <span style={{ color:"#fc8", fontWeight:"bold" }}>{favoriteFoodLabel(saveData.favoriteFood)}</span>
        </div>
        {editMode === "name" && (
          <div style={{ padding:"10px 0", borderBottom:`1px solid ${BDR}` }}>
            <div style={{ color:"#aaa", fontSize:12, marginBottom:6 }}>
              新しい名前（{PLAYER_NAME_MAX}文字以内）
            </div>
            <input
              ref={editInputRef}
              type="text"
              value={nameDraft}
              maxLength={PLAYER_NAME_MAX * 2}
              onChange={(e) => { setNameDraft(e.target.value); setEditError(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              style={{
                width:"100%", boxSizing:"border-box", padding:"8px 10px",
                background:"#0a0a12", border:`1px solid ${BDR}`, borderRadius:5,
                color:"#eee", fontFamily:"monospace", fontSize:14, outline:"none",
              }}
            />
            {editError && (
              <div style={{ color:"#f66", fontSize:12, marginTop:6 }}>{editError}</div>
            )}
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <Btn label="変更する [Enter]" onClick={applyEdit} color="#4df"
                style={{ flex:1, background:"#0c2240" }} />
              <Btn label="キャンセル [Esc]" onClick={cancelEdit} color="#888" style={{ flex:1 }} />
            </div>
          </div>
        )}
        {editMode === "food" && (
          <div style={{ padding:"10px 0", borderBottom:`1px solid ${BDR}` }}>
            <div style={{ color:"#aaa", fontSize:12, marginBottom:6 }}>
              好きな食べ物は？（{FAVORITE_FOOD_MAX}文字以内）
            </div>
            <input
              ref={editInputRef}
              type="text"
              value={foodDraft}
              maxLength={FAVORITE_FOOD_MAX * 2}
              onChange={(e) => { setFoodDraft(e.target.value); setEditError(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              style={{
                width:"100%", boxSizing:"border-box", padding:"8px 10px",
                background:"#0a0a12", border:`1px solid ${BDR}`, borderRadius:5,
                color:"#eee", fontFamily:"monospace", fontSize:14, outline:"none",
              }}
            />
            {editError && (
              <div style={{ color:"#f66", fontSize:12, marginTop:6 }}>{editError}</div>
            )}
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <Btn label="変更する [Enter]" onClick={applyEdit} color="#4df"
                style={{ flex:1, background:"#0c2240" }} />
              <Btn label="キャンセル [Esc]" onClick={cancelEdit} color="#888" style={{ flex:1 }} />
            </div>
          </div>
        )}
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
      <div style={{ marginTop:20, display:"flex", flexDirection:"column", gap:8 }}>
        {!editMode && !confirm && (
          <>
            <button
              type="button"
              onClick={() => { setBtnFocus(0); setEditMode("name"); }}
              style={btnStyle(btnFocus === 0, "#8cf")}
            >
              プレイヤー名を変更
            </button>
            <button
              type="button"
              onClick={() => { setBtnFocus(1); setEditMode("food"); }}
              style={btnStyle(btnFocus === 1, "#fc8")}
            >
              好きな食べ物を変更
            </button>
            <button
              type="button"
              onClick={() => { setBtnFocus(2); setConfirm(true); setConfirmSel(0); }}
              style={{ ...btnStyle(btnFocus === 2, "#f44"), background: btnFocus === 2 ? "#2a1010" : "#180808" }}
            >
              セーブデータを消去
            </button>
          </>
        )}
        {confirm && (
          <div>
            <div style={{ color:"#f44", marginBottom:10, fontSize:13 }}>本当に消去しますか？この操作は取り消せません。</div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn
                label="消去する"
                onClick={() => { onClearSave(); onClose(); }}
                color="#f44"
                style={{
                  flex:1,
                  borderColor: confirmSel === 0 ? "#f44" : BDR,
                  boxShadow: confirmSel === 0 ? "0 0 8px #622" : "none",
                  fontWeight: confirmSel === 0 ? "bold" : "normal",
                }}
              />
              <Btn
                label="キャンセル"
                onClick={() => { setConfirm(false); setConfirmSel(0); }}
                color="#888"
                style={{
                  flex:1,
                  borderColor: confirmSel === 1 ? "#88f" : BDR,
                  boxShadow: confirmSel === 1 ? "0 0 8px #224" : "none",
                  fontWeight: confirmSel === 1 ? "bold" : "normal",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ===== メインHUBスクリーン ===== */
export default function HubScreen({ saveData, updateSave, onStartDungeon, onResumeDungeon, onClearSave }) {
  const [panel, setPanel] = useState(null); /* "dungeon" | "items" | "shop" | "encyclopedia" | "savedata" | "ranking" */
  const [mainFocus, setMainFocus] = useState(0);
  const kbRef = useRef(null);

  const needsName = !String(saveData.playerName || "").trim();
  const needsFood = !String(saveData.favoriteFood || "").trim();
  const hasGraphicStyle = GRAPHIC_STYLE_OPTIONS.some(({ id }) => id === saveData.graphicStyle);
  /* 過去の途中セーブにgraphicStyleだけ残っていても、初回設定完了までは選択を省略しない。 */
  const needsStyle = !hasGraphicStyle || saveData.initialSetupComplete !== true;
  /* 名前 → 好きな食べ物 → グラフィックスタイルの順で初回設定する */
  const needsSetup = needsName || needsFood || needsStyle;
  const hubGold      = saveData.hubGold      || 0;
  const hubInvCount  = (saveData.hubInventory || []).length;
  const warehouseCount = (saveData.warehouse  || []).length;
  const warehouseMax     = saveData.warehouseMax || 100;
  const warehouseOver    = isWarehouseOverCapacity(warehouseCount, warehouseMax);

  const handleConfirmName = (name) => {
    updateSave(prev => {
      const applied = applyPlayerNameToSave(prev, name);
      return applied.ok ? applied.save : prev;
    });
  };

  const handleConfirmFood = (food) => {
    updateSave(prev => {
      const applied = applyFavoriteFoodToSave(prev, food);
      return applied.ok ? applied.save : prev;
    });
  };

  const handleConfirmStyle = (style) => {
    if (!GRAPHIC_STYLE_OPTIONS.some(({ id }) => id === style)) return;
    try { localStorage.setItem("roguelike_tileset", style); } catch {}
    updateSave(prev => ({ ...prev, graphicStyle: style, initialSetupComplete: true }));
  };

  const handleStartDungeon = (config) => {
    if (needsSetup) return;
    try { localStorage.setItem("roguelike_tileset", saveData.graphicStyle); } catch {}
    setPanel(null);
    onStartDungeon(config);
  };

  const resumeExists = hasGameSave() && !!onResumeDungeon;
  const mainItems = [
    ...(resumeExists                  ? [{ id:"resume" }]       : []),
    { id:"dungeon" }, { id:"items" }, { id:"shop" },
    { id:"encyclopedia" }, { id:"ranking" }, { id:"savedata" },
  ];
  const activateMain = (id) => {
    if (needsSetup) return;
    if (id === "resume") onResumeDungeon?.();
    else setPanel(id);
  };

  kbRef.current = { panel, mainFocus, setMainFocus, mainItems, activateMain, needsSetup };

  useEffect(() => {
    const fn = (e) => {
      const r = kbRef.current;
      if (r.needsSetup) return; // 名前・食べ物入力中は地上キーを無効
      if (r.panel !== null) return; // 各パネルが自前でハンドリング
      const k = e.key.toLowerCase();
      if (isKeyUp(e) || isKeyLeft(e)) {
        e.preventDefault(); r.setMainFocus(p => Math.max(0, p - 1));
      } else if (isKeyDown(e) || isKeyRight(e)) {
        e.preventDefault(); r.setMainFocus(p => Math.min(r.mainItems.length - 1, p + 1));
      } else if (k === "z" || k === "enter") {
        e.preventDefault();
        const item = r.mainItems[r.mainFocus];
        if (item) r.activateMain(item.id);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const focusedId = mainItems[mainFocus]?.id;

  const HubBtn = ({ icon, label, sub, onClick, color="#8cf", btnId }) => {
    const isFocus = focusedId === btnId;
    return (
      <button onClick={onClick} style={{
        ...BTN, display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", gap:4,
        padding:"16px 0", flex:1, minWidth:100, maxWidth:160,
        background: isFocus ? "#1a1a30" : CARD, color,
        borderColor: isFocus ? "#44f" : BDR,
        boxShadow: isFocus ? "0 0 8px #224" : "none",
      }}>
        <span style={{ fontSize:22 }}>{icon}</span>
        <span style={{ fontSize:13, fontWeight:"bold" }}>{label}</span>
        {sub && <span style={{ fontSize:10, color:"#555" }}>{sub}</span>}
      </button>
    );
  };

  return (
    <div style={{
      background:BG, minHeight:"100dvh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      fontFamily:"monospace", color:TXT, padding:16,
    }}>

      {warehouseOver && (
        <div style={{
          width:"min(680px,96vw)", marginBottom:16, padding:"10px 14px",
          background:"#2a1a0d", border:"1px solid #6a4a2a", borderRadius:6,
          color:"#fc8", fontSize:13,
        }}>
          倉庫が容量オーバーです（{warehouseCount}/{warehouseMax}）。
          荷物管理で売却するか、倉庫を拡張するまで新しい冒険に出発できません。
        </div>
      )}

      {/* タイトル */}
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ fontSize:28, fontWeight:"bold", color:"#fff",
          textShadow:"0 0 16px #446", letterSpacing:4 }}>
          ⚔ 地 上 ⚔
        </div>
        <div style={{ color:"#555", fontSize:12, marginTop:4 }}>
          冒険者の拠点
        </div>
        {!needsSetup && (
          <div style={{ color:"#8cf", fontSize:13, marginTop:8 }}>
            冒険者: <span style={{ color:"#fff", fontWeight:"bold" }}>{playerLabel(saveData.playerName)}</span>
            <span style={{ color:"#666" }}> ／ </span>
            <span style={{ color:"#fc8" }}>好物: {favoriteFoodLabel(saveData.favoriteFood)}</span>
          </div>
        )}
      </div>

      {needsName && <PlayerNameModal onConfirm={handleConfirmName} />}
      {!needsName && needsFood && <FavoriteFoodModal onConfirm={handleConfirmFood} />}
      {!needsName && !needsFood && needsStyle && <GraphicStyleModal onConfirm={handleConfirmStyle} />}

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
          <div style={{ color: warehouseOver ? "#f84" : "#8af", fontWeight:"bold", fontSize:18 }}>
            {hubInvCount}/{warehouseCount}
            {warehouseOver && <span style={{ fontSize:12 }}> (上限{warehouseMax})</span>}
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

      {/* キーボードガイド */}
      <div style={{ color:"#8a9ab0", fontSize:11, marginBottom:12, textAlign:"center" }}>
        ↑↓/テンキー8・2:選択　Z/Enter:決定
      </div>

      {/* 中断データがある場合：再開ボタン */}
      {resumeExists && (
        <button
          onClick={() => { if (!needsSetup) onResumeDungeon?.(); }}
          style={{
            ...BTN, width:"min(360px,90vw)", padding:"18px 0", marginBottom:8,
            background: focusedId === "resume" ? "#233a0e" : "#1a2808", color:"#8f4",
            borderColor: focusedId === "resume" ? "#8f4" : "#3a5a1a",
            fontSize:17, fontWeight:"bold",
            boxShadow: focusedId === "resume" ? "0 0 12px #4a8a20" : "0 0 16px #283808",
          }}
        >
          ▶ 冒険を再開する
        </button>
      )}

      {/* メインボタン：ダンジョンへ */}
      <button
        onClick={() => { if (!needsSetup) setPanel("dungeon"); }}
        style={{
          ...BTN, width:"min(360px,90vw)", padding:"18px 0", marginBottom:16,
          background: focusedId === "dungeon" ? "#0c2240" : "#081828", color:"#4df",
          borderColor: focusedId === "dungeon" ? "#4df" : "#1a3a5a",
          fontSize:17, fontWeight:"bold",
          boxShadow: focusedId === "dungeon" ? "0 0 12px #2060a0" : "0 0 16px #082838",
        }}
      >
        ▶ ダンジョンへ出発
      </button>

      {/* サブ機能ボタン */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center",
        width:"min(360px,90vw)", marginBottom:20 }}>
        <HubBtn icon="🎒" label="荷物管理" btnId="items"
          sub={`持参${hubInvCount}・倉庫${warehouseCount}`}
          onClick={() => setPanel("items")} color="#8af" />
        <HubBtn icon="🏪" label="ショップ" btnId="shop" sub="装備・道具"
          onClick={() => setPanel("shop")} color={GOLD} />
        <HubBtn icon="📖" label="図鑑"     btnId="encyclopedia" sub="発見記録"
          onClick={() => setPanel("encyclopedia")} color="#a8f" />
        <HubBtn icon="🏆" label="ランキング" btnId="ranking" sub="全体・自分"
          onClick={() => { if (!needsSetup) setPanel("ranking"); }} color="#fc8" />
        <HubBtn icon="💾" label="データ"   btnId="savedata" sub="セーブ管理"
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
      {panel === "ranking" && (
        <RankingPanel
          saveData={saveData}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "savedata" && (
        <SaveDataPanel
          saveData={saveData}
          updateSave={updateSave}
          onClearSave={onClearSave}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
