import { useState, useMemo } from "react";
import { uid } from "./utils.js";
import { clearSave } from "./SaveData.js";

/* ===== 拠点ショップの商品ラインナップ ===== */
const HUB_SHOP_ITEMS = [
  /* 薬 */
  { name:"回復薬",           type:"potion", effect:"heal",        tile:16, desc:"HPを少し回復する。",         price: 30  },
  { name:"大回復薬",         type:"potion", effect:"heal",        tile:17, desc:"HPを大幅に回復する。",       price: 80, blessed:true  },
  { name:"力の薬",           type:"potion", effect:"power",       tile:17, desc:"飲むと力が湧いてくる。",     price: 120 },
  { name:"マナ回復薬",       type:"potion", effect:"mana",        tile:16, desc:"MPを20回復する。",           price: 60  },
  { name:"視力の薬",         type:"potion", effect:"sight",       tile:16, desc:"全フロアが見えるようになる。",price: 150 },
  /* 巻物 */
  { name:"武器強化の巻物",   type:"scroll", effect:"weapon_up",   tile:18, desc:"装備中の武器の＋値を1上げる。",price:100 },
  { name:"防具強化の巻物",   type:"scroll", effect:"armor_up",    tile:18, desc:"装備中の防具の＋値を1上げる。",price:100 },
  { name:"マップの巻物",     type:"scroll", effect:"reveal",      tile:18, desc:"フロア全体と罠が明らかになる。",price: 80 },
  { name:"祝福の巻物",       type:"scroll", effect:"bless",       tile:18, desc:"アイテムを祝福する。",        price:200 },
  /* 武器 */
  { name:"短剣",             type:"weapon", atk:3,   tile:20, desc:"軽いダガー。",           price: 50  },
  { name:"ロングソード",     type:"weapon", atk:6,   tile:20, desc:"冒険者の定番武器。",     price:150  },
  { name:"バトルアクス",     type:"weapon", atk:10,  tile:20, desc:"重厚な戦斧。",           price:300  },
  /* 防具 */
  { name:"革の鎧",           type:"armor",  def:2,   tile:21, desc:"軽い鎧。",               price: 80  },
  { name:"鎖帷子",           type:"armor",  def:5,   tile:21, desc:"斬撃に強い鎧。",         price:200  },
  { name:"プレートメイル",   type:"armor",  def:8,   tile:21, desc:"最強の重装鎧。",         price:400  },
  /* 食料 */
  { name:"パン",             type:"food",   effect:"food_bread",  tile:19, desc:"空腹を満たす。",             price: 20  },
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
    style={{
      ...BTN,
      padding:"10px 18px",
      background:CARD,
      color,
      ...style,
    }}
  >
    {label}
  </button>
);

/* ===== PANEL COMPONENT ===== */
function Panel({ title, onClose, children, wide }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.88)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:50,
    }}>
      <div style={{
        background:CARD, border:`1px solid ${BDR}`, borderRadius:8,
        width: wide ? "min(680px,96vw)" : "min(420px,96vw)",
        maxHeight:"88vh", overflow:"auto",
        padding:0, display:"flex", flexDirection:"column",
      }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:`1px solid ${BDR}` }}>
          <span style={{ color:"#fff", fontWeight:"bold", fontSize:15 }}>{title}</span>
          <button onClick={onClose} style={{ ...BTN, padding:"2px 10px", color:"#888", fontSize:13 }}>✕</button>
        </div>
        <div style={{ padding:14, flex:1, overflow:"auto" }}>{children}</div>
      </div>
    </div>
  );
}

