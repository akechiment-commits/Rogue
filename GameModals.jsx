import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { ITEMS, POTS, BB_TYPES, SPELLS, SPELLBOOKS, TRAPS, WANDS, RINGS, WEAPON_ABILITIES, ARMOR_ABILITIES, itemPrice, getIdentKey, getFavoriteFoodBase, placeItemAt, applySpellEffect, extractPotContents, scatterPotContents, potOccupancyCount, CAT_CLAW_T, SOBURO_T, EXCALIBUR_T, GOLDEN_AXE_T, TRIELEM_SWORD_T, FLAMBERGE_T, ICESWORD_T, CHIDORI_T, ULTIMA_SWORD_T, ALLBANE_SWORD_T, IRONMASS_T, SNIPER_T, GODBANE_SWORD_T, TRIELEM_ARMOR_T, MITHRIL_ARMOR_T, STOMACH_ARMOR_T, DIVINE_SHIELD_T, GODSPARKWAND_T, GOBLIN_BAT_T, ONI_CLUB_T, ARROW_T, STONE_T, MAGIC_STONE_T, EMPTY_BOTTLE, WATER_BOTTLE, BLANK_SCROLL, MAGIC_MARKER, RAW_FOODS, COOKED_FOODS, FOOD_DESCS, FOOD_DESCRIPTIONS, gemSellPrice, moveShopkeeperHome, pickLootFromPool, getShopItemCharge, formatSoldItemMessage } from "./items.js";
import { inMagicSealRoom } from "./items.js";
import { MONS, MON_LEVELS, BOSSES, INTERMEDIATE_BOSSES } from "./monsters.js";
import { T, TI, uid, rng, refreshFOV, getShops, randomTeleportDest, getVisitedFloors } from "./utils.js";
import { TILE_NAMES, TILE_RENDER, customTileImages, itemDisplayName } from "./render.js";
import { prepareLastFloor, createDimensionalVaultAt } from "./dungeon.js";
import { makeVent, makeStatue, makeAltar } from "./fixtures.js";
import { getDiscoveries, trackItem } from "./DiscoveryTracker.js";
import { loadSave } from "./SaveData.js";
import { pickDeathPortrait, isDrownDeath } from "./portraits.js";
import { WISH_PRESETS, resolveWishText, getDiscoveredWishCatalog } from "./wish.js";
import { isKeyUp, isKeyDown, isKeyLeft, isKeyRight } from "./inputKeys.js";
import { listFloorInventoryEntries, floorEntryRole, floorEntryLabel, FLOOR_INFO_ROLES, floorUseLabel, isNonSteppableFloorTrap, floorTrapDesc } from "./floorInventory.js";
import { formatPlusSuffix } from "./inventoryLabel.js";
import { pushPlayerTeleportAnim } from "./animEvents.js";
import { isScrollTargetCandidate } from "./scrollTargetRules.js";
import { getMarkerInkCost, MARKER_SPELLBOOK_INK_COST } from "./markerRules.js";
import { isBigboxKindIdentified, markBigboxKindIdentified } from "./GameHelpers.js";
import { GACHA_COST } from "./gachaRules.js";

/* 壺・大箱に入れたとき効果があるアイテムか判定 */
const _PLUS_RING_EFFECTS = ["power_ring","defense_ring","life_ring"];
const _FOOD_POT_EFFECTS = new Set(["choco","spicy","honey","curry","miso","smoke","olive","sesame","butter","yogurt","coconut","soy","garlic","lemon"]);
const ITEM_DESC_TEXT_STYLE = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "break-word",
};

function formatItemDesc(desc) {
  if (!desc) return "特に情報はない。";
  if (desc.includes("\n")) return desc;
  if (desc.length <= 36) return desc;
  return desc.replace(/。/g, "。\n").replace(/\n$/, "");
}

function isPotEffective(potEffect, item) {
  if (potEffect === "none") return true;
  if (potEffect === "enhance") return item.type === "weapon" || item.type === "armor" || (item.type === "ring" && _PLUS_RING_EFFECTS.includes(item.effect));
  if (potEffect === "weaken") return item.type === "weapon" || item.type === "armor";
  if (potEffect === "bless_pot") return item.type !== "gold";
  if (potEffect === "curse_pot") return item.type !== "gold" && item.type !== "arrow";
  if (potEffect === "boil") return item.type === "potion" || item.type === "food";
  if (potEffect === "gunpowder") return false;
  if (potEffect === "greed" || potEffect === "heal_pot" || potEffect === "wish_pot" || potEffect === "klein") return true;
  if (potEffect === "imprison") return false;
  if (_FOOD_POT_EFFECTS.has(potEffect)) return item.type === "food";
  return false;
}
const _WAND_SYNTH_EFFECTS = new Set(["slow","paralyze","sleep","darkness","confuse","bewitch","seal","fire_wand","ice_wand","lightning"]);
function isBbEffective(kind, item, bb) {
  if (kind === "change") return item.type !== "gold" && item.type !== "goal";
  if (kind === "enhance") return item.type === "weapon" || item.type === "armor" || item.type === "pot" || (item.type === "ring" && _PLUS_RING_EFFECTS.includes(item.effect));
  if (kind === "satiety") return item.type === "food";
  if (kind === "refill") return item.type === "wand" || item.type === "pen" || item.type === "marker";
  if (kind === "identify") return true;
  if (kind === "split") return item.type !== "gold" && item.type !== "goal";
  if (kind === "bless") return item.type !== "goal";
  if (kind === "curse") return item.type !== "gold" && item.type !== "goal";
  if (kind === "scatter") return true;
  if (kind === "synthesis") {
    const existing = bb?.contents || [];
    const isPlusRing = (it) => it.type === "ring" && _PLUS_RING_EFFECTS.includes(it.effect);
    if (existing.length === 0) {
      /* 空：合成に参加できる種別を強調 */
      return item.type === "weapon" || item.type === "armor" || item.type === "wand" ||
             item.type === "pen" || item.type === "marker" || item.type === "pot" || isPlusRing(item);
    }
    const e = existing[0];
    if (e.type === "weapon") return item.type === "weapon";
    if (e.type === "armor")  return item.type === "armor";
    if (e.type === "wand")   return item.type === "wand" || (_WAND_SYNTH_EFFECTS.has(e.effect) && (item.type === "weapon" || item.type === "armor"));
    if (e.type === "pen")    return item.type === "pen";
    if (e.type === "marker") return item.type === "marker";
    if (e.type === "pot")    return item.type === "pot";
    if (isPlusRing(e))       return isPlusRing(item);
    return false;
  }
  return false;
}
/* 泉に浸すと有益な変化があるアイテムか判定 */
function isSpringEffective(item) {
  if (item.type === "scroll" && item.effect !== "blank") return true;
  if (item.type === "spellbook" && item.spell) return true;
  if (item.type === "pot" && item.potEffect === "gunpowder") return true;
  return false;
}

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
const TILESET_LABELS = {
  default:   'スタイル1:シンプル',
  dawnlike:  'スタイル2:クラシック',
  mon1:      'スタイル3:リッチ',
};

export function TileEditorModal({ show, setShow, loadCustomTile, clearCustomTile, setCtLoaded, loadTileset, currentTileset }) {
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
        {loadTileset && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>グラフィックスタイル</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(TILESET_LABELS).map(([key, label]) => {
                const active = (currentTileset || 'default') === key;
                return (
                  <button
                    key={key}
                    onClick={() => loadTileset(key)}
                    style={{
                      padding: "4px 10px",
                      background: active ? "#1a3a1a" : "#1a1a1a",
                      color: active ? "#4f4" : "#aaa",
                      border: `1px solid ${active ? "#4a7a4a" : "#333"}`,
                      borderRadius: 4,
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: active ? "bold" : "normal",
                    }}
                  >
                    {active ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
export function GameOverModal({ dead, p, gameOverSel, setShowScores, init, mobile, onReturnToHub, portraitSrc, onViewMap, onViewInventory }) {
  if (!dead) return null;
  const returnSelection = onReturnToHub ? 4 : null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 20,
        borderRadius: 6,
        padding: mobile ? 8 : 18,
        boxSizing: "border-box",
        overflow: "auto",
      }}
    >
      <div
        style={{
          width: mobile ? "min(94%, 440px)" : "min(96%, 1040px)",
          height: mobile ? "min(94%, 680px)" : "min(92%, 680px)",
          maxHeight: "100%",
          display: "grid",
          gridTemplateColumns: mobile ? "1fr" : "minmax(0, 1.3fr) minmax(285px, 0.7fr)",
          gridTemplateRows: mobile ? "minmax(0, 1fr) auto" : "1fr",
          background: "rgba(4, 5, 14, 0.86)",
          border: "1px solid #34344a",
          borderRadius: 10,
          boxShadow: "0 0 28px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: mobile ? 6 : 12,
            overflow: "hidden",
          }}
        >
          <img
            src={portraitSrc || pickDeathPortrait(p.deathCause, undefined, p)}
            alt="dead"
            style={{
              width: "100%",
              height: "100%",
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              filter: isDrownDeath(p.deathCause)
                ? "drop-shadow(0 0 20px #08fa)"
                : "drop-shadow(0 0 20px #f00a)",
            }}
          />
        </div>
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: mobile ? "8px 10px 12px" : "26px 22px",
            background: "rgba(5, 6, 16, 0.94)",
            borderLeft: mobile ? "none" : "1px solid #34344a",
            borderTop: mobile ? "1px solid #34344a" : "none",
            textAlign: "center",
          }}
        >
        <div
        style={{
          color: "#f33",
          fontSize: mobile ? 20 : 26,
          fontWeight: "bold",
          textShadow: "0 0 12px #f00",
          marginBottom: 6,
          whiteSpace: "nowrap",
        }}
      >
        *** GAME OVER ***
      </div>
      <div
        style={{
          color: "#f88",
          fontSize: mobile ? 13 : 17,
          marginBottom: 6,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        {p.deathCause || "不明の原因により"}倒れた
      </div>
      <div
        style={{
          color: "#777",
          fontSize: mobile ? 11 : 14,
          marginBottom: 4,
          lineHeight: 1.5,
        }}
      >
        Lv.{p.level} | B{p.depth}F | T:{p.turns} | G:{p.gold}
      </div>
      <div style={{ color: "#777", fontSize: mobile ? 11 : 13, marginBottom: 14, lineHeight: 1.5 }}>
        ↑↓/←→/テンキー8・2・4・6:選択 / Enter で決定
      </div>
      <div style={{ display: "flex", flexDirection: mobile ? "row" : "column", width: "100%", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
        <button
          onClick={init}
          style={{
            padding: "10px 28px",
            width: mobile ? "auto" : "100%",
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
            width: mobile ? "auto" : "100%",
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
        <button
          onClick={onViewMap}
          style={{
            padding: "10px 20px",
            width: mobile ? "auto" : "100%",
            background: gameOverSel === 2 ? "#102828" : "#181828",
            color: "#8ff",
            border: `1px solid ${gameOverSel === 2 ? "#8ff" : "#2a4a4a"}`,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            borderRadius: 6,
            boxShadow: gameOverSel === 2 ? "0 0 8px #0aa" : "none",
          }}
        >
          {gameOverSel === 2 ? "▶ " : "　"}状況を見る
        </button>
        <button
          onClick={onViewInventory}
          style={{
            padding: "10px 20px",
            width: mobile ? "auto" : "100%",
            background: gameOverSel === 3 ? "#20182c" : "#181828",
            color: "#d8a8ff",
            border: `1px solid ${gameOverSel === 3 ? "#d8a8ff" : "#4a3a5a"}`,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            borderRadius: 6,
            boxShadow: gameOverSel === 3 ? "0 0 8px #a5f" : "none",
          }}
        >
          {gameOverSel === 3 ? "▶ " : "　"}持ち物を見る
        </button>
        {onReturnToHub && (
          <button
            onClick={onReturnToHub}
            style={{
              padding: "10px 20px",
              width: mobile ? "auto" : "100%",
              background: gameOverSel === returnSelection ? "#1a1208" : "#181828",
              color: "#f0c040",
              border: `1px solid ${gameOverSel === returnSelection ? "#f0c040" : "#3a2a08"}`,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 14,
              borderRadius: 6,
              boxShadow: gameOverSel === returnSelection ? "0 0 8px #c09020" : "none",
            }}
          >
            {gameOverSel === returnSelection ? "▶ " : "　"}地上に戻る
          </button>
        )}
      </div>
        </div>
      </div>
    </div>
  );
}

function formatFoodItemDesc(item) {
  const _desc = item?.type === "ring" && item.effect === "slow_ring"
    ? (RINGS.find((ring) => ring.effect === "slow_ring")?.desc || item?.desc)
    : item?.desc;
  let desc = formatItemDesc(_desc);
  const isFavorite = item?.type === "food" && item._foodBase && item._foodBase === getFavoriteFoodBase();
  if (isFavorite) {
    const originalDesc = FOOD_DESCRIPTIONS[item._foodBase];
    if (originalDesc && !desc.includes(originalDesc)) {
      desc = desc === "特に情報はない。" ? originalDesc : `${originalDesc}\n${desc}`;
    }
    if (!desc.includes("あなたの好物")) return `${desc}\nあなたの好物だ！`;
  }
  return desc;
}

/* ===== Game Over: map peek ===== */
export function GameOverMapView({ show, onReopen, mobile, resultLabel = "死亡時", returnLabel = "ゲームオーバー画面" }) {
  if (!show) return null;
  return (
    <div
      onClick={onReopen}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 19,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: mobile ? 8 : 18,
        boxSizing: "border-box",
        cursor: "pointer",
      }}
      aria-label={`状況を見る。クリックまたはキー入力で${returnLabel}に戻る`}
    >
      <div
        style={{
          padding: "8px 16px",
          color: "#d8e8ff",
          background: "rgba(4, 8, 18, 0.88)",
          border: "1px solid #557090",
          borderRadius: 6,
          fontSize: mobile ? 12 : 14,
          textAlign: "center",
          boxShadow: "0 0 12px rgba(0,0,0,0.6)",
        }}
      >
        {resultLabel}の状況を表示中 — 何かキーまたは画面を押すと{returnLabel}に戻る
      </div>
    </div>
  );
}

/* ===== Game Over: inventory peek ===== */
export function GameOverInventoryModal({ show, p, mobile, iLabel, inventoryRef, onReopen, resultLabel = "死亡時", returnLabel = "ゲームオーバー画面" }) {
  if (!show) return null;
  const inventory = p?.inventory || [];
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onReopen(); }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 21,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: mobile ? 8 : 18,
        boxSizing: "border-box",
        background: "rgba(0,0,0,0.92)",
      }}
    >
      <div
        style={{
          width: mobile ? "min(96%, 440px)" : "min(92%, 720px)",
          maxHeight: "92%",
          display: "flex",
          flexDirection: "column",
          background: "#12121c",
          border: "1px solid #5a4a70",
          borderRadius: 8,
          boxShadow: "0 0 24px rgba(0,0,0,0.8)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: mobile ? "12px 14px 8px" : "16px 20px 10px", color: "#d8a8ff", fontSize: mobile ? 16 : 19, fontWeight: "bold", borderBottom: "1px solid #30283a" }}>
          {resultLabel}の持ち物 ({inventory.length})
        </div>
        <div ref={inventoryRef} style={{ padding: mobile ? "8px 10px" : "10px 14px", overflowY: "auto" }}>
          {inventory.length === 0 ? (
            <div style={{ color: "#888", padding: 12 }}>何も持っていなかった。</div>
          ) : (
            inventory.map((item, index) => (
              <div
                key={item.id || `${item.type}-${index}`}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                  padding: "7px 8px",
                  color: "#ddd",
                  borderBottom: "1px solid #252532",
                  fontSize: mobile ? 13 : 14,
                }}
              >
                <span style={{ color: "#777", minWidth: 28, textAlign: "right" }}>{index + 1}.</span>
                <span>{iLabel ? iLabel(item) : item.name || "不明なアイテム"}</span>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: mobile ? "8px 10px 10px" : "10px 14px 14px", color: "#888", fontSize: 12, textAlign: "center", borderTop: "1px solid #30283a" }}>
          ↑↓/←→・テンキー8/2/4/6:スクロール　その他のキー:{returnLabel}に戻る
          <div style={{ marginTop: 8 }}>
            <button
              onClick={onReopen}
              style={{ padding: "8px 22px", background: "#20182c", color: "#d8a8ff", border: "1px solid #8a6aaa", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
            >
              {returnLabel}に戻る
            </button>
          </div>
        </div>
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
  /* 名付けを Z/Enter で開いた直後、同じキーで「自分でつける」が即確定するのを防ぐ */
  const _blockConfirmUntilUp = useRef(true);
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
    /* 一度名前を付けた大箱の種類は、名前を消しても冒険中は識別済みのまま */
    if (_isBigbox && _newNick) markBigboxKindIdentified(sr.current, _k.slice(3));
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
  /* サブモードリセット（モードが変わったとき）＋開きキーの食いつき防止 */
  useEffect(() => {
    _setSubMode(null);
    _setListPage(0);
    _setListSel(0);
    _setMenuSel(0);
    _blockConfirmUntilUp.current = true;
    const _onUp = (e) => {
      if (e.key === "Enter" || e.key === "z" || e.key === "Z" || e.code === "NumpadEnter") {
        _blockConfirmUntilUp.current = false;
      }
    };
    /* 押しっぱなし解放を待つ。万一 keyup を逃しても短時間で解除 */
    const _t = setTimeout(() => { _blockConfirmUntilUp.current = false; }, 400);
    window.addEventListener("keyup", _onUp);
    return () => {
      clearTimeout(_t);
      window.removeEventListener("keyup", _onUp);
    };
  }, [mode?.identKey]);
  const _isConfirmKey = (e) =>
    e.key === "Enter" || e.key === "z" || e.key === "Z" || e.code === "NumpadEnter";
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
      } else if (_isConfirmKey(e)) {
        e.preventDefault();
        /* インベントリで Z/Enter した同一キーで即「自分でつける」へ飛ばない */
        if (_blockConfirmUntilUp.current) return;
        const item = _menuItems[_menuSel];
        if (item?.enabled) item.action();
      } else if (e.key === "Escape" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        setMode(null);
      }
    };
    window.addEventListener("keydown", _onKey);
    return () => window.removeEventListener("keydown", _onKey);
  }, [_subMode, mode, _menuSel, _knownNames.length, setMode]);
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
      } else if (_isConfirmKey(e)) {
        e.preventDefault();
        if (_blockConfirmUntilUp.current) return;
        const _n = _pageNames[_listSel];
        if (_n) _applyNick(_n);
      } else if (e.key === "Escape" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        _setSubMode(null);
      }
    };
    window.addEventListener("keydown", _onKey);
    return () => window.removeEventListener("keydown", _onKey);
  }, [_subMode, mode, _listSel, _listPage, _pageNames, _totalPages]);
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

