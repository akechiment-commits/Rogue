import { useState, useEffect, useCallback, useRef, useReducer } from "react";
import { MW, MH, T, rng, pick, uid, refreshFOV, removeFloorItem, monsterAt, itemAt, getShops, hasAbility, hasGravityPentacle, clampDmgFixed } from "./utils.js";
import {
  findRoom,
  monsterAI,
  makeMonster,
  makeGuard,
  wakeIfDormant,
} from "./monsters.js";
import {
  ITEMS, WATER_BOTTLE, SPELLBOOKS, WANDS, POTS, TRAPS,
  CAT_CLAW_T, EXCALIBUR_T,
  genFood, makeArrow, addArrowsInv, addStonesInv,
  wallBreakDrop, makePot, placeItemAt,
  setPitfallBag, clearPitfallBag, applyWandEffect,
  monsterFireLightning, checkShopTheft, applyLightningToInventory,
  WEAPON_ABILITIES, ARMOR_ABILITIES, inMagicSealRoom,
  monsterDrop, killMonster, getIdentKey, generateFakeNames,
  hasCursedExplosionPentacle, hasRingEffect, isPlayerFloating, doExplosion, doTimeBombExplosion,
} from "./items.js";
import { fireTrapPlayer } from "./traps.js";
import { genDungeon, genDebugDungeon, genDebugDungeonFloor2, triggerMonsterHouse, prepareLastFloor, genTreasureRoom, GOAL_ITEMS } from "./dungeon.js";
import { trackItem, trackMonster, trackTrap, resetDiscoveries, getDiscoveries } from "./DiscoveryTracker.js";
import { TILE_NAMES, customTileImages, clearCustomTileImages, _itemPickupSuffix, processPitfallBag, itemDisplayName } from "./render.js";
import { generateTileImages } from "./tileSprites.js";
import { useGameRenderer } from './useGameRenderer.js';
import { useItemActions } from './useItemActions.js';
import { useKeyHandler } from './useKeyHandler.js';
import { drainAnims, pushMonsterBoltAnim, pushAnim } from './animEvents.js';
import { TileEditorModal, GameOverModal, ScoresModal, NicknameModal, IdentifyModal, ShopModal, SpringModal, BigboxModal, TpSelectModal, PotPutModal, MarkerModal, SpellListModal, MsgLogModal, InventoryModal, SidebarPanel, FloorSelectModal, DebugSpellModal } from "./GameModals.jsx";
const FLOOR_TITLES = {
  bigRoom:      "ビッグルームだ！",
  miniRoom:     "ミニルームだ！",
  shoppingMall: "ショッピングモールだ！",
  spinFloor:    "回転板の間だ！",
  corridorFloor:"廊下フロアだ！",
  gridRoom:     "格子の大部屋だ！",
  treasureRoom: "隠し宝部屋だ！",
};

const MODAL_INIT = { type: null, springMenuSel: 0, springPage: 0, bigboxMenuSel: 0, bigboxPage: 0, shopMenuSel: 0, putMenuSel: 0, putPage: 0, markerMenuSel: 0, spellMenuSel: 0, spellPage: 0, nicknameInput: '', data: null };

function modalReducer(state, action) {
  switch (action.type) {
    case 'SET_MODAL': return { ...MODAL_INIT, type: action.modal, data: action.data || null };
    case 'CLOSE_MODAL': return MODAL_INIT;
    case 'UPDATE': return { ...state, ...action.payload };
    default: return state;
  }
}

/* 長押しリピート対応モバイルボタン
 * 初回押下即時発火 → REPEAT_DELAY ms 後からリピート開始 → REPEAT_INTERVAL ms 間隔で連続発火
 * ※コンポーネント外で定義することで、ゲーム状態更新時のアンマウントを防ぎタイマーを維持する */
const REPEAT_DELAY = 350;
const REPEAT_INTERVAL = 110;
function MobileBtn({ label, sub, onClick, w, h, fs, color, style: s = {} }) {
  const timers = useRef({ delay: null, interval: null });
  const cbRef  = useRef(onClick);
  cbRef.current = onClick;
  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.interval);
    timers.current.delay = timers.current.interval = null;
  };
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
      {sub ? <><span style={{ fontSize: 15 }}>{label}</span><span style={{ fontSize: 8, opacity: 0.5 }}>{sub}</span></> : label}
    </button>
  );
}
function B({ label, onClick, w = 40, h = 40, fs = 15, style: s = {} }) {
  return <MobileBtn label={label} onClick={onClick} w={w} h={h} fs={fs} style={s} />;
}
function AB({ label, sub, onClick, color = "#8f8" }) {
  return <MobileBtn label={label} sub={sub} onClick={onClick} color={color}
    style={{ flex: 1, minWidth: 38, height: 36, fontSize: 12 }} />;
}
const TBS = { background: "#2a1a1a", border: "1px solid #5a3a3a", color: "#f88" };
const DBS = { background: "#1a1a2a", border: "1px solid #4a3a6a", color: "#c8f" };
function DPad({ onClick, throwMode, dashMode, facingMode, setFacingMode, setThrowMode, setDashMode, setMsgs }) {
  const ds = throwMode ? TBS : dashMode ? DBS : {};
  const fs = facingMode ? { background: "#2a2a0a", border: "1px solid #aa0" } : ds;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <div style={{ display: "flex", gap: 2 }}>
        <B label="↖" onClick={() => onClick(-1, -1)} w={32} h={32} fs={12} style={fs} />
        <B label="↑"  onClick={() => onClick(0, -1)}                        style={fs} />
        <B label="↗" onClick={() => onClick(1, -1)}  w={32} h={32} fs={12} style={fs} />
      </div>
      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
        <B label="←" onClick={() => onClick(-1, 0)} style={fs} />
        <B
          label={facingMode ? "✕" : throwMode ? "✕" : dashMode ? "⇒" : "向"}
          fs={facingMode || throwMode || dashMode ? 15 : 11}
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
        <B label="↙" onClick={() => onClick(-1, 1)} w={32} h={32} fs={12} style={fs} />
        <B label="↓"  onClick={() => onClick(0, 1)}                        style={fs} />
        <B label="↘" onClick={() => onClick(1, 1)}  w={32} h={32} fs={12} style={fs} />
      </div>
    </div>
  );
}