/* ===== 倉庫パネル ===== */
function WarehousePanel({ saveData, updateSave, onClose, onItemsSelected, selectionMode }) {
  const [selected, setSelected] = useState(new Set());
  const wh = saveData.warehouse || [];
  const MAX = 30;

  const toggle = (idx) => setSelected(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });

  const removeItems = () => {
    const indices = [...selected].sort((a,b) => b-a);
    updateSave(prev => {
      const wh2 = [...prev.warehouse];
      indices.forEach(i => wh2.splice(i, 1));
      return { ...prev, warehouse: wh2 };
    });
    setSelected(new Set());
  };

  const takeToAdventure = () => {
    if (!selectionMode || selected.size === 0) return;
    const takenItems = [...selected].map(i => wh[i]).filter(Boolean).map(it => ({ ...it, id: uid() }));
    onItemsSelected && onItemsSelected(takenItems);
  };

  return (
    <Panel title={`倉庫 (${wh.length}/${MAX})`} onClose={onClose}>
      {wh.length === 0 ? (
        <div style={{ color:"#555", textAlign:"center", padding:"24px 0" }}>倉庫は空です。</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          {wh.map((item, i) => (
            <div
              key={i}
              onClick={() => toggle(i)}
              style={{
                display:"flex", alignItems:"center", gap:8, padding:"6px 8px",
                background: selected.has(i) ? "#1a1a30" : "#0d0d18",
                border: `1px solid ${selected.has(i) ? "#44f" : "#222"}`,
                borderRadius:4, cursor:"pointer",
              }}
            >
              <span style={{ color: selected.has(i) ? "#8af" : "#777", width:16 }}>
                {selected.has(i) ? "☑" : "☐"}
              </span>
              <span style={{ color:TXT, flex:1 }}>{item.name}</span>
              {item.blessed && <span style={{ color:"#4af", fontSize:11 }}>【祝】</span>}
              {item.cursed  && <span style={{ color:"#f44", fontSize:11 }}>【呪】</span>}
            </div>
          ))}
        </div>
      )}
      {wh.length > 0 && (
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          {selectionMode ? (
            <Btn label={`選択アイテムを持っていく (${selected.size})`} onClick={takeToAdventure} color="#0f0" />
          ) : (
            <Btn label={`選択アイテムを捨てる (${selected.size})`} onClick={removeItems} color="#f44"
              style={{ opacity: selected.size === 0 ? 0.4 : 1 }} />
          )}
        </div>
      )}
    </Panel>
  );
}