function AutoIdentifyTarget({ enabled, count, onConfirm }) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (!enabled) {
      firedRef.current = false;
      return undefined;
    }
    if (firedRef.current || count <= 0) return undefined;
    firedRef.current = true;
    const timer = setTimeout(() => {
      onConfirm(Math.floor(Math.random() * count));
    }, 0);
    return () => clearTimeout(timer);
  }, [enabled, count, onConfirm]);
  return null;
}

/* ===== Identify/Bless/Curse/Duplicate Modal ===== */
export function IdentifyModal({ mode, setMode, gs, sr, setGs, setMsgs, endTurn, iLabel, mobile, identifyConfirmRef, identifyCancelRef }) {
  const _confirmBridgeRef = useRef(null);
  useLayoutEffect(() => {
    if (identifyConfirmRef) identifyConfirmRef.current = _confirmBridgeRef.current;
  });
  if (!mode || !gs) return null;
  const _p = gs.player;
  const _isBCMode_ui = mode.mode === 'bless' || mode.mode === 'curse';
  const _footBb = mode.bbFootId ? gs?.dungeon?.bigboxes?.find(b => b.id === mode.bbFootId) : null;
  const _footBbName = _footBb ? (isBigboxKindIdentified(_footBb, gs) ? _footBb.name : (gs?.bbFakeNames?.[_footBb.kind] || "謎の大箱")) : null;
  const _bbModeOk = _footBb && !_isBCMode_ui && mode.mode !== 'unidentify';
  const _filtered = [
    ...(_bbModeOk ? [{ it: { _isBbTarget: true, _bbId: _footBb.id, name: `${_footBbName}（足元の大箱）` }, i: -1 }] : []),
    ..._p.inventory
      .map((it, i) => ({ it, i }))
      .filter(({ it, i }) => {
        return isScrollTargetCandidate(mode, it, i, gs.ident);
      }),
  ];
  const _idPage_ui = mode.page || 0;
  const _idTotalPg_ui = Math.max(1, Math.ceil(_filtered.length / 10));
  const _idPageItems_ui = _filtered.slice(_idPage_ui * 10, (_idPage_ui + 1) * 10);
  const _curSel_ui = Math.min(mode.sel || 0, Math.max(0, _idPageItems_ui.length - 1));
  const doConfirmUI = (vi) => {
    if (!sr.current) return;
    const _vi = (vi !== undefined && vi !== null) ? vi : _curSel_ui;
    const _absIdx = _idPage_ui * 10 + _vi;
    const { it: _selIt } = _filtered[_absIdx] ?? {};
    if (!_selIt) return;
    /* 操作で識別状態が変わる前の、プレイヤー向け表示名を固定する。 */
    const _selItDN = itemDisplayName(_selIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
    /* ===== 大箱ターゲット処理 ===== */
    if (_selIt._isBbTarget) {
      const _bb = sr.current.dungeon?.bigboxes?.find(b => b.id === _selIt._bbId);
      let _bbMsg = "";
      if (_bb) {
        const _bbT = BB_TYPES.find(t => t.kind === _bb.kind);
        const _bbDN = (isBigboxKindIdentified(_bb, sr.current) || mode.mode === 'identify')
          ? _bb.name
          : (sr.current.bbFakeNames?.[_bb.kind] || "謎の大箱");
        if (mode.mode === 'identify') {
          markBigboxKindIdentified(sr.current, _bb); _bb.revealed = true; trackBigbox(_bb);
          _bbMsg = `大箱「${_bb.name}」の正体が明らかになった！`;
        } else if (mode.mode === 'duplicate') {
          if (mode.cursed) {
            sr.current.dungeon.bigboxes = sr.current.dungeon.bigboxes.filter(b => b.id !== _bb.id);
            _bbMsg = `${_bbDN}が消えてしまった！【呪】`;
          } else {
            const _dg_bb = sr.current.dungeon;
            let _dupPlaced = false;
            for (const [_ddx, _ddy] of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
              const _nx = _bb.x + _ddx, _ny = _bb.y + _ddy;
              if (_dg_bb.map[_ny]?.[_nx] === T.FLOOR && !_dg_bb.bigboxes?.some(b => b.x === _nx && b.y === _ny)) {
                const _newBb = { id: uid(), x: _nx, y: _ny, tile: _bb.tile, kind: _bb.kind, name: _bb.name, capacity: _bbT?.cap() ?? _bb.capacity, contents: [], revealed: !!mode.blessed || isBigboxKindIdentified(_bb, sr.current) };
                if (mode.blessed) { markBigboxKindIdentified(sr.current, _newBb); trackBigbox(_newBb); }
                _dg_bb.bigboxes.push(_newBb);
                _dupPlaced = true;
                _bbMsg = mode.blessed ? `祝福された${_bbDN}が隣に現れた！【祝】` : `${_bbDN}の複製が隣に現れた！`;
                break;
              }
            }
            if (!_dupPlaced) _bbMsg = "複製する場所がなかった。";
          }
        } else if (mode.mode === 'sell_item') {
          const _remaining = Math.max(1, (_bb.capacity || 1) - (_bb.contents?.length || 0));
          const _baseG = (_bbT?.rare ? 3000 : 500) * _remaining;
          const _earnedG = mode.blessed ? _baseG * 2 : mode.cursed ? Math.floor(_baseG / 2) : _baseG;
          sr.current.player.gold = (sr.current.player.gold || 0) + _earnedG;
          sr.current.dungeon.bigboxes = sr.current.dungeon.bigboxes.filter(b => b.id !== _bb.id);
          _bbMsg = mode.blessed ? `${_bbDN}を${_earnedG}Gで換金した！（2倍）【祝】`
                 : mode.cursed  ? `${_bbDN}を${_earnedG}Gで換金した…（半額）【呪】`
                                : `${_bbDN}を${_earnedG}Gで換金した！`;
        } else if (mode.mode === 'transform_item' || mode.mode === 'forge_item') {
          const _otherBbs = BB_TYPES.filter(t => t.kind !== _bb.kind);
          const _newBbT = _otherBbs[Math.floor(Math.random() * _otherBbs.length)];
          if (_newBbT) {
            const _oldBbName = _bbDN;
            _bb.kind = _newBbT.kind; _bb.name = _newBbT.name; _bb.capacity = _newBbT.cap(); _bb.contents = []; _bb.revealed = mode.blessed || isBigboxKindIdentified(_bb, sr.current);
            if (mode.blessed) markBigboxKindIdentified(sr.current, _bb);
            const _newBbName = isBigboxKindIdentified(_bb, sr.current)
              ? _newBbT.name
              : (sr.current.bbFakeNames?.[_newBbT.kind] || "謎の大箱");
            _bbMsg = `${_oldBbName}が${_newBbName}に変わった！`;
          } else { _bbMsg = "変化しなかった。"; }
        } else if (mode.mode === 'pot_extract') {
          const _extBbItems = [...(_bb.contents || [])];
          _bb.contents = [];
          const _extBbFts = new Set();
          for (const _ci of _extBbItems) placeItemAt(sr.current.dungeon, sr.current.player.x, sr.current.player.y, _ci, [], _extBbFts);
          if (mode.cursed) {
            sr.current.dungeon.bigboxes = sr.current.dungeon.bigboxes.filter(b => b.id !== _bb.id);
            _bbMsg = `${_bbDN}の中身を吸い出した！大箱は壊れた！【呪】`;
          } else {
            if (mode.blessed) _bb.capacity = (_bb.capacity || 1) + 1;
            _bbMsg = _extBbItems.length > 0
              ? `${_bbDN}から${_extBbItems.map(c => itemDisplayName(c, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)).join('、')}が出た！${mode.blessed ? '（容量+1）【祝】' : ''}`
              : `${_bbDN}は空だった。${mode.blessed ? '（容量+1）【祝】' : ''}`;
          }
        } else if (mode.mode === 'weapon_up' || mode.mode === 'armor_up') {
          _bbMsg = `${_bbDN}には効果がなかった。巻物は消えた。`;
        }
      }
      if (mode.identKey) { const _scrWasUnk = !sr.current.ident.has(mode.identKey); sr.current.ident.add(mode.identKey); if (_scrWasUnk && mode.scrollIdx != null) { const _sc = sr.current.player.inventory[mode.scrollIdx]; if (_sc) trackItem(_sc); } }
      if (mode.revMsg) setMsgs((prev) => [...prev.slice(-80), mode.revMsg]);
      if (mode.scrollIdx != null) { sr.current.player.inventory.splice(mode.scrollIdx, 1); if (identifyCancelRef) identifyCancelRef.current = null; }
      if (mode.spellCost != null) sr.current.player.mp -= mode.spellCost;
      const _etMl_bb = [];
      endTurn(sr.current, sr.current.player, _etMl_bb);
      setMode(null);
      setMsgs((prev) => [...prev.slice(-80), ...(mode.spellMsg ? [mode.spellMsg] : []), _bbMsg, ..._etMl_bb]);
      sr.current = { ...sr.current }; setGs({ ...sr.current });
      return;
    }
    /* 確定時に巻物を識別 & reveal メッセージ表示 */
    if (mode.identKey) {
      const _scrWasUnknown = !sr.current.ident.has(mode.identKey);
      sr.current.ident.add(mode.identKey);
      /* 巻物自身を図鑑登録（識別UIを開いた巻物はinventory[scrollIdx]にまだある） */
      if (_scrWasUnknown && mode.scrollIdx != null) {
        const _sc = sr.current.player.inventory[mode.scrollIdx];
        if (_sc) trackItem(_sc);
      }
    }
    if (mode.revMsg) setMsgs((prev) => [...prev.slice(-80), mode.revMsg]);
    let _msgResult;
    if (mode.mode === 'sell_item') {
      /* ===== 売却の巻物 ===== */
      const _p_sell = sr.current.player;
      const _baseGold = itemPrice(_selIt);
      const _earned = mode.blessed ? _baseGold * 2 : mode.cursed ? Math.floor(_baseGold / 2) : _baseGold;
      /* 装備中なら外す */
      if (_p_sell.weapon === _selIt) _p_sell.weapon = null;
      if (_p_sell.armor === _selIt) _p_sell.armor = null;
      const _rmIdx_sell = _p_sell.inventory.indexOf(_selIt);
      if (_rmIdx_sell !== -1) {
        _p_sell.inventory.splice(_rmIdx_sell, 1);
        if (mode.scrollIdx != null && _rmIdx_sell < mode.scrollIdx) mode.scrollIdx--;
      }
      _p_sell.gold = (_p_sell.gold || 0) + _earned;
      _msgResult = formatSoldItemMessage(_selIt, _earned, mode.blessed, mode.cursed,
        (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames));
    } else if (mode.mode === 'transform_item') {
      /* ===== 変換の巻物 ===== */
      const _p_tsf = sr.current.player;
      /* E(最コモン)→…→S(最レア)。同レア同 weight */
      const _RARITY_UP   = { E:"D", D:"C", C:"B", B:"A", A:"S", S:"S" };
      const _RARITY_DOWN = { E:"E", D:"E", C:"D", B:"C", A:"B", S:"A" };
      const _excludeKey = (t) => t.type === "gold" || (t.effect === _selIt.effect && t.type === _selIt.type);
      let _pool;
      if (mode.blessed) {
        const _r = _RARITY_UP[_selIt.rarity || "C"];
        _pool = ITEMS.filter(t => t.rarity === _r && !_excludeKey(t));
      } else if (mode.cursed) {
        const _r = _RARITY_DOWN[_selIt.rarity || "C"];
        _pool = ITEMS.filter(t => t.rarity === _r && !_excludeKey(t));
      } else {
        _pool = ITEMS.filter(t => !_excludeKey(t)); /* 通常: 完全ランダム */
      }
      const _fallback = ITEMS.filter(t => !_excludeKey(t));
      /* 変化の大箱と同系統の抽選（weight＋一定確率で均等） */
      const _tmpl = (_pool.length > 0 ? pickLootFromPool(_pool, "change") : null)
        || pickLootFromPool(_fallback, "change")
        || _fallback[Math.floor(Math.random() * _fallback.length)];
      if (_tmpl) {
        const _newIt = { ..._tmpl, id: uid() };
        if (_tmpl.type === "wand") _newIt.charges = _tmpl.maxCharges ?? _tmpl.charges ?? 5;
        if (_tmpl.type === "arrow") _newIt.count = _tmpl.count ?? 1;
        const _rmIdx_tsf = _p_tsf.inventory.indexOf(_selIt);
        if (_rmIdx_tsf !== -1) {
          /* 装備中なら外す */
          if (_p_tsf.weapon === _selIt) _p_tsf.weapon = null;
          if (_p_tsf.armor === _selIt) _p_tsf.armor = null;
          _p_tsf.inventory.splice(_rmIdx_tsf, 1, _newIt);
          // splice(idx, 1, newItem) は置換なので配列長は変わらず scrollIdx の調整不要
        }
        const _newItDN = itemDisplayName(_newIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
        _msgResult = mode.blessed ? `${_selItDN}が${_newItDN}に変わった！【祝】`
                   : mode.cursed  ? `${_selItDN}が${_newItDN}に変わってしまった…【呪】`
                                  : `${_selItDN}が${_newItDN}に変わった！`;
      } else {
        _msgResult = "変換できるアイテムがなかった。";
      }
    } else if (mode.mode === 'weapon_up' || mode.mode === 'armor_up') {
      /* ===== 武器強化・防具強化の巻物 ===== */
      const _p_up = sr.current.player;
      const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
      const _gain = mode.blessed ? 2 : mode.cursed ? -1 : 1;
      const _sfx = mode.blessed ? "【祝】" : mode.cursed ? "【呪】" : "";
      const _isValidUpTarget = mode.mode === "weapon_up"
        ? (_selIt.type === "weapon" || (_selIt.type === "ring" && ["power_ring","defense_ring","life_ring"].includes(_selIt.effect)))
        : (_selIt.type === "armor" || (_selIt.type === "ring" && ["power_ring","defense_ring","life_ring"].includes(_selIt.effect)));
      if (_isValidUpTarget) {
        const _bef = _selIt.plus || 0;
        /* 武器強化の巻物による特殊変化（通常5%/祝福10%/呪い20%） */
        const _tChance = mode.blessed ? 0.10 : mode.cursed ? 0.20 : 0.05;
        const _transformT = mode.mode === 'weapon_up'
          ? (_selIt.name === "ロングソード"                                  ? EXCALIBUR_T
           : _selIt.name === "短剣"                                          ? CAT_CLAW_T
           : (_selIt.name === "バトルアクス" || _selIt.name === "戦神の斧") ? GOLDEN_AXE_T
           : null)
          : null;
        if (_transformT && Math.random() < _tChance) {
          const _oldName = _selIt.name;
          const _oldAbs = [...new Set([...(_selIt.abilities || []), ...(_selIt.ability ? [_selIt.ability] : [])])].filter(Boolean);
          Object.assign(_selIt, { ..._transformT, id: _selIt.id, plus: Math.max(0, _bef) });
          const _newAbs = [...new Set([..._oldAbs, _transformT.ability])];
          _selIt.abilities = _newAbs; _selIt.ability = _newAbs[0];
          _selIt.fullIdent = true; _selIt.bcKnown = true;
          const _transformMsg = _transformT === EXCALIBUR_T  ? "聖なる光を放ち...エクスカリバーに変化した！"
                              : _transformT === CAT_CLAW_T   ? "鋭い輝きを放ち...猫の爪に変化した！"
                                                             : "黄金の輝きを放ち...ゴールデンアクスに変化した！";
          _msgResult = `${_oldName}が${_transformMsg}${_sfx}`;
        } else {
          _selIt.plus = _bef + _gain;
          const _glow = _gain > 0 ? "輝いた" : "くすんだ";
          _msgResult = `${_selItDN}が${_glow}！(${_fp(_bef)}→${_fp(_selIt.plus)})${_sfx}`;
          if (_gain > 0 && _selIt.cursed) { _selIt.cursed = false; _msgResult += " 呪いが解けた！"; }
        }
      } else {
        _msgResult = `${_selItDN}には効果がなかった。巻物は消えた。`;
      }
      const _rmIdx_up = _p_up.inventory.findIndex((_, _ri) => _ri === mode.scrollIdx);
      if (_rmIdx_up !== -1) _p_up.inventory.splice(_rmIdx_up, 1);
    } else if (mode.mode === 'forge_item') {
      /* ===== 錬成の巻物 ===== */
      if (_selIt.type !== "weapon" && _selIt.type !== "armor") {
        _msgResult = `${_selItDN}には効果がなかった。巻物は消えた。`;
      } else {
      const _isWeapon = _selIt.type === "weapon";
      const _allAbils = _isWeapon ? WEAPON_ABILITIES : ARMOR_ABILITIES;
      const _ownedIds = new Set([...(_selIt.abilities || []), _selIt.ability].filter(Boolean));
      /* 祝福・呪いで選出プールを絞る */
      const _WEAPON_STRONG = new Set(["reach","critical","critical_oni_club","critical_war_god_axe","critical_cat_claw","oil_proof","bane_dragon","bane_float","fire_elem","ice_elem","thunder_elem","inflict_seal","inflict_immobile","inflict_bewitch","bane_undead","bane_humanoid","lifesteal","double_strike"]);
      const _WEAPON_WEAK   = new Set(["no_degrade","def_bonus","inflict_slow","knockback","recoil","gluttony"]);
      const _ARMOR_STRONG  = new Set(["regen","thorn","dodge","wand_reflect","fire_resist","lightning_resist","ice_resist","water_proof","oil_proof","all_resist","aura"]);
      const _ARMOR_WEAK    = new Set(["slow_hunger","anti_steal","no_degrade","sleep_proof","frail","noisy"]);
      const _strongSet = _isWeapon ? _WEAPON_STRONG : _ARMOR_STRONG;
      const _weakSet   = _isWeapon ? _WEAPON_WEAK   : _ARMOR_WEAK;
      const _candidateAbils = _allAbils.filter(ab => !_ownedIds.has(ab.id) && !ab.specialOnly && (
        mode.blessed ? _strongSet.has(ab.id)
      : mode.cursed  ? _weakSet.has(ab.id)
      : !ab.curseOnly && !ab.blessedOnly  /* 通常巻物では専用能力は出ない */
      ));
      /* プールが空なら全体から（既所持・特殊合成専用除く） */
      const _finalPool = _candidateAbils.length > 0 ? _candidateAbils : _allAbils.filter(ab => !_ownedIds.has(ab.id) && !ab.specialOnly);
      if (_finalPool.length > 0) {
        const _newAb = _finalPool[Math.floor(Math.random() * _finalPool.length)];
        _selIt.abilities = [...(_selIt.abilities || []), _newAb.id].filter(Boolean);
        if (!_selIt.ability) _selIt.ability = _newAb.id;
        if (_newAb.id === "pickaxe" && _selIt.durability == null) _selIt.durability = 30;
        _selIt.fullIdent = true;
        _msgResult = mode.blessed ? `${_selItDN}に「${_newAb.name}」が宿った！【祝】`
                   : mode.cursed  ? `${_selItDN}に「${_newAb.name}」が刻まれてしまった…【呪】`
                                  : `${_selItDN}に「${_newAb.name}」が宿った！`;
      } else {
        _msgResult = `${_selItDN}はもうこれ以上能力を宿せない。`;
      }
      }
    } else if (mode.mode === 'pot_extract') {
      /* ===== 吸い出しの巻物 ===== */
      const _p_ext = sr.current.player;
      const _dg_ext = sr.current.dungeon;
      const _ml_ext = [];
      const _extRes = _selIt.type === "pot"
        ? extractPotContents(_selIt, _dg_ext, _p_ext.x, _p_ext.y, _p_ext, _ml_ext, null, mode.blessed, mode.cursed)
        : null;
      /* 壺がインベントリから削除されていたら scrollIdx を補正 */
      if (_extRes?.potRemovedAt != null && mode.scrollIdx != null && _extRes.potRemovedAt < mode.scrollIdx) {
        mode.scrollIdx--;
      }
      _msgResult = _selIt.type === "pot" ? _ml_ext : `${_selItDN}には効果がなかった。巻物は消えた。`;
    } else if (mode.mode === 'bless') {
      /* 未識別品は祝福処理で bcKnown を更新する前の表示名を使う（本名漏洩防止） */
      const _selItDN = itemDisplayName(_selIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
      if (_selIt.type === 'pot') {
        _selIt.capacity = (_selIt.capacity || 1) + 1;
        _msgResult = `${_selItDN}を祝福した！(容量+1 → ${_selIt.capacity})【祝】`;
      } else { _selIt.blessed = true; _selIt.cursed = false; _selIt.bcKnown = true; _msgResult = `${_selItDN}を祝福した！【祝】`; }
    } else if (mode.mode === 'curse') {
      /* 未識別品は呪い処理で bcKnown を更新する前の表示名を使う（本名漏洩防止） */
      const _selItDN = itemDisplayName(_selIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
      if (_selIt.type === 'pot') {
        const _nc = Math.max(0, (_selIt.capacity || 1) - 1);
        const _p_ui = sr.current.player;
        if ((_selIt.contents?.length || 0) > _nc) {
          const _rmIdx2 = _p_ui.inventory.indexOf(_selIt);
          if (_rmIdx2 !== -1) { const _fts3 = new Set(); for (const _ci of (_selIt.contents || [])) placeItemAt(sr.current.dungeon, _p_ui.x, _p_ui.y, _ci, [], _fts3); _p_ui.inventory.splice(_rmIdx2, 1); }
          _msgResult = `${_selItDN}が呪いで割れた！中身が足元に落ちた！【呪】`;
        } else { _selIt.capacity = _nc; _msgResult = `${_selItDN}を呪った！(容量-1 → ${_selIt.capacity})【呪】`; }
      } else { _selIt.cursed = true; _selIt.blessed = false; _selIt.bcKnown = true; _msgResult = `${_selItDN}を呪った！【呪】`; }
    } else if (mode.mode === 'duplicate') {
      const _dupCount = mode.cursed ? 0 : 1;
      const _p_dup = sr.current.player;
      if (_dupCount === 0) {
        if (_selIt.type === "goal") {
          _msgResult = `${_selItDN}は呪いに耐えた！【呪】`;
        } else {
          const _rmIdx = _p_dup.inventory.indexOf(_selIt);
          if (_rmIdx !== -1) {
            _p_dup.inventory.splice(_rmIdx, 1);
            if (mode.scrollIdx != null && _rmIdx < mode.scrollIdx) mode.scrollIdx--;
          }
          _msgResult = `${_selItDN}が消えてしまった！【呪】`;
        }
      } else {
        const _makeFreshM = () => {
          const { blessed: _b, cursed: _c, bcKnown: _bck, fullIdent: _fi, plus: _pl, ...rest } = _selIt;
          const _copy = { ...rest, id: uid() };
          if (_copy.contents) _copy.contents = []; // 壺複製は中身なしの空壺
          return _copy;
        };
        const _newItM = _makeFreshM();
        if (mode.blessed) {
          if (_newItM.type === "pot") {
            _newItM.capacity = (_newItM.capacity || 3) + 1;
            delete _newItM.blessed;
            delete _newItM.cursed;
          } else {
            _newItM.blessed = true;
            _newItM.cursed = false;
            _newItM.bcKnown = true;
          }
        }
        _p_dup.inventory.push(_newItM);
        const _dupDispName = iLabel(_selIt);
        _msgResult = mode.blessed ? `祝福された${_dupDispName}が1つ増えた！【祝】` : `${_dupDispName}が1つ増えた！`;
      }
    } else {
      const _isBcOnly = _selIt.type === 'weapon' || _selIt.type === 'armor' || _selIt.type === 'food';
      const _selKey = _isBcOnly ? null : getIdentKey(_selIt);
      if (mode.mode === 'identify') {
        const _wasAlreadyNamed = !_isBcOnly && _selKey && sr.current.ident.has(_selKey);
        if (_selKey) { sr.current.ident.add(_selKey); if (!_wasAlreadyNamed) trackItem(_selIt); }
        _selIt.fullIdent = true; _selIt.bcKnown = true;
        _msgResult = (_isBcOnly || _wasAlreadyNamed) ? `${_selIt.name}の祝呪が判明した！` : `${_selIt.name}と判明した！`;
      } else {
        if (_selKey) sr.current.ident.delete(_selKey);
        _selIt.fullIdent = false; _selIt.bcKnown = false;
        _msgResult = `${_selIt.name}の識別が失われた...`;
      }
    }
    if (mode.scrollIdx != null) {
      sr.current.player.inventory.splice(mode.scrollIdx, 1);
      if (identifyCancelRef) identifyCancelRef.current = null;
    }
    if (mode.spellCost != null) {
      sr.current.player.mp -= mode.spellCost;
    }
    const _etMl_c = [];
    endTurn(sr.current, sr.current.player, _etMl_c);
    const _ml_id = [...(mode.spellMsg ? [mode.spellMsg] : []), ...(Array.isArray(_msgResult) ? _msgResult : (_msgResult ? [_msgResult] : [])), ..._etMl_c];
    /* bless/curseの魔法：MPが続く限りモーダルを開き続ける */
    const _isBCSpell_c = (mode.mode === 'bless' || mode.mode === 'curse') && mode.spellCost != null && mode.scrollIdx == null;
    if (_isBCSpell_c && sr.current.player.mp >= mode.spellCost) {
      setMode({ mode: mode.mode, sel: 0, spellCost: mode.spellCost, spellMsg: mode.spellMsg });
    } else {
      setMode(null);
      if (_isBCSpell_c) _ml_id.push("MPが足りない。");
    }
    setMsgs((prev) => [...prev.slice(-80), ..._ml_id]);
    sr.current = { ...sr.current }; setGs({ ...sr.current });
  };
  _confirmBridgeRef.current = doConfirmUI;
  return (
    <div
      style={{
        position: "absolute",
        top: mobile ? 8 : 28, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
        background: "#0e1a2a", border: "1px solid #2a4a7a",
        padding: mobile ? 10 : 14, zIndex: 12, borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,20,60,0.7)",
        maxHeight: mobile ? "65dvh" : "80%", overflowY: "auto",
      }}
    >
      <AutoIdentifyTarget enabled={!!mode.autoSelect} count={_filtered.length} onConfirm={doConfirmUI} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ color: "#ff0", fontSize: 13, fontWeight: "bold" }}>
          {/* 未識別の選択式巻物は効果をバレない共通文 */}
          {mode.wasUnknown ? "どのアイテムを選びますか？"
            : mode.mode === 'bless' ? "祝福するアイテムを選んでください【祝】"
            : mode.mode === 'curse' ? "呪うアイテムを選んでください【呪】"
            : mode.mode === 'duplicate' ? (mode.blessed ? "複製するアイテムを選んでください（複製品が祝福される）【祝】" : mode.cursed ? "複製するアイテムを選んでください（消えてしまう）【呪】" : "複製するアイテムを選んでください")
            : mode.mode === 'identify' ? "識別するアイテムを選んでください"
            : mode.mode === 'sell_item' ? (mode.blessed ? "換金するアイテムを選んでください（2倍）【祝】" : mode.cursed ? "換金するアイテムを選んでください（半額）【呪】" : "換金するアイテムを選んでください")
            : mode.mode === 'transform_item' ? (mode.blessed ? "変換するアイテムを選んでください（レア度↑）【祝】" : mode.cursed ? "変換するアイテムを選んでください（レア度↓）【呪】" : "変換するアイテムを選んでください")
            : mode.mode === 'forge_item' ? (mode.blessed ? "錬成する武器/防具を選んでください（強力な能力）【祝】" : mode.cursed ? "錬成する武器/防具を選んでください（役に立たない能力）【呪】" : "錬成する武器/防具を選んでください")
            : mode.mode === 'weapon_up' ? (mode.blessed ? "強化する武器/指輪を選んでください（＋2）【祝】" : mode.cursed ? "強化する武器/指輪を選んでください（－1）【呪】" : "強化する武器/指輪を選んでください（＋1）")
            : mode.mode === 'armor_up'  ? (mode.blessed ? "強化する防具/指輪を選んでください（＋2）【祝】" : mode.cursed ? "強化する防具/指輪を選んでください（－1）【呪】" : "強化する防具/指輪を選んでください（＋1）")
            : mode.mode === 'pot_extract' ? (mode.cursed ? "割る壺を選んでください【呪】" : mode.blessed ? "吸い出す壺を選んでください（容量+1）【祝】" : "吸い出す壺を選んでください")
            : mode.mode === 'unidentify' ? "識別を解除するアイテムを選んでください【呪】"
            : "どのアイテムを選びますか？"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {_idTotalPg_ui > 1 && (
            <>
              <button onClick={() => setMode({ ...mode, page: ((_idPage_ui - 1 + _idTotalPg_ui) % _idTotalPg_ui), sel: 0 })}
                style={{ background: "#1a3a5a", color: "#8af", border: "1px solid #4060a0", borderRadius: 4, padding: "2px 6px", cursor: "pointer", touchAction: "manipulation" }}>◀</button>
              <span style={{ color: "#8af", fontSize: 11 }}>{_idPage_ui + 1}/{_idTotalPg_ui}</span>
              <button onClick={() => setMode({ ...mode, page: ((_idPage_ui + 1) % _idTotalPg_ui), sel: 0 })}
                style={{ background: "#1a3a5a", color: "#8af", border: "1px solid #4060a0", borderRadius: 4, padding: "2px 6px", cursor: "pointer", touchAction: "manipulation" }}>▶</button>
            </>
          )}
          <button onClick={() => { identifyCancelRef?.current?.(); setMode(null); setMsgs((prev) => [...prev.slice(-80), "やめた。"]); }}
            style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 13 }}>✕</button>
        </div>
      </div>
      <div style={{ color: "#556", fontSize: 10, marginBottom: 4 }}>↑↓:選択　←→:ページ　Z:決定　ESC:キャンセル</div>
      {_idPageItems_ui.length === 0 && <div style={{ color: "#888" }}>該当するアイテムがない。</div>}
      {_idPageItems_ui.map(({ it, i }, vi) => {
        const _isSel = vi === _curSel_ui;
        return (
          <div key={i} onClick={() => doConfirmUI(vi)}
            style={{
              padding: "4px 8px", cursor: "pointer",
              background: _isSel ? "#2a4a6a" : "#1a3a5a",
              border: `1px solid ${_isSel ? "#4080c0" : "transparent"}`,
              margin: "2px 0", borderRadius: 4,
              color: _isSel ? "#fff" : "#ccc",
              fontWeight: _isSel ? "bold" : "normal",
            }}>
            {_isSel ? "▶ " : "　"}{it._isBbTarget ? it.name : iLabel(it)}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Shop Modal ===== */
export function ShopModal({ mode, setMode, gs, sr, setGs, setMsgs, menuSel, setMenuSel, mobile }) {
  const _calcSellPrice = (it, depth) => it.type === "gem" ? gemSellPrice(it, depth) : Math.ceil(itemPrice(it) * 0.5);
  if (!mode || !gs?.dungeon?.shop) return null;
  const _adjSkH = gs.dungeon?.monsters?.find(m =>
    m.type === "shopkeeper" && m.state !== "hostile" &&
    Math.abs(m.x - gs.player?.x) <= 1 && Math.abs(m.y - gs.player?.y) <= 1
  );
  const _curShopH = (_adjSkH && getShops(gs.dungeon).find(s => s.shopkeeperId === _adjSkH.id)) || gs.dungeon.shop;
  const _shopLabel = _curShopH?.specialtyName ? `${_curShopH.specialtyName}（専門店）` : "お店";
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
          🏪 {_shopLabel}
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
      {mode === "pay" && (() => {
        const _pp = gs.player;
        /* 隣接している店主からどの店か特定する（ショッピングモール対応） */
        const _adjSk = gs.dungeon?.monsters?.find(m =>
          m.type === "shopkeeper" && m.state !== "hostile" &&
          Math.abs(m.x - _pp.x) <= 1 && Math.abs(m.y - _pp.y) <= 1
        );
        const _payShop = (_adjSk && getShops(gs.dungeon).find(s => s.shopkeeperId === _adjSk.id))
          || getShops(gs.dungeon).find(s => s.unpaidTotal > 0)
          || gs.dungeon.shop;
        if (!_payShop) return null;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: "#fa8", fontSize: 14, marginBottom: 4 }}>
              店主：「お代は{_payShop.unpaidTotal}Gです。」
            </div>
            {[
              {
                label: `支払う (${_payShop.unpaidTotal}G)`,
                fn: () => {
                  if (sr.current) {
                    const { player: p2, dungeon: dg2 } = sr.current;
                    const _adjSk2 = dg2.monsters?.find(m =>
                      m.type === "shopkeeper" && m.state !== "hostile" &&
                      Math.abs(m.x - p2.x) <= 1 && Math.abs(m.y - p2.y) <= 1
                    );
                    const _curShop2 = (_adjSk2 && getShops(dg2).find(s => s.shopkeeperId === _adjSk2.id))
                      || getShops(dg2).find(s => s.unpaidTotal > 0)
                      || dg2.shop;
                    if (_curShop2 && p2.gold >= _curShop2.unpaidTotal) {
                      p2.gold -= _curShop2.unpaidTotal;
                      _curShop2.unpaidTotal = 0;
                      /* この店のアイテムのみ shopPrice を解除 */
                      const _clearShopPrice = (it2) => {
                        if (it2.shopPrice && (!it2._shopId || it2._shopId === _curShop2.id)) {
                          if (it2.type === "gem") it2._gemBuyPrice = it2.shopPrice;
                          delete it2.shopPrice; delete it2._shopId; delete it2._shopCharge;
                        }
                        if (it2.type === "pot" && it2.contents) it2.contents.forEach(_clearShopPrice);
                      };
                      p2.inventory.forEach(_clearShopPrice);
                      /* 全店舗が清算済みなら盗難フラグを解除 */
                      if (getShops(dg2).every(s => s.unpaidTotal === 0)) {
                        dg2.shopTheft = false;
                        p2.isThief = false;
                      }
                      /* この店の店主を元の位置に戻す */
                      const _sk5 = (_adjSk2) || dg2.monsters.find(m => m.id === _curShop2.shopkeeperId);
                      if (_sk5) moveShopkeeperHome(_sk5, _curShop2, dg2);
                      setMsgs((prev) => [...prev.slice(-80), "代金を支払った。ありがとうございます！"]);
                      sr.current = { ...sr.current };
                      setGs({ ...sr.current });
                    } else if (_curShop2) {
                      setMsgs((prev) => [...prev.slice(-80), "お金が足りない！"]);
                    }
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
            <div style={{ color: "#665533", fontSize: 11, marginTop: 4 }}>
              ↑↓/テンキー8・2:選択　Z/Enter:決定　X:閉じる
            </div>
          </div>
        );
      })()}
      {(mode === "browse" || mode === "browseConfirm") && (() => {
        const _p = gs.player;
        /* 複数店舗対応：プレイヤーが今いる店を探す */
        const _curShop = getShops(gs.dungeon).find(s => s.room &&
          _p.x >= s.room.x && _p.x < s.room.x + s.room.w &&
          _p.y >= s.room.y && _p.y < s.room.y + s.room.h);
        const _inShop = !!_curShop;
        const _sellItems = _p.inventory.filter(it => it.type !== "gold" && !it.shopPrice);
        const _totalG = _sellItems.reduce((s, it) => s + _calcSellPrice(it, _p.depth), 0);
        if (mode === "browseConfirm") {
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ color: "#fa8", fontSize: 14, marginBottom: 4 }}>
                店主：「本当によろしいですか？{_sellItems.length} 件を{_totalG.toLocaleString()}Gで買い取ります。」
              </div>
              {[
                { label: "やめる", fn: () => { setMode("browse"); setMenuSel(0); } },
                {
                  label: `はい、全て売る (${_totalG.toLocaleString()}G)`,
                  fn: () => {
                    if (!sr.current) return;
                    const { player: p2, dungeon: dg2 } = sr.current;
                    const toSell = p2.inventory.filter(it => it.type !== "gold" && !it.shopPrice);
                    if (toSell.length === 0) { setMode("browse"); return; }
                    /* 複数店舗対応：プレイヤーが今いる店を使う */
                    const _sellShop = getShops(dg2).find(s => s.room &&
                      p2.x >= s.room.x && p2.x < s.room.x + s.room.w &&
                      p2.y >= s.room.y && p2.y < s.room.y + s.room.h) || getShops(dg2)[0];
                    if (!_sellShop) { setMode("browse"); return; }
                    const _calcSell2 = (it) => it.type === "gem" ? gemSellPrice(it, p2.depth) : Math.ceil(itemPrice(it) * 0.5);
                    let earned = 0;
                    for (const it of toSell) {
                      const _sp2 = _calcSell2(it);
                      it.shopPrice = it.type === "gem" ? (it._gemBuyPrice || _sp2) + _sp2 : _sp2;
                      it._shopId = _sellShop.id;
                      earned += _sp2;
                    }
                    p2.gold += earned;
                    /* unpaidTotal に加算 → 盗賊判定・pay モードが自動的に機能する */
                    _sellShop.unpaidTotal += earned;
                    const _sk = dg2.monsters.find(m => m.id === _sellShop.shopkeeperId && m.state === "friendly");
                    if (_sk) _sk.state = "blocking";
                    setMsgs(prev => [...prev.slice(-80), `所持品 ${toSell.length} 件が店の商品になった。${earned.toLocaleString()}Gを受け取った。店主が入口をふさいだ。`]);
                    sr.current = { ...sr.current };
                    setGs({ ...sr.current });
                    setMode(null);
                  },
                },
              ].map((item, mi) => (
                <button key={mi} onClick={item.fn} style={{
                  padding: "6px 10px", background: menuSel === mi ? "#4a2a00" : "#2a1a00",
                  border: `1px solid ${menuSel === mi ? "#fa8" : "#6a4a20"}`, borderRadius: 4,
                  color: menuSel === mi ? "#ffa" : "#fa8", fontSize: 14, cursor: "pointer", textAlign: "left",
                }}>{item.label}</button>
              ))}
              <div style={{ color: "#665533", fontSize: 11, marginTop: 4 }}>
                ↑↓/テンキー8・2:選択　Z/Enter:決定　X:閉じる
              </div>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: "#fa8", fontSize: 14, marginBottom: 4 }}>
              店主：「いらっしゃいませ！」
            </div>
            {[
              { label: "やめる", fn: () => setMode(null) },
              {
                label: _inShop
                  ? `所持品を全て売る (${_totalG.toLocaleString()}G)`
                  : "所持品を全て売る (店内限定)",
                disabled: _sellItems.length === 0 || !_inShop,
                fn: () => { if (_sellItems.length > 0 && _inShop) { setMode("browseConfirm"); setMenuSel(0); } },
              },
            ].map((item, mi) => (
              <button key={mi} onClick={item.fn} disabled={item.disabled} style={{
                padding: "6px 10px", background: menuSel === mi ? "#4a2a00" : "#2a1a00",
                border: `1px solid ${menuSel === mi ? "#fa8" : "#6a4a20"}`, borderRadius: 4,
                color: item.disabled ? "#664422" : menuSel === mi ? "#ffa" : "#fa8",
                fontSize: 14, cursor: item.disabled ? "default" : "pointer", textAlign: "left",
              }}>{item.label}</button>
            ))}
            <div style={{ color: "#665533", fontSize: 11, marginTop: 4 }}>
              ↑↓/テンキー8・2:選択　Z/Enter:決定　X:閉じる
            </div>
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
                  /* it は gs 由来で sr.current と乖離している可能性があるため
                     dg3.items から同一IDのオブジェクトを取得して書き換える */
                  const _srItem = dg3.items.find(i2 => i2.id === it.id) || it;
                  _srItem.shopPrice = _srItem.type === "gem" ? (_srItem._gemBuyPrice || bp) + bp : itemPrice(_srItem);
                  if (_curSellSh) _srItem._shopId = _curSellSh.id;
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
              <div style={{ color: "#665533", fontSize: 11, marginTop: 4 }}>
                ↑↓/テンキー8・2:選択　Z/Enter:決定　X:閉じる
              </div>
            </div>
          );
        })()}
    </div>
  );
}

/* ===== Wish Modal（文字入力 ＋ 道具/恩恵） ===== */
const WISH_PAGE_SIZE = 10;
const WISH_MAIN_OPTS = [
  { id: "items", label: "道具", desc: "図鑑に載っている道具から選ぶ" },
  { id: "boons", label: "恩恵", desc: "全回復・識別・見通す・LvUP・敵全滅" },
];

export function WishModal({ mode, setMode, onConfirm, onCancel, mobile }) {
  /* view: main | items_cat | items_list | boons | text_cand */
  const [view, setView] = useState("main");
  const [categoryKey, setCategoryKey] = useState(null);
  const [text, setText] = useState("");
  const [sel, setSel] = useState(0);
  const [page, setPage] = useState(0);
  const [candidates, setCandidates] = useState(null); // template[] | null
  const [statusMsg, setStatusMsg] = useState("");
  const inputRef = useRef(null);

  /* Hooks は mode の有無に関わらず常に同数・同順で呼ぶ */
  useEffect(() => {
    if (mode) {
      setView("main");
      setCategoryKey(null);
      setText("");
      setSel(0);
      setPage(0);
      setCandidates(null);
      setStatusMsg("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  const discGroups = useMemo(() => {
    if (!mode) return [];
    try {
      const globalDisc = loadSave()?.discovered || {};
      const runDisc = getDiscoveries();
      return getDiscoveredWishCatalog(globalDisc, runDisc);
    } catch {
      return getDiscoveredWishCatalog({}, getDiscoveries());
    }
  }, [mode, view]);

  const catItems = useMemo(() => {
    if (!categoryKey) return [];
    return discGroups.find((g) => g.key === categoryKey)?.items || [];
  }, [discGroups, categoryKey]);

  /* ページング対象の中身（入力・やめるは含めない） */
  const contentRows = useMemo(() => {
    if (view === "main") {
      return WISH_MAIN_OPTS.map((o) => ({ kind: "nav", id: o.id, label: o.label, desc: o.desc }));
    }
    if (view === "boons") {
      return WISH_PRESETS.map((w) => ({ kind: "preset", id: w.id, label: w.label, desc: w.desc }));
    }
    if (view === "items_cat") {
      return discGroups.map((g) => ({
        kind: "cat",
        id: g.key,
        label: `${g.label}（${g.items.length}）`,
        desc: "",
      }));
    }
    if (view === "items_list") {
      return catItems.map((t) => ({ kind: "item", label: t.name, template: t, desc: t.desc || "" }));
    }
    if (view === "text_cand" && candidates) {
      return candidates.map((t) => ({
        kind: "item",
        label: t.name,
        template: t,
        desc: t.desc || "",
      }));
    }
    return [];
  }, [view, discGroups, catItems, candidates]);

  const totalPages = Math.max(1, Math.ceil(contentRows.length / WISH_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageContent = contentRows.slice(safePage * WISH_PAGE_SIZE, (safePage + 1) * WISH_PAGE_SIZE);

  /*
   * キーボード上下で行き来する行一覧
   * main: 入力欄 → 道具 → 恩恵 → やめる
   * その他: 中身… → 戻る（毎ページ末尾）
   */
  const navRows = useMemo(() => {
    if (view === "main") {
      return [
        { kind: "input", id: "input", label: "文字入力", desc: "道具名を入力してEnterで願う" },
        ...pageContent,
        { kind: "cancel", id: "cancel", label: "やめる", desc: "願いをやめる" },
      ];
    }
    return [
      ...pageContent,
      { kind: "back", id: "back", label: "戻る", desc: "" },
    ];
  }, [view, pageContent]);

  const safeSel = Math.min(Math.max(0, sel), Math.max(0, navRows.length - 1));
  const onInputRow = view === "main" && navRows[safeSel]?.kind === "input";

  /* 選択が入力欄のときだけフォーカス */
  useEffect(() => {
    if (!mode) return;
    if (onInputRow) {
      inputRef.current?.focus();
    } else if (document.activeElement === inputRef.current) {
      inputRef.current?.blur();
    }
  }, [mode, onInputRow, safeSel, view]);

  const leaveInputToOptions = () => {
    inputRef.current?.blur();
    /* 入力の次 = 道具（index 1） */
    setSel(1);
  };

  const goBack = () => {
    setStatusMsg("");
    if (view === "text_cand") {
      setCandidates(null);
      setView("main");
      setSel(0);
      setPage(0);
      return;
    }
    if (view === "items_list") {
      setView("items_cat");
      setCategoryKey(null);
      setSel(0);
      setPage(0);
      return;
    }
    if (view === "items_cat" || view === "boons") {
      setView("main");
      setSel(0);
      setPage(0);
      return;
    }
    onCancel?.();
  };

  const confirmText = () => {
    const r = resolveWishText(text);
    if (r.status === "none" || r.status === "forbidden") {
      setStatusMsg(r.message || "叶わない…");
      return;
    }
    if (r.status === "multi") {
      setCandidates(r.matches);
      setView("text_cand");
      setSel(0);
      setPage(0);
      setStatusMsg("どれを願う？ 候補を選んでください。");
      return;
    }
    const tmpl = r.matches[0];
    onConfirm?.({ kind: "item", template: tmpl, blessed: !!tmpl._wishBlessed });
  };

  const activateRow = (row) => {
    if (!row) return;
    if (row.kind === "input") {
      inputRef.current?.focus();
      return;
    }
    if (row.kind === "cancel") {
      onCancel?.();
      return;
    }
    if (row.kind === "back") {
      goBack();
      return;
    }
    if (row.kind === "nav") {
      if (row.id === "items") {
        if (discGroups.length === 0) {
          setStatusMsg("図鑑に載っている道具がまだない…（直接入力は可能）");
          return;
        }
        setView("items_cat");
        setSel(0);
        setPage(0);
        setStatusMsg("");
        return;
      }
      if (row.id === "boons") {
        setView("boons");
        setSel(0);
        setPage(0);
        setStatusMsg("");
        return;
      }
    }
    if (row.kind === "cat") {
      setCategoryKey(row.id);
      setView("items_list");
      setSel(0);
      setPage(0);
      return;
    }
    if (row.kind === "preset") {
      onConfirm?.({ kind: "preset", id: row.id });
      return;
    }
    if (row.kind === "item" && row.template) {
      onConfirm?.({
        kind: "item",
        template: row.template,
        blessed: !!row.template._wishBlessed,
      });
    }
  };

  const moveSel = (delta) => {
    const n = navRows.length;
    if (n <= 0) return;
    let next = safeSel + delta;
    if (next < 0) {
      if (safePage > 0) {
        setPage(safePage - 1);
        /* 前ページ末尾は「戻る」行想定 → ページ切替後に末尾へ */
        setSel(WISH_PAGE_SIZE); /* content max + back; clamp later */
      } else {
        next = n - 1;
        setSel(next);
      }
      return;
    }
    if (next >= n) {
      if (safePage < totalPages - 1) {
        setPage(safePage + 1);
        setSel(0);
      } else {
        setSel(0);
      }
      return;
    }
    setSel(next);
  };

  useEffect(() => {
    if (!mode) return;
    const onKey = (e) => {
      const inInput = e.target === inputRef.current;

      if (inInput) {
        /* 入力中: Esc/↓ で選択肢へ。Enter で願う。↑ でやめる側へ */
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          confirmText();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          leaveInputToOptions();
          return;
        }
        if (isKeyDown(e)) {
          e.preventDefault();
          e.stopPropagation();
          leaveInputToOptions();
          return;
        }
        if (isKeyUp(e)) {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.blur();
          setSel(navRows.length - 1); /* やめる */
          return;
        }
        /* 通常の文字入力はゲーム側に渡さない */
        e.stopPropagation();
        return;
      }

      if (isKeyUp(e)) {
        e.preventDefault();
        e.stopPropagation();
        moveSel(-1);
      } else if (isKeyDown(e)) {
        e.preventDefault();
        e.stopPropagation();
        moveSel(1);
      } else if (isKeyLeft(e)) {
        e.preventDefault();
        e.stopPropagation();
        if (totalPages > 1) {
          setPage((p) => (p - 1 + totalPages) % totalPages);
          setSel(0);
        }
      } else if (isKeyRight(e)) {
        e.preventDefault();
        e.stopPropagation();
        if (totalPages > 1) {
          setPage((p) => (p + 1) % totalPages);
          setSel(0);
        }
      } else if (e.key === "Enter" || e.key === "z" || e.key === "Z") {
        e.preventDefault();
        e.stopPropagation();
        const row = navRows[safeSel];
        if (row?.kind === "input") {
          confirmText();
        } else {
          activateRow(row);
        }
      } else if (e.key === "Escape" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        e.stopPropagation();
        /* 選択肢上の Esc/X は戻る／キャンセル */
        goBack();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!mode) return null;

  const title =
    view === "main" ? "✦ 何を願う？"
    : view === "boons" ? "✦ 恩恵を選ぶ"
    : view === "items_cat" ? "✦ 道具の種類"
    : view === "items_list" ? `✦ ${discGroups.find((g) => g.key === categoryKey)?.label || "道具"}`
    : "✦ 候補を選ぶ";

  const help =
    view === "main"
      ? "↑↓:入力/選択肢/やめる　Enter:願うor決定　Esc:入力から抜ける　X:やめる"
      : totalPages > 1
        ? "↑↓:選択　←→:ページ　Z:決定　X:戻る"
        : "↑↓:選択　Z:決定　X:戻る";

  /* 表示用: 入力行は別UI、中身＋やめる/戻る */
  const optionRows = navRows.filter((r) => r.kind !== "input");
  /* optionRows の index と navRows の対応: main なら +1 */
  const optionOffset = view === "main" ? 1 : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: mobile ? 8 : 40,
        left: mobile ? 4 : 24,
        right: mobile ? 4 : 24,
        background: "#120a1e",
        border: "2px solid #a6f",
        padding: mobile ? 10 : 16,
        zIndex: 20,
        borderRadius: 10,
        boxShadow: "0 6px 28px rgba(80,0,120,0.75)",
        maxHeight: mobile ? "70dvh" : "75%",
        overflowY: "auto",
      }}
    >
      <div style={{ color: "#daf", fontWeight: "bold", fontSize: 15, marginBottom: 8 }}>
        {title}
      </div>
      {view === "main" && (
        <>
          <div style={{ color: "#9ad", fontSize: 12, marginBottom: 8 }}>
            直接入力なら図鑑に無い道具も願えます。一覧は図鑑に載った道具と恩恵から。
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 10,
              padding: 4,
              borderRadius: 6,
              border: onInputRow ? "2px solid #c8f" : "2px solid transparent",
              background: onInputRow ? "#2a1a45" : "transparent",
            }}
            onClick={() => setSel(0)}
          >
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setSel(0)}
              placeholder="例: 回復薬 / 祝福の力の指輪"
              style={{
                flex: 1,
                background: "#1a1030",
                border: "1px solid #75a",
                color: "#eef",
                borderRadius: 5,
                padding: "8px 10px",
                fontSize: 14,
              }}
            />
            <button
              type="button"
              onClick={confirmText}
              style={{
                background: "#53a",
                color: "#fff",
                border: "1px solid #a6f",
                borderRadius: 5,
                padding: "6px 12px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              願う
            </button>
          </div>
        </>
      )}
      {statusMsg && (
        <div style={{ color: "#fa8", fontSize: 12, marginBottom: 8 }}>{statusMsg}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {pageContent.length === 0 && view === "items_cat" && (
          <div style={{ color: "#889", fontSize: 13, padding: 8 }}>図鑑に載っている道具がありません。</div>
        )}
        {optionRows.map((row, i) => {
          const navIdx = i + optionOffset;
          const isSel = safeSel === navIdx;
          const isFooter = row.kind === "cancel" || row.kind === "back";
          return (
            <button
              key={row.id || row.label + i}
              type="button"
              onClick={() => {
                setSel(navIdx);
                activateRow(row);
              }}
              onMouseEnter={() => setSel(navIdx)}
              style={{
                textAlign: "left",
                padding: "7px 10px",
                background: isSel ? (isFooter ? "#3a2020" : "#3a2a5a") : (isFooter ? "#1a1218" : "#1a1230"),
                color: isSel ? (isFooter ? "#fdd" : "#fdf") : (isFooter ? "#b99" : "#cbe"),
                border: isSel ? (isFooter ? "1px solid #f88" : "1px solid #c8f") : "1px solid #435",
                borderRadius: 5,
                cursor: "pointer",
                fontSize: 13,
                marginTop: isFooter ? 6 : 0,
              }}
            >
              {isSel ? "▶ " : "  "}{row.label}
              {row.desc && (
                <span style={{ color: "#889", marginLeft: 8, fontSize: 11 }}>— {row.desc}</span>
              )}
            </button>
          );
        })}
      </div>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => { setPage((p) => (p - 1 + totalPages) % totalPages); setSel(0); }}
            style={{ background: "#2a1a40", color: "#caf", border: "1px solid #75a", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}
          >
            ◀
          </button>
          <span style={{ color: "#8af", fontSize: 12 }}>{safePage + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={() => { setPage((p) => (p + 1) % totalPages); setSel(0); }}
            style={{ background: "#2a1a40", color: "#caf", border: "1px solid #75a", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}
          >
            ▶
          </button>
        </div>
      )}
      <div style={{ color: "#667", fontSize: 11, marginTop: 10 }}>{help}</div>
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
                const isEff = isSpringEffective(it);
                const isRust = it.type === "weapon" || it.type === "armor";
                return (
                  <div key={absI} onClick={() => { springDoSoak(absI); setPage(0); setMenuSel(0); }}
                    style={{
                      padding: "5px 8px", margin: "2px 0", borderRadius: 4, cursor: "pointer", fontSize: 13,
                      background: isSel ? (isEff ? "#1a3a1a" : isRust ? "#4a2a2a" : "#2a2a4a")
                                         : (isEff ? "#111f11" : isRust ? "#2a1a1a" : "#18182a"),
                      border: "1px solid " + (isSel ? (isEff ? "#4aaa4a" : isRust ? "#fa6a6a" : "#6a6afa")
                                                     : (isEff ? "#2a5a2a" : isRust ? "#6a3a3a" : "#3a3a5a")),
                      color: isEff ? "#6f6" : isRust ? "#f88" : "#aab",
                      fontWeight: isSel ? "bold" : "normal",
                    }}
                  >
                    {iLabel(it)}
                    {isRust && " ⚠ 錆びる"}
                  </div>
                );
              })
            )}
            <div style={{ color: "#556", fontSize: 12, marginTop: 4 }}>
              ↑↓:選択　←→:ページ　Z:決定　X:戻る
            </div>
            {mobile && _spPageItems.length > 0 && (
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:6 }}>
                <button onClick={() => setMenuSel(s => Math.max(0, s - 1))}
                  style={{ background:"#0a1a2a", color:"#4af", border:"1px solid #2a5a7a", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>▲</button>
                <button onClick={() => setMenuSel(s => Math.min(_spPageItems.length - 1, s + 1))}
                  style={{ background:"#0a1a2a", color:"#4af", border:"1px solid #2a5a7a", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>▼</button>
                {_spTotalPg > 1 && <>
                  <button onClick={() => { setPage(pg => (pg - 1 + _spTotalPg) % _spTotalPg); setMenuSel(0); }}
                    style={{ background:"#0a1a2a", color:"#4af", border:"1px solid #2a5a7a", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>◀</button>
                  <button onClick={() => { setPage(pg => (pg + 1) % _spTotalPg); setMenuSel(0); }}
                    style={{ background:"#0a1a2a", color:"#4af", border:"1px solid #2a5a7a", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>▶</button>
                </>}
                <button onClick={() => { const _ai = _spCurPg * 10 + menuSel; if (_spInv[_ai]) { springDoSoak(_ai); setPage(0); setMenuSel(0); } }}
                  style={{ background:"#1a4a2a", color:"#6f6", border:"1px solid #4a8a4a", borderRadius:4, padding:"5px 14px", cursor:"pointer", touchAction:"manipulation", fontWeight:"bold" }}>決定</button>
                <button onClick={() => { setMode("menu"); setMenuSel(0); setPage(0); }}
                  style={{ background:"#222", color:"#888", border:"1px solid #444", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>戻る</button>
              </div>
            )}
            {!mobile && (
              <button onClick={() => { setMode("menu"); setMenuSel(0); setPage(0); }}
                style={{ marginTop: 4, padding: "5px 16px", background: "#222", color: "#888", border: "1px solid #444", borderRadius: 5, fontSize: 13, cursor: "pointer" }}>
                戻る
              </button>
            )}
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
  const _bbIsRevealed = !_bb || isBigboxKindIdentified(_bb, gs);
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
            ? <>内容: {bigboxRef.current.contents.length}/{bigboxRef.current.capacity}{bigboxRef.current.contents.length > 0 && ": " + bigboxRef.current.contents.map((i) => itemDisplayName(i, gs?.fakeNames, gs?.ident, gs?.nicknames)).join(", ")}</>
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
                  setMode(null);
                  setNicknameMode({ identKey: _bbNickKey });
                  setNicknameInput(gs?.nicknames?.[_bbNickKey] || "");
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
                _pi.map((it, i) => {
                    const isEff = _bbIsRevealed && _bb && isBbEffective(_bb.kind, it);
                    return (
                    <div
                      key={page * _ps + i}
                      onClick={() => bigboxPutItem(page * _ps + i)}
                      style={{
                        padding: "5px 8px",
                        margin: "2px 0",
                        background: menuSel === i ? (isEff ? "#1a3a1a" : "#2a2a0a") : (isEff ? "#0e200e" : "#1a1a08"),
                        border: "1px solid " + (menuSel === i ? (isEff ? "#6fa" : "#ca6") : (isEff ? "#3a6a3a" : "#4a3a1a")),
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 13,
                        color: isEff ? "#8fe870" : "#ca8",
                        fontWeight: menuSel === i ? "bold" : "normal",
                      }}
                    >
                      {iLabel(it)}
                    </div>
                  );})
              )}
              <div style={{ color: "#556", fontSize: 12, marginTop: 4 }}>
                ↑↓:選択 ←→:ページ Z:決定 X:戻る
              </div>
              {mobile && _pi.length > 0 && (
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:6 }}>
                  <button onClick={() => setMenuSel(s => Math.max(0, s - 1))}
                    style={{ background:"#1a1a0a", color:"#ca8", border:"1px solid #5a3a1a", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>▲</button>
                  <button onClick={() => setMenuSel(s => Math.min(_pi.length - 1, s + 1))}
                    style={{ background:"#1a1a0a", color:"#ca8", border:"1px solid #5a3a1a", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>▼</button>
                  {_tp > 1 && <>
                    <button onClick={() => { setPage(p => (p - 1 + _tp) % _tp); setMenuSel(0); }}
                      style={{ background:"#1a1a0a", color:"#ca8", border:"1px solid #5a3a1a", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>◀</button>
                    <button onClick={() => { setPage(p => (p + 1) % _tp); setMenuSel(0); }}
                      style={{ background:"#1a1a0a", color:"#ca8", border:"1px solid #5a3a1a", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>▶</button>
                  </>}
                  <button onClick={() => bigboxPutItem(page * _ps + menuSel)}
                    style={{ background:"#1a4a2a", color:"#6f6", border:"1px solid #4a8a4a", borderRadius:4, padding:"5px 14px", cursor:"pointer", touchAction:"manipulation", fontWeight:"bold" }}>決定</button>
                  <button onClick={() => { setMode(null); bigboxRef.current = null; }}
                    style={{ background:"#222", color:"#888", border:"1px solid #444", borderRadius:4, padding:"5px 12px", cursor:"pointer", touchAction:"manipulation" }}>閉じる</button>
                </div>
              )}
              {!mobile && (
                <button onClick={() => { setMode(null); bigboxRef.current = null; }}
                  style={{ marginTop: 4, padding: "5px 16px", background: "#222", color: "#888", border: "1px solid #444", borderRadius: 5, fontSize: 13, cursor: "pointer" }}>
                  戻る
                </button>
              )}
            </div>
          );
        })()}
    </div>
  );
}

/* ===== Gacha Machine Modal ===== */
export function GachaModal({ mode, setMode, gs, gachaRef, menuSel, setMenuSel, onDraw, mobile }) {
  if (!mode) return null;
  const machine = gachaRef.current;
  const gold = gs?.player?.gold || 0;
  const close = () => { setMode(null); gachaRef.current = null; };
  const options = [
    { label: "ガチャを回す", desc: `${GACHA_COST}G（所持金: ${gold}G）`, disabled: gold < GACHA_COST, fn: onDraw },
    { label: "やめる", desc: "", disabled: false, fn: close },
  ];
  return (
    <div style={{ position: "absolute", top: mobile ? 8 : 28, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
      background: "#17140a", border: "1px solid #8a6a20", padding: mobile ? 10 : 14,
      zIndex: 11, borderRadius: 8, boxShadow: "0 4px 20px rgba(90,60,0,0.7)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#ffd34d", fontSize: 13, fontWeight: "bold" }}>🎰 {machine?.name || "ガチャマシーン"}</span>
        <button onClick={close} style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
      </div>
      <div style={{ color: "#d8c080", fontSize: 13, marginBottom: 8 }}>
        当たりは滅多に出なさそうだ。
      </div>
      {mode === "menu" && options.map((option, index) => (
        <button key={option.label} onClick={option.disabled ? undefined : option.fn}
          style={{ display: "block", width: "100%", padding: "8px 12px", margin: "6px 0",
            background: option.disabled ? "#1b1b1b" : menuSel === index ? "#4a3510" : "#211b0a",
            color: option.disabled ? "#555" : menuSel === index ? "#ffe89a" : "#d7bb70",
            border: `1px solid ${menuSel === index ? "#d0a832" : "#634d1b"}`, borderRadius: 5,
            cursor: option.disabled ? "not-allowed" : "pointer", fontSize: 14, textAlign: "left", opacity: option.disabled ? 0.6 : 1 }}>
          {index + 1}. {option.label}{option.desc && <span style={{ color: menuSel === index ? "#ffe9a8" : "#a89158", marginLeft: 8 }}>— {option.desc}</span>}
        </button>
      ))}
      <div style={{ color: "#8899aa", fontSize: 12, marginTop: 4 }}>↑↓:選択　Z:決定　X:閉じる</div>
    </div>
  );
}

/* ===== Altar Modal ===== */
export function AltarModal({ mode, setMode, p, menuSel, setMenuSel, onOffer, mobile, dname }) {
  if (!mode || !p) return null;
  const foods = p.inventory.map((item, index) => ({ item, index })).filter(({ item }) => item.type === "food");
  const rows = [
    ...foods.map(({ item }) => ({ label: dname(item), desc: "捧げる" })),
    { label: "やめる", desc: "" },
  ];
  const close = () => setMode(null);
  return (
    <div style={{ position: "absolute", top: mobile ? 8 : 28, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
      background: "#160d20", border: "1px solid #8b58a8", padding: mobile ? 10 : 14,
      zIndex: 11, borderRadius: 8, boxShadow: "0 4px 20px rgba(80,30,100,0.7)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#e0a8ff", fontSize: 13, fontWeight: "bold" }}>✦ 祭壇</span>
        <button onClick={close} style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
      </div>
      <div style={{ color: "#d4b8e8", fontSize: 13, marginBottom: 8 }}>捧げる食料を選んでください。</div>
      {foods.length === 0 && <div style={{ color: "#888", fontSize: 13, marginBottom: 6 }}>捧げられる食料を持っていない。</div>}
      {rows.map((row, index) => (
        <button key={`${row.label}-${index}`} onClick={() => index < foods.length ? onOffer(foods[index].item) : close()}
          style={{ display: "block", width: "100%", padding: "7px 12px", margin: "5px 0", textAlign: "left",
            background: menuSel === index ? "#422050" : "#24152d", color: menuSel === index ? "#ffe8ff" : "#d4b8e8",
            border: `1px solid ${menuSel === index ? "#d58cff" : "#68447c"}`, borderRadius: 5, cursor: "pointer", fontSize: 13 }}>
          {index + 1}. {row.label}{row.desc && <span style={{ color: "#a987b8", marginLeft: 8 }}>— {row.desc}</span>}
        </button>
      ))}
      <div style={{ color: "#8e7098", fontSize: 11, marginTop: 4 }}>↑↓/テンキー8・2:選択　Z/Enter:決定　X:閉じる</div>
    </div>
  );
}

/* ===== Wandering Merchant Modal ===== */
export function MerchantModal({ mode, setMode, gs, merchantRef, menuSel, setMenuSel, onBuy, onSell, mobile, dname }) {
  if (!mode || !gs?.player) return null;
  const merchant = merchantRef.current;
  const shop = gs.dungeon?.merchantShops?.find((entry) => entry.id === merchant?.merchantShopId);
  if (!merchant || !shop || merchant.state === "hostile") return null;
  const p = gs.player;
  const sellable = p.inventory.map((item, index) => ({ item, index })).filter(({ item }) =>
    item.type !== "gold" && item.type !== "goal" && p.weapon !== item && p.armor !== item && p.arrow !== item && !(p.rings || []).includes(item)
  );
  const pageSize = 10;
  const source = mode === "buy" ? (shop.stock || []) : sellable;
  const itemCount = mode === "menu" ? 0 : source.length;
  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize));
  const currentPage = mode === "menu"
    ? 0
    : Math.min(totalPages - 1, menuSel >= itemCount ? totalPages - 1 : Math.floor(menuSel / pageSize));
  const pageStart = currentPage * pageSize;
  const pageItems = source.slice(pageStart, pageStart + pageSize);
  const selectedLocal = mode === "menu"
    ? menuSel
    : menuSel >= itemCount ? pageItems.length : menuSel - pageStart;
  const close = () => { setMode(null); merchantRef.current = null; };
  const rows = mode === "menu"
    ? ["買う", "売る", "やめる"].map((label) => ({ label }))
    : [
      ...pageItems.map((entry) => {
        const item = mode === "buy" ? entry : entry.item;
        return {
          label: `${dname(item)}　${Math.max(1, mode === "buy" ? itemPrice(item) : Math.ceil(itemPrice(item) * 0.5))}G`,
        };
      }),
      ...(currentPage === totalPages - 1 ? [{ label: "戻る" }] : []),
    ];
  const select = (index) => {
    if (mode === "menu") {
      if (index === 0) { setMode("buy"); setMenuSel(0); }
      else if (index === 1) { setMode("sell"); setMenuSel(0); }
      else close();
    } else if (index < pageItems.length) {
      if (mode === "buy") onBuy(pageStart + index);
      else onSell(pageItems[index].index);
    } else {
      setMode("menu"); setMenuSel(0);
    }
  };
  const movePage = (delta) => {
    const nextPage = (currentPage + delta + totalPages) % totalPages;
    /* ページを開いた直後は、そのページの先頭商品を選択する。戻るは上下で選ぶ。 */
    setMenuSel(Math.min(nextPage * pageSize, itemCount));
  };
  return (
    <div style={{ position: "absolute", top: mobile ? 8 : 28, left: mobile ? 4 : 16, right: mobile ? 4 : 16,
      background: "#1a0e00", border: "1px solid #b07a30", padding: mobile ? 10 : 14,
      zIndex: 11, borderRadius: 8, boxShadow: "0 4px 20px rgba(90,40,0,0.7)", maxHeight: mobile ? "70dvh" : "80%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#ffc36b", fontSize: 13, fontWeight: "bold" }}>🧳 行商人</span>
        <button onClick={close} style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
      </div>
      {mode === "menu" && <div style={{ color: "#edc88d", fontSize: 13, marginBottom: 8 }}>行商人：「何かお探しかい？」（所持金：{p.gold}G）</div>}
      {mode !== "menu" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#edc88d", fontSize: 13, marginBottom: 8 }}>
          <span>{mode === "buy" ? `買う（所持金：${p.gold}G）` : "売る"}</span>
          {totalPages > 1 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <button onClick={() => movePage(-1)} style={{ background: "#2a1a00", color: "#ffc36b", border: "1px solid #74501e", borderRadius: 3, padding: "1px 7px", cursor: "pointer" }}>◀</button>
              <span>{currentPage + 1}/{totalPages}</span>
              <button onClick={() => movePage(1)} style={{ background: "#2a1a00", color: "#ffc36b", border: "1px solid #74501e", borderRadius: 3, padding: "1px 7px", cursor: "pointer" }}>▶</button>
            </span>
          )}
        </div>
      )}
      {rows.map((row, index) => (
        <button key={`${row.label}-${index}`} onClick={() => select(index)}
          style={{ display: "block", width: "100%", padding: "7px 12px", margin: "5px 0", textAlign: "left",
            background: selectedLocal === index ? "#4a2a00" : "#2a1a00", color: selectedLocal === index ? "#ffe9b0" : "#edc88d",
            border: `1px solid ${selectedLocal === index ? "#ffc36b" : "#74501e"}`, borderRadius: 5, cursor: "pointer", fontSize: 13 }}>
          {index + 1}. {row.label}
        </button>
      ))}
      <div style={{ color: "#8d7050", fontSize: 11, marginTop: 4 }}>↑↓/テンキー8・2:選択　←→:ページ　Z/Enter:決定　X:閉じる</div>
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
            const _tpFromX = _p.x, _tpFromY = _p.y;
            const _ml = [];
            const _walk = _dg.map[_ty]?.[_tx] !== T.WALL && _dg.map[_ty]?.[_tx] !== T.BWALL && _dg.map[_ty]?.[_tx] !== undefined;
            if (_walk) { _p.x = _tx; _p.y = _ty; if ((_p.immobileTurns||0) > 0) { _p.immobileTurns = 0; _ml.push("テレポートして移動封じが解けた！"); } _ml.push("テレポートした！（目的地指定）【祝】"); }
            else { const _rm = _dg.rooms[rng(0, _dg.rooms.length - 1)]; _p.x = rng(_rm.x, _rm.x + _rm.w - 1); _p.y = rng(_rm.y, _rm.y + _rm.h - 1); if ((_p.immobileTurns||0) > 0) { _p.immobileTurns = 0; _ml.push("テレポートして移動封じが解けた！"); } _ml.push("壁の中！ランダムにテレポートした。"); }
            pushPlayerTeleportAnim(_tpFromX, _tpFromY, _p.x, _p.y);
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
            const _tpFromX = _p.x, _tpFromY = _p.y;
            const _ml = [];
            const _rm = _dg.rooms[rng(0, _dg.rooms.length - 1)]; _p.x = rng(_rm.x, _rm.x + _rm.w - 1); _p.y = rng(_rm.y, _rm.y + _rm.h - 1);
            pushPlayerTeleportAnim(_tpFromX, _tpFromY, _p.x, _p.y);
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
export function PotPutModal({ mode, setMode, p, gs, putPage, putMenuSel, doPutItem, onCancel, iLabel, dname, mobile }) {
  if (!mode) return null;
  const pot = mode.floorPot || p.inventory[mode.potIdx];
  if (!pot) return null;
  const _cancel = onCancel || (() => setMode(null));
  const pItems = p.inventory.map((it, i) => ({ it, i })).filter(({ i }) => mode.floorPot ? true : i !== mode.potIdx);
  const _psp = 10;
  const _tpp = Math.max(1, Math.ceil(pItems.length / _psp));
  const _pgp = pItems.slice(putPage * _psp, (putPage + 1) * _psp);
  const _potKey = getIdentKey(pot);
  const _potKnown = !!(gs?.allBcKnown || pot.fullIdent || (_potKey && gs?.ident?.has(_potKey)));
  const isCancelSel = putMenuSel >= _pgp.length;
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
          {dname(pot)} ({potOccupancyCount(pot)}/{pot.capacity})
        </span>
        <button onClick={_cancel}
          style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>✕</button>
      </div>{" "}
      {pot.contents?.length > 0 && (
        <div style={{ color: "#a86", fontSize: 12, marginBottom: 6, padding: "4px 6px", background: "#1a1a08", borderRadius: 3, border: "1px solid #3a3a1a" }}>
          中身: {pot.contents.map((c) => dname(c)).join(", ")}
        </div>
      )}{" "}
      <div style={{ color: "#ca8", fontSize: 13, marginBottom: 6 }}>入れるアイテムを選んでください</div>{" "}
      {pItems.length === 0 ? (
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
            const isSel = vi === putMenuSel;
            const isDisabled = isPot;
            const isEff = _potKnown && isPotEffective(pot.potEffect, it2);
            return (
              <div key={i2} onClick={() => { if (!isDisabled) doPutItem(i2); }}
                style={{
                  padding: "5px 8px", margin: "2px 0",
                  background: isSel ? (isDisabled ? "#3a1a1a" : isEff ? "#1a3a1a" : "#28285a")
                    : (isDisabled ? "#1a1a1a" : isEff ? "#0e2010" : "#18182a"),
                  border: "1px solid " + (isDisabled ? "#333" : isSel ? (isEff ? "#6fa" : "#88c") : (isEff ? "#3a6a3a" : "#3a3a5a")),
                  borderRadius: 4, cursor: isDisabled ? "not-allowed" : "pointer", fontSize: 13,
                  color: isDisabled ? "#555" : isEff ? "#8fe870" : "#aab",
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                {iLabel(it2)}{isDisabled && " (入れられない)"}
              </div>
            );
          })}
        </div>
      )}{" "}
      <div style={{ color: "#556", fontSize: 12, marginTop: 4 }}>
        {_tpp > 1 ? "↑↓:選択（やめる可） ←→:ページ Z:決定 X:戻る" : "↑↓:選択（やめる可） Z:決定 X:戻る"}
      </div>{" "}
      <button onClick={_cancel}
        style={{
          marginTop: 8, padding: "5px 16px",
          background: isCancelSel ? "#3a2a2a" : "#222",
          color: isCancelSel ? "#fcc" : "#888",
          border: isCancelSel ? "1px solid #a66" : "1px solid #444",
          borderRadius: 5, fontSize: 13, cursor: "pointer",
          fontWeight: isCancelSel ? "bold" : "normal",
        }}>
        やめる
      </button>{" "}
    </div>
  );
}

/* ===== Marker Modal ===== */
export function MarkerModal({ mode, setMode, sr, menuSel, setMenuSel, page = 0, setPage, doMarkerWrite, setMsgs, mobile, pastIdent = [], discoveredItems = {} }) {
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
  const _ps = 10;
  const _totalPages = Math.max(1, Math.ceil(_mlen / _ps));
  const _safePage = Math.min(page, _totalPages - 1);
  const _pageItems = listItems.slice(_safePage * _ps, (_safePage + 1) * _ps);
  const _pageLen = _pageItems.length;
  const safeSel = Math.min(menuSel, Math.max(0, _pageLen - 1));
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
        {isBlankStep ? "書き込む白紙アイテムを選んでください" : isSpellbookTypeStep ? `変える魔法書の種類を選んでください (インク${MARKER_SPELLBOOK_INK_COST}回消費)` : "書き込む魔法を選んでください（識別済みのもののみ）"}
      </div>
      {_mlen === 0 ? (
        <div style={{ color: "#aaa", fontSize: 13 }}>{isBlankStep ? "白紙の巻物も白紙の魔法書もない。" : !isSpellbookTypeStep && !isBlankStep ? "書き込める巻物がまだない。" : "選択肢がない。"}</div>
      ) : (
        <div>
          {_totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 6, color: "#888", fontSize: 12 }}>
              <span>←→でページ切替</span>
              <span style={{ color: "#ccc" }}>{_safePage + 1}/{_totalPages}ページ</span>
              <span>({_safePage * _ps + 1}〜{Math.min((_safePage + 1) * _ps, _mlen)}件)</span>
            </div>
          )}
          {_pageItems.map(({ it, i }, vi) => {
            const isSel = vi === safeSel;
            return (
              <div key={isBlankStep ? i : (it.spell || it.effect || i)}
                onClick={() => {
                  if (isBlankStep) {
                    const kind = it.type === "spellbook" ? "spellbook" : "scroll";
                    const nextStep = kind === "spellbook" ? "select_spellbook_type" : "select_type";
                    setMode({ ...mode, step: nextStep, blankIdx: i, blankKind: kind });
                    setMenuSel(0);
                    if (setPage) setPage(0);
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
                {isBlankStep && it.blessed ? <span style={{ color: "#ffcc44", marginRight: 4, fontSize: 12 }}>【祝】</span> : null}
                {isBlankStep && it.cursed ? <span style={{ color: "#cc44ff", marginRight: 4, fontSize: 12 }}>【呪】</span> : null}
                {it.name}
                {isBlankStep && it.type === "spellbook" ? <span style={{ color: "#5090cc", marginLeft: 6, fontSize: 12 }}>[魔法書]</span> : null}
                {isBlankStep && it.type === "scroll" ? <span style={{ color: "#888855", marginLeft: 6, fontSize: 12 }}>[巻物]</span> : null}
                {!isBlankStep ? <span style={{ color: "#d0a060", marginLeft: 6, fontSize: 12 }}>[インク{getMarkerInkCost(it)}回分]</span> : null}
                {!isBlankStep && it.desc ? <span style={{ color: "#776688", marginLeft: 6, fontSize: 12 }}>{it.desc}</span> : null}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ color: "#556", fontSize: 12, marginTop: 4 }}>{_totalPages > 1 ? "↑↓:選択 ←→:ページ Z:決定 X:閉じる" : "↑↓:選択 Z:決定 X:閉じる"}</div>
      <button onClick={() => setMode(null)}
        style={{ marginTop: 8, padding: "5px 16px", background: "#222", color: "#888", border: "1px solid #444", borderRadius: 5, fontSize: 13, cursor: "pointer" }}>やめる</button>
    </div>
  );
}

/* ===== Spell List Modal ===== */
export function SpellListModal({ mode, setMode, gs, sr, setGs, setMsgs, menuSel, setMenuSel, page, setPage, setIdentifyMode, setShowInv, setSelIdx, setShowDesc, setThrowMode, setDebugSpellMode, endTurn, lu, mobile, spellConfirmRef }) {
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
  const castSpell = (vi) => {
    const spell = pageSpells[vi];
    if (!spell) return;
    if ((gs?.player?.mp ?? 0) < spell.mpCost) { setMsgs((prev) => [...prev.slice(-80), `MPが足りない！(必要:${spell.mpCost} 現在:${gs?.player?.mp ?? 0})`]); return; }
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
          if (_ii.type === 'weapon' || _ii.type === 'armor' || _ii.type === 'food') return !_ii.fullIdent && !_ii.bcKnown;
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
  };
  if (spellConfirmRef) spellConfirmRef.current = castSpell;
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
              <div key={spell.id} onClick={() => castSpell(vi)} style={{
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
        {(() => {
          const _latestTurn = typeof msgs[total - 1] === "object" ? msgs[total - 1].turn : undefined;
          return visible.map((m, i) => {
            const absIdx = start + i;
            const _text = typeof m === "object" ? m.text : m;
            const _msgColor = typeof m === "object" ? m.color : undefined;
            const _turn = typeof m === "object" ? m.turn : undefined;
            const _isCurTurn = _turn !== undefined && _turn === _latestTurn;
            return (
              <div key={absIdx} style={{
                fontSize: mobile ? 12 : 13, lineHeight: "1.5em",
                color: _msgColor ?? (_isCurTurn ? "#ffffff" : "#aaaaaa"),
                fontWeight: _msgColor ? "bold" : undefined,
                opacity: _isCurTurn ? 1 : 0.75,
                padding: "2px 0",
                borderBottom: "1px solid #1a2030",
              }}>
                <span style={{ color: "#6080a0", marginRight: 6, fontSize: 11 }}>{absIdx + 1}</span>
                {_turn > 0 && <span style={{ color: _isCurTurn ? "#80c0e8" : "#507090", marginRight: 3, fontSize: 11 }}>[{_turn}]</span>}
                {_text}
              </div>
            );
          });
        })()}
      </div>
      <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#5a7898", fontSize: 12 }}>
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
  containerRef, penMergeMode,
  doFloorPickup, doFloorTrap, doFloorStair, doFloorBigbox, doFloorSpring, doFloorGacha, doFloorAltar, doFloorItemAction, doFloorOpenPutMode, doFloorPen, doFloorWaveWand,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  if (!show) return null;
  /* 足元のアイテム・罠・風穴・魔方陣・泉・大箱 */
  const _fl = listFloorInventoryEntries(gs?.dungeon, p.x, p.y, {
    allBcKnown: !!gs?.allBcKnown,
    bbFakeNames: gs?.bbFakeNames,
    ident: gs?.ident,
    identifiedBigboxes: gs?.identifiedBigboxes,
  });
  const _flItems = _fl.items;
  const _flTraps = _fl.traps;
  const _flAll = _fl.all;
  const _hasFl = _flAll.length > 0;
  const _invTotalPg = Math.ceil(p.inventory.length / 10) || 1;
  const _totalPg = _invTotalPg + (_hasFl ? 1 : 0);
  const _isFloorPg = _hasFl && invPage === _invTotalPg;
  const _getFloorActs = (entry) => {
    const _role = floorEntryRole(entry, _flItems, _flTraps);
    const _descAct = { label: "説明", fn: () => setShowDesc(10000 + _flAll.indexOf(entry)) };
    if (_role === "trap") {
      if (isNonSteppableFloorTrap(entry)) return [_descAct]; /* 骨：説明のみ */
      return [
        { label: "踏む", fn: () => doFloorTrap?.(entry) },
        _descAct,
      ];
    }
    if (_role === "stair") return [
      { label: floorUseLabel(entry, p), fn: () => doFloorStair?.(entry) },
      _descAct,
    ];
    if (_role === "bigbox") return [
      { label: floorUseLabel(entry, p), fn: () => doFloorBigbox?.(entry) },
      _descAct,
    ];
    if (_role === "spring") return [
      { label: floorUseLabel(entry, p), fn: () => doFloorSpring?.(entry) },
      _descAct,
    ];
    if (_role === "gacha") return [
      { label: floorUseLabel(entry, p), fn: () => doFloorGacha?.(entry) },
      _descAct,
    ];
    if (_role === "altar") return [
      { label: floorUseLabel(entry, p), fn: () => doFloorAltar?.(entry) },
      _descAct,
    ];
    if (_role === "dimensionalVault") return [_descAct];
    if (FLOOR_INFO_ROLES.has(_role)) return [
      _descAct,
    ];
    const _isEquipType = ["weapon","armor","arrow","ring"].includes(entry.type);
    const a = [{ label: "拾う", fn: () => doFloorPickup?.(entry) }];
    if (entry.type === "pot") {
      a.push({ label: "入れる", fn: () => doFloorOpenPutMode?.(entry) });
    } else if (entry.type === "marker") {
      a.push({ label: "書く", fn: () => doFloorPen?.(entry) });
    } else if (canUse(entry)) {
      // 装備系: capチェックあり・インベントリ保持。巻物: 選択ダイアログでscrollIdxを使うためinv保持。それ以外: cap不要・使用後床に戻す
      const _keepInv = _isEquipType || entry.type === "scroll";
      a.push({ label: useLabel(entry), fn: () => doFloorItemAction?.(entry, doUseItem, !_isEquipType, _keepInv) });
    }
    if (entry.type === "spellbook") a.push({ label: "読む", fn: () => doFloorItemAction?.(entry, doReadSpellbook, true, false) });
    if (entry.type === "arrow") a.push({ label: "射る", fn: () => doFloorItemAction?.(entry, doShoot, true, true) });
    if (entry.type === "wand") { a.push({ label: "振る", fn: () => doFloorWaveWand?.(entry) }); a.push({ label: "壊す", fn: () => doFloorItemAction?.(entry, doBreakWand, true, false) }); }
    if (entry.type === "pot") a.push({ label: "割る", fn: () => doFloorItemAction?.(entry, doBreakPot, true, false) });
    a.push({ label: entry.type === "arrow" ? "投げる(束)" : "投げる", fn: () => doFloorItemAction?.(entry, doThrow, true, true) });
    a.push({ label: "説明", fn: () => setShowDesc(10000 + _flAll.indexOf(entry)) });
    return a;
  };
  const _previewIdx = hoveredIdx !== null ? hoveredIdx : selIdx;
  const _previewItem = _previewIdx !== null ? (_isFloorPg ? null : p.inventory[invPage * 10 + _previewIdx]) : null;
  const _selItem = selIdx !== null ? (_isFloorPg ? null : p.inventory[invPage * 10 + selIdx]) : null;
  const _previewPot = _selItem?.type === "pot" ? _selItem : null;
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
          武器: <span style={{ color: "#fa0" }}>{p.weapon.name}{formatPlusSuffix(p.weapon.plus)}</span> (攻+{p.weapon.atk + (p.weapon.plus || 0)})
          {(p.weapon.ability || p.weapon.abilities?.length > 0) && (
            <span style={{ color: "#fc6", fontSize: 9 }}> [{[...new Set([...(p.weapon.abilities || []), ...(p.weapon.ability ? [p.weapon.ability] : [])])].map((id) => WEAPON_ABILITIES.find((a) => a.id === id)?.name).filter(Boolean).join("・")}]</span>
          )}
        </div>
      )}
      {p.armor && (
        <div style={{ color: "#aaa", fontSize: 13, marginBottom: 2 }}>
          防具: <span style={{ color: "#08f" }}>{p.armor.name}{formatPlusSuffix(p.armor.plus)}</span> (防+{p.armor.def + (p.armor.plus || 0)})
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
      {_totalPg > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 6, color: "#888", fontSize: 13 }}>
          <span>←→でページ移動</span>
          {_isFloorPg
            ? <span style={{ color: "#8cf", fontWeight: "bold" }}>★ 足元のアイテム・罠・ギミック</span>
            : <><span style={{ color: "#ccc" }}>{invPage + 1}/{_invTotalPg}ページ</span>
                <span>({invPage * 10 + 1}〜{Math.min((invPage + 1) * 10, p.inventory.length)}件)</span></>
          }
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
      {_isFloorPg ? (
        _flAll.length === 0 ? (
          <div style={{ color: "#555", padding: 8 }}>足元には何もない。</div>
        ) : (
          _flAll.map((entry, j) => {
            const _fRole = floorEntryRole(entry, _flItems, _flTraps);
            const _fIsItem = _fRole === "item";
            const _fActs = _getFloorActs(entry);
            const _fLabel = floorEntryLabel(entry, _flItems, _flTraps, iLabel);
            const _fColor = _fIsItem ? "#ccc"
              : _fRole === "trap" ? "#f86"
              : _fRole === "vent" ? "#8cf"
              : _fRole === "spring" ? "#6af"
              : _fRole === "bigbox" ? "#da8"
              : _fRole === "altar" ? "#d58cff"
              : _fRole === "dimensionalVault" ? "#b874ff"
              : _fRole === "pentacle" ? "#ca8"
              : _fRole === "stair" ? "#8a8"
              : "#aaa";
            return (
              <div key={entry.id || `${_fRole}-${j}`} onMouseEnter={() => setHoveredIdx(j)} onMouseLeave={() => setHoveredIdx(null)}
                style={{ borderBottom: "1px solid #222", borderRadius: 4, marginBottom: 1 }}>
                <div onClick={() => { setSelIdx(selIdx === j ? null : j); setInvMenuSel(null); setShowDesc(null); setTimeout(() => containerRef?.current?.focus(), 0); }}
                  style={{ padding: "7px 8px", cursor: "pointer", fontSize: mobile ? 13 : 12,
                    background: selIdx === j ? "#252540" : "transparent", borderRadius: 4,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    color: _fColor,
                  }}>
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <TileIcon item={entry} size={16} />
                    {_fLabel}
                  </span>
                  <span style={{ color: "#555", fontSize: 12 }}>{selIdx === j ? (invMenuSel !== null ? "▶" : "▲") : "▼"}</span>
                </div>
                {selIdx === j && (
                  <div style={{ padding: "4px 8px 8px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {_fActs.map((a, ai) => (
                        <button key={ai} onClick={() => a.fn()}
                          style={{ background: invMenuSel === ai ? "#3a3a6a" : "#1a1a2a", color: invMenuSel === ai ? "#fff" : "#aaa",
                            border: invMenuSel === ai ? "1px solid #88f" : "1px solid #333", borderRadius: 4, padding: "4px 10px",
                            cursor: "pointer", fontSize: mobile ? 13 : 12, fontWeight: invMenuSel === ai ? "bold" : "normal" }}>{a.label}</button>
                      ))}
                    </div>
                    {invMenuSel !== null && <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>←→:選択 Z:決定 X:キャンセル</div>}
                    {showDesc === 10000 + j && (
                      <div style={{ background: "#18182a", border: "1px solid #3a3a5a", borderRadius: 5, padding: "8px 10px", color: "#aab", fontSize: 13, lineHeight: "1.5em", marginTop: 4, maxWidth: mobile ? "100%" : "calc(100% - 230px)", boxSizing: "border-box" }}>
                        <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>{_fLabel}</div>
                        <div style={ITEM_DESC_TEXT_STYLE}>{(() => {
                          if (_fRole === "trap") return formatItemDesc(floorTrapDesc(entry) || entry.desc);
                          if (_fRole !== "item") return formatItemDesc(entry.desc);
                          const _kk = getIdentKey(entry);
                          return (_kk && gs?.ident && !gs.ident.has(_kk)) ? "未識別のためわからない。" : formatFoodItemDesc(entry);
                        })()}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )
      ) : p.inventory.length === 0 ? (
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
          if (!it.noDrop) acts.push({ label: "置く", fn: () => { doDropItem(i); setInvMenuSel(null); } });
          { const _isCursedEquipped = it.cursed && (p.weapon === it || p.armor === it || (p.rings || []).includes(it));
            if (!_isCursedEquipped && !it.noThrow) acts.push({ label: it.type === "arrow" ? "投げる(束)" : "投げる", fn: () => { doThrow(i); setInvMenuSel(null); } }); }
          acts.push({ label: "説明", fn: () => { setShowDesc((prev) => (prev === i ? null : i)); setInvMenuSel(null); } });
          { const _nik = getIdentKey(it);
            if (_nik && gs?.ident && !gs.ident.has(_nik)) {
              acts.push({ label: "名付ける", fn: () => { setNicknameMode({ identKey: _nik }); setNicknameInput(gs?.nicknames?.[_nik] || ''); setShowInv(false); setSelIdx(null); setShowDesc(null); setInvMenuSel(null); } });
            }
          }
          const _isUnidentInv = (() => { const _kk = getIdentKey(it); return !!(_kk && gs?.ident && !gs.ident.has(_kk)); })();
          const _isIdentBCUnknown = (() => {
            if (it.type === 'weapon' || it.type === 'armor' || it.type === 'food') return !it.fullIdent && !it.bcKnown;
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
                    ? <span style={{ color: "#ff6622", fontSize: 12, marginLeft: 4 }}>〔未払:{getShopItemCharge(it)}G〕</span>
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
                    <div style={{ background: "#18182a", border: "1px solid #3a3a5a", borderRadius: 5, padding: "8px 10px", color: "#aab", fontSize: 13, lineHeight: "1.5em", marginTop: 4, maxWidth: mobile ? "100%" : "calc(100% - 230px)", boxSizing: "border-box" }}>
                      <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>
                        {itemDisplayName(it, gs?.fakeNames, gs?.ident, gs?.nicknames)}
                        {it.type === "weapon" && ` — 武器 (攻+${it.atk})`}
                        {it.type === "armor" && ` — 防具 (防+${it.def})`}
                        {it.type === "arrow" && ` — 矢 (攻${it.atk}, ${it.count}本)`}
                        {it.type === "wand" && gs?.ident?.has(getIdentKey(it)) && ` — 杖 [残${it.charges}回]`}
                        {it.type === "marker" && ` [残${it.charges}回]`}
                        {it.type === "potion" && " — 薬"}
                        {it.type === "bottle" && " — 瓶"}
                        {it.type === "scroll" && " — 巻物"}
                        {it.type === "food" && ` — 食料${it.cooked ? "(調理済)" : "(生)"}`}
                        {it.type === "pot" && ` — 壺 [${potOccupancyCount(it)}/${it.capacity}]`}
                        {it.type === "ring" && ` — 指輪${!_isUnidentInv && ["power_ring","defense_ring","life_ring"].includes(it.effect) ? ` (+${it.plus || 0})` : ""}`}
                      </div>
                      <div style={ITEM_DESC_TEXT_STYLE}>{_isUnidentInv ? "未識別のためわからない。" : formatFoodItemDesc(it)}</div>
                      {it.ability && (() => {
                        const _ab = [...WEAPON_ABILITIES, ...ARMOR_ABILITIES].find((a) => a.id === it.ability);
                        return _ab ? <div style={{ color: "#fa0", marginTop: 3 }}>【特性】{_ab.name}：{_ab.desc}</div> : null;
                      })()}
                      {it.potionEffects?.length > 0 && (
                        <div style={{ color: "#fc6", marginTop: 3 }}>薬効果: {it.potionEffects.map((e) => ({ heal: "回復", poison: "猛毒", sleep: "睡眠", power: "強化" })[e] || e).join(", ")}</div>
                      )}
                      {it.type === "pot" && it.potEffect === "imprison" && (it.confinedMonsters?.length || 0) > 0 && (
                        <div style={{ color: "#ca8", marginTop: 3 }}>閉じ込め: {it.confinedMonsters.map((c) => c.name).join(", ")}</div>
                      )}
                      {it.type === "pot" && it.potEffect !== "imprison" && it.contents?.length > 0 && (
                        <div style={{ color: "#ca8", marginTop: 3 }}>中身: {it.contents.map((c) => itemDisplayName(c, gs?.fakeNames, gs?.ident, gs?.nicknames)).join(", ")}</div>
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
          {itemDisplayName(_previewPot, gs?.fakeNames, gs?.ident, gs?.nicknames)}　[{potOccupancyCount(_previewPot)}/{_previewPot.capacity}]
        </div>
        {potOccupancyCount(_previewPot) === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>（空）</div>
        ) : _previewPot.potEffect === "imprison" ? (
          (_previewPot.confinedMonsters ?? []).map((c, ci) => (
            <div key={ci} style={{ color: "#ccaa88", fontSize: 13, lineHeight: "1.6em" }}>
              · {c.name}
            </div>
          ))
        ) : (
          (_previewPot.contents ?? []).map((c, ci) => (
            <div key={ci} style={{ color: "#ccaa88", fontSize: 13, lineHeight: "1.6em" }}>
              · {itemDisplayName(c, gs?.fakeNames, gs?.ident, gs?.nicknames)}
            </div>
          ))
        )}
      </div>
    )}
    </div>
  );
}

/* ===== Sidebar Portrait Panel ===== */
export function SidebarPanel({ mobile, landscape, portraitSrc, showPortrait = true, setShowScores, setShowSettings }) {
  if (!(!mobile || landscape)) return null;
  /* reaction_fall_severe だけ被写体が右寄りに大きく描かれているため、全体を収める。 */
  const fitWideFallPortrait = typeof portraitSrc === "string" && /reaction_fall_severe\.png(?:[?#]|$)/.test(portraitSrc);
  return (
    <div
      style={{
        position: "absolute", right: 0, top: 0, bottom: 0,
        width: mobile ? 140 : 220, background: "#000",
        borderLeft: "1px solid #333",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: "8px 4px", boxSizing: "border-box", zIndex: 10,
      }}
    >
      <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible", position: "relative" }}>
        {showPortrait && (
          <img
            src={portraitSrc || "/tiles/Character/stand_normal.png"}
            alt="portrait"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.portraitFallbackApplied === "1") return;
              const fallback = new URL(img.src, window.location.href).searchParams.get("portraitFallback");
              if (!fallback) return;
              img.dataset.portraitFallbackApplied = "1";
              img.src = fallback;
            }}
            style={fitWideFallPortrait
              ? {
                width: "220%",
                objectFit: "contain",
                transform: "translateX(-10%)",
              }
              : { width: "220%", objectFit: "contain" }}
          />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
        <button onClick={() => setShowSettings(true)}
          style={{ background: "#1a1a2a", border: "1px solid #333", color: "#aaa", fontSize: 12, borderRadius: 3, cursor: "pointer", padding: "3px 0", width: "100%" }}>
          ⚙ 設定
        </button>
        <button onClick={() => setShowScores(true)}
          style={{ background: "#0d0d1a", border: "1px solid #336", color: "#8cf", fontSize: 12, borderRadius: 3, cursor: "pointer", padding: "3px 0", width: "100%" }}>
          📜 冒険記録
        </button>
      </div>
    </div>
  );
}

const DESKTOP_VW_OPTIONS = [
  { value: 21, label: "特大" },
  { value: 25, label: "大" },
  { value: 27, label: "中" },
  { value: 33, label: "小" },
];

export function SettingsModal({ show, setShow, loadPortrait, clearPortrait, portraitSrc, loadTileset, currentTileset, desktopVW, setDesktopVW, mobile }) {
  if (!show) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111", border: "1px solid #333", borderRadius: 8, width: 320, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>⚙ 設定</span>
          <button onClick={() => setShow(false)}
            style={{ background: "none", border: "1px solid #444", color: "#888", cursor: "pointer", borderRadius: 4, padding: "2px 8px" }}>✕</button>
        </div>

        {/* グラフィックスタイル */}
        <div>
          <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>グラフィックスタイル</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(TILESET_LABELS).map(([key, label]) => {
              const active = (currentTileset || 'default') === key;
              return (
                <button key={key} onClick={() => loadTileset(key)}
                  style={{ padding: "4px 10px", background: active ? "#1a3a1a" : "#1a1a1a", color: active ? "#4f4" : "#aaa", border: `1px solid ${active ? "#4a7a4a" : "#333"}`, borderRadius: 4, fontSize: 13, cursor: "pointer", fontWeight: active ? "bold" : "normal" }}>
                  {active ? `✓ ${label}` : label}
                </button>
              );
            })}
          </div>
        </div>

        {/* PC版マスサイズ（モバイル以外） */}
        {!mobile && (
          <div>
            <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>PC版マスサイズ</div>
            <div style={{ display: "flex", gap: 6 }}>
              {DESKTOP_VW_OPTIONS.map(({ value, label }) => {
                const active = desktopVW === value;
                return (
                  <button key={value} onClick={() => setDesktopVW(value)}
                    style={{ flex: 1, padding: "4px 0", background: active ? "#1a2a3a" : "#1a1a1a", color: active ? "#4cf" : "#aaa", border: `1px solid ${active ? "#2a5a8a" : "#333"}`, borderRadius: 4, fontSize: 13, cursor: "pointer", fontWeight: active ? "bold" : "normal" }}>
                    {active ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 立ち絵変更 */}
        <div>
          <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>立ち絵</div>
          <div style={{ display: "flex", gap: 6 }}>
            <label style={{ flex: 1, cursor: "pointer" }}>
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { if (e.target.files[0]) { loadPortrait(e.target.files[0]); } e.target.value = ""; }} />
              <span style={{ display: "block", textAlign: "center", padding: "4px 0", background: "#1a1a2a", border: "1px solid #333", borderRadius: 4, fontSize: 13, color: "#aaa" }}>
                🖼 画像を変更
              </span>
            </label>
            {portraitSrc && (
              <button onClick={clearPortrait}
                style={{ padding: "4px 10px", background: "#2a1515", border: "1px solid #4a2020", color: "#f66", borderRadius: 4, fontSize: 13, cursor: "pointer" }}>
                ✕ 消去
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Floor Select Modal (cursed teleport: visited floors only) ===== */
export function FloorSelectModal({ mode, setMode, sr, setGs, setMsgs, endTurn, genDungeon, refreshFOV, rng }) {
  if (!mode) return null;
  const _p0 = sr.current?.player;
  const visited = getVisitedFloors(sr.current, _p0?.depth);
  const sel = visited.includes(mode.sel) ? mode.sel : (visited[visited.length - 1] ?? mode.sel);
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#111", border: "1px solid #550", borderRadius: 6, padding: "12px 20px", color: "#ffe", minWidth: 180, maxHeight: "70vh", overflowY: "auto" }}>
        <div style={{ color: "#fa0", fontWeight: "bold", marginBottom: 8, textAlign: "center" }}>階層テレポート【呪】</div>
        <div style={{ color: "#888", fontSize: 13, marginBottom: 8, textAlign: "center" }}>訪れた階層のみ　↑↓:選択　Z/Enter:決定</div>
        {visited.length === 0 ? (
          <div style={{ color: "#888", textAlign: "center" }}>飛べる階層がない</div>
        ) : visited.map(f => (
          <div key={f}
            style={{ padding: "2px 8px", background: f === sel ? "#443300" : "transparent", color: f === sel ? "#ffcc00" : "#aaa", cursor: "pointer" }}
            onClick={() => {
              const { player: _p } = sr.current || {};
              if (!_p) return;
              const _vis = getVisitedFloors(sr.current, _p.depth);
              if (!_vis.includes(f)) {
                setMsgs(prev => [...prev.slice(-80), "まだ訪れていない階層には飛べない！"]);
                return;
              }
              const _ml = [];
              if (!sr.current.floors) sr.current.floors = {};
              sr.current.floors[_p.depth] = sr.current.dungeon;
              const _saved = sr.current.floors[f];
              if (!_saved) {
                setMsgs(prev => [...prev.slice(-80), "その階層のデータがない！"]);
                return;
              }
              const _d = _saved;
              delete sr.current.floors[f];
              const _maxDFs = sr.current.maxDepth;
              if (_maxDFs !== null && f >= _maxDFs && !_d.isLastFloor) {
                prepareLastFloor(_d, sr.current.dungeonType || "beginner");
              }
              const _tpFromX = _p.x, _tpFromY = _p.y;
              _p.depth = f;
              const _tpDst = randomTeleportDest(_d, -999, -999);
              if (_tpDst) { _p.x = _tpDst.x; _p.y = _tpDst.y; }
              else { _p.x = _d.stairUp.x; _p.y = _d.stairUp.y; }
              pushPlayerTeleportAnim(_tpFromX, _tpFromY, _p.x, _p.y);
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
            {f === sel ? "▶ " : "  "}{f}階
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
  { key: "special_synth", label: "特殊合成", build: () => [
    { label: SOBURO_T.name,       value: { ...SOBURO_T } },
    { label: GOLDEN_AXE_T.name,   value: { ...GOLDEN_AXE_T } },
    { label: TRIELEM_SWORD_T.name, value: { ...TRIELEM_SWORD_T } },
    { label: FLAMBERGE_T.name,    value: { ...FLAMBERGE_T } },
    { label: ICESWORD_T.name,     value: { ...ICESWORD_T } },
    { label: CHIDORI_T.name,      value: { ...CHIDORI_T } },
    { label: ULTIMA_SWORD_T.name, value: { ...ULTIMA_SWORD_T } },
    { label: ALLBANE_SWORD_T.name, value: { ...ALLBANE_SWORD_T } },
    { label: IRONMASS_T.name,     value: { ...IRONMASS_T } },
    { label: SNIPER_T.name,       value: { ...SNIPER_T } },
    { label: GODBANE_SWORD_T.name, value: { ...GODBANE_SWORD_T } },
    { label: TRIELEM_ARMOR_T.name, value: { ...TRIELEM_ARMOR_T } },
    { label: MITHRIL_ARMOR_T.name, value: { ...MITHRIL_ARMOR_T } },
    { label: STOMACH_ARMOR_T.name, value: { ...STOMACH_ARMOR_T } },
    { label: DIVINE_SHIELD_T.name, value: { ...DIVINE_SHIELD_T } },
    { label: GODSPARKWAND_T.name,  value: { ...GODSPARKWAND_T } },
    { label: GOBLIN_BAT_T.name,    value: { ...GOBLIN_BAT_T } },
    { label: ONI_CLUB_T.name,      value: { ...ONI_CLUB_T } },
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
    /* カラペン系はデバッグ召喚の先頭に固定して見つけやすくする */
    const debugMons = [...MONS].sort((a, b) =>
      Number(b.subtype === "itempusher") - Number(a.subtype === "itempusher")
    );
    for (const m of debugMons) {
      entries.push({ label: `${m.name} (Lv1)`, value: { base: m, lv: 1 } });
      const lvs = MON_LEVELS[m.baseKind];
      if (lvs) {
        if (lvs[0]) entries.push({ label: `${lvs[0].name} (Lv2)`, value: { base: m, lv: 2 } });
        if (lvs[1]) entries.push({ label: `${lvs[1].name} (Lv3)`, value: { base: m, lv: 3 } });
      }
    }
    for (const b of BOSSES) {
      entries.push({ label: `${b.name} (ボス)`, value: { base: b, lv: 1 } });
    }
    for (const b of INTERMEDIATE_BOSSES) {
      entries.push({ label: `${b.name} (中級ボス)`, value: { base: b, lv: 1 } });
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
    for (const bb of BB_TYPES) entries.push({ label: bb.name, value: { ...bb, _debugObject: "bigbox" } });
  } else if (effect === "debug_summon_object") {
    entries.push({ label: "ガチャマシーン", value: { _debugObject: "gacha" } });
    entries.push({ label: "泉", value: { _debugObject: "spring" } });
    entries.push({ label: "風穴", value: { _debugObject: "vent" } });
    entries.push({ label: "石像", value: { _debugObject: "statue" } });
    entries.push({ label: "祭壇", value: { _debugObject: "altar" } });
    entries.push({ label: "次元宝物庫", value: { _debugObject: "dimensionalVault" } });
  }

  /* --- ページネーション --- */
  const totalPages = isPickingCategory ? 1 : Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageEntries = isPickingCategory ? entries : entries.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const safeSel = Math.min(menuSel, Math.max(0, pageEntries.length - 1));

  const title = effect === "debug_summon_mon" ? "敵を選択"
    : effect === "debug_get_item" ? (category ? `アイテムを選択（${_DBG_ITEM_CATS.find(c=>c.key===category)?.label}）` : "カテゴリを選択")
    : effect === "debug_create_trap" ? "罠を選択"
    : effect === "debug_summon_bb" ? "大箱を選択"
    : "オブジェクトを選択";

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
      const lvData = lv >= 2 ? (MON_LEVELS[base.baseKind]?.[lv - 2] || {}) : {};
      const canUseWater = !!(lvData.waterOnly ?? base.waterOnly) || !!(lvData.float ?? base.float);
      let placed = false;
      for (const [ddx, ddy] of dirs) {
        const nx = p.x + ddx, ny = p.y + ddy;
        if (nx < 0 || ny < 0 || nx >= dg.map[0].length || ny >= dg.map.length) continue;
        const tile = dg.map[ny][nx];
        const normalTile = tile === "." || tile === "+" || tile === "<" || tile === ">";
        const waterTile = tile === T.WATER || dg.springs?.some(s => s.x === nx && s.y === ny);
        if (!normalTile && !(canUseWater && waterTile)) continue;
        if (dg.monsters.some(m => m.x === nx && m.y === ny)) continue;
        if (nx === p.x && ny === p.y) continue;
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
      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1],[0,0]];
      let placed = false;
      for (const [ddx, ddy] of dirs) {
        const nx = p.x + ddx, ny = p.y + ddy;
        if (nx < 0 || ny < 0 || nx >= dg.map[0].length || ny >= dg.map.length) continue;
        if (dg.map[ny][nx] !== "." && dg.map[ny][nx] !== "+" && dg.map[ny][nx] !== "<" && dg.map[ny][nx] !== ">") continue;
        if (dg.traps?.some(t => t.x === nx && t.y === ny)) continue;
        const trap = { ...entry.value, id: uid(), x: nx, y: ny, revealed: true };
        (dg.traps || (dg.traps = [])).push(trap);
        ml.push(`${trap.name}を作った！`);
        placed = true;
        break;
      }
      if (!placed) ml.push("作る場所がない！");
    } else if (effect === "debug_summon_bb" || effect === "debug_summon_object") {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1],[0,0]];
      const objectKind = effect === "debug_summon_object" ? entry.value._debugObject : "bigbox";
      const occupied = (x, y) =>
        dg.map[y]?.[x] !== T.FLOOR ||
        (x === p.x && y === p.y) ||
        dg.monsters?.some(m => m.x === x && m.y === y) ||
        dg.items?.some(i => i.x === x && i.y === y) ||
        dg.traps?.some(t => t.x === x && t.y === y) ||
        dg.springs?.some(s => s.x === x && s.y === y) ||
        dg.bigboxes?.some(b => b.x === x && b.y === y) ||
        dg.gachaMachines?.some(g => g.x === x && g.y === y) ||
        dg.altars?.some(a => a.x === x && a.y === y) ||
        dg.dimensionalVaults?.some(v => v.x === x && v.y === y) ||
        dg.vents?.some(v => v.x === x && v.y === y) ||
        dg.statues?.some(s => s.x === x && s.y === y) ||
        dg.pentacles?.some(pc => pc.x === x && pc.y === y) ||
        dg.oilyTiles?.some(o => o.x === x && o.y === y) ||
        (dg.stairUp && dg.stairUp.x === x && dg.stairUp.y === y) ||
        (dg.stairDown && dg.stairDown.x === x && dg.stairDown.y === y);
      let placed = false;
      for (const [ddx, ddy] of dirs) {
        const nx = p.x + ddx, ny = p.y + ddy;
        if (nx < 0 || ny < 0 || nx >= dg.map[0].length || ny >= dg.map.length) continue;
        if (occupied(nx, ny)) continue;
        if (objectKind === "gacha") {
          const gacha = { id: uid(), x: nx, y: ny, tile: TI.GACHA, type: "gacha", kind: "gacha_machine", name: "ガチャマシーン" };
          (dg.gachaMachines || (dg.gachaMachines = [])).push(gacha);
          ml.push("ガチャマシーンを設置した！");
        } else if (objectKind === "spring") {
          const spring = { id: uid(), x: nx, y: ny, tile: TI.SPRING, contents: [] };
          (dg.springs || (dg.springs = [])).push(spring);
          ml.push("泉を設置した！");
        } else if (objectKind === "vent") {
          const facing = p.facing || { dx: 0, dy: 1 };
          const vent = makeVent(nx, ny, facing.dx, facing.dy);
          (dg.vents || (dg.vents = [])).push(vent);
          ml.push(`風穴を設置した！（風向き: ${vent.dx},${vent.dy}）`);
        } else if (objectKind === "statue") {
          const statue = makeStatue(nx, ny);
          (dg.statues || (dg.statues = [])).push(statue);
          ml.push("石像を設置した！");
        } else if (objectKind === "altar") {
          const altar = makeAltar(nx, ny);
          (dg.altars || (dg.altars = [])).push(altar);
          ml.push("祭壇を設置した！");
        } else if (objectKind === "dimensionalVault") {
          /* 召喚地点を入口に合わせ、壁・水・アイテムは入室時まで保留する。 */
          const outerCandidates = [];
          const summonRoomW = 20;
          const summonRoomH = 15;
          for (let radius = 0; radius <= 8; radius++) {
            for (let oy = -radius; oy <= radius; oy++) {
              for (let ox = -radius; ox <= radius; ox++) {
                if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
                const outerRoom = {
                  x: Math.max(1, Math.min(dg.map[0].length - summonRoomW - 2, nx + ox)),
                  y: Math.max(1, Math.min(dg.map.length - summonRoomH - 2, ny - Math.floor(summonRoomH / 2) + oy)),
                  w: summonRoomW, h: summonRoomH,
                };
                const key = `${outerRoom.x},${outerRoom.y}`;
                if (!outerCandidates.some((candidate) => candidate.key === key)) {
                  outerCandidates.push({ key, room: outerRoom });
                }
              }
            }
          }
          let vault = null;
          for (const candidate of outerCandidates) {
            vault = createDimensionalVaultAt(dg, candidate.room, p.depth || 1, Math.random);
            if (vault) break;
          }
          if (vault) ml.push("次元宝物庫を設置した！入口に宝物庫の印がある。");
          else ml.push("次元宝物庫を設置できる場所がない！");
        } else {
          const bb = { id: uid(), x: nx, y: ny, tile: 41, kind: entry.value.kind, name: entry.value.name, capacity: entry.value.cap(), contents: [] };
          (dg.bigboxes || (dg.bigboxes = [])).push(bb);
          ml.push(`${bb.name}を設置した！`);
        }
        placed = true;
        break;
      }
      if (!placed) ml.push("設置する場所がない！");
    }
    /* デバッグ魔法：ターンを進めず直接ステート更新（endTurnはモーダルを上書き閉鎖する可能性がある） */
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

/* ===== Ending Modal ===== */
export function EndingModal({ show, p, endingResult, clearPortrait, mobile, endingSel = 0, setShowScores, onViewMap, onViewInventory, onDismiss }) {
  if (!show) return null;
  const gold  = endingResult?.earnedGold ?? p?.gold ?? 0;
  const depth = endingResult?.depth      ?? p?.depth ?? 1;
  const turns = p?.turns ?? 0;
  const lv    = p?.level ?? 1;
  const isTutorial = endingResult?.isTutorial ?? false;
  const menuItems = [
    { label: "スコアを見る", color: "#8cf", action: () => setShowScores(true) },
    { label: "状況を見る", color: "#8ff", action: onViewMap },
    { label: "持ち物を見る", color: "#d8a8ff", action: onViewInventory },
    { label: "地上に戻る", color: "#ffd700", action: onDismiss },
  ];
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 25,
        borderRadius: 6,
        padding: mobile ? 8 : 18,
        boxSizing: "border-box",
        overflow: "auto",
      }}
    >
      <div
        style={{
          width: mobile ? "min(94%, 440px)" : "min(96%, 1040px)",
          height: mobile ? "min(94%, 680px)" : "min(92%, 680px)",
          maxHeight: "100%",
          display: "grid",
          gridTemplateColumns: mobile ? "1fr" : "minmax(0, 1.3fr) minmax(285px, 0.7fr)",
          gridTemplateRows: mobile ? "minmax(0, 1fr) auto" : "1fr",
          background: "rgba(4, 5, 14, 0.86)",
          border: `1px solid ${isTutorial ? "#365a36" : "#806020"}`,
          borderRadius: 10,
          boxShadow: "0 0 28px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: mobile ? 6 : 12,
            overflow: "hidden",
            background: "rgba(8, 10, 16, 0.6)",
          }}
        >
          <img
            src={clearPortrait || "/tiles/Character/reaction_joy.png"}
            alt="clear"
            onError={(e) => {
              if (e.currentTarget.dataset.clearFallbackApplied === "1") return;
              e.currentTarget.dataset.clearFallbackApplied = "1";
              e.currentTarget.src = "/tiles/Character/reaction_joy.png";
            }}
            style={{ width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 0 20px #ffd700aa)" }}
          />
        </div>
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: mobile ? "8px 10px 12px" : "26px 22px",
            background: "rgba(5, 6, 16, 0.94)",
            borderLeft: mobile ? "none" : "1px solid #806020",
            borderTop: mobile ? "1px solid #806020" : "none",
            textAlign: "center",
          }}
        >
          <div style={{ color: isTutorial ? "#88ff88" : "#ffd700", fontSize: mobile ? 20 : 26, fontWeight: "bold", textShadow: isTutorial ? "0 0 16px #00cc00" : "0 0 16px #ffa000", marginBottom: 6, whiteSpace: "nowrap" }}>
            {isTutorial ? "★ チュートリアル完了！★" : "*** 冒険クリア ***"}
          </div>
          <div style={{ color: isTutorial ? "#ccffcc" : "#ffe080", fontSize: mobile ? 13 : 16, marginBottom: 8, lineHeight: 1.7 }}>
            {isTutorial ? "訓練の証を生きて持ち帰った！" : "古代の遺物を地上へ持ち帰った！"}
          </div>
          <div style={{ color: "#c0a060", fontSize: mobile ? 11 : 14, marginBottom: 10, lineHeight: 1.7, background: "rgba(80,60,0,0.3)", border: "1px solid #806020", borderRadius: 6, padding: "8px 16px" }}>
            Lv.{lv} | B{depth}F | {turns}ターン | {gold}G
          </div>
          <div style={{ color: "#777", fontSize: mobile ? 10 : 12, marginBottom: 10, lineHeight: 1.5 }}>
            ↑↓/←→/テンキー8・2・4・6:選択 / Enter で決定
          </div>
          <div style={{ display: "flex", flexDirection: mobile ? "row" : "column", width: "100%", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
            {menuItems.map((item, index) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  padding: "9px 18px",
                  width: mobile ? "auto" : "100%",
                  background: endingSel === index ? "#1a1808" : "#181828",
                  color: item.color,
                  border: `1px solid ${endingSel === index ? item.color : "#3a3a48"}`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 14,
                  borderRadius: 6,
                  boxShadow: endingSel === index ? `0 0 8px ${item.color}` : "none",
                }}
              >
                {endingSel === index ? "▶ " : "　"}{item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SignModal({ sign, onClose, mobile }) {
  if (!sign) return null;
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 50,
    }}>
      <div style={{
        background: "#1e1006",
        border: "3px solid #8B5A2B",
        borderRadius: 8,
        padding: mobile ? 16 : 22,
        maxWidth: mobile ? 320 : 440,
        width: "90%",
        boxShadow: "0 6px 36px rgba(0,0,0,0.92)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ color: "#F5D878", fontSize: mobile ? 13 : 15, fontWeight: "bold", letterSpacing: 1 }}>
            看板
          </span>
          <button onClick={onClose}
            style={{ background: "#3a1a08", color: "#ccc", border: "1px solid #8B5A2B", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>
            ✕
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sign.text.map((line, i) => (
            <div key={i} style={{ color: "#f0e0c0", fontSize: mobile ? 12 : 13, lineHeight: "1.65em" }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, textAlign: "center" }}>
          <button onClick={onClose}
            style={{
              background: "#4a2a0a",
              color: "#F5D878",
              border: "2px solid #8B5A2B",
              borderRadius: 6,
              padding: "8px 36px",
              cursor: "pointer",
              fontSize: mobile ? 13 : 14,
              fontWeight: "bold",
              letterSpacing: 1,
            }}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

export function MiniTipModal({ tip, onClose, mobile }) {
  if (!tip) return null;
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(0,0,0,0.76)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 70,
    }}>
      <div style={{
        background: "#071625",
        border: "3px solid #3aa7d8",
        borderRadius: 9,
        padding: mobile ? 16 : 22,
        maxWidth: mobile ? 330 : 460,
        width: "90%",
        boxShadow: "0 6px 36px rgba(0,0,0,0.92), 0 0 18px rgba(58,167,216,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ color: "#77d8ff", fontSize: mobile ? 11 : 12, letterSpacing: 1, marginBottom: 3 }}>
              初遭遇ミニ解説
            </div>
            <div style={{ color: "#dff7ff", fontSize: mobile ? 15 : 17, fontWeight: "bold" }}>
              {tip.title}
            </div>
          </div>
          <button onClick={onClose} aria-label="ミニ解説を閉じる"
            style={{ background: "#0b2a3d", color: "#bdefff", border: "1px solid #3aa7d8", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>
            ✕
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tip.text.map((line, i) => (
            <div key={i} style={{ color: "#d5eaf2", fontSize: mobile ? 12 : 13, lineHeight: "1.65em" }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, textAlign: "center" }}>
          <button onClick={onClose}
            style={{
              background: "#0e405a", color: "#dff7ff", border: "2px solid #3aa7d8",
              borderRadius: 6, padding: "8px 36px", cursor: "pointer",
              fontSize: mobile ? 13 : 14, fontWeight: "bold", letterSpacing: 1,
            }}>
            わかった
          </button>
        </div>
        <div style={{ color: "#6f9caf", fontSize: mobile ? 10 : 11, textAlign: "center", marginTop: 9 }}>
          Enter / Z / Space / X: 閉じる
        </div>
      </div>
    </div>
  );
}

/* ===== 地上帰還確認 ===== */
export function ExitHubConfirmModal({ show, sel, setSel, onConfirm, onCancel, mobile }) {
  if (!show) return null;
  const opts = [
    { label: "脱出する", sub: "地上に戻る（持ち物は倉庫へ）" },
    { label: "やめる", sub: "ダンジョンに留まる" },
  ];
  return (
    <div style={{
      position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55,
    }}>
      <div style={{
        background: "#12121e", border: "2px solid #446", borderRadius: 8,
        padding: mobile ? 16 : 22, maxWidth: mobile ? 320 : 400, width: "90%",
        boxShadow: "0 6px 36px rgba(0,0,0,0.92)",
      }}>
        <div style={{ color: "#f88", fontSize: mobile ? 15 : 17, fontWeight: "bold", marginBottom: 8, textAlign: "center" }}>
          ダンジョンから脱出しますか？
        </div>
        <div style={{ color: "#8a9ab0", fontSize: 12, marginBottom: 16, textAlign: "center", lineHeight: 1.5 }}>
          B1Fの上り階段から地上に戻ります。所持品は倉庫に移されます。
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {opts.map((o, i) => (
            <button key={i}
              onClick={() => (i === 0 ? onConfirm() : onCancel())}
              style={{
                padding: "10px 14px", textAlign: "left", cursor: "pointer",
                background: sel === i ? "#1a1a30" : "#0d0d18",
                border: `1px solid ${sel === i ? "#66f" : "#333"}`,
                borderRadius: 6, color: i === 0 ? "#8f8" : "#aaa",
              }}>
              <div style={{ fontWeight: "bold", fontSize: 14 }}>{o.label}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{o.sub}</div>
            </button>
          ))}
        </div>
        <div style={{ color: "#555", fontSize: 11, marginTop: 14, textAlign: "center" }}>
          ↑↓/テンキー8・2:選択　Z/Enter:決定　X:やめる
        </div>
      </div>
    </div>
  );
}