export default function RoguelikeGame({ dungeonConfig, onReturnToHub } = {}) {
  const [gs, setGs] = useState(null);
  const [msgs, setMsgs] = useState(["冒険が始まった！"]);
  const [showInv, setShowInv] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const dropModeRef = useRef(false);
  const [selIdx, setSelIdx] = useState(null);
  const [invPage, setInvPage] = useState(0);
  const [invMenuSel, setInvMenuSel] = useState(null);
  const [showDesc, setShowDesc] = useState(null);
  const [throwMode, setThrowMode] = useState(null);
  /* ── modal state (mutually exclusive) via useReducer ── */
  const [modal, dispatchModal] = useReducer(modalReducer, MODAL_INIT);

  // convenience accessors
  const springMode    = modal.type === 'spring'      ? modal.data : null;
  const springMenuSel = modal.springMenuSel;
  const springPage    = modal.springPage;
  const bigboxMode    = modal.type === 'bigbox'       ? modal.data : null;
  const bigboxMenuSel = modal.bigboxMenuSel;
  const bigboxPage    = modal.bigboxPage;
  const bigboxRef = useRef(null);
  const bigboxModeRef = useRef(null);
  bigboxModeRef.current = bigboxMode;
  const [facingMode, setFacingMode] = useState(false);
  const springTargetRef = useRef(null);
  const shopMode      = modal.type === 'shop'         ? modal.data : null;
  const shopMenuSel   = modal.shopMenuSel;
  const putMode       = modal.type === 'put'          ? modal.data : null;
  const putMenuSel    = modal.putMenuSel;
  const putPage       = modal.putPage;
  const markerMode    = modal.type === 'marker'       ? modal.data : null;
  const markerMenuSel = modal.markerMenuSel;
  const spellListMode = modal.type === 'spellList'    ? modal.data : null;
  const spellMenuSel  = modal.spellMenuSel;
  const spellPage     = modal.spellPage;
  /* null | {potIdx:number} */ const [dashMode, setDashMode] = useState(false);
  const tpSelectMode     = modal.type === 'tpSelect'     ? modal.data : null;
  const lookMode         = modal.type === 'look'         ? modal.data : null;
  const floorSelectMode  = modal.type === 'floorSelect'  ? modal.data : null;
  const identifyMode     = modal.type === 'identify'     ? modal.data : null;
  const nicknameMode     = modal.type === 'nickname'     ? modal.data : null;
  const revealMode       = modal.type === 'reveal'       ? modal.data : null;
  const nicknameInput    = modal.nicknameInput;

  // setter functions (support both direct values and updater functions)
  const setSpringMode    = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'spring', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setSpringMenuSel = (v) => dispatchModal({ type: 'UPDATE', payload: { springMenuSel: typeof v === 'function' ? v(modal.springMenuSel) : v } });
  const setSpringPage    = (v) => dispatchModal({ type: 'UPDATE', payload: { springPage: typeof v === 'function' ? v(modal.springPage) : v } });
  const setBigboxMode    = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'bigbox', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setBigboxMenuSel = (v) => dispatchModal({ type: 'UPDATE', payload: { bigboxMenuSel: typeof v === 'function' ? v(modal.bigboxMenuSel) : v } });
  const setBigboxPage    = (v) => dispatchModal({ type: 'UPDATE', payload: { bigboxPage: typeof v === 'function' ? v(modal.bigboxPage) : v } });
  const setShopMode      = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'shop', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setShopMenuSel   = (v) => dispatchModal({ type: 'UPDATE', payload: { shopMenuSel: typeof v === 'function' ? v(modal.shopMenuSel) : v } });
  const setPutMode       = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'put', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setPutMenuSel    = (v) => dispatchModal({ type: 'UPDATE', payload: { putMenuSel: typeof v === 'function' ? v(modal.putMenuSel) : v } });
  const setPutPage       = (v) => dispatchModal({ type: 'UPDATE', payload: { putPage: typeof v === 'function' ? v(modal.putPage) : v } });
  const setMarkerMode    = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'marker', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setMarkerMenuSel = (v) => dispatchModal({ type: 'UPDATE', payload: { markerMenuSel: typeof v === 'function' ? v(modal.markerMenuSel) : v } });
  const setSpellListMode = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'spellList', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setSpellMenuSel  = (v) => dispatchModal({ type: 'UPDATE', payload: { spellMenuSel: typeof v === 'function' ? v(modal.spellMenuSel) : v } });
  const setSpellPage     = (v) => dispatchModal({ type: 'UPDATE', payload: { spellPage: typeof v === 'function' ? v(modal.spellPage) : v } });
  const setTpSelectMode  = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'tpSelect', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setLookMode      = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'look', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setFloorSelectMode = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'floorSelect', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setIdentifyMode  = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'identify', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setNicknameMode  = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'nickname', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const debugSpellMode   = modal.type === 'debugSpell'   ? modal.data : null;
  const setDebugSpellMode = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'debugSpell', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const debugSpellMenuSel = modal.debugSpellMenuSel ?? 0;
  const setDebugSpellMenuSel = (v) => dispatchModal({ type: 'UPDATE', payload: { debugSpellMenuSel: typeof v === 'function' ? v(modal.debugSpellMenuSel ?? 0) : v } });
  const setRevealMode    = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'reveal', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setNicknameInput = (v) => dispatchModal({ type: 'UPDATE', payload: { nicknameInput: typeof v === 'function' ? v(modal.nicknameInput) : v } });
  /* mobile dash toggle */ const [dead, setDead] = useState(false);
  const [msgLogMode, setMsgLogMode] = useState(false);
  const [msgLogScrollTop, setMsgLogScrollTop] = useState(0);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const [gameOverResult, setGameOverResult] = useState(null);
  const [showScores, setShowScores] = useState(false);
  const [gameOverSel, setGameOverSel] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [ctLoaded, setCtLoaded] = useState(0);
  const [showTileEditor, setShowTileEditor] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [portraitSrc, setPortraitSrc] = useState(null);
  const loadCustomTile = (idx, file) => {
    const r = new FileReader();
    r.onload = (e) => {
      const d = e.target.result;
      const img = new Image();
      img.onload = () => {
        customTileImages[idx] = img;
        setCtLoaded((c) => c + 1);
      };
      img.src = d;
      const name = TILE_NAMES[idx];
      if (name) {
        fetch("/api/save-tile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, data: d }),
        }).catch(() => {});
      }
      try {
        localStorage.setItem(`roguelike_tile_${idx}`, d);
      } catch (e) {}
    };
    r.readAsDataURL(file);
  };
  const clearCustomTile = (idx) => {
    delete customTileImages[idx];
    setCtLoaded((c) => c + 1);
    const name = TILE_NAMES[idx];
    if (name) {
      fetch("/api/delete-tile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).catch(() => {});
    }
    localStorage.removeItem(`roguelike_tile_${idx}`);
  };
  const loadPortrait = (file) => {
    const r = new FileReader();
    r.onload = (e) => {
      const d = e.target.result;
      setPortraitSrc(d);
      fetch("/api/save-portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: d }),
      }).catch(() => {});
      try {
        localStorage.setItem("roguelike_portrait", d);
      } catch (ex) {}
    };
    r.readAsDataURL(file);
  };
  const clearPortrait = () => {
    setPortraitSrc(null);
    fetch("/api/delete-portrait", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
    localStorage.removeItem("roguelike_portrait");
  };
  const ref = useRef(null),
    sr = useRef(null),
    msgRef = useRef(null),
    execRef = useRef(null),
    invActRef = useRef(null),
    doMarkerWriteRef = useRef(null);
  const canvasRef = useRef(null);
  useEffect(() => {
    const c = () => {
      setMobile(Math.min(window.innerWidth, window.innerHeight) < 700);
      setLandscape(window.innerWidth > window.innerHeight);
    };
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);
  /* Generate procedural pixel art as default tiles, then override with custom PNGs */
  useEffect(() => {
    clearCustomTileImages();
    /* Phase 1: Fill with generated pixel art */
    const generated = generateTileImages();
    for (const [idx, canvas] of Object.entries(generated)) {
      customTileImages[idx] = canvas;
    }
    setCtLoaded((c) => c + 1);
    /* Phase 2: Try loading custom PNGs (overrides generated art) */
    Object.entries(TILE_NAMES).forEach(([idx, name]) => {
      const iidx = parseInt(idx);
      const img = new Image();
      img.onload = () => {
        customTileImages[iidx] = img;
        setCtLoaded((c) => c + 1);
      };
      img.onerror = () => {
        const saved = localStorage.getItem(`roguelike_tile_${idx}`);
        if (saved) {
          const i2 = new Image();
          i2.onload = () => {
            customTileImages[iidx] = i2;
            setCtLoaded((c) => c + 1);
          };
          i2.src = saved;
        }
      };
      img.src = `/tiles/${name}.png`;
    });
  }, []);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setPortraitSrc("/portraits/player.png?v=" + Date.now());
    img.onerror = () => {
      const s = localStorage.getItem("roguelike_portrait");
      if (s) setPortraitSrc(s);
    };
    img.src = "/portraits/player.png?v=" + Date.now();
  }, []);
  const init = useCallback(() => {
    setDead(false);
    setGameOverResult(null);
    setMsgs(["冒険が始まった！"]);
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setThrowMode(null);
    setSpringMode(null);
    setPutMode(null);
    setDashMode(false);
    resetDiscoveries();
    const startDepth = dungeonConfig?.startDepth || 1;
    const _initDt = dungeonConfig?.dungeonType || "beginner";
    const d = _initDt === "debug"
      ? genDebugDungeon()
      : genDungeon(startDepth - 1, _initDt);
    /* 最下層の場合は下り階段を消して目標アイテムを配置 */
    const _initMaxD = dungeonConfig?.maxFloors ?? null;
    if (_initMaxD !== null && startDepth >= _initMaxD && _initDt !== "debug") {
      prepareLastFloor(d, _initDt);
    }
    d.nextSpawnTurn = rng(10, 50);
    const p = {
      x: d.stairUp.x,
      y: d.stairUp.y,
      hp: dungeonConfig?.dungeonType === "debug" ? 200 : 30,
      maxHp: dungeonConfig?.dungeonType === "debug" ? 200 : 30,
      mp: dungeonConfig?.dungeonType === "debug" ? 200 : 20,
      maxMp: dungeonConfig?.dungeonType === "debug" ? 200 : 20,
      atk: 5,
      def: 2,
      level: 1,
      exp: 0,
      nextExp: 20,
      hunger: 100,
      maxHunger: 100,
      gold: 0,
      depth: startDepth,
      weapon: null,
      armor: null,
      arrow: null,
      inventory: dungeonConfig?.dungeonType === "debug" ? [
        { name:"レベルアップの薬", type:"potion", effect:"levelup",  desc:"飲むとレベルが1上がる。祝福：2レベル上がる。投げると命中した敵が次の形態に変化する。", tile:17 },
        { name:"レベルアップの薬", type:"potion", effect:"levelup",  blessed:true, desc:"飲むとレベルが1上がる。祝福：2レベル上がる。投げると命中した敵が次の形態に変化する。", tile:17 },
        { name:"レベルアップの薬", type:"potion", effect:"levelup",  cursed:true, desc:"飲むとレベルが1上がる。祝福：2レベル上がる。投げると命中した敵が次の形態に変化する。", tile:17 },
        { name:"テレポートの巻物", type:"scroll", effect:"teleport", cursed:true, desc:"呪：好きな階層を選んでテレポートする。", tile:18 },
        { name:"テレポートの巻物", type:"scroll", effect:"teleport", cursed:true, desc:"呪：好きな階層を選んでテレポートする。", tile:18 },
        { name:"テレポートの巻物", type:"scroll", effect:"teleport", cursed:true, desc:"呪：好きな階層を選んでテレポートする。", tile:18 },
        { name:"識別の巻物",   type:"scroll",    effect:"identify",   desc:"持ち物から1つ選んで識別する。祝福：全識別。呪い：識別を解除。", tile:18 },
        { name:"識別の魔法書", type:"spellbook", spell:"identify_magic", desc:"識別の魔法を習得できる。火に弱い。", tile:43 },
        { name:"祝福の魔法書", type:"spellbook", spell:"bless_magic",    desc:"祝福の魔法を習得できる。火に弱い。", tile:43 },
        { name:"呪いの魔法書", type:"spellbook", spell:"curse_magic",    desc:"呪いの魔法を習得できる。火に弱い。", tile:43 },
        { name:"加熱の壺",     type:"pot",       potEffect:"boil",    capacity:3, contents:[], desc:"薬を入れると部屋中に薬効が広がる。", tile:32 },
        { name:"遠投のペン",   type:"pen",       effect:"farcast",    charges:2, desc:"足元に遠投の魔方陣を描く。部屋内で投げたものが壁まで貫通して飛ぶ。チャージ制。", tile:42 },
        { name:"識別の巻物",   type:"scroll",    effect:"identify",   blessed:true, desc:"持ち物から1つ選んで識別する。祝福：全識別。呪い：識別を解除。", tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"収納上手の巻物", type:"scroll",  effect:"expand_inv", desc:"最大所持数が1～3増える。祝福：2～6増える。呪い：1～3減る。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"雷の巻物",     type:"scroll",    effect:"thunder",    blessed:true, desc:"視界内の敵全てに雷ダメージを与える。",                           tile:18 },
      ] : [
        { name:"満腹の特盛りおにぎり", type:"food", effect:"satiate_food", value:120, desc:"とても腹持ちが良さそうだ。", tile:19, cooked:true, id: uid() },
      ],
      spells: dungeonConfig?.dungeonType === "debug"
        ? ["debug_summon_mon","debug_get_item","debug_create_trap","debug_summon_bb","bless_magic","curse_magic"]
        : [],
      spellLevels: {},
      turns: 0,
      sleepTurns: 0,
      paralyzeTurns: 0,
      slowTurns: 0,
      slowSkip: false,
      hasteTurns: 0,
      hasteUsed: false,
      confusedTurns: 0,
      poisoned: false,
      poisonAtkLoss: 0,
      sealedTurns: 0,
      invisibleTurns: 0,
      wallWalkTurns: 0,
      rings: [],
      maxInventory: dungeonConfig?.dungeonType === "debug" ? 100 : 30,
      facing: { dx: 0, dy: 1 },
      isThief: false,
      deathCause: "不明の原因により",
    };
    if (dungeonConfig?.startInventory?.length) {
      for (const it of dungeonConfig.startInventory) {
        if (p.inventory.length < (p.maxInventory || 100)) p.inventory.push({ ...it, id: uid() });
      }
    }
    refreshFOV(d, p);
    const _dt = dungeonConfig?.dungeonType || "beginner";
    const _allIdentKeys = (_dt === "debug" || _dt === "beginner")
      ? new Set([
          ...[...ITEMS, ...WANDS].map(getIdentKey).filter(Boolean),
          ...POTS.map(pot => `o:${pot.potEffect}`),
          ...SPELLBOOKS.filter(sb => sb.spell).map(sb => `b:${sb.spell}`),
        ])
      : new Set();
    const _allBcKnown = _dt === "debug" || _dt === "beginner";
    if (_allBcKnown) {
      [...p.inventory, ...d.items].forEach(it => { it.fullIdent = true; it.bcKnown = true; });
    }
    const s = { player: p, dungeon: d, floors: {}, ident: _allIdentKeys, fakeNames: generateFakeNames([...ITEMS, ...WANDS], POTS, SPELLBOOKS), nicknames: {}, isDebugRun: _dt === "debug", dungeonType: _dt, maxDepth: dungeonConfig?.maxFloors ?? null, allBcKnown: _allBcKnown };
    sr.current = s;
    setGs(s);
    ref.current?.focus();
  }, []);
  useEffect(init, [init]);
  useEffect(() => {
    if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight;
  }, [msgs]);

  /* Canvas render */
  const { renderFrame, renderFrameRef, overlaysRef, moveOffsetsRef } = useGameRenderer(canvasRef, gs, mobile, landscape, ctLoaded, tpSelectMode, lookMode);
  const animBusyRef = useRef(false);
  const monMovesRef = useRef([]); /* populated by endTurn for monster move animations */

  const playAnim = useCallback(async (data) => {
    if (!data || !canvasRef.current) return;
    animBusyRef.current = true;
    try {
    const _easeOut = (t) => t * (2 - t);
    const _phase = (dur, fn) => new Promise(res => {
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      /* Safety: if rAF stalls (mobile throttle, tab switch), resolve via setTimeout */
      const safety = setTimeout(() => { try { fn(1, 1); } catch(_) {} finish(); }, dur + 100);
      const s = performance.now();
      const tick = (now) => {
        if (done) return;
        try {
          const raw = Math.max(0, Math.min(1, (now - s) / dur));
          fn(_easeOut(raw), raw);
          if (raw < 1) requestAnimationFrame(tick);
          else { clearTimeout(safety); finish(); }
        } catch (e) {
          console.error("Animation phase error:", e);
          clearTimeout(safety); finish();
        }
      };
      requestAnimationFrame(tick);
    });
    /* Phase 1: Player move slide (100ms) */
    if (data.playerMove) {
      await _phase(100, (t) => {
        moveOffsetsRef.current.set("player", { ...data.playerMove, progress: t });
        renderFrame();
      });
      moveOffsetsRef.current.delete("player");
    }
    /* Phase 2: Attack slash + damage popup */
    if (data.attacks?.length || data.damages?.length) {
      const dur = data.damages?.length ? 400 : 120;
      await _phase(dur, (t, raw) => {
        const ovs = [];
        if (data.attacks) for (const a of data.attacks) ovs.push({ ...a, progress: Math.min(1, raw * (dur / 120)), t: Math.min(1, t * (dur / 120)) });
        if (data.damages) for (const d of data.damages) ovs.push({ ...d, progress: raw, t });
        overlaysRef.current = ovs;
        renderFrame();
      });
    }
    /* Phase 2b: Projectile flight (200ms) */
    if (data.projectiles?.length) {
      await _phase(200, (t, raw) => {
        overlaysRef.current = data.projectiles.map(p => ({ ...p, progress: raw, t }));
        renderFrame();
      });
      overlaysRef.current = [];
    }
    /* Phase 2b.5: Projectile bounce return (200ms) */
    if (data.projectileReturns?.length) {
      await _phase(200, (t, raw) => {
        overlaysRef.current = data.projectileReturns.map(p => ({ ...p, type: "projectile", progress: raw, t }));
        renderFrame();
      });
      overlaysRef.current = [];
    }
    /* Phase 2c: Explosions (350ms) */
    if (data.explosions?.length) {
      await _phase(350, (t, raw) => {
        overlaysRef.current = data.explosions.map(e => ({ ...e, progress: raw, t }));
        renderFrame();
      });
      overlaysRef.current = [];
    }
    /* Phase 3: Monster moves (80ms) */
    if (data.monMoves?.length) {
      await _phase(80, (t) => {
        for (const mm of data.monMoves) moveOffsetsRef.current.set("mon_" + mm.id, { ...mm, progress: t });
        renderFrame();
      });
      for (const mm of data.monMoves) moveOffsetsRef.current.delete("mon_" + mm.id);
    }
    /* Phase 4: Monster attack effects — flash then per-hit lunge+damage sequentially */
    if (data.monAttacks?.length || data.monDamages?.length || data.monLunges?.length) {
      /* Flash (100ms) */
      if (data.monAttacks?.length) {
        await _phase(100, (t, raw) => {
          overlaysRef.current = data.monAttacks.map(a => ({ ...a, progress: raw, t }));
          renderFrame();
        });
        overlaysRef.current = [];
      }
      /* Sequential per-hit: lunge sprite toward player + damage popup (300ms each) */
      if (data.monDamages?.length) {
        const _lunges = data.monLunges || [];
        for (let _hi = 0; _hi < data.monDamages.length; _hi++) {
          const _dmgEv = data.monDamages[_hi];
          const _lg = _lunges[_hi];
          await _phase(300, (_t, raw) => {
            if (_lg) {
              /* sin-curve offset: 0 → 40% toward player → 0 */
              const _lp = Math.sin(raw * Math.PI) * 0.4;
              const _lx = _lg.fromX + (_lg.toX - _lg.fromX) * _lp;
              const _ly = _lg.fromY + (_lg.toY - _lg.fromY) * _lp;
              moveOffsetsRef.current.set("mon_" + _lg.id, {
                fromX: _lx, fromY: _ly, toX: _lx, toY: _ly,
                progress: 1, tile: _lg.tile, hp: _lg.hp, maxHp: _lg.maxHp,
              });
            }
            overlaysRef.current = [{ ..._dmgEv, progress: raw, t: _t }];
            renderFrame();
          });
          if (_lg) moveOffsetsRef.current.delete("mon_" + _lg.id);
        }
        overlaysRef.current = [];
      }
    }
    /* Phase 4b: Monster projectiles (arrows, bolts, stones) */
    if (data.monProjectiles?.length) {
      await _phase(200, (t, raw) => {
        overlaysRef.current = data.monProjectiles.map(p => ({ ...p, type: "projectile", progress: raw, t }));
        renderFrame();
      });
      overlaysRef.current = [];
    }
    /* Phase 4b.5: Monster projectile bounce return (反射鎧等) (200ms) */
    if (data.monProjectileReturns?.length) {
      await _phase(200, (t, raw) => {
        overlaysRef.current = data.monProjectileReturns.map(p => ({ ...p, type: "projectile", progress: raw, t }));
        renderFrame();
      });
      overlaysRef.current = [];
    }
    moveOffsetsRef.current.clear();
    overlaysRef.current = [];
    /* Use renderFrameRef to always draw the latest game state after async animation */
    renderFrameRef.current();
    } finally {
      animBusyRef.current = false;
    }
  }, [renderFrame, renderFrameRef]);
  /* Drain animation events produced by useItemActions (outside of act()) */
  useEffect(() => {
    if (!gs || animBusyRef.current) return;
    const evts = drainAnims();
    if (evts.length === 0) return;
    const d = { attacks: [], damages: [], projectiles: [], explosions: [] };
    for (const e of evts) {
      if (e.type === "projectile") d.projectiles.push(e);
      else if (e.type === "projectileReturn") (d.projectileReturns = d.projectileReturns || []).push(e);
      else if (e.type === "monProjectile") (d.monProjectiles = d.monProjectiles || []).push(e);
      else if (e.type === "monProjectileReturn") (d.monProjectileReturns = d.monProjectileReturns || []).push(e);
      else if (e.type === "explosion" || e.type === "splash" || e.type === "lightning" || e.type === "heal") d.explosions.push(e);
      else if (e.type === "damage") d.damages.push(e);
      else if (e.type === "flash") (d.flashes = d.flashes || []).push(e);
    }
    if (d.projectiles.length || d.projectileReturns?.length || d.explosions.length || d.damages.length || d.monProjectiles?.length || d.monProjectileReturns?.length) playAnim(d);
  }, [gs, playAnim]);
  const lu = useCallback((p, ml) => {
    while (p.exp >= p.nextExp) {
      p.level++;
      p.exp -= p.nextExp;
      p.nextExp = Math.floor(p.nextExp * 1.5);
      p.maxHp += 5;
      p.hp = Math.min(p.hp + 10, p.maxHp);
      p.atk++;
      if (p.level % 2 === 0) { p.def++; p.maxMp++; }
      ml.push(`レベルアップ！Lv.${p.level}！`);
    }
  }, []);
  const autoPickup = useCallback((p, dg, ml) => {
    let go = true;
    while (go) {
      go = false;
      const it = dg.items.find((i) => i.x === p.x && i.y === p.y);
      if (!it) break;
      if (it.type === "gold") {
        p.gold += it.value;
        ml.push(`${it.value}枚の金貨を拾った！`);
        removeFloorItem(dg, it);
        go = true;
      } else if (it.type === "arrow" && (it.stone || it.magicStone) && !it.shopPrice) {
        if (addStonesInv(p.inventory, it.count, !!it.magicStone, p.maxInventory || 30)) {
          ml.push(`${it.name}(${it.count}個)を拾った。`);
          removeFloorItem(dg, it);
          go = true;
        } else {
          ml.push(`${it.name}(${it.count}個)がある。持ち物がいっぱいだ！`);
          break;
        }
      } else if (it.type === "arrow" && !it.shopPrice) {
        if (addArrowsInv(p.inventory, it.count, !!it.poison, !!it.pierce, p.maxInventory || 30, !!it.bombArrow)) {
          ml.push(`${it.name || "矢"}(${it.count}本)を拾った。`);
          removeFloorItem(dg, it);
          go = true;
        } else {
          ml.push(`${it.name || "矢"}(${it.count}本)がある。持ち物がいっぱいだ！`);
          break;
        }
      } else if (it.type === "goal") {
        trackItem(it);
        p.inventory.push(it);
        ml.push(`★${it.name}を手に入れた！地上に持ち帰ろう！★`);
        removeFloorItem(dg, it);
        go = true;
      } else if (it.shopPrice) {
        ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}${_itemPickupSuffix(it, sr.current?.ident)}がある（商品：${it.shopPrice}G）fキーで拾う`);
        break;
      } else if (p.inventory.length < (p.maxInventory || 30)) {
        if (sr.current.allBcKnown) { it.fullIdent = true; it.bcKnown = true; }
        trackItem(it);
        p.inventory.push(it);
        {
          const _w = it.type === "weapon",
            _a = it.type === "armor";
          let _lbl = itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
          if (_w || _a) {
            if (it.plus) _lbl += (it.plus > 0 ? "+" : "") + it.plus;
            _lbl += _w
              ? " (攻+" + (it.atk + (it.plus || 0)) + ")"
              : " (防+" + (it.def + (it.plus || 0)) + ")";
            const _AB = _w ? WEAPON_ABILITIES : ARMOR_ABILITIES;
            const _ids = [
              ...new Set([
                ...(it.abilities || []),
                ...(it.ability ? [it.ability] : []),
              ]),
            ];
            const _ns = _ids
              .map((id) => _AB.find((a) => a.id === id)?.name)
              .filter(Boolean);
            if (_ns.length) _lbl += " [" + _ns.join("・") + "]";
          }
          ml.push(_lbl + _itemPickupSuffix(it, sr.current?.ident) + "を拾った。");
        }
        removeFloorItem(dg, it);
        go = true;
      } else {
        {
          const _w = it.type === "weapon", _a = it.type === "armor";
          let _fl = itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
          if (_w || _a) {
            if (it.plus) _fl += (it.plus > 0 ? "+" : "") + it.plus;
            _fl += _w ? ` (攻+${it.atk + (it.plus || 0)})` : ` (防+${it.def + (it.plus || 0)})`;
          }
          ml.push(`${_fl}${_itemPickupSuffix(it, sr.current?.ident)}がある。持ち物がいっぱいだ！`);
        }
        break;
      }
    }
  }, []);
  const getLookDesc = useCallback((cx, cy, dg) => {
    if (!dg) return "";
    const tile = dg.map[cy]?.[cx];
    if (!dg.explored[cy]?.[cx]) return "未探索";
    /* 壁タイルの場合 */
    if (tile === T.WALL || tile === T.BWALL) {
      if (dg.itemsRevealed) {
        const _wi = dg.items.find(i => i.x === cx && i.y === cy && i.wallEmbedded);
        if (_wi) {
          const _nm = itemDisplayName(_wi, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
          return `壁の中: ${_nm}`;
        }
      }
      return tile === T.BWALL ? "壊せる壁" : "壁";
    }
    const parts = [];
    if (tile === T.SD) parts.push("下り階段");
    else if (tile === T.SU) parts.push("上り階段");
    const mon = dg.visible[cy]?.[cx] && dg.monsters.find(m => m.x === cx && m.y === cy);
    if (mon) parts.push(`${mon.name} HP:${mon.hp}/${mon.maxHp}`);
    const floorItems = dg.items.filter(i => i.x === cx && i.y === cy && !i.wallEmbedded);
    for (const it of floorItems) {
      const nm = itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
      parts.push(it.shopPrice ? `${nm}(${it.shopPrice}G)` : nm);
    }
    const trap = dg.traps.find(t => t.x === cx && t.y === cy && t.revealed);
    if (trap) parts.push(`罠:${trap.name}`);
    const spring = dg.springs?.find(s => s.x === cx && s.y === cy);
    if (spring) parts.push(spring.name || "泉");
    const bb = dg.bigboxes?.find(b => b.x === cx && b.y === cy);
    if (bb) parts.push(`${bb.name}(${bb.contents?.length || 0}/${bb.capacity ?? "∞"})`);
    const pent = dg.pentacles?.find(pc => pc.x === cx && pc.y === cy);
    if (pent) parts.push(pent.name);
    return parts.length > 0 ? parts.join(" / ") : "何もない";
  }, []);
  const checkTrap = useCallback((p, dg, ml, isDash = false) => {
    const trap = dg.traps.find((t) => t.x === p.x && t.y === p.y);
    if (!trap) return null;
    if (isDash && trap.revealed) return null;
    if (isPlayerFloating(p, dg)) { trap.revealed = true; ml.push(`浮遊しているので${trap.name}を回避した！`); return null; }
    const _nameFn = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
    trackTrap(trap);
    return fireTrapPlayer(trap, p, dg, ml, _nameFn, lu);
  }, []);
  const moveMons = useCallback((dg, pl, ml, phaseMode, extraOpts = {}) => {
    const opts = {
      bbFn: bigboxAddItem,
      luFn: lu,
      ...extraOpts,
      fireTrapFn: (trap, p, dg2, ml2) => fireTrapPlayer(trap, p, dg2, ml2, null, lu),
      monsterWandFn: (m, dx, dy) => {
        const _we = m.wandEffect || "lightning";
        if (_we === "lightning") {
          ml.push(`${m.name}が雷の杖を振った！`);
          monsterFireLightning(m.x, m.y, dg, pl, dx, dy, ml, lu, bigboxAddItem, m.name,
            (it) => itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames), m);
        } else if (_we === "curse_wand") {
          ml.push(`${m.name}が呪いの杖を振った！`);
          pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, "curse_wand");
          /* 呪いボルトを発射（魔封じチェック・障害物チェックあり） */
          let _cwHit = false;
          for (let _d = 1; _d < 20; _d++) {
            const _tx = m.x + dx * _d, _ty = m.y + dy * _d;
            if (inMagicSealRoom(_tx, _ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); _cwHit = true; break; }
            if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH || dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) { ml.push("呪いの魔法弾は壁に消えた。"); _cwHit = true; break; }
            if (_tx === pl.x && _ty === pl.y) {
              /* 反射の鎧チェック */
              if (hasAbility(pl.armor, "wand_reflect")) {
                ml.push("反射の鎧が呪いの魔法弾を反射した！");
                pushAnim({ type: "monProjectileReturn", fromX: pl.x, fromY: pl.y, toX: m.x, toY: m.y, color: "#9020b0" });
                m.speed = Math.max(0.25, (m.speed || 1) * 0.5);
                ml.push(`呪いが${m.name}に反射！鈍足になった！`);
                _cwHit = true; break;
              }
              /* 聖域チェック */
              if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
                ml.push("祝福された聖域の加護が呪いを防いだ！");
              } else {
                /* ランダムな所持品を呪う（金貨・矢を除く） */
                const _inv = pl.inventory.filter(i => i.type !== "gold" && i.type !== "arrow");
                if (_inv.length === 0) {
                  ml.push("所持品がないので呪いは無効だった。");
                } else {
                  const _cit = pick(_inv);
                  const _citDN = itemDisplayName(_cit, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
                  if (_cit.cursed) {
                    ml.push(`${_citDN}は既に呪われていた！（効果なし）`);
                  } else if (_cit.blessed) {
                    _cit.blessed = false; _cit.bcKnown = true;
                    ml.push(`${_citDN}の祝福が解けた！`);
                  } else {
                    _cit.cursed = true; _cit.bcKnown = true;
                    ml.push(`${_citDN}が呪われた！【呪】`);
                  }
                }
              }
              _cwHit = true; break;
            }
            const _hm = monsterAt(dg, _tx, _ty);
            if (_hm) {
              _hm.speed = Math.max(0.25, (_hm.speed || 1) * 0.5);
              ml.push(`呪いの魔法弾が${_hm.name}に命中！鈍足になった！`);
              _cwHit = true; break;
            }
            const _hbb = dg.bigboxes?.find(b => b.x === _tx && b.y === _ty);
            if (_hbb) {
              const _newCap = Math.max(0, (_hbb.capacity || 1) - 1);
              if ((_hbb.contents?.length || 0) > _newCap) {
                const _fts2 = new Set();
                for (const _ci of (_hbb.contents || [])) placeItemAt(dg, _hbb.x, _hbb.y, _ci, ml, _fts2);
                dg.bigboxes = dg.bigboxes.filter(b => b !== _hbb);
                ml.push(`呪いの魔法弾が${_hbb.name}に命中！容量オーバーで壊れた！中身が飛び出した！`);
              } else {
                _hbb.capacity = _newCap;
                ml.push(`呪いの魔法弾が${_hbb.name}に命中！(容量-1 → ${_hbb.capacity})`);
              }
              _cwHit = true; break;
            }
            const _hit = itemAt(dg, _tx, _ty);
            if (_hit) {
              const _hitDN = itemDisplayName(_hit, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              if (_hit.type !== "gold" && _hit.type !== "arrow") {
                if (_hit.blessed) {
                  _hit.blessed = false;
                  ml.push(`呪いの魔法弾が${_hitDN}に命中！祝福が解けた！`);
                } else if (!_hit.cursed) {
                  _hit.cursed = true;
                  ml.push(`呪いの魔法弾が${_hitDN}に命中！呪われた！【呪】`);
                } else {
                  ml.push(`呪いの魔法弾が${_hitDN}に命中！（既に呪われている）`);
                }
              } else {
                ml.push(`呪いの魔法弾が${_hitDN}に命中したが効果がなかった。`);
              }
              _cwHit = true; break;
            }
            const _htr = dg.traps.find(t => t.x === _tx && t.y === _ty);
            if (_htr) {
              _htr.revealed = true;
              ml.push(`呪いの魔法弾が${_htr.name}に命中！罠が露わになった！`);
              _cwHit = true; break;
            }
          }
          if (!_cwHit) ml.push("呪いの魔法弾は虚空に消えた。");
        } else if (_we === "blowback_wand") {
          ml.push(`${m.name}が吹き飛ばしの杖を振った！`);
          pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, "blowback_wand");
          const _nameFn = (it) => itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames);
          let _bwHit = false;
          for (let _d = 1; _d < 20; _d++) {
            const _tx = m.x + dx * _d, _ty = m.y + dy * _d;
            if (inMagicSealRoom(_tx, _ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); _bwHit = true; break; }
            if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH || dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) { _bwHit = true; break; }
            /* 罠：吹き飛ばす（プレイヤーの杖と同様） */
            const _bwTrap = dg.traps?.find(t => t.x === _tx && t.y === _ty);
            if (_bwTrap) {
              _bwTrap.revealed = true;
              applyWandEffect("knockback", "trap", _bwTrap, dx, dy, dg, pl, ml, lu, bigboxAddItem, 1, _nameFn, m.atk);
              _bwHit = true; break;
            }
            /* 床アイテム：吹き飛ばす（プレイヤーの杖と同様） */
            const _bwIt = itemAt(dg, _tx, _ty);
            if (_bwIt) {
              applyWandEffect("knockback", "item", _bwIt, dx, dy, dg, pl, ml, lu, bigboxAddItem, 1, _nameFn, m.atk);
              _bwHit = true; break;
            }
            /* プレイヤーに命中 */
            if (_tx === pl.x && _ty === pl.y) {
              if (hasAbility(pl.armor, "wand_reflect")) {
                ml.push("反射の鎧が吹き飛ばしの魔法弾を反射した！");
                pushAnim({ type: "monProjectileReturn", fromX: pl.x, fromY: pl.y, toX: m.x, toY: m.y, color: "#20e0c0" });
                applyWandEffect("knockback", "monster", m, -dx, -dy, dg, pl, ml, lu, bigboxAddItem, 1, _nameFn, pl.atk || 3);
                if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, pl, ml, lu); }
              } else if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
                ml.push("祝福された聖域の加護が魔法弾を防いだ！");
              } else if (hasGravityPentacle(dg, pl.x, pl.y)) {
                ml.push("重力の魔方陣の力で吹き飛ばしが無効になった！");
              } else {
                applyWandEffect("knockback", "player", pl, dx, dy, dg, pl, ml, lu, bigboxAddItem, 1, _nameFn, m.atk);
                if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
                if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
              }
              _bwHit = true; break;
            }
            /* 途中のモンスターに命中 */
            const _bwMon = dg.monsters.find(mn => mn.x === _tx && mn.y === _ty);
            if (_bwMon) {
              applyWandEffect("knockback", "monster", _bwMon, dx, dy, dg, pl, ml, lu, bigboxAddItem, 1, _nameFn, m.atk, m);
              if (_bwMon.hp <= 0) { trackMonster(_bwMon); killMonster(_bwMon, dg, pl, ml, lu, false, m); }
              _bwHit = true; break;
            }
          }
          if (!_bwHit) ml.push("吹き飛ばしの魔法弾は虚空に消えた。");
        } else if (_we === "confuse_wand") {
          ml.push(`${m.name}が混乱の杖を振った！`);
          pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, "confuse_wand");
          let _cfHit = false;
          for (let _d = 1; _d < 20; _d++) {
            const _tx = m.x + dx * _d, _ty = m.y + dy * _d;
            if (inMagicSealRoom(_tx, _ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); _cfHit = true; break; }
            if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH || dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) { _cfHit = true; break; }
            if (_tx === pl.x && _ty === pl.y) {
              if (hasAbility(pl.armor, "wand_reflect")) {
                ml.push("反射の鎧が混乱の魔法弾を反射した！");
                pushAnim({ type: "monProjectileReturn", fromX: pl.x, fromY: pl.y, toX: m.x, toY: m.y, color: "#dd44ff" });
                const _cfRefPrev = m.confusedTurns || 0;
                m.confusedTurns = _cfRefPrev + 10;
                ml.push(_cfRefPrev > 0
                  ? `混乱が${m.name}に反射した！混乱が延長された！(混乱${m.confusedTurns}ターン)`
                  : `混乱が${m.name}に反射した！(混乱${m.confusedTurns}ターン)`);
              } else if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
                ml.push("祝福された聖域の加護が混乱の魔法を防いだ！");
              } else if ((pl.statusImmune || 0) > 0) {
                ml.push("混乱の魔法弾を受けた！しかし状態防止中のため効かなかった！");
              } else if (hasAbility(pl.armor, "confuse_proof")) {
                ml.push("混乱の魔法弾を受けた！しかし防具が防いだ！(耐混乱)");
              } else {
                const _cfPlPrev = pl.confusedTurns || 0;
                pl.confusedTurns = _cfPlPrev + 5;
                ml.push(_cfPlPrev > 0
                  ? `混乱の魔法弾を受けた！混乱が延長された！(混乱${pl.confusedTurns}ターン)`
                  : `混乱の魔法弾を受けた！頭がくらくらする！(混乱${pl.confusedTurns}ターン)`);
              }
              _cfHit = true; break;
            }
            const _cfm = monsterAt(dg, _tx, _ty);
            if (_cfm) {
              const _cfmPrev = _cfm.confusedTurns || 0;
              _cfm.confusedTurns = _cfmPrev + 20;
              ml.push(_cfmPrev > 0
                ? `混乱の魔法弾が${_cfm.name}に命中！混乱が延長された！(混乱${_cfm.confusedTurns}ターン)`
                : `混乱の魔法弾が${_cfm.name}に命中！混乱した！(混乱${_cfm.confusedTurns}ターン)`);
              _cfHit = true; break;
            }
            const _cfbb = dg.bigboxes?.find(b => b.x === _tx && b.y === _ty);
            if (_cfbb) { ml.push(`混乱の魔法弾が${_cfbb.name}に命中したが効果がなかった。`); _cfHit = true; break; }
            const _cfit = itemAt(dg, _tx, _ty);
            if (_cfit) {
              ml.push(`混乱の魔法弾が${itemDisplayName(_cfit, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}に命中したが効果がなかった。`);
              _cfHit = true; break;
            }
            const _cftr = dg.traps.find(t => t.x === _tx && t.y === _ty);
            if (_cftr) { ml.push(`混乱の魔法弾が${_cftr.name}に命中したが効果がなかった。`); _cfHit = true; break; }
          }
          if (!_cfHit) ml.push("混乱の魔法弾は虚空に消えた。");
        } else if (_we === "sleep_wand") {
          ml.push(`${m.name}が眠りの杖を振った！`);
          pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, "sleep_wand");
          let _slHit = false;
          for (let _d = 1; _d < 20; _d++) {
            const _tx = m.x + dx * _d, _ty = m.y + dy * _d;
            if (inMagicSealRoom(_tx, _ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); _slHit = true; break; }
            if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH || dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) { _slHit = true; break; }
            if (_tx === pl.x && _ty === pl.y) {
              if (hasAbility(pl.armor, "wand_reflect")) {
                ml.push("反射の鎧が眠りの魔法弾を反射した！");
                pushAnim({ type: "monProjectileReturn", fromX: pl.x, fromY: pl.y, toX: m.x, toY: m.y, color: "#44ff88" });
                const _slRefPrev = m.sleepTurns || 0;
                m.sleepTurns = _slRefPrev + 10;
                ml.push(_slRefPrev > 0
                  ? `眠りが${m.name}に反射した！眠りが延長された！(眠り${m.sleepTurns}ターン)`
                  : `眠りが${m.name}に反射した！(眠り${m.sleepTurns}ターン)`);
              } else if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
                ml.push("祝福された聖域の加護が眠りの魔法を防いだ！");
              } else if ((pl.statusImmune || 0) > 0) {
                ml.push("眠りの魔法弾を受けた！しかし状態防止中のため効かなかった！");
              } else if (hasAbility(pl.armor, "sleep_proof")) {
                ml.push("眠りの魔法弾を受けた！しかし防具が防いだ！(耐眠)");
              } else {
                const _slPlPrev = pl.sleepTurns || 0;
                pl.sleepTurns = _slPlPrev + rng(5, 10);
                ml.push(_slPlPrev > 0
                  ? `眠りの魔法弾を受けた！眠りが延長された！(眠り${pl.sleepTurns}ターン)`
                  : `眠りの魔法弾を受けた！眠ってしまった！(眠り${pl.sleepTurns}ターン)`);
              }
              _slHit = true; break;
            }
            const _slm = monsterAt(dg, _tx, _ty);
            if (_slm) {
              const _slmPrev = _slm.sleepTurns || 0;
              _slm.sleepTurns = _slmPrev + 20;
              ml.push(_slmPrev > 0
                ? `眠りの魔法弾が${_slm.name}に命中！眠りが延長された！(眠り${_slm.sleepTurns}ターン)`
                : `眠りの魔法弾が${_slm.name}に命中！眠ってしまった！(眠り${_slm.sleepTurns}ターン)`);
              _slHit = true; break;
            }
            const _slbb = dg.bigboxes?.find(b => b.x === _tx && b.y === _ty);
            if (_slbb) { ml.push(`眠りの魔法弾が${_slbb.name}に命中したが効果がなかった。`); _slHit = true; break; }
            const _slit = itemAt(dg, _tx, _ty);
            if (_slit) {
              ml.push(`眠りの魔法弾が${itemDisplayName(_slit, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}に命中したが効果がなかった。`);
              _slHit = true; break;
            }
            const _sltr = dg.traps.find(t => t.x === _tx && t.y === _ty);
            if (_sltr) { ml.push(`眠りの魔法弾が${_sltr.name}に命中したが効果がなかった。`); _slHit = true; break; }
          }
          if (!_slHit) ml.push("眠りの魔法弾は虚空に消えた。");
        } else if (_we === "teleport_wand") {
          ml.push(`${m.name}がテレポートの杖を振った！`);
          pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, "teleport_wand");
          const _tpRand = (exX, exY) => {
            const _pts = [];
            for (let _fy = 1; _fy < MH - 1; _fy++) for (let _fx = 1; _fx < MW - 1; _fx++) {
              if (dg.map[_fy][_fx] === T.FLOOR &&
                  !dg.monsters.some(o => o.x === _fx && o.y === _fy) &&
                  !(_fx === pl.x && _fy === pl.y) &&
                  !(_fx === exX && _fy === exY))
                _pts.push({ x: _fx, y: _fy });
            }
            return _pts.length > 0 ? pick(_pts) : null;
          };
          let _tpHit = false;
          for (let _d = 1; _d < 20; _d++) {
            const _tx = m.x + dx * _d, _ty = m.y + dy * _d;
            if (inMagicSealRoom(_tx, _ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); _tpHit = true; break; }
            if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH || dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) { _tpHit = true; break; }
            if (_tx === pl.x && _ty === pl.y) {
              if (hasAbility(pl.armor, "wand_reflect")) {
                ml.push("反射の鎧がテレポートの魔法弾を反射した！");
                pushAnim({ type: "monProjectileReturn", fromX: pl.x, fromY: pl.y, toX: m.x, toY: m.y, color: "#ff9900" });
                const _rp = _tpRand(m.x, m.y);
                if (_rp) { m.x = _rp.x; m.y = _rp.y; ml.push(`テレポートが${m.name}に反射した！どこかへテレポートした！`); }
              } else if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
                ml.push("祝福された聖域の加護がテレポートの魔法を防いだ！");
              } else if (dg.pentacles?.some(pc => pc.kind === "teleport" && pc.cursed)) {
                ml.push("呪われたテレポートの魔方陣がテレポートを阻んだ！");
              } else {
                const _rp2 = _tpRand(pl.x, pl.y);
                if (_rp2) { pl.x = _rp2.x; pl.y = _rp2.y; ml.push("テレポートの魔法弾を受けた！どこかへテレポートした！"); }
                else ml.push("テレポートに失敗した。");
              }
              _tpHit = true; break;
            }
            const _tpm = monsterAt(dg, _tx, _ty);
            if (_tpm) {
              const _rp3 = _tpRand(_tpm.x, _tpm.y);
              if (_rp3) { _tpm.x = _rp3.x; _tpm.y = _rp3.y; ml.push(`テレポートの魔法弾が${_tpm.name}に命中！どこかへテレポートした！`); }
              _tpHit = true; break;
            }
            const _tpbb = dg.bigboxes?.find(b => b.x === _tx && b.y === _ty);
            if (_tpbb) {
              const _tpbbPts = [];
              for (let _fy = 1; _fy < MH - 1; _fy++) for (let _fx = 1; _fx < MW - 1; _fx++) {
                if (dg.map[_fy][_fx] === T.FLOOR &&
                    !dg.monsters.some(o => o.x === _fx && o.y === _fy) &&
                    !dg.bigboxes.some(b => b !== _tpbb && b.x === _fx && b.y === _fy) &&
                    !(_fx === pl.x && _fy === pl.y) && !(_fx === _tpbb.x && _fy === _tpbb.y))
                  _tpbbPts.push({ x: _fx, y: _fy });
              }
              const _rp4 = _tpbbPts.length > 0 ? pick(_tpbbPts) : null;
              if (_rp4) { _tpbb.x = _rp4.x; _tpbb.y = _rp4.y; ml.push(`テレポートの魔法弾が${_tpbb.name}に命中！どこかへテレポートした！`); }
              else ml.push("テレポートに失敗した。");
              _tpHit = true; break;
            }
            const _tpit = itemAt(dg, _tx, _ty);
            if (_tpit) {
              const _tpitDN = itemDisplayName(_tpit, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              const _rp5 = _tpRand(_tpit.x, _tpit.y);
              if (_rp5) { _tpit.x = _rp5.x; _tpit.y = _rp5.y; ml.push(`テレポートの魔法弾が${_tpitDN}に命中！どこかへテレポートした！`); }
              else ml.push("テレポートに失敗した。");
              _tpHit = true; break;
            }
            const _tptr = dg.traps.find(t => t.x === _tx && t.y === _ty);
            if (_tptr) {
              const _rp6 = _tpRand(_tptr.x, _tptr.y);
              if (_rp6) { _tptr.x = _rp6.x; _tptr.y = _rp6.y; _tptr.revealed = false; ml.push(`テレポートの魔法弾が${_tptr.name}に命中！罠がどこかへテレポートした！`); }
              else ml.push("テレポートに失敗した。");
              _tpHit = true; break;
            }
          }
          if (!_tpHit) ml.push("テレポートの魔法弾は虚空に消えた。");
        }
      },
      monsterDropFn: (m, dg2, ml2) => monsterDrop(m, dg2, ml2, pl),
    };
    /* 近い敵から処理することで通路でのチェーン移動を自然に解決する */
    dg.monsters.sort((a, b) =>
      (Math.abs(a.x - pl.x) + Math.abs(a.y - pl.y)) -
      (Math.abs(b.x - pl.x) + Math.abs(b.y - pl.y))
    );
    const _phase = phaseMode || "both"; // "moveOnly" | "attackOnly" | "both"
    dg.monsters.forEach((m) => {
      if (m.hp <= 0) return;
      if (_phase === "attackOnly") {
        /* 移動した敵は攻撃フェーズをスキップ（speed<=1のみ。倍速敵は移動後も攻撃できる） */
        if (m._movedThisTurn) { delete m._movedThisTurn; return; }
        /* 攻撃フェーズ：「総アクション数 - 移動に使ったアクション数」分だけ攻撃できる
           例：speed=2で1歩移動した場合 → 残り1アクション分だけ攻撃可能 */
        const _totalActions = m._phaseActionCount ?? 1;
        const _movesMade = m._movesMadeThisPhase ?? 0;
        const _atkBudget = Math.max(0, _totalActions - _movesMade);
        delete m._phaseActionCount;
        delete m._movesMadeThisPhase;
        m.turnAttacks = 0;
        for (let _ai = 0; _ai < _atkBudget; _ai++) {
          if (m.hp <= 0) break;
          monsterAI(m, dg, pl, ml, { ...opts, attackOnly: true });
        }
        return;
      }
      /* moveOnly / both: ターン蓄積・turnAttacksリセットは移動フェーズで */
      m.turnAccum += m.speed;
      m.turnAttacks = 0;
      let _actionCount = 0;
      let _moveCount = 0; /* 実際に位置が変わったアクション数 */
      while (m.turnAccum >= 1) {
        m.turnAccum -= 1;
        _actionCount++;
        if (m.hp <= 0) break;
        if (_phase === "moveOnly") {
          const _bx = m.x, _by = m.y;
          monsterAI(m, dg, pl, ml, { ...opts, moveOnly: true });
          if (m.x !== _bx || m.y !== _by) _moveCount++;
        } else {
          monsterAI(m, dg, pl, ml, opts);
        }
      }
      if (_phase === "moveOnly") {
        m._phaseActionCount = _actionCount;
        m._movesMadeThisPhase = _moveCount;
      }
    });
  }, []);
  const chgFloor = useCallback((pl, dir, pitfall = false) => {
    const nd = pl.depth + dir;
    if (nd < 1) return null;
    const _maxD = sr.current.maxDepth;
    /* 最下層から落とし穴 → 隠し宝部屋 */
    const _isLastFloorPitfall = pitfall && _maxD !== null && pl.depth >= _maxD && dir > 0;
    if (!sr.current.floors) sr.current.floors = {};
    /* 店の部屋内で落とし穴等により階層を離脱した場合は泥棒状態にする */
    const _chgShops = sr.current.dungeon?.shops || (sr.current.dungeon?.shop ? [sr.current.dungeon.shop] : []);
    for (const _cs of _chgShops) {
      if (_cs.unpaidTotal > 0 && _cs.room &&
          pl.x >= _cs.room.x && pl.x < _cs.room.x + _cs.room.w &&
          pl.y >= _cs.room.y && pl.y < _cs.room.y + _cs.room.h) {
        sr.current.dungeon.shopTheft = true;
        for (const _ci of pl.inventory) { delete _ci.shopPrice; delete _ci._shopId; }
        break;
      }
    }
    sr.current.floors[pl.depth] = sr.current.dungeon;
    const _saved = sr.current.floors[nd];
    let d;
    if (_isLastFloorPitfall) {
      /* 隠し宝部屋を生成 */
      d = _saved || genTreasureRoom(pl.depth);
      if (_saved) delete sr.current.floors[nd];
    } else if (_saved) {
      d = _saved;
      delete sr.current.floors[nd];
    } else if (sr.current.isDebugRun && nd >= 2) {
      d = genDungeon(nd - 1, "beginner");
    } else {
      d = genDungeon(nd - 1, sr.current.dungeonType || "beginner");
      /* 最下層は下り階段を消して目標アイテムを配置 */
      if (_maxD !== null && nd >= _maxD) {
        prepareLastFloor(d, sr.current.dungeonType || "beginner");
      }
    }
    pl.depth = nd;
    /* 最深層に到着時、goalアイテムが所持品にもフロアにもなければ再配置 */
    if (_maxD !== null && nd >= _maxD && d.isLastFloor) {
      const _hasGoalInv = pl.inventory?.some(i => i.type === "goal");
      const _hasGoalFloor = d.items.some(i => i.type === "goal");
      if (!_hasGoalInv && !_hasGoalFloor) {
        const _dt = sr.current.dungeonType || "beginner";
        const _gtmpl = GOAL_ITEMS[_dt] || GOAL_ITEMS.beginner;
        const _gr = d.rooms[d.rooms.length - 1];
        const _gx = _gr.cx ?? (_gr.x + Math.floor(_gr.w / 2));
        const _gy = _gr.cy ?? (_gr.y + Math.floor(_gr.h / 2));
        d.items.push({ ..._gtmpl, id: uid(), x: _gx, y: _gy });
      }
    }
    if (sr.current.allBcKnown) {
      d.items.forEach(it => { it.fullIdent = true; it.bcKnown = true; });
    }
    if (pitfall) {
      const _pr = d.rooms[rng(0, d.rooms.length - 1)];
      pl.x = rng(_pr.x, _pr.x + _pr.w - 1);
      pl.y = rng(_pr.y, _pr.y + _pr.h - 1);
    } else {
      const _stTarget = dir > 0 ? d.stairUp : (d.stairDown || d.stairUp);
      pl.x = _stTarget.x;
      pl.y = _stTarget.y;
    }
    refreshFOV(d, pl);
    d.nextSpawnTurn = pl.turns + rng(10, 50);
    d._firstVisit = !_saved;
    return d;
  }, []);
  const withPitfallBag = useCallback((fn) => {
    const _pfBag = [];
    setPitfallBag(_pfBag);
    fn();
    clearPitfallBag();
    if (!sr.current.floors) sr.current.floors = {};
    processPitfallBag(_pfBag, sr.current.floors, sr.current.player.depth);
  }, []);
  const endTurn = useCallback(
    (st, p, ml) => {
      /* 落とし穴バッグをセット — moveMons内のmonsterDropなどで発動した落とし穴を収集 */
      const _etPfBag = [];
      setPitfallBag(_etPfBag);
      p.turns++;
      const _hasRegenRing = hasRingEffect(p, "regen_ring");
      const hd =
        hasAbility(p.armor, "slow_hunger")
          ? 2
          : _hasRegenRing ? 0.5  /* 回復の指輪：空腹が2倍速 */
          : 1;
      /* hd < 1 の場合は整数 turns でのチェックができないので別処理 */
      if (_hasRegenRing) {
        if (p.turns % 5 === 0) p.hunger = Math.max(0, p.hunger - 1);
      } else {
        if (p.turns % (10 * hd) === 0) {
          p.hunger = Math.max(0, p.hunger - 1);
        }
      }
      if (p.hunger === 0) {
        p.deathCause = "空腹により";
        p.hp--;
        if (p.turns % 10 === 0) ml.push("空腹でHPが減っている...");
      } else if (p.hp > 0 && p.hp < p.maxHp) {
        const _baseRegen = Math.max(1, Math.floor(p.maxHp / 100)) +
          (hasAbility(p.armor, "regen") ? 1 : 0);
        const regenAmt = _hasRegenRing ? _baseRegen * 2 : _baseRegen;  /* 回復の指輪：回復量2倍 */
        p.hp = Math.min(p.maxHp, p.hp + regenAmt);
      }
      /* MPクールダウンカウント */
      if ((p.mpCooldownTurns || 0) > 0) p.mpCooldownTurns--;
      /* MP自然回復：100ターンにつき1（封印中は回復しない） */
      if (p.turns % 100 === 0 && (p.mpCooldownTurns || 0) === 0 && (p.mp || 0) < (p.maxMp || 0)) {
        p.mp = Math.min(p.mp + 1, p.maxMp);
      }
      /* 封印カウントダウン */
      if ((p.sealedTurns || 0) > 0) {
        p.sealedTurns--;
        if (p.sealedTurns === 0) ml.push("封印が解けた！");
      }
      /* 毒：3ターンごとに攻撃力-1 */
      if (p.poisoned && p.turns % 3 === 0) {
        if ((p.poisonAtkLoss || 0) >= 3) {
          p.poisoned = false;
          ml.push("毒の効果が切れた。攻撃力の低下は残っている...");
        } else if (p.atk > 1) {
          p.atk--;
          p.poisonAtkLoss = (p.poisonAtkLoss || 0) + 1;
          ml.push("毒に冒されている！攻撃力が下がった...");
          if (p.poisonAtkLoss >= 3) {
            p.poisoned = false;
            ml.push("毒の効果が切れた。");
          }
        }
      }
      /* 油状態：カウントダウン */
      if ((p.oilyTurns || 0) > 0) {
        p.oilyTurns--;
        if (p.oilyTurns === 0) ml.push("油が落ちた。炎への弱点が消えた。");
      }
      /* 移動封じ：カウントダウン */
      if ((p.immobileTurns || 0) > 0) {
        p.immobileTurns--;
      }
      /* 浮遊状態：カウントダウン（呪われた重力の魔方陣による浮遊は魔方陣依存なのでここはスキップ） */
      if ((p.floatTurns || 0) > 0) {
        p.floatTurns--;
        if (p.floatTurns === 0) ml.push("浮遊が解けた！");
      }
      /* 透明状態：カウントダウン */
      if ((p.invisibleTurns || 0) > 0) {
        p.invisibleTurns--;
        if (p.invisibleTurns === 0) ml.push("透明が解けた！敵に見えるようになった。");
      }
      /* 壁抜け状態：カウントダウン。解除時に壁の中にいたら押し出す */
      if ((p.wallWalkTurns || 0) > 0) {
        p.wallWalkTurns--;
        if (p.wallWalkTurns === 0) {
          ml.push("壁抜けが解けた！");
          if (st.dungeon.map[p.y]?.[p.x] === T.WALL || st.dungeon.map[p.y]?.[p.x] === T.BWALL) {
            const _wwDirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
            let _pushed = false;
            for (const [_wdx, _wdy] of _wwDirs) {
              const _wx = p.x + _wdx, _wy = p.y + _wdy;
              if (_wx >= 0 && _wx < MW && _wy >= 0 && _wy < MH &&
                  st.dungeon.map[_wy][_wx] !== T.WALL && st.dungeon.map[_wy][_wx] !== T.BWALL &&
                  !st.dungeon.monsters.some(m => m.x === _wx && m.y === _wy)) {
                p.x = _wx; p.y = _wy;
                ml.push("壁の外に押し出された！");
                _pushed = true;
                break;
              }
            }
            if (!_pushed) ml.push("壁に埋まったまま抜け出せない！毎ターンダメージを受ける！");
          }
        }
      }
      /* 壁に埋まっている：毎ターン大ダメージ */
      if ((p.wallWalkTurns || 0) === 0 &&
          (st.dungeon.map[p.y]?.[p.x] === T.WALL || st.dungeon.map[p.y]?.[p.x] === T.BWALL)) {
        const _wdmg = 15;
        p.hp -= _wdmg;
        ml.push(`壁に挟まれて苦しい！${_wdmg}ダメージ！`);
        if (p.hp <= 0) { p.deathCause = "壁に埋まり"; }
      }
      /* 水上で浮遊解除：最寄りの陸上に弾き出される */
      if (st.dungeon.map[p.y][p.x] === T.WATER && !isPlayerFloating(p, st.dungeon)) {
        const _wDirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
        for (const [_wdx, _wdy] of _wDirs) {
          const _wx = p.x + _wdx, _wy = p.y + _wdy;
          if (_wx >= 0 && _wx < MW && _wy >= 0 && _wy < MH &&
              st.dungeon.map[_wy][_wx] !== T.WALL && st.dungeon.map[_wy][_wx] !== T.BWALL &&
              st.dungeon.map[_wy][_wx] !== T.WATER &&
              !st.dungeon.monsters.some(m => m.x === _wx && m.y === _wy)) {
            p.x = _wx; p.y = _wy;
            ml.push("浮遊が解けて水から弾き出された！");
            break;
          }
        }
      }
      /* 呪われた聖域の魔方陣：強制的に上に乗ると即死 */
      const _cursedSancOn = st.dungeon.pentacles?.find((pc) => pc.kind === "sanctuary" && pc.cursed && pc.x === p.x && pc.y === p.y);
      if (_cursedSancOn && p.hp > 0) {
        p.deathCause = `${_cursedSancOn.name}により`;
        p.hp = 0;
        ml.push(`${_cursedSancOn.name}に触れた！呪いの力で即死した！`);
      }
      /* 雷の魔方陣：真上にいると毎ターンダメージ（呪いは回復） */
      const _thunderPent = st.dungeon.pentacles?.find((pc) => pc.kind === "thunder_trap" && pc.x === p.x && pc.y === p.y);
      if (_thunderPent && p.hp > 0) {
        if (!_thunderPent.cursed && hasCursedExplosionPentacle(st.dungeon)) {
          ml.push("呪われた爆発の魔方陣が雷を打ち消した！");
        } else if (_thunderPent.cursed) {
          const _theal = Math.min(25, p.maxHp - p.hp);
          if (_theal > 0) { p.hp += _theal; ml.push(`${_thunderPent.name}の力でHPが${_theal}回復した！`); }
        } else {
          const _thasLR = hasAbility(p.armor, "lightning_resist");
          const _tdmg = Math.max(1, Math.floor((_thunderPent.blessed ? 50 : 25) * (_thasLR ? 0.5 : 1)));
          p.deathCause = `${_thunderPent.name}の雷撃により`;
          p.hp -= _tdmg;
          ml.push(`${_thunderPent.name}に打たれた！${_tdmg}ダメージ！${_thasLR ? "（雷耐性）" : ""}`);
          if (!_thasLR) {
            applyLightningToInventory(p, st.dungeon, ml, lu,
              (it) => itemDisplayName(it, st.fakeNames, st.ident, st.nicknames));
          } else {
            ml.push("ゴムゴムの胴がアイテムへの雷を弾いた！");
          }
        }
      }
      checkShopTheft(p, st.dungeon, ml);
      /* ===== 4フェーズターン制 ===== */
      /* Phase 2: モンスター移動フェーズ（攻撃なし） */
      const _monSnap = new Map();
      for (const _ms of st.dungeon.monsters) _monSnap.set(_ms.id, { x: _ms.x, y: _ms.y });
      moveMons(st.dungeon, p, ml, "moveOnly");
      /* Capture monster position changes for animation + mark movers */
      const _mmoves = [], _mattacks = [], _mdamages = [];
      for (const _ms2 of st.dungeon.monsters) {
        const _snap = _monSnap.get(_ms2.id);
        if (_snap && (_ms2.x !== _snap.x || _ms2.y !== _snap.y)) {
          _mmoves.push({ id: _ms2.id, fromX: _snap.x, fromY: _snap.y, toX: _ms2.x, toY: _ms2.y, tile: _ms2.tile, hp: _ms2.hp, maxHp: _ms2.maxHp });
          if ((_ms2.speed ?? 1) <= 1) _ms2._movedThisTurn = true; /* 速度1以下の敵は移動後に攻撃不可。倍速敵はそのまま攻撃できる */
        }
      }
      /* Phase 3: 罠・爆発の発火フェーズ（敵移動後、攻撃前） */
      /* 爆発の指輪：5%の確率で爆発 */
      if (p.hp > 0 && hasRingEffect(p, "explode_ring") && Math.random() < 0.05) {
        ml.push("指輪が爆発した！");
        const _erfNFn = (gi) => gi.name;
        doExplosion(p.x, p.y, st.dungeon, p, ml, _erfNFn, "爆発の指輪", null, null, false, true);
      }
      /* 遅延地雷爆発（act()から受け渡し） */
      if (st._pendingMineExplosion && p.hp > 0) {
        const _pme = st._pendingMineExplosion;
        delete st._pendingMineExplosion;
        ml.push(`${_pme.name}が発動！`);
        if (hasCursedExplosionPentacle(st.dungeon)) {
          ml.push(`呪われた爆発の魔方陣が爆発を打ち消した！`);
        } else {
          doExplosion(_pme.x, _pme.y, st.dungeon, p, ml, _pme.nameFn, _pme.name, null, lu, true, false, true);
        }
      }
      /* 時限爆弾カウントダウン */
      if (st.dungeon.pendingBombs?.length > 0 && p.hp > 0) {
        const _nameFnBomb = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
        const _remaining = [];
        for (const _pb of st.dungeon.pendingBombs) {
          _pb.turnsLeft--;
          if (_pb.turnsLeft <= 0) {
            ml.push(`時限爆弾の罠が大爆発した！`);
            doTimeBombExplosion(_pb.x, _pb.y, st.dungeon, p, ml, lu, _nameFnBomb);
          } else {
            ml.push(`時限爆弾の罠：あと${_pb.turnsLeft}ターンで爆発！`);
            _remaining.push(_pb);
          }
        }
        st.dungeon.pendingBombs = _remaining;
      }
      /* Phase 4: モンスター攻撃フェーズ（移動なし） */
      const _perHitEvents = [];
      const _perHitLunges = [];
      let _hadActualHit = false;
      moveMons(st.dungeon, p, ml, "attackOnly", {
        onPlayerHit: (dmg, mon) => {
          _perHitEvents.push({ type: "damage", x: p.x, y: p.y, value: dmg, color: "#ff6644" });
          if (mon) _perHitLunges.push({ id: mon.id, tile: mon.tile, fromX: mon.x, fromY: mon.y, toX: p.x, toY: p.y, hp: mon.hp, maxHp: mon.maxHp });
          _hadActualHit = true;
        },
        onPlayerMiss: (mon) => {
          _perHitEvents.push({ type: "miss", x: p.x, y: p.y });
          if (mon) _perHitLunges.push({ id: mon.id, tile: mon.tile, fromX: mon.x, fromY: mon.y, toX: p.x, toY: p.y, hp: mon.hp, maxHp: mon.maxHp });
        },
      });
      if (_perHitEvents.length > 0) {
        if (_hadActualHit && p.hp > 0) _mattacks.push({ type: "flash", x: p.x, y: p.y, color: "#ff4400" });
        _mdamages.push(..._perHitEvents);
      }
      monMovesRef.current = { moves: _mmoves, attacks: _mattacks, damages: _mdamages, lunges: _perHitLunges };
      /* 油状態：モンスターのカウントダウン */
      for (const _om of st.dungeon.monsters) { if ((_om.oilyTurns || 0) > 0) _om.oilyTurns--; }
      /* 雷の魔方陣：モンスターにも適用（moveMons後に最終位置で判定） */
      if (st.dungeon.pentacles?.some((pc) => pc.kind === "thunder_trap") && !hasCursedExplosionPentacle(st.dungeon)) {
        for (const _m of [...st.dungeon.monsters]) {
          const _tp = st.dungeon.pentacles.find((pc) => pc.kind === "thunder_trap" && pc.x === _m.x && pc.y === _m.y);
          if (_tp) {
            if (_tp.cursed) {
              const _mheal = Math.min(25, _m.maxHp - _m.hp);
              if (_mheal > 0) { _m.hp += _mheal; ml.push(`${_tp.name}の力で${_m.name}のHPが${_mheal}回復した！`); }
            } else {
              const _tmdmg = _tp.blessed ? 50 : 25;
              _m.hp -= _tmdmg;
              ml.push(`${_tp.name}が${_m.name}を打った！${_tmdmg}ダメージ！`);
              if (_m.hp <= 0) { trackMonster(_m); killMonster(_m, st.dungeon, p, ml, lu); }
            }
          }
        }
      }
      /* ===== 新ペン魔方陣の毎ターン効果 ===== */
      if (st.dungeon.pentacles?.length > 0 && p.hp > 0) {
        const _dg2 = st.dungeon;
        const _pRoom = findRoom(_dg2.rooms, p.x, p.y);
        for (const _pc of _dg2.pentacles) {
          const _pcRoom = findRoom(_dg2.rooms, _pc.x, _pc.y);
          const _floorWide = _pc.blessed; // 祝福はフロア全体
          const _inRange = _floorWide || (_pRoom && _pcRoom && _pRoom === _pcRoom);
          /* --- 明かりの魔方陣 --- */
          /* (rendering only; handled in refreshFOV override below) */
          /* --- テレポートの魔方陣：各生物が独立して毎ターン10%でテレポート --- */
          if (_pc.kind === "teleport_trap" && !_pc.cursed) {
            const _tpFloorBlocked = _dg2.pentacles.some(pc2 => pc2 !== _pc && pc2.kind === "teleport_trap" && pc2.cursed);
            if (!_tpFloorBlocked) {
              const _doTp = () => {
                const _r = _dg2.rooms[rng(0, _dg2.rooms.length - 1)];
                return { x: rng(_r.x, _r.x + _r.w - 1), y: rng(_r.y, _r.y + _r.h - 1) };
              };
              /* プレイヤーが対象範囲内なら個別抽選 */
              if (_inRange && Math.random() < 0.1) {
                const _tp = _doTp(); p.x = _tp.x; p.y = _tp.y;
                ml.push(`${_pc.name}の力でテレポートした！`);
              }
              /* 魔方陣と同じ部屋にいるモンスターを個別抽選（祝福ならフロア全体） */
              for (const _tpM of _dg2.monsters) {
                const _tpMRoom = findRoom(_dg2.rooms, _tpM.x, _tpM.y);
                if ((_pc.blessed ? true : _tpMRoom === _pcRoom) && Math.random() < 0.1) {
                  const _tp = _doTp(); _tpM.x = _tp.x; _tpM.y = _tp.y;
                  ml.push(`${_pc.name}の力で${_tpM.name}がテレポートした！`);
                }
              }
            }
          }
          /* --- 罠の魔方陣：毎ターン30%で罠が増える --- */
          if (_pc.kind === "trap_gen" && _inRange && Math.random() < 0.1) {
            if (_pc.cursed) {
              /* 呪い：フロア内の罠をランダムに1つ消す（永続回転板は除外） */
              const _delCands = _dg2.traps.filter(t => !t.permanent);
              if (_delCands.length > 0) {
                const _rt = pick(_delCands);
                _dg2.traps = _dg2.traps.filter(t => t !== _rt);
                ml.push(`${_pc.name}の呪いで罠が消えた！`);
              }
            } else {
              /* 通常/祝福：対象エリアにランダム罠を配置 */
              const _tgScope = _pc.blessed ? _dg2.rooms : (_pcRoom ? [_pcRoom] : []);
              if (_tgScope.length > 0) {
                const _tgR = pick(_tgScope);
                let _placed = false;
                for (let _att = 0; _att < 20 && !_placed; _att++) {
                  const _tx2 = rng(_tgR.x, _tgR.x + _tgR.w - 1);
                  const _ty2 = rng(_tgR.y, _tgR.y + _tgR.h - 1);
                  if (_tx2 === p.x && _ty2 === p.y) continue;
                  if (_dg2.map[_ty2][_tx2] !== T.FLOOR) continue;
                  if (_dg2.traps.some(t => t.x === _tx2 && t.y === _ty2)) continue;
                  if (_dg2.items.some(i => i.x === _tx2 && i.y === _ty2)) continue;
                  if (_dg2.monsters.some(m => m.x === _tx2 && m.y === _ty2)) continue;
                  if (_dg2.springs?.some(s => s.x === _tx2 && s.y === _ty2)) continue;
                  if (_dg2.bigboxes?.some(b => b.x === _tx2 && b.y === _ty2)) continue;
                  if (_dg2.pentacles?.some(pc3 => pc3.x === _tx2 && pc3.y === _ty2)) continue;
                  const _td2 = pick(TRAPS);
                  _dg2.traps.push({ ..._td2, id: uid(), x: _tx2, y: _ty2, revealed: false });
                  _placed = true;
                }
              }
            }
          }
          /* --- 石飛ばしの魔方陣：毎ターン25%で部屋内キャラに魔法の石を飛ばす --- */
          if (_pc.kind === "stone_throw" && _pcRoom && Math.random() < 0.25) {
            /* 部屋内の全キャラ（プレイヤー＋モンスター）をターゲット候補に */
            const _stTargets = [];
            const _plInRoom = _pRoom === _pcRoom;
            if (_plInRoom) _stTargets.push({ kind: "player" });
            for (const _stM of _dg2.monsters) {
              const _stMRoom = findRoom(_dg2.rooms, _stM.x, _stM.y);
              if (_stMRoom === _pcRoom) _stTargets.push({ kind: "monster", m: _stM });
            }
            if (_stTargets.length > 0) {
              const _stTgt = pick(_stTargets);
              const _baseDmg = rng(5, 10);
              if (_pc.cursed) {
                /* 呪い：回復効果 */
                if (_stTgt.kind === "player") {
                  const _heal = Math.min(_baseDmg, p.maxHp - p.hp);
                  if (_heal > 0) { p.hp += _heal; ml.push(`${_pc.name}の魔法の石がプレイヤーに当たった！${_heal}回復！`); }
                } else {
                  const _heal = Math.min(_baseDmg, _stTgt.m.maxHp - _stTgt.m.hp);
                  if (_heal > 0) { _stTgt.m.hp += _heal; ml.push(`${_pc.name}の魔法の石が${_stTgt.m.name}に当たった！${_heal}回復！`); }
                }
              } else {
                const _dmg = _pc.blessed ? _baseDmg * 2 : _baseDmg;
                if (_stTgt.kind === "player") {
                  p.deathCause = `${_pc.name}の魔法の石により`;
                  p.hp -= _dmg;
                  ml.push(`${_pc.name}の魔法の石がプレイヤーに当たった！${_dmg}ダメージ！`);
                } else {
                  _stTgt.m.hp -= _dmg;
                  ml.push(`${_pc.name}の魔法の石が${_stTgt.m.name}に当たった！${_dmg}ダメージ！`);
                  if (_stTgt.m.hp <= 0) { trackMonster(_stTgt.m); killMonster(_stTgt.m, _dg2, p, ml, lu); }
                }
              }
            }
          }
        }
      }
      refreshFOV(st.dungeon, p);
      /* ===== 明かりの魔方陣：FOVオーバーライド（refreshFOV後に適用） ===== */
      if (st.dungeon.pentacles?.length > 0 && p.hp > 0) {
        const _dg3 = st.dungeon;
        const _pRoom3 = findRoom(_dg3.rooms, p.x, p.y);
        for (const _lpc of _dg3.pentacles) {
          if (_lpc.kind !== "light") continue;
          if (_lpc.cursed) {
            /* 呪い：プレイヤーが同じ部屋にいるなら視界を1マスに制限 */
            const _lRoom = findRoom(_dg3.rooms, _lpc.x, _lpc.y);
            if (_pRoom3 && _lRoom && _pRoom3 === _lRoom) {
              for (let _ly = 0; _ly < MH; _ly++)
                for (let _lx = 0; _lx < MW; _lx++)
                  if (Math.abs(_lx - p.x) > 1 || Math.abs(_ly - p.y) > 1) _dg3.visible[_ly][_lx] = false;
            }
          } else if (_lpc.blessed) {
            /* 祝福：フロア全体を可視化 */
            for (let _ly = 0; _ly < MH; _ly++)
              for (let _lx = 0; _lx < MW; _lx++) { _dg3.visible[_ly][_lx] = true; _dg3.explored[_ly][_lx] = true; }
          } else {
            /* 通常：魔方陣と同じ部屋全体を可視化 */
            const _lRoom = findRoom(_dg3.rooms, _lpc.x, _lpc.y);
            if (_lRoom) {
              for (let _ly = _lRoom.y; _ly < _lRoom.y + _lRoom.h; _ly++)
                for (let _lx = _lRoom.x; _lx < _lRoom.x + _lRoom.w; _lx++) { _dg3.visible[_ly][_lx] = true; _dg3.explored[_ly][_lx] = true; }
            }
          }
        }
      }
      {
        const _dg = st.dungeon;
        if (
          _dg.nextSpawnTurn !== undefined &&
          p.turns >= _dg.nextSpawnTurn &&
          p.hp > 0
        ) {
          const _cands = [];
          for (let _sy = 0; _sy < MH; _sy++) {
            for (let _sx = 0; _sx < MW; _sx++) {
              if (_dg.map[_sy][_sx] !== T.FLOOR) continue;
              if (_sx === p.x && _sy === p.y) continue;
              if (monsterAt(_dg, _sx, _sy)) continue;
              /* ビッグルームはプレイヤーから8マス以上離れていれば可 */
              if (_dg.isBigRoom) {
                if (Math.abs(_sx - p.x) + Math.abs(_sy - p.y) < 8) continue;
              } else {
                if (_dg.visible[_sy][_sx]) continue;
              }
              _cands.push([_sx, _sy]);
            }
          }
          if (_cands.length > 0) {
            const [_cx, _cy] = pick(_cands);
            if (_dg.shopTheft) {
              _dg.monsters.push(makeGuard(_cx, _cy, p.x, p.y));
              ml.push("手配犯として警備員が現れた！");
            } else {
              _dg.monsters.push(makeMonster(p.depth, _cx, _cy));
            }
          }
          _dg.nextSpawnTurn = p.turns + (_dg.shopTheft ? rng(5, 15) : hasRingEffect(p, "spawn_ring") ? rng(3, 10) : rng(10, 50));
        }
      }
      if (p.hp <= 0) {
        if ((p.mp || 0) > 0) {
          /* MPが残っていれば残MP分のHPで復活 */
          const revHp = p.mp;
          p.hp = revHp;
          p.mp = 0;
          p.mpCooldownTurns = 1000;
          ml.push(`HPがゼロになった！残りMP${revHp}でHP${revHp}として復活！MPは1000ターン回復しない。`);
        } else {
          ml.push("あなたは死んだ...ゲームオーバー。");
          try {
            const _scores = JSON.parse(localStorage.getItem("roguelike_scores") || "[]");
            _scores.unshift({
              cause: p.deathCause || "不明",
              gold: p.gold,
              level: p.level,
              depth: p.depth,
              turns: p.turns,
              date: new Date().toLocaleDateString("ja-JP"),
            });
            localStorage.setItem("roguelike_scores", JSON.stringify(_scores.slice(0, 20)));
          } catch (_e) {}
          setGameOverSel(0);
          setDead(true);
          setGameOverResult({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: false });
        }
      }
      /* 落下エンティティを次の階に配置 */
      clearPitfallBag();
      if (!st.floors) st.floors = {};
      processPitfallBag(_etPfBag, st.floors, p.depth);
    },
    [moveMons, lu],
  );

  /* auto-advance turns while player is sleeping, paralyzed, or slow-skipping */
  useEffect(() => {
    if (!gs?.player) return;
    const { sleepTurns = 0, paralyzeTurns = 0, slowSkip = false } = gs.player;
    if (sleepTurns <= 0 && paralyzeTurns <= 0 && !slowSkip) return;
    setShowInv(false);
    setThrowMode(null);
    /* Wait for any running animation to finish before advancing */
    const tryAdvance = () => {
      if (!sr.current) return;
      if (animBusyRef.current) {
        /* Animation still running — poll until it finishes */
        setTimeout(tryAdvance, 50);
        return;
      }
      const st = sr.current;
      const { player: p, dungeon: dg } = st;
      if (p.sleepTurns <= 0 && p.paralyzeTurns <= 0 && !p.slowSkip) return;
      const ml = [];
      if (p.sleepTurns > 0) {
        p.sleepTurns--;
        ml.push(p.sleepTurns > 0
          ? `眠っている...あと${p.sleepTurns}ターン`
          : "目が覚めた！");
      } else if (p.paralyzeTurns > 0) {
        p.paralyzeTurns--;
        ml.push(p.paralyzeTurns > 0
          ? `金縛りにあっている...あと${p.paralyzeTurns}ターン`
          : "金縛りが解けた！");
      } else if (p.slowSkip) {
        p.slowSkip = false;
        p.slowTurns = Math.max(0, (p.slowTurns || 0) - 1);
        if (p.slowTurns <= 0) {
          ml.push("鈍足が解けた！");
        } else {
          ml.push("鈍足でターンがスキップされた...");
        }
      }
      endTurn(st, p, ml);
      /* Collect monster move animations from endTurn */
      const _ad = { monMoves: [], monAttacks: [], monDamages: [], monLunges: [] };
      const _monAnimData = monMovesRef.current;
      if (_monAnimData) {
        _ad.monMoves = _monAnimData.moves || [];
        _ad.monAttacks = _monAnimData.attacks || [];
        _ad.monDamages = _monAnimData.damages || [];
        _ad.monLunges = _monAnimData.lunges || [];
        monMovesRef.current = null;
      }
      const _drainedEvts = drainAnims();
      for (const _de of _drainedEvts) {
        if (_de.type === "explosion" || _de.type === "splash") (_ad.explosions = _ad.explosions || []).push(_de);
        else if (_de.type === "monProjectile") (_ad.monProjectiles = _ad.monProjectiles || []).push(_de);
        else if (_de.type === "monProjectileReturn") (_ad.monProjectileReturns = _ad.monProjectileReturns || []).push(_de);
        else if (_de.type === "damage") (_ad.damages = _ad.damages || []).push(_de);
      }
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...st };
      setGs({ ...st });
      const _hasAnim = _ad.monMoves.length || _ad.monAttacks.length || _ad.monDamages.length || _ad.explosions?.length || _ad.monProjectiles?.length || _ad.monProjectileReturns?.length;
      if (_hasAnim) playAnim(_ad);
    };
    const timer = setTimeout(tryAdvance, 400);
    return () => clearTimeout(timer);
  }, [gs, endTurn, playAnim]);

  const act = useCallback(
    (type, dx = 0, dy = 0) => {
      if (dead || !sr.current) return;
      if (animBusyRef.current) return;
      if (revealMode) return;
      if (bigboxModeRef.current) return;
      if (lookMode) return;
      if (springMode) return;
      if (putMode) return;
      if (markerMode) return;
      if (spellListMode) return;
      if (debugSpellMode) return;
      if (throwMode !== null && type !== "inventory") return;
      if (showInv && type !== "inventory") return;
      const st = sr.current,
        { player: p, dungeon: dg } = st;
      let acted = false;
      const ml = [];
      /* Animation data collected during this turn */
      const _ad = { playerMove: null, attacks: [], damages: [], monMoves: [], monAttacks: [], monDamages: [], monLunges: [] };
      const _oldPx = p.x, _oldPy = p.y;
      const doStair = (dir) => {
        const nd = chgFloor(p, dir);
        if (nd) {
          st.dungeon = nd;
          ml.push(`地下${p.depth}階に${dir > 0 ? "降りた" : "昇った"}。`);
          if (nd._firstVisit && FLOOR_TITLES[nd.floorType]) ml.push(FLOOR_TITLES[nd.floorType]);
          acted = true;
        }
      };
      if (p.sleepTurns > 0 || p.paralyzeTurns > 0 || p.slowSkip) return;
      if (type === "inventory") {
        setSpellListMode(false);
        setShowInv((v) => {
          if (v) { dropModeRef.current = false; setDropMode(false); }
          return !v;
        });
        setSelIdx(0);
        setShowDesc(null);
        setThrowMode(null);
        setTimeout(() => ref.current?.focus(), 0);
        return;
      }
      if (p.sleepTurns > 0) {
        p.sleepTurns--;
        ml.push(p.sleepTurns > 0
          ? `眠っている...あと${p.sleepTurns}ターン`
          : "目が覚めた！");
        endTurn(st, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        sr.current = { ...st };
        setGs({ ...st });
        return;
      }
      if (p.paralyzeTurns > 0) {
        p.paralyzeTurns--;
        ml.push(p.paralyzeTurns > 0
          ? `金縛りにあっている...あと${p.paralyzeTurns}ターン`
          : "金縛りが解けた！");
        endTurn(st, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        sr.current = { ...st };
        setGs({ ...st });
        return;
      }
      if (type === "move" && (dx || dy)) {
        /* ===== 移動封じ状態：移動不可（攻撃は可） ===== */
        if ((p.immobileTurns || 0) > 0) {
          const nx0 = p.x + dx, ny0 = p.y + dy;
          const _imMon = monsterAt(dg, nx0, ny0);
          if (!_imMon) {
            /* 移動しようとしたが封じられている（endTurnでカウントダウン） */
            const _imRem = p.immobileTurns - 1;
            endTurn(st, p, ml);
            ml.push(_imRem > 0 ? `移動が封じられている...あと${_imRem}ターン` : "移動封じが解けた！");
            setMsgs((prev) => [...prev.slice(-80), ...ml]);
            sr.current = { ...st };
            setGs({ ...st });
            return;
          }
          /* 攻撃はできる：そのまま攻撃処理へ進む */
        }
        /* ===== 混乱状態：移動方向をランダム化 ===== */
        if ((p.confusedTurns || 0) > 0) {
          const _cdirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
          const _crd = pick(_cdirs);
          dx = _crd[0]; dy = _crd[1];
          ml.push("混乱して違う方向に動いた！");
        }
        const nx = p.x + dx,
          ny = p.y + dy;
        p.facing = { dx, dy };
        if (nx >= 0 && nx < MW && ny >= 0 && ny < MH) {
          const wab = p.weapon?.ability;
          const wabHas = (id) =>
            id === wab || p.weapon?.abilities?.includes(id) || false;
          const mon = monsterAt(dg, nx, ny);
          let reachMon = null;
          if (
            !mon &&
            wabHas("reach") &&
            nx >= 0 &&
            nx < MW &&
            ny >= 0 &&
            ny < MH &&
            dg.map[ny]?.[nx] !== T.WALL && dg.map[ny]?.[nx] !== T.BWALL
          ) {
            const rx = nx + dx,
              ry = ny + dy;
            if (rx >= 0 && rx < MW && ry >= 0 && ry < MH)
              reachMon =
                monsterAt(dg, rx, ry) || null;
          }
          const attackMon = mon || reachMon;
          if (attackMon) {
            if (
              attackMon.type === "shopkeeper" &&
              attackMon.state !== "hostile"
            ) {
              ml.push("店主に話しかけるにはキーで。");
            } else {
              /* 近接命中率95%（必中状態なら100%） */
              const _meleeSureHit = (p.sureHitTurns || 0) > 0;
              if (!_meleeSureHit && Math.random() >= 0.95) {
                ml.push(`${attackMon.name}への攻撃は外れた！`);
                _ad.attacks.push({ type: "attack", x: attackMon.x, y: attackMon.y, dx, dy });
                _ad.damages.push({ type: "miss", x: attackMon.x, y: attackMon.y });
                acted = true;
              } else {
              if (attackMon.paralyzed) {
                attackMon.paralyzed = false;
                ml.push(`${attackMon.name}の金縛りが解けた！`);
              }
              const _ringPowerBonus = (p.rings || []).reduce((s, r) => r.effect === "power_ring" ? s + (r.plus || 0) : s, 0);
              let ap = p.atk + (p.weapon?.atk || 0) + (p.weapon?.plus || 0) + _ringPowerBonus + ((p.spicyAtkTurns || 0) > 0 ? 3 : 0);
              const _checkBane = (a) => a?.startsWith("bane_") && (a === "bane_float" ? attackMon.float : attackMon.kind === a.slice(5));
              const _isBane = _checkBane(wab) || p.weapon?.abilities?.some(a => _checkBane(a));
              if (_isBane) ap *= 2;
              let d = Math.max(1, Math.floor(ap * ap / (ap + attackMon.def)) + rng(-2, 2));
              let crit = false;
              if (wabHas("critical") && Math.random() < 0.25) {
                d *= 2;
                crit = true;
              }
              /* 炎属性武器：油まみれ×2、火ダルマ×0.5 */
              const _hasFireElem = wab === "fire_elem" || p.weapon?.abilities?.some(a => a === "fire_elem");
              if (_hasFireElem) {
                if (attackMon.baseKind === "firedemon") {
                  d = Math.max(1, Math.floor(d * 0.5));
                } else {
                  const _feOily = (attackMon.oilyTurns||0)>0 || dg.oilyTiles?.some(t=>t.x===attackMon.x&&t.y===attackMon.y);
                  if (_feOily) d *= 2;
                }
              }
              /* 氷属性武器：火ダルマ×2 */
              const _hasIceElem = wab === "ice_elem" || p.weapon?.abilities?.some(a => a === "ice_elem");
              if (_hasIceElem && attackMon.baseKind === "firedemon") {
                d *= 2;
              }
              /* 脆弱の魔方陣チェック：祝福4倍/通常2倍/呪い半減 */
              const _vulnRoom = findRoom(dg.rooms, attackMon.x, attackMon.y);
              const _vulnPc = _vulnRoom && dg.pentacles?.find((pc) => pc.kind === "vulnerability" && pc.x >= _vulnRoom.x && pc.x < _vulnRoom.x + _vulnRoom.w && pc.y >= _vulnRoom.y && pc.y < _vulnRoom.y + _vulnRoom.h);
              if (_vulnPc) d = _vulnPc.cursed ? Math.max(1, Math.floor(d / 2)) : d * (_vulnPc.blessed ? 4 : 2);
              /* 壁の中の壁歩きモンスターへの攻撃：ダメージ半減 */
              const _atkInWall = attackMon.wallWalker && dg.map[attackMon.y]?.[attackMon.x] === T.WALL;
              if (_atkInWall) d = Math.max(1, Math.floor(d / 2));
              /* 水晶スライム系：固定ダメージ以外は1ダメージ（近接は非固定扱い） */
              d = clampDmgFixed(attackMon, d, true);
              wakeIfDormant(attackMon, ml);
              attackMon.hp -= d;
              if (attackMon.type === "shopkeeper") {
                attackMon.state = "hostile"; dg.shopTheft = true;
                for (const _ci of p.inventory) { delete _ci.shopPrice; delete _ci._shopId; }
              }
              const atkSfx =
                (crit ? "会心！" : "") +
                (_isBane ? "特効！" : "") +
                (_hasFireElem && attackMon.baseKind === "firedemon" ? "（炎半減）" : "") +
                (_hasFireElem && attackMon.baseKind !== "firedemon" && ((attackMon.oilyTurns||0)>0 || dg.oilyTiles?.some(t=>t.x===attackMon.x&&t.y===attackMon.y)) ? "油まみれ炎×2！" : "") +
                (_hasIceElem && attackMon.baseKind === "firedemon" ? "氷×2！" : "") +
                (_atkInWall ? "（壁越し・半減）" : "");
              ml.push(`${attackMon.name}に${d}ダメージ！${atkSfx}`);
              _ad.attacks.push({ type: "attack", x: attackMon.x, y: attackMon.y, dx, dy });
              _ad.damages.push({ type: "damage", x: attackMon.x, y: attackMon.y, value: d, color: crit ? "#ffff00" : "#ff4444" });
              if (attackMon.hp <= 0) _ad.damages.push({ type: "flash", x: attackMon.x, y: attackMon.y, color: "#ff2200", duration: 150 });
              if (wabHas("knockback") && attackMon.hp > 0) {
                const kx = attackMon.x + dx,
                  ky = attackMon.y + dy;
                if (
                  kx >= 0 &&
                  kx < MW &&
                  ky >= 0 &&
                  ky < MH &&
                  dg.map[ky][kx] !== T.WALL && dg.map[ky][kx] !== T.BWALL &&
                  !dg.monsters.some(
                    (m2) => m2 !== attackMon && m2.x === kx && m2.y === ky,
                  )
                ) {
                  attackMon.x = kx;
                  attackMon.y = ky;
                  ml.push(`${attackMon.name}は吹き飛んだ！`);
                }
              }
              /* 吹き飛ばしの魔方陣：プレイヤーが近接攻撃したモンスターを吹き飛ばす */
              if (attackMon.hp > 0 && dg.pentacles?.length > 0) {
                const _kbRoom = findRoom(dg.rooms, p.x, p.y);
                const _kbPcP = _kbRoom && dg.pentacles.find(pc =>
                  pc.kind === "knockback_aura" && findRoom(dg.rooms, pc.x, pc.y) === _kbRoom);
                if (_kbPcP && !hasGravityPentacle(dg, attackMon.x, attackMon.y)) {
                  const _kbDist = _kbPcP.cursed ? 1 : _kbPcP.blessed ? 99 : 5;
                  let _kbCx = attackMon.x, _kbCy = attackMon.y, _kbMoved = 0;
                  for (let _kbi = 0; _kbi < _kbDist; _kbi++) {
                    const _knx = _kbCx + dx, _kny = _kbCy + dy;
                    if (_knx < 0 || _knx >= MW || _kny < 0 || _kny >= MH || dg.map[_kny][_knx] === T.WALL || dg.map[_kny][_knx] === T.BWALL) {
                      attackMon.hp -= 5; ml.push(`${attackMon.name}は壁に叩きつけられた！5ダメージ！`);
                      break;
                    }
                    if (dg.monsters.some(m2 => m2 !== attackMon && m2.x === _knx && m2.y === _kny)) {
                      attackMon.hp -= 5; ml.push(`${attackMon.name}は別のモンスターに激突した！5ダメージ！`);
                      break;
                    }
                    _kbCx = _knx; _kbCy = _kny; _kbMoved++;
                  }
                  if (_kbMoved > 0) { attackMon.x = _kbCx; attackMon.y = _kbCy; ml.push(`${_kbPcP.name}の力で${attackMon.name}が${_kbMoved}マス吹き飛んだ！`); }
                  if (attackMon.hp <= 0) { trackMonster(attackMon); killMonster(attackMon, dg, p, ml, lu); }
                }
              }
              /* 武器の状態異常付与（10%） */
              if (attackMon.hp > 0 && p.weapon) {
                const _inflicts = [
                  ["inflict_slow",     () => { attackMon.speed = Math.max(0.25, (attackMon.speed || 1) * 0.5); ml.push(`${attackMon.name}は鈍足になった！`); }],
                  ["inflict_paralyze", () => { attackMon.paralyzed = true; ml.push(`${attackMon.name}は金縛りになった！`); }],
                  ["inflict_sleep",    () => { attackMon.sleepTurns = (attackMon.sleepTurns || 0) + rng(3, 6); ml.push(`${attackMon.name}は眠りに落ちた！`); }],
                  ["inflict_darkness", () => { attackMon.blind = true; attackMon.blindTurns = (attackMon.blindTurns || 0) + 50; ml.push(`${attackMon.name}は暗闇になった！`); }],
                  ["inflict_confuse",  () => { attackMon.confusedTurns = (attackMon.confusedTurns || 0) + 20; ml.push(`${attackMon.name}は混乱した！`); }],
                  ["inflict_bewitch",  () => { attackMon.bewitched = true; attackMon.bewitchedTurns = (attackMon.bewitchedTurns || 0) + 50; ml.push(`${attackMon.name}は幻惑状態になった！`); }],
                  ["inflict_seal",     () => { attackMon.sealed = true; attackMon.sealedTurns = (attackMon.sealedTurns || 0) + 50; ml.push(`${attackMon.name}は封印された！`); }],
                ];
                for (const [abId, fn] of _inflicts) {
                  if (wabHas(abId) && Math.random() < 0.1) fn();
                }
              }
              if (attackMon.hp <= 0 && dg.monsters.includes(attackMon)) { trackMonster(attackMon); killMonster(attackMon, dg, p, ml, lu); }
              acted = true;
              } /* end else (hit) */
            }
          } else if (dg.map[ny][nx] === T.WATER && !isPlayerFloating(p, dg)) {
            ml.push("水に阻まれた！浮遊の指輪があれば渡れる。");
          } else if (dg.map[ny][nx] !== T.WALL && dg.map[ny][nx] !== T.BWALL || ((p.wallWalkTurns || 0) > 0 && nx > 0 && nx < MW - 1 && ny > 0 && ny < MH - 1)) {
            /* 呪われた聖域の魔方陣：プレイヤーは通行できない */
            const _cursedSanc = dg.pentacles?.find(pc => pc.kind === "sanctuary" && pc.cursed && pc.x === nx && pc.y === ny);
            if (_cursedSanc) {
              ml.push("呪われた魔方陣が行く手を阻んでいる！");
            } else {
            const _allShopsM = getShops(dg);
            const _wasInShopOf = _allShopsM.filter(s => s.unpaidTotal > 0 && s.room &&
              p.x >= s.room.x && p.x < s.room.x + s.room.w &&
              p.y >= s.room.y && p.y < s.room.y + s.room.h);
            p.x = nx;
            p.y = ny;
            _ad.playerMove = { fromX: _oldPx, fromY: _oldPy, toX: nx, toY: ny };
            for (const _esh of _wasInShopOf) {
              if (!(p.x >= _esh.room.x && p.x < _esh.room.x + _esh.room.w &&
                  p.y >= _esh.room.y && p.y < _esh.room.y + _esh.room.h)) {
                dg.shopTheft = true;
                for (const _ci of p.inventory) { delete _ci.shopPrice; delete _ci._shopId; }
                ml.push("店から盗んで逃げた！");
                break;
              }
            }
            acted = true;
            const tr = checkTrap(p, dg, ml);
            if (tr === "pitfall") {
              const nd = chgFloor(p, 1, true);
              if (nd) {
                st.dungeon = nd;
                ml.push(`地下${p.depth}階に落ちた！`);
              }
            } else if (tr === "deferred_explosion") {
              /* 地雷：モンスター移動後に爆発させる（endTurnで処理） */
              const _mineTrap = dg.traps.find(t => t.x === p.x && t.y === p.y && t.effect === "explode");
              st._pendingMineExplosion = {
                x: p.x, y: p.y,
                name: _mineTrap?.name || "地雷",
                nameFn: (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames),
              };
            }
            autoPickup(p, st.dungeon, ml);
            if (dg.map[p.y][p.x] === T.SD) ml.push("下り階段がある。");
            if (dg.map[p.y][p.x] === T.SU) ml.push("上り階段がある。");
            const _bbStep = st.dungeon.bigboxes?.find(b => b.x === p.x && b.y === p.y);
            if (_bbStep) ml.push(`${_bbStep.name}(${_bbStep.contents?.length || 0}/${_bbStep.capacity})がある。`);
            const _sprStep = st.dungeon.springs?.find((s) => s.x === p.x && s.y === p.y);
            if (_sprStep) ml.push("泉がある。");
            const _pentStep = st.dungeon.pentacles?.find((pc) => pc.x === p.x && pc.y === p.y);
            if (_pentStep) ml.push(`${_pentStep.name}の上にいる。`);
            }
          }
        }
      } else if (type === "wait") acted = true;
      else if (type === "search_traps") {
        const found = [];
        for (let sdx = -1; sdx <= 1; sdx++) {
          for (let sdy = -1; sdy <= 1; sdy++) {
            if (sdx === 0 && sdy === 0) continue;
            const st2 = dg.traps.find(
              (t) => t.x === p.x + sdx && t.y === p.y + sdy && !t.revealed,
            );
            if (st2) {
              st2.revealed = true;
              found.push(st2.name);
            }
          }
        }
        if (found.length > 0) ml.push(`罠を発見！：${found.join("、")}`);
        else ml.push("周囲に罠はない。");
        acted = true;
      } else if (type === "shoot_arrow") {
        if (p.arrow && p.arrow.count > 0) {
          setThrowMode({ idx: -1, mode: "shoot_equipped" });
          setMsgs((prev) => [
            ...prev.slice(-80),
            "矢を射る方向を選んでください...",
          ]);
          sr.current = { ...st };
          setGs({ ...st });
          return;
        } else ml.push("矢を装備していない。");
      } else if (type === "stairs_down") {
        if (dg.map[p.y][p.x] === T.SD) {
          if (isPlayerFloating(p, dg)) {
            ml.push("浮遊しているので階段を降りられない！");
          } else {
            doStair(1);
          }
        } else ml.push("ここに下り階段はない。");
      } else if (type === "stairs_up") {
        if (dg.map[p.y][p.x] === T.SU) {
          if (p.depth === 1) {
            if (onReturnToHub) {
              const _hasGoal = p.inventory.some(it => it.type === "goal");
              onReturnToHub({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: true, returnItems: [...p.inventory], cleared: _hasGoal });
              return;
            }
          } else {
            doStair(-1);
          }
        } else ml.push("ここに上り階段はない。");
      } else if (type === "interact") {
        /* 足元の階段チェック */
        if (dg.map[p.y][p.x] === T.SD) {
          if (isPlayerFloating(p, dg)) {
            ml.push("浮遊しているので階段を降りられない！");
          } else {
            doStair(1);
          }
        } else if (dg.map[p.y][p.x] === T.SU) {
          if (p.depth === 1) {
            if (onReturnToHub) {
              const _hasGoal2 = p.inventory.some(it => it.type === "goal");
              onReturnToHub({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: true, returnItems: [...p.inventory], cleared: _hasGoal2 });
              return;
            }
          } else {
            doStair(-1);
          }
        } else {
          /* 足元の大箱チェック（前方は除く） */
          const bb2 = dg.bigboxes?.find((b) => b.x === p.x && b.y === p.y);
          if (bb2) {
            bigboxRef.current = bb2;
            setBigboxMode("menu"); setBigboxMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), `${bb2.name}(${bb2.contents?.length || 0}/${bb2.capacity})がある。どうする？`]);
            sr.current = { ...st }; setGs({ ...st }); return;
          }
          const spr = dg.springs?.find((s) => s.x === p.x && s.y === p.y);
          if (spr) {
            springTargetRef.current = spr;
            setSpringMode("menu"); setSpringMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), "泉がある。どうする？"]);
            sr.current = { ...st }; setGs({ ...st }); return;
          }
          /* 足元のアイテムを拾う */
          const _grIt = dg.items.find((i) => i.x === p.x && i.y === p.y);
          if (_grIt) {
            if (_grIt.type === "gold") {
              p.gold += _grIt.value;
              ml.push(`${_grIt.value}枚の金貨を拾った！`);
              removeFloorItem(dg, _grIt);
            } else if (_grIt.type === "arrow" && (_grIt.stone || _grIt.magicStone) && !_grIt.shopPrice) {
              if (addStonesInv(p.inventory, _grIt.count, !!_grIt.magicStone, p.maxInventory || 30)) {
                ml.push(`${_grIt.name}(${_grIt.count}個)を拾った。`);
                removeFloorItem(dg, _grIt);
              } else ml.push("持ち物がいっぱいだ！");
            } else if (_grIt.type === "arrow" && !_grIt.shopPrice) {
              if (addArrowsInv(p.inventory, _grIt.count, !!_grIt.poison, !!_grIt.pierce, p.maxInventory || 30, !!_grIt.bombArrow)) {
                ml.push(`${_grIt.name || "矢"}(${_grIt.count}本)を拾った。`);
                removeFloorItem(dg, _grIt);
              } else ml.push("持ち物がいっぱいだ！");
            } else if (p.inventory.length >= (p.maxInventory || 30)) ml.push("持ち物がいっぱいだ！");
            else {
              if (sr.current.allBcKnown) { _grIt.fullIdent = true; _grIt.bcKnown = true; }
              p.inventory.push(_grIt);
              if (_grIt.shopPrice) {
                const _allS2 = getShops(dg);
                const _pickShop = _allS2.find(s => s.id === _grIt._shopId) || _allS2[0];
                if (_pickShop) {
                  const _bargain = hasRingEffect(p, "bargain_ring");
                  const _actualPrice = _bargain ? Math.max(1, Math.floor(_grIt.shopPrice * 0.7)) : _grIt.shopPrice;
                  _pickShop.unpaidTotal += _actualPrice;
                  const _sk2 = dg.monsters.find((m) => m.id === _pickShop.shopkeeperId && m.state === "friendly");
                  if (_sk2) _sk2.state = "blocking";
                  ml.push(`${itemDisplayName(_grIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を取った！(${_actualPrice}G${_bargain ? " 3割引！" : ""}) 店主が入り口をふさいだ。`);
                } else {
                  ml.push(`${itemDisplayName(_grIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を取った！(${_grIt.shopPrice}G) 店主が入り口をふさいだ。`);
                }
              } else {
                const _w2 = _grIt.type === "weapon", _a2 = _grIt.type === "armor";
                let _lbl2 = itemDisplayName(_grIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
                if (_w2 || _a2) {
                  if (_grIt.plus) _lbl2 += (_grIt.plus > 0 ? "+" : "") + _grIt.plus;
                  _lbl2 += _w2 ? " (攻+" + (_grIt.atk + (_grIt.plus || 0)) + ")" : " (防+" + (_grIt.def + (_grIt.plus || 0)) + ")";
                  const _AB2 = _w2 ? WEAPON_ABILITIES : ARMOR_ABILITIES;
                  const _ids2 = [...new Set([...(_grIt.abilities || []), ...(_grIt.ability ? [_grIt.ability] : [])])];
                  const _ns2 = _ids2.map((id) => _AB2.find((a) => a.id === id)?.name).filter(Boolean);
                  if (_ns2.length) _lbl2 += " [" + _ns2.join("・") + "]";
                }
                ml.push(_lbl2 + _itemPickupSuffix(_grIt, sr.current?.ident) + "を拾った。");
              }
              removeFloorItem(dg, _grIt);
            }
            acted = true;
          } else {
            /* 足元の罠を起動 */
            const _trapHere = dg.traps.find((t) => t.x === p.x && t.y === p.y);
            if (_trapHere) {
              if (hasRingEffect(p, "float_ring")) {
                ml.push("浮遊の指輪を付けているので罠を作動させられない！");
              } else {
                const _tnFn = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
                const _tr2 = fireTrapPlayer(_trapHere, p, dg, ml, _tnFn, lu);
                if (_tr2 === "pitfall") {
                  const nd2 = chgFloor(p, 1, true);
                  if (nd2) { st.dungeon = nd2; ml.push(`地下${p.depth}階に落ちた！`); }
                }
              }
              acted = true;
            } else ml.push("ここには何もない。");
          }
        }
      }
      if (acted) {
        /* モンスターハウストリガー */
        triggerMonsterHouse(st.dungeon, p, ml);
        /* 2倍速：1回目の行動はendTurnせず、2回目でendTurn */
        if ((p.hasteTurns || 0) > 0 && !p.hasteUsed) {
          p.hasteUsed = true;
          /* FOVだけ更新して行動完了（モンスターは動かない） */
          refreshFOV(st.dungeon, p);
        } else {
          if (p.hasteUsed) p.hasteUsed = false;
          endTurn(st, p, ml);
          /* 2倍速ターン減少：endTurnした時（2回目の行動後）のみ消費 */
          if ((p.hasteTurns || 0) > 0) {
            p.hasteTurns--;
            if (p.hasteTurns <= 0) { p.hasteUsed = false; ml.push("2倍速が解けた！"); }
          }
        }
        /* 鈍足：行動後に次のターンをスキップ予約 */
        if ((p.slowTurns || 0) > 0) {
          p.slowTurns--;
          if (p.slowTurns > 0) {
            p.slowSkip = true;
          } else {
            ml.push("鈍足が解けた！");
          }
        }
        /* 混乱：行動後にターン数を減らす */
        if ((p.confusedTurns || 0) > 0) {
          p.confusedTurns--;
          if (p.confusedTurns <= 0) ml.push("混乱が解けた！");
        }
        /* 暗闇：視界が1マスになる */
        if ((p.darknessTurns || 0) > 0) {
          p.darknessTurns--;
          if (p.darknessTurns <= 0) ml.push("暗闇が晴れた！視界が戻った！");
        }
        /* 幻惑：周囲の見た目が狂う */
        if ((p.bewitchedTurns || 0) > 0) {
          p.bewitchedTurns--;
          if (p.bewitchedTurns <= 0) ml.push("幻惑が解けた！周囲の見た目が正常に戻った！");
        }
        /* モンスター感知 */
        if ((p.monsterSenseTurns || 0) > 0) {
          p.monsterSenseTurns--;
          if (p.monsterSenseTurns <= 0) ml.push("モンスター感知が切れた！");
        }
        /* 状態異常防止 */
        if ((p.statusImmune || 0) > 0) {
          p.statusImmune--;
          if (p.statusImmune <= 0) ml.push("状態防止が切れた！");
        }
        /* 必中 */
        if ((p.sureHitTurns || 0) > 0) {
          p.sureHitTurns--;
          if (p.sureHitTurns <= 0) ml.push("必中状態が切れた！");
        }
        /* 攻撃力ブースト（唐辛子等） */
        if ((p.spicyAtkTurns || 0) > 0) {
          p.spicyAtkTurns--;
          if (p.spicyAtkTurns <= 0) ml.push("辛さによる攻撃力ブーストが切れた！");
        }
      }
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      /* Collect monster animation data from endTurn */
      const _monAnimData = monMovesRef.current;
      if (_monAnimData) {
        _ad.monMoves = _monAnimData.moves || [];
        _ad.monAttacks = _monAnimData.attacks || [];
        _ad.monDamages = _monAnimData.damages || [];
        _ad.monLunges = _monAnimData.lunges || [];
        monMovesRef.current = null;
      }
      /* Drain global animation events (projectiles, explosions from deeply nested logic) */
      const _drainedEvts = drainAnims();
      for (const _de of _drainedEvts) {
        if (_de.type === "projectile") (_ad.projectiles = _ad.projectiles || []).push(_de);
        else if (_de.type === "projectileReturn") (_ad.projectileReturns = _ad.projectileReturns || []).push(_de);
        else if (_de.type === "monProjectile") (_ad.monProjectiles = _ad.monProjectiles || []).push(_de);
        else if (_de.type === "monProjectileReturn") (_ad.monProjectileReturns = _ad.monProjectileReturns || []).push(_de);
        else if (_de.type === "explosion" || _de.type === "splash") (_ad.explosions = _ad.explosions || []).push(_de);
        else if (_de.type === "damage") _ad.damages.push(_de);
        else if (_de.type === "flash") (_ad.flashes = _ad.flashes || []).push(_de);
      }
      sr.current = { ...st };
      setGs({ ...st });
      /* Play animations if any were queued */
      const _hasAnim = _ad.playerMove || _ad.attacks.length || _ad.damages.length || _ad.monMoves.length || _ad.monAttacks.length || _ad.monDamages.length || (_ad.projectiles && _ad.projectiles.length) || (_ad.projectileReturns && _ad.projectileReturns.length) || (_ad.explosions && _ad.explosions.length) || (_ad.monProjectiles && _ad.monProjectiles.length) || (_ad.monProjectileReturns && _ad.monProjectileReturns.length);
      if (_hasAnim) playAnim(_ad);
    },
    [
      dead,
      showInv,
      throwMode,
      springMode,
      putMode,
      markerMode,
      moveMons,
      chgFloor,
      autoPickup,
      checkTrap,
      lu,
      endTurn,
      revealMode,
      lookMode,
      playAnim,
    ],
  );
  /* 目の前を調べる（zキー・モバイル調べるボタン共通） */
  const doExamineFront = useCallback(() => {
    if (!sr.current) return;
    if (lookMode) return;
    if (bigboxModeRef.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const fd = p.facing || { dx: 0, dy: 1 };
    const nx = p.x + fd.dx, ny = p.y + fd.dy;
    const mon = monsterAt(dg, nx, ny);
    if (mon) {
      if (mon.type === "shopkeeper" && mon.state !== "hostile") {
        if (sr.current?.dungeon?.shop) {
          const dg6 = sr.current.dungeon;
          const fis2 = dg6.items.filter(
            (i) => !i.shopPrice && i.x >= dg6.shop.room.x && i.x < dg6.shop.room.x + dg6.shop.room.w &&
              i.y >= dg6.shop.room.y && i.y < dg6.shop.room.y + dg6.shop.room.h,
          );
          if (fis2.length > 0) {
            setShopMode("sell"); setShopMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), "店主：「買い取りましょうか？」"]);
          } else if (dg6.shop.unpaidTotal > 0) {
            setShopMode("pay"); setShopMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), `店主：「お代は${dg6.shop.unpaidTotal}Gです。」`]);
          } else {
            setShopMode("browse"); setShopMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), "店主：「いらっしゃいませ！」"]);
          }
        }
      } else act("move", fd.dx, fd.dy);
    } else {
      /* BWALLチェックを最優先（大箱・泉の上に壁がある場合は壁破壊のみ） */
      if (ny > 0 && ny < MH - 1 && nx > 0 && nx < MW - 1 && dg.map[ny]?.[nx] === T.BWALL) {
        dg.map[ny][nx] = T.FLOOR;
        wallBreakDrop(dg, nx, ny);
        act("wait");
        setMsgs((prev) => [...prev.slice(-80), "壁を叩き壊した！"]);
      } else if (ny > 0 && ny < MH - 1 && nx > 0 && nx < MW - 1 && dg.map[ny]?.[nx] === T.WALL) {
        const _pweapon = sr.current.player.weapon;
        if (hasAbility(_pweapon, "pickaxe")) {
          /* つるはし：壁を掘る */
          dg.map[ny][nx] = T.FLOOR;
          _pweapon.durability = (_pweapon.durability ?? 1) - 1;
          wallBreakDrop(dg, nx, ny);
          if (_pweapon.durability <= 0) {
            const _pkName = _pweapon.name;
            sr.current.player.weapon = null;
            const _pkIdx = sr.current.player.inventory.findIndex(i => i === _pweapon);
            if (_pkIdx !== -1) sr.current.player.inventory.splice(_pkIdx, 1);
            act("wait");
            setMsgs((prev) => [...prev.slice(-80), `壁を掘った！${_pkName}が壊れてしまった！`]);
          } else {
            act("wait");
            setMsgs((prev) => [...prev.slice(-80), `壁を掘った！(耐久: ${_pweapon.durability})`]);
          }
        } else {
          act("wait");
          setMsgs((prev) => [...prev.slice(-80), "壁を叩いた。ゴツン！"]);
        }
      } else {
        const spr = dg.springs?.find((s) => s.x === nx && s.y === ny);
        const bb6 = dg.bigboxes?.find((b) => b.x === nx && b.y === ny);
        if (spr) {
          springTargetRef.current = spr;
          setSpringMode("menu"); setSpringMenuSel(0);
          setMsgs((prev) => [...prev.slice(-80), "泉がある。どうする？"]);
        } else if (bb6) {
          bigboxRef.current = bb6;
          setBigboxMode("menu"); setBigboxMenuSel(0);
          setMsgs((prev) => [...prev.slice(-80), `${bb6.name}(${bb6.contents?.length || 0}/${bb6.capacity})がある。どうする？`]);
        } else {
          setMsgs((prev) => [...prev.slice(-80), "何もない。"]);
        }
      }
    }
  }, [act, lookMode]);
  const doDash = useCallback(
    (dx, dy) => {
      if (dead || !sr.current) return;
      if (animBusyRef.current) return;
      if (springMode || putMode || markerMode || spellListMode || debugSpellMode || throwMode || showInv || lookMode) return;
      const st = sr.current,
        { player: p, dungeon: dg } = st;
      if (p.sleepTurns > 0 || p.paralyzeTurns > 0 || (p.slowTurns || 0) > 0 || (p.confusedTurns || 0) > 0) return;
      const ml = [];
      let steps = 0;
      /* ダッシュ用座標マップ構築 */
      const _dk = (x, y) => y * MW + x;
      const _dRoomSet = new Set();
      for (const r of (dg.rooms || [])) { for (let ry = r.y; ry < r.y + r.h; ry++) for (let rx = r.x; rx < r.x + r.w; rx++) _dRoomSet.add(_dk(rx, ry)); }
      const startInRoom = _dRoomSet.has(_dk(p.x, p.y));
      const getP = (x, y) =>
        (dx !== 0
          ? [
              [0, -1],
              [0, 1],
            ]
          : [
              [-1, 0],
              [1, 0],
            ]
        ).filter(([sdx, sdy]) => {
          const sx = x + sdx,
            sy = y + sdy;
          return (
            sx >= 0 &&
            sx < MW &&
            sy >= 0 &&
            sy < MH &&
            dg.map[sy][sx] !== T.WALL && dg.map[sy][sx] !== T.BWALL
          );
        }).length;
      let prevPerps = getP(p.x, p.y);

      const _dItemMap = new Map(); for (const i of dg.items) { if (!_dItemMap.has(_dk(i.x, i.y))) _dItemMap.set(_dk(i.x, i.y), i); }
      const _dTrapMap = new Map(); for (const t of dg.traps) _dTrapMap.set(_dk(t.x, t.y), t);
      const _dSprMap = new Map(); if (dg.springs) for (const s of dg.springs) _dSprMap.set(_dk(s.x, s.y), s);
      const _dBbMap = new Map(); if (dg.bigboxes) for (const b of dg.bigboxes) _dBbMap.set(_dk(b.x, b.y), b);
      const _dPentMap = new Map(); if (dg.pentacles) for (const pc of dg.pentacles) _dPentMap.set(_dk(pc.x, pc.y), pc);
      while (steps < 50) {
        const nx = p.x + dx,
          ny = p.y + dy;
        if (
          nx < 0 ||
          nx >= MW ||
          ny < 0 ||
          ny >= MH ||
          dg.map[ny][nx] === T.WALL || dg.map[ny][nx] === T.BWALL
        )
          break;
        if (monsterAt(dg, nx, ny)) break;
        { const _dpc = _dPentMap.get(_dk(nx, ny)); if (_dpc?.kind === "sanctuary" && _dpc.cursed) break; }
        const _allShopsD = getShops(dg);
        const _wasInShopDOf = _allShopsD.filter(s => s.unpaidTotal > 0 && s.room &&
          p.x >= s.room.x && p.x < s.room.x + s.room.w &&
          p.y >= s.room.y && p.y < s.room.y + s.room.h);
        p.x = nx;
        p.y = ny;
        for (const _eshD of _wasInShopDOf) {
          if (!(p.x >= _eshD.room.x && p.x < _eshD.room.x + _eshD.room.w &&
              p.y >= _eshD.room.y && p.y < _eshD.room.y + _eshD.room.h)) {
            dg.shopTheft = true;
            for (const _ci of p.inventory) { delete _ci.shopPrice; delete _ci._shopId; }
            ml.push("店から盗んで逃げた！");
            break;
          }
        }
        steps++;
        const tr = checkTrap(p, dg, ml, true);
        if (tr === "pitfall") {
          const nd = chgFloor(p, 1, true);
          if (nd) {
            st.dungeon = nd;
            ml.push(`地下${p.depth}階に落ちた！`);
          }
          endTurn(st, p, ml);
          break;
        }
        if (tr === "deferred_explosion") {
          const _mineTrapD = dg.traps.find(t => t.x === p.x && t.y === p.y && t.effect === "explode");
          st._pendingMineExplosion = {
            x: p.x, y: p.y,
            name: _mineTrapD?.name || "地雷",
            nameFn: (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames),
          };
          endTurn(st, p, ml);
          break;
        }
        if (tr) {
          endTurn(st, p, ml);
          break;
        }
        const _dashRevTrap = (() => { const _t = _dTrapMap.get(_dk(p.x, p.y)); return _t?.revealed ? _t : undefined; })();
        if (_dashRevTrap) {
          if (hasGravityPentacle(dg, p.x, p.y)) {
            /* 重力の魔方陣の影響下：既知の罠も作動させる */
            const _nameFn2 = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
            const _gtr = fireTrapPlayer(_dashRevTrap, p, dg, ml, _nameFn2, lu);
            const _gravTrBreakChance = (_dashRevTrap.effect === "steal_trap" || _dashRevTrap.effect === "summon_trap") ? 0.5 : 0.25;
            if (!_dashRevTrap.permanent && Math.random() < _gravTrBreakChance) {
              dg.traps = dg.traps.filter(t => t !== _dashRevTrap);
              ml.push(`${_dashRevTrap.name}は壊れた。`);
            }
            if (_gtr === "pitfall") {
              const nd = chgFloor(p, 1, true);
              if (nd) { st.dungeon = nd; ml.push(`地下${p.depth}階に落ちた！`); }
            } else if (_gtr === "deferred_explosion") {
              st._pendingMineExplosion = { x: p.x, y: p.y, name: _dashRevTrap.name, nameFn: _nameFn2 };
            }
          } else {
            ml.push(`${_dashRevTrap.name}がある。`);
          }
          endTurn(st, p, ml);
          break;
        }
        {
          const _dashIt = _dItemMap.get(_dk(p.x, p.y));
          if (_dashIt) {
            const _w = _dashIt.type === "weapon", _a = _dashIt.type === "armor";
            let _lbl = itemDisplayName(_dashIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
            if (_w || _a) {
              if (_dashIt.plus) _lbl += (_dashIt.plus > 0 ? "+" : "") + _dashIt.plus;
              _lbl += _w
                ? " (攻+" + (_dashIt.atk + (_dashIt.plus || 0)) + ")"
                : " (防+" + (_dashIt.def + (_dashIt.plus || 0)) + ")";
              const _AB2 = _w ? WEAPON_ABILITIES : ARMOR_ABILITIES;
              const _ids2 = [...new Set([...(_dashIt.abilities || []), ...(_dashIt.ability ? [_dashIt.ability] : [])])];
              const _ns2 = _ids2.map((id) => _AB2.find((a) => a.id === id)?.name).filter(Boolean);
              if (_ns2.length) _lbl += " [" + _ns2.join("・") + "]";
            } else if (_dashIt.type === "arrow") {
              _lbl += `(${_dashIt.count}${_dashIt.stone || _dashIt.magicStone ? "個" : "本"})`;
            } else if (_dashIt.type === "gold") {
              _lbl += `(${_dashIt.count}枚)`;
            }
            ml.push(_lbl + _itemPickupSuffix(_dashIt, sr.current?.ident) + "がある。");
            endTurn(st, p, ml);
            break;
          }
        }
        if (dg.map[p.y][p.x] === T.SD) {
          ml.push("下り階段がある。");
          endTurn(st, p, ml);
          break;
        }
        if (dg.map[p.y][p.x] === T.SU) {
          ml.push("上り階段がある。");
          endTurn(st, p, ml);
          break;
        }
        const _dashSpr = _dSprMap.get(_dk(p.x, p.y));
        if (_dashSpr) {
          ml.push("泉がある。");
          endTurn(st, p, ml);
          break;
        }
        const _dashBb = _dBbMap.get(_dk(p.x, p.y));
        if (_dashBb) {
          ml.push(`${_dashBb.name}(${_dashBb.contents?.length || 0}/${_dashBb.capacity})がある。`);
          endTurn(st, p, ml);
          break;
        }
        const curInRoom = _dRoomSet.has(_dk(p.x, p.y));
        const curPerps = getP(p.x, p.y);
        const fnx = p.x + dx,
          fny = p.y + dy;
        const blocked =
          fnx < 0 ||
          fnx >= MW ||
          fny < 0 ||
          fny >= MH ||
          dg.map[fny][fnx] === T.WALL || dg.map[fny][fnx] === T.BWALL ||
          !!monsterAt(dg, fnx, fny);
        const _hpBefore = p.hp;
        endTurn(st, p, ml);
        if (p.hp <= 0 || p.hp < _hpBefore || p.sleepTurns > 0 || p.paralyzeTurns > 0) break;
        /* endTurn後にモンスターが移動している可能性があるため再チェック */
        const blockedAfter = blocked || !!monsterAt(dg, fnx, fny);
        if (startInRoom) {
          if (!curInRoom || blockedAfter) break;
        } else {
          if ((curPerps > prevPerps && curPerps > 0) || blockedAfter) break;
        }
        prevPerps = curPerps;
      }
      if (steps > 0) {
        p.facing = { dx, dy };
        setDashMode(false);
        if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
        sr.current = { ...st };
        setGs({ ...st });
      } else {
        setMsgs((prev) => [...prev.slice(-80), "進めない。"]);
        setDashMode(false);
      }
    },
    [
      dead,
      springMode,
      putMode,
      markerMode,
      throwMode,
      showInv,
      checkTrap,
      chgFloor,
      endTurn,
    ],
  );
  const springTryDry = useCallback((dg, p, ml) => {
    if (Math.random() < 0.25) {
      const sprTarget = springTargetRef.current;
      springTargetRef.current = null;
      const spr =
        sprTarget || dg.springs?.find((s) => s.x === p.x && s.y === p.y);
      if (spr) {
        dg.springs = dg.springs.filter((s) => s !== spr);
        if (spr.contents?.length > 0) {
          ml.push("泉が干上がり、中のアイテムが現れた！");
          const ft = new Set();
          for (const item of spr.contents)
            placeItemAt(dg, spr.x, spr.y, item, ml, ft);
        }
        ml.push("泉は干上がってしまった...");
      }
    }
  }, []);
  const breakBigbox = useCallback((bb, dg, ml) => {
    ml.push(`${bb.name}が壊れた！中身がばらまかれた！`);
    const ft = new Set();
    for (const item of bb.contents) placeItemAt(dg, bb.x, bb.y, item, ml, ft);
    dg.bigboxes = dg.bigboxes.filter((b) => b !== bb);
  }, []);
  const trySynthesize = useCallback(
    (bb, ml) => {
      /* 力・守り・命の指輪（異種混合OK） → 先に入れた指輪に後の+値を加算して後を消す */
      const _PLUS_RING_EFFECTS = ["power_ring", "defense_ring", "life_ring"];
      const _plusRings = bb.contents.filter(i => i.type === "ring" && _PLUS_RING_EFFECTS.includes(i.effect));
      if (_plusRings.length >= 2) {
        const [ra, rb] = _plusRings;
        ra.plus = (ra.plus || 0) + (rb.plus || 0);
        ml.push(`合成完了！${ra.name}の＋値が増えた！(+${ra.plus})`);
        bb.contents = bb.contents.filter(i => i !== rb);
        bb.capacity = bb.contents.length;
        return;
      }
      const mks = bb.contents.filter((i) => i.type === "marker");
      if (mks.length >= 2) {
        const [mb, mm] = mks;
        const add = mm.charges || 0;
        mb.charges = (mb.charges || 0) + add;
        ml.push(
          `合成完了！${mb.name}の容量が${add}増えた！(${mb.charges}回)`,
        );
        bb.contents = bb.contents.filter((i) => i !== mm);
        bb.capacity = bb.contents.length;
        return;
      }
      const pns = bb.contents.filter((i) => i.type === "pen");
      if (pns.length >= 2) {
        const [pb, pm] = pns;
        if (pb.effect === pm.effect) {
          const add = pm.charges || 0;
          pb.charges = (pb.charges || 0) + add;
          ml.push(`合成完了！${pb.name}の回数が${add}増えた！(${pb.charges}回)`);
          bb.contents = bb.contents.filter((i) => i !== pm);
          bb.capacity = bb.contents.length;
        } else {
          const add = Math.max(1, Math.floor((pm.charges || 0) / 2));
          pb.charges = (pb.charges || 0) + add;
          ml.push(`${pm.name}の回数の半分が${pb.name}に加算された！(+${add}回 → ${pb.charges}回)`);
          bb.contents = bb.contents.filter((i) => i !== pm);
          bb.capacity = bb.contents.length;
        }
        return;
      }
      const wds = bb.contents.filter((i) => i.type === "wand");
      if (wds.length >= 2) {
        const [wb, wm] = wds;
        if (wb.name === wm.name) {
          wb.charges = (wb.charges || 0) + (wm.charges || 0);
          ml.push(
            `合成完了！${wb.name}の回数が${wm.charges}増えた！(${wb.charges}回)`,
          );
        } else {
          const _ad = Math.max(1, Math.floor((wm.charges || 0) / 2));
          wb.charges = (wb.charges || 0) + _ad;
          ml.push(
            `合成完了！${wb.name}の回数が${_ad}増えた！(${wb.charges}回)`,
          );
        }
        bb.contents = bb.contents.filter((i) => i !== wm);
        bb.capacity = bb.contents.length;
        return;
      }
      /* 杖 + 武器/防具 → 状態異常アビリティ付与 */
      const _WAND_SYNTH = {
        slow:     { weapon: "inflict_slow",     armor: "slow_proof" },
        paralyze: { weapon: "inflict_paralyze", armor: "paralyze_proof" },
        sleep:    { weapon: "inflict_sleep",    armor: "sleep_proof" },
        darkness: { weapon: "inflict_darkness", armor: "darkness_proof" },
        confuse:  { weapon: "inflict_confuse",  armor: "confuse_proof" },
        bewitch:  { weapon: "inflict_bewitch",  armor: "bewitch_proof" },
        seal:     { weapon: "inflict_seal",     armor: "seal_proof" },
      };
      const _swWand = bb.contents.find(i => i.type === "wand" && _WAND_SYNTH[i.effect]);
      const _swEquip = _swWand && bb.contents.find(i => i !== _swWand && (i.type === "weapon" || i.type === "armor"));
      if (_swWand && _swEquip) {
        const _swEntry = _WAND_SYNTH[_swWand.effect];
        const _swAbId = _swEquip.type === "weapon" ? _swEntry.weapon : _swEntry.armor;
        const _toAbs = (it) => [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])].filter(Boolean))];
        const _curAbs = _toAbs(_swEquip);
        if (_curAbs.includes(_swAbId)) {
          ml.push(`${_swEquip.name}には既にその能力がある。合成できなかった。`);
        } else {
          const _newAbs = [..._curAbs, _swAbId];
          const merged = { ..._swEquip, id: uid(), ability: _newAbs[0], abilities: _newAbs };
          bb.contents = bb.contents.filter(i => i !== _swWand && i !== _swEquip);
          bb.contents.push(merged);
          bb.capacity = bb.contents.length;
          const _AB = _swEquip.type === "weapon" ? WEAPON_ABILITIES : ARMOR_ABILITIES;
          const _abName = _AB.find(a => a.id === _swAbId)?.name || _swAbId;
          ml.push(`合成完了！${_swEquip.name}に${_swWand.name}の力が宿った！[${_abName}]`);
        }
        return;
      }
      /* 壺同士の合成 */
      const pts = bb.contents.filter((i) => i.type === "pot");
      if (pts.length >= 2) {
        const [pa, pb] = pts;
        if (pa.potEffect === pb.potEffect) {
          /* 同種の壺：容量を加算 */
          const add = pb.capacity || 0;
          pa.capacity = (pa.capacity || 0) + add;
          ml.push(`合成完了！${pa.name}の容量が${add}増えた！(容量${pa.capacity})`);
        } else {
          /* 別種の壺：容量を1増加 */
          pa.capacity = (pa.capacity || 0) + 1;
          ml.push(`合成完了！${pa.name}の容量が1増えた！(容量${pa.capacity})`);
        }
        bb.contents = bb.contents.filter((i) => i !== pb);
        bb.capacity = bb.contents.length;
        return;
      }
      const ws = bb.contents.filter((i) => i.type === "weapon");
      const as = bb.contents.filter((i) => i.type === "armor");
      const pair = ws.length >= 2 ? ws : as.length >= 2 ? as : null;
      if (!pair) return;
      const [base, mat] = pair;
      const _toAA = (it) => [
        ...new Set(
          [...(it.abilities || []), ...(it.ability ? [it.ability] : [])].filter(
            Boolean,
          ),
        ),
      ];
      const _mabs = [...new Set([..._toAA(base), ..._toAA(mat)])];
      const merged = {
        ...base,
        id: uid(),
        plus: (base.plus || 0) + (mat.plus || 0),
        ability: _mabs[0] || undefined,
        abilities: _mabs.length ? _mabs : undefined,
      };
      /* 短剣の合成カウント: 短剣同士なら加算、短剣+他なら消失 */
      if (base.name === "短剣" && mat.name === "短剣") {
        merged.daggerMerge = (base.daggerMerge || 1) + (mat.daggerMerge || 1);
      } else {
        delete merged.daggerMerge;
      }
      /* pickaxe能力を持つ場合、耐久値をベース/素材から引き継ぐ */
      if (_mabs.includes("pickaxe")) {
        merged.durability = merged.durability ?? mat.durability ?? 30;
      } else {
        delete merged.durability;
      }
      bb.contents = bb.contents.filter((i) => i !== base && i !== mat);
      /* 短剣カウントが3以上なら猫の爪に変化 */
      if (merged.daggerMerge >= 3) {
        const _catAbilities = [...new Set([...(_mabs || []), CAT_CLAW_T.ability])];
        const _catClaw = { ...CAT_CLAW_T, id: uid(), plus: merged.plus, ability: _catAbilities[0], abilities: _catAbilities };
        bb.contents.push(_catClaw);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！短剣が融合して猫の爪に変化した！`);
      } else {
        bb.contents.push(merged);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！${base.name}と${mat.name}が融合した！`);
      }
    },
    [uid],
  );
  const bigboxAddItem = useCallback(
    (bb, item, dg, ml) => {
      const wasFull = bb.contents.length >= bb.capacity;
      bb.contents.push(item);
      const _idn = itemDisplayName(item, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
      ml.push(
        `${_idn}を${bb.name}に入れた。(${bb.contents.length}/${bb.capacity})`,
      );
      if (bb.kind === "synthesis") {
        trySynthesize(bb, ml);
      } else if (bb.kind === "change" && item.type === "goal") {
        ml.push(`${item.name}は変化しなかった！`);
      } else if (bb.kind === "change") {
        const kinds = ["potion", "weapon", "armor", "food", "wand", "arrow", "pot"];
        const rt = pick(kinds);
        let nit;
        if (rt === "food") {
          nit = { ...genFood(), id: uid() };
        } else if (rt === "wand") {
          const wt = pick(WANDS);
          nit = { ...wt, id: uid() };
        } else if (rt === "arrow") {
          nit = makeArrow(rng(3, 15));
        } else if (rt === "pot") {
          nit = makePot();
        } else {
          const pool = ITEMS.filter((i) => i.type === rt);
          nit = {
            ...(pool.length
              ? pick(pool)
              : pick(ITEMS)),
            id: uid(),
          };
        }
        const idx = bb.contents.indexOf(item);
        if (idx >= 0) bb.contents[idx] = nit;
        ml.push(`${_idn}が${itemDisplayName(nit, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}に変化した！`);
      } else if (bb.kind === "enhance") {
        if (item.type === "weapon" || item.type === "armor" || (item.type === "ring" && ["power_ring", "defense_ring", "life_ring"].includes(item.effect))) {
          const before = item.plus || 0;
          item.plus = before + 1;
          const fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
          ml.push(`${item.name}が強化された！(${fp(before)}→${fp(item.plus)})`);
        } else if (item.type === "pot") {
          item.capacity = (item.capacity || 1) + 1;
          ml.push(`${_idn}の容量が1増えた！(${item.capacity})`);
        } else {
          ml.push(`${_idn}には効果がなかった。`);
        }
      } else if (bb.kind === "satiety") {
        if (item.type === "food") {
          const szLevels = item.cooked
            ? [
                { l: "一口", v: 10 },
                { l: "小盛り", v: 20 },
                { l: "普通の", v: 35 },
                { l: "大盛り", v: 55 },
                { l: "特盛り", v: 80 },
                { l: "爆盛り", v: 120 },
              ]
            : [
                { l: "極小の", v: 10 },
                { l: "小さい", v: 20 },
                { l: "普通の", v: 35 },
                { l: "大きい", v: 55 },
                { l: "特大", v: 80 },
                { l: "超特大", v: 120 },
              ];
          let upgraded = false;
          const _hasSzLabel = item.sizeLabel !== undefined;
          for (let si = 0; si < szLevels.length - 1; si++) {
            const curL = szLevels[si].l;
            const matches = _hasSzLabel ? item.sizeLabel === curL : item.name.includes(curL);
            if (matches) {
              const oldName = item.name;
              const cur = szLevels[si];
              const next = szLevels[si + 1];
              if (_hasSzLabel && item._foodBase && item._foodEfLabel) {
                /* 新形式：effectLabel + (sizeLabel ≠ 普通の ? sizeLabel : "") + baseName で再構築 */
                const efStart = item.name.indexOf(item._foodEfLabel);
                const cookPfx = efStart > 0 ? item.name.slice(0, efStart) : "";
                item.name = cookPfx + item._foodEfLabel + (next.l === "普通の" ? "" : next.l) + item._foodBase;
              } else {
                /* 旧形式または_foodBase未保持：名前の文字列置換 */
                item.name = item.name.replace(cur.l, next.l === "普通の" ? "" : next.l);
              }
              item.sizeLabel = next.l;
              item.value = Math.round((item.value * next.v) / cur.v);
              ml.push(`${oldName}が大きくなった！→${item.name}`);
              upgraded = true;
              break;
            }
          }
          if (!upgraded) ml.push(`${item.name}はすでに最大サイズだ。`);
        } else {
          ml.push(`${_idn}には効果がなかった。`);
        }
      } else if (bb.kind === "refill") {
        if (item.type === "wand") {
          const add = rng(1, 3);
          item.charges = (item.charges || 0) + add;
          ml.push(`${_idn}の回数が${add}増えた！(${item.charges}回)`);
        } else if (item.type === "marker") {
          const add = rng(1, 2);
          item.charges = (item.charges || 0) + add;
          ml.push(`${item.name}のインクが${add}回分補充された！(${item.charges}回)`);
        } else if (item.type === "pen") {
          item.charges = (item.charges || 0) + 1;
          ml.push(`${item.name}のインクが1回分補充された！(${item.charges}回)`);
        } else {
          ml.push(`${_idn}には効果がなかった。`);
        }
      } else if (bb.kind === "identify") {
        const _ik = getIdentKey(item);
        if (_ik && !sr.current.ident.has(_ik)) {
          sr.current.ident.add(_ik);
          item.bcKnown = true;
          item.fullIdent = true;
          const _realName = itemDisplayName(item, sr.current.fakeNames, sr.current.ident, sr.current.nicknames);
          ml.push(`${_idn}は${_realName}だと判明した！`);
        } else if (item.type === "weapon" || item.type === "armor") {
          item.bcKnown = true;
          item.fullIdent = true;
          ml.push(`${_idn}の詳細が判明した！`);
        } else {
          item.bcKnown = true;
          ml.push(`${_idn}は既に知っているものだった。`);
        }
      } else if (bb.kind === "split") {
        if (item.type === "gold" || item.type === "goal") {
          ml.push(`${_idn}は分裂しなかった。`);
        } else {
          const _clone = { ...item, id: uid() };
          if (_clone.abilities) _clone.abilities = [..._clone.abilities];
          if (_clone.contents) _clone.contents = [..._clone.contents];
          /* +値は半減 */
          if ((_clone.plus || 0) !== 0) _clone.plus = Math.floor(_clone.plus / 2);
          if ((item.plus || 0) !== 0) item.plus = Math.floor(item.plus / 2);
          /* 矢・石は数量半減 */
          if (item.count > 1) {
            const half = Math.floor(item.count / 2);
            item.count = item.count - half;
            _clone.count = half;
          }
          bb.contents.push(_clone);
          const _cName = itemDisplayName(_clone, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
          ml.push(`${_idn}が分裂した！${_cName}が現れた！`);
        }
      } else if (bb.kind === "bless") {
        if (item.type === "goal") {
          ml.push(`${_idn}には効果がなかった。`);
        } else if (item.type === "pot") {
          item.capacity = (item.capacity || 1) + 1;
          ml.push(`${_idn}の容量が1増えた！(${item.capacity})`);
        } else {
          item.blessed = true;
          item.cursed = false;
          item.bcKnown = true;
          ml.push(`${_idn}が祝福された！【祝】`);
        }
      }
      if (wasFull || bb.contents.length > bb.capacity) breakBigbox(bb, dg, ml);
    },
    [trySynthesize, breakBigbox],
  );
  const springDrink = useCallback(() => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const ml = ["泉の水を飲んだ。"];
    const r = Math.random();
    if (r < 0.3) {
      const h = rng(5, 15);
      const ah = Math.min(h, p.maxHp - p.hp);
      p.hp += ah;
      ml.push(`体に活力が戻った。HP+${ah}`);
    } else if (r < 0.5) {
      p.atk += 1;
      ml.push("力が湧いてきた！攻撃力+1");
    } else if (r < 0.65) {
      p.def += 1;
      ml.push("体が強くなった気がする。防御力+1");
    } else if (r < 0.8) {
      p.maxHp += 3;
      p.hp += 3;
      ml.push("生命力が満ちてきた。最大HP+3");
    } else if (r < 0.9) {
      p.hunger = Math.min(p.maxHunger, p.hunger + 20);
      ml.push("喉が潤った。");
    } else {
      const d = rng(3, 8);
      p.deathCause = "苦い泉水により";
      p.hp -= d;
      ml.push(`苦い...！${d}ダメージ！`);
    }
    springTryDry(dg, p, ml);
    endTurn(sr.current, p, ml);
    setMsgs((prev) => [...prev.slice(-80), ...ml]);
    setSpringMode(null);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, [endTurn, springTryDry]);
  const springDoSoak = useCallback(
    (idx) => {
      if (!sr.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[idx];
      if (!it) return;
      const ml = [];
      if (it.type === "bottle") {
        p.inventory.splice(idx, 1);
        const wb = { ...WATER_BOTTLE, id: uid() };
        if (it.blessed) { wb.blessed = true; wb.bcKnown = true; }
        else if (it.cursed) { wb.cursed = true; wb.bcKnown = true; }
        const _sfx = it.blessed ? "【祝】" : it.cursed ? "【呪】" : "";
        p.inventory.push(wb);
        ml.push(`${it.name}に水を汲んだ。${wb.name}を手に入れた！${_sfx}`);
      } else if (it.type === "weapon" || it.type === "armor") {
        /* 特殊変化：ロングソード→エクスカリバー(5%)、バトルアクス/戦神の斧→金の斧(20%) */
        if (it.type === "weapon" && it.name === "ロングソード" && Math.random() < 0.05) {
          const _oldPlus = it.plus || 0;
          const _oldAbs = [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])])].filter(Boolean);
          Object.assign(it, { ...EXCALIBUR_T, id: it.id, plus: _oldPlus });
          const _newAbs = [...new Set([..._oldAbs, EXCALIBUR_T.ability])];
          it.abilities = _newAbs; it.ability = _newAbs[0];
          ml.push(`${it.name}が聖なる光を放ち...エクスカリバーに変化した！`);
        } else if (it.type === "weapon" && (it.name === "バトルアクス" || it.name === "戦神の斧") && Math.random() < 0.20) {
          const _oldPlus = it.plus || 0;
          const _oldName = it.name;
          const _oldAbs = [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])])].filter(Boolean);
          const _goldAxe = ITEMS.find(i => i.name === "金の斧");
          Object.assign(it, { ..._goldAxe, id: it.id, plus: _oldPlus });
          const _newAbs = [...new Set([..._oldAbs, _goldAxe.ability])];
          it.abilities = _newAbs; it.ability = _newAbs[0];
          ml.push(`${_oldName}が黄金の輝きを放ち...金の斧に変化した！`);
        } else if (hasAbility(it, "no_degrade")) {
          ml.push(`${it.name}が水に浸かったが金でできているので錆びなかった！`);
        } else {
          const _op = it.plus || 0;
          it.plus = _op - 1;
          const _fp = (v) =>
            v > 0 ? `+${v}` : v === 0 ? `\u7121\u5370` : `${v}`;
          ml.push(
            `${it.name}が水に浸かり...錆びてしまった！(${_fp(_op)}→${_fp(it.plus)})`,
          );
        }
      } else if (it.type === "scroll") {
        if (it.effect !== "blank") {
          const _scrDN = dnameRef(it);
          it.name = "白紙の巻物";
          it.effect = "blank";
          it.desc = "何も書かれていない。魔法のマーカーで書き込める。";
          ml.push(`巻物「${_scrDN}」を泉に浸した...文字が消えた！`);
        } else {
          ml.push("白紙の巻物を泉に浸した...何も起こらなかった。");
        }
      } else if (it.type === "spellbook") {
        if (it.spell) {
          const _sbDN = dnameRef(it);
          it.name = "白紙の魔法書";
          it.spell = null;
          it.desc = "魔法が消えてしまった。魔法のマーカー(5回分)で好きな魔法書に変えられる。";
          ml.push(`魔法書「${_sbDN}」を泉に浸した...文字が消えた！`);
        } else {
          ml.push("白紙の魔法書を泉に浸した...何も起こらなかった。");
        }
      } else if (it.type === "pot" && it.potEffect === "gunpowder") {
        const _savedContents = it.contents || [];
        const _preserveTpl = POTS.find(pp => pp.potEffect === "none");
        const _origCap = it.capacity;
        Object.assign(it, { name: _preserveTpl.name, potEffect: _preserveTpl.potEffect,
          capacity: Math.max(_origCap, _savedContents.length),
          desc: _preserveTpl.desc, tile: _preserveTpl.tile });
        it.contents = _savedContents;
        ml.push(`火薬壺を泉に浸した...保存の壺に変化した！中身は保たれている。`);
      } else {
        ml.push(`${dnameRef(it)}を泉に浸した...何も起こらなかった。`);
      }
      springTryDry(dg, p, ml);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setSpringMode(null);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [endTurn, springTryDry],
  );
  const bigboxPutItem = useCallback(
    (itemIdx) => {
      if (!sr.current || !bigboxRef.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[itemIdx];
      if (!it) return;
      const bb = bigboxRef.current;
      const ml = [];
      if (bb.contents.length >= bb.capacity) {
        ml.push(`${bb.name}はもういっぱいだ。`);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        return;
      }
      /* 大箱に入れる前に装備スロットを解除（指輪は命の指輪maxHp処理含む） */
      if (p.weapon === it) p.weapon = null;
      if (p.armor  === it) p.armor  = null;
      if (p.arrow  === it) p.arrow  = null;
      if (p.rings?.includes(it)) {
        p.rings = p.rings.filter(r => r !== it);
        if (it.effect === "life_ring") {
          const _bonus = (it.plus || 0) * 5;
          p.maxHp = Math.max(1, p.maxHp - _bonus);
          p.hp = Math.min(p.hp, p.maxHp);
        }
      }
      p.inventory.splice(itemIdx, 1);
      bigboxAddItem(bb, it, dg, ml);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setBigboxMode(null);
      bigboxRef.current = null;
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
      setTimeout(() => ref.current?.focus(), 0);
    },
    [bigboxAddItem, endTurn],
  );
  const sortInventory = useCallback(() => {
    if (!sr.current) return;
    const p = sr.current.player;
    const ORDER = [
      "weapon",
      "armor",
      "ring",
      "arrow",
      "potion",
      "scroll",
      "food",
      "wand",
      "marker",
      "pen",
      "pot",
      "bottle",
      "gold",
    ];
    p.inventory.sort((a, b) => {
      const oa = ORDER.indexOf(a.type);
      const ob = ORDER.indexOf(b.type);
      const ca = oa >= 0 ? oa : ORDER.length;
      const cb = ob >= 0 ? ob : ORDER.length;
      if (ca !== cb) return ca - cb;
      return a.name.localeCompare(b.name, "ja");
    });
    setInvPage(0);
    setSelIdx(null);
    setInvMenuSel(null);
    setShowDesc(null);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, []);
  const shiftRef = useRef(false);
  const aRef = useRef(false);
  useEffect(() => {
    const onUp = (e) => {
      if (e.key === "Shift") shiftRef.current = false;
      if (e.key === "a" || e.key === "A") aRef.current = false;
    };
    window.addEventListener("keyup", onUp);
    return () => window.removeEventListener("keyup", onUp);
  }, []);
  useKeyHandler({
    // refs
    sr, shiftRef, aRef, execRef, invActRef, doMarkerWriteRef, bigboxRef, dropModeRef,
    // state values
    gs, dead, showScores, gameOverSel, throwMode, showInv, selIdx, invPage, invMenuSel,
    facingMode, springMode, springMenuSel, springPage, putMode, putMenuSel, putPage,
    markerMode, markerMenuSel, spellListMode, spellMenuSel, spellPage, shopMode, shopMenuSel,
    bigboxMode, bigboxMenuSel, bigboxPage, nicknameMode, identifyMode, revealMode,
    tpSelectMode, floorSelectMode, lookMode, debugSpellMode, debugSpellMenuSel,
    msgLogMode, msgLogScrollTop, msgsRef,
    // state setters
    setGs, setMsgs, setGameOverSel, setShowScores, setFloorSelectMode, setTpSelectMode,
    setLookMode, setShowInv, setSelIdx, setInvMenuSel, setShowDesc, setNicknameMode,
    setNicknameInput, setInvPage, setDropMode, setFacingMode, setThrowMode,
    setSpringMode, setSpringMenuSel, setSpringPage, setPutMode, setPutMenuSel, setPutPage,
    setMarkerMode, setMarkerMenuSel, setSpellListMode, setSpellMenuSel, setSpellPage, setShopMode,
    setShopMenuSel, setBigboxMode, setBigboxMenuSel, setBigboxPage, setIdentifyMode,
    setRevealMode, setDebugSpellMode, setDebugSpellMenuSel,
    setMsgLogMode, setMsgLogScrollTop,
    // callbacks
    init, act, doDash, doExamineFront, endTurn, springDrink, springDoSoak,
    bigboxPutItem, sortInventory, getLookDesc, lu,
  });
  const useLabel = (it) => {
    const _p = gs?.player;
    if (it.type === "weapon") return _p?.weapon === it ? "外す" : "装備";
    if (it.type === "armor")  return _p?.armor  === it ? "外す" : "装備";
    if (it.type === "arrow")  return _p?.arrow  === it ? "外す" : "装備";
    if (it.type === "ring")   return (_p?.rings || []).includes(it) ? "外す" : "装備";
    if (it.type === "food") return "食べる";
    if (it.type === "scroll") return "読む";
    if (it.type === "pen") return "描く";
    if (it.type === "pot") return "入れる";
    return "使う";
  };
  const canUse = (it) =>
    ["potion", "food", "scroll", "weapon", "armor", "arrow", "ring", "pot", "pen"].includes(
      it.type,
    );
  /* callbacks内で sr.current を参照するバージョン */
  const dnameRef = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
  const {
    doUseItem, doDropItem, doThrow, doShoot, doWaveWand, doBreakWand,
    doUseMarker, doReadSpellbook, doMarkerWrite, doPutItem, doBreakPot,
    execDirection,
  } = useItemActions({
    sr, setGs, setMsgs, setShowInv, setSelIdx, setShowDesc,
    setThrowMode, throwMode, setMarkerMode, markerMode, setMarkerMenuSel,
    setPutMode, putMode, setPutMenuSel, setPutPage,
    setIdentifyMode, setRevealMode,
    lu, endTurn, chgFloor, withPitfallBag,
    dnameRef, bigboxAddItem,
    onReturnToHub, dropModeRef, setFloorSelectMode, setTpSelectMode,
  });
  doMarkerWriteRef.current = doMarkerWrite;
  invActRef.current = { use: doUseItem, drop: doDropItem, throw: doThrow, shoot: doShoot, wave: doWaveWand, breakWand: doBreakWand, breakPot: doBreakPot, put: doPutItem, useMarker: doUseMarker, readSpellbook: doReadSpellbook };
  execRef.current = execDirection;
  if (!gs) return null;
  const { player: p } = gs;
  const hpP = (p.hp / p.maxHp) * 100,
    hunP = (p.hunger / p.maxHunger) * 100,
    expP = (p.exp / p.nextExp) * 100;
  const hpC = hpP > 50 ? "#0c0" : hpP > 25 ? "#cc0" : "#f22";
  const tmI =
    throwMode &&
    (throwMode.mode === "shoot_equipped"
      ? p.arrow
      : p.inventory[throwMode.idx]);
  const tmL = throwMode
    ? {
        shoot_equipped: "矢を射る方向",
        shoot: "矢を射る方向",
        wand_wave: "杖を振る方向",
        throw: "投げる方向",
      }[throwMode.mode] || "方向選択"
    : "";
  /* 表示名ヘルパー (gsを参照) */
  const dname = (it) => itemDisplayName(it, gs?.fakeNames, gs?.ident, gs?.nicknames);

  const iLabel = (it) => {
    const _ep = gs?.player;
    const _eq = _ep?.weapon === it ? "【武器】" : _ep?.armor === it ? "【防具】" : _ep?.arrow === it ? "【矢】" : (_ep?.rings || []).includes(it) ? "【指輪】" : "";
    const _key = getIdentKey(it);
    const _isIdent = !_key || gs?.ident?.has(_key);
    /* 識別対象アイテムはfullIdentまたはbcKnownのみ祝呪表示、それ以外(武器・防具等)は常に表示 */
    const _needFullIdent = !!_key || it.type === 'weapon' || it.type === 'armor' || it.type === 'ring';
    const _showBC = _needFullIdent ? (it.fullIdent || it.bcKnown) : true;
    const _bc = _showBC ? (it.blessed ? "【祝】" : it.cursed ? "【呪】" : "") : "";
    let s = (_eq ? _eq : "") + _bc + dname(it);
    if (it.type === "arrow") s += ` (${it.count}${(it.stone || it.magicStone) ? "個" : "本"})`;
    else if (it.type === "weapon") {
      if (it.plus) s += (it.plus > 0 ? "+" : "") + it.plus;
      s += ` (攻+${it.atk + (it.plus || 0)})`;
      const _waIds = [
        ...new Set(
          [...(it.abilities || []), ...(it.ability ? [it.ability] : [])].filter(
            Boolean,
          ),
        ),
      ];
      const _waNames = _waIds
        .map((id) => WEAPON_ABILITIES.find((a) => a.id === id)?.name)
        .filter(Boolean);
      if (_waNames.length) s += ` [${_waNames.join("・")}]`;
    } else if (it.type === "armor") {
      if (it.plus) s += (it.plus > 0 ? "+" : "") + it.plus;
      s += ` (防+${it.def + (it.plus || 0)})`;
      const _aaIds = [
        ...new Set(
          [...(it.abilities || []), ...(it.ability ? [it.ability] : [])].filter(
            Boolean,
          ),
        ),
      ];
      const _aaNames = _aaIds
        .map((id) => ARMOR_ABILITIES.find((a) => a.id === id)?.name)
        .filter(Boolean);
      if (_aaNames.length) s += ` [${_aaNames.join("・")}]`;
    } else if (it.type === "potion" && it.effect === "heal" && _isIdent)
      s += ` (HP+${it.value})`;
    else if (it.type === "food") {
      s += `(満+${it.value})`;
      if (!it.cooked || it.potionEffects?.length) {
        s += "(";
        if (!it.cooked) s += "生";
        if (it.potionEffects?.length) s += "★";
        s += ")";
      }
    } else if (it.type === "wand")   s += it.fullIdent ? ` [${it.charges}回]` : "";
    else if (it.type === "marker") s += ` [${it.charges}回]`;
    else if (it.type === "pen")    s += it.fullIdent ? ` [${it.charges || 0}回]` : "";
    else if (it.type === "pot")    s += _isIdent ? ` [${it.contents?.length || 0}/${it.capacity}]` : "";
    else if (it.type === "ring" && ["power_ring", "defense_ring", "life_ring"].includes(it.effect)) s += `+${it.plus || 0}`;
    if (it.shopPrice) s += ` 〔未払:${it.shopPrice}G〕`;
    return s;
  };
  const iBtn = (l, c, fn) => (
    <button
      onClick={fn}
      style={{
        flex: 1,
        minWidth: 50,
        padding: "6px 8px",
        background: c[0],
        color: c[1],
        border: `1px solid ${c[2]}`,
        borderRadius: 5,
        fontSize: 12,
        cursor: "pointer",
        fontWeight: "bold",
        touchAction: "manipulation",
      }}
    >
      {l}
    </button>
  );
  return (
    <div
      ref={ref}
      tabIndex={0}
      onClick={() => ref.current?.focus()}
      style={{
        width: "100%",
        maxWidth: mobile ? "100%" : 1200,
        margin: "0 auto",
        background: "#0c0c14",
        color: "#ccc",
        fontFamily: "'Courier New','MS Gothic',monospace",
        fontSize: mobile ? "11px" : "12px",
        padding: mobile ? "4px" : "8px",
        paddingRight: mobile ? (landscape ? 148 : 4) : 228,
        outline: "none",
        userSelect: "none",
        position: "relative",
        border: mobile ? "none" : "2px solid #2a2a3a",
        borderRadius: mobile ? 0 : 6,
        boxShadow: "0 0 30px rgba(0,60,0,0.12)",
        display: "flex",
        flexDirection: "column",
        minHeight: mobile ? "100dvh" : "auto",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {" "}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1px 8px",
          padding: "3px 2px 4px",
          borderBottom: "1px solid #252530",
          fontSize: mobile ? "10px" : "12px",
          marginBottom: 2,
        }}
      >
        {" "}
        <span>Lv.{p.level}</span>{" "}
        <span>
          B<span style={{ color: "#0ff" }}>{p.depth}</span>F
        </span>{" "}
        <span>
          HP:
          <span style={{ color: hpC }}>
            {p.hp}/{p.maxHp}
          </span>
        </span>{" "}
        <span>
          MP:
          <span style={{ color: (p.mpCooldownTurns || 0) > 0 ? "#888" : "#60c0ff" }}>
            {p.mp || 0}/{p.maxMp || 0}
          </span>
          {(p.mpCooldownTurns || 0) > 0 && (
            <span style={{ color: "#f84", fontSize: "0.8em" }}> 封印:{p.mpCooldownTurns}</span>
          )}
        </span>{" "}
        <span>
          攻:
          {(p.poisonAtkLoss || 0) > 0 ? (
            <span style={{ color: "#fa0" }}>
              {p.atk + (p.weapon?.atk || 0) + (p.rings||[]).reduce((s,r)=>r.effect==="power_ring"?s+(r.plus||0):s,0)}/
              <span style={{ color: "#aaa", fontSize: "0.9em" }}>{p.atk + (p.poisonAtkLoss || 0) + (p.weapon?.atk || 0)}</span>
            </span>
          ) : (
            <span style={{ color: "#fa0" }}>{p.atk + (p.weapon?.atk || 0) + (p.rings||[]).reduce((s,r)=>r.effect==="power_ring"?s+(r.plus||0):s,0)}</span>
          )}
        </span>{" "}
        <span>
          防:
          <span style={{ color: "#08f" }}>{p.def + (p.armor?.def || 0) + (p.armor?.plus || 0) + (p.rings||[]).reduce((s,r)=>r.effect==="defense_ring"?s+(r.plus||0):s,0)}</span>
        </span>{" "}
        <span>
          食:
          <span style={{ color: hunP > 40 ? "#0a0" : "#f80" }}>
            {p.hunger}/{p.maxHunger}
          </span>
        </span>{" "}
        <span style={{ color: "#ffd700" }}>${p.gold}</span>{" "}
        {p.arrow && (
          <span style={{ color: "#dda050" }}>{p.arrow.stone ? "石" : p.arrow.magicStone ? "魔法の石" : "矢"}:{p.arrow.count}</span>
        )}{" "}
        {(p.rings || []).map((r, i) => (
          <span key={i} style={{ color: "#c0a0ff", fontSize: "0.85em" }}>
            💍{["power_ring","defense_ring","life_ring"].includes(r.effect) ? `${r.name}+${r.plus || 0}` : r.name}
          </span>
        ))}{" "}
        {p.poisoned && (
          <span style={{ color: "#80ff40" }}>☠毒</span>
        )}{" "}
        {p.sleepTurns > 0 && (
          <span style={{ color: "#af0" }}>💤{p.sleepTurns}</span>
        )}{" "}
        {(p.slowTurns || 0) > 0 && (
          <span style={{ color: "#80c0ff" }}>🐢{p.slowTurns}</span>
        )}{" "}
        {(p.hasteTurns || 0) > 0 && (
          <span style={{ color: "#ff4040" }}>⚡{p.hasteTurns}</span>
        )}{" "}
        {(p.confusedTurns || 0) > 0 && (
          <span style={{ color: "#ff9020" }}>🌀{p.confusedTurns}</span>
        )}{" "}
        {(p.darknessTurns || 0) > 0 && (
          <span style={{ color: "#4040a0" }}>🌑{p.darknessTurns}</span>
        )}{" "}
        {(p.statusImmune || 0) > 0 && (
          <span style={{ color: "#40c080" }}>🛡{p.statusImmune}</span>
        )}{" "}
        {(p.sureHitTurns || 0) > 0 && (
          <span style={{ color: "#ffe000" }}>🎯{p.sureHitTurns}</span>
        )}{" "}
        {(p.monsterSenseTurns || 0) > 0 && (
          <span style={{ color: "#ff6060" }}>👁‍🗨{p.monsterSenseTurns}</span>
        )}{" "}
        {(p.bewitchedTurns || 0) > 0 && (
          <span style={{ color: "#c040c0" }}>👁{p.bewitchedTurns}</span>
        )}{" "}
        {(p.sealedTurns || 0) > 0 && (
          <span style={{ color: "#8040e0" }}>🔒{p.sealedTurns}</span>
        )}{" "}
      </div>{" "}
      <div
        style={{ display: "flex", gap: 4, padding: "0 2px", marginBottom: 2 }}
      >
        {" "}
        <div
          style={{
            flex: 3,
            height: 3,
            background: "#1a1a24",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${hpP}%`,
              background: hpC,
              transition: "width 0.15s",
            }}
          />
        </div>{" "}
        <div
          style={{
            flex: 1,
            height: 3,
            background: "#1a1a24",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${expP}%`,
              background: "#cc0",
              transition: "width 0.15s",
            }}
          />
        </div>{" "}
      </div>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: "pixelated",
          display: "block",
          margin: "0 auto",
          borderTop: "1px solid #252530",
          borderBottom: "1px solid #252530",
          maxWidth: "100%",
        }}
      />{" "}
      <div
        ref={msgRef}
        style={{
          height: mobile ? 52 : 52,
          overflowY: "auto",
          borderTop: "1px solid #252530",
          padding: "2px",
          fontSize: mobile ? "9.5px" : "11px",
          color: "#8f8",
          lineHeight: "1.3em",
          cursor: revealMode ? "pointer" : "default",
          WebkitOverflowScrolling: "touch",
        }}
        onClick={revealMode ? () => {
          if (revealMode.pendingMsgs.length) setMsgs(prev => [...prev.slice(-80), ...revealMode.pendingMsgs]);
          setRevealMode(null);
        } : undefined}
      >
        {msgs.slice(-50).map((m, i, a) => (
          <div key={i} style={{ opacity: i === a.length - 1 ? 1 : 0.5 }}>
            {m}
          </div>
        ))}
        {revealMode && (
          <div style={{ color: "#fa8", animation: "blink 1s step-end infinite" }}>
            ▼ {mobile ? "タップで続ける" : "何かキーを押す..."}
          </div>
        )}
      </div>{" "}
      {mobile && (
        <div
          style={{
            borderTop: `1px solid ${throwMode ? "#5a3a3a" : "#252530"}`,
            padding: "4px 2px 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
          }}
        >
          {" "}
          <DPad
            onClick={(dx, dy) => {
              if (revealMode) {
                if (revealMode.pendingMsgs.length) setMsgs(prev => [...prev.slice(-80), ...revealMode.pendingMsgs]);
                setRevealMode(null);
                return;
              }
              /* === 見渡しモード === */
              if (lookMode) {
                const ncx = Math.max(0, Math.min(MW - 1, lookMode.cx + dx));
                const ncy = Math.max(0, Math.min(MH - 1, lookMode.cy + dy));
                setLookMode({ cx: ncx, cy: ncy });
                const { dungeon: _ld } = sr.current || {};
                if (_ld) {
                  const _desc = getLookDesc(ncx, ncy, _ld);
                  if (_desc) setMsgs(prev => [...prev.slice(-80), `[見渡す] ${_desc}`]);
                }
                return;
              }
              /* === テレポート先選択モード === */
              if (tpSelectMode) {
                setTpSelectMode({ cx: Math.max(0, Math.min(MW - 1, tpSelectMode.cx + dx)), cy: Math.max(0, Math.min(MH - 1, tpSelectMode.cy + dy)) });
                return;
              }
              /* === インベントリ表示中：上下で選択、左右でページ送り === */
              if (showInv) {
                const inv = sr.current?.player?.inventory || [];
                const totalPages = Math.ceil(inv.length / 10) || 1;
                const pageItems = inv.slice(invPage * 10, (invPage + 1) * 10);
                const len = pageItems.length;
                if (dy !== 0 && dx === 0 && len > 0) {
                  setSelIdx((prev) => {
                    if (prev === null) return dy > 0 ? 0 : len - 1;
                    return (prev + dy + len) % len;
                  });
                  setShowDesc(null);
                } else if (dx !== 0 && dy === 0 && totalPages > 1) {
                  setInvPage((p) => (p + dx + totalPages) % totalPages);
                  setSelIdx(0); setInvMenuSel(null); setShowDesc(null);
                }
                return;
              }
              /* === 識別モード：上下で選択、左右でページ送り === */
              if (identifyMode) {
                if (!sr.current) return;
                const _p = sr.current.player;
                const _isBCMode_t = identifyMode.mode === 'bless' || identifyMode.mode === 'curse';
                const _isDupMode_t = identifyMode.mode === 'duplicate';
                const _filt = _p.inventory
                  .map((_it, _i) => ({ it: _it, i: _i }))
                  .filter(({ it, i }) => {
                    if (_isBCMode_t || _isDupMode_t) return it.type !== "gold";
                    if (identifyMode.scrollIdx === i) return false;
                    if (it.type === 'weapon' || it.type === 'armor') {
                      return identifyMode.mode === 'identify' ? (!it.fullIdent && !it.bcKnown) : (it.fullIdent || it.bcKnown);
                    }
                    const _k = getIdentKey(it);
                    if (!_k) return false;
                    if (identifyMode.mode === 'identify') return !sr.current.ident.has(_k) || (!it.fullIdent && !it.bcKnown);
                    return sr.current.ident.has(_k);
                  });
                const _len = _filt.length;
                const _idPg_t = identifyMode.page || 0;
                const _idTotalPg_t = Math.max(1, Math.ceil(_len / 10));
                const _idPgLen_t = Math.min(10, Math.max(0, _len - _idPg_t * 10));
                if (dy !== 0 && dx === 0 && _idPgLen_t > 0) {
                  setIdentifyMode({ ...identifyMode, sel: ((identifyMode.sel || 0) + dy + _idPgLen_t) % _idPgLen_t });
                } else if (dx !== 0 && dy === 0 && _idTotalPg_t > 1) {
                  setIdentifyMode({ ...identifyMode, page: ((_idPg_t + dx) + _idTotalPg_t) % _idTotalPg_t, sel: 0 });
                }
                return;
              }
              /* === 壺に入れるモード：上下で選択、左右でページ送り === */
              if (putMode) {
                if (!sr.current) return;
                const inv4 = sr.current.player.inventory;
                const pItems4 = inv4.map((it, i) => ({ it, i })).filter(({ i }) => i !== putMode.potIdx);
                const _ps4 = 10;
                const _tp4 = Math.max(1, Math.ceil(pItems4.length / _ps4));
                const _plen4 = pItems4.slice(putPage * _ps4, (putPage + 1) * _ps4).length;
                if (dy !== 0 && dx === 0 && _plen4 > 0) {
                  setPutMenuSel((s) => (s + dy + _plen4) % _plen4);
                } else if (dx !== 0 && dy === 0 && _tp4 > 1) {
                  setPutPage((p) => (p + dx + _tp4) % _tp4);
                  setPutMenuSel(0);
                }
                return;
              }
              /* === マーカーモード：上下で選択 === */
              if (markerMode) {
                if (!sr.current) return;
                if (dy !== 0 && dx === 0) {
                  const inv5 = sr.current.player.inventory;
                  let listLen = 0;
                  if (markerMode.step === "select_blank") {
                    listLen = inv5.filter(it => (it.type === "scroll" && it.effect === "blank") || (it.type === "spellbook" && !it.spell)).length;
                  } else if (markerMode.step === "select_type") {
                    listLen = ITEMS.filter(it => it.type === "scroll").length;
                  } else if (markerMode.step === "select_spellbook_type") {
                    listLen = SPELLBOOKS.filter(it => it.spell).length;
                  }
                  if (listLen > 0) setMarkerMenuSel((s) => (s + dy + listLen) % listLen);
                }
                return;
              }
              /* === 大箱モード：上下で選択、左右でページ送り === */
              if (bigboxMode) {
                if (bigboxMode === "menu") {
                  if (dy !== 0 && dx === 0) setBigboxMenuSel((p) => (p + dy + 3) % 3);
                } else if (bigboxMode === "put") {
                  const inv2 = sr.current?.player?.inventory || [];
                  const _ps = 10;
                  const _tp = Math.max(1, Math.ceil(inv2.length / _ps));
                  const _pil = inv2.slice(bigboxPage * _ps, (bigboxPage + 1) * _ps).length;
                  if (dy !== 0 && dx === 0 && _pil > 0) {
                    setBigboxMenuSel((p) => (p + dy + _pil) % _pil);
                  } else if (dx !== 0 && dy === 0 && _tp > 1) {
                    setBigboxPage((p) => (p + dx + _tp) % _tp);
                    setBigboxMenuSel(0);
                  }
                }
                return;
              }
              /* === 泉モード：上下で選択 === */
              if (springMode) {
                if (dy !== 0 && dx === 0) {
                  if (springMode === "menu") {
                    setSpringMenuSel((p) => (p + dy + 3) % 3);
                  } else if (springMode === "soak") {
                    const inv = sr.current?.player?.inventory || [];
                    if (inv.length > 0) {
                      const totalPg = Math.max(1, Math.ceil(inv.length / 10));
                      const curPg = Math.min(springPage, totalPg - 1);
                      const pgLen = inv.slice(curPg * 10, (curPg + 1) * 10).length;
                      setSpringMenuSel((s) => (s + dy + pgLen) % pgLen);
                    }
                  }
                }
                return;
              }
              /* === 魔法選択モード：上下で選択 === */
              if (spellListMode) {
                if (dy !== 0 && dx === 0) {
                  const knownSpells = sr.current?.player?.spells || [];
                  const slen = knownSpells.length;
                  if (slen > 0) setSpellMenuSel((s) => (s + dy + slen) % slen);
                }
                return;
              }
              if (facingMode) {
                if (sr.current) {
                  sr.current.player.facing = { dx, dy };
                  setGs({ ...sr.current });
                }
                setFacingMode(false);
                return;
              }
              if (throwMode) execDirection(dx, dy);
              else if (dashMode) {
                doDash(dx, dy);
              } else act("move", dx, dy);
            }}
            throwMode={throwMode}
            dashMode={dashMode}
            facingMode={facingMode}
            setFacingMode={setFacingMode}
            setThrowMode={setThrowMode}
            setDashMode={setDashMode}
            setMsgs={setMsgs}
          />{" "}
          {!throwMode ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                flex: 1,
                maxWidth: 200,
              }}
            >
              {" "}
              <div style={{ display: "flex", gap: 3 }}>
                <AB
                  label="矢"
                  sub="shoot"
                  onClick={() => act("shoot_arrow")}
                  color={p.arrow ? "#fc0" : "#555"}
                />
                <AB
                  label="袋"
                  sub="items"
                  onClick={() => act("inventory")}
                  color="#ff0"
                />
              </div>{" "}
              <div style={{ display: "flex", gap: 3 }}>
                <AB
                  label="足"
                  sub="足元"
                  onClick={() => act("interact")}
                  color="#0ff"
                />
                <AB
                  label="調"
                  sub="調べる"
                  onClick={() => doExamineFront()}
                  color="#4af"
                />
                <AB
                  label="待"
                  sub="wait"
                  onClick={() => act("wait")}
                  color="#666"
                />
                <AB
                  label="罠"
                  sub="探る"
                  onClick={() => act("search_traps")}
                  color="#fa0"
                />
              </div>{" "}
              <div style={{ display: "flex", gap: 3 }}>
                <AB
                  label="見"
                  sub="見渡す"
                  onClick={() => {
                    if (revealMode) return;
                    if (lookMode) {
                      setLookMode(null);
                      setMsgs(prev => [...prev.slice(-80), "見渡しを終了した。"]);
                      return;
                    }
                    const { player: _lp, dungeon: _ld } = sr.current || {};
                    if (_lp && _ld) {
                      setLookMode({ cx: _lp.x, cy: _lp.y });
                      const _initDesc = getLookDesc(_lp.x, _lp.y, _ld);
                      setMsgs(prev => [...prev.slice(-80), `[見渡す] Dパッドで移動、もう一度タップでキャンセル / ${_initDesc}`]);
                    }
                  }}
                  color={lookMode ? "#00e5ff" : "#08f"}
                />
                <AB
                  label="走"
                  sub={dashMode ? "ON" : "dash"}
                  onClick={() => { if (revealMode) return; setDashMode((v) => !v); }}
                  color={dashMode ? "#f44" : "#a8f"}
                />
                <AB
                  label="魔"
                  sub="魔法"
                  onClick={() => { if (spellListMode) { setSpellListMode(false); return; } if (revealMode || showInv || lookMode) return; setSpellListMode(true); setSpellMenuSel(0); }}
                  color={spellListMode ? "#4af" : "#60a0e0"}
                />
                <AB
                  label="🎨"
                  sub="タイル"
                  onClick={() => { if (revealMode) return; setShowTileEditor(true); }}
                  color="#888"
                />
                <AB
                  label="📜"
                  sub="記録"
                  onClick={() => { if (revealMode) return; setShowScores(true); }}
                  color="#8cf"
                />
              </div>{" "}
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                textAlign: "center",
                color: "#f88",
                fontSize: 12,
                lineHeight: "1.5em",
              }}
            >
              {" "}
              <div style={{ fontWeight: "bold", marginBottom: 2 }}>
                {tmL}
              </div>{" "}
              <div style={{ color: "#a66", fontSize: 10 }}>
                {tmI ? dname(tmI) : "?"}
                {tmI?.type === "arrow"
                  ? ` (${tmI.count}本)`
                  : tmI?.type === "wand"
                    ? ` [${tmI.charges}回]`
                    : ""}
              </div>{" "}
              <button
                onClick={() => {
                  setThrowMode(null);
                  setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
                }}
                style={{
                  marginTop: 6,
                  padding: "5px 16px",
                  background: "#222",
                  color: "#888",
                  border: "1px solid #444",
                  borderRadius: 5,
                  fontSize: 11,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                キャンセル
              </button>{" "}
            </div>
          )}{" "}
        </div>
      )}{" "}
      {!mobile && !throwMode && !springMode && !putMode && !markerMode && !spellListMode && (
        <div
          style={{
            fontSize: 10,
            color: "#444",
            textAlign: "center",
            marginTop: 2,
          }}
        >
          矢印/テンキー:移動　Shift+矢印/テンキー:ダッシュ　.:待機　x:所持品(↑↓で選択/Z:使用/X:閉じる)　w:見渡す　c:魔法
          {"<>"}:階段　q:矢を射る　z:アクション　f:足元(拾う/罠/階段/大箱/泉)　t:向き変更
        </div>
      )}{" "}
      {!mobile && throwMode && (
        <div
          style={{
            fontSize: 12,
            color: "#f88",
            textAlign: "center",
            marginTop: 2,
            padding: "4px 0",
            background: "#1a1010",
            border: "1px solid #3a2020",
            borderRadius: 4,
          }}
        >
          <span style={{ fontWeight: "bold" }}>{tmL}</span>
          <span style={{ color: "#a66", marginLeft: 8 }}>
            [{tmI ? dname(tmI) : "?"}
            {tmI?.type === "wand" ? ` ${tmI.charges}回` : ""}]
          </span>
          <span style={{ color: "#666", marginLeft: 8 }}>
            方向キー — Esc/x:キャンセル
          </span>
        </div>
      )}{" "}
      <TpSelectModal mode={tpSelectMode} setMode={setTpSelectMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} endTurn={endTurn} mobile={mobile} />{" "}
      <FloorSelectModal mode={floorSelectMode} setMode={setFloorSelectMode} sr={sr} setGs={setGs} setMsgs={setMsgs} endTurn={endTurn} genDungeon={genDungeon} refreshFOV={refreshFOV} rng={rng} />{" "}
      <PotPutModal mode={putMode} setMode={setPutMode} p={p} gs={gs} putPage={putPage} putMenuSel={putMenuSel} doPutItem={doPutItem} iLabel={iLabel} dname={dname} mobile={mobile} />{" "}
      <MarkerModal mode={markerMode} setMode={setMarkerMode} sr={sr} menuSel={markerMenuSel} setMenuSel={setMarkerMenuSel} doMarkerWrite={doMarkerWrite} setMsgs={setMsgs} mobile={mobile} />{" "}
      <SpellListModal mode={spellListMode} setMode={setSpellListMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} menuSel={spellMenuSel} setMenuSel={setSpellMenuSel} page={spellPage} setPage={setSpellPage} setIdentifyMode={setIdentifyMode} setShowInv={setShowInv} setSelIdx={setSelIdx} setShowDesc={setShowDesc} setThrowMode={setThrowMode} setDebugSpellMode={setDebugSpellMode} endTurn={endTurn} lu={lu} mobile={mobile} />{" "}
      <DebugSpellModal mode={debugSpellMode} setMode={setDebugSpellMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} menuSel={debugSpellMenuSel} setMenuSel={setDebugSpellMenuSel} endTurn={endTurn} mobile={mobile} />
      <MsgLogModal show={msgLogMode} msgs={msgs} scrollTop={msgLogScrollTop} setScrollTop={setMsgLogScrollTop} onClose={() => setMsgLogMode(false)} mobile={mobile} />
      <ShopModal mode={shopMode} setMode={setShopMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} menuSel={shopMenuSel} setMenuSel={setShopMenuSel} mobile={mobile} />
      <BigboxModal mode={bigboxMode} setMode={setBigboxMode} gs={gs} setMsgs={setMsgs} bigboxRef={bigboxRef} page={bigboxPage} setPage={setBigboxPage} menuSel={bigboxMenuSel} setMenuSel={setBigboxMenuSel} bigboxPutItem={bigboxPutItem} iLabel={iLabel} mobile={mobile} />
      <IdentifyModal mode={identifyMode} setMode={setIdentifyMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} endTurn={endTurn} iLabel={iLabel} mobile={mobile} />
      <NicknameModal mode={nicknameMode} setMode={setNicknameMode} input={nicknameInput} setInput={setNicknameInput} gs={gs} sr={sr} setGs={setGs} />
      <SpringModal mode={springMode} setMode={setSpringMode} gs={gs} menuSel={springMenuSel} setMenuSel={setSpringMenuSel} page={springPage} setPage={setSpringPage} springDrink={springDrink} springDoSoak={springDoSoak} iLabel={iLabel} mobile={mobile} />{" "}
      <InventoryModal show={showInv} p={p} gs={gs} mobile={mobile} dropMode={dropMode} dropModeRef={dropModeRef} invPage={invPage} selIdx={selIdx} showDesc={showDesc} invMenuSel={invMenuSel} setShowInv={setShowInv} setDropMode={setDropMode} setSelIdx={setSelIdx} setShowDesc={setShowDesc} setInvPage={setInvPage} setInvMenuSel={setInvMenuSel} setNicknameMode={setNicknameMode} setNicknameInput={setNicknameInput} sortInventory={sortInventory} canUse={canUse} useLabel={useLabel} iLabel={iLabel} doUseItem={doUseItem} doReadSpellbook={doReadSpellbook} doShoot={doShoot} doWaveWand={doWaveWand} doBreakWand={doBreakWand} doUseMarker={doUseMarker} doBreakPot={doBreakPot} doDropItem={doDropItem} doThrow={doThrow} containerRef={ref} />{" "}
      <GameOverModal dead={dead} p={p} gameOverSel={gameOverSel} setShowScores={setShowScores} init={init} mobile={mobile} onReturnToHub={onReturnToHub && gameOverResult ? () => onReturnToHub(gameOverResult) : undefined} />
      <ScoresModal show={showScores} setShow={setShowScores} mobile={mobile} />
      <SidebarPanel mobile={mobile} landscape={landscape} portraitSrc={portraitSrc} loadPortrait={loadPortrait} clearPortrait={clearPortrait} setShowScores={setShowScores} />
      <TileEditorModal show={showTileEditor} setShow={setShowTileEditor} loadCustomTile={loadCustomTile} clearCustomTile={clearCustomTile} setCtLoaded={setCtLoaded} />
    </div>
  );
}