/* ===== 図鑑パネル ===== */
function EncyclopediaPanel({ saveData, onClose }) {
  const [tab, setTab] = useState("items");
  const disc = saveData.discovered || {};

  const tabStyle = (t) => ({
    ...BTN, padding:"6px 16px",
    background: tab === t ? "#1a1a30" : CARD,
    color: tab === t ? "#8af" : "#666",
    borderColor: tab === t ? "#44f" : BDR,
  });

  const renderList = (entries, nameKey="name") => {
    const items = Object.values(entries);
    if (items.length === 0)
      return <div style={{ color:"#555", padding:"20px 0", textAlign:"center" }}>まだ発見がありません。</div>;
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
        {items.sort((a,b) => a.name.localeCompare(b.name, "ja")).map((e, i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 8px",
            background:"#0d0d18", borderRadius:3, color:TXT }}>
            <span>{e.name}</span>
            <span style={{ color:"#555" }}>×{e.count}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Panel title="図鑑" onClose={onClose} wide>
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        <button onClick={() => setTab("items")}    style={tabStyle("items")}>アイテム</button>
        <button onClick={() => setTab("monsters")} style={tabStyle("monsters")}>モンスター</button>
        <button onClick={() => setTab("traps")}    style={tabStyle("traps")}>罠</button>
      </div>
      <div style={{ color:"#555", fontSize:11, marginBottom:8 }}>
        {tab === "items"    && `発見アイテム: ${Object.keys(disc.items    || {}).length}種`}
        {tab === "monsters" && `遭遇モンスター: ${Object.keys(disc.monsters || {}).length}種`}
        {tab === "traps"    && `踏んだ罠: ${Object.keys(disc.traps    || {}).length}種`}
      </div>
      {tab === "items"    && renderList(disc.items    || {})}
      {tab === "monsters" && renderList(disc.monsters || {})}
      {tab === "traps"    && renderList(disc.traps    || {})}
    </Panel>
  );
}

/* ===== 拠点ショップパネル ===== */
function HubShopPanel({ saveData, updateSave, onClose }) {
  const [selected, setSelected] = useState(null);
  const gold = saveData.hubGold || 0;

  const buy = (item) => {
    if (gold < item.price) return;
    const newItem = { ...item, id: uid(), price: undefined };
    delete newItem.price;
    updateSave(prev => ({
      ...prev,
      hubGold: prev.hubGold - item.price,
      warehouse: [...(prev.warehouse || []), newItem].slice(0, 30),
    }));
  };

  return (
    <Panel title="拠点ショップ" onClose={onClose} wide>
      <div style={{ color:GOLD, marginBottom:10, fontSize:14 }}>
        所持G: <strong>{gold}G</strong>
        <span style={{ color:"#555", fontSize:11, marginLeft:10 }}>購入品は倉庫に追加されます</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {HUB_SHOP_ITEMS.map((item, i) => {
          const canBuy = gold >= item.price;
          const isSel = selected === i;
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
                {item.name}
                {item.blessed && <span style={{ color:"#4af", fontSize:11 }}> 【祝】</span>}
                <span style={{ color:"#555", fontSize:11, marginLeft:6 }}>{item.desc}</span>
              </span>
              <span style={{ color: canBuy ? GOLD : "#444", minWidth:50, textAlign:"right" }}>
                {item.price}G
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
  const [showWarehouse, setShowWarehouse] = useState(false);
  const [chosenItems, setChosenItems] = useState([]);
  const bestDepth = saveData.bestDepth || 0;

  const DUNGEON_TYPES = [
    { id:"normal",  label:"通常ダンジョン",     desc:"B1Fから探索開始", color:"#8cf" },
    { id:"debug",   label:"デバッグダンジョン", desc:"全アイテム・全モンスター配置（テスト用）", color:"#fa0" },
  ];
  const [dtype, setDtype] = useState("normal");

  const handleStart = () => {
    onStart({
      dungeonType: dtype,
      startDepth: dtype === "debug" ? 1 : startDepth,
      startGold: 0,
      startInventory: chosenItems,
    });
  };

  if (showWarehouse)
    return (
      <WarehousePanel
        saveData={saveData}
        updateSave={() => {}}
        onClose={() => setShowWarehouse(false)}
        selectionMode
        onItemsSelected={items => { setChosenItems(items); setShowWarehouse(false); }}
      />
    );

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

      {/* 開始階選択 (通常ダンジョンのみ) */}
      {dtype === "normal" && (
        <div style={{ marginBottom:12 }}>
          <div style={{ color:"#888", fontSize:12, marginBottom:6 }}>開始階: B{startDepth}F</div>
          <input type="range" min={1} max={Math.max(1, bestDepth)} value={startDepth}
            onChange={e => setStartDepth(Number(e.target.value))}
            style={{ width:"100%", accentColor:"#44f" }} />
          <div style={{ color:"#555", fontSize:11 }}>
            解放済み: B{Math.max(1, bestDepth)}F {bestDepth === 0 && "(B1Fのみ)"}
          </div>
        </div>
      )}

      {/* 倉庫から持っていくアイテム */}
      <div style={{ marginBottom:14 }}>
        <div style={{ color:"#888", fontSize:12, marginBottom:6 }}>
          倉庫から持参: {chosenItems.length > 0 ? `${chosenItems.length}個選択` : "なし"}
        </div>
        <Btn label="倉庫からアイテムを選ぶ" onClick={() => setShowWarehouse(true)} color="#aaa"
          style={{ fontSize:12 }} />
        {chosenItems.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
            {chosenItems.map((it, i) => (
              <span key={i} style={{ background:"#1a1a28", border:"1px solid #333", borderRadius:3,
                padding:"2px 6px", color:TXT, fontSize:11 }}>{it.name}</span>
            ))}
          </div>
        )}
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
export default function HubScreen({ saveData, updateSave, onStartDungeon, onClearSave }) {
  const [panel, setPanel] = useState(null); /* "dungeon" | "warehouse" | "shop" | "encyclopedia" | "savedata" */

  const hubGold = saveData.hubGold || 0;
  const warehouseCount = (saveData.warehouse || []).length;

  const handleStartDungeon = (config) => {
    setPanel(null);
    onStartDungeon(config);
  };

  /* ===== HubAction ボタンコンポーネント ===== */
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
          <div style={{ color:"#8af", fontWeight:"bold", fontSize:18 }}>{warehouseCount}/30</div>
          <div style={{ color:"#555", fontSize:10 }}>倉庫</div>
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
        <HubBtn icon="📦" label="倉庫"     sub={`${warehouseCount}/30`} onClick={() => setPanel("warehouse")} color="#8af" />
        <HubBtn icon="🏪" label="ショップ" sub="装備・道具"             onClick={() => setPanel("shop")}      color={GOLD}  />
        <HubBtn icon="📖" label="図鑑"     sub="発見記録"               onClick={() => setPanel("encyclopedia")} color="#a8f" />
        <HubBtn icon="💾" label="データ"   sub="セーブ管理"             onClick={() => setPanel("savedata")}  color="#888"  />
      </div>

      {/* ヒント */}
      <div style={{ color:"#333", fontSize:11, textAlign:"center" }}>
        ダンジョンで獲得した金貨の50%が地上に持ち帰られます
      </div>

      {/* パネル */}
      {panel === "dungeon" && (
        <DungeonEntrancePanel
          saveData={saveData}
          onClose={() => setPanel(null)}
          onStart={handleStartDungeon}
        />
      )}
      {panel === "warehouse" && (
        <WarehousePanel
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
