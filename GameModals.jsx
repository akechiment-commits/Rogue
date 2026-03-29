import { useState, useEffect, useRef, useMemo } from "react";
import { ITEMS, POTS, BB_TYPES, SPELLS, SPELLBOOKS, TRAPS, WANDS, RINGS, WEAPON_ABILITIES, ARMOR_ABILITIES, itemPrice, getIdentKey, placeItemAt, applySpellEffect, CAT_CLAW_T, EXCALIBUR_T, ARROW_T, STONE_T, MAGIC_STONE_T, EMPTY_BOTTLE, WATER_BOTTLE, BLANK_SCROLL, MAGIC_MARKER, RAW_FOODS, COOKED_FOODS, FOOD_DESCS, gemSellPrice } from "./items.js";
import { inMagicSealRoom } from "./items.js";
import { MONS, MON_LEVELS } from "./monsters.js";
import { T, uid, rng, refreshFOV, getShops } from "./utils.js";
import { TILE_NAMES, TILE_RENDER, customTileImages, itemDisplayName } from "./render.js";
import { prepareLastFloor } from "./dungeon.js";
import { getDiscoveries } from "./DiscoveryTracker.js";
import { loadSave } from "./SaveData.js";

/* ===== Tile Icon (inventory) ===== */
const TYPE_TILE_FALLBACK = {
  potion: 16, scroll: 18, food: 19, weapon: 20, armor: 21,
  gold: 22, arrow: 23, wand: 24, pen: 42, spellbook: 43, ring: 60, gem: 87,
};
function TileIcon({ item, size = 16 }) {
  const tileIdx = item.tile ?? TYPE_TILE_FALLBACK[item.type];
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || tileIdx == null) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    const ci = customTileImages[tileIdx];
    if (ci) {
      ctx.drawImage(ci, 0, 0, size, size);
    } else {
      const tr = TILE_RENDER[tileIdx];
      if (tr) {
        if (tr.bg) { ctx.fillStyle = tr.bg; ctx.fillRect(0, 0, size, size); }
        ctx.fillStyle = tr.fg || "#aaa";
        ctx.font = `bold ${Math.floor(size * 0.75)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tr.ch, size / 2, size / 2 + 1);
      }
    }
  });
  if (tileIdx == null) return null;
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", marginRight: 5, verticalAlign: "middle", flexShrink: 0 }}
    />
  );
}

/* ===== Tile Editor Modal ===== */
export function TileEditorModal({ show, setShow, loadCustomTile, clearCustomTile, setCtLoaded }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        zIndex: 200,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 6px",
      }}
    >
      <div
        style={{
          background: "#111",
          border: "1px solid #333",
          borderRadius: 8,
          maxWidth: 520,
          width: "100%",
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span style={{ color: "#0f0", fontSize: 15, fontWeight: "bold" }}>
            🎨 タイル画像設定
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                Object.keys(TILE_NAMES).forEach((k) => {
                  delete customTileImages[parseInt(k)];
                  localStorage.removeItem(`roguelike_tile_${k}`);
                });
                setCtLoaded((c) => c + 1);
              }}
              style={{
                padding: "3px 8px",
                background: "#2a1515",
                color: "#f44",
                border: "1px solid #4a2020",
                borderRadius: 3,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              全消去
            </button>
            <button
              onClick={() => setShow(false)}
              style={{
                background: "none",
                border: "1px solid #444",
                color: "#888",
                cursor: "pointer",
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              ✕
            </button>
          </div>
        </div>
        <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
          各タイルに好きな画像（PNG/JPG/GIF等）を設定できます。設定はブラウザに保存されます。
        </div>
        {Object.entries(TILE_NAMES).map(([idx, name]) => {
          const ii = parseInt(idx);
          const hasCust = !!customTileImages[ii];
          const fb = TILE_RENDER[ii];
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 5,
                padding: "4px 6px",
                background: "#151520",
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  background: fb?.bg || "#0c0c14",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "monospace",
                  fontSize: 18,
                  color: fb?.fg || "#555",
                  overflow: "hidden",
                  borderRadius: 2,
                }}
              >
                {hasCust ? (
                  <img
                    src={customTileImages[ii].src}
                    style={{
                      width: 32,
                      height: 32,
                      imageRendering: "pixelated",
                    }}
                  />
                ) : (
                  fb?.ch || "?"
                )}
              </div>
              <span
                style={{
                  color: "#aaa",
                  fontSize: 13,
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {name}
                <br />
                <span style={{ color: "#444" }}>#{idx}</span>
              </span>
              <label style={{ cursor: "pointer" }}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files[0])
                      loadCustomTile(ii, e.target.files[0]);
                  }}
                />
                <span
                  style={{
                    padding: "3px 8px",
                    background: hasCust ? "#1a2a3a" : "#1a2a1a",
                    color: hasCust ? "#4af" : "#0c0",
                    border: `1px solid ${hasCust ? "#2a4a6a" : "#2a4a2a"}`,
                    borderRadius: 3,
                    fontSize: 13,
                    whiteSpace: "nowrap",
                  }}
                >
                  {hasCust ? "変更" : "選択"}
                </span>
              </label>
              {hasCust && (
                <button
                  onClick={() => clearCustomTile(ii)}
                  style={{
                    padding: "3px 8px",
                    background: "#2a1515",
                    color: "#f44",
                    border: "1px solid #4a2020",
                    borderRadius: 3,
                    fontSize: 13,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  消去
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===== Game Over Modal ===== */
export function GameOverModal({ dead, p, gameOverSel, setShowScores, init, mobile, onReturnToHub }) {
  if (!dead) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 20,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          color: "#f33",
          fontSize: mobile ? 20 : 26,
          fontWeight: "bold",
          textShadow: "0 0 12px #f00",
          marginBottom: 6,
        }}
      >
        *** GAME OVER ***
      </div>
      <div
        style={{
          color: "#f88",
          fontSize: mobile ? 13 : 16,
          marginBottom: 6,
          textAlign: "center",
        }}
      >
        {p.deathCause || "不明の原因により"}倒れた
      </div>
      <div
        style={{
          color: "#777",
          fontSize: mobile ? 11 : 13,
          marginBottom: 4,
        }}
      >
        Lv.{p.level} | B{p.depth}F | T:{p.turns} | G:{p.gold}
      </div>
      <div style={{ color: "#555", fontSize: 13, marginBottom: 10 }}>
        ← → で選択 / Enter で決定
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={init}
          style={{
            padding: "10px 28px",
            background: gameOverSel === 0 ? "#162816" : "#181828",
            color: "#0f0",
            border: `1px solid ${gameOverSel === 0 ? "#0f0" : "#2a4a2a"}`,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            borderRadius: 6,
            boxShadow: gameOverSel === 0 ? "0 0 8px #0a0" : "none",
          }}
        >
          {gameOverSel === 0 ? "▶ " : "　"}もう一度挑戦する
        </button>
        <button
          onClick={() => setShowScores(true)}
          style={{
            padding: "10px 20px",
            background: gameOverSel === 1 ? "#101828" : "#181828",
            color: "#8cf",
            border: `1px solid ${gameOverSel === 1 ? "#8cf" : "#2a3a4a"}`,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            borderRadius: 6,
            boxShadow: gameOverSel === 1 ? "0 0 8px #08f" : "none",
          }}
        >
          {gameOverSel === 1 ? "▶ " : "　"}スコアを見る
        </button>
        {onReturnToHub && (
          <button
            onClick={onReturnToHub}
            style={{
              padding: "10px 20px",
              background: gameOverSel === 2 ? "#1a1208" : "#181828",
              color: "#f0c040",
              border: `1px solid ${gameOverSel === 2 ? "#f0c040" : "#3a2a08"}`,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 14,
              borderRadius: 6,
              boxShadow: gameOverSel === 2 ? "0 0 8px #c09020" : "none",
            }}
          >
            {gameOverSel === 2 ? "▶ " : "　"}地上に戻る
          </button>
        )}
      </div>
    </div>
  );
}

/* ===== Scores Modal ===== */
export function ScoresModal({ show, setShow, mobile }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.95)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        zIndex: 30,
        borderRadius: 6,
        padding: "20px 10px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          color: "#8cf",
          fontSize: mobile ? 16 : 20,
          fontWeight: "bold",
          marginBottom: 14,
        }}
      >
        ── 冒険の記録 ──
      </div>
      {(() => {
        let _sc = [];
        try { _sc = JSON.parse(localStorage.getItem("roguelike_scores") || "[]"); } catch (_e) {}
        if (_sc.length === 0) {
          return <div style={{ color: "#555", fontSize: 14 }}>記録なし</div>;
        }
        return _sc.map((_s, _i) => (
          <div
            key={_i}
            style={{
              width: "100%",
              maxWidth: 400,
              background: "#0d0d1a",
              border: "1px solid #223",
              borderRadius: 5,
              padding: "8px 12px",
              marginBottom: 6,
              fontSize: mobile ? 11 : 13,
              color: "#ccc",
            }}
          >
            <span style={{ color: "#f88", fontWeight: "bold" }}>#{_i + 1}</span>
            {" "}
            <span style={{ color: "#fa0" }}>{_s.cause}倒れた</span>
            <br />
            <span style={{ color: "#aaa" }}>
              Lv.{_s.level} | B{_s.depth}F | {_s.turns}ターン | G:{_s.gold}
            </span>
            <span style={{ color: "#555", marginLeft: 8 }}>{_s.date}</span>
          </div>
        ));
      })()}
      <button
        onClick={() => setShow(false)}
        style={{
          marginTop: 16,
          padding: "8px 24px",
          background: "#181828",
          color: "#8cf",
          border: "1px solid #8cf",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 14,
          borderRadius: 6,
        }}
      >
        閉じる
      </button>
    </div>
  );
}

/* ===== Nickname Modal ===== */
export function NicknameModal({ mode, setMode, input, setInput, gs, sr, setGs }) {
  const [_subMode, _setSubMode] = useState(null); /* null=選択中 / "type" / "list" */
  const [_listPage, _setListPage] = useState(0);
  const [_listSel, _setListSel] = useState(0);
  const [_menuSel, _setMenuSel] = useState(0); /* 第1画面のカーソル位置 */
  const _isBigbox = mode?.identKey?.startsWith("bk:");
  const _typePrefix = _isBigbox ? null : mode?.identKey?.[0];
  const _typeMap = { p: 'potion', s: 'scroll', w: 'wand', n: 'pen', o: 'pot' };
  const _targetType = _isBigbox ? null : _typeMap[_typePrefix];
  /* グローバルセーブ＋今回のプレイ分を合算して既発見名リストを作成 */
  const _knownNames = useMemo(() => {
    if (!mode) return [];
    const _globalDisc = loadSave().discovered;
    const _runDisc = getDiscoveries();
    if (_isBigbox) {
      const _names = new Set([
        ...Object.values(_globalDisc.bigboxes || {}).map(e => e.name),
        ...Object.values(_runDisc.bigboxes || {}).map(e => e.name),
      ]);
      return [..._names].filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
    }
    const _names = new Set([
      ...Object.values(_globalDisc.items || {}).filter(e => e.type === _targetType).map(e => e.name),
      ...Object.values(_runDisc.items || {}).filter(e => e.type === _targetType).map(e => e.name),
    ]);
    return [..._names].filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
  }, [mode, _isBigbox, _targetType]);
  const _totalPages = Math.max(1, Math.ceil(_knownNames.length / 10));
  const _pageNames = _knownNames.slice(_listPage * 10, (_listPage + 1) * 10);
  const _applyNick = (nick) => {
    const _k = mode.identKey;
    if (!sr.current.nicknames) sr.current.nicknames = {};
    const _newNick = (nick ?? '').trim() || null;
    if (_newNick) sr.current.nicknames[_k] = _newNick;
    else delete sr.current.nicknames[_k];
    if (_k.startsWith('n:')) {
      const _updatePentacles = (dg) => {
        if (!dg?.pentacles) return;
        for (const pc of dg.pentacles) {
          if (pc.penIK !== _k) continue;
          const _pfx = pc.blessed ? "祝福された" : pc.cursed ? "呪われた" : "";
          const _fake = sr.current.fakeNames?.[_k];
          const _base = _newNick ? `${_newNick}の魔方陣` : (_fake ? _fake.replace(/ペン$/, '魔方陣') : '魔方陣');
          pc.name = _pfx ? `${_pfx}${_base}` : _base;
        }
      };
      _updatePentacles(sr.current.dungeon);
      for (const _fd of Object.values(sr.current.floors || {})) _updatePentacles(_fd);
    }
    setMode(null);
    sr.current = { ...sr.current }; setGs({ ...sr.current });
  };
  /* サブモードリセット（モードが変わったとき） */
  useEffect(() => { _setSubMode(null); _setListPage(0); _setListSel(0); _setMenuSel(0); }, [mode?.identKey]);
  /* 第1画面のキーボード操作 */
  useEffect(() => {
    if (_subMode !== null || !mode) return;
    const _menuItems = [
      { enabled: true,                      action: () => _setSubMode("type") },
      { enabled: _knownNames.length > 0,    action: () => { _setSubMode("list"); _setListPage(0); _setListSel(0); } },
      { enabled: true,                      action: () => setMode(null) },
    ];
    const _onKey = (e) => {
      if (e.key === "ArrowUp" || e.code === "Numpad8") {
        e.preventDefault();
        _setMenuSel(s => (s - 1 + _menuItems.length) % _menuItems.length);
      } else if (e.key === "ArrowDown" || e.code === "Numpad2") {
        e.preventDefault();
        _setMenuSel(s => (s + 1) % _menuItems.length);
      } else if (e.key === "Enter" || e.key === "z" || e.key === "Z") {
        e.preventDefault();
        const item = _menuItems[_menuSel];
        if (item?.enabled) item.action();
      } else if (e.key === "Escape" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        setMode(null);
      }
    };
    window.addEventListener("keydown", _onKey);
    return () => window.removeEventListener("keydown", _onKey);
  });
  /* リストモードのキーボード操作 */
  useEffect(() => {
    if (_subMode !== "list" || !mode) return;
    const _isUp   = (e) => e.key === "ArrowUp"    || e.code === "Numpad8";
    const _isDown = (e) => e.key === "ArrowDown"  || e.code === "Numpad2";
    const _isPrev = (e) => e.key === "ArrowLeft"  || e.code === "Numpad4";
    const _isNext = (e) => e.key === "ArrowRight" || e.code === "Numpad6";
    const _onKey = (e) => {
      if (_isUp(e)) {
        e.preventDefault();
        if (_listSel > 0) _setListSel(s => s - 1);
        else if (_listPage > 0) { _setListPage(p => p - 1); _setListSel(9); }
      } else if (_isDown(e)) {
        e.preventDefault();
        if (_listSel < _pageNames.length - 1) _setListSel(s => s + 1);
        else if (_listPage < _totalPages - 1) { _setListPage(p => p + 1); _setListSel(0); }
      } else if (_isPrev(e)) {
        e.preventDefault();
        if (_listPage > 0) { _setListPage(p => p - 1); _setListSel(0); }
      } else if (_isNext(e)) {
        e.preventDefault();
        if (_listPage < _totalPages - 1) { _setListPage(p => p + 1); _setListSel(0); }
      } else if (e.key === "Enter" || e.key === "z" || e.key === "Z") {
        e.preventDefault();
        const _n = _pageNames[_listSel];
        if (_n) _applyNick(_n);
      } else if (e.key === "Escape" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        _setSubMode(null);
      }
    };
    window.addEventListener("keydown", _onKey);
    return () => window.removeEventListener("keydown", _onKey);
  });
  const _btnStyle = (col = "#4a6a9a") => ({
    background: col, border: "1px solid #556", color: "#fff", borderRadius: 4,
    padding: "6px 16px", cursor: "pointer", fontSize: 13,
  });
  if (!mode) return null;
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.85)",
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:300 }}>
      <div style={{ background:"#1a2a3a", padding:16, borderRadius:8, maxWidth:400, width:"90%" }}>
        <div style={{ color:"#ff0", marginBottom:8, fontWeight:"bold" }}>{_isBigbox ? "大箱に名前をつける" : "アイテムに名前をつける"}</div>
        {_isBigbox
          ? <div style={{ color:"#888", fontSize:11, marginBottom:8 }}>見た目: {gs?.bbFakeNames?.[mode.identKey.slice(3)] ?? "謎の大箱"}</div>
          : <div style={{ color:"#888", fontSize:11, marginBottom:8 }}>偽名: {gs?.fakeNames?.[mode.identKey] ?? "?"}</div>
        }

        {/* ── 第1画面：方法選択 ── */}
        {_subMode === null && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button
              style={{ ..._btnStyle("#2a5a2a"), outline: _menuSel === 0 ? "2px solid #8f8" : "none" }}
              onMouseEnter={() => _setMenuSel(0)}
              onClick={() => _setSubMode("type")}>自分でつける</button>
            <button
              style={_knownNames.length > 0
                ? { ..._btnStyle("#2a3a6a"), outline: _menuSel === 1 ? "2px solid #88f" : "none" }
                : { ..._btnStyle("#222"), opacity:0.4, cursor:"default", outline: _menuSel === 1 ? "2px solid #66a" : "none" }}
              onMouseEnter={() => _setMenuSel(1)}
              onClick={() => { if (_knownNames.length > 0) { _setSubMode("list"); _setListPage(0); _setListSel(0); } }}>
              図鑑から選ぶ{_knownNames.length === 0 ? "（未発見）" : `（${_knownNames.length}件）`}
            </button>
            <button
              style={{ ..._btnStyle("#3a1a1a"), outline: _menuSel === 2 ? "2px solid #f88" : "none" }}
              onMouseEnter={() => _setMenuSel(2)}
              onClick={() => setMode(null)}>キャンセル</button>
          </div>
        )}

        {/* ── 第2画面A：キーボード入力 ── */}
        {_subMode === "type" && (
          <div>
            <input
              value={input}
              onChange={e2 => setInput(e2.target.value)}
              onKeyDown={e2 => {
                if (e2.key === 'Enter') _applyNick(input);
                if (e2.key === 'Escape') _setSubMode(null);
              }}
              placeholder="名前を入力（空欄でリセット）"
              autoFocus
              style={{ width:"100%", background:"#0a1a2a", color:"#fff", border:"1px solid #446", padding:4, borderRadius:4, boxSizing:"border-box" }}
            />
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button onClick={() => _applyNick(input)} style={_btnStyle("#0a4a2a")}>決定</button>
              <button onClick={() => _setSubMode(null)} style={_btnStyle("#3a3a3a")}>戻る</button>
            </div>
          </div>
        )}

        {/* ── 第2画面B：図鑑リスト選択 ── */}
        {_subMode === "list" && (
          <div>
            {_pageNames.map((n, vi) => (
              <div key={vi} onClick={() => _applyNick(n)}
                style={{ padding:"4px 8px", cursor:"pointer", borderRadius:3, margin:"2px 0",
                         background: _listSel === vi ? "#2a4a8a" : "#1a2a4a",
                         border: `1px solid ${_listSel === vi ? "#6af" : "#334"}`,
                         color: _listSel === vi ? "#fff" : "#8cf" }}
                onMouseEnter={() => _setListSel(vi)}>
                {n}
              </div>
            ))}
            {_totalPages > 1 && (
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8 }}>
                <button onClick={() => { _setListPage(p => Math.max(0, p - 1)); _setListSel(0); }}
                  disabled={_listPage === 0}
                  style={{ ..._btnStyle("#2a3a5a"), opacity: _listPage === 0 ? 0.4 : 1 }}>◀</button>
                <span style={{ color:"#8af", fontSize:12 }}>{_listPage + 1} / {_totalPages}</span>
                <button onClick={() => { _setListPage(p => Math.min(_totalPages - 1, p + 1)); _setListSel(0); }}
                  disabled={_listPage >= _totalPages - 1}
                  style={{ ..._btnStyle("#2a3a5a"), opacity: _listPage >= _totalPages - 1 ? 0.4 : 1 }}>▶</button>
              </div>
            )}
            <div style={{ marginTop:8 }}>
              <button onClick={() => _setSubMode(null)} style={_btnStyle("#3a3a3a")}>戻る</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== Identify/Bless/Curse/Duplicate Modal ===== */
export function IdentifyModal({ mode, setMode, gs, sr, setGs, setMsgs, endTurn, iLabel, mobile }) {
  if (!mode || !gs) return null;
  const _p = gs.player;
  const _isBCMode_ui = mode.mode === 'bless' || mode.mode === 'curse';
  const _isDupMode_ui = mode.mode === 'duplicate';
  const _filtered = _p.inventory
    .map((it, i) => ({ it, i }))
    .filter(({ it, i }) => {
      if (_isBCMode_ui || _isDupMode_ui) return it.type !== "gold";
      if (mode.scrollIdx === i) return false;
      if (it.type === 'weapon' || it.type === 'armor') {
        return mode.mode === 'identify' ? (!it.fullIdent && !it.bcKnown) : (it.fullIdent || it.bcKnown);
      }
      const k = getIdentKey(it);
      if (!k) return false;
      if (mode.mode === 'identify') return !gs.ident?.has(k) || (!it.fullIdent && !it.bcKnown);
      return gs.ident?.has(k);
    });
  const _idPage_ui = mode.page || 0;
  const _idTotalPg_ui = Math.max(1, Math.ceil(_filtered.length / 10));
  const _idPageItems_ui = _filtered.slice(_idPage_ui * 10, (_idPage_ui + 1) * 10);
  const _curSel_ui = Math.min(mode.sel || 0, Math.max(0, _idPageItems_ui.length - 1));
  const doConfirmUI = (vi) => {
    if (!sr.current) return;
    const _absIdx = _idPage_ui * 10 + vi;
    const { it: _selIt } = _filtered[_absIdx] ?? _filtered[_idPage_ui * 10 + _curSel_ui] ?? {};
    if (!_selIt) return;
    let _msgResult;
    if (mode.mode === 'bless') {
      if (_selIt.type === 'pot') {
        _selIt.capacity = (_selIt.capacity || 1) + 1;
        _msgResult = `${_selIt.name}を祝福した！(容量+1 → ${_selIt.capacity})【祝】`;
      } else { _selIt.blessed = true; _selIt.cursed = false; _selIt.bcKnown = true; _msgResult = `${_selIt.name}を祝福した！【祝】`; }
    } else if (mode.mode === 'curse') {
      if (_selIt.type === 'pot') {
        const _nc = Math.max(0, (_selIt.capacity || 1) - 1);
        const _p_ui = sr.current.player;
        if ((_selIt.contents?.length || 0) > _nc) {
          const _rmIdx2 = _p_ui.inventory.indexOf(_selIt);
          if (_rmIdx2 !== -1) { const _fts3 = new Set(); for (const _ci of (_selIt.contents || [])) placeItemAt(sr.current.dungeon, _p_ui.x, _p_ui.y, _ci, [], _fts3); _p_ui.inventory.splice(_rmIdx2, 1); }
          _msgResult = `${_selIt.name}が呪いで割れた！中身が足元に落ちた！【呪】`;
        } else { _selIt.capacity = _nc; _msgResult = `${_selIt.name}を呪った！(容量-1 → ${_selIt.capacity})【呪】`; }
      } else { _selIt.cursed = true; _selIt.blessed = false; _selIt.bcKnown = true; _msgResult = `${_selIt.name}を呪った！【呪】`; }
    } else if (mode.mode === 'duplicate') {
      const _dupCount = mode.cursed ? 0 : 1;
      const _p_dup = sr.current.player;
      if (_dupCount === 0) {
        if (_selIt.type === "goal") {
          _msgResult = `${_selIt.name}は呪いに耐えた！【呪】`;
        } else {
          const _rmIdx = _p_dup.inventory.indexOf(_selIt);
          if (_rmIdx !== -1) {
            _p_dup.inventory.splice(_rmIdx, 1);
            if (mode.scrollIdx != null && _rmIdx < mode.scrollIdx) mode.scrollIdx--;
          }
          _msgResult = `${_selIt.name}が消えてしまった！【呪】`;
        }
      } else {
        const _makeFreshM = () => {
          const { blessed: _b, cursed: _c, bcKnown: _bck, fullIdent: _fi, plus: _pl, ...rest } = _selIt;
          return { ...rest, id: uid() };
        };
        const _newItM = _makeFreshM();
        if (mode.blessed) { _newItM.blessed = true; _newItM.cursed = false; _newItM.bcKnown = true; }
        _p_dup.inventory.push(_newItM);
        _msgResult = mode.blessed ? `祝福された${_selIt.name}が1つ増えた！【祝】` : `${_selIt.name}が1つ増えた！`;
      }
    } else {
      const _isWA = _selIt.type === 'weapon' || _selIt.type === 'armor';
      const _selKey = _isWA ? null : getIdentKey(_selIt);
      if (mode.mode === 'identify') {
        const _wasAlreadyNamed = !_isWA && _selKey && sr.current.ident.has(_selKey);
        if (_selKey) sr.current.ident.add(_selKey);
        _selIt.fullIdent = true; _selIt.bcKnown = true;
        _msgResult = (_isWA || _wasAlreadyNamed) ? `${_selIt.name}の祝呪が判明した！` : `${_selIt.name}と判明した！`;
      } else {
        if (_selKey) sr.current.ident.delete(_selKey);
        _selIt.fullIdent = false; _selIt.bcKnown = false;
        _msgResult = `${_selIt.name}の識別が失われた...`;
      }
    }
    if (mode.scrollIdx != null) {
      sr.current.player.inventory.splice(mode.scrollIdx, 1);
    }
    if (mode.spellCost != null) {
      sr.current.player.mp -= mode.spellCost;
    }
    endTurn(sr.current, sr.current.player, []);
    const _ml_id = mode.spellMsg ? [mode.spellMsg, _msgResult] : [_msgResult];
    setMode(null);
    setMsgs((prev) => [...prev.slice(-80), ..._ml_id]);
    sr.current = { ...sr.current }; setGs({ ...sr.current });
  };
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.85)",
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:300 }}>
      <div style={{ background:"#1a2a3a", padding:16, borderRadius:8, maxWidth:400, width:"90%", maxHeight:"80dvh", overflowY:"auto" }}>
        <div style={{ color:"#ff0", marginBottom:4, fontWeight:"bold" }}>
          {mode.mode === 'bless' ? "祝福するアイテムを選んでください【祝】"
            : mode.mode === 'curse' ? "呪うアイテムを選んでください【呪】"
            : mode.mode === 'duplicate' ? (mode.blessed ? "複製するアイテムを選んでください（2つ増える）【祝】" : mode.cursed ? "複製するアイテムを選んでください（消えてしまう）【呪】" : "複製するアイテムを選んでください")
            : mode.mode === 'identify' ? "識別するアイテムを選んでください"
            : "識別を解除するアイテムを選んでください【呪】"}
        </div>
        <div style={{ color:"#556", fontSize:10, marginBottom:4 }}>↑↓/8,2:選択　←→/4,6:ページ　Ｚ/Enter:決定　ESC:キャンセル</div>
        {_idTotalPg_ui > 1 && (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
            <button onClick={() => setMode({ ...mode, page: ((_idPage_ui - 1 + _idTotalPg_ui) % _idTotalPg_ui), sel: 0 })}
              style={{ background:"#1a3a5a", color:"#8af", border:"1px solid #4060a0", borderRadius:4, padding:"2px 8px", cursor:"pointer", touchAction:"manipulation" }}>◀</button>
            <span style={{ color:"#8af", fontSize:11 }}>{_idPage_ui + 1} / {_idTotalPg_ui}</span>
            <button onClick={() => setMode({ ...mode, page: ((_idPage_ui + 1) % _idTotalPg_ui), sel: 0 })}
              style={{ background:"#1a3a5a", color:"#8af", border:"1px solid #4060a0", borderRadius:4, padding:"2px 8px", cursor:"pointer", touchAction:"manipulation" }}>▶</button>
          </div>
        )}
        {_idPageItems_ui.length === 0 && <div style={{ color:"#888" }}>該当するアイテムがない。</div>}
        {_idPageItems_ui.map(({ it, i }, vi) => {
          const _isSel = vi === _curSel_ui;
          return (
            <div key={i} onClick={() => doConfirmUI(vi)}
              style={{ padding:"4px 8px", cursor:"pointer",
                       background: _isSel ? "#2a4a6a" : "#1a3a5a",
                       border: `1px solid ${_isSel ? "#4080c0" : "transparent"}`,
                       margin:"2px 0", borderRadius:4,
                       color: _isSel ? "#fff" : "#ccc",
                       fontWeight: _isSel ? "bold" : "normal" }}>
              {_isSel ? "▶ " : "\u3000"}{iLabel(it)}
            </div>
          );
        })}
        <button onClick={() => { setMode(null); setMsgs((prev) => [...prev.slice(-80), "やめた。"]); }}
          style={{ marginTop:8, color:"#888", background:"#0a1a2a", border:"1px solid #446", borderRadius:4, padding:"4px 12px", cursor:"pointer" }}>
          やめる (ESC)
        </button>
      </div>
    </div>
  );
}

/* ===== Shop Modal ===== */
export function ShopModal({ mode, setMode, gs, sr, setGs, setMsgs, menuSel, setMenuSel, mobile }) {
  const [sellAllConfirm, setSellAllConfirm] = useState(false);
  useEffect(() => { if (!mode) setSellAllConfirm(false); }, [mode]);
  const _calcSellPrice = (it, depth) => it.type === "gem" ? gemSellPrice(it, depth) : Math.ceil(itemPrice(it) * 0.5);
  if (!mode || !gs?.dungeon?.shop) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: mobile ? 8 : 28,
        left: mobile ? 4 : 16,
        right: mobile ? 4 : 16,
        background: "#1a0e00",
        border: "1px solid #8a5a0a",
        padding: mobile ? 10 : 14,
        zIndex: 11,
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(80,40,0,0.7)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ color: "#fa8", fontSize: 13, fontWeight: "bold" }}>
          🏪 お店
        </span>
        <button
          onClick={() => setMode(null)}
          style={{
            background: "#333",
            color: "#aaa",
            border: "1px solid #555",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
      {mode === "pay" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: "#fa8", fontSize: 14, marginBottom: 4 }}>
            店主：「お代は{gs.dungeon.shop.unpaidTotal}Gです。」
          </div>
          {[
            {
              label: `支払う (${gs.dungeon.shop.unpaidTotal}G)`,
              fn: () => {
                if (sr.current) {
                  const { player: p2, dungeon: dg2 } = sr.current;
                  if (p2.gold >= dg2.shop.unpaidTotal) {
                    p2.gold -= dg2.shop.unpaidTotal;
                    dg2.shop.unpaidTotal = 0;
                    dg2.shopTheft = false;
                    const _clearShopPrice = (it2) => {
                      if (it2.shopPrice) delete it2.shopPrice;
                      if (it2.type === "pot" && it2.contents) it2.contents.forEach(_clearShopPrice);
                    };
                    p2.inventory.forEach(_clearShopPrice);
                    const sk5 = dg2.monsters.find(
                      (m) => m.type === "shopkeeper",
                    );
                    if (sk5) {
                      sk5.state = "friendly";
                      sk5.x = sk5.homePos.x;
                      sk5.y = sk5.homePos.y;
                    }
                    setMsgs((prev) => [
                      ...prev.slice(-80),
                      "代金を支払った。ありがとうございます！",
                    ]);
                    sr.current = { ...sr.current };
                    setGs({ ...sr.current });
                  } else
                    setMsgs((prev) => [
                      ...prev.slice(-80),
                      "お金が足りない！",
                    ]);
                }
                setMode(null);
              },
            },
            { label: "やめる", fn: () => setMode(null) },
          ].map((item, mi) => (
            <button
              key={mi}
              onClick={item.fn}
              style={{
                padding: "6px 10px",
                background: menuSel === mi ? "#4a2a00" : "#2a1a00",
                border: `1px solid ${menuSel === mi ? "#fa8" : "#6a4a20"}`,
                borderRadius: 4,
                color: menuSel === mi ? "#ffa" : "#fa8",
                fontSize: 14,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {mode === "browse" && (() => {
        const _p = gs.player;
        /* 複数店舗対応：プレイヤーが今いる店を探す */
        const _curShop = getShops(gs.dungeon).find(s => s.room &&
          _p.x >= s.room.x && _p.x < s.room.x + s.room.w &&
          _p.y >= s.room.y && _p.y < s.room.y + s.room.h);
        const _inShop = !!_curShop;
        const _sellItems = _p.inventory.filter(it => it.type !== "gold" && !it.shopPrice);
        const _totalG = _sellItems.reduce((s, it) => s + _calcSellPrice(it, _p.depth), 0);
        if (sellAllConfirm) {
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ color: "#fa8", fontSize: 14, marginBottom: 4 }}>
                店主：「本当によろしいですか？{_sellItems.length} 件を{_totalG.toLocaleString()}Gで買い取ります。」
              </div>
              {[
                {
                  label: `はい、全て売る (${_totalG.toLocaleString()}G)`,
                  fn: () => {
                    if (!sr.current) return;
                    const { player: p2, dungeon: dg2 } = sr.current;
                    const toSell = p2.inventory.filter(it => it.type !== "gold" && !it.shopPrice);
                    if (toSell.length === 0) { setSellAllConfirm(false); return; }
                    /* 複数店舗対応：プレイヤーが今いる店を使う */
                    const _sellShop = getShops(dg2).find(s => s.room &&
                      p2.x >= s.room.x && p2.x < s.room.x + s.room.w &&
                      p2.y >= s.room.y && p2.y < s.room.y + s.room.h) || getShops(dg2)[0];
                    if (!_sellShop) { setSellAllConfirm(false); return; }
                    const _calcSell2 = (it) => it.type === "gem" ? gemSellPrice(it, p2.depth) : Math.ceil(itemPrice(it) * 0.5);
                    let earned = 0;
                    for (const it of toSell) {
                      it.shopPrice = _calcSell2(it);
                      it._shopId = _sellShop.id;
                      earned += it.shopPrice;
                    }
                    p2.gold += earned;
                    /* unpaidTotal に加算 → 盗賊判定・pay モードが自動的に機能する */
                    _sellShop.unpaidTotal += earned;
                    const _sk = dg2.monsters.find(m => m.id === _sellShop.shopkeeperId && m.state === "friendly");
                    if (_sk) _sk.state = "blocking";
                    setMsgs(prev => [...prev.slice(-80), `所持品 ${toSell.length} 件が店の商品になった。${earned.toLocaleString()}Gを受け取った。店主が入口をふさいだ。`]);
                    sr.current = { ...sr.current };
                    setGs({ ...sr.current });
                    setSellAllConfirm(false);
                    setMode(null);
                  },
                },
                { label: "やめる", fn: () => setSellAllConfirm(false) },
              ].map((item, mi) => (
                <button key={mi} onClick={item.fn} style={{
                  padding: "6px 10px", background: menuSel === mi ? "#4a2a00" : "#2a1a00",
                  border: `1px solid ${menuSel === mi ? "#fa8" : "#6a4a20"}`, borderRadius: 4,
                  color: menuSel === mi ? "#ffa" : "#fa8", fontSize: 14, cursor: "pointer", textAlign: "left",
                }}>{item.label}</button>
              ))}
            </div>
          );
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: "#fa8", fontSize: 14, marginBottom: 4 }}>
              店主：「いらっしゃいませ！」
            </div>
            {[
              {
                label: _inShop
                  ? `所持品を全て売る (${_totalG.toLocaleString()}G)`
                  : "所持品を全て売る (店内限定)",
                disabled: _sellItems.length === 0 || !_inShop,
                fn: () => { if (_sellItems.length > 0 && _inShop) setSellAllConfirm(true); },
              },
              { label: "やめる", fn: () => setMode(null) },
            ].map((item, mi) => (
              <button key={mi} onClick={item.fn} disabled={item.disabled} style={{
                padding: "6px 10px", background: menuSel === mi ? "#4a2a00" : "#2a1a00",
                border: `1px solid ${menuSel === mi ? "#fa8" : "#6a4a20"}`, borderRadius: 4,
                color: item.disabled ? "#664422" : menuSel === mi ? "#ffa" : "#fa8",
                fontSize: 14, cursor: item.disabled ? "default" : "pointer", textAlign: "left",
              }}>{item.label}</button>
            ))}
          </div>
        );
      })()}
      {mode === "sell" &&
        (() => {
          const dg2 = gs.dungeon;
          const _sellModalShop = getShops(dg2).find(s => s.room &&
            gs.player.x >= s.room.x && gs.player.x < s.room.x + s.room.w &&
            gs.player.y >= s.room.y && gs.player.y < s.room.y + s.room.h);
          const fis = _sellModalShop ? dg2.items.filter(
            (i) =>
              !i.shopPrice &&
              i.x >= _sellModalShop.room.x &&
              i.x < _sellModalShop.room.x + _sellModalShop.room.w &&
              i.y >= _sellModalShop.room.y &&
              i.y < _sellModalShop.room.y + _sellModalShop.room.h,
          ) : [];
          const allOpts = [
            ...fis.map((it) => ({
              label: `${itemDisplayName(it, gs?.fakeNames, gs?.ident, gs?.nicknames)}  →  ${_calcSellPrice(it, gs?.player?.depth)}G`,
              fn: () => {
                if (sr.current) {
                  const { player: p2, dungeon: dg3 } = sr.current;
                  const _curSellSh = getShops(dg3).find(s => s.room &&
                    p2.x >= s.room.x && p2.x < s.room.x + s.room.w &&
                    p2.y >= s.room.y && p2.y < s.room.y + s.room.h);
                  const bp = _calcSellPrice(it, p2.depth);
                  p2.gold += bp;
                  it.shopPrice = itemPrice(it);
                  if (_curSellSh) it._shopId = _curSellSh.id;
                  const _dispName = itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
                  setMsgs((prev) => [
                    ...prev.slice(-80),
                    `${_dispName}を${bp}Gで買い取った。`,
                  ]);
                  const rem = _curSellSh ? dg3.items.filter(
                    (i2) =>
                      !i2.shopPrice &&
                      i2.x >= _curSellSh.room.x &&
                      i2.x < _curSellSh.room.x + _curSellSh.room.w &&
                      i2.y >= _curSellSh.room.y &&
                      i2.y < _curSellSh.room.y + _curSellSh.room.h,
                  ) : [];
                  sr.current = { ...sr.current };
                  setGs({ ...sr.current });
                  if (rem.length <= 1) setMode(null);
                  else setMenuSel((s) => Math.min(s, rem.length - 2));
                }
              },
            })),
            { label: "やめる", fn: () => setMode(null) },
          ];
          return (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div style={{ color: "#fa8", fontSize: 14, marginBottom: 4 }}>
                店主：「買い取りましょうか？」
              </div>
              <div style={{ maxHeight: "50dvh", overflowY: "auto" }}>
                {allOpts.map((item, mi) => (
                  <button
                    key={mi}
                    onClick={item.fn}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "6px 10px",
                      marginBottom: 2,
                      background:
                        menuSel === mi ? "#4a2a00" : "#2a1a00",
                      border: `1px solid ${menuSel === mi ? "#fa8" : "#6a4a20"}`,
                      borderRadius: 4,
                      color: menuSel === mi ? "#ffa" : "#fa8",
                      fontSize: 14,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
    </div>
  );
}

/* ===== Spring Modal ===== */
export function SpringModal({ mode, setMode, gs, menuSel, setMenuSel, page, setPage, springDrink, springDoSoak, iLabel, mobile }) {
  if (!mode) return null;
  const p = gs?.player;
  return (
    <div
      style={{
        position: "absolute",
        top: mobile ? 8 : 28,
        left: mobile ? 4 : 16,
        right: mobile ? 4 : 16,
        background: "#0c1a2a",
        border: "1px solid #3a5a7a",
        padding: mobile ? 10 : 14,
        zIndex: 11,
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,40,80,0.7)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ color: "#4af", fontSize: 13, fontWeight: "bold" }}>
          ♨ 泉
        </span>
        <button
          onClick={() => {
            setMode(null);
            setMenuSel(0);
          }}
          style={{
            background: "#333",
            color: "#aaa",
            border: "1px solid #555",
            borderRadius: 4,
            padding: "3px 12px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ✕
        </button>
      </div>
      {mode === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { label: "飲む", desc: "泉の水を飲む", fn: springDrink },
            {
              label: "浸す",
              desc: "アイテムを泉に浸す",
              fn: () => {
                setMode("soak");
                setMenuSel(0);
              },
            },
            {
              label: "やめる",
              desc: "",
              fn: () => {
                setMode(null);
                setMenuSel(0);
              },
            },
          ].map((item, mi) => (
            <button
              key={mi}
              onClick={item.fn}
              style={{
                padding: "8px 12px",
                background: menuSel === mi ? "#2a4a6a" : "#1a2a3a",
                color: menuSel === mi ? "#8df" : "#6cf",
                border:
                  menuSel === mi
                    ? "1px solid #6af"
                    : "1px solid #3a5a7a",
                borderRadius: 5,
                cursor: "pointer",
                fontSize: 14,
                textAlign: "left",
                fontWeight: menuSel === mi ? "bold" : "normal",
              }}
            >
              {mi + 1}. {item.label}
              {item.desc && (
                <span
                  style={{
                    color: menuSel === mi ? "#88c" : "#668",
                    marginLeft: 8,
                  }}
                >
                  — {item.desc}
                </span>
              )}
            </button>
          ))}
          <div style={{ color: "#556", fontSize: 12, marginTop: 2 }}>
            ↑↓:選択 Z:決定 X:閉じる
          </div>
        </div>
      )}
      {mode === "soak" && (() => {
        const _spInv = p.inventory;
        const _spLen = _spInv.length;
        const _spTotalPg = Math.max(1, Math.ceil(_spLen / 10));
        const _spCurPg = Math.min(page, _spTotalPg - 1);
        const _spPageItems = _spInv.slice(_spCurPg * 10, (_spCurPg + 1) * 10);
        return (
          <div style={{ maxHeight: mobile ? "50dvh" : "60%", overflowY: "auto" }}>
            <div style={{ color: "#8ac", fontSize: 13, marginBottom: 4 }}>
              泉に浸すアイテムを選んでください
            </div>
            {_spLen > 10 && (
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
                <button onClick={() => { setPage(pg => (pg - 1 + _spTotalPg) % _spTotalPg); setMenuSel(0); }}
                  style={{ padding: "2px 8px", background: "#223", color: "#8ac", border: "1px solid #446", borderRadius: 3, fontSize: 13, cursor: "pointer" }}>◀</button>
                <span style={{ color: "#8ac", fontSize: 13 }}>{_spCurPg + 1}/{_spTotalPg}</span>
                <button onClick={() => { setPage(pg => (pg + 1) % _spTotalPg); setMenuSel(0); }}
                  style={{ padding: "2px 8px", background: "#223", color: "#8ac", border: "1px solid #446", borderRadius: 3, fontSize: 13, cursor: "pointer" }}>▶</button>
              </div>
            )}
            {_spLen === 0 ? (
              <div style={{ color: "#666", fontSize: 13 }}>持ち物がない。</div>
            ) : (
              _spPageItems.map((it, pi) => {
                const absI = _spCurPg * 10 + pi;
                const isSel = menuSel === pi;
                return (
                  <div key={absI} onClick={() => { springDoSoak(absI); setPage(0); setMenuSel(0); }}
                    style={{
                      padding: "5px 8px", margin: "2px 0", borderRadius: 4, cursor: "pointer", fontSize: 13,
                      background: isSel ? (it.type === "bottle" ? "#2a4a2a" : it.type === "weapon" || it.type === "armor" ? "#4a2a2a" : "#2a2a4a")
                                         : (it.type === "bottle" ? "#1a2a1a" : it.type === "weapon" || it.type === "armor" ? "#2a1a1a" : "#18182a"),
                      border: "1px solid " + (isSel ? (it.type === "bottle" ? "#6afa6a" : it.type === "weapon" || it.type === "armor" ? "#fa6a6a" : "#6a6afa")
                                                     : (it.type === "bottle" ? "#3a6a3a" : it.type === "weapon" || it.type === "armor" ? "#6a3a3a" : "#3a3a5a")),
                      color: it.type === "bottle" ? "#6f6" : it.type === "weapon" || it.type === "armor" ? "#f88" : "#aab",
                      fontWeight: isSel ? "bold" : "normal",
                    }}
                  >
                    {iLabel(it)}
                    {it.type === "bottle" && " → 水を汲める"}
                    {(it.type === "weapon" || it.type === "armor") && " ⚠ 錆びる"}
                  </div>
                );
              })
            )}
            <div style={{ color: "#556", fontSize: 12, marginTop: 4 }}>
              ↑↓:選択　←→:ページ　Z:決定　X:戻る
            </div>
            <button onClick={() => { setMode("menu"); setMenuSel(0); setPage(0); }}
              style={{ marginTop: 4, padding: "5px 16px", background: "#222", color: "#888", border: "1px solid #444", borderRadius: 5, fontSize: 13, cursor: "pointer" }}>
              戻る
            </button>
          </div>
        );
      })()}
    </div>
  );
}

/* ===== Bigbox Modal ===== */
export function BigboxModal({ mode, setMode, gs, setMsgs, bigboxRef, page, setPage, menuSel, setMenuSel, bigboxPutItem, iLabel, mobile, setNicknameMode, setNicknameInput }) {
  if (!mode) return null;
  const _bb = bigboxRef.current;
  const _bbNickKey = _bb ? "bk:" + _bb.kind : null;
  const _bbIsRevealed = !_bb || _bb.revealed === true || !!gs?.allBcKnown;
  const _bbNick = gs?.nicknames?.[_bbNickKey];
  const _bbFake = _bb ? (gs?.bbFakeNames?.[_bb.kind] || "謎の大箱") : "謎の大箱";
  const _bbDisplayName = _bbIsRevealed ? (_bb?.name ?? "大箱") : (_bbNick ? `${_bbFake} (${_bbNick})` : _bbFake);
  return (
    <div
      style={{
        position: "absolute",
        top: mobile ? 8 : 28,
        left: mobile ? 4 : 16,
        right: mobile ? 4 : 16,
        background: "#1a0c0a",
        border: "1px solid #7a4a2a",
        padding: mobile ? 10 : 14,
        zIndex: 11,
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(80,20,0,0.7)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ color: "#fa8", fontSize: 13, fontWeight: "bold" }}>
          📦 {_bbDisplayName}
        </span>
        <button
          onClick={() => {
            setMode(null);
            bigboxRef.current = null;
          }}
          style={{
            background: "#333",
            color: "#aaa",
            border: "1px solid #555",
            borderRadius: 4,
            padding: "3px 12px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ✕
        </button>
      </div>
      {bigboxRef.current && (
        <div style={{ color: "#d4a870", fontSize: 13, marginBottom: 6 }}>
          {_bbIsRevealed
            ? <>内容: {bigboxRef.current.contents.length}/{bigboxRef.current.capacity}{bigboxRef.current.contents.length > 0 && ": " + bigboxRef.current.contents.map((i) => i.name).join(", ")}</>
            : "内容: 不明"}
        </div>
      )}
      {mode === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(() => {
            const _bbDesc = BB_TYPES.find(t => t.kind === bigboxRef.current?.kind)?.desc ?? "";
            return [
            {
              label: "入れる",
              desc: "手持ちからアイテムを入れる",
              fn: () => {
                setMode("put");
                setMenuSel(0);
                setPage(0);
              },
              dis:
                bigboxRef.current?.contents.length >=
                bigboxRef.current?.capacity,
            },
            {
              label: "やめる",
              desc: "",
              fn: () => {
                setMode(null);
                bigboxRef.current = null;
                setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
              },
            },
            {
              label: "説明",
              desc: _bbIsRevealed ? _bbDesc : "？？？",
              fn: () => { setMode("desc"); setMenuSel(0); },
            },
            {
              label: "名づける",
              desc: "大箱にメモ名をつける",
              fn: () => {
                if (_bbNickKey) {
                  setNicknameMode({ identKey: _bbNickKey });
                  setNicknameInput(gs?.nicknames?.[_bbNickKey] || "");
                  setMode(null);
                }
              },
            },
            ];
          })().map((item, mi) => (
            <button
              key={mi}
              onClick={item.dis ? undefined : item.fn}
              style={{
                padding: "8px 12px",
                background: item.dis
                  ? "#1a1a1a"
                  : menuSel === mi
                    ? "#3a2a1a"
                    : "#1a1a0a",
                color: item.dis
                  ? "#444"
                  : menuSel === mi
                    ? "#fca"
                    : "#ca8",
                border:
                  menuSel === mi
                    ? "1px solid #a84"
                    : "1px solid #5a3a1a",
                borderRadius: 5,
                cursor: item.dis ? "not-allowed" : "pointer",
                fontSize: 14,
                textAlign: "left",
                fontWeight: menuSel === mi ? "bold" : "normal",
                opacity: item.dis ? 0.5 : 1,
              }}
            >
              {mi + 1}. {item.label}
              {item.desc && (
                <span
                  style={{
                    color: menuSel === mi ? "#ffd090" : "#b89860",
                    marginLeft: 8,
                  }}
                >
                  — {item.desc}
                </span>
              )}
            </button>
          ))}
          <div style={{ color: "#8899aa", fontSize: 12, marginTop: 2 }}>
            ↑↓:選択 Z:決定 X:閉じる
          </div>
        </div>
      )}
      {mode === "desc" && bigboxRef.current && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ background: "#12100a", border: "1px solid #6a4a2a", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ color: "#fca", fontSize: 13, fontWeight: "bold", marginBottom: 6 }}>
              {_bbIsRevealed ? bigboxRef.current.name : _bbDisplayName}
            </div>
            <div style={{ color: "#c9a", fontSize: 14, lineHeight: "1.6em" }}>
              {_bbIsRevealed ? (BB_TYPES.find(t => t.kind === bigboxRef.current?.kind)?.desc ?? "説明なし。") : "詳細は不明。アイテムを入れると正体が分かるかもしれない。"}
            </div>
          </div>
          <button
            onClick={() => { setMode("menu"); setMenuSel(0); }}
            style={{
              padding: "6px 16px", background: "#2a1a0a", color: "#ca8",
              border: "1px solid #5a3a1a", borderRadius: 5, cursor: "pointer", fontSize: 14, alignSelf: "flex-start",
            }}
          >
            戻る [X]
          </button>
        </div>
      )}
      {mode === "put" &&
        (() => {
          const _inv = gs.player.inventory;
          const _ps = 10;
          const _tp = Math.max(1, Math.ceil(_inv.length / _ps));
          const _pi = _inv.slice(page * _ps, (page + 1) * _ps);
          return (
            <div
              style={{
                maxHeight: mobile ? "50dvh" : "60%",
                overflowY: "auto",
              }}
            >
              <div style={{ color: "#a86", fontSize: 13, marginBottom: 6 }}>
                入れるアイテムを選んでください
              </div>
              {_tp > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <button
                    onClick={() => {
                      setPage((p) => (p - 1 + _tp) % _tp);
                      setMenuSel(0);
                    }}
                    style={{
                      background: "#333",
                      color: "#aaa",
                      border: "1px solid #555",
                      borderRadius: 3,
                      padding: "2px 8px",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    ◀
                  </button>
                  <span style={{ color: "#888", fontSize: 12 }}>
                    {page + 1}/{_tp}ページ
                  </span>
                  <button
                    onClick={() => {
                      setPage((p) => (p + 1) % _tp);
                      setMenuSel(0);
                    }}
                    style={{
                      background: "#333",
                      color: "#aaa",
                      border: "1px solid #555",
                      borderRadius: 3,
                      padding: "2px 8px",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    ▶
                  </button>
                </div>
              )}
              {_inv.length === 0 ? (
                <div style={{ color: "#666", fontSize: 13 }}>
                  持ち物がない。
                </div>
              ) : (
                _pi.map((it, i) => (
                  <div
                    key={page * _ps + i}
                    onClick={() => bigboxPutItem(page * _ps + i)}
                    style={{
                      padding: "5px 8px",
                      margin: "2px 0",
                      background:
                        menuSel === i ? "#3a2a0a" : "#1a1a08",
                      border:
                        "1px solid " +
                        (menuSel === i ? "#ca6" : "#4a3a1a"),
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 13,
                      color:
                        it.type === "weapon" || it.type === "armor"
                          ? "#fa8"
                          : "#ca8",
                      fontWeight: menuSel === i ? "bold" : "normal",
                    }}
                  >
                    {iLabel(it)}
                    {(it.type === "weapon" || it.type === "armor") && " ✓"}
                  </div>
                ))
              )}
              <div style={{ color: "#556", fontSize: 12, marginTop: 4 }}>
                ↑↓:選択 ←→:ページ Z:決定 X:戻る
              </div>
              <button
                onClick={() => {
                  setMode(null);
                  bigboxRef.current = null;
                }}
                style={{
                  marginTop: 4,
                  padding: "5px 16px",
                  background: "#222",
                  color: "#888",
                  border: "1px solid #444",
                  borderRadius: 5,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                戻る
              </button>
            </div>
          );
        })()}
    </div>
  );
}

/* ===== Teleport Select Modal ===== */
export function TpSelectModal({ mode, setMode, gs, sr, setGs, setMsgs, endTurn, mobile }) {
  if (!mode) return null;
  return (
    <div
      style={{
        fontSize: 14,
        color: "#ffe040",
        textAlign: "center",
        marginTop: 2,
        padding: "4px 8px",
        background: "#1a1800",
        border: "1px solid #5a5000",
        borderRadius: 4,
      }}
    >
      <span style={{ fontWeight: "bold" }}>テレポート先選択【祝】</span>
      <span style={{ color: "#cc0", marginLeft: 8 }}>
        ({mode.cx}, {mode.cy})
        {(gs?.dungeon?.map?.[mode.cy]?.[mode.cx] === T.WALL || gs?.dungeon?.map?.[mode.cy]?.[mode.cx] === T.BWALL) ? " ⚠ 壁→ランダム" : ""}
      </span>
      <span style={{ color: "#888", marginLeft: 8 }}>
        方向キー:移動 Z/Enter:決定 X:キャンセル(ランダム)
      </span>
      {mobile && (
        <span style={{ marginLeft: 8 }}>
          <button onClick={() => {
            const { player: _p, dungeon: _dg } = sr.current || {};
            if (!_p || !_dg) return;
            const { cx: _tx, cy: _ty } = mode;
            const _ml = [];
            const _walk = _dg.map[_ty]?.[_tx] !== T.WALL && _dg.map[_ty]?.[_tx] !== T.BWALL && _dg.map[_ty]?.[_tx] !== undefined;
            if (_walk) { _p.x = _tx; _p.y = _ty; if ((_p.immobileTurns||0) > 0) { _p.immobileTurns = 0; _ml.push("テレポートして移動封じが解けた！"); } _ml.push("テレポートした！（目的地指定）【祝】"); }
            else { const _rm = _dg.rooms[rng(0, _dg.rooms.length - 1)]; _p.x = rng(_rm.x, _rm.x + _rm.w - 1); _p.y = rng(_rm.y, _rm.y + _rm.h - 1); if ((_p.immobileTurns||0) > 0) { _p.immobileTurns = 0; _ml.push("テレポートして移動封じが解けた！"); } _ml.push("壁の中！ランダムにテレポートした。"); }
            endTurn(sr.current, _p, _ml);
            refreshFOV(_dg, _p);
            setMode(null);
            setMsgs(prev => [...prev.slice(-80), ..._ml]);
            sr.current = { ...sr.current };
            setGs({ ...sr.current });
          }} style={{ background: "#363", color: "#afa", border: "1px solid #6a6", borderRadius: 4, padding: "2px 8px", cursor: "pointer", marginRight: 4, touchAction: "manipulation" }}>決定</button>
          <button onClick={() => {
            const { player: _p, dungeon: _dg } = sr.current || {};
            if (!_p || !_dg) return;
            const _ml = [];
            const _rm = _dg.rooms[rng(0, _dg.rooms.length - 1)]; _p.x = rng(_rm.x, _rm.x + _rm.w - 1); _p.y = rng(_rm.y, _rm.y + _rm.h - 1);
            if ((_p.immobileTurns||0) > 0) { _p.immobileTurns = 0; _ml.push("テレポートして移動封じが解けた！"); }
            _ml.push("テレポートした！");
            endTurn(sr.current, _p, _ml);
            refreshFOV(_dg, _p);
            setMode(null);
            setMsgs(prev => [...prev.slice(-80), ..._ml]);
            sr.current = { ...sr.current };
            setGs({ ...sr.current });
          }} style={{ background: "#333", color: "#aaa", border: "1px solid #666", borderRadius: 4, padding: "2px 8px", cursor: "pointer", touchAction: "manipulation" }}>キャンセル</button>
        </span>
      )}
    </div>
  );
}

/* ===== Pot Put Modal ===== */
export function PotPutModal({ mode, setMode, p, gs, putPage, putMenuSel, doPutItem, iLabel, dname, mobile }) {
  if (!mode) return null;
  const pot = p.inventory[mode.potIdx];
  if (!pot) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: mobile ? 8 : 28, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
        background: "#1a1408", border: "1px solid #5a4a2a",
        padding: mobile ? 10 : 14, zIndex: 12, borderRadius: 8,
        boxShadow: "0 4px 20px rgba(40,30,0,0.7)",
        maxHeight: mobile ? "65dvh" : "80%", overflowY: "auto",
      }}
    >
      {" "}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#fc6", fontSize: 13, fontWeight: "bold" }}>
          {dname(pot)} ({pot.contents?.length || 0}/{pot.capacity})
        </span>
        <button onClick={() => setMode(null)}
          style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
      </div>{" "}
      {pot.contents?.length > 0 && (
        <div style={{ color: "#a86", fontSize: 12, marginBottom: 6, padding: "4px 6px", background: "#1a1a08", borderRadius: 3, border: "1px solid #3a3a1a" }}>
          中身: {pot.contents.map((c) => dname(c)).join(", ")}
        </div>
      )}{" "}
      <div style={{ color: "#ca8", fontSize: 13, marginBottom: 6 }}>入れるアイテムを選んでください</div>{" "}
      {(() => {
        const pItems = p.inventory.map((it, i) => ({ it, i })).filter(({ i }) => i !== mode.potIdx);
        const _psp = 10;
        const _tpp = Math.max(1, Math.ceil(pItems.length / _psp));
        const _pgp = pItems.slice(putPage * _psp, (putPage + 1) * _psp);
        return pItems.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>入れるアイテムがない。</div>
        ) : (
          <div>
            {_tpp > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 6, color: "#888", fontSize: 13 }}>
                <span>←→でページ切替</span>
                <span style={{ color: "#ccc" }}>{putPage + 1}/{_tpp}ページ</span>
                <span>({putPage * _psp + 1}〜{Math.min((putPage + 1) * _psp, pItems.length)}件)</span>
              </div>
            )}
            {_pgp.map(({ it: it2, i: i2 }, vi) => {
              const isPot = it2.type === "pot";
              const isFood = it2.type === "food";
              const isEquip = it2.type === "weapon" || it2.type === "armor";
              const isSel = vi === putMenuSel;
              const isDisabled = isPot;
              const _isUnidentPut = (() => { const _k2 = getIdentKey(it2); return _k2 && !gs?.ident?.has(_k2); })();
              return (
                <div key={i2} onClick={() => { if (!isDisabled) doPutItem(i2); }}
                  style={{
                    padding: "5px 8px", margin: "2px 0",
                    background: isSel ? (isDisabled ? "#3a1a1a" : isFood ? "#3a3a08" : isEquip ? "#3a2008" : "#28285a")
                      : (isDisabled ? "#1a1a1a" : isFood ? "#1a1a08" : isEquip ? "#1a1008" : "#18182a"),
                    border: "1px solid " + (isSel ? "#88c" : isDisabled ? "#333" : isFood ? "#5a5a2a" : isEquip ? "#5a3a2a" : "#3a3a5a"),
                    borderRadius: 4, cursor: isDisabled ? "not-allowed" : "pointer", fontSize: 13,
                    color: isDisabled ? "#555" : isFood ? "#fc6" : isEquip ? "#fa8" : _isUnidentPut ? "#ff8" : "#aab",
                    opacity: isDisabled ? 0.5 : 1,
                  }}
                >
                  {iLabel(it2)}{isDisabled && " (入れられない)"}
                </div>
              );
            })}
            {"}"}
          </div>
        );
      })()}{" "}
      <div style={{ color: "#556", fontSize: 12, marginTop: 4 }}>
        {p.inventory.length > 11 ? "↑↓:選択 ←→:ページ Z:決定 X:閉じる" : "↑↓:選択 Z:決定 X:閉じる"}
      </div>{" "}
      <button onClick={() => setMode(null)}
        style={{ marginTop: 8, padding: "5px 16px", background: "#222", color: "#888", border: "1px solid #444", borderRadius: 5, fontSize: 13, cursor: "pointer" }}>
        やめる
      </button>{" "}
    </div>
  );
}

/* ===== Marker Modal ===== */
export function MarkerModal({ mode, setMode, sr, menuSel, setMenuSel, doMarkerWrite, setMsgs, mobile, pastIdent = [], discoveredItems = {} }) {
  if (!mode || !sr.current) return null;
  const inv = sr.current.player.inventory;
  const marker = inv[mode.markerIdx];
  if (!marker) return null;
  const isBlankStep = mode.step === "select_blank";
  const isSpellbookTypeStep = mode.step === "select_spellbook_type";
  /* 識別済みエフェクトセット：現在のランのident ∪ 過去ランの保存済みident */
  const _knownIdent = new Set([...(sr.current?.ident ?? []), ...pastIdent]);
  /* 今のランで拾ったアイテム（DiscoveryTracker） */
  const _curDisc = getDiscoveries().items;
  /* 今持ってる巻物のeffectセット（初期装備・デバッグアイテム等も含む） */
  const _invScrollEffects = new Set(inv.filter(it => it.type === "scroll" && it.effect !== "blank").map(it => it.effect));
  const listItems = isBlankStep
    ? inv.map((it, i) => ({ it, i })).filter(({ it }) => (it.type === "scroll" && it.effect === "blank") || (it.type === "spellbook" && !it.spell))
    : isSpellbookTypeStep
      ? SPELLBOOKS.filter((it) => it.spell && _knownIdent.has(`b:${it.spell}`)).map((it, i) => ({ it, i }))
      : ITEMS.filter((it) => it.type === "scroll" && it.effect !== "blank" && (_knownIdent.has(`s:${it.effect}`) || discoveredItems[it.effect] || _curDisc[it.effect] || _invScrollEffects.has(it.effect))).map((it, i) => ({ it, i }));
  const _mlen = listItems.length;
  const safeSel = Math.min(menuSel, Math.max(0, _mlen - 1));
  return (
    <div style={{
      position: "absolute", top: mobile ? 8 : 28, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
      background: "#0a0a18", border: "1px solid #a040c0", padding: mobile ? 10 : 14, zIndex: 12,
      borderRadius: 8, boxShadow: "0 4px 20px rgba(80,0,120,0.6)",
      maxHeight: mobile ? "65dvh" : "80%", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#d080ff", fontSize: 13, fontWeight: "bold" }}>{marker.name} [{marker.charges}回]</span>
        <button onClick={() => setMode(null)}
          style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
      </div>
      <div style={{ color: "#c090ee", fontSize: 13, marginBottom: 6 }}>
        {isBlankStep ? "書き込む白紙アイテムを選んでください" : isSpellbookTypeStep ? "変える魔法書の種類を選んでください (インク5回消費)" : "書き込む魔法を選んでください（識別済みのもののみ）"}
      </div>
      {_mlen === 0 ? (
        <div style={{ color: "#666", fontSize: 13 }}>{isBlankStep ? "白紙の巻物も白紙の魔法書もない。" : !isSpellbookTypeStep && !isBlankStep ? "図鑑に巻物がまだ載っていない。巻物を使って先に図鑑に登録しよう。" : "選択肢がない。"}</div>
      ) : (
        <div>
          {listItems.map(({ it, i }, vi) => {
            const isSel = vi === safeSel;
            return (
              <div key={isBlankStep ? i : (it.spell || it.effect || i)}
                onClick={() => {
                  if (isBlankStep) {
                    const kind = it.type === "spellbook" ? "spellbook" : "scroll";
                    const nextStep = kind === "spellbook" ? "select_spellbook_type" : "select_type";
                    setMode({ ...mode, step: nextStep, blankIdx: i, blankKind: kind });
                    setMenuSel(0);
                    setMsgs((prev) => [...prev.slice(-80), kind === "spellbook" ? "どの魔法書に変えますか...(インク5回消費)" : "どの魔法を書き込みますか..."]);
                  } else { doMarkerWrite(mode.blankIdx, it); }
                }}
                style={{
                  padding: "5px 8px", margin: "2px 0",
                  background: isSel ? "#2a1040" : "#14101e",
                  border: "1px solid " + (isSel ? "#a040c0" : "#3a2050"),
                  borderRadius: 4, cursor: "pointer", fontSize: 13,
                  color: isSel ? "#e080ff" : "#aa88cc",
                }}>
                {it.name}
                {isBlankStep && it.type === "spellbook" ? <span style={{ color: "#5090cc", marginLeft: 6, fontSize: 12 }}>[魔法書]</span> : null}
                {isBlankStep && it.type === "scroll" ? <span style={{ color: "#888855", marginLeft: 6, fontSize: 12 }}>[巻物]</span> : null}
                {!isBlankStep && it.desc ? <span style={{ color: "#776688", marginLeft: 6, fontSize: 12 }}>{it.desc}</span> : null}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ color: "#556", fontSize: 12, marginTop: 4 }}>↑↓:選択 Z:決定 X:閉じる</div>
      <button onClick={() => setMode(null)}
        style={{ marginTop: 8, padding: "5px 16px", background: "#222", color: "#888", border: "1px solid #444", borderRadius: 5, fontSize: 13, cursor: "pointer" }}>やめる</button>
    </div>
  );
}

/* ===== Spell List Modal ===== */
export function SpellListModal({ mode, setMode, gs, sr, setGs, setMsgs, menuSel, setMenuSel, page, setPage, setIdentifyMode, setShowInv, setSelIdx, setShowDesc, setThrowMode, setDebugSpellMode, endTurn, lu, mobile }) {
  if (!mode) return null;
  const knownSpells = (gs?.player?.spells || []).map((id) => {
    const s = SPELLS.find((sp) => sp.id === id);
    if (!s) return null;
    const _lv = (gs?.player?.spellLevels?.[id] || 1);
    return { ...s, mpCost: s.fixedMpCost ? s.mpCost : Math.max(1, Math.round(s.mpCost * (1 - (_lv - 1) * 0.15))), spellLevel: _lv };
  }).filter(Boolean);
  const _sps = 10;
  const totalPages = Math.max(1, Math.ceil(knownSpells.length / _sps));
  const curPage = Math.min(page ?? 0, totalPages - 1);
  const pageSpells = knownSpells.slice(curPage * _sps, (curPage + 1) * _sps);
  const safeSel = Math.min(menuSel, Math.max(0, pageSpells.length - 1));
  return (
    <div style={{
      position: "absolute", top: mobile ? 8 : 28, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
      background: "#080d18", border: "1px solid #2050a0", padding: mobile ? 10 : 14, zIndex: 12,
      borderRadius: 8, boxShadow: "0 4px 20px rgba(0,40,120,0.7)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#80c0ff", fontSize: 13, fontWeight: "bold" }}>
          ✨ 魔法リスト [MP: {gs?.player?.mp ?? 0}/{gs?.player?.maxMp ?? 0}]
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {totalPages > 1 && (
            <span style={{ color: "#4080c0", fontSize: 13 }}>
              <button onClick={() => { setPage((p) => (p - 1 + totalPages) % totalPages); setMenuSel(0); }}
                style={{ background: "#0a1a30", color: "#80b0ff", border: "1px solid #2050a0", borderRadius: 3, padding: "1px 6px", cursor: "pointer", fontSize: 14 }}>◀</button>
              {" "}{curPage + 1}/{totalPages}{" "}
              <button onClick={() => { setPage((p) => (p + 1) % totalPages); setMenuSel(0); }}
                style={{ background: "#0a1a30", color: "#80b0ff", border: "1px solid #2050a0", borderRadius: 3, padding: "1px 6px", cursor: "pointer", fontSize: 14 }}>▶</button>
            </span>
          )}
          <button onClick={() => setMode(false)}
            style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
        </div>
      </div>
      {knownSpells.length === 0 ? (
        <div style={{ color: "#666", fontSize: 13 }}>習得した魔法がない。魔法書を読んで覚えよう。</div>
      ) : (
        <div>
          {pageSpells.map((spell, vi) => {
            const isSel = vi === safeSel;
            const canCast = (gs?.player?.mp ?? 0) >= spell.mpCost;
            return (
              <div key={spell.id} onClick={() => {
                if (!canCast) { setMsgs((prev) => [...prev.slice(-80), `MPが足りない！(必要:${spell.mpCost} 現在:${gs?.player?.mp ?? 0})`]); return; }
                setMode(false);
                if (!spell.needsDir) {
                  if (!sr.current) return;
                  const { player: p2, dungeon: dg2 } = sr.current;
                  const ml2 = [];
                  if (inMagicSealRoom(p2.x, p2.y, dg2) || (p2.sealedTurns || 0) > 0) {
                    ml2.push("魔法が封印されている！MPは消費しない。");
                    endTurn(sr.current, p2, ml2); setMsgs((prev) => [...prev.slice(-80), ...ml2]); sr.current = { ...sr.current }; setGs({ ...sr.current });
                  } else if (spell.effect === "identify_magic") {
                    const _idt = p2.inventory.filter(_ii => {
                      if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
                      const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
                    });
                    if (_idt.length === 0) {
                      p2.mp -= spell.mpCost; ml2.push(`${spell.name}を唱えた！[MP -${spell.mpCost}]`); ml2.push("未識別のアイテムがない。");
                      endTurn(sr.current, p2, ml2); setMsgs((prev) => [...prev.slice(-80), ...ml2]); sr.current = { ...sr.current }; setGs({ ...sr.current });
                    } else {
                      setMsgs((prev) => [...prev.slice(-80), "識別するアイテムを選んでください。"]);
                      setIdentifyMode({ mode: 'identify', sel: 0, spellCost: spell.mpCost, spellMsg: `${spell.name}を唱えた！[MP -${spell.mpCost}]` });
                      setShowInv(false); setSelIdx(null); setShowDesc(null); sr.current = { ...sr.current }; setGs({ ...sr.current });
                    }
                  } else if (spell.effect === "bless_magic" || spell.effect === "curse_magic") {
                    const _bcMode = spell.effect === "bless_magic" ? 'bless' : 'curse';
                    setMsgs((prev) => [...prev.slice(-80), _bcMode === 'bless' ? "祝福するアイテムを選んでください。" : "呪うアイテムを選んでください。"]);
                    setIdentifyMode({ mode: _bcMode, sel: 0, spellCost: spell.mpCost, spellMsg: `${spell.name}を唱えた！[MP -${spell.mpCost}]` });
                    setShowInv(false); setSelIdx(null); setShowDesc(null); sr.current = { ...sr.current }; setGs({ ...sr.current });
                  } else if (spell.effect.startsWith("debug_")) {
                    setDebugSpellMode({ effect: spell.effect });
                  } else {
                    p2.mp -= spell.mpCost; ml2.push(`${spell.name}を唱えた！[MP -${spell.mpCost}]`);
                    applySpellEffect(spell.effect, "self", null, 0, 0, dg2, p2, ml2, lu, spell.spellLevel || 1);
                    endTurn(sr.current, p2, ml2); setMsgs((prev) => [...prev.slice(-80), ...ml2]); sr.current = { ...sr.current }; setGs({ ...sr.current });
                  }
                } else {
                  setThrowMode({ idx: spell.id, mode: "cast_spell" });
                  setMsgs((prev) => [...prev.slice(-80), `${spell.name}：方向を選んでください`]);
                }
              }} style={{
                padding: "6px 8px", margin: "2px 0",
                background: isSel ? "#0a1a30" : "#060e1a",
                border: "1px solid " + (isSel ? "#2060c0" : "#152040"),
                borderRadius: 4, cursor: canCast ? "pointer" : "not-allowed", fontSize: 13, opacity: canCast ? 1 : 0.5,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: isSel ? "#a0d0ff" : "#7090c0", fontWeight: isSel ? "bold" : "normal" }}>{spell.name}</span>
                  <span style={{ color: canCast ? "#40a0ff" : "#555", fontSize: 12 }}>
                    Lv.{spell.spellLevel ?? 1} MP:{spell.mpCost}{spell.needsDir ? " 🎯" : " ✨"}
                    {spell.spellLevel >= 6 && <span style={{ color: "#ffd700", marginLeft: 3 }}>MAX</span>}
                  </span>
                </div>
                <div style={{ color: "#4060a0", fontSize: 12, marginTop: 2 }}>{spell.desc.replace(/。?MP:\d+$/, "")}</div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ color: "#304060", fontSize: 12, marginTop: 6 }}>↑↓:選択  ←→:ページ切替  Z:決定  X:閉じる  🎯=方向指定</div>
    </div>
  );
}

/* ===== Message Log Modal ===== */
const MSG_LOG_PAGE = 20;
export function MsgLogModal({ show, msgs, scrollTop, setScrollTop, onClose, mobile }) {
  if (!show) return null;
  const total = msgs.length;
  const start = Math.max(0, Math.min(scrollTop, total - MSG_LOG_PAGE));
  const visible = msgs.slice(start, start + MSG_LOG_PAGE);
  return (
    <div style={{
      position: "absolute", top: mobile ? 4 : 16, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
      bottom: mobile ? 4 : 16,
      background: "#0a0e18", border: "1px solid #304060", padding: mobile ? 10 : 14, zIndex: 20,
      borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.85)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#80c0ff", fontSize: 13, fontWeight: "bold" }}>
          📜 メッセージログ ({total}件)
        </span>
        <button onClick={onClose}
          style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
        {visible.map((m, i) => {
          const absIdx = start + i;
          const isNewest = absIdx === total - 1;
          const _text = typeof m === "object" ? m.text : m;
          const _msgColor = typeof m === "object" ? m.color : undefined;
          return (
            <div key={absIdx} style={{
              fontSize: mobile ? 10 : 11, lineHeight: "1.4em",
              color: _msgColor ?? (isNewest ? "#ccffcc" : "#8fa8a0"),
              fontWeight: _msgColor ? "bold" : undefined,
              opacity: isNewest ? 1 : 0.75,
              padding: "1px 0",
              borderBottom: "1px solid #1a2030",
            }}>
              <span style={{ color: "#304060", marginRight: 6, fontSize: 12 }}>{absIdx + 1}</span>
              {_text}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#304060", fontSize: 12 }}>
          {start + 1}〜{Math.min(start + MSG_LOG_PAGE, total)} / {total}　↑↓:スクロール　m/x/Esc:閉じる
        </span>
        {mobile && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setScrollTop((s) => Math.max(0, s - 1))}
              style={{ background: "#1a2030", color: "#80b0ff", border: "1px solid #304060", borderRadius: 3, padding: "3px 10px", cursor: "pointer" }}>▲</button>
            <button onClick={() => setScrollTop((s) => Math.min(Math.max(0, total - MSG_LOG_PAGE), s + 1))}
              style={{ background: "#1a2030", color: "#80b0ff", border: "1px solid #304060", borderRadius: 3, padding: "3px 10px", cursor: "pointer" }}>▼</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== Inventory Modal ===== */
export function InventoryModal({
  show, p, gs, mobile, dropMode, dropModeRef, invPage, selIdx, showDesc, invMenuSel,
  setShowInv, setDropMode, setSelIdx, setShowDesc, setInvPage, setInvMenuSel,
  setNicknameMode, setNicknameInput,
  sortInventory, canUse, useLabel, iLabel,
  doUseItem, doReadSpellbook, doShoot, doWaveWand, doBreakWand, doUseMarker, doBreakPot, doDropItem, doThrow,
  containerRef, penMergeMode
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  if (!show) return null;
  const _previewIdx = hoveredIdx !== null ? hoveredIdx : selIdx;
  const _previewItem = _previewIdx !== null ? p.inventory[invPage * 10 + _previewIdx] : null;
  const _previewPot = _previewItem?.type === "pot" ? _previewItem : null;
  return (
    <div style={{ position: "absolute", top: mobile ? 8 : 28, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
      background: "#12121c", border: "1px solid #4a4a5a", zIndex: 10,
      borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.7)" }}>
    <div style={{ padding: mobile ? 10 : 14, overflowY: "auto", maxHeight: mobile ? "65dvh" : "80dvh" }}>
      {penMergeMode && (
        <div style={{ color: "#ffcc44", fontSize: 14, fontWeight: "bold", marginBottom: 8, padding: "4px 8px", background: "#2a1a00", borderRadius: 4, border: "1px solid #886600" }}>
          ✦ 合成先のペンを選んでください（ただのペンを選ぶとキャンセル）
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#ff0", fontSize: 13, fontWeight: "bold" }}>所持品 ({p.inventory.length}/{p.maxInventory || 30})</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={sortInventory}
            style={{ background: "#1a2a1a", color: "#6c6", border: "1px solid #3a5a3a", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 13, touchAction: "manipulation" }}>整頓[S]</button>
          <button onClick={() => { const newMode = !dropModeRef.current; dropModeRef.current = newMode; setDropMode(newMode); }}
            style={{ background: dropMode ? "#2a1a1a" : "#1a1a2a", color: dropMode ? "#f88" : "#aaa",
              border: `1px solid ${dropMode ? "#8a3030" : "#3a3a5a"}`, borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 13, touchAction: "manipulation", fontWeight: dropMode ? "bold" : "normal" }}>置く[D]</button>
          <button onClick={() => { setShowInv(false); dropModeRef.current = false; setDropMode(false); setSelIdx(null); setShowDesc(null); setInvPage(0); setInvMenuSel(null); }}
            style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
        </div>
      </div>
      {p.weapon && (
        <div style={{ color: "#aaa", fontSize: 13, marginBottom: 2 }}>
          武器: <span style={{ color: "#fa0" }}>{p.weapon.name}{p.weapon.plus ? "+" + p.weapon.plus : ""}</span> (攻+{p.weapon.atk + (p.weapon.plus || 0)})
          {(p.weapon.ability || p.weapon.abilities?.length > 0) && (
            <span style={{ color: "#fc6", fontSize: 9 }}> [{[...new Set([...(p.weapon.abilities || []), ...(p.weapon.ability ? [p.weapon.ability] : [])])].map((id) => WEAPON_ABILITIES.find((a) => a.id === id)?.name).filter(Boolean).join("・")}]</span>
          )}
        </div>
      )}
      {p.armor && (
        <div style={{ color: "#aaa", fontSize: 13, marginBottom: 2 }}>
          防具: <span style={{ color: "#08f" }}>{p.armor.name}{p.armor.plus ? "+" + p.armor.plus : ""}</span> (防+{p.armor.def + (p.armor.plus || 0)})
          {(p.armor.ability || p.armor.abilities?.length > 0) && (
            <span style={{ color: "#6cf", fontSize: 9 }}> [{[...new Set([...(p.armor.abilities || []), ...(p.armor.ability ? [p.armor.ability] : [])])].map((id) => ARMOR_ABILITIES.find((a) => a.id === id)?.name).filter(Boolean).join("・")}]</span>
          )}
        </div>
      )}
      {p.arrow ? (
        <div style={{ color: "#aaa", fontSize: 13, marginBottom: 6 }}>矢: <span style={{ color: "#dda050" }}>{p.arrow.name}</span> ({p.arrow.count}本)</div>
      ) : (
        <div style={{ color: "#555", fontSize: 13, marginBottom: 6 }}>矢: なし</div>
      )}
      {p.inventory.length > 10 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 6, color: "#888", fontSize: 13 }}>
          <span>←→でページ移動</span>
          <span style={{ color: "#ccc" }}>{invPage + 1}/{Math.ceil(p.inventory.length / 10)}ページ</span>
          <span>({invPage * 10 + 1}〜{Math.min((invPage + 1) * 10, p.inventory.length)}件)</span>
        </div>
      )}
      {(() => {
        const _allShops = gs?.dungeon ? [
          ...(gs.dungeon.shops || []),
          ...(gs.dungeon.shop ? [gs.dungeon.shop] : []),
        ] : [];
        const _inShopRoom = _allShops.some(sh =>
          sh.room &&
          p.x >= sh.room.x && p.x < sh.room.x + sh.room.w &&
          p.y >= sh.room.y && p.y < sh.room.y + sh.room.h
        );
        if (_inShopRoom) {
          const _totalSell = p.inventory
            .filter(it => it.type !== "gold")
            .reduce((s, it) => s + Math.ceil(itemPrice(it) * 0.5), 0);
          return (
            <div style={{ background: "#1a1400", border: "1px solid #665500", borderRadius: 4, padding: "4px 8px", marginBottom: 6, color: "#ffcc44", fontSize: 13 }}>
              全売却合計: <span style={{ fontWeight: "bold", color: "#ffee88" }}>{_totalSell.toLocaleString()}G</span>
            </div>
          );
        }
        return null;
      })()}
      {p.inventory.length === 0 ? (
        <div style={{ color: "#555", padding: 8 }}>何も持っていない。</div>
      ) : (
        p.inventory.slice(invPage * 10, (invPage + 1) * 10).map((it, j) => {
          const i = invPage * 10 + j;
          const _allShops2 = gs?.dungeon ? [
            ...(gs.dungeon.shops || []),
            ...(gs.dungeon.shop ? [gs.dungeon.shop] : []),
          ] : [];
          const _inShopRoom2 = _allShops2.some(sh =>
            sh.room &&
            p.x >= sh.room.x && p.x < sh.room.x + sh.room.w &&
            p.y >= sh.room.y && p.y < sh.room.y + sh.room.h
          );
          const acts = [];
          if (canUse(it)) acts.push({ label: useLabel(it), fn: () => { doUseItem(i); setInvMenuSel(null); } });
          if (it.type === "spellbook") acts.push({ label: "読む", fn: () => { doReadSpellbook(i); setInvMenuSel(null); } });
          if (it.type === "arrow") acts.push({ label: "射る", fn: () => { doShoot(i); setInvMenuSel(null); } });
          if (it.type === "wand") acts.push({ label: "振る", fn: () => { doWaveWand(i); setInvMenuSel(null); } });
          if (it.type === "wand") acts.push({ label: "壊す", fn: () => { doBreakWand(i); setInvMenuSel(null); } });
          if (it.type === "marker") acts.push({ label: "書く", fn: () => { doUseMarker(i); setInvMenuSel(null); } });
          if (it.type === "pot") acts.push({ label: "割る", fn: () => { doBreakPot(i); setInvMenuSel(null); } });
          acts.push({ label: "置く", fn: () => { doDropItem(i); setInvMenuSel(null); } });
          { const _isCursedEquipped = it.cursed && (p.weapon === it || p.armor === it || (p.rings || []).includes(it));
            if (!_isCursedEquipped) acts.push({ label: it.type === "arrow" ? "投げる(束)" : "投げる", fn: () => { doThrow(i); setInvMenuSel(null); } }); }
          acts.push({ label: "説明", fn: () => { setShowDesc((prev) => (prev === i ? null : i)); setInvMenuSel(null); } });
          { const _nik = getIdentKey(it);
            if (_nik && gs?.ident && !gs.ident.has(_nik)) {
              acts.push({ label: "名付ける", fn: () => { setNicknameMode({ identKey: _nik }); setNicknameInput(gs?.nicknames?.[_nik] || ''); setShowInv(false); setSelIdx(null); setShowDesc(null); setInvMenuSel(null); } });
            }
          }
          const _isUnidentInv = (() => { const _kk = getIdentKey(it); return !!(_kk && gs?.ident && !gs.ident.has(_kk)); })();
          const _isIdentBCUnknown = (() => {
            if (it.type === 'weapon' || it.type === 'armor') return !it.fullIdent && !it.bcKnown;
            const _kk = getIdentKey(it); return !!(_kk && gs?.ident?.has(_kk) && !it.fullIdent && !it.bcKnown);
          })();
          return (
            <div key={i} onMouseEnter={() => setHoveredIdx(j)} onMouseLeave={() => setHoveredIdx(null)}
              style={{ borderBottom: "1px solid #222", borderRadius: 4, marginBottom: 1 }}>
              <div onClick={() => {
                if (dropModeRef.current) { doDropItem(i); setTimeout(() => containerRef.current?.focus(), 0); return; }
                setSelIdx(selIdx === j ? null : j); setInvMenuSel(null); setShowDesc(null);
                setTimeout(() => containerRef.current?.focus(), 0);
              }} style={{
                padding: "7px 8px", cursor: "pointer", fontSize: mobile ? 13 : 12,
                background: selIdx === j ? (it.shopPrice ? "#2a1800" : "#252540") : (it.shopPrice ? "#1a0e00" : "transparent"),
                borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                color: it.shopPrice ? "#ff8844" : _isUnidentInv ? "#ff8" : _isIdentBCUnknown ? "#6d6" : (it.blessed && it.bcKnown) ? "#ffd060" : (it.cursed && it.bcKnown) ? "#cc88ff" : "#ccc",
              }}>
                <span style={{ display: "flex", alignItems: "center" }}>
                  <TileIcon item={it} size={16} />
                  {iLabel(it)}
                  {it.shopPrice
                    ? <span style={{ color: "#ff6622", fontSize: 12, marginLeft: 4 }}>〔未払:{it.shopPrice}G〕</span>
                    : (_inShopRoom2 && it.type !== "gold"
                        ? <span style={{ color: "#aaa880", fontSize: 12, marginLeft: 4 }}>売:{Math.ceil(itemPrice(it) * 0.5)}G</span>
                        : null)
                  }
                </span>
                <span style={{ color: "#555", fontSize: 12 }}>{selIdx === j ? (invMenuSel !== null ? "▶" : "▲") : "▼"}</span>
              </div>
              {selIdx === j && (
                <div style={{ padding: "4px 8px 8px" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {acts.map((a, ai) => (
                      <button key={ai} onClick={() => a.fn()}
                        style={{ background: invMenuSel === ai ? "#3a3a6a" : "#1a1a2a", color: invMenuSel === ai ? "#fff" : "#aaa",
                          border: invMenuSel === ai ? "1px solid #88f" : "1px solid #333", borderRadius: 4, padding: "4px 10px",
                          cursor: "pointer", fontSize: mobile ? 13 : 12, fontWeight: invMenuSel === ai ? "bold" : "normal" }}>{a.label}</button>
                    ))}
                  </div>
                  {invMenuSel !== null && <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>←→:選択 Z:決定 X:キャンセル</div>}
                  {showDesc === i && (
                    <div style={{ background: "#18182a", border: "1px solid #3a3a5a", borderRadius: 5, padding: "8px 10px", color: "#aab", fontSize: 13, lineHeight: "1.5em", marginTop: 4 }}>
                      <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>
                        {it.name}
                        {it.type === "weapon" && ` — 武器 (攻+${it.atk})`}
                        {it.type === "armor" && ` — 防具 (防+${it.def})`}
                        {it.type === "arrow" && ` — 矢 (攻${it.atk}, ${it.count}本)`}
                        {it.type === "wand" && ` — 杖 [残${it.charges}回]`}
                        {it.type === "marker" && ` — マーカー [残${it.charges}回]`}
                        {it.type === "potion" && " — 薬"}
                        {it.type === "bottle" && " — 瓶"}
                        {it.type === "scroll" && " — 巻物"}
                        {it.type === "food" && ` — 食料${it.cooked ? "(調理済)" : "(生)"}`}
                        {it.type === "pot" && ` — 壺 [${it.contents?.length || 0}/${it.capacity}]`}
                        {it.type === "ring" && ` — 指輪${["power_ring","defense_ring","life_ring"].includes(it.effect) ? ` (+${it.plus || 0})` : ""}`}
                      </div>
                      {it.desc || "特に情報はない。"}
                      {it.ability && (() => {
                        const _ab = [...WEAPON_ABILITIES, ...ARMOR_ABILITIES].find((a) => a.id === it.ability);
                        return _ab ? <div style={{ color: "#fa0", marginTop: 3 }}>【特性】{_ab.name}：{_ab.desc}</div> : null;
                      })()}
                      {it.potionEffects?.length > 0 && (
                        <div style={{ color: "#fc6", marginTop: 3 }}>薬効果: {it.potionEffects.map((e) => ({ heal: "回復", poison: "猛毒", sleep: "睡眠", power: "強化" })[e] || e).join(", ")}</div>
                      )}
                      {it.type === "pot" && it.contents?.length > 0 && (
                        <div style={{ color: "#ca8", marginTop: 3 }}>中身: {it.contents.map((c) => c.name).join(", ")}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
    {_previewPot && (
      <div style={{
        position: "absolute", right: mobile ? 8 : 212, top: "50%", transform: "translateY(-50%)",
        background: "#0e0e1a", border: "1px solid #8a6a20", borderRadius: 6,
        padding: "8px 12px", zIndex: 5, minWidth: 130, maxWidth: 180,
        boxShadow: "0 4px 20px rgba(0,0,0,0.85)", pointerEvents: "none",
      }}>
        <div style={{ color: "#ffcc66", fontSize: 13, fontWeight: "bold", marginBottom: 6, borderBottom: "1px solid #4a3a10", paddingBottom: 4 }}>
          {itemDisplayName(_previewPot, gs?.fakeNames, gs?.ident, gs?.nicknames)}　[{_previewPot.contents.length}/{_previewPot.capacity}]
        </div>
        {_previewPot.contents.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>（空）</div>
        ) : (
          _previewPot.contents.map((c, ci) => (
            <div key={ci} style={{ color: "#ccaa88", fontSize: 13, lineHeight: "1.6em" }}>
              · {c.name}
            </div>
          ))
        )}
      </div>
    )}
    </div>
  );
}

/* ===== Sidebar Portrait Panel ===== */
export function SidebarPanel({ mobile, landscape, portraitSrc, loadPortrait, clearPortrait, setShowScores }) {
  if (!(!mobile || landscape)) return null;
  return (
    <div
      style={{
        position: "absolute", right: 0, top: 0, bottom: 0,
        width: mobile ? 140 : 220, background: "#080810",
        borderLeft: "1px solid #1a1a2a",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: "8px 4px", boxSizing: "border-box", zIndex: 10,
      }}
    >
      <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {portraitSrc ? (
          <img src={portraitSrc} alt="portrait" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", imageRendering: "pixelated" }} />
        ) : (
          <div style={{ color: "#333", fontSize: mobile ? 40 : 60, textAlign: "center", lineHeight: "1" }}>🧙</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
        <label style={{ display: "block", textAlign: "center", cursor: "pointer" }}>
          <input type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { if (e.target.files[0]) loadPortrait(e.target.files[0]); e.target.value = ""; }} />
          <span style={{ background: "#1a1a2a", border: "1px solid #333", borderRadius: 3, padding: "2px 6px", fontSize: 12, color: "#888", display: "block", textAlign: "center" }}>
            🖼 変更
          </span>
        </label>
        {portraitSrc && (
          <button onClick={clearPortrait}
            style={{ background: "none", border: "1px solid #333", color: "#555", fontSize: 12, borderRadius: 3, cursor: "pointer", padding: "2px 0", width: "100%" }}>
            ✕ 消去
          </button>
        )}
        <button onClick={() => setShowScores(true)}
          style={{ background: "#0d0d1a", border: "1px solid #336", color: "#8cf", fontSize: 12, borderRadius: 3, cursor: "pointer", padding: "3px 0", width: "100%", marginTop: 2 }}>
          📜 冒険記録
        </button>
      </div>
    </div>
  );
}

/* ===== Floor Select Modal (cursed teleport) ===== */
export function FloorSelectModal({ mode, setMode, sr, setGs, setMsgs, endTurn, genDungeon, refreshFOV, rng }) {
  if (!mode) return null;
  const MAX_FLOOR = sr.current?.maxDepth || 50;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#111", border: "1px solid #550", borderRadius: 6, padding: "12px 20px", color: "#ffe", minWidth: 180, maxHeight: "70vh", overflowY: "auto" }}>
        <div style={{ color: "#fa0", fontWeight: "bold", marginBottom: 8, textAlign: "center" }}>階層テレポート【呪】</div>
        <div style={{ color: "#888", fontSize: 13, marginBottom: 8, textAlign: "center" }}>↑↓:選択　Z/Enter:決定</div>
        {Array.from({ length: MAX_FLOOR }, (_, i) => i + 1).map(f => (
          <div key={f}
            style={{ padding: "2px 8px", background: f === mode.sel ? "#443300" : "transparent", color: f === mode.sel ? "#ffcc00" : "#aaa", cursor: "pointer" }}
            onClick={() => {
              const { player: _p } = sr.current || {};
              if (!_p) return;
              const _ml = [];
              if (!sr.current.floors) sr.current.floors = {};
              sr.current.floors[_p.depth] = sr.current.dungeon;
              const _saved = sr.current.floors[f];
              let _d;
              if (_saved) { _d = _saved; delete sr.current.floors[f]; }
              else { _d = genDungeon(f - 1); }
              const _maxDFs = sr.current.maxDepth;
              if (_maxDFs !== null && f >= _maxDFs && !_d.isLastFloor) {
                prepareLastFloor(_d, sr.current.dungeonType || "beginner");
              }
              _p.depth = f;
              const _rm = _d.rooms[rng(0, _d.rooms.length - 1)];
              _p.x = rng(_rm.x, _rm.x + _rm.w - 1);
              _p.y = rng(_rm.y, _rm.y + _rm.h - 1);
              refreshFOV(_d, _p);
              _d.nextSpawnTurn = _p.turns + rng(10, 50);
              sr.current.dungeon = _d;
              _ml.push(`${f}階へテレポートした！【呪】`);
              endTurn(sr.current, _p, _ml);
              setMode(null);
              setMsgs(prev => [...prev.slice(-80), ..._ml]);
              sr.current = { ...sr.current };
              setGs({ ...sr.current });
            }}
          >
            {f === mode.sel ? "▶ " : "  "}{f}階
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Debug Spell Modal ===== */
/* 食べ物エントリ生成ヘルパー (満腹の普通の[食材名]) */
const _mkFoodEntry = (name, cooked) => {
  const v = cooked ? 35 : Math.max(1, Math.floor(35 / 2));
  return { label: name, value: { name: `満腹の普通の${name}`, type:"food", effect:"satiate_food", value:v, desc:FOOD_DESCS.satiate_food, tile:cooked ? 66 : 19, cooked } };
};

/* アイテム取得のカテゴリ定義 */
const _DBG_ITEM_CATS = [
  { key: "potions",    label: "薬",           build: () => [
    ...ITEMS.filter(x => x.type === "potion").map(it => ({ label: it.name, value: { ...it } })),
    { label: WATER_BOTTLE.name, value: { ...WATER_BOTTLE } },
  ]},
  { key: "scrolls",    label: "巻物",         build: () => [
    ...ITEMS.filter(x => x.type === "scroll").map(it => ({ label: it.name, value: { ...it } })),
    { label: BLANK_SCROLL.name, value: { ...BLANK_SCROLL } },
  ]},
  { key: "weapons",    label: "武器",         build: () => [
    ...ITEMS.filter(x => x.type === "weapon").map(it => ({ label: it.name, value: { ...it } })),
    { label: CAT_CLAW_T.name,   value: { ...CAT_CLAW_T } },
    { label: EXCALIBUR_T.name,  value: { ...EXCALIBUR_T } },
  ]},
  { key: "armors",     label: "防具",         build: () => [
    ...ITEMS.filter(x => x.type === "armor").map(it => ({ label: it.name, value: { ...it } })),
  ]},
  { key: "pens",       label: "ペン",         build: () => [
    ...ITEMS.filter(x => x.type === "pen").map(it => ({ label: it.name, value: { ...it } })),
    { label: MAGIC_MARKER.name, value: { ...MAGIC_MARKER } },
  ]},
  { key: "arrows",     label: "飛び道具",     build: () => [
    ...ITEMS.filter(x => x.type === "arrow").map(it => ({ label: it.name, value: { ...it } })),
    { label: ARROW_T.name,       value: { ...ARROW_T } },
    { label: STONE_T.name,       value: { ...STONE_T } },
    { label: MAGIC_STONE_T.name, value: { ...MAGIC_STONE_T } },
  ]},
  { key: "wands",      label: "杖",           build: () => WANDS.map(w => ({ label: w.name, value: { ...w } })) },
  { key: "spellbooks", label: "魔法書",       build: () => SPELLBOOKS.map(sb => ({ label: sb.name, value: { ...sb } })) },
  { key: "rings",      label: "指輪",         build: () => RINGS.map(r => { const rv = { ...r }; if (["power_ring","defense_ring","life_ring"].includes(rv.effect)) rv.plus = rng(1,3); return { label: r.name, value: rv }; }) },
  { key: "pots",       label: "壺",           build: () => POTS.map(p => ({ label: p.name, value: { ...p, contents: [] } })) },
  { key: "raw_food",   label: "生の食べ物",   build: () => RAW_FOODS.map(n => _mkFoodEntry(n, false)) },
  { key: "cooked_food",label: "調理済み食べ物",build: () => COOKED_FOODS.map(n => _mkFoodEntry(n, true)) },
  { key: "others",     label: "その他",       build: () => [
    { label: EMPTY_BOTTLE.name, value: { ...EMPTY_BOTTLE } },
  ]},
];

const PAGE_SIZE = 10;

export function DebugSpellModal({ mode, setMode, gs, sr, setGs, setMsgs, menuSel, setMenuSel, endTurn, mobile }) {
  if (!mode || !gs) return null;
  const { effect } = mode;
  const page = mode.page ?? 0;
  const category = mode.category ?? null; // null = カテゴリ選択中 (debug_get_item のみ)

  /* --- エントリ構築 --- */
  let entries = [];
  let isPickingCategory = false;

  if (effect === "debug_summon_mon") {
    for (const m of MONS) {
      entries.push({ label: `${m.name} (Lv1)`, value: { base: m, lv: 1 } });
      const lvs = MON_LEVELS[m.baseKind];
      if (lvs) {
        if (lvs[0]) entries.push({ label: `${lvs[0].name} (Lv2)`, value: { base: m, lv: 2 } });
        if (lvs[1]) entries.push({ label: `${lvs[1].name} (Lv3)`, value: { base: m, lv: 3 } });
      }
    }
  } else if (effect === "debug_get_item") {
    if (!category) {
      isPickingCategory = true;
      entries = _DBG_ITEM_CATS.map(c => ({ label: c.label, value: c.key, isCategory: true }));
    } else {
      const cat = _DBG_ITEM_CATS.find(c => c.key === category);
      if (cat) entries = cat.build();
    }
  } else if (effect === "debug_create_trap") {
    for (const t of TRAPS) entries.push({ label: t.name, value: { ...t } });
  } else if (effect === "debug_summon_bb") {
    for (const bb of BB_TYPES) entries.push({ label: bb.name, value: { ...bb } });
  }

  /* --- ページネーション --- */
  const totalPages = isPickingCategory ? 1 : Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageEntries = isPickingCategory ? entries : entries.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const safeSel = Math.min(menuSel, Math.max(0, pageEntries.length - 1));

  const title = effect === "debug_summon_mon" ? "敵を選択"
    : effect === "debug_get_item" ? (category ? `アイテムを選択（${_DBG_ITEM_CATS.find(c=>c.key===category)?.label}）` : "カテゴリを選択")
    : effect === "debug_create_trap" ? "罠を選択"
    : "大箱を選択";

  const doSelect = (entry) => {
    /* カテゴリ選択 */
    if (entry.isCategory) {
      setMode({ ...mode, category: entry.value, page: 0 });
      setMenuSel(0);
      return;
    }

    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const ml = [];
    if (effect === "debug_summon_mon") {
      const { base, lv } = entry.value;
      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      let placed = false;
      for (const [ddx, ddy] of dirs) {
        const nx = p.x + ddx, ny = p.y + ddy;
        if (nx < 0 || ny < 0 || nx >= dg.map[0].length || ny >= dg.map.length) continue;
        if (dg.map[ny][nx] !== "." && dg.map[ny][nx] !== "+" && dg.map[ny][nx] !== "<" && dg.map[ny][nx] !== ">") continue;
        if (dg.monsters.some(m => m.x === nx && m.y === ny)) continue;
        if (nx === p.x && ny === p.y) continue;
        const lvData = lv >= 2 ? (MON_LEVELS[base.baseKind]?.[lv - 2] || {}) : {};
        const mon = {
          ...base, ...lvData, id: uid(), x: nx, y: ny,
          maxHp: (lvData.hp || base.hp), hp: (lvData.hp || base.hp),
          baseSpeed: lvData.speed || base.speed || 1,
          turnAccum: 0, aware: false, monLevel: lv,
          dir: { x: 0, y: 1 }, lastPx: 0, lastPy: 0, patrolTarget: null,
          ...(base.subtype ? { subtype: base.subtype } : {}),
          ...(base.wandEffect ? { wandEffect: base.wandEffect } : {}),
          ...(base.wallWalker ? { wallWalker: base.wallWalker } : {}),
          ...(base.float ? { float: base.float } : {}),
          ...(base.maxAttacks ? { maxAttacks: base.maxAttacks } : {}),
        };
        dg.monsters.push(mon);
        ml.push(`${mon.name}を召喚した！`);
        placed = true;
        break;
      }
      if (!placed) ml.push("召喚する場所がない！");
    } else if (effect === "debug_get_item") {
      if (p.inventory.length >= (p.maxInventory || 30)) {
        ml.push("持ち物がいっぱいだ！");
      } else {
        const it = { ...entry.value, id: uid(), fullIdent: true, bcKnown: true };
        if (it.type === "wand") it.charges = it.maxCharges ?? it.charges ?? 5;
        if (it.type === "pot") it.contents = [];
        if (it.type === "arrow") it.count = 20;
        p.inventory.push(it);
        ml.push(`${it.name}を手に入れた！`);
      }
    } else if (effect === "debug_create_trap") {
      const existing = dg.traps?.find(t => t.x === p.x && t.y === p.y);
      if (existing) {
        ml.push("足元にはすでに罠がある！");
      } else {
        const trap = { ...entry.value, id: uid(), x: p.x, y: p.y, revealed: true };
        (dg.traps || (dg.traps = [])).push(trap);
        ml.push(`${trap.name}を作った！`);
      }
    } else if (effect === "debug_summon_bb") {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1],[0,0]];
      let placed = false;
      for (const [ddx, ddy] of dirs) {
        const nx = p.x + ddx, ny = p.y + ddy;
        if (nx < 0 || ny < 0 || nx >= dg.map[0].length || ny >= dg.map.length) continue;
        if (dg.map[ny][nx] !== "." && dg.map[ny][nx] !== "+" && dg.map[ny][nx] !== "<" && dg.map[ny][nx] !== ">") continue;
        if (dg.bigboxes?.some(b => b.x === nx && b.y === ny)) continue;
        const bb = { id: uid(), x: nx, y: ny, tile: 41, kind: entry.value.kind, name: entry.value.name, capacity: entry.value.cap(), contents: [] };
        (dg.bigboxes || (dg.bigboxes = [])).push(bb);
        ml.push(`${bb.name}を設置した！`);
        placed = true;
        break;
      }
      if (!placed) ml.push("設置する場所がない！");
    }
    setMode(null);
    endTurn(sr.current, p, ml);
    setMsgs(prev => [...prev.slice(-80), ...ml]);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  };

  const goPage = (delta) => {
    const np = ((safePage + delta) + totalPages) % totalPages;
    setMode({ ...mode, page: np });
    setMenuSel(0);
  };

  return (
    <div data-debug-spell-modal style={{
      position: "absolute", top: mobile ? 8 : 28, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
      background: "#080d18", border: "1px solid #2050a0", padding: mobile ? 10 : 14, zIndex: 12,
      borderRadius: 8, boxShadow: "0 4px 20px rgba(0,40,120,0.7)",
      maxHeight: mobile ? "65dvh" : "80%", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#80c0ff", fontSize: 13, fontWeight: "bold" }}>{title}</span>
        <button onClick={() => setMode(null)}
          style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
      </div>
      <div>
        {pageEntries.map((entry, vi) => {
          const isSel = vi === safeSel;
          return (
            <div key={vi} data-debug-entry onClick={() => doSelect(entry)} style={{
              padding: "4px 8px", margin: "1px 0",
              background: isSel ? "#0a1a30" : "#060e1a",
              border: "1px solid " + (isSel ? "#2060c0" : "#152040"),
              borderRadius: 4, cursor: "pointer", fontSize: 13,
              color: isSel ? "#a0d0ff" : "#7090c0",
              fontWeight: isSel ? "bold" : "normal",
            }}>
              {isSel ? "▶ " : "  "}{entry.label}
            </div>
          );
        })}
      </div>
      {/* ページネーションUI */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <button onClick={() => goPage(-1)}
            style={{ background: "#162030", color: "#80c0ff", border: "1px solid #2050a0", borderRadius: 4, padding: "2px 10px", cursor: "pointer", fontSize: 14 }}>◀</button>
          <span style={{ color: "#5080a0", fontSize: 13 }}>{safePage + 1} / {totalPages}</span>
          <button onClick={() => goPage(1)}
            style={{ background: "#162030", color: "#80c0ff", border: "1px solid #2050a0", borderRadius: 4, padding: "2px 10px", cursor: "pointer", fontSize: 14 }}>▶</button>
        </div>
      )}
      <div style={{ color: "#304060", fontSize: 12, marginTop: 6 }}>
        ↑↓:選択  Z:決定  {totalPages > 1 ? "←→:ページ  " : ""}{effect === "debug_get_item" && category ? "X:カテゴリに戻る" : "X:閉じる"}
      </div>
    </div>
  );
}
