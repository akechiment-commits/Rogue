import { useState, useEffect, useCallback, useRef, useReducer } from "react";
import { MW, MH, T, rng, pick, uid, refreshFOV, removeFloorItem, monsterAt, itemAt, getShops, hasAbility, hasGravityPentacle, clampDmgFixed, randomTeleportDest, consumeBarrier, installPlayerHpReverseHook, calcAtkDefDmg } from "./utils.js";
import {
  findRoom,
  monsterAI,
  makeMonster,
  makeGuard,
  wakeIfDormant,
  MONS,
  MON_LEVELS,
  _resolveBolt,
  _resolveMonsterWandBolt,
} from "./monsters.js";
import {
  ITEMS, WATER_BOTTLE, SPELLBOOKS, WANDS, POTS, RINGS, TRAPS, pickTrap,
  CAT_CLAW_T, EXCALIBUR_T, GOLDEN_AXE_T, TRIELEM_SWORD_T, TRIELEM_ARMOR_T, MITHRIL_ARMOR_T, ALLBANE_SWORD_T, IRONMASS_T, SNIPER_T, GODBANE_SWORD_T, FLAMBERGE_T, ICESWORD_T, CHIDORI_T, ULTIMA_SWORD_T, DIVINE_SHIELD_T, GODSPARKWAND_T, GOBLIN_BAT_T, ONI_CLUB_T,
  genFood, makeArrow, makePoisonArrow, makePiercingArrow, makeStone, makeMagicStone, makeBombArrow, addArrowsInv, addStonesInv,
  wallBreakDrop, makePot, placeItemAt, pickLootFromPool,
  setPitfallBag, clearPitfallBag, applyWandEffect,
  monsterFireLightning, checkShopTheft, applyLightningToInventory,
  WEAPON_ABILITIES, ARMOR_ABILITIES, inMagicSealRoom, inCursedMagicSealRoom,
  monsterDrop, killMonster, getIdentKey, generateFakeNames, generateBbFakeNames,
  hasCursedExplosionPentacle, isFireExplosionNullified, announceFireExplosionNullified, hasRingEffect, calcHungerDrainRate, calcShopBuyPrice, shopPriceNote, applyShopUnpaidCharge, getShopItemCharge, isPlayerFloating, canPlayerWalkOnWater, hasWaterBreathRing, applySoakedFromWaterWalk, doExplosion, doTimeBombExplosion, rotFood,
  hasLightningResist, reduceLightningDamage, lightningResistDamageLabel, ELEM_RESIST_ABILITIES,
  applyPotionEffect, getBlessMultiplier, doGunpowderExplosion, getFarcastMode, calcProjectileDmg,
  itemPrice, gemSellPrice, setPortalFloorsGetter, setTrapIdentGetter, removeTrap, removeTraps, runMineExplosion,
  releaseConfinedMonstersFromPot, resolveImprisonPotExit, potOccupancyCount,
} from "./items.js";
import { fireTrapPlayer } from "./traps.js";
import { statueAt, hitStatueWithAction } from "./fixtures.js";
import { genDungeon, genDebugDungeon, genDebugDungeonFloor2, genDebugFloorByDepth, triggerMonsterHouse, prepareLastFloor, genTreasureRoom, genTutorialFloor, GOAL_ITEMS } from "./dungeon.js";
import { trackItem, trackMonster, trackTrap, trackBigbox, stageBigbox, commitPendingBigboxes, resetDiscoveries, restoreDiscoveries, getDiscoveries } from "./DiscoveryTracker.js";
import { saveGameState, clearGameSave } from "./GameSave.js";
import { TILE_NAMES, customTileImages, clearCustomTileImages, _itemPickupSuffix, processPitfallBag, itemDisplayName } from "./render.js";
import { generateTileImages } from "./tileSprites.js";
import { MONSTER_SHEET_MAP, PLAYER_SHEET_MAP } from "./tilesetMap.js";
import { useGameRenderer } from './useGameRenderer.js';
import { usePortrait } from './usePortrait.js';
import { useItemActions } from './useItemActions.js';
import { useKeyHandler } from './useKeyHandler.js';
import { drainAnims, pushMonsterBoltAnim, pushAnim, pushBoltAnim, drainItemArcs, signalHungerWarn, drainHungerWarn, signalPinchAlert, drainPinchAlert } from './animEvents.js';
import { TileEditorModal, GameOverModal, ScoresModal, NicknameModal, IdentifyModal, ShopModal, SpringModal, WishModal, BigboxModal, TpSelectModal, PotPutModal, MarkerModal, SpellListModal, MsgLogModal, InventoryModal, SidebarPanel, FloorSelectModal, DebugSpellModal, EndingModal, SignModal, SettingsModal, ExitHubConfirmModal } from "./GameModals.jsx";
import { MobileBtn, B, AB, DPad } from "./GameButtons.jsx";
import { _invActCount, bbDisplayName, FLOOR_TITLES, MODAL_INIT, modalReducer } from "./GameHelpers.js";
import { rollWishChance, grantWish } from "./wish.js";

export default function RoguelikeGame({ dungeonConfig, onReturnToHub, pastIdent = [], discoveredItems = {}, resumeState = null } = {}) {
  const [gs, setGs] = useState(null);
  const [msgs, _setMsgs] = useState([{ text: "冒険が始まった！", turn: 0 }]);
  /* フロアターン付きメッセージ追加ラッパー */
  const setMsgs = useCallback((updater) => {
    const t = sr.current?.floorTurns ?? 0;
    const _tag = (m) => typeof m === "string" ? { text: m, turn: t } : (m?.turn !== undefined ? m : { ...m, turn: t });
    if (typeof updater === "function") {
      _setMsgs(prev => {
        const result = updater(prev);
        const oldLen = Math.min(prev.length, 80);
        return result.map((m, i) => i < oldLen ? m : _tag(m));
      });
    } else {
      const arr = Array.isArray(updater) ? updater : [updater];
      _setMsgs(arr.map(_tag));
    }
  }, []);
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
  const wishMode      = modal.type === 'wish'        ? modal.data : null;
  const wishModeRef = useRef(null);
  wishModeRef.current = wishMode;
  const bigboxMode    = modal.type === 'bigbox'       ? modal.data : null;
  const bigboxMenuSel = modal.bigboxMenuSel;
  const bigboxPage    = modal.bigboxPage;
  const bigboxRef = useRef(null);
  const bigboxModeRef = useRef(null);
  bigboxModeRef.current = bigboxMode;
  const identifyConfirmRef = useRef(null);
  const identifyCancelRef = useRef(null);
  const spellConfirmRef = useRef(null);
  const nicknameModeRef = useRef(null);
  const [facingMode, setFacingMode] = useState(false);
  const springTargetRef = useRef(null);
  const shopMode      = modal.type === 'shop'         ? modal.data : null;
  const shopMenuSel   = modal.shopMenuSel;
  const putMode       = modal.type === 'put'          ? modal.data : null;
  const putMenuSel    = modal.putMenuSel;
  const putPage       = modal.putPage;
  const markerMode    = modal.type === 'marker'       ? modal.data : null;
  const markerMenuSel = modal.markerMenuSel;
  const markerPage    = modal.markerPage ?? 0;
  const spellListMode = modal.type === 'spellList'    ? modal.data : null;
  const spellMenuSel  = modal.spellMenuSel;
  const spellPage     = modal.spellPage;
  /* null | {potIdx:number} */ const [dashMode, setDashMode] = useState(false);
  const tpSelectMode     = modal.type === 'tpSelect'     ? modal.data : null;
  const tpSelectModeRef = useRef(null);
  tpSelectModeRef.current = tpSelectMode;
  const lookMode         = modal.type === 'look'         ? modal.data : null;
  const floorSelectMode  = modal.type === 'floorSelect'  ? modal.data : null;
  const floorSelectModeRef = useRef(null);
  floorSelectModeRef.current = floorSelectMode;
  const identifyMode     = modal.type === 'identify'     ? modal.data : null;
  const identifyModeRef = useRef(null);
  identifyModeRef.current = identifyMode;
  const nicknameMode     = modal.type === 'nickname'     ? modal.data : null;
  nicknameModeRef.current = nicknameMode;
  const revealMode       = modal.type === 'reveal'       ? modal.data : null;
  const nicknameInput    = modal.nicknameInput;

  // setter functions (support both direct values and updater functions)
  const setSpringMode    = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'spring', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setSpringMenuSel = (v) => dispatchModal({ type: 'UPDATE', payload: { springMenuSel: typeof v === 'function' ? v(modal.springMenuSel) : v } });
  const setSpringPage    = (v) => dispatchModal({ type: 'UPDATE', payload: { springPage: typeof v === 'function' ? v(modal.springPage) : v } });
  const setWishMode      = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'wish', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setBigboxMode    = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'bigbox', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setBigboxMenuSel = (v) => dispatchModal({ type: 'UPDATE', payload: { bigboxMenuSel: typeof v === 'function' ? v(modal.bigboxMenuSel) : v } });
  const setBigboxPage    = (v) => dispatchModal({ type: 'UPDATE', payload: { bigboxPage: typeof v === 'function' ? v(modal.bigboxPage) : v } });
  const shopModeRef = useRef(null); /* React再レンダリング前でも同期参照できるよう維持 */
  shopModeRef.current = shopMode;
  const setShopMode = (v) => {
    shopModeRef.current = v || null; /* ref を即時更新（stale closure 防止） */
    v ? dispatchModal({ type: 'SET_MODAL', modal: 'shop', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  };
  const setShopMenuSel   = (v) => dispatchModal({ type: 'UPDATE', payload: { shopMenuSel: typeof v === 'function' ? v(modal.shopMenuSel) : v } });
  const setPutMode       = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'put', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setPutMenuSel    = (v) => dispatchModal({ type: 'UPDATE', payload: { putMenuSel: typeof v === 'function' ? v(modal.putMenuSel) : v } });
  const setPutPage       = (v) => dispatchModal({ type: 'UPDATE', payload: { putPage: typeof v === 'function' ? v(modal.putPage) : v } });
  const setMarkerMode    = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'marker', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setMarkerMenuSel = (v) => dispatchModal({ type: 'UPDATE', payload: { markerMenuSel: typeof v === 'function' ? v(modal.markerMenuSel) : v } });
  const setMarkerPage    = (v) => dispatchModal({ type: 'UPDATE', payload: { markerPage: typeof v === 'function' ? v(modal.markerPage ?? 0) : v } });
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
  const debugSpellModeRef = useRef(null);
  debugSpellModeRef.current = debugSpellMode;
  const setRevealMode    = (v) => v ? dispatchModal({ type: 'SET_MODAL', modal: 'reveal', data: v }) : dispatchModal({ type: 'CLOSE_MODAL' });
  const setNicknameInput = (v) => dispatchModal({ type: 'UPDATE', payload: { nicknameInput: typeof v === 'function' ? v(modal.nicknameInput) : v } });
  /* mobile dash toggle */ const [dead, setDead] = useState(false);
  const [msgLogMode, setMsgLogMode] = useState(false);
  const msgLogModeRef = useRef(false);
  msgLogModeRef.current = msgLogMode;
  const [msgLogScrollTop, setMsgLogScrollTop] = useState(0);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const [gameOverResult, setGameOverResult] = useState(null);
  const [showScores, setShowScores] = useState(false);
  const [gameOverSel, setGameOverSel] = useState(0);
  const [showEnding, setShowEnding] = useState(false);
  const [endingResult, setEndingResult] = useState(null);
  const [showSign, setShowSign] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [ctLoaded, setCtLoaded] = useState(0);
  const [showTileEditor, setShowTileEditor] = useState(false);
  const showTileEditorRef = useRef(false);
  showTileEditorRef.current = showTileEditor;
  const [showSettings, setShowSettings] = useState(false);
  const showSettingsRef = useRef(false);
  showSettingsRef.current = showSettings;
  const [exitHubConfirm, setExitHubConfirm] = useState(false);
  const [exitHubSel, setExitHubSel] = useState(0);
  const exitHubConfirmRef = useRef(false);
  exitHubConfirmRef.current = exitHubConfirm;
  const [currentTileset, setCurrentTileset] = useState(() => localStorage.getItem('roguelike_tileset') || 'default');
  const [desktopVW, setDesktopVW] = useState(() => parseInt(localStorage.getItem('roguelike_desktop_vw') || '25'));
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

  /* ===== タイルセット一括読み込み ===== */
  const loadTileset = useCallback(async (name) => {
    /* ベースとして生成タイルをリセット */
    clearCustomTileImages();
    const gen = generateTileImages();
    for (const [idx, canvas] of Object.entries(gen)) {
      customTileImages[parseInt(idx)] = canvas;
    }

    if (name === 'default') {
      setCurrentTileset('default');
      localStorage.setItem('roguelike_tileset', 'default');
      setCtLoaded(c => c + 1);
      return;
    }

    /* 事前切り出し済みスプライトを個別ファイルとして読み込む（全タイルID対応） */
    const uniqueIds = [...new Set([
      ...Object.keys(TILE_NAMES).map(Number),
      ...Object.keys(MONSTER_SHEET_MAP).map(Number),
      ...Object.keys(PLAYER_SHEET_MAP).map(Number),
    ])];

    const _loadTile = (id) => new Promise((res) => {
      /* mon1のtile 42はpenSpriteMapで別途上書きするのでスキップ */
      if (name === 'mon1' && id === 42) { res(); return; }
      const img = new Image();
      const canvas = document.createElement('canvas');
      img.onload = () => {
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        customTileImages[id] = canvas;
        res();
      };
      img.onerror = () => res(); // 失敗しても続行
      img.src = `/tiles/sprites/${name}/tile_${id}.png`;
    });

    try {
      await Promise.all(uniqueIds.map(_loadTile));
      setCurrentTileset(name);
      localStorage.setItem('roguelike_tileset', name);
      setCtLoaded(c => c + 1);
    } catch (e) {
      console.error('Tileset load failed:', e);
      setCtLoaded(c => c + 1);
    }
  }, []);

  /* mon1タイルセット使用時、全9種のペンスプライトを customTileImages[2001..2009] にロード */
  useEffect(() => {
    if (currentTileset !== 'mon1') return;
    for (let i = 1; i <= 9; i++) {
      const col = String(i).padStart(2, '0');
      const img = new Image();
      const idx = 2000 + i;
      img.onload = () => { customTileImages[idx] = img; setCtLoaded(c => c + 1); };
      img.src = `/tiles/items/item_r01_c${col}.png`;
    }
    /* 薬スプライト25種を customTileImages[3001..3025] にロード */
    const POTION_POOL = [
      'item_r04_c07','item_r04_c10','item_r04_c11','item_r04_c14',
      'item_r05_c01','item_r05_c02','item_r05_c03','item_r05_c04',
      'item_r05_c05','item_r05_c06','item_r05_c08','item_r05_c12','item_r05_c14',
      'item_r03_c01','item_r03_c02','item_r03_c03','item_r03_c04',
      'item_r03_c05','item_r03_c15',
      'item_r04_c01','item_r04_c02','item_r04_c03','item_r04_c04',
      'item_r04_c05','item_r04_c06',
    ];
    POTION_POOL.forEach((name, i) => {
      const img = new Image();
      const idx = 3001 + i;
      img.onload = () => { customTileImages[idx] = img; setCtLoaded(c => c + 1); };
      img.src = `/tiles/items/${name}.png`;
    });
  }, [currentTileset]);

  const portraitControlsRef = useRef(null);
  const loadPortrait = (file) => {
    const r = new FileReader();
    r.onload = (e) => {
      const d = e.target.result;
      setPortraitSrc(d);
      portraitControlsRef.current?.pauseDynamic();
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
    fetch("/api/delete-portrait", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
    localStorage.removeItem("roguelike_portrait");
    portraitControlsRef.current?.resumeDynamic();
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
  /* Generate procedural pixel art as default tiles, then override with saved tileset or custom PNGs */
  useEffect(() => {
    const _savedTileset = localStorage.getItem('roguelike_tileset') || 'default';
    if (_savedTileset !== 'default') {
      /* 保存されたプリセットタイルセットを復元 */
      loadTileset(_savedTileset);
      return;
    }
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
    const _initMobile = Math.min(window.innerWidth, window.innerHeight) < 700;
    const d = _initDt === "debug"
      ? genDebugDungeon()
      : _initDt === "tutorial"
      ? genTutorialFloor(startDepth, { mobile: _initMobile })
      : genDungeon(startDepth - 1, _initDt);
    /* 最下層の場合は下り階段を消して目標アイテムを配置 */
    const _initMaxD = dungeonConfig?.maxFloors ?? null;
    if (_initMaxD !== null && startDepth >= _initMaxD && _initDt !== "debug") {
      prepareLastFloor(d, _initDt);
    }
    if (_initDt !== "tutorial") d.nextSpawnTurn = 30;
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
      nextExp: 10,
      hunger: 100,
      maxHunger: 100,
      gold: 0,
      depth: startDepth,
      weapon: null,
      armor: null,
      arrow: null,
      inventory: [
        { name:"満腹の特盛りおにぎり", type:"food", effect:"satiate_food", value:120, desc:"とても腹持ちが良さそうだ。", tile:19, cooked:true, id: uid() },
      ],
      spells: dungeonConfig?.dungeonType === "debug"
        ? ["debug_summon_mon","debug_get_item","debug_create_trap","debug_summon_bb","bless_magic","curse_magic"]
        : [],
      spellLevels: {},
      turns: 0,
      sleepTurns: 0,
      paralyzeTurns: 0,
      frozenTurns: 0,
      slowTurns: 0,
      slowSkip: false,
      hasteTurns: 0,
      hasteUsed: false,
      confusedTurns: 0,
      poisoned: false,
      poisonAtkLoss: 0,
      sealedTurns: 0,
      fireExplosionNullTurns: 0,
      invisibleTurns: 0,
      potConfinedTurns: 0,
      wallWalkTurns: 0,
      reverseTurns: 0,
      rings: [],
      maxInventory: dungeonConfig?.dungeonType === "debug" ? 100 : 30,
      facing: { dx: 0, dy: 1 },
      isThief: false,
      deathCause: "不明の原因により",
    };
    installPlayerHpReverseHook(p);
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
          ...RINGS.map(r => `r:${r.effect}`),
        ])
      : new Set();
    const _allBcKnown = _dt === "debug" || _dt === "beginner" || _dt === "tutorial";
    if (_allBcKnown) {
      [...p.inventory, ...d.items].forEach(it => { it.fullIdent = true; it.bcKnown = true; });
      d.bigboxes?.forEach(bb => trackBigbox(bb));
    } else {
      d.bigboxes?.forEach(bb => { bb.revealed = false; });
    }
    const _penEffects = [...new Set(ITEMS.filter(i => i.type === 'pen').map(i => i.effect))];
    const _penSpriteMap = Object.fromEntries(_penEffects.map(e => [e, Math.floor(Math.random() * 9) + 1]));
    const _potEffects = [...new Set(ITEMS.filter(i => i.type === 'potion').map(i => i.effect))];
    const _potSpriteMap = Object.fromEntries(_potEffects.map(e => [e, Math.floor(Math.random() * 25) + 1]));
    const s = { player: p, dungeon: d, floors: {}, ident: _allIdentKeys, fakeNames: generateFakeNames([...ITEMS, ...WANDS], POTS, SPELLBOOKS, RINGS), bbFakeNames: generateBbFakeNames(), nicknames: {}, isDebugRun: _dt === "debug", dungeonType: _dt, maxDepth: dungeonConfig?.maxFloors ?? null, allBcKnown: _allBcKnown, floorTurns: 0, penSpriteMap: _penSpriteMap, potionSpriteMap: _potSpriteMap };
    sr.current = s;
    setGs(s);
    if (_dt === "tutorial" && startDepth === 1) {
      const _tutSign = d.items.find(it => it.type === "sign");
      if (_tutSign) setTimeout(() => setShowSign(_tutSign), 50);
    }
    ref.current?.focus();
  }, []);
  /* 再開データがある場合はinitの代わりにresumeStateを復元 */
  const initOrResume = useCallback(() => {
    if (resumeState) {
      setDead(false);
      setGameOverResult(null);
      setShowInv(false);
      setSelIdx(null);
      setShowDesc(null);
      setThrowMode(null);
      setSpringMode(null);
      setPutMode(null);
      setDashMode(false);
      /* DiscoveryTracker に前回の発見データを復元 */
      restoreDiscoveries(resumeState.discoveries);
      const rs = {
        player: resumeState.player,
        dungeon: resumeState.dungeon,
        floors: resumeState.floors || {},
        ident: resumeState.ident,
        fakeNames: resumeState.fakeNames,
        bbFakeNames: resumeState.bbFakeNames,
        nicknames: resumeState.nicknames || {},
        isDebugRun: resumeState.isDebugRun,
        dungeonType: resumeState.dungeonType,
        maxDepth: resumeState.maxDepth,
        allBcKnown: resumeState.allBcKnown,
        floorTurns: resumeState.floorTurns || 0,
        penSpriteMap: resumeState.penSpriteMap || Object.fromEntries([...new Set(ITEMS.filter(i => i.type === 'pen').map(i => i.effect))].map(e => [e, Math.floor(Math.random() * 9) + 1])),
        potionSpriteMap: resumeState.potionSpriteMap || Object.fromEntries([...new Set(ITEMS.filter(i => i.type === 'potion').map(i => i.effect))].map(e => [e, Math.floor(Math.random() * 25) + 1])),
      };
      refreshFOV(rs.dungeon, rs.player);
      sr.current = rs;
      setGs(rs);
      setMsgs(resumeState.msgs || [{ text: "冒険を再開した。", turn: 0 }]);
      ref.current?.focus();
    } else {
      init();
    }
  }, []);
  useEffect(initOrResume, [initOrResume]);
  /* ── 自動セーブ: ゲーム状態が変わるたびにlocalStorageに保存 ── */
  useEffect(() => {
    if (!gs || dead || showEnding) return;
    saveGameState(sr.current, msgsRef.current, dungeonConfig, getDiscoveries());
  }, [gs, dead, showEnding]);
  useEffect(() => {
    if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight;
  }, [msgs]);

  const portraitControls = usePortrait({ gs, msgs, setPortraitSrc, bigboxMode, putMode });
  portraitControlsRef.current = portraitControls;
  /* ポータルの魔方陣の別フロア参照ゲッターを登録 */
  useEffect(() => {
    setPortalFloorsGetter(() => sr.current?.floors);
    setTrapIdentGetter(() => sr.current?.ident || null);
    return () => {
      setPortalFloorsGetter(() => null);
      setTrapIdentGetter(() => null);
    };
  }, []);

  /* Canvas render */
  const { renderFrame, renderFrameRef, overlaysRef, moveOffsetsRef, flyingItemsRef, gsOverrideRef } = useGameRenderer(canvasRef, gs, mobile, landscape, ctLoaded, tpSelectMode, lookMode, facingMode, desktopVW);
  const animBusyRef = useRef(false);
  const monMovesRef = useRef([]); /* populated by endTurn for monster move animations */
  const pendingActRef = useRef(null); /* アニメーション中に入力されたアクションをバッファ */
  const actRef = useRef(null);       /* 最新の act 関数への参照（playAnim内から呼ぶため） */
  const revealModeRef = useRef(null); /* revealMode の ref（キーハンドラ内で同期クリアするため） */
  const showSignRef = useRef(null);   /* showSign の ref（act ブロック用） */

  const playAnim = useCallback(async (data) => {
    if (!data || !canvasRef.current) return;
    animBusyRef.current = true;
    try {
    const _easeOut = (t) => t * t * (3 - 2 * t); /* smoothstep */
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
    /* Phase 1: Player move slide (60ms) */
    if (data.playerMove) {
      await _phase(60, (t) => {
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
      /* 跳ね返り自分当たり：プレイヤーを旧位置に固定してから発射 */
      if (data.playerKnockback) moveOffsetsRef.current.set("player", { ...data.playerKnockback, progress: 0 });
      await _phase(200, (t, raw) => {
        overlaysRef.current = data.projectiles.map(p => ({ ...p, progress: raw, t }));
        renderFrame();
      });
      overlaysRef.current = [];
    }
    /* Phase 2b.5: Projectile bounce return (200ms) */
    if (data.projectileReturns?.length) {
      /* 跳ね返り：プレイヤーをまだ旧位置に固定（発射がなかった場合の補填もここで） */
      if (data.playerKnockback) moveOffsetsRef.current.set("player", { ...data.playerKnockback, progress: 0 });
      await _phase(200, (t, raw) => {
        overlaysRef.current = data.projectileReturns.map(p => ({ ...p, type: "projectile", progress: raw, t }));
        renderFrame();
      });
      overlaysRef.current = [];
    }
    /* Phase 2b.6: Player knockback slide — プレイヤーが吹き飛ぶ (180ms) */
    if (data.playerKnockback) {
      await _phase(180, (t) => {
        moveOffsetsRef.current.set("player", { ...data.playerKnockback, progress: t });
        renderFrame();
      });
      moveOffsetsRef.current.delete("player");
    }
    /* Phase 2c: Explosions (350ms) */
    if (data.explosions?.length) {
      await _phase(350, (t, raw) => {
        overlaysRef.current = data.explosions.map(e => ({ ...e, progress: raw, t }));
        renderFrame();
      });
      overlaysRef.current = [];
    }
    /* Phase 2d: Item fly — throw (seq=0 straight) then scatter/bounce (seq=1+ parabolic) */
    if (data.itemArcs?.length) {
      /* flyingItemsRef は act()/useEffect で既に設定済み（アイテム参照ベース）。未設定なら補填 */
      if (flyingItemsRef.current.size === 0) {
        const _refs = data.itemArcs.flat().filter(a => a.itemRef).map(a => a.itemRef);
        flyingItemsRef.current = new Set(_refs);
      }
      for (const arcBatch of data.itemArcs) {
        /* straight(投擲)は220ms、parabolic(散乱)は320msで少しゆっくり */
        const _batchDur = arcBatch.some(a => a.straight) ? 220 : 320;
        await _phase(_batchDur, (t, raw) => {
          overlaysRef.current = arcBatch.map(a => ({ ...a, progress: raw, t }));
          renderFrame();
        });
        /* バッチ完了 → 着地アイテム参照を解放して表示 */
        for (const a of arcBatch) if (a.itemRef) flyingItemsRef.current.delete(a.itemRef);
        overlaysRef.current = [];
        renderFrame();
      }
      flyingItemsRef.current = new Set();
    }
    /* Phase 2e: Splash effects — potion/pot break (500ms, after item fly) */
    if (data.splashes?.length) {
      await _phase(500, (t, raw) => {
        overlaysRef.current = data.splashes.map(s => ({ ...s, progress: raw, t }));
        renderFrame();
      });
      overlaysRef.current = [];
    }
    /* Phase 3: Monster moves (50ms) */
    if (data.monMoves?.length) {
      await _phase(50, (t) => {
        for (const mm of data.monMoves) moveOffsetsRef.current.set("mon_" + mm.id, { ...mm, progress: t });
        renderFrame();
      });
      for (const mm of data.monMoves) moveOffsetsRef.current.delete("mon_" + mm.id);
    }
    /* Phase 4: Monster attack effects — flash then per-hit lunge+damage sequentially */
    if (data.monAttacks?.length || data.monDamages?.length || data.monLunges?.length) {
      /* Flash (70ms) */
      if (data.monAttacks?.length) {
        await _phase(70, (t, raw) => {
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
          await _phase(160, (_t, raw) => {
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
      /* アニメーション中にバッファされたアクションがあれば実行 */
      if (pendingActRef.current) {
        const _pa = pendingActRef.current;
        pendingActRef.current = null;
        actRef.current?.(_pa.type, _pa.dx, _pa.dy);
      }
    }
  }, [renderFrame, renderFrameRef]);
  /* Drain animation events produced by useItemActions (outside of act()) */
  useEffect(() => {
    if (!gs || animBusyRef.current) return;
    const evts = drainAnims();
    const _arcs = drainItemArcs();
    if (evts.length === 0 && _arcs.length === 0) return;
    const d = { attacks: [], damages: [], projectiles: [], explosions: [] };
    for (const e of evts) {
      if (e.type === "projectile") d.projectiles.push(e);
      else if (e.type === "projectileReturn") (d.projectileReturns = d.projectileReturns || []).push(e);
      else if (e.type === "monProjectile") (d.monProjectiles = d.monProjectiles || []).push(e);
      else if (e.type === "monProjectileReturn") (d.monProjectileReturns = d.monProjectileReturns || []).push(e);
      else if (e.type === "splash") (d.splashes = d.splashes || []).push(e);
      else if (e.type === "explosion" || e.type === "lightning" || e.type === "heal") d.explosions.push(e);
      else if (e.type === "damage") d.damages.push(e);
      else if (e.type === "flash") (d.flashes = d.flashes || []).push(e);
      else if (e.type === "playerKnockback") d.playerKnockback = e;
    }
    if (_arcs.length) {
      d.itemArcs = _arcs;
      /* アイテム参照ベースで設定 → 同座標の既存アイテムは隠さない */
      flyingItemsRef.current = new Set(_arcs.flat().filter(a => a.itemRef).map(a => a.itemRef));
      renderFrame();
    }
    if (d.projectiles.length || d.projectileReturns?.length || d.explosions.length || d.splashes?.length || d.damages.length || d.monProjectiles?.length || d.monProjectileReturns?.length || _arcs.length) playAnim(d);
  }, [gs, playAnim, renderFrame]);
  const lu = useCallback((p, ml) => {
    while (p.exp >= p.nextExp) {
      p.level++;
      p.exp -= p.nextExp;
      p.nextExp = Math.floor(p.nextExp * 1.5);
      p.maxHp += 5;
      p.hp = Math.min(p.hp + 10, p.maxHp);
      p.atk++;
      if (p.level % 3 === 0) { p.def++; p.maxMp++; }
      ml.push(`レベルアップ！Lv.${p.level}！`);
    }
  }, []);
  const autoPickup = useCallback((p, dg, ml) => {
    let go = true;
    while (go) {
      go = false;
      if (hasWaterBreathRing(p) && dg.map[p.y]?.[p.x] === T.WATER) {
        const _wiIdx = dg.waterItems?.findIndex((w) => w.x === p.x && w.y === p.y) ?? -1;
        if (_wiIdx >= 0) {
          const _wi = dg.waterItems[_wiIdx];
          const _sunk = { ..._wi.item };
          delete _sunk.x;
          delete _sunk.y;
          if (p.inventory.length < (p.maxInventory || 30)) {
            if (sr.current.allBcKnown) { _sunk.fullIdent = true; _sunk.bcKnown = true; }
            if (!['potion','scroll','wand','ring','pen','marker','spellbook','pot'].includes(_sunk.type)) trackItem(_sunk);
            p.inventory.push(_sunk);
            ml.push(`${itemDisplayName(_sunk, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を水底から拾った。`);
            dg.waterItems.splice(_wiIdx, 1);
            go = true;
            continue;
          } else {
            ml.push(`${itemDisplayName(_sunk, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}が水底にある。持ち物がいっぱいだ！`);
          }
        }
      }
      const it = dg.items.find((i) => i.x === p.x && i.y === p.y);
      if (!it) break;
      if (it.type === "sign") { break; }
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
        if (addArrowsInv(p.inventory, it.count, !!it.poison, !!it.pierce, p.maxInventory || 30, !!it.bombArrow, !!it.strong)) {
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
        /* 識別が必要なタイプは識別時に登録するため拾い時はスキップ */
        if (!['potion','scroll','wand','ring','pen','marker','spellbook','pot'].includes(it.type)) trackItem(it);
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
    else {
      const _fs = dg.traps?.find(t => t.x === cx && t.y === cy && t.disguise && !t.revealed);
      if (_fs) parts.push(_fs.disguise === "stair_up" ? "上り階段" : "下り階段");
    }
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
    if (bb) parts.push(bbDisplayName(bb, sr.current, bb.revealed === true || !!sr.current?.allBcKnown));
    const pent = dg.pentacles?.find(pc => pc.x === cx && pc.y === cy);
    if (pent) parts.push(pent.name);
    const vent = dg.vents?.find(v => v.x === cx && v.y === cy);
    if (vent) parts.push("風穴");
    const statue = dg.statues?.find(s => s.x === cx && s.y === cy);
    if (statue) parts.push("石像");
    return parts.length > 0 ? parts.join(" / ") : "何もない";
  }, []);
  const checkTrap = useCallback((p, dg, ml) => {
    const trap = dg.traps.find((t) => t.x === p.x && t.y === p.y);
    if (!trap) return null;
    /* 発見済みの罠は乗るだけ（重力の魔方陣下は例外で作動） */
    if (trap.revealed && !hasGravityPentacle(dg, p.x, p.y)) {
      ml.push(`${trap.name}がある。`);
      return null;
    }
    if (isPlayerFloating(p, dg)) { trap.revealed = true; ml.push(`浮遊しているので${trap.name}を回避した！`); return null; }
    const _nameFn = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
    trackTrap(trap);
    return fireTrapPlayer(trap, p, dg, ml, _nameFn, lu, { ident: sr.current?.ident });
  }, []);
  const moveMons = useCallback((dg, pl, ml, phaseMode, extraOpts = {}) => {
    const opts = {
      bbFn: bigboxAddItem,
      luFn: lu,
      itemNameFn: (it) => itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames),
      ...extraOpts,
      fireTrapFn: (trap, p, dg2, ml2) => {
        const _tr = fireTrapPlayer(trap, p, dg2, ml2, null, lu, { ident: sr.current?.ident });
        if (_tr === "pitfall") {
          const nd = chgFloor(p, 1, true);
          if (nd) { sr.current.dungeon = nd; ml2.push(`地下${p.depth}階に落ちた！`); }
        }
        return _tr;
      },
      monsterWandFn: (m, dx, dy) => {
        const _we = m.wandEffect || "lightning";
        const _wbItemNameFn = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
        const _wbBbNameFn = (bb) => bbDisplayName(bb, sr.current);
        if (_we === "lightning") {
          const _lBlessed = (m.monLevel || 1) >= 3;
          ml.push(_lBlessed ? `${m.name}が祝福された雷の杖を振った！` : `${m.name}が雷の杖を振った！`);
          monsterFireLightning(m.x, m.y, dg, pl, dx, dy, ml, lu, bigboxAddItem, m.name,
            _wbItemNameFn, m, _lBlessed);
        } else if (_we === "curse_wand") {
          _resolveMonsterWandBolt(m, dg, pl, ml, {
            dx, dy, boltColor: "curse_wand", reflectColor: "#9020b0", wandLabel: "呪い",
            fireMsg: `${m.name}が呪いの杖を振った！`,
            itemNameFn: _wbItemNameFn, bbNameFn: _wbBbNameFn,
            onPlayerHit: (mlx) => {
              /* ランダムな所持品を呪う（金貨・矢を除く） */
              const _inv = pl.inventory.filter(i => i.type !== "gold" && i.type !== "arrow");
              if (_inv.length === 0) { mlx.push("所持品がないので呪いは無効だった。"); return; }
              const _cit = pick(_inv);
              const _citDN = _wbItemNameFn(_cit);
              if (_cit.cursed) mlx.push(`${_citDN}は既に呪われていた！（効果なし）`);
              else if (_cit.blessed) { _cit.blessed = false; _cit.bcKnown = true; mlx.push(`${_citDN}の祝福が解けた！`); }
              else { _cit.cursed = true; _cit.bcKnown = true; mlx.push(`${_citDN}が呪われた！【呪】`); }
            },
            onMonsterHit: (mon, mlx) => {
              mon.speed = Math.max(0.25, (mon.speed || 1) * 0.5);
              mlx.push(`呪いの魔法弾が${mon.name}に命中！鈍足になった！`);
            },
            onWallReflect: (mlx) => {
              m.speed = Math.max(0.25, (m.speed || 1) * 0.5);
              mlx.push(`呪いの魔法弾が壁に跳ね返り${m.name}に命中！鈍足になった！`);
            },
            onMagicReflect: (refl, mlx) => {
              m.speed = Math.max(0.25, (m.speed || 1) * 0.5);
              mlx.push(`呪いが${m.name}に反射！鈍足になった！`);
            },
            onPlayerReflect: (mlx) => {
              m.speed = Math.max(0.25, (m.speed || 1) * 0.5);
              mlx.push(`呪いが${m.name}に反射！鈍足になった！`);
            },
            onBigbox: (bb, mlx) => {
              const _hbbDN = _wbBbNameFn(bb);
              const _newCap = Math.max(0, (bb.capacity || 1) - 1);
              if ((bb.contents?.length || 0) > _newCap) {
                const _fts2 = new Set();
                for (const _ci of (bb.contents || [])) placeItemAt(dg, bb.x, bb.y, _ci, mlx, _fts2);
                stageBigbox(bb);
                dg.bigboxes = dg.bigboxes.filter(b => b !== bb);
                mlx.push(`呪いの魔法弾が${_hbbDN}に命中！容量オーバーで壊れた！中身が飛び出した！`);
              } else {
                bb.capacity = _newCap;
                mlx.push(`呪いの魔法弾が${_hbbDN}に命中！(容量-1 → ${bb.capacity})`);
              }
            },
            onItem: (it, mlx) => {
              const _hitDN = _wbItemNameFn(it);
              if (it.type === "gold" || it.type === "arrow") { mlx.push(`呪いの魔法弾が${_hitDN}に命中したが効果がなかった。`); return; }
              if (it.blessed) { it.blessed = false; mlx.push(`呪いの魔法弾が${_hitDN}に命中！祝福が解けた！`); }
              else if (!it.cursed) { it.cursed = true; mlx.push(`呪いの魔法弾が${_hitDN}に命中！呪われた！【呪】`); }
              else mlx.push(`呪いの魔法弾が${_hitDN}に命中！（既に呪われている）`);
            },
            onTrap: (trap, mlx) => {
              trap.revealed = true;
              mlx.push(`呪いの魔法弾が${trap.name}に命中！罠が露わになった！`);
            },
          });
        } else if (_we === "blowback_wand") {
          _resolveMonsterWandBolt(m, dg, pl, ml, {
            dx, dy, boltColor: "blowback_wand", reflectColor: "#20e0c0", wandLabel: "吹き飛ばし",
            fireMsg: `${m.name}が吹き飛ばしの杖を振った！`,
            itemNameFn: _wbItemNameFn, bbNameFn: _wbBbNameFn,
            onPlayerHit: (mlx) => {
              if (hasGravityPentacle(dg, pl.x, pl.y)) { mlx.push("重力の魔方陣の力で吹き飛ばしが無効になった！"); return; }
              applyWandEffect("knockback", "player", pl, dx, dy, dg, pl, mlx, lu, bigboxAddItem, 1, _wbItemNameFn, m.atk);
              if (pl.sleepTurns > 0) { pl.sleepTurns = 0; mlx.push("衝撃で目が覚めた！"); }
              if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; mlx.push("衝撃で金縛りが解けた！"); }
            },
            onMonsterHit: (mon, mlx) => {
              applyWandEffect("knockback", "monster", mon, dx, dy, dg, pl, mlx, lu, bigboxAddItem, 1, _wbItemNameFn, m.atk, m);
              if (mon.hp <= 0) { trackMonster(mon); killMonster(mon, dg, pl, mlx, lu, false, m); }
            },
            onWallReflect: (mlx) => {
              mlx.push(`吹き飛ばしの魔法弾が壁に跳ね返り${m.name}に命中！`);
              applyWandEffect("knockback", "monster", m, -dx, -dy, dg, pl, mlx, lu, bigboxAddItem, 1, _wbItemNameFn, m.atk);
              if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, pl, mlx, lu); }
            },
            onMagicReflect: (refl, mlx) => {
              applyWandEffect("knockback", "monster", m, -dx, -dy, dg, pl, mlx, lu, bigboxAddItem, 1, _wbItemNameFn, m.atk);
              if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, pl, mlx, lu); }
            },
            onPlayerReflect: (mlx) => {
              applyWandEffect("knockback", "monster", m, -dx, -dy, dg, pl, mlx, lu, bigboxAddItem, 1, _wbItemNameFn, pl.atk || 3);
              if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, pl, mlx, lu); }
            },
            onItem: (it, mlx) => {
              applyWandEffect("knockback", "item", it, dx, dy, dg, pl, mlx, lu, bigboxAddItem, 1, _wbItemNameFn, m.atk);
            },
            onBigbox: (bb, mlx) => {
              applyWandEffect("knockback", "bigbox", bb, dx, dy, dg, pl, mlx, lu, bigboxAddItem, 1, _wbItemNameFn, m.atk);
            },
            onTrap: (trap, mlx) => {
              trap.revealed = true;
              applyWandEffect("knockback", "trap", trap, dx, dy, dg, pl, mlx, lu, bigboxAddItem, 1, _wbItemNameFn, m.atk);
            },
          });
        } else if (_we === "confuse_wand") {
          _resolveMonsterWandBolt(m, dg, pl, ml, {
            dx, dy, boltColor: "confuse_wand", reflectColor: "#dd44ff", wandLabel: "混乱",
            fireMsg: `${m.name}が混乱の杖を振った！`,
            proofAbility: "confuse_proof",
            itemNameFn: _wbItemNameFn, bbNameFn: _wbBbNameFn,
            onPlayerHit: (mlx) => {
              const _prev = pl.confusedTurns || 0;
              pl.confusedTurns = _prev + 5;
              mlx.push(_prev > 0 ? `混乱の魔法弾を受けた！混乱が延長された！(混乱${pl.confusedTurns}ターン)` : `混乱の魔法弾を受けた！頭がくらくらする！(混乱${pl.confusedTurns}ターン)`);
            },
            onMonsterHit: (mon, mlx) => {
              const _prev = mon.confusedTurns || 0;
              mon.confusedTurns = _prev + 20;
              mlx.push(_prev > 0 ? `混乱の魔法弾が${mon.name}に命中！混乱が延長された！(混乱${mon.confusedTurns}ターン)` : `混乱の魔法弾が${mon.name}に命中！混乱した！(混乱${mon.confusedTurns}ターン)`);
            },
            onWallReflect: (mlx) => {
              m.confusedTurns = (m.confusedTurns || 0) + 10;
              mlx.push(`混乱の魔法弾が壁に跳ね返り${m.name}に命中！混乱した！(混乱${m.confusedTurns}ターン)`);
            },
            onMagicReflect: (refl, mlx) => {
              m.confusedTurns = (m.confusedTurns || 0) + 10;
              mlx.push(`混乱が${m.name}に反射した！(混乱${m.confusedTurns}ターン)`);
            },
            onPlayerReflect: (mlx) => {
              const _prev = m.confusedTurns || 0;
              m.confusedTurns = _prev + 10;
              mlx.push(_prev > 0 ? `混乱が${m.name}に反射した！混乱が延長された！(混乱${m.confusedTurns}ターン)` : `混乱が${m.name}に反射した！(混乱${m.confusedTurns}ターン)`);
            },
          });
        } else if (_we === "sleep_wand") {
          _resolveMonsterWandBolt(m, dg, pl, ml, {
            dx, dy, boltColor: "sleep_wand", reflectColor: "#44ff88", wandLabel: "眠り",
            fireMsg: `${m.name}が眠りの杖を振った！`,
            proofAbility: "sleep_proof",
            itemNameFn: _wbItemNameFn, bbNameFn: _wbBbNameFn,
            onPlayerHit: (mlx) => {
              const _prev = pl.sleepTurns || 0;
              pl.sleepTurns = _prev + rng(5, 10);
              mlx.push(_prev > 0 ? `眠りの魔法弾を受けた！眠りが延長された！(眠り${pl.sleepTurns}ターン)` : `眠りの魔法弾を受けた！眠ってしまった！(眠り${pl.sleepTurns}ターン)`);
            },
            onMonsterHit: (mon, mlx) => {
              const _prev = mon.sleepTurns || 0;
              mon.sleepTurns = _prev + 20;
              mlx.push(_prev > 0 ? `眠りの魔法弾が${mon.name}に命中！眠りが延長された！(眠り${mon.sleepTurns}ターン)` : `眠りの魔法弾が${mon.name}に命中！眠ってしまった！(眠り${mon.sleepTurns}ターン)`);
            },
            onWallReflect: (mlx) => {
              m.sleepTurns = (m.sleepTurns || 0) + 10;
              mlx.push(`眠りの魔法弾が壁に跳ね返り${m.name}に命中！眠ってしまった！(眠り${m.sleepTurns}ターン)`);
            },
            onMagicReflect: (refl, mlx) => {
              m.sleepTurns = (m.sleepTurns || 0) + 10;
              mlx.push(`眠りが${m.name}に反射した！(眠り${m.sleepTurns}ターン)`);
            },
            onPlayerReflect: (mlx) => {
              const _prev = m.sleepTurns || 0;
              m.sleepTurns = _prev + 10;
              mlx.push(_prev > 0 ? `眠りが${m.name}に反射した！眠りが延長された！(眠り${m.sleepTurns}ターン)` : `眠りが${m.name}に反射した！(眠り${m.sleepTurns}ターン)`);
            },
          });
        } else if (_we === "teleport_wand") {
          const _tpRand = (exX, exY) =>
            randomTeleportDest(dg, exX, exY, (x, y) =>
              !dg.monsters.some(o => o.x === x && o.y === y) &&
              !(x === pl.x && y === pl.y));
          _resolveMonsterWandBolt(m, dg, pl, ml, {
            dx, dy, boltColor: "teleport_wand", reflectColor: "#ff9900", wandLabel: "テレポート",
            fireMsg: `${m.name}がテレポートの杖を振った！`,
            itemNameFn: _wbItemNameFn, bbNameFn: _wbBbNameFn,
            onPlayerHit: (mlx) => {
              if (dg.pentacles?.some(pc => pc.kind === "teleport" && pc.cursed)) {
                mlx.push("呪われたテレポートの魔方陣がテレポートを阻んだ！"); return;
              }
              const _rp = _tpRand(pl.x, pl.y);
              if (_rp) { pl.x = _rp.x; pl.y = _rp.y; mlx.push("テレポートの魔法弾を受けた！どこかへテレポートした！"); }
              else mlx.push("テレポートに失敗した。");
            },
            onMonsterHit: (mon, mlx) => {
              const _rp = _tpRand(mon.x, mon.y);
              if (_rp) { mon.x = _rp.x; mon.y = _rp.y; mlx.push(`テレポートの魔法弾が${mon.name}に命中！どこかへテレポートした！`); }
              else mlx.push("テレポートに失敗した。");
            },
            onWallReflect: (mlx) => {
              const _rp = _tpRand(m.x, m.y);
              if (_rp) { m.x = _rp.x; m.y = _rp.y; mlx.push(`テレポートの魔法弾が壁に跳ね返り${m.name}に命中！どこかへテレポートした！`); }
              else mlx.push(`テレポートの魔法弾が壁に跳ね返り${m.name}に命中したが失敗した！`);
            },
            onMagicReflect: (refl, mlx) => {
              const _rp = _tpRand(m.x, m.y);
              if (_rp) { m.x = _rp.x; m.y = _rp.y; mlx.push(`テレポートが${m.name}に反射した！どこかへテレポートした！`); }
            },
            onPlayerReflect: (mlx) => {
              const _rp = _tpRand(m.x, m.y);
              if (_rp) { m.x = _rp.x; m.y = _rp.y; mlx.push(`テレポートが${m.name}に反射した！どこかへテレポートした！`); }
            },
            onBigbox: (bb, mlx) => {
              /* 大箱はランダム空マスへ（プレイヤー隣接除外なし、独自ロジック） */
              const _bbPts = [];
              for (let _fy = 1; _fy < MH - 1; _fy++) for (let _fx = 1; _fx < MW - 1; _fx++) {
                if (dg.map[_fy][_fx] === T.FLOOR &&
                    !dg.monsters.some(o => o.x === _fx && o.y === _fy) &&
                    !dg.bigboxes.some(b => b !== bb && b.x === _fx && b.y === _fy) &&
                    !(_fx === pl.x && _fy === pl.y) && !(_fx === bb.x && _fy === bb.y))
                  _bbPts.push({ x: _fx, y: _fy });
              }
              const _rp = _bbPts.length > 0 ? pick(_bbPts) : null;
              if (_rp) { bb.x = _rp.x; bb.y = _rp.y; mlx.push(`テレポートの魔法弾が${_wbBbNameFn(bb)}に命中！どこかへテレポートした！`); }
              else mlx.push("テレポートに失敗した。");
            },
            onItem: (it, mlx) => {
              const _rp = _tpRand(it.x, it.y);
              if (_rp) { it.x = _rp.x; it.y = _rp.y; mlx.push(`テレポートの魔法弾が${_wbItemNameFn(it)}に命中！どこかへテレポートした！`); }
              else mlx.push("テレポートに失敗した。");
            },
            onTrap: (trap, mlx) => {
              const _rp = _tpRand(trap.x, trap.y);
              if (_rp) { trap.x = _rp.x; trap.y = _rp.y; trap.revealed = false; mlx.push(`テレポートの魔法弾が${trap.name}に命中！罠がどこかへテレポートした！`); }
              else mlx.push("テレポートに失敗した。");
            },
          });
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
      /* 等速の魔方陣：部屋内では速度を固定する（通常=1回, 祝福=2回, 呪い=0.5回）（魔法無効モンスターには無効） */
      const _eqPcM = !m.magicImmune && !inMagicSealRoom(m.x, m.y, dg) && dg.pentacles?.find(pc => {
        if (pc.kind !== "equal_speed") return false;
        const _pcRoom = findRoom(dg.rooms, pc.x, pc.y);
        return _pcRoom && findRoom(dg.rooms, m.x, m.y) === _pcRoom;
      });
      if (_eqPcM) {
        m.turnAccum += _eqPcM.cursed ? 0.5 : (_eqPcM.blessed ? 2 : 1);
      } else {
        /* 封印中は倍速・鈍足を無視して等速(1)で行動する */
        m.turnAccum += m.sealed ? 1 : m.speed;
      }
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
  /* ポータルの魔方陣のプレイヤー転送ヘルパー（移動・ダッシュ・ターン終了で共用） */
  const playerPortalWarp = useCallback((p, st, ml) => {
    const dg = st.dungeon;
    /* 固定転送（ペアのみ・ペンポータルと非接続） */
    const _fp = dg.pentacles?.find(pc => pc.kind === "fixed_portal" && pc.x === p.x && pc.y === p.y);
    if (_fp) {
      const _pair = (dg.pentacles || []).find(pc =>
        pc.kind === "fixed_portal" && pc.pairId === _fp.pairId &&
        !(pc.x === _fp.x && pc.y === _fp.y));
      if (!_pair) { ml.push(`${_fp.name}が反応したが、繋がる先がない…`); return false; }
      if (dg.monsters.some(m => m.x === _pair.x && m.y === _pair.y)) {
        ml.push("対の転送陣が塞がっていて出られなかった！");
        return false;
      }
      p.x = _pair.x; p.y = _pair.y;
      ml.push(`${_fp.name}から対の陣へ抜けた！`);
      if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("テレポートして移動封じが解けた！"); }
      if ((p.potConfinedTurns || 0) > 0) {
        p.potConfinedTurns = 0;
        delete p.potConfinedPotId;
        ml.push("テレポートして壺から出た！");
      }
      return true;
    }
    const _ph = dg.pentacles?.find(pc => pc.kind === "portal" && pc.x === p.x && pc.y === p.y);
    if (!_ph) return false;
    if (_ph.cursed) {
      const _rd = randomTeleportDest(dg, p.x, p.y);
      if (_rd) { p.x = _rd.x; p.y = _rd.y; ml.push(`${_ph.name}に飲まれてランダムにテレポートした！【呪】`); }
      else ml.push(`${_ph.name}が反応したがテレポート先がない…【呪】`);
      if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("テレポートして移動封じが解けた！"); }
      if ((p.potConfinedTurns || 0) > 0) {
        p.potConfinedTurns = 0;
        delete p.potConfinedPotId;
        ml.push("テレポートして壺から出た！");
      }
      return true;
    }
    /* 描画順サイクル：同フロア + 別フロア（祝福経由・キーアイテム未所持時のみ） */
    const _hasGoal = p.inventory?.some(i => i.type === "goal");
    const _cycle = [{ portal: _ph, dg, depth: p.depth }];
    for (const _pc of dg.pentacles) {
      if (_pc !== _ph && _pc.kind === "portal" && !_pc.cursed && !_pc.fixed) {
        _cycle.push({ portal: _pc, dg, depth: p.depth });
      }
    }
    if (!_hasGoal && sr.current.floors) {
      for (const [_dStr, _fdg] of Object.entries(sr.current.floors)) {
        if (!_fdg.pentacles) continue;
        const _fd = parseInt(_dStr);
        for (const _pc of _fdg.pentacles) {
          if (_pc.kind !== "portal" || _pc.cursed || _pc.fixed) continue;
          if (!(_ph.blessed && _pc.blessed)) continue;
          _cycle.push({ portal: _pc, dg: _fdg, depth: _fd });
        }
      }
    }
    if (_cycle.length < 2) {
      if (_hasGoal && _ph.blessed) ml.push("キーアイテムの力がポータルの力を打ち消した！");
      return false;
    }
    _cycle.sort((a, b) => (a.portal.drawOrder || 0) - (b.portal.drawOrder || 0));
    const _idx = _cycle.findIndex(e => e.portal === _ph);
    let _dest = null;
    for (let _off = 1; _off < _cycle.length; _off++) {
      const _cand = _cycle[(_idx + _off) % _cycle.length];
      if (_cand.dg.monsters.some(m => m.x === _cand.portal.x && m.y === _cand.portal.y)) continue;
      _dest = _cand; break;
    }
    if (!_dest) { ml.push("どのポータルも塞がっていて出られなかった！"); return false; }
    if (_dest.depth === p.depth) {
      p.x = _dest.portal.x; p.y = _dest.portal.y;
      ml.push(`ポータルから${_dest.portal.name}へ抜けた！`);
    } else {
      sr.current.floors[p.depth] = sr.current.dungeon;
      delete sr.current.floors[_dest.depth];
      sr.current.dungeon = _dest.dg;
      st.dungeon = _dest.dg;
      p.depth = _dest.depth;
      p.x = _dest.portal.x; p.y = _dest.portal.y;
      refreshFOV(_dest.dg, p);
      ml.push(`ポータルから地下${_dest.depth}階の${_dest.portal.name}へ抜けた！`);
    }
    if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("テレポートして移動封じが解けた！"); }
    if ((p.potConfinedTurns || 0) > 0) {
      p.potConfinedTurns = 0;
      delete p.potConfinedPotId;
      ml.push("テレポートして壺から出た！");
    }
    return true;
  }, []);
  const chgFloor = useCallback((pl, dir, pitfall = false) => {
    const nd = pl.depth + dir;
    if (nd < 1) return null;
    const _maxD = sr.current.maxDepth;
    /* 最下層から落とし穴 → 隠し宝部屋 */
    const _isLastFloorPitfall = pitfall && _maxD !== null && pl.depth >= _maxD && dir > 0;
    if (!sr.current.floors) sr.current.floors = {};
    /* 店の商品を持ったまま階層を離脱した場合は即座に泥棒状態にする */
    const _hasUnpaidItems = pl.inventory.some(ci => ci.shopPrice);
    if (_hasUnpaidItems) {
      sr.current.dungeon.shopTheft = true;
      for (const _ci of pl.inventory) { delete _ci.shopPrice; delete _ci._shopId; }
    } else {
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
    } else if (sr.current.dungeonType === "tutorial") {
      const _chgMobile = Math.min(window.innerWidth, window.innerHeight) < 700;
      d = genTutorialFloor(nd, { mobile: _chgMobile });
    } else if (sr.current.isDebugRun && nd >= 2) {
      d = genDebugFloorByDepth(nd, sr.current.dungeonType || "beginner");
    } else {
      d = genDungeon(nd - 1, sr.current.dungeonType || "beginner");
    }
    /* 最下層：isLastFloor 未設定なら必ずキーアイテムを配置
       （落とし穴プリキャッシュや呪いテレポで _saved が先行生成された場合も救済） */
    if (!_isLastFloorPitfall && _maxD !== null && nd >= _maxD && !d.isLastFloor && sr.current.dungeonType !== "tutorial") {
      prepareLastFloor(d, sr.current.dungeonType || "beginner");
    }
    pl.depth = nd;
    /* 最深層に到着時、goalアイテムが所持品にもフロアにもなければ再配置 */
    if (_maxD !== null && nd >= _maxD && d.isLastFloor && sr.current.dungeonType !== "tutorial") {
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
    } else {
      d.bigboxes?.forEach(bb => { if (bb.revealed === undefined) bb.revealed = false; });
    }
    /* チュートリアル識別制御: 2階は祝呪アイテムのキーだけ解放、他の階は全アイテム識別 */
    if (sr.current.dungeonType === "tutorial") {
      if (nd !== 2) {
        d.items.forEach(it => { const _k = getIdentKey(it); if (_k) sr.current.ident.add(_k); });
      } else {
        d.items.forEach(it => { if (it.blessed || it.cursed || it.preIdent) { const _k = getIdentKey(it); if (_k) sr.current.ident.add(_k); } });
      }
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
    if (sr.current.dungeonType !== "tutorial") d.nextSpawnTurn = pl.turns + 30;
    d._firstVisit = !_saved;
    sr.current.floorTurns = 0; /* 階層移動でフロアターンをリセット */
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
      st.floorTurns = (st.floorTurns || 0) + 1;
      /* 落とし穴バッグをセット — moveMons内のmonsterDropなどで発動した落とし穴を収集 */
      const _etPfBag = [];
      setPitfallBag(_etPfBag);
      const _etStartHp = p.hp;
      p.turns++;
      const _hasRegenRing = hasRingEffect(p, "regen_ring");
      /* 腹持ち: 1つにつきハラヘリ×3/4（胴+指輪=1/2、胴+指輪2=1/4）。バター×1/2。回復指輪は軽減後×2 */
      const _hRate = calcHungerDrainRate(p);
      p._hungerTick = (p._hungerTick || 0) + _hRate;
      while (p._hungerTick >= 10) {
        p._hungerTick -= 10;
        p.hunger = Math.max(0, p.hunger - 1);
      }
      /* 大食い武器：5ターンごとに追加で満腹度-1（約2倍速） */
      if (hasAbility(p.weapon, "gluttony") && p.turns % 5 === 0) {
        p.hunger = Math.max(0, p.hunger - 1);
      }
      if (p.hunger === 0) {
        p.deathCause = "空腹により";
        if (!p._hungerDmgStarted) {
          p._hungerDmgStarted = true;
          ml.push("空腹でHPが減り始めた！");
          signalHungerWarn();
        } else if (p.turns % 10 === 0) {
          ml.push("空腹でHPが減っている...");
        }
        p.hp--;
      } else if (p.hp > 0 && p.hp < p.maxHp) {
        const _baseRegen = Math.max(1, Math.floor(p.maxHp / 100)) +
          (hasAbility(p.armor, "regen") ? 1 : 0);
        const regenAmt = _hasRegenRing ? _baseRegen * 2 : _baseRegen;  /* 回復の指輪：回復量2倍 */
        p.hp = Math.min(p.maxHp, p.hp + regenAmt);
      }
      /* 闘気防具：毎ターン隣接する敵全員に2ダメージ */
      if (hasAbility(p.armor, "aura") && st.dungeon.monsters.length > 0) {
        const _auraMons = st.dungeon.monsters.filter(m =>
          Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1
        );
        for (const _am of _auraMons) {
          _am.hp -= 2;
          ml.push(`闘気が${_am.name}に2ダメージ！`);
          if (_am.hp <= 0 && st.dungeon.monsters.includes(_am)) {
            killMonster(_am, st.dungeon, p, ml, lu);
          }
        }
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
      if ((p.fireExplosionNullTurns || 0) > 0) {
        p.fireExplosionNullTurns--;
        if (p.fireExplosionNullTurns === 0) ml.push("炎と爆発の不発効果が切れた！");
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
      if ((p.soakedTurns || 0) > 0) {
        p.soakedTurns--;
        if (p.soakedTurns === 0) ml.push("体が乾いた。ずぶ濡れが解けた。");
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
            if (!_pushed) {
              ml.push(hasWaterBreathRing(p)
                ? "壁に埋まったまま抜け出せない！"
                : "壁に埋まったまま抜け出せない！毎ターンダメージを受ける！");
            }
          }
        }
      }
      /* 壁に埋まっている：毎ターン大ダメージ（水中呼吸の指輪で無効） */
      if ((p.wallWalkTurns || 0) === 0 && !hasWaterBreathRing(p) &&
          (st.dungeon.map[p.y]?.[p.x] === T.WALL || st.dungeon.map[p.y]?.[p.x] === T.BWALL)) {
        const _wdmg = 15;
        p.hp -= _wdmg;
        ml.push(`壁に挟まれて苦しい！${_wdmg}ダメージ！`);
        if (p.hp <= 0) { p.deathCause = "壁に埋まり"; }
      }
      /* 深い水（T.WATER）上で水歩き不可：壺の外なら周囲8マスへ弾き出し、それでも水中なら毎ターン15ダメ
       * 泉は床の上に載るオブジェクトなので歩行可・溺水対象外。壺で泉に沈んだときだけダメージ */
      {
        const _onDeepWater = st.dungeon.map[p.y]?.[p.x] === T.WATER;
        const _onSpring = !!(st.dungeon.springs?.some((s) => s.x === p.x && s.y === p.y));
        const _potIn = (p.potConfinedTurns || 0) > 0;
        const _canWalkWater = canPlayerWalkOnWater(p, st.dungeon);
        if (_onDeepWater && !_canWalkWater && p.hp > 0) {
          if (!_potIn) {
            const _wDirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
            for (const [_wdx, _wdy] of _wDirs) {
              const _wx = p.x + _wdx, _wy = p.y + _wdy;
              if (_wx >= 0 && _wx < MW && _wy >= 0 && _wy < MH &&
                  st.dungeon.map[_wy][_wx] !== T.WALL && st.dungeon.map[_wy][_wx] !== T.BWALL &&
                  st.dungeon.map[_wy][_wx] !== T.WATER &&
                  !st.dungeon.monsters.some((m) => m.x === _wx && m.y === _wy)) {
                p.x = _wx; p.y = _wy;
                ml.push("浮遊が解けて水から弾き出された！");
                break;
              }
            }
          }
          const _stillDeep = st.dungeon.map[p.y]?.[p.x] === T.WATER;
          if (_stillDeep && !canPlayerWalkOnWater(p, st.dungeon) && p.hp > 0) {
            const _wdmg = 15;
            p.hp -= _wdmg;
            ml.push(_potIn
              ? `水中の壺の中で息ができない！${_wdmg}ダメージ！`
              : `溺れて苦しい！${_wdmg}ダメージ！`);
            if (p.hp <= 0) p.deathCause = "水没により";
          }
        } else if (_potIn && _onSpring && !hasWaterBreathRing(p) && p.hp > 0) {
          /* 泉上のとじこめ壺：水中呼吸が無ければ毎ターン15（泉そのものは歩ける） */
          const _wdmg = 15;
          p.hp -= _wdmg;
          ml.push(`水中の壺の中で息ができない！${_wdmg}ダメージ！`);
          if (p.hp <= 0) p.deathCause = "水没により";
        }
      }
      /* 呪われた聖域の魔方陣：強制的に上に乗ると即死（魔封じで無効） */
      const _cursedSancOn = !inMagicSealRoom(p.x, p.y, st.dungeon) && st.dungeon.pentacles?.find((pc) => pc.kind === "sanctuary" && pc.cursed && pc.x === p.x && pc.y === p.y);
      if (_cursedSancOn && p.hp > 0) {
        p.deathCause = `${_cursedSancOn.name}により`;
        p.hp = 0;
        ml.push(`${_cursedSancOn.name}に触れた！呪いの力で即死した！`);
      }
      /* 雷の魔方陣：真上にいると毎ターンダメージ（呪いは回復） */
      const _thunderPent = st.dungeon.pentacles?.find((pc) => pc.kind === "thunder_trap" && pc.x === p.x && pc.y === p.y);
      if (_thunderPent && p.hp > 0 && !inMagicSealRoom(p.x, p.y, st.dungeon)) {
        if (!_thunderPent.cursed && hasCursedExplosionPentacle(st.dungeon)) {
          ml.push("呪われた爆発の魔方陣が雷を打ち消した！");
        } else if (_thunderPent.cursed) {
          const _theal = Math.min(25, p.maxHp - p.hp);
          if (_theal > 0) { p.hp += _theal; ml.push(`${_thunderPent.name}の力でHPが${_theal}回復した！`); }
        } else {
          const _thasLR = hasLightningResist(p);
          const _tcmsB = inCursedMagicSealRoom(p.x, p.y, st.dungeon) ? 2 : 1;
          const _tdmg = reduceLightningDamage(Math.max(1, Math.floor((_thunderPent.blessed ? 50 : 25) * _tcmsB)), p);
          p.deathCause = `${_thunderPent.name}の雷撃により`;
          p.hp -= _tdmg;
          ml.push(`${_thunderPent.name}に打たれた！${_tdmg}ダメージ！${lightningResistDamageLabel(p)}`);
          if (!_thasLR) {
            applyLightningToInventory(p, st.dungeon, ml, lu,
              (it) => itemDisplayName(it, st.fakeNames, st.ident, st.nicknames));
          } else {
            ml.push("ゴムゴムの胴がアイテムへの雷を弾いた！");
          }
        }
      }
      /* ===== 魔方陣の消耗：上に乗っていると30ターンで消滅（固定転送は対象外） ===== */
      if (st.dungeon.pentacles?.length > 0 && p.hp > 0) {
        const _toRemove = [];
        for (const _pc of st.dungeon.pentacles) {
          /* ダンジョン固定の転送陣は何度乗っても消えない（爆発・水など別経路のみ） */
          if (_pc.kind === "fixed_portal" || _pc.fixed) continue;
          /* プレイヤーが上に乗っている */
          const _playerOn = _pc.x === p.x && _pc.y === p.y;
          /* モンスターが上に乗っている */
          const _monOn = !_playerOn && st.dungeon.monsters.some(m => m.hp > 0 && m.x === _pc.x && m.y === _pc.y);
          if (_playerOn || _monOn) {
            _pc.standTurns = (_pc.standTurns || 0) + 1;
            if (_pc.standTurns === 25) ml.push(`${_pc.name}がかすれてきた…(残り${30 - _pc.standTurns}ターン)`);
            if (_pc.standTurns >= 30) { _toRemove.push(_pc); ml.push(`${_pc.name}が消えた！`); }
          }
        }
        if (_toRemove.length > 0) st.dungeon.pentacles = st.dungeon.pentacles.filter(pc => !_toRemove.includes(pc));
      }
      checkShopTheft(p, st.dungeon, ml);
      /* ===== 等速の魔方陣：プレイヤー速度制御（カウントダウン前に判定） ===== */
      const _isEqAutoAdv = p._eqSpeedAutoAdv || false;
      delete p._eqSpeedAutoAdv;
      const _isSlowAutoAdv = p._slowAutoAdv || false;
      delete p._slowAutoAdv;
      const _eqPcP = !inMagicSealRoom(p.x, p.y, st.dungeon) && st.dungeon.pentacles?.find(pc => {
        if (pc.kind !== "equal_speed") return false;
        const _pRm = findRoom(st.dungeon.rooms, pc.x, pc.y);
        return _pRm && findRoom(st.dungeon.rooms, p.x, p.y) === _pRm;
      });
      /* 祝福：hasteTurnsを2以上に維持して毎ターン2回行動を保証 */
      if (_eqPcP?.blessed) {
        p.hasteTurns = Math.max(p.hasteTurns || 0, 2);
      }
      /* ===== 状態異常カウントダウン（ダッシュ含む全ターン進行で共通） ===== */
      if ((p.slowTurns || 0) > 0) {
        p.slowTurns--;
        if (p.slowTurns <= 0) { ml.push("鈍足が解けた！"); }
        else if (!_isSlowAutoAdv) { p.slowSkip = true; }
      }
      /* 鈍足の指輪：装備中は常に速度半減（2ターンに1回行動） */
      if (hasRingEffect(p, "slow_ring") && !_isSlowAutoAdv) {
        p.slowSkip = true;
      }
      if ((p.confusedTurns || 0) > 0) {
        p.confusedTurns--;
        if (p.confusedTurns <= 0) ml.push("混乱が解けた！");
      }
      if ((p.darknessTurns || 0) > 0) {
        p.darknessTurns--;
        if (p.darknessTurns <= 0) ml.push("暗闇が晴れた！視界が戻った！");
      }
      if ((p.bewitchedTurns || 0) > 0) {
        p.bewitchedTurns--;
        if (p.bewitchedTurns <= 0) ml.push("幻惑が解けた！周囲の見た目が正常に戻った！");
      }
      if ((p.defSoftenedTurns || 0) > 0) {
        p.defSoftenedTurns--;
        if (p.defSoftenedTurns <= 0) ml.push("軟化が解けた！防御力が戻った！");
      }
      if ((p.monsterSenseTurns || 0) > 0) {
        p.monsterSenseTurns--;
        if (p.monsterSenseTurns <= 0) ml.push("モンスター感知が切れた！");
      }
      if ((p.statusImmune || 0) > 0) {
        p.statusImmune--;
        if (p.statusImmune <= 0) ml.push("状態防止が切れた！");
      }
      if ((p.sureHitTurns || 0) > 0) {
        p.sureHitTurns--;
        if (p.sureHitTurns <= 0) ml.push("必中状態が切れた！");
      }
      if ((p.spicyAtkTurns || 0) > 0) {
        p.spicyAtkTurns--;
        if (p.spicyAtkTurns <= 0) ml.push("辛さによるダメージブーストが切れた！");
      }
      if ((p.pacifistTurns || 0) > 0) {
        p.pacifistTurns--;
        if (p.pacifistTurns <= 0) ml.push("平和主義状態が解けた！攻撃できるようになった。");
      }
      if ((p.reverseTurns || 0) > 0) {
        p.reverseTurns--;
        if (p.reverseTurns <= 0) ml.push("逆転状態が解けた！ダメージと回復が元に戻った。");
      }
      if ((p.honeyRegenTurns || 0) > 0) {
        const _hReg = Math.min(2, p.maxHp - p.hp);
        if (_hReg > 0) p.hp += _hReg;
        p.honeyRegenTurns--;
        if (p.honeyRegenTurns <= 0) ml.push("蜂蜜の自然回復が切れた！");
      }
      if ((p.curryFireResTurns || 0) > 0) {
        p.curryFireResTurns--;
        if (p.curryFireResTurns <= 0) ml.push("カレーの炎耐性が切れた！");
      }
      if ((p.misoDefTurns || 0) > 0) {
        p.misoDefTurns--;
        if (p.misoDefTurns <= 0) ml.push("味噌の防御ブーストが切れた！");
      }
      if ((p.oliveEvasionTurns || 0) > 0) {
        p.oliveEvasionTurns--;
        if (p.oliveEvasionTurns <= 0) ml.push("オリーブオイルの回避効果が切れた！");
      }
      if ((p.sesameCritTurns || 0) > 0) {
        p.sesameCritTurns--;
        if (p.sesameCritTurns <= 0) ml.push("ごまの会心ブーストが切れた！");
      }
      if ((p.butterHungerTurns || 0) > 0) {
        p.butterHungerTurns--;
        if (p.butterHungerTurns <= 0) ml.push("バターの腹持ち効果が切れた！");
      }
      if ((p.yogurtImmuneTurns || 0) > 0) {
        p.yogurtImmuneTurns--;
        if (p.yogurtImmuneTurns <= 0) ml.push("ヨーグルトの免疫効果が切れた！");
      }
      if ((p.soyExpTurns || 0) > 0) {
        p.soyExpTurns--;
        if (p.soyExpTurns <= 0) ml.push("醤油の経験値ブーストが切れた！");
      }
      if ((p.garlicDmgTurns || 0) > 0) {
        p.garlicDmgTurns--;
        if (p.garlicDmgTurns <= 0) ml.push("にんにくの追加ダメージが切れた！");
      }
      if ((p.lemonThrowTurns || 0) > 0) {
        p.lemonThrowTurns--;
        if (p.lemonThrowTurns <= 0) ml.push("レモンの投擲ブーストが切れた！");
      }
      if ((p.atkDebuffTurns || 0) > 0) {
        p.atkDebuffTurns--;
        if (p.atkDebuffTurns <= 0) ml.push("攻撃力の半減デバフが解けた！");
      }
      if ((p.defDebuffTurns || 0) > 0) {
        p.defDebuffTurns--;
        if (p.defDebuffTurns <= 0) ml.push("防御力の半減デバフが解けた！");
      }
      /* 2倍速：endTurnが呼ばれた時（2回目の行動後）のみ消費 */
      if ((p.hasteTurns || 0) > 0) {
        p.hasteTurns--;
        if (p.hasteTurns <= 0) {
          p.hasteUsed = false;
          if (!_eqPcP?.blessed) ml.push("2倍速が解けた！"); /* 等速祝福中はメッセージ抑制 */
        }
      }
      /* 呪い：自動ターンスキップ（等速スキップ中のendTurnでは再適用しない） */
      if (_eqPcP?.cursed && !_isEqAutoAdv) {
        p.slowSkip = true;
        p._eqSpeedSlowPending = true;
      }
      /* モンスターハウストリガー：毎ターン冒頭で確認（ダッシュ・通常移動どちらでも確実に発動） */
      triggerMonsterHouse(st.dungeon, p, ml);
      /* 初めて踏み入れたフロアは敵が行動しない（階段降り直後の理不尽攻撃を防ぐ） */
      let _skipMonAct = !!st.dungeon._firstVisit;
      if (_skipMonAct) st.dungeon._firstVisit = false;
      /* ===== 4フェーズターン制 ===== */
      /* Phase 2: モンスター移動フェーズ（攻撃なし） */
      const _monSnap = new Map();
      for (const _ms of st.dungeon.monsters) _monSnap.set(_ms.id, { x: _ms.x, y: _ms.y });
      if (!_skipMonAct) moveMons(st.dungeon, p, ml, "moveOnly");
      /* Capture monster position changes for animation + mark movers */
      const _mmoves = [], _mattacks = [], _mdamages = [];
      for (const _ms2 of st.dungeon.monsters) {
        const _snap = _monSnap.get(_ms2.id);
        if (_snap && (_ms2.x !== _snap.x || _ms2.y !== _snap.y)) {
          _mmoves.push({ id: _ms2.id, fromX: _snap.x, fromY: _snap.y, toX: _ms2.x, toY: _ms2.y, tile: _ms2.tile, hp: _ms2.hp, maxHp: _ms2.maxHp });
          if ((_ms2.speed ?? 1) <= 1) _ms2._movedThisTurn = true; /* 速度1以下の敵は移動後に攻撃不可。倍速敵はそのまま攻撃できる */
        }
      }
      /* Phase 2.5: モンスターがポータル／固定転送に乗っていたらワープ
       * 着地済み（このターン移動していない／最初から陣上）は再転送しない。
       * さもないと対の陣の上で往復バウンドして近づいてこない。 */
      if (st.dungeon.pentacles?.some(pc => pc.kind === "portal" || pc.kind === "fixed_portal")) {
        const _hasGoalP25 = p.inventory?.some(i => i.type === "goal");
        for (const _mm of [...st.dungeon.monsters]) {
          const _fixedMon = st.dungeon.pentacles.find(pc => pc.kind === "fixed_portal" && pc.x === _mm.x && pc.y === _mm.y);
          if (_fixedMon) {
            const _msnap = _monSnap.get(_mm.id);
            /* ターン開始時から同じ転送陣にいた＝前回着地済み → バウンド防止 */
            const _startedOnPad = _msnap && _msnap.x === _fixedMon.x && _msnap.y === _fixedMon.y;
            if (_startedOnPad) continue;
            const _fpair = st.dungeon.pentacles.find(pc =>
              pc.kind === "fixed_portal" && pc.pairId === _fixedMon.pairId &&
              !(pc.x === _fixedMon.x && pc.y === _fixedMon.y));
            if (_fpair && !st.dungeon.monsters.some(m => m !== _mm && m.x === _fpair.x && m.y === _fpair.y) &&
                !(_fpair.x === p.x && _fpair.y === p.y)) {
              _mm.x = _fpair.x; _mm.y = _fpair.y;
              ml.push(`${_mm.name}が転送の魔法陣から対の陣へ抜けた！`);
            }
            continue;
          }
          const _portalMon = st.dungeon.pentacles.find(pc => pc.kind === "portal" && pc.x === _mm.x && pc.y === _mm.y);
          if (!_portalMon) continue;
          /* ターン開始時から同じポータル上＝着地済み → 往復バウンド防止 */
          {
            const _psnap = _monSnap.get(_mm.id);
            if (_psnap && _psnap.x === _portalMon.x && _psnap.y === _portalMon.y) continue;
          }
          if (_portalMon.cursed) {
            const _rdM = randomTeleportDest(st.dungeon, _mm.x, _mm.y);
            if (_rdM && !st.dungeon.monsters.some(m => m !== _mm && m.x === _rdM.x && m.y === _rdM.y) && !(p.x === _rdM.x && p.y === _rdM.y)) {
              _mm.x = _rdM.x; _mm.y = _rdM.y;
              ml.push(`${_mm.name}が${_portalMon.name}に飲まれてランダムに飛んだ！【呪】`);
            }
            continue;
          }
          /* 描画順サイクル：同フロア + 別フロア（祝福経由・キーアイテム未所持時のみ） */
          const _cycleM = [{ portal: _portalMon, dg: st.dungeon, depth: _portalMon.floor }];
          for (const _pc of st.dungeon.pentacles) {
            if (_pc !== _portalMon && _pc.kind === "portal" && !_pc.cursed && !_pc.fixed) {
              _cycleM.push({ portal: _pc, dg: st.dungeon, depth: _portalMon.floor });
            }
          }
          if (!_hasGoalP25 && sr.current.floors) {
            for (const [_dStr, _fdg] of Object.entries(sr.current.floors)) {
              if (!_fdg.pentacles) continue;
              const _fd = parseInt(_dStr);
              for (const _pc of _fdg.pentacles) {
                if (_pc.kind !== "portal" || _pc.cursed) continue;
                if (!(_portalMon.blessed && _pc.blessed)) continue;
                _cycleM.push({ portal: _pc, dg: _fdg, depth: _fd });
              }
            }
          }
          if (_cycleM.length < 2) continue;
          _cycleM.sort((a, b) => (a.portal.drawOrder || 0) - (b.portal.drawOrder || 0));
          const _idxM = _cycleM.findIndex(e => e.portal === _portalMon);
          let _destM = null;
          for (let _offM = 1; _offM < _cycleM.length; _offM++) {
            const _candM = _cycleM[(_idxM + _offM) % _cycleM.length];
            /* 出口に他のモンスターがいたら不可 */
            if (_candM.dg.monsters?.some(m => m !== _mm && m.x === _candM.portal.x && m.y === _candM.portal.y)) continue;
            /* 同フロア出口にプレイヤーがいたら不可 */
            if (_candM.dg === st.dungeon && _candM.portal.x === p.x && _candM.portal.y === p.y) continue;
            _destM = _candM; break;
          }
          if (!_destM) continue;
          if (_destM.dg === st.dungeon) {
            _mm.x = _destM.portal.x; _mm.y = _destM.portal.y;
            ml.push(`${_mm.name}がポータルから${_destM.portal.name}へ抜けた！`);
          } else {
            /* 別フロアへ：current dungeon から削除し、行き先 dungeon の monsters に追加 */
            st.dungeon.monsters = st.dungeon.monsters.filter(m => m !== _mm);
            _mm.x = _destM.portal.x; _mm.y = _destM.portal.y;
            _destM.dg.monsters = _destM.dg.monsters || [];
            _destM.dg.monsters.push(_mm);
            ml.push(`${_mm.name}がポータルに飲み込まれてどこかへ消えた！`);
          }
        }
      }
      /* プレイヤーがポータルの上で1ターン経過したらワープ（移動・ダッシュで既に転送済みならスキップ） */
      if (!st._portalWarpedThisTurn && p.hp > 0) {
        playerPortalWarp(p, st, ml);
      }
      delete st._portalWarpedThisTurn;
      /* Phase 3: 罠・爆発の発火フェーズ（敵移動後、攻撃前） */
      /* 爆発の指輪：5%の確率で爆発 */
      if (p.hp > 0 && hasRingEffect(p, "explode_ring") && Math.random() < 0.05) {
        ml.push("指輪が爆発した！");
        const _erfNFn = (gi) => itemDisplayName(gi, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
        doExplosion(p.x, p.y, st.dungeon, p, ml, _erfNFn, "爆発の指輪", null, null, false, true);
      }
      /* 遅延地雷爆発（fireTrapPlayer が dg._pendingMineExplosion に登録） */
      if (!st._pendingMineExplosion && st.dungeon._pendingMineExplosion) {
        st._pendingMineExplosion = st.dungeon._pendingMineExplosion;
      }
      delete st.dungeon._pendingMineExplosion;
      if (st._pendingMineExplosion && p.hp > 0) {
        const _pme = st._pendingMineExplosion;
        delete st._pendingMineExplosion;
        ml.push(`${_pme.name}が発動！`);
        runMineExplosion(st.dungeon, _pme, p, ml, lu);
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
      /* 遅延回転板：敵移動後に発動してPhase4攻撃をスキップ */
      let _spinFired = false;
      if (st._pendingSpin && p.hp > 0) {
        const _ps = st._pendingSpin;
        delete st._pendingSpin;
        const _spinNFn = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
        fireTrapPlayer(_ps, p, st.dungeon, ml, _spinNFn, lu, { ident: sr.current?.ident });
        _spinFired = true;
      }
      /* Phase 4: モンスター攻撃フェーズ（移動なし） */
      const _perHitEvents = [];
      const _perHitLunges = [];
      let _hadActualHit = false;
      if (!_skipMonAct && !_spinFired) moveMons(st.dungeon, p, ml, "attackOnly", {
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
      /* ターン終了：ボスHP自然回復 */
      for (const _bm of st.dungeon.monsters) {
        if (_bm.hp <= 0) continue;
        if (_bm.baseKind === "im_boss_titan") {
          const _th = Math.min(5, _bm.maxHp - _bm.hp);
          if (_th > 0) { _bm.hp += _th; ml.push(`${_bm.name}の肉体が再生した！(+${_th}HP)`); }
        }
        if (_bm.baseKind === "im_boss_kraken" && st.dungeon.map[_bm.y]?.[_bm.x] === T.WATER) {
          const _kh = Math.min(20, _bm.maxHp - _bm.hp);
          if (_kh > 0) { _bm.hp += _kh; ml.push(`${_bm.name}は水中で体力を回復した！(+${_kh}HP)`); }
        }
      }
      /* 油状態・一時浮遊：モンスターのカウントダウン */
      for (const _om of st.dungeon.monsters) {
        if ((_om.oilyTurns || 0) > 0) {
          _om.oilyTurns = Math.max(0, _om.oilyTurns - (_om.isBoss ? 2 : 1));
          if (_om.oilyTurns <= 0) ml.push(`${_om.name}の油まみれが取れた。`);
        }
        if ((_om.floatTurns || 0) > 0) {
          _om.floatTurns--;
          if (_om.floatTurns <= 0) ml.push(`${_om.name}の浮遊が解けた！`);
        }
      }
      /* 雷の魔方陣：モンスターにも適用（moveMons後に最終位置で判定） */
      if (st.dungeon.pentacles?.some((pc) => pc.kind === "thunder_trap") && !hasCursedExplosionPentacle(st.dungeon)) {
        for (const _m of [...st.dungeon.monsters]) {
          const _tp = st.dungeon.pentacles.find((pc) => pc.kind === "thunder_trap" && pc.x === _m.x && pc.y === _m.y);
          if (_tp && !_m.magicImmune && !inMagicSealRoom(_tp.x, _tp.y, st.dungeon)) {
            if (_tp.cursed) {
              if (_m.kind === "undead") {
                _m.hp -= 25; ml.push(`${_tp.name}の力が${_m.name}を傷つけた！25ダメージ！(アンデッド)`);
                if (_m.hp <= 0) { trackMonster(_m); killMonster(_m, st.dungeon, p, ml, lu); }
              } else {
                const _mheal = Math.min(25, _m.maxHp - _m.hp);
                if (_mheal > 0) { _m.hp += _mheal; ml.push(`${_tp.name}の力で${_m.name}のHPが${_mheal}回復した！`); }
              }
            } else {
              const _tpWeakMult = _m.elemWeak === "thunder" ? 1.5 : 1;
              const _tpcmsB = inCursedMagicSealRoom(_tp.x, _tp.y, st.dungeon) ? 2 : 1;
              const _tmdmg = Math.round((_tp.blessed ? 50 : 25) * _tpWeakMult * _tpcmsB);
              _m.hp -= _tmdmg;
              ml.push(`${_tp.name}が${_m.name}を打った！${_tmdmg}ダメージ！${_tpWeakMult > 1 ? "雷弱点！" : ""}`);
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
          /* 魔封じの魔方陣：自分以外の魔方陣の効果を封じる */
          const _pcMagicSealed = _pc.kind !== "magic_seal" && inMagicSealRoom(_pc.x, _pc.y, _dg2);
          /* --- 明かりの魔方陣 --- */
          /* (rendering only; handled in refreshFOV override below) */
          /* --- テレポートの魔方陣：各生物が独立して毎ターン10%でテレポート --- */
          if (!_pcMagicSealed && _pc.kind === "teleport_trap" && !_pc.cursed) {
            const _tpFloorBlocked = _dg2.pentacles.some(pc2 => pc2 !== _pc && pc2.kind === "teleport_trap" && pc2.cursed);
            if (!_tpFloorBlocked) {
                /* プレイヤーが対象範囲内なら個別抽選 */
              if (_inRange && Math.random() < 0.1) {
                const _tp = randomTeleportDest(_dg2, p.x, p.y);
                if (_tp) { p.x = _tp.x; p.y = _tp.y; }
                ml.push(`${_pc.name}の力でテレポートした！`);
              }
              /* 魔方陣と同じ部屋にいるモンスターを個別抽選（祝福ならフロア全体） */
              for (const _tpM of _dg2.monsters) {
                if (_tpM.magicImmune) continue;
                const _tpMRoom = findRoom(_dg2.rooms, _tpM.x, _tpM.y);
                if ((_pc.blessed ? true : _tpMRoom === _pcRoom) && Math.random() < 0.1) {
                  const _tp = randomTeleportDest(_dg2, _tpM.x, _tpM.y);
                  if (_tp) { _tpM.x = _tp.x; _tpM.y = _tp.y; }
                  ml.push(`${_pc.name}の力で${_tpM.name}がテレポートした！`);
                }
              }
            }
          }
          /* --- 罠の魔方陣：同フロアでターン経過すれば別部屋でも発動（配置先は魔方陣の部屋／祝福はフロア） --- */
          if (!_pcMagicSealed && _pc.kind === "trap_gen") {
            if (_pc.cursed) {
              /* 呪い：毎ターン30%でフロア内の罠を1つ消す（永続回転板は除外） */
              if (Math.random() < 0.3) {
                const _delCands = _dg2.traps.filter(t => !t.permanent);
                if (_delCands.length > 0) {
                  const _rt = pick(_delCands);
                  removeTrap(_dg2, _rt, ml, { message: `${_pc.name}の呪いで罠が消えた！`, p });
                }
              }
            } else if (Math.random() < 0.1) {
              /* 通常/祝福：毎ターン10%。魔方陣の部屋 / 祝福はフロア内ランダム部屋 */
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
                  if (_dg2.oilyTiles?.some(t => t.x === _tx2 && t.y === _ty2)) continue;
                  if (_dg2.statues?.some(s => s.x === _tx2 && s.y === _ty2)) continue;
                  const _td2 = pickTrap();
                  _dg2.traps.push({ ..._td2, id: uid(), x: _tx2, y: _ty2, revealed: false });
                  _placed = true;
                }
              }
            }
          }
          /* --- 石飛ばしの魔方陣：毎ターン25%で部屋内キャラに魔法の石を飛ばす --- */
          if (!_pcMagicSealed && _pc.kind === "stone_throw" && _pcRoom && Math.random() < 0.25) {
            /* 部屋内の全キャラ（プレイヤー＋モンスター）をターゲット候補に */
            const _stTargets = [];
            const _plInRoom = _pRoom === _pcRoom;
            if (_plInRoom) _stTargets.push({ kind: "player" });
            for (const _stM of _dg2.monsters) {
              if (_stM.magicImmune) continue;
              const _stMRoom = findRoom(_dg2.rooms, _stM.x, _stM.y);
              if (_stMRoom === _pcRoom) _stTargets.push({ kind: "monster", m: _stM });
            }
            if (_stTargets.length > 0) {
              const _stTgt = pick(_stTargets);
              const _baseDmg = rng(5, 10);
              const _stTgtX = _stTgt.kind === "player" ? p.x : _stTgt.m.x;
              const _stTgtY = _stTgt.kind === "player" ? p.y : _stTgt.m.y;
              const _stDropStone = () => placeItemAt(_dg2, _stTgtX, _stTgtY, makeMagicStone(1), ml, new Set());
              /* 命中100%。みかわし魔方陣・みかわしの服・オリーブ油のみ回避可能 */
              let _stDodged = false;
              if (!_pc.cursed) {
                const _stHasDodgePc = _dg2.pentacles?.some(pc => {
                  if (pc.kind !== "dodge" || pc.cursed) return false;
                  if (pc.blessed) return true;
                  const _dPcRoom = findRoom(_dg2.rooms, pc.x, pc.y);
                  return _dPcRoom && findRoom(_dg2.rooms, _stTgtX, _stTgtY) === _dPcRoom;
                });
                if (_stHasDodgePc) {
                  const _dodgeName = _stTgt.kind === "player" ? "プレイヤー" : _stTgt.m.name;
                  ml.push(`みかわしの魔方陣の加護で${_dodgeName}が${_pc.name}の魔法の石をかわした！魔法の石が足元に落ちた。`);
                  _stDropStone();
                  _stDodged = true;
                }
              }
              if (!_stDodged && _stTgt.kind === "player") {
                if (hasAbility(p.armor, "dodge") && Math.random() < 0.25) {
                  ml.push(`${_pc.name}の魔法の石をひらりとかわした！魔法の石が足元に落ちた。`);
                  _stDropStone();
                  _stDodged = true;
                } else if ((p.oliveEvasionTurns || 0) > 0 && Math.random() < 0.15) {
                  ml.push(`オリーブオイルの力で${_pc.name}の魔法の石をするりとかわした！魔法の石が足元に落ちた。`);
                  _stDropStone();
                  _stDodged = true;
                }
              }
              if (!_stDodged && _pc.cursed) {
                /* 呪い：回復効果 */
                if (_stTgt.kind === "player") {
                  const _heal = Math.min(_baseDmg, p.maxHp - p.hp);
                  if (_heal > 0) { p.hp += _heal; ml.push(`${_pc.name}の魔法の石がプレイヤーに当たった！${_heal}回復！`); }
                } else {
                  if (_stTgt.m.kind === "undead") {
                    _stTgt.m.hp -= _baseDmg; ml.push(`${_pc.name}の魔法の石が${_stTgt.m.name}に当たった！${_baseDmg}ダメージ！(アンデッド)`);
                    if (_stTgt.m.hp <= 0) { trackMonster(_stTgt.m); killMonster(_stTgt.m, st.dungeon, p, ml, lu); }
                  } else {
                    const _heal = Math.min(_baseDmg, _stTgt.m.maxHp - _stTgt.m.hp);
                    if (_heal > 0) { _stTgt.m.hp += _heal; ml.push(`${_pc.name}の魔法の石が${_stTgt.m.name}に当たった！${_heal}回復！`); }
                  }
                }
              } else if (!_stDodged) {
                const _stcmsB = inCursedMagicSealRoom(_stTgtX, _stTgtY, _dg2) ? 2 : 1;
                const _dmg = (_pc.blessed ? _baseDmg * 2 : _baseDmg) * _stcmsB;
                if (_stTgt.kind === "player") {
                  p.deathCause = `${_pc.name}の魔法の石により`;
                  p.hp -= _dmg;
                  ml.push(`${_pc.name}の魔法の石がプレイヤーに当たった！${_dmg}ダメージ！`);
                } else if (_stTgt.m.baseKind === "gelcube") {
                  /* ゼラチンキューブ：魔法の石を飲み込む */
                  _stTgt.m.heldItems = _stTgt.m.heldItems || [];
                  _stTgt.m.heldItems.push(makeMagicStone(1));
                  if (!_stTgt.m._gelBaseAtk) _stTgt.m._gelBaseAtk = _stTgt.m.atk;
                  _stTgt.m._gelBoost = Math.min(10, (_stTgt.m._gelBoost || 1) * 1.2);
                  _stTgt.m.atk = Math.round(_stTgt.m._gelBaseAtk * _stTgt.m._gelBoost);
                  ml.push(`${_pc.name}の魔法の石が${_stTgt.m.name}に飲み込まれた！（攻撃力×${_stTgt.m._gelBoost.toFixed(2)}→${_stTgt.m.atk}）`);
                } else if (_stTgt.m.baseKind === "synthmonster") {
                  /* 合成獣：魔法の石を飲み込んで速度アップ */
                  _stTgt.m.heldItems = _stTgt.m.heldItems || [];
                  _stTgt.m.heldItems.push(makeMagicStone(1));
                  const _synthPrev = _stTgt.m.speed || 0.5;
                  _stTgt.m.speed = Math.min(3, _synthPrev + 0.5);
                  _stTgt.m.maxAttacks = Math.ceil(_stTgt.m.speed);
                  ml.push(`${_pc.name}の魔法の石が${_stTgt.m.name}に飲み込まれた！${_stTgt.m.speed !== _synthPrev ? `(速度${_stTgt.m.speed})` : ""}`);
                } else if (_stTgt.m.subtype === "reflector") {
                  /* ミラーゴーレム：跳ね返して魔方陣周辺に落とす */
                  ml.push(`${_pc.name}の魔法の石が${_stTgt.m.name}に弾き返された！`);
                  const _rfCands = [];
                  for (let _rdy = -2; _rdy <= 2; _rdy++) {
                    for (let _rdx = -2; _rdx <= 2; _rdx++) {
                      const _cx = _pc.x + _rdx, _cy = _pc.y + _rdy;
                      if (_cx < 0 || _cx >= MW || _cy < 0 || _cy >= MH) continue;
                      if (_dg2.map[_cy][_cx] !== T.FLOOR) continue;
                      if (_cx === p.x && _cy === p.y) continue;
                      if (_dg2.items.some(i => i.x === _cx && i.y === _cy)) continue;
                      if (_dg2.monsters.some(mn => mn.x === _cx && mn.y === _cy)) continue;
                      _rfCands.push([_cx, _cy]);
                    }
                  }
                  if (_rfCands.length > 0) {
                    const [_dropX, _dropY] = pick(_rfCands);
                    placeItemAt(_dg2, _dropX, _dropY, makeMagicStone(1), ml, new Set());
                    ml.push(`魔法の石が魔方陣の周辺に落ちた。`);
                  }
                } else {
                  _stTgt.m.hp -= _dmg;
                  ml.push(`${_pc.name}の魔法の石が${_stTgt.m.name}に当たった！${_dmg}ダメージ！`);
                  if (_stTgt.m.hp <= 0) { trackMonster(_stTgt.m); killMonster(_stTgt.m, _dg2, p, ml, lu); }
                }
              }
            }
          }
          /* --- 回復の魔方陣：毎ターン部屋内全員に5(祝10)回復 / 呪いは逆に5ダメージ --- */
          if (!_pcMagicSealed && _pc.kind === "heal_aura" && _pcRoom) {
            const _hBase = _pc.blessed ? 10 : 5;
            /* プレイヤーへの効果 */
            if (_inRange) {
              if (_pc.cursed) {
                const _hcmsB = inCursedMagicSealRoom(p.x, p.y, _dg2) ? 2 : 1;
                const _hDmg = _hBase * _hcmsB;
                p.deathCause = `${_pc.name}の呪いにより`;
                p.hp -= _hDmg;
                ml.push(`${_pc.name}の呪いで${_hDmg}ダメージを受けた！`);
              } else {
                const _ph = Math.min(_hBase, p.maxHp - p.hp);
                if (_ph > 0) { p.hp += _ph; }
              }
            }
            /* モンスターへの効果（魔法無効モンスターはスキップ） */
            for (const _hm of _dg2.monsters) {
              if (_hm.hp <= 0) continue;
              if (_hm.magicImmune) continue;
              const _hmRoom = findRoom(_dg2.rooms, _hm.x, _hm.y);
              if (_hmRoom !== _pcRoom) continue;
              if (_pc.cursed) {
                const _hmcmsB = inCursedMagicSealRoom(_hm.x, _hm.y, _dg2) ? 2 : 1;
                const _hmDmg = _hBase * _hmcmsB;
                _hm.hp -= _hmDmg;
                ml.push(`${_pc.name}の呪いで${_hm.name}が${_hmDmg}ダメージを受けた！`);
                if (_hm.hp <= 0) { trackMonster(_hm); killMonster(_hm, _dg2, p, ml, lu); }
              } else if (_hm.kind === "undead") {
                _hm.hp -= _hBase;
                ml.push(`${_pc.name}の回復力が${_hm.name}を傷つけた！${_hBase}ダメージ！(アンデッド)`);
                if (_hm.hp <= 0) { trackMonster(_hm); killMonster(_hm, _dg2, p, ml, lu); }
              } else {
                const _mh = Math.min(_hBase, _hm.maxHp - _hm.hp);
                if (_mh > 0) _hm.hp += _mh;
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
          if (inMagicSealRoom(_lpc.x, _lpc.y, _dg3)) continue;
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
      /* ===== 視界操作モンスター：FOVオーバーライド ===== */
      if (p.hp > 0) {
        const _dg3b = st.dungeon;
        const _pRoom3b = findRoom(_dg3b.rooms, p.x, p.y);
        /* スターライト：いる部屋を常時照らす（明かりの魔方陣・通常版と同じ挙動） */
        for (const _sm of _dg3b.monsters) {
          if (_sm.baseKind !== "starlight" || _sm.hp <= 0) continue;
          const _smRoom = findRoom(_dg3b.rooms, _sm.x, _sm.y);
          if (!_smRoom) continue;
          for (let _ly = _smRoom.y; _ly < _smRoom.y + _smRoom.h; _ly++)
            for (let _lx = _smRoom.x; _lx < _smRoom.x + _smRoom.w; _lx++) { _dg3b.visible[_ly][_lx] = true; _dg3b.explored[_ly][_lx] = true; }
        }
        /* ダークネス：同じ部屋にいると視界を1マスに制限（スターライトより後に適用し上書き） */
        for (const _dm of _dg3b.monsters) {
          if (_dm.baseKind !== "darkness" || _dm.hp <= 0) continue;
          const _dmRoom = findRoom(_dg3b.rooms, _dm.x, _dm.y);
          if (!_dmRoom || !_pRoom3b || _dmRoom !== _pRoom3b) continue;
          for (let _ly = 0; _ly < MH; _ly++)
            for (let _lx = 0; _lx < MW; _lx++)
              if (Math.abs(_lx - p.x) > 1 || Math.abs(_ly - p.y) > 1) _dg3b.visible[_ly][_lx] = false;
          break; /* 1体いれば十分 */
        }
      }
      {
        const _dg = st.dungeon;
        /* 通常モンスター発生: 30T固定、魔物呼び1個→15T、2個→5T */
        if (
          _dg.nextSpawnTurn !== undefined &&
          p.turns >= _dg.nextSpawnTurn &&
          p.hp > 0 &&
          !_dg.noNaturalSpawn
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
            _dg.monsters.push(makeMonster(p.depth - 1, _cx, _cy, { dungeonType: _dg.dungeonType ?? null, excludeWaterOnly: true }));
          }
          const _spawnRingCount = (p.rings || []).filter(r => r && r.effect === "spawn_ring").length;
          const _spawnInterval = _spawnRingCount >= 2 ? 5 : _spawnRingCount === 1 ? 15 : 30;
          _dg.nextSpawnTurn = p.turns + _spawnInterval;
        }
        /* ミラージュ発生: 同フロア1000ターン以上滞在で30Tごとに別枠スポーン */
        if (st.floorTurns >= 1000 && (st.floorTurns - 1000) % 30 === 0 && p.hp > 0 && _dg.dungeonType !== "tutorial" && !_dg.noNaturalSpawn) {
          const _ghostBase = MONS.find(m => m.baseKind === "rockspirit");
          if (_ghostBase) {
            const _ghostLvData = MON_LEVELS["rockspirit"]?.[1] || {};
            const _ghostCands = [];
            for (let _gy = 0; _gy < MH; _gy++) {
              for (let _gx = 0; _gx < MW; _gx++) {
                if (_dg.map[_gy][_gx] !== T.FLOOR) continue;
                if (_gx === p.x && _gy === p.y) continue;
                if (monsterAt(_dg, _gx, _gy)) continue;
                if (_dg.visible[_gy][_gx]) continue;
                _ghostCands.push([_gx, _gy]);
              }
            }
            if (_ghostCands.length > 0) {
              const [_gx, _gy] = pick(_ghostCands);
              const _ghost = {
                ..._ghostBase, ..._ghostLvData,
                id: uid(), x: _gx, y: _gy,
                maxHp: _ghostLvData.hp ?? _ghostBase.hp,
                hp: _ghostLvData.hp ?? _ghostBase.hp,
                baseSpeed: _ghostLvData.speed ?? _ghostBase.speed ?? 1,
                monLevel: 3,
                turnAccum: 0, aware: true,
                dir: { x: 0, y: 1 }, lastPx: p.x, lastPy: p.y, patrolTarget: null,
              };
              _dg.monsters.push(_ghost);
              setMsgs(prev => [...prev, "長居しすぎたせいか、ミラージュが現れた！"]);
            }
          }
        }
        /* 警備員発生: shopTheft時、10Tごとに別途発生 */
        if (
          _dg.shopTheft &&
          p.hp > 0 &&
          p.turns >= (_dg.nextGuardSpawnTurn ?? p.turns)
        ) {
          const _gcands = [];
          for (let _sy = 0; _sy < MH; _sy++) {
            for (let _sx = 0; _sx < MW; _sx++) {
              if (_dg.map[_sy][_sx] !== T.FLOOR) continue;
              if (_sx === p.x && _sy === p.y) continue;
              if (monsterAt(_dg, _sx, _sy)) continue;
              if (_dg.isBigRoom) {
                if (Math.abs(_sx - p.x) + Math.abs(_sy - p.y) < 8) continue;
              } else {
                if (_dg.visible[_sy][_sx]) continue;
              }
              _gcands.push([_sx, _sy]);
            }
          }
          if (_gcands.length > 0) {
            const [_cx, _cy] = pick(_gcands);
            _dg.monsters.push(makeGuard(_cx, _cy, p.x, p.y));
            ml.push("手配犯として警備員が現れた！");
          }
          _dg.nextGuardSpawnTurn = p.turns + 10;
        }
      }
      if (p.hp <= 0) {
        /* 復活の魔方陣チェック：魔方陣上/同部屋（祝福）にいればHP全回復で復活（使い捨て） */
        const _revPcP = st.dungeon.pentacles?.find(pc => {
          if (pc.kind !== "revival" || pc.cursed) return false;
          if (pc.x === p.x && pc.y === p.y) return true;
          if (pc.blessed) {
            const _pr = findRoom(st.dungeon.rooms, pc.x, pc.y);
            return _pr && findRoom(st.dungeon.rooms, p.x, p.y) === _pr;
          }
          return false;
        });
        if (_revPcP) {
          p.hp = p.maxHp;
          ml.push("復活の魔方陣の力でHP全回復！");
        } else if ((p.mp || 0) > 0) {
          /* MPが残っていれば残MP分のHPで復活 */
          const revHp = p.mp;
          p.hp = revHp;
          p.mp = 0;
          p.mpCooldownTurns = 1000;
          ml.push(`HPがゼロになった！残りMP${revHp}でHP${revHp}として復活！MPは1000ターン回復しない。`);
        } else {
          ml.push("あなたは死んだ...ゲームオーバー。");
          clearGameSave();
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
          p.inventory.forEach(i => trackItem(i));
          setGameOverSel(0);
          setDead(true);
          commitPendingBigboxes();
          setGameOverResult({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: false, identifiedEffects: [...(sr.current?.ident || [])] });
        }
      }
      /* 骨のカウントダウン：0になったらスケルトン復活（真上に誰かいたら先延ばし） */
      if (st.dungeon.traps && p.hp > 0) {
        const _reviveBones = st.dungeon.traps.filter(t => t.effect === "bone" && t.reviveIn !== undefined);
        for (const _bone of _reviveBones) {
          if (_bone.reviveIn > 0) { _bone.reviveIn--; continue; }
          /* reviveIn === 0：タイルが空くまで待機して復活 */
          const _occupied = monsterAt(st.dungeon, _bone.x, _bone.y) || (p.x === _bone.x && p.y === _bone.y);
          if (_occupied) continue; /* どかれるまで毎ターン再試行 */
          st.dungeon.traps = st.dungeon.traps.filter(t => t !== _bone);
          const _md = _bone.monData;
          const _revived = {
            ..._md, id: uid(), x: _bone.x, y: _bone.y, maxHp: _md.maxHp,
            baseSpeed: _md.speed ?? 1, turnAccum: 0, aware: true,
            dir: { x: 0, y: 0 }, lastPx: p.x, lastPy: p.y, patrolTarget: null,
          };
          st.dungeon.monsters.push(_revived);
          ml.push(`骨からスケルトンが復活した！`);
        }
      }
      /* 落下エンティティを次の階に配置 */
      clearPitfallBag();
      if (!st.floors) st.floors = {};
      processPitfallBag(_etPfBag, st.floors, p.depth);
      /* ピンチアラート：このターンの全ダメージ（薬・罠・敵含む）で再度受けたら死ぬ場合に警告 */
      if (p.hp > 0) {
        const _etDmg = Math.max(0, _etStartHp - p.hp);
        if (_etDmg > 0 && p.hp <= _etDmg) {
          ml.push({ text: "【ピンチ】このまま同じダメージを受けるとHPが0になる！", color: "#ff3333" });
          signalPinchAlert();
        }
      }
    },
    [moveMons, lu],
  );

  /* auto-advance turns while player is sleeping, paralyzed, or slow-skipping */
  useEffect(() => {
    if (!gs?.player) return;
    if (shopMode) return;
    const { sleepTurns = 0, paralyzeTurns = 0, frozenTurns = 0, slowSkip = false, potConfinedTurns = 0 } = gs.player;
    if (sleepTurns <= 0 && paralyzeTurns <= 0 && frozenTurns <= 0 && !slowSkip && potConfinedTurns <= 0) return;
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
      if (p.sleepTurns <= 0 && p.paralyzeTurns <= 0 && (p.frozenTurns || 0) <= 0 && !p.slowSkip && (p.potConfinedTurns || 0) <= 0) return;
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
      } else if ((p.frozenTurns || 0) > 0) {
        p.frozenTurns--;
        ml.push(p.frozenTurns > 0
          ? `凍りついている...あと${p.frozenTurns}ターン`
          : "氷が解けた！動けるようになった！");
      } else if ((p.potConfinedTurns || 0) > 0) {
        ml.push("壺から出られない！");
        if (p.potConfinedTurns > 1) {
          p.potConfinedTurns--;
        } else {
          p._potExitAfterMon = true;
        }
      } else if (p.slowSkip) {
        p.slowSkip = false;
        const _isEqSlow = p._eqSpeedSlowPending || false;
        delete p._eqSpeedSlowPending;
        if (_isEqSlow) {
          ml.push("等速の魔方陣によりターンがスキップされた...");
          p._eqSpeedAutoAdv = true; /* endTurnに等速スキップターンであることを伝える */
        } else {
          ml.push("鈍足でターンがスキップされた...");
          p._slowAutoAdv = true; /* endTurnに鈍足スキップターンであることを伝える */
        }
      }
      endTurn(st, p, ml);
      if (p._potExitAfterMon) {
        delete p._potExitAfterMon;
        p.potConfinedTurns = 0;
        ml.push("壺から出た！動けるようになった。");
        resolveImprisonPotExit(p, dg, ml, lu);
      }
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
        if (_de.type === "splash") (_ad.splashes = _ad.splashes || []).push(_de);
        else if (_de.type === "explosion") (_ad.explosions = _ad.explosions || []).push(_de);
        else if (_de.type === "monProjectile") (_ad.monProjectiles = _ad.monProjectiles || []).push(_de);
        else if (_de.type === "monProjectileReturn") (_ad.monProjectileReturns = _ad.monProjectileReturns || []).push(_de);
        else if (_de.type === "damage") (_ad.damages = _ad.damages || []).push(_de);
      }
      const _itemArcBatches2 = drainItemArcs();
      if (_itemArcBatches2.length) {
        _ad.itemArcs = _itemArcBatches2;
        flyingItemsRef.current = new Set(_itemArcBatches2.flat().filter(a => a.itemRef).map(a => a.itemRef));
      }
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...st };
      setGs({ ...st });
      const _hasAnim = _ad.monMoves.length || _ad.monAttacks.length || _ad.monDamages.length || _ad.explosions?.length || _ad.splashes?.length || _ad.monProjectiles?.length || _ad.monProjectileReturns?.length || _ad.itemArcs?.length;
      if (_hasAnim) playAnim(_ad);
    };
    const _advDelay = (gs.player.potConfinedTurns || 0) > 0 ? 120 : 400;
    const timer = setTimeout(tryAdvance, _advDelay);
    return () => clearTimeout(timer);
  }, [gs, shopMode, endTurn, playAnim, lu]);

  const performExitToHub = useCallback(() => {
    if (!onReturnToHub || !sr.current) return;
    const p = sr.current.player;
    clearGameSave();
    p.inventory.forEach((i) => trackItem(i));
    commitPendingBigboxes();
    const _hasGoal = p.inventory.some((it) => it.type === "goal");
    const payload = {
      earnedGold: p.gold,
      depth: p.depth,
      discoveries: getDiscoveries(),
      survived: true,
      returnItems: [...p.inventory],
      cleared: _hasGoal,
      identifiedEffects: [...(sr.current?.ident || [])],
    };
    setExitHubConfirm(false);
    if (_hasGoal) {
      setEndingResult(payload);
      setShowEnding(true);
    } else {
      onReturnToHub(payload);
    }
  }, [onReturnToHub]);

  const requestExitToHub = useCallback((ml) => {
    setExitHubSel(0);
    setExitHubConfirm(true);
    ml.push("ダンジョンから脱出しますか？");
  }, []);

  const performGameOverReturnToHub = useCallback(() => {
    if (!onReturnToHub || !gameOverResult) return;
    onReturnToHub(gameOverResult);
  }, [onReturnToHub, gameOverResult]);

  const lastMoveAtRef = useRef(0);
  const act = useCallback(
    (type, dx = 0, dy = 0) => {
      if (dead || !sr.current) return;
      if (animBusyRef.current) {
        /* 移動以外・interact以外のアクション（wait・罠探し等）はアニメ終了後に実行するためバッファ。
           interactは階段降下後のアニメ中にバッファすると昇り階段を踏んで逆行する問題があるため除外。 */
        if (type !== "move" && type !== "interact") pendingActRef.current = { type, dx, dy };
        return;
      }
      /* 移動の最終ガード：ハンドラが何重に呼ばれても1入力=1マス */
      if (type === "move") {
        const now = performance.now();
        if (now - lastMoveAtRef.current < 80) return;
        lastMoveAtRef.current = now;
      }
      if (revealModeRef.current) return;
      if (bigboxModeRef.current) return;
      if (nicknameModeRef.current) return;
      if (showSignRef.current) return;
      if (tpSelectModeRef.current) return;
      if (identifyModeRef.current) return;
      if (floorSelectModeRef.current) return;
      if (msgLogModeRef.current) return;
      if (showSettingsRef.current || showTileEditorRef.current) return;
      if (exitHubConfirmRef.current) return;
      if (lookMode) return;
      if (springMode || wishMode) return;
      if (putMode) return;
      if (markerMode) return;
      if (spellListMode) return;
      if (debugSpellModeRef.current) return;
      if (shopModeRef.current) return;
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
        /* チュートリアルB5Fからの下り → 完了 */
        if (sr.current.dungeonType === "tutorial" && p.depth >= 5 && dir > 0) {
          clearGameSave();
          setEndingResult({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: true, returnItems: [...p.inventory], cleared: true, isTutorial: true, identifiedEffects: [...(sr.current?.ident || [])] });
          setShowEnding(true);
          return;
        }
        const _prevDepth = p.depth; /* chgFloor が p.depth を書き換える前に保存 */
        const nd = chgFloor(p, dir);
        if (nd) {
          st.dungeon = nd;
          ml.push(`地下${p.depth}階に${dir > 0 ? "降りた" : "昇った"}。`);
          if (nd._firstVisit && FLOOR_TITLES[nd.floorType]) ml.push(FLOOR_TITLES[nd.floorType]);
          /* ── キーアイテム所持中に上昇 → 遺物の番人が出現 ── */
          if (dir === -1 && p.inventory.some(it => it.type === "goal")) {
            let _cands = [];
            for (let _gy = 0; _gy < MH; _gy++)
              for (let _gx = 0; _gx < MW; _gx++)
                if (nd.map[_gy][_gx] === T.FLOOR && !nd.monsters.some(m => m.x === _gx && m.y === _gy))
                  _cands.push([_gx, _gy]);
            const _far = _cands.filter(([x,y]) => Math.max(Math.abs(x-p.x),Math.abs(y-p.y)) >= 8);
            const _mid = _cands.filter(([x,y]) => Math.max(Math.abs(x-p.x),Math.abs(y-p.y)) >= 5);
            const _pool = _far.length ? _far : _mid.length ? _mid : _cands;
            if (_pool.length > 0) {
              const [_px, _py] = pick(_pool);
              const _baseD = sr.current.maxDepth ?? _prevDepth; /* 最深深度基準 */
              const _phMax = 60 + _baseD * 10;
              const _pSpeed = _baseD >= 20 ? 2 : 1;
              nd.monsters.push({
                id: uid(), name: "遺物の番人",
                hp: _phMax, maxHp: _phMax,
                atk: 18 + _baseD * 2,
                def: 8  + _baseD,
                exp: 150 + _baseD * 20,
                speed: _pSpeed, baseSpeed: _pSpeed, turnAccum: 0,
                tile: 58, kind: "beast", baseKind: "pursuer",
                monLevel: 1, isBoss: true, aware: true,
                x: _px, y: _py,
                dir: { x: 0, y: 0 }, lastPx: p.x, lastPy: p.y, patrolTarget: null,
              });
              ml.push("キーアイテムを察知した遺物の番人が現れた！");
            }
          }
          acted = true;
        }
      };
      if (p.sleepTurns > 0 || p.paralyzeTurns > 0 || (p.frozenTurns || 0) > 0 || p.slowSkip || (p.potConfinedTurns || 0) > 0) return;
      if (type === "inventory") {
        setSpellListMode(false);
        setShowInv((v) => {
          if (v) { dropModeRef.current = false; setDropMode(false); }
          return !v;
        });
        setSelIdx(0);
        setInvPage(0);
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
      if ((p.frozenTurns || 0) > 0) {
        p.frozenTurns--;
        ml.push(p.frozenTurns > 0
          ? `凍りついている...あと${p.frozenTurns}ターン`
          : "氷が解けた！動けるようになった！");
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
        /* ===== 捕獲状態：からめ鬼を倒すまで移動不可（攻撃は可） ===== */
        if (p.capturedBy) {
          const _capMon = dg.monsters.find((m) => m.id === p.capturedBy);
          if (!_capMon) {
            p.capturedBy = null; /* 既に倒されていたらクリア */
          } else {
            /* 距離が離れた or 捕獲者が状態異常なら即解放 */
            const _capDist = Math.max(Math.abs(p.x - _capMon.x), Math.abs(p.y - _capMon.y));
            const _capBadStatus = (_capMon.sleepTurns || 0) > 0 || _capMon.paralyzed || (_capMon.confusedTurns || 0) > 0 ||
              (_capMon.darknessTurns || 0) > 0 || (_capMon.fleeingTurns || 0) > 0 || _capMon.sealed || _capMon.bewitched ||
              (_capMon.poisonedTurns || 0) > 0 || (_capMon.immobileTurns || 0) > 0 || _capMon.blind || (_capMon.oilyTurns || 0) > 0;
            if (_capDist > 1 || _capBadStatus) {
              p.capturedBy = null;
              ml.push("捕獲から解放された！");
              /* そのまま移動処理へ進む */
            } else {
              const _capNx = p.x + dx, _capNy = p.y + dy;
              const _capTarget = monsterAt(dg, _capNx, _capNy);
              if (!_capTarget) {
                /* 敵がいない方向への移動は不可（隣接する敵への攻撃は可） */
                ml.push(`${_capMon.name}に捕まっている！倒さなければ逃げられない！`);
                endTurn(st, p, ml);
                setMsgs((prev) => [...prev.slice(-80), ...ml]);
                sr.current = { ...st };
                setGs({ ...st });
                return;
              }
              /* 隣接している敵（からめ鬼でなくても）への攻撃は可 */
            }
          }
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
              const _bumpShop = getShops(dg).find(s => s.shopkeeperId === attackMon.id);
              if (_bumpShop) {
                const _bumpFis = dg.items.filter(
                  (i) => !i.shopPrice && i.x >= _bumpShop.room.x && i.x < _bumpShop.room.x + _bumpShop.room.w &&
                    i.y >= _bumpShop.room.y && i.y < _bumpShop.room.y + _bumpShop.room.h,
                );
                if (_bumpFis.length > 0) {
                  setShopMode("sell"); setShopMenuSel(0);
                  ml.push("店主：「買い取りましょうか？」");
                } else if (_bumpShop.unpaidTotal > 0) {
                  setShopMode("pay"); setShopMenuSel(0);
                  ml.push(`店主：「お代は${_bumpShop.unpaidTotal}Gです。」`);
                } else {
                  setShopMode("browse"); setShopMenuSel(0);
                  ml.push("店主：「いらっしゃいませ！」");
                }
              }
            } else if ((p.pacifistTurns || 0) > 0) {
              ml.push(`平和主義状態のため攻撃できない！(残り${p.pacifistTurns}ターン)`);
              acted = true;
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
              let ap = Math.max(1, Math.floor((p.atk + (p.weapon?.atk || 0) + (p.weapon?.plus || 0) + _ringPowerBonus) * ((p.spicyAtkTurns || 0) > 0 ? 1.5 : 1) * ((p.atkDebuffTurns || 0) > 0 ? 0.5 : 1)));
              if ((p.garlicDmgTurns || 0) > 0) ap += 5;
              const _getBaneMult = (a) => {
                if (!a?.startsWith("bane_")) return 0;
                const _isSuper = a.endsWith("_2");
                const _kind = _isSuper ? a.slice(5, -2) : a.slice(5);
                const _hit = _kind === "float" ? attackMon.float : attackMon.kind === _kind;
                return _hit ? (_isSuper ? 2.0 : 1.5) : 0;
              };
              const _baneMult = Math.max(_getBaneMult(wab), ...((p.weapon?.abilities || []).map(a => _getBaneMult(a))));
              const _isBane = _baneMult > 1;
              if (_isBane) ap = Math.floor(ap * _baneMult);
              let d = calcAtkDefDmg(ap, attackMon.def || 0, { defWeight: 1 });
              if (p.weapon?.blessed) d += 3;
              let crit = false;
              const _sesameCritRate = (p.sesameCritTurns || 0) > 0 ? 0.45 : 0.25;
              if (wabHas("critical") && Math.random() < _sesameCritRate) {
                d *= 2;
                crit = true;
              }
              /* 背水の指輪：HP低下で会心率上昇（HP20%以下で必ず会心、75%以下から発動） */
              if (!crit && hasRingEffect(p, "desperation_ring")) {
                const _despRatio = p.hp / p.maxHp;
                const _despChance = _despRatio <= 0.2 ? 1.0 : Math.max(0, (0.75 - _despRatio) / 0.55);
                if (Math.random() < _despChance) { d *= 2; crit = true; }
              }
              /* 炎属性武器：fire弱点×(1.5/2)、油まみれ×(1.5/2)、火ダルマ×0.5 */
              const _hasFireElem2 = wab === "fire_elem_2" || p.weapon?.abilities?.some(a => a === "fire_elem_2");
              const _hasFireElem  = _hasFireElem2 || wab === "fire_elem" || p.weapon?.abilities?.some(a => a === "fire_elem");
              const _fireElemMult = _hasFireElem2 ? 2.0 : 1.5;
              if (_hasFireElem) {
                if (attackMon.baseKind === "firedemon") {
                  d = Math.max(1, Math.floor(d * 0.5));
                } else if (attackMon.elemResist === "fire") {
                  d = Math.max(1, Math.floor(d * 0.5));
                } else if (attackMon.elemWeak === "fire") {
                  d = Math.floor(d * _fireElemMult);
                } else {
                  const _feOily = (attackMon.oilyTurns||0)>0 || dg.oilyTiles?.some(t=>t.x===attackMon.x&&t.y===attackMon.y);
                  if (_feOily) d = Math.floor(d * _fireElemMult);
                }
              }
              /* 氷属性武器：ice弱点×(1.5/2) */
              const _hasIceElem2 = wab === "ice_elem_2" || p.weapon?.abilities?.some(a => a === "ice_elem_2");
              const _hasIceElem  = _hasIceElem2 || wab === "ice_elem" || p.weapon?.abilities?.some(a => a === "ice_elem");
              const _iceElemMult = _hasIceElem2 ? 2.0 : 1.5;
              if (_hasIceElem && attackMon.elemWeak === "ice") {
                d = Math.floor(d * _iceElemMult);
              }
              /* 雷属性武器：thunder弱点×(1.5/2) */
              const _hasThunderElem2 = wab === "thunder_elem_2" || p.weapon?.abilities?.some(a => a === "thunder_elem_2");
              const _hasThunderElem  = _hasThunderElem2 || wab === "thunder_elem" || p.weapon?.abilities?.some(a => a === "thunder_elem");
              const _thunderElemMult = _hasThunderElem2 ? 2.0 : 1.5;
              if (_hasThunderElem && attackMon.elemWeak === "thunder") {
                d = Math.floor(d * _thunderElemMult);
              }
              /* 脆弱の魔方陣チェック：祝福4倍/通常2倍/呪い半減（魔法無効モンスターには無効） */
              const _vulnRoom = findRoom(dg.rooms, attackMon.x, attackMon.y);
              const _vulnPc = !attackMon.magicImmune && _vulnRoom && dg.pentacles?.find((pc) => pc.kind === "vulnerability" && pc.x >= _vulnRoom.x && pc.x < _vulnRoom.x + _vulnRoom.w && pc.y >= _vulnRoom.y && pc.y < _vulnRoom.y + _vulnRoom.h);
              if (_vulnPc) d = _vulnPc.cursed ? Math.max(1, Math.floor(d / 2)) : d * (_vulnPc.blessed ? 4 : 2);
              /* 壁の中の壁歩きモンスターへの攻撃：ダメージ半減 */
              const _atkInWall = attackMon.wallWalker && dg.map[attackMon.y]?.[attackMon.x] === T.WALL;
              if (_atkInWall) d = Math.max(1, Math.floor(d / 2));
              /* 水晶スライム系：固定ダメージ以外は1ダメージ（近接は非固定扱い） */
              d = clampDmgFixed(attackMon, d, true);
              /* 平和の指輪：近接与ダメージを1に */
              if (hasRingEffect(p, "peace_ring")) d = 1;
              wakeIfDormant(attackMon, ml);
              /* ── ガーディアンチェック：隣接する guardian が肩代わり ── */
              const _guardMon = dg.monsters.find(gm =>
                gm !== attackMon && gm.subtype === "guardian" &&
                Math.abs(gm.x - attackMon.x) <= 1 && Math.abs(gm.y - attackMon.y) <= 1
              );
              if (_guardMon) {
                ml.push(`ガーディアンが${attackMon.name}をかばった！`);
                if (!consumeBarrier(_guardMon, ml)) {
                  _guardMon.hp -= d;
                  ml.push(`ガーディアンに${d}ダメージ！`);
                }
                _ad.attacks.push({ type: "attack", x: attackMon.x, y: attackMon.y, dx, dy });
                _ad.damages.push({ type: "damage", x: _guardMon.x, y: _guardMon.y, value: d, color: "#ff4444" });
                if (_guardMon.hp <= 0) {
                  _ad.damages.push({ type: "flash", x: _guardMon.x, y: _guardMon.y, color: "#ff2200", duration: 150 });
                  killMonster(_guardMon, dg, p, ml, lu);
                }
                acted = true;
              } else {
              /* タトゥーバード: 50%ひらりと回避 */
              const _tbDodge = attackMon.subtype === "tattoobird" && Math.random() < 0.50;
              if (_tbDodge) {
                ml.push(`${attackMon.name}はひらりとかわした！`);
                _ad.attacks.push({ type: "attack", x: attackMon.x, y: attackMon.y, dx, dy });
                acted = true;
              } else {
              /* フェザーガード: 50%ダメージ半減 */
              if (attackMon.subtype === "tattoobird" && Math.random() < 0.50) {
                d = Math.max(1, Math.floor(d / 2));
                ml.push(`フェザーガード！${attackMon.name}はダメージを半減した！`);
              }
              attackMon.hp -= d;
              if (attackMon.type === "shopkeeper" && attackMon.state !== "hostile") {
                attackMon.state = "hostile";
                ml.push("店主が怒った！");
              }
              const atkSfx =
                (crit ? "会心！" : "") +
                (_isBane ? (_baneMult >= 2 ? "上位特効！" : "特効！") : "") +
                (_hasFireElem && (attackMon.baseKind === "firedemon" || attackMon.elemResist === "fire") ? "（炎半減）" : "") +
                (_hasFireElem && attackMon.elemWeak === "fire" ? "炎×2！" : "") +
                (_hasFireElem && attackMon.baseKind !== "firedemon" && attackMon.elemResist !== "fire" && attackMon.elemWeak !== "fire" && ((attackMon.oilyTurns||0)>0 || dg.oilyTiles?.some(t=>t.x===attackMon.x&&t.y===attackMon.y)) ? "油まみれ炎×2！" : "") +
                (_hasIceElem && attackMon.elemWeak === "ice" ? (_hasIceElem2 ? "氷弱点×2！" : "氷弱点特効！") : "") +
                (_hasThunderElem && attackMon.elemWeak === "thunder" ? "雷×2！" : "") +
                (_atkInWall ? "（壁越し・半減）" : "");
              ml.push(`${attackMon.name}に${d}ダメージ！${atkSfx}`);
              /* 吸血の指輪：与ダメの1/8をHP吸収 */
              if (hasRingEffect(p, "vampire_ring")) {
                const _vamp = Math.max(1, Math.floor(d / 8));
                p.hp = Math.min(p.maxHp, p.hp + _vamp);
                ml.push(`吸血でHP+${_vamp}！`);
              }
              /* 吸血武器：与ダメの30%をHP回復 */
              if (wabHas("lifesteal")) {
                const _ls = Math.max(1, Math.floor(d * 0.3));
                p.hp = Math.min(p.maxHp, p.hp + _ls);
                ml.push(`吸血でHP+${_ls}！`);
              }
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
              if (attackMon.hp > 0 && !attackMon.magicImmune && dg.pentacles?.length > 0 && !inMagicSealRoom(p.x, p.y, dg)) {
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
                  ["inflict_slow",     () => { if (attackMon.isBoss && attackMon._preSlowSpeed === undefined) attackMon._preSlowSpeed = attackMon.speed; attackMon.speed = Math.max(0.25, (attackMon.speed || 1) * 0.5); if (attackMon.isBoss) attackMon.bossSlowTurns = (attackMon.bossSlowTurns || 0) + 10; ml.push(`${attackMon.name}は鈍足になった！${attackMon.isBoss ? "(5ターン)" : "(永続)"}`); }],
                  ["inflict_paralyze", () => { attackMon.paralyzed = true; if (attackMon.isBoss) attackMon.paralyzeTurns = Math.max(attackMon.paralyzeTurns||0, 25); ml.push(`${attackMon.name}は金縛りになった！${attackMon.isBoss ? "(13ターン)" : "(永続・被弾で解除)"}`); }],
                  ["inflict_sleep",    () => { attackMon.sleepTurns = (attackMon.sleepTurns || 0) + 6; ml.push(`${attackMon.name}は眠りに落ちた！(${attackMon.isBoss ? 3 : 6}ターン)`); }],
                  ["inflict_darkness", () => { attackMon.blind = true; attackMon.blindTurns = (attackMon.blindTurns || 0) + (attackMon.isBoss ? 25 : 50); ml.push(`${attackMon.name}は暗闇になった！${attackMon.isBoss ? "(13ターン)" : "(永続)"}`); }],
                  ["inflict_confuse",  () => { attackMon.confusedTurns = (attackMon.confusedTurns || 0) + (attackMon.isBoss ? 10 : 20); ml.push(`${attackMon.name}は混乱した！(${attackMon.isBoss ? 5 : 20}ターン)`); }],
                  ["inflict_bewitch",  () => { attackMon.fleeingTurns = (attackMon.fleeingTurns || 0) + (attackMon.isBoss ? 25 : 50); ml.push(`${attackMon.name}は幻惑状態になり逃げ出した！(${attackMon.isBoss ? 13 : 50}ターン)`); }],
                  ["inflict_seal",     () => { attackMon.sealed = true; attackMon.sealedTurns = (attackMon.sealedTurns || 0) + (attackMon.isBoss ? 25 : 50); ml.push(`${attackMon.name}は封印された！${attackMon.isBoss ? "(13ターン)" : "(永続)"}`); }],
                ];
                for (const [abId, fn] of _inflicts) {
                  if (wabHas(abId) && Math.random() < 0.1) fn();
                }
                /* 影縫い：25%の確率で移動封じ3ターン */
                if (attackMon.hp > 0 && wabHas("inflict_immobile") && Math.random() < 0.25) {
                  attackMon.immobileTurns = (attackMon.immobileTurns || 0) + (attackMon.isBoss ? 6 : 3);
                  ml.push(`${attackMon.name}は影に縫い止められた！(3ターン)`);
                }
              }
              if (attackMon.hp <= 0 && dg.monsters.includes(attackMon)) { trackMonster(attackMon); killMonster(attackMon, dg, p, ml, lu); }
              /* 連撃：2回目の攻撃（威力60%、クリ・状態異常なし） */
              if (wabHas("double_strike") && attackMon.hp > 0 && dg.monsters.includes(attackMon)) {
                const _d2 = Math.max(1, Math.floor(d * 0.6));
                attackMon.hp -= _d2;
                ml.push(`連撃！${attackMon.name}にさらに${_d2}ダメージ！`);
                _ad.damages.push({ type: "damage", x: attackMon.x, y: attackMon.y, value: _d2, color: "#ff8800" });
                if (attackMon.hp <= 0 && dg.monsters.includes(attackMon)) {
                  _ad.damages.push({ type: "flash", x: attackMon.x, y: attackMon.y, color: "#ff2200", duration: 150 });
                  killMonster(attackMon, dg, p, ml, lu);
                }
              }
              /* 反動：攻撃するたびに自分も2〜4ダメージ */
              if (wabHas("recoil")) {
                const _rcd = rng(2, 4);
                p.deathCause = "武器の反動ダメージにより";
                p.hp -= _rcd;
                ml.push(`武器の反動で${_rcd}ダメージを受けた！`);
              }
              acted = true;
              } /* end !_tbDodge */
              } /* end guardian else */
              } /* end else (hit) */
            /* 射撃の指輪：命中/外れに関わらず発動（矢種別の本来の効果を再現） */
            {
              const _srCount = (p.rings || []).filter(r => r.effect === "shoot_ring").length;
              if (_srCount > 0) {
                const _rawFc = getFarcastMode(p.x, p.y, dg);
                const _fcMode = (hasRingEffect(p, "farcast_ring") && _rawFc !== "cursed") ? "farcast" : _rawFc;
                const _srFarcast = _fcMode === "farcast";
                const _srCursedFc = _fcMode === "cursed";
                const _srNF = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames) || "?";
                for (let _si = 0; _si < _srCount; _si++) {
                  if (!p.arrow || p.arrow.count <= 0) break;
                  const _srAr = p.arrow;
                  const _arName = _srAr.name || "矢";
                  p.arrow.count--;
                  /* ── 石 ── */
                  if (_srAr.stone) {
                    pushBoltAnim(p.x, p.y, dx, dy, dg, "#aaaaaa", true);
                    const _stRange = _srCursedFc ? 1 : 3;
                    let _stLx = p.x, _stLy = p.y;
                    let _stHitStatue = false;
                    for (let _d = 1; _d <= _stRange; _d++) {
                      const _tx = p.x + dx * _d, _ty = p.y + dy * _d;
                      if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH) break;
                      if (dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) break;
                      _stLx = _tx; _stLy = _ty;
                      if (statueAt(dg, _tx, _ty)) { _stHitStatue = true; break; }
                    }
                    ml.push(`【射撃の指輪】${_arName}を投げた！`);
                    if (_stHitStatue) {
                      ml.push(`${_arName}が石像に命中！`);
                      hitStatueWithAction(dg, _stLx, _stLy, p, ml, lu, p?.depth, { breaks: true });
                    } else {
                    const _stM = monsterAt(dg, _stLx, _stLy);
                    if (_stM && _stM.subtype === "reflector") {
                      ml.push(`${_arName}が${_stM.name}に弾き返された！`);
                      const _stRdx = Math.sign(p.x - _stLx), _stRdy = Math.sign(p.y - _stLy);
                      let _stRx = _stLx, _stRy = _stLy, _stRHit = false;
                      for (let _stri = 1; _stri <= 20; _stri++) {
                        const _stNx = _stRx + _stRdx, _stNy = _stRy + _stRdy;
                        if (_stNx < 0 || _stNx >= MW || _stNy < 0 || _stNy >= MH) break;
                        if (dg.map[_stNy][_stNx] === T.WALL || dg.map[_stNy][_stNx] === T.BWALL) break;
                        if (_stNx === p.x && _stNy === p.y) { _stRHit = true; break; }
                        _stRx = _stNx; _stRy = _stNy;
                      }
                      if (_stRHit) {
                        const _stRefDmg = calcProjectileDmg(p, _srAr.atk || 3, 0);
                        p.hp -= _stRefDmg;
                        p.deathCause = `${_stM.name}に跳ね返された${_arName}で`;
                        ml.push(`跳ね返された${_arName}がプレイヤーに命中！${_stRefDmg}ダメージ！消滅した。`);
                      } else {
                        const _stRft = new Set(); placeItemAt(dg, _stRx, _stRy, makeStone(1), ml, _stRft);
                      }
                    } else if (_stM && Math.random() < 0.90) {
                      const _stDmg = clampDmgFixed(_stM, calcProjectileDmg(p, _srAr.atk || 3, _stM.def), true);
                      _stM.hp -= _stDmg; ml.push(`${_arName}が${_stM.name}に命中！${_stDmg}ダメージ！`);
                      if (_stM.type === "shopkeeper" && _stM.state !== "hostile") { _stM.state = "hostile"; ml.push("店主が怒った！"); }
                      _ad.damages.push({ type: "damage", x: _stM.x, y: _stM.y, value: _stDmg, color: "#aaaaaa" });
                      if (_stM.hp <= 0) { _ad.damages.push({ type: "flash", x: _stM.x, y: _stM.y, color: "#ff2200", duration: 150 }); killMonster(_stM, dg, p, ml, lu, false); }
                    } else {
                      if (_stM) ml.push(`${_arName}は${_stM.name}に外れた！`);
                      const _stft = new Set(); placeItemAt(dg, _stLx, _stLy, makeStone(1), ml, _stft);
                    }
                    }
                  /* ── 魔法の石 ── */
                  } else if (_srAr.magicStone) {
                    pushBoltAnim(p.x, p.y, dx, dy, dg, "#cc88ff", true);
                    const _msDist = (mn) => Math.hypot(mn.x - p.x, mn.y - p.y);
                    const _msTarget = [...dg.monsters].filter(mn => Math.max(Math.abs(mn.x - p.x), Math.abs(mn.y - p.y)) <= 10).sort((a, b) => _msDist(a) - _msDist(b))[0];
                    ml.push(`【射撃の指輪】${_arName}を投げた！`);
                    if (!_msTarget) {
                      ml.push(`近くに敵がいない！${_arName}は消えた。`);
                    } else if (Math.random() >= 0.90) {
                      ml.push(`${_arName}は${_msTarget.name}に外れ、足元に落ちた！`);
                      const _msft = new Set(); placeItemAt(dg, _msTarget.x, _msTarget.y, makeMagicStone(1), ml, _msft);
                    } else {
                      const _msDmg = clampDmgFixed(_msTarget, calcProjectileDmg(p, _srAr.atk || 5, _msTarget.def), true);
                      _msTarget.hp -= _msDmg; ml.push(`${_arName}が${_msTarget.name}にホーミング命中！${_msDmg}ダメージ！`);
                      _ad.damages.push({ type: "damage", x: _msTarget.x, y: _msTarget.y, value: _msDmg, color: "#cc88ff" });
                      if (_msTarget.hp <= 0) { _ad.damages.push({ type: "flash", x: _msTarget.x, y: _msTarget.y, color: "#ff2200", duration: 150 }); killMonster(_msTarget, dg, p, ml, lu, false); }
                    }
                  /* ── 爆弾矢 ── */
                  } else if (_srAr.bombArrow) {
                    pushBoltAnim(p.x, p.y, dx, dy, dg, "#ff6622", true);
                    ml.push(`【射撃の指輪】${_arName}を射った！`);
                    if (_srFarcast) {
                      ml.push(`${_arName}は消滅した。`);
                    } else {
                      const _baMaxR = _srCursedFc ? 1 : 10;
                      let _baLx = p.x, _baLy = p.y;
                      for (let _d = 1; _d <= _baMaxR; _d++) {
                        const _tx = p.x + dx * _d, _ty = p.y + dy * _d;
                        if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH) break;
                        if (dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) break;
                        const _baM = monsterAt(dg, _tx, _ty);
                        if (_baM) {
                          const _baDmg = calcProjectileDmg(p, _srAr.atk || 6, _baM.def);
                          _baM.hp -= _baDmg; ml.push(`${_arName}が${_baM.name}に命中！${_baDmg}ダメージ！`);
                          if (_baM.type === "shopkeeper" && _baM.state !== "hostile") { _baM.state = "hostile"; ml.push("店主が怒った！"); }
                          _ad.damages.push({ type: "damage", x: _baM.x, y: _baM.y, value: _baDmg, color: "#ff6622" });
                          if (_baM.hp <= 0) { _ad.damages.push({ type: "flash", x: _baM.x, y: _baM.y, color: "#ff2200", duration: 150 }); killMonster(_baM, dg, p, ml, lu, false); }
                          _baLx = _tx; _baLy = _ty; break;
                        }
                        _baLx = _tx; _baLy = _ty;
                      }
                      if (!isFireExplosionNullified(dg, p)) ml.push("爆発！");
                      doExplosion(_baLx, _baLy, dg, p, ml, _srNF, "爆弾矢の爆発", null, lu);
                    }
                  /* ── 通常矢 / 毒矢 / 貫きの矢 ── */
                  } else {
                    const _isPierce = !!_srAr.pierce;
                    const _isPoison = !!_srAr.poison;
                    const _arColor = _isPoison ? "#60d060" : _isPierce ? "#ff8844" : "#d0a050";
                    const _dropFn = () => _isPierce ? makePiercingArrow(1) : _isPoison ? makePoisonArrow(1) : makeArrow(1);
                    const _srBaseAtk = _srAr.atk || 3;
                    const _arEndDrop = (lx, ly, mlx) => {
                      if (_srFarcast || _srCursedFc) { mlx.push(`【射撃の指輪】${_arName}は消滅した。`); return; }
                      mlx.push(`【射撃の指輪】${_arName}を発射した。`);
                      const _ft = new Set(); placeItemAt(dg, lx, ly, _dropFn(), mlx, _ft);
                    };
                    _resolveBolt(p, dg, p, ml, lu, {
                      isPlayerShooter: true,
                      dx, dy,
                      baseRange: 10,
                      pierce: _isPierce,
                      animColor: _arColor,
                      boltName: _arName,
                      calcMonDmg: (mon) => clampDmgFixed(mon, calcProjectileDmg(p, _srBaseAtk, mon.def), true),
                      calcPlDmg: () => calcProjectileDmg(p, _srBaseAtk, 0),
                      onPlHit: (mlx) => {
                        if (_isPoison && !hasRingEffect(p, "antidote_ring")) {
                          p.poisoned = true; mlx.push("毒を受けた！");
                        }
                      },
                      onMonHit: (mon, mlx) => {
                        /* 命中率75%（auto-fireは sureHit/forceMiss/dodge魔方陣を考慮しない） */
                        if (Math.random() >= 0.75) {
                          if (_isPierce) { mlx.push(`【射撃の指輪】${_arName}は${mon.name}をすり抜けた！`); return; }
                          mlx.push(`【射撃の指輪】${_arName}は${mon.name}に外れた！`);
                          const _mft = new Set(); placeItemAt(dg, mon.x, mon.y, _dropFn(), mlx, _mft);
                          return;
                        }
                        const _srDmg = clampDmgFixed(mon, calcProjectileDmg(p, _srBaseAtk, mon.def), true);
                        mon.hp -= _srDmg;
                        if (mon.type === "shopkeeper" && mon.state !== "hostile") { mon.state = "hostile"; mlx.push("店主が怒った！"); }
                        if (_isPoison) {
                          if (mon.isBoss) {
                            if (!mon.bossPoisonHalfAtk) { mon.bossPoisonOrigAtk = mon.atk; mon.bossPoisonHalfAtk = true; mon.bossPoisonHalfAtkTurns = 10; }
                            mon.atk = Math.max(1, Math.floor(mon.atk / 2));
                          } else {
                            mon.atk = Math.max(1, Math.floor((mon.atk || 1) / 2));
                          }
                        }
                        mlx.push(`【射撃の指輪】${_arName}が${mon.name}に命中！${_srDmg}ダメージ！${_isPoison ? "攻撃力が半減した！" : ""}`);
                        _ad.damages.push({ type: "damage", x: mon.x, y: mon.y, value: _srDmg, color: _arColor });
                        if (mon.hp <= 0) { _ad.damages.push({ type: "flash", x: mon.x, y: mon.y, color: "#ff2200", duration: 150 }); killMonster(mon, dg, p, mlx, lu, false); }
                      },
                      onWallStop: _arEndDrop,
                      onFlyOff: _arEndDrop,
                    });
                  }
                  if (p.arrow && p.arrow.count <= 0) {
                    p.inventory = p.inventory.filter(i => i !== _srAr);
                    p.arrow = null;
                    ml.push(`${_arName}を使い切った。`);
                  }
                }
              }
            }
            }
          } else if (dg.map[ny][nx] === T.WATER && !canPlayerWalkOnWater(p, dg)) {
            ml.push("水に阻まれた。");
          } else if (dg.statues?.some(s => s.x === nx && s.y === ny)) {
            /* 移動で突っ込んでも壊さない。表示のみ・ターン消費なし */
            ml.push("石像がある。");
          } else if (dg.map[ny][nx] !== T.WALL && dg.map[ny][nx] !== T.BWALL || ((p.wallWalkTurns || 0) > 0 && nx > 0 && nx < MW - 1 && ny > 0 && ny < MH - 1)) {
            /* 呪われた聖域の魔方陣：プレイヤーは通行できない */
            const _cursedSanc = dg.pentacles?.find(pc => pc.kind === "sanctuary" && pc.cursed && pc.x === nx && pc.y === ny);
            if (_cursedSanc) {
              ml.push("呪われた魔方陣が行く手を阻んでいる！");
            } else {
            const _allShopsM = getShops(dg);
            const _inShopRoomM = (x, y) => _allShopsM.some(s => s.room && x >= s.room.x && x < s.room.x + s.room.w && y >= s.room.y && y < s.room.y + s.room.h);
            const _wasInShopOf = _allShopsM.filter(s => s.unpaidTotal > 0 && s.room &&
              p.x >= s.room.x && p.x < s.room.x + s.room.w &&
              p.y >= s.room.y && p.y < s.room.y + s.room.h);
            const _wasInAnyShop = _inShopRoomM(p.x, p.y);
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
            const _isNowInShop = _inShopRoomM(p.x, p.y);
            if (!_wasInAnyShop && _isNowInShop) ml.push("お店に入った。");
            else if (_wasInAnyShop && !_isNowInShop) ml.push("お店をあとにした。");
            acted = true;
            /* 移動で回転板を踏んだ時は敵移動後に発動（理不尽攻撃防止） */
            const _spinHere = !isPlayerFloating(p, dg) && dg.traps.find(t => t.x === p.x && t.y === p.y && t.effect === "spin");
            if (_spinHere) {
              trackTrap(_spinHere);
              _spinHere.revealed = true;
              st._pendingSpin = _spinHere;
            } else {
            const tr = checkTrap(p, dg, ml);
            if (tr === "pitfall") {
              const nd = chgFloor(p, 1, true);
              if (nd) {
                st.dungeon = nd;
                ml.push(`地下${p.depth}階に落ちた！`);
              }
            } else if (tr === "deferred_explosion") {
              /* 地雷：モンスター移動後に爆発（dg._pendingMineExplosion → endTurn） */
            }
            }
            /* ポータルの魔方陣：移動でその上に乗ると即発動 */
            if (playerPortalWarp(p, st, ml)) st._portalWarpedThisTurn = true;
            applySoakedFromWaterWalk(p, dg, ml);
            autoPickup(p, st.dungeon, ml);
            /* 看板：踏んだらポップアップ表示（ダッシュ中断・メッセージログには出さない） */
            const _signStep = st.dungeon.items.find(it => it.type === "sign" && it.x === p.x && it.y === p.y);
            if (_signStep) { setShowSign(_signStep); }
            if (dg.map[p.y][p.x] === T.SD) ml.push("下り階段がある。");
            if (dg.map[p.y][p.x] === T.SU) ml.push("上り階段がある。");
            {
              const _fsStep = st.dungeon.traps?.find(t => t.x === p.x && t.y === p.y && t.disguise && !t.revealed);
              if (_fsStep) ml.push(_fsStep.disguise === "stair_up" ? "上り階段がある。" : "下り階段がある。");
            }
            const _ventStep = st.dungeon.vents?.find(v => v.x === p.x && v.y === p.y);
            if (_ventStep) ml.push("風穴がある。風が流れている…");
            const _statueStep = st.dungeon.statues?.find(s => s.x === p.x && s.y === p.y);
            if (_statueStep) ml.push("石像がある。");
            const _bbStep = st.dungeon.bigboxes?.find(b => b.x === p.x && b.y === p.y);
            if (_bbStep) { ml.push(`${bbDisplayName(_bbStep, sr.current, _bbStep.revealed === true || !!sr.current?.allBcKnown)}がある。`); }
            const _sprStep = st.dungeon.springs?.find((s) => s.x === p.x && s.y === p.y);
            if (_sprStep) ml.push("泉がある。");
            const _pentStep = st.dungeon.pentacles?.find((pc) => pc.x === p.x && pc.y === p.y);
            if (_pentStep) ml.push(`${_pentStep.name}の上にいる。`);
            /* 隠し部屋／宝物庫の発見メッセージ */
            const _hrFound = st.dungeon.hiddenRooms?.find(hr =>
              !hr.discovered &&
              p.x >= hr.x && p.x < hr.x + hr.w &&
              p.y >= hr.y && p.y < hr.y + hr.h
            );
            if (_hrFound) {
              _hrFound.discovered = true;
              ml.push(_hrFound.isTreasureVault ? "★ 宝物庫を発見した！" : "★ 隠し部屋を発見した！");
            }
            /* 騒音防具：新しい部屋に入った時、同部屋の敵が全員目を覚ます */
            if (hasAbility(p.armor, "noisy")) {
              const _noisyOldRoom = findRoom(dg.rooms, _oldPx, _oldPy);
              const _noisyNewRoom = findRoom(dg.rooms, p.x, p.y);
              if (_noisyNewRoom && _noisyNewRoom !== _noisyOldRoom) {
                let _noisyWoke = 0;
                for (const _nm of dg.monsters) {
                  const _nmRoom = findRoom(dg.rooms, _nm.x, _nm.y);
                  if (_nmRoom === _noisyNewRoom && !_nm.aware) {
                    _nm.aware = true;
                    _noisyWoke++;
                  }
                }
                if (_noisyWoke > 0) ml.push(`騒がしい音が響いた！（${_noisyWoke}体が目を覚ました）`);
              }
            }
            /* 足音の指輪：移動するたび、同部屋 or チェビシェフ距離4以内の敵を起こす */
            if (hasRingEffect(p, "footstep_ring") && (p.x !== _oldPx || p.y !== _oldPy)) {
              const _fsRoom = findRoom(dg.rooms, p.x, p.y);
              let _fsWoke = 0;
              for (const _fm of dg.monsters) {
                if (_fm.aware && !_fm.dormant && !_fm.dormantHouse) continue;
                const _fmRoom = findRoom(dg.rooms, _fm.x, _fm.y);
                const _near = Math.max(Math.abs(_fm.x - p.x), Math.abs(_fm.y - p.y)) <= 4;
                if ((_fsRoom && _fmRoom === _fsRoom) || _near) {
                  wakeIfDormant(_fm, ml);
                  _fm.aware = true;
                  _fsWoke++;
                }
              }
              if (_fsWoke > 0) ml.push(`足音が響いた！（${_fsWoke}体が目を覚ました）`);
            }
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
              requestExitToHub(ml);
              sr.current = { ...st }; setGs({ ...st });
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
              requestExitToHub(ml);
              sr.current = { ...st }; setGs({ ...st });
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
            setMsgs((prev) => [...prev.slice(-80), `${bbDisplayName(bb2, sr.current, bb2.revealed === true || !!sr.current?.allBcKnown)}がある。どうする？`]);
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
            if (_grIt.type === "sign") {
              setShowSign(_grIt);
            } else if (_grIt.type === "gold") {
              p.gold += _grIt.value;
              ml.push(`${_grIt.value}枚の金貨を拾った！`);
              removeFloorItem(dg, _grIt);
            } else if (_grIt.type === "arrow" && (_grIt.stone || _grIt.magicStone) && !_grIt.shopPrice) {
              if (addStonesInv(p.inventory, _grIt.count, !!_grIt.magicStone, p.maxInventory || 30)) {
                ml.push(`${_grIt.name}(${_grIt.count}個)を拾った。`);
                removeFloorItem(dg, _grIt);
              } else ml.push("持ち物がいっぱいだ！");
            } else if (_grIt.type === "arrow" && !_grIt.shopPrice) {
              if (addArrowsInv(p.inventory, _grIt.count, !!_grIt.poison, !!_grIt.pierce, p.maxInventory || 30, !!_grIt.bombArrow, !!_grIt.strong)) {
                ml.push(`${_grIt.name || "矢"}(${_grIt.count}本)を拾った。`);
                removeFloorItem(dg, _grIt);
              } else ml.push("持ち物がいっぱいだ！");
            } else if (p.inventory.length >= (p.maxInventory || 30)) ml.push("持ち物がいっぱいだ！");
            else {
              if (sr.current.allBcKnown) { _grIt.fullIdent = true; _grIt.bcKnown = true; }
              if (_grIt.charges != null) _grIt._origCharges = _grIt._origCharges ?? _grIt.charges;
              p.inventory.push(_grIt);
              if (_grIt.shopPrice) {
                const _allS2 = getShops(dg);
                const _pickShop = _allS2.find(s => s.id === _grIt._shopId) || _allS2[0];
                if (_pickShop) {
                  const _actualPrice = applyShopUnpaidCharge(_grIt, _pickShop, p);
                  const _sk2 = dg.monsters.find((m) => m.id === _pickShop.shopkeeperId && m.state === "friendly");
                  if (_sk2) _sk2.state = "blocking";
                  ml.push(`${itemDisplayName(_grIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を取った！(${_actualPrice}G${shopPriceNote(p)}) 店主が入り口をふさいだ。`);
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
                const _tr2 = fireTrapPlayer(_trapHere, p, dg, ml, _tnFn, lu, { ident: sr.current?.ident });
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
        else if (_de.type === "splash") (_ad.splashes = _ad.splashes || []).push(_de);
        else if (_de.type === "explosion") (_ad.explosions = _ad.explosions || []).push(_de);
        else if (_de.type === "damage") _ad.damages.push(_de);
        else if (_de.type === "flash") (_ad.flashes = _ad.flashes || []).push(_de);
      }
      const _itemArcBatches = drainItemArcs();
      if (_itemArcBatches.length) {
        _ad.itemArcs = _itemArcBatches;
        /* setGs前にアイテム参照ベースで設定 → 同座標の既存アイテムは隠さない */
        flyingItemsRef.current = new Set(_itemArcBatches.flat().filter(a => a.itemRef).map(a => a.itemRef));
      }
      sr.current = { ...st };
      setGs({ ...st });
      if (drainHungerWarn() || drainPinchAlert()) setRevealMode({ pendingMsgs: [] });
      /* Play animations if any were queued */
      const _hasAnim = _ad.playerMove || _ad.attacks.length || _ad.damages.length || _ad.monMoves.length || _ad.monAttacks.length || _ad.monDamages.length || (_ad.projectiles && _ad.projectiles.length) || (_ad.projectileReturns && _ad.projectileReturns.length) || (_ad.explosions && _ad.explosions.length) || (_ad.splashes && _ad.splashes.length) || (_ad.monProjectiles && _ad.monProjectiles.length) || (_ad.monProjectileReturns && _ad.monProjectileReturns.length) || (_ad.itemArcs && _ad.itemArcs.length);
      if (_hasAnim) {
        /* playAnim の非同期開始前に同期でロックし、同一キー連打で複数 act が通るのを防ぐ */
        animBusyRef.current = true;
        playAnim(_ad);
      }
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
      lookMode,
      playAnim,
    ],
  );
  actRef.current = act; /* 常に最新の act を参照（playAnim のバッファ実行用） */
  revealModeRef.current = revealMode; /* 常に最新の revealMode を同期（キーハンドラで同期クリアするため） */
  showSignRef.current = showSign;
  /* 目の前を調べる（zキー・モバイル調べるボタン共通） */
  const doExamineFront = useCallback(() => {
    if (!sr.current) return;
    if (lookMode) return;
    if (bigboxModeRef.current) return;
    if (nicknameModeRef.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const fd = p.facing || { dx: 0, dy: 1 };
    const nx = p.x + fd.dx, ny = p.y + fd.dy;
    const mon = monsterAt(dg, nx, ny);
    if (mon) {
      if (mon.type === "shopkeeper" && mon.state !== "hostile") {
        const dg6 = sr.current.dungeon;
        const _talkShop = getShops(dg6).find(s => s.shopkeeperId === mon.id);
        if (_talkShop) {
          const fis2 = dg6.items.filter(
            (i) => !i.shopPrice && i.x >= _talkShop.room.x && i.x < _talkShop.room.x + _talkShop.room.w &&
              i.y >= _talkShop.room.y && i.y < _talkShop.room.y + _talkShop.room.h,
          );
          if (fis2.length > 0) {
            setShopMode("sell"); setShopMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), "店主：「買い取りましょうか？」"]);
          } else if (_talkShop.unpaidTotal > 0) {
            setShopMode("pay"); setShopMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), `店主：「お代は${_talkShop.unpaidTotal}Gです。」`]);
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
        const _statueFront = dg.statues?.find((s) => s.x === nx && s.y === ny);
        if (spr) {
          springTargetRef.current = spr;
          setSpringMode("menu"); setSpringMenuSel(0);
          setMsgs((prev) => [...prev.slice(-80), "泉がある。どうする？"]);
        } else if (bb6) {
          bigboxRef.current = bb6;
          setBigboxMode("menu"); setBigboxMenuSel(0);
          setMsgs((prev) => [...prev.slice(-80), `${bbDisplayName(bb6, sr.current, bb6.revealed === true || !!sr.current?.allBcKnown)}がある。どうする？`]);
        } else if (_statueFront) {
          setMsgs((prev) => [...prev.slice(-80), "石像がある。"]);
        } else {
          const trap6 = dg.traps?.find((t) => t.x === nx && t.y === ny && t.revealed);
          const items6 = (dg.items || []).filter((i) => i.x === nx && i.y === ny);
          const tile6 = dg.map[ny]?.[nx];
          const _nfn6 = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
          if (trap6) {
            setMsgs((prev) => [...prev.slice(-80), `${trap6.name}がある。`]);
          } else if (tile6 === T.SD) {
            setMsgs((prev) => [...prev.slice(-80), "下り階段がある。"]);
          } else if (tile6 === T.SU) {
            setMsgs((prev) => [...prev.slice(-80), "上り階段がある。"]);
          } else if (items6.length > 0) {
            setMsgs((prev) => [...prev.slice(-80), `${items6.map(_nfn6).join("、")}がある。`]);
          } else {
            const _pt6 = dg.map[p.y]?.[p.x];
            if (_pt6 === T.SD) {
              setMsgs((prev) => [...prev.slice(-80), "足元に下り階段がある。Fキーで階段を使用。"]);
            } else if (_pt6 === T.SU) {
              setMsgs((prev) => [...prev.slice(-80), "足元に上り階段がある。Fキーで階段を使用。"]);
            } else {
              setMsgs((prev) => [...prev.slice(-80), "何もない。"]);
            }
          }
        }
      }
    }
  }, [act, lookMode]);
  const doDash = useCallback(
    async (dx, dy) => {
      if (dead || !sr.current) return;
      if (animBusyRef.current) return;
      if (springMode || wishMode || putMode || markerMode || spellListMode || debugSpellModeRef.current || throwMode || showInv || lookMode || tpSelectModeRef.current || identifyModeRef.current) return;
      /* act()と同じモーダルガード（店・大箱・ニックネーム・看板・メッセージ待ち・階層選択・ログ中のダッシュ防止） */
      if (shopModeRef.current || bigboxModeRef.current || nicknameModeRef.current || showSignRef.current || revealModeRef.current || floorSelectModeRef.current || msgLogModeRef.current || showSettingsRef.current || showTileEditorRef.current || exitHubConfirmRef.current) return;
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
        if (dg.statues?.some(s => s.x === nx && s.y === ny)) break;
        if (dg.map[ny][nx] === T.WATER && !canPlayerWalkOnWater(p, dg)) break;
        { const _dpc = _dPentMap.get(_dk(nx, ny)); if (_dpc?.kind === "sanctuary" && _dpc.cursed) break; }
        /* 廊下ダッシュ中に部屋の入口手前で停止（ただし最初の1歩は入れる） */
        if (steps > 0 && !startInRoom && !_dRoomSet.has(_dk(p.x, p.y)) && _dRoomSet.has(_dk(nx, ny))) break;
        const _allShopsD = getShops(dg);
        const _inShopRoomD = (x, y) => _allShopsD.some(s => s.room && x >= s.room.x && x < s.room.x + s.room.w && y >= s.room.y && y < s.room.y + s.room.h);
        const _wasInShopDOf = _allShopsD.filter(s => s.unpaidTotal > 0 && s.room &&
          p.x >= s.room.x && p.x < s.room.x + s.room.w &&
          p.y >= s.room.y && p.y < s.room.y + s.room.h);
        const _wasInAnyShopD = _inShopRoomD(p.x, p.y);
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
        const _isNowInShopD = _inShopRoomD(p.x, p.y);
        if (!_wasInAnyShopD && _isNowInShopD) ml.push("お店に入った。");
        else if (_wasInAnyShopD && !_isNowInShopD) ml.push("お店をあとにした。");
        applySoakedFromWaterWalk(p, dg, ml);
        steps++;
        const tr = checkTrap(p, dg, ml);
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
            const _gtr = fireTrapPlayer(_dashRevTrap, p, dg, ml, _nameFn2, lu, { ident: sr.current?.ident });
            if (_dashRevTrap.effect !== "explode" && !_dashRevTrap.permanent) {
              const _gravTrBreakChance = (_dashRevTrap.effect === "steal_trap" || _dashRevTrap.effect === "summon_trap") ? 0.5 : 0.25;
              if (Math.random() < _gravTrBreakChance) {
                removeTrap(dg, _dashRevTrap, ml, { fromStep: true, message: `${_dashRevTrap.name}は壊れた。`, p });
              }
            }
            if (_gtr === "pitfall") {
              const nd = chgFloor(p, 1, true);
              if (nd) { st.dungeon = nd; ml.push(`地下${p.depth}階に落ちた！`); }
            }
          }
          endTurn(st, p, ml);
          break;
        }
        {
          const _dashSign = _dItemMap.get(_dk(p.x, p.y));
          if (_dashSign?.type === "sign") {
            endTurn(st, p, ml);
            setShowSign(_dashSign);
            break;
          }
        }
        if (hasWaterBreathRing(p) && dg.map[p.y]?.[p.x] === T.WATER) {
          const _dashSunk = dg.waterItems?.find((w) => w.x === p.x && w.y === p.y);
          if (_dashSunk) {
            ml.push(`${itemDisplayName(_dashSunk.item, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}が水底にある。`);
            endTurn(st, p, ml);
            break;
          }
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
              _lbl += `(${_dashIt.value}枚)`;
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
          ml.push(`${bbDisplayName(_dashBb, sr.current, _dashBb.revealed === true || !!sr.current?.allBcKnown)}がある。`);
          endTurn(st, p, ml);
          break;
        }
        const _dashPc = _dPentMap.get(_dk(p.x, p.y));
        if (_dashPc) {
          if (_dashPc.kind === "portal" || _dashPc.kind === "fixed_portal") {
            if (playerPortalWarp(p, st, ml)) st._portalWarpedThisTurn = true;
          } else {
            ml.push(`${_dashPc.name || "魔法陣"}の上に乗った。`);
          }
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
        const _confBefore    = p.confusedTurns   || 0;
        const _slowBefore    = p.slowTurns        || 0;
        const _sealBefore    = p.sealedTurns      || 0;
        const _immBefore     = p.immobileTurns    || 0;
        const _darkBefore    = p.darknessTurns    || 0;
        const _oilyBefore    = p.oilyTurns        || 0;
        const _bewBefore     = p.bewitchedTurns   || 0;
        const _poisBefore    = !!p.poisoned;
        const _invLenBefore  = p.inventory.length;
        const _goldBefore    = p.gold;
        p._dashInterrupt = false;
        triggerMonsterHouse(st.dungeon, p, ml);
        endTurn(st, p, ml);
        /* 各ステップの状態をキャンバスに一瞬描画（ダッシュ高速移動演出） */
        gsOverrideRef.current = { ...st };
        animBusyRef.current = true;
        renderFrameRef.current();
        await new Promise(r => setTimeout(r, 20));
        gsOverrideRef.current = null;
        animBusyRef.current = false;
        if (p.hp <= 0 || p.hp < _hpBefore || p.sleepTurns > 0 || p.paralyzeTurns > 0 ||
            (p.confusedTurns||0) > _confBefore || (p.slowTurns||0) > _slowBefore ||
            (p.sealedTurns||0) > _sealBefore   || (p.immobileTurns||0) > _immBefore ||
            (p.darknessTurns||0) > _darkBefore  || (p.oilyTurns||0) > _oilyBefore ||
            (p.bewitchedTurns||0) > _bewBefore  || (!!p.poisoned && !_poisBefore) ||
            p.inventory.length < _invLenBefore  || p.gold < _goldBefore ||
            p._dashInterrupt) break;
        /* endTurn後にモンスターが移動している可能性があるため再チェック */
        const blockedAfter = blocked || !!monsterAt(dg, fnx, fny);
        if (startInRoom) {
          if (!curInRoom || blockedAfter) break;
        } else {
          if (curInRoom || (curPerps > prevPerps && curPerps > 0) || blockedAfter) break;
        }
        prevPerps = curPerps;
      }
      if (steps > 0) {
        p.facing = { dx, dy };
        p._portraitDash = true;
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
        return true;
      }
    }
    return false;
  }, []);
  const breakBigbox = useCallback((bb, dg, ml) => {
    ml.push(`${bbDisplayName(bb, sr.current)}が壊れた！中身がばらまかれた！`);
    const ft = new Set();
    for (const item of bb.contents) placeItemAt(dg, bb.x, bb.y, item, ml, ft);
    stageBigbox(bb);
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
        if (wb.effect === "wish" || wm.effect === "wish" || wb.noChargeBoost || wm.noChargeBoost) {
          ml.push("願いの杖は合成で回数を増やせない…");
          return;
        }
        /* ゴッドスパーク合成トラッキング: 炎・雷・氷の3属性を蓄積 */
        const _gsEffects = new Set(["fire_wand", "lightning", "ice_wand"]);
        if (_gsEffects.has(wb.effect) || _gsEffects.has(wm.effect)) {
          /* どちらかが三属性杖の場合、mergedWandEffectsを引き継いで追記 */
          const _merged = new Set(wb.mergedWandEffects || [wb.effect]);
          if (_gsEffects.has(wm.effect)) _merged.add(wm.effect);
          if (_gsEffects.has(wb.effect)) _merged.add(wb.effect);
          const _combinedCharges = (wb.charges || 0) + Math.max(1, Math.floor((wm.charges || 0) / 2));
          /* 三属性全部揃ったらゴッドスパークの杖に変化 */
          if (_merged.has("fire_wand") && _merged.has("lightning") && _merged.has("ice_wand")) {
            const _gsWand = { ...GODSPARKWAND_T, id: uid(), charges: _combinedCharges };
            bb.contents = bb.contents.filter(i => i !== wb && i !== wm);
            bb.contents.push(_gsWand);
            bb.capacity = bb.contents.length;
            ml.push(`合成完了！炎・雷・氷の三属性が融合してゴッドスパークの杖に変化した！`);
            return;
          }
          /* まだ揃っていない：チャージを合算してmergedWandEffectsを更新 */
          wb.charges = _combinedCharges;
          wb.mergedWandEffects = [..._merged];
          bb.contents = bb.contents.filter(i => i !== wm);
          bb.capacity = bb.contents.length;
          ml.push(`合成完了！${wb.name}の回数が増えた！(${wb.charges}回) [三属性杖: ${wb.mergedWandEffects.join("/")}]`);
          return;
        }
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
        slow:      { weapon: "inflict_slow",     armor: "slow_proof" },
        paralyze:  { weapon: "inflict_paralyze", armor: "paralyze_proof" },
        sleep:     { weapon: "inflict_sleep",    armor: "sleep_proof" },
        darkness:  { weapon: "inflict_darkness", armor: "darkness_proof" },
        confuse:   { weapon: "inflict_confuse",  armor: "confuse_proof" },
        bewitch:   { weapon: "inflict_bewitch",  armor: "bewitch_proof" },
        seal:      { weapon: "inflict_seal",     armor: "seal_proof" },
        fire_wand: { weapon: "fire_elem",        armor: "fire_resist" },
        ice_wand:  { weapon: "ice_elem",         armor: "ice_resist" },
        lightning: { weapon: "thunder_elem",     armor: "lightning_resist" },
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
      const _mabsRaw = [...new Set([..._toAA(base), ..._toAA(mat)])];
      /* 上位と通常の同系アビリティが同時にある場合、通常を除去して上位だけ残す */
      const _superBanePairs = [
        ["bane_undead", "bane_undead_2"], ["bane_dragon", "bane_dragon_2"], ["bane_float", "bane_float_2"],
        ["fire_elem", "fire_elem_2"], ["ice_elem", "ice_elem_2"], ["thunder_elem", "thunder_elem_2"],
      ];
      const _mabs = _mabsRaw.filter(a => !_superBanePairs.some(([n, s]) => a === n && _mabsRaw.includes(s)));
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
      /* 鎖帷子マージカウント */
      if (base.name === "鎖帷子" && mat.name === "鎖帷子") {
        merged.chainmailMerge = (base.chainmailMerge || 1) + (mat.chainmailMerge || 1);
      } else {
        delete merged.chainmailMerge;
      }
      /* ゴブリンバットマージカウント */
      if (base.name === "ゴブリンバット" && mat.name === "ゴブリンバット") {
        merged.goblinBatMerge = (base.goblinBatMerge || 1) + (mat.goblinBatMerge || 1);
      } else {
        delete merged.goblinBatMerge;
      }
      /* 同種キラー武器マージカウント（bane_*が唯一の通常特効アビリティの場合のみ加算） */
      const _getSoloBane = (it) => {
        const abs = [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])].filter(Boolean))];
        const banes = abs.filter(a => a.startsWith("bane_") && !a.endsWith("_2"));
        return banes.length === 1 ? banes[0] : null;
      };
      const _soloBaneBase = _getSoloBane(base), _soloBaneMat = _getSoloBane(mat);
      const _KILLER_NAMES = { "bane_undead": "ゾンビキラー", "bane_dragon": "ドラゴンキラー", "bane_float": "バードキラー" };
      for (const _bk of ["bane_undead", "bane_dragon", "bane_float"]) {
        const _kp = `killerMerge_${_bk}`;
        if (_soloBaneBase === _bk && _soloBaneMat === _bk &&
            base.name === _KILLER_NAMES[_bk] && mat.name === _KILLER_NAMES[_bk]) {
          merged[_kp] = (base[_kp] || 1) + (mat[_kp] || 1);
        } else {
          delete merged[_kp];
        }
      }
      /* 万能キラーマージカウント */
      if (base.name === "万能キラー" && mat.name === "万能キラー") {
        merged.allbaneMerge = (base.allbaneMerge || 1) + (mat.allbaneMerge || 1);
      } else {
        delete merged.allbaneMerge;
      }
      /* 同種属性剣マージカウント */
      const _getSoloElem = (it) => {
        const abs = [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])].filter(Boolean))];
        const elems = abs.filter(a => ["fire_elem","ice_elem","thunder_elem"].includes(a));
        return elems.length === 1 ? elems[0] : null;
      };
      const _soloElemBase = _getSoloElem(base), _soloElemMat = _getSoloElem(mat);
      const _ELEM_SWORD_NAMES = { "fire_elem": "炎の剣", "ice_elem": "氷の剣", "thunder_elem": "雷の剣" };
      for (const _ek of ["fire_elem", "ice_elem", "thunder_elem"]) {
        const _ep = `elemMerge_${_ek}`;
        if (_soloElemBase === _ek && _soloElemMat === _ek &&
            base.name === _ELEM_SWORD_NAMES[_ek] && mat.name === _ELEM_SWORD_NAMES[_ek]) {
          merged[_ep] = (base[_ep] || 1) + (mat[_ep] || 1);
        } else {
          delete merged[_ep];
        }
      }
      /* 三元の刃マージカウント */
      if (base.name === "三元の刃" && mat.name === "三元の刃") {
        merged.trielemMerge = (base.trielemMerge || 1) + (mat.trielemMerge || 1);
      } else {
        delete merged.trielemMerge;
      }
      /* pickaxe能力を持つ場合、耐久値を加算（両方穴掘りなら合計、片方のみなら引き継ぎ） */
      if (_mabs.includes("pickaxe")) {
        const _baseDura = base.durability ?? (hasAbility(base, "pickaxe") ? 30 : 0);
        const _matDura  = mat.durability  ?? (hasAbility(mat,  "pickaxe") ? 30 : 0);
        merged.durability = (_baseDura + _matDura) || (merged.durability ?? 30);
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
      /* 鎖帷子3枚→ミスリルの胴着に変化 */
      } else if (merged.chainmailMerge >= 3) {
        const _mithril = { ...MITHRIL_ARMOR_T, id: uid(), plus: merged.plus };
        bb.contents.push(_mithril);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！鎖帷子3枚が融合してミスリルの胴着に変化した！`);
      /* ゴブリンバット3本→鬼棍棒に変化 */
      } else if (merged.goblinBatMerge >= 3) {
        const _oniClub = { ...ONI_CLUB_T, id: uid(), plus: merged.plus };
        bb.contents.push(_oniClub);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！ゴブリンバット3本が融合して鬼棍棒に変化した！`);
      /* 同種キラー3本合成 */
      } else if (merged.type === "weapon" && (merged.killerMerge_bane_undead >= 3 || merged.killerMerge_bane_dragon >= 3 || merged.killerMerge_bane_float >= 3)) {
        const _killerT = merged.killerMerge_bane_undead >= 3 ? { T: EXCALIBUR_T, msg: "ゾンビキラー3本が融合してエクスカリバーに変化した！", bane: "bane_undead" }
                       : merged.killerMerge_bane_dragon >= 3 ? { T: IRONMASS_T,  msg: "ドラゴンキラー3本が融合して鉄塊に変化した！",         bane: "bane_dragon" }
                       :                                        { T: SNIPER_T,    msg: "バードキラー3本が融合してスナイパーに変化した！",       bane: "bane_float" };
        const _kAbs = [...new Set([..._mabs.filter(a => a !== _killerT.bane), _killerT.T.ability])];
        const _kResult = { ..._killerT.T, id: uid(), plus: merged.plus, ability: _kAbs[0], abilities: _kAbs };
        bb.contents.push(_kResult);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！${_killerT.msg}`);
      /* 万能キラー3本→全能キラーに変化 */
      } else if (merged.allbaneMerge >= 3) {
        const _gbAbs = [...new Set([..._mabs.filter(a => !a.startsWith("bane_")), ...GODBANE_SWORD_T.abilities])];
        const _godBane = { ...GODBANE_SWORD_T, id: uid(), plus: merged.plus, ability: _gbAbs[0], abilities: _gbAbs };
        bb.contents.push(_godBane);
        bb.capacity = bb.contents.length;
        ml.push("合成完了！万能キラー3本が融合して全能キラーに変化した！");
      /* 同種属性剣3本合成 */
      } else if (merged.type === "weapon" && (merged.elemMerge_fire_elem >= 3 || merged.elemMerge_ice_elem >= 3 || merged.elemMerge_thunder_elem >= 3)) {
        const _elemT = merged.elemMerge_fire_elem >= 3 ? { T: FLAMBERGE_T, msg: "炎の剣3本が融合してフランベルジュに変化した！",   elem: "fire_elem" }
                     : merged.elemMerge_ice_elem >= 3   ? { T: ICESWORD_T,  msg: "氷の剣3本が融合してアイスソードに変化した！",     elem: "ice_elem" }
                     :                                     { T: CHIDORI_T,   msg: "雷の剣3本が融合して千鳥に変化した！",             elem: "thunder_elem" };
        const _eAbs = [...new Set([..._mabs.filter(a => a !== _elemT.elem), _elemT.T.ability])];
        const _eResult = { ..._elemT.T, id: uid(), plus: merged.plus, ability: _eAbs[0], abilities: _eAbs };
        bb.contents.push(_eResult);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！${_elemT.msg}`);
      /* 三元の刃3本→アルテマソードに変化 */
      } else if (merged.trielemMerge >= 3) {
        const _utAbs = [...new Set([..._mabs.filter(a => !["fire_elem","ice_elem","thunder_elem"].includes(a)), ...ULTIMA_SWORD_T.abilities])];
        const _ultima = { ...ULTIMA_SWORD_T, id: uid(), plus: merged.plus, ability: _utAbs[0], abilities: _utAbs };
        bb.contents.push(_ultima);
        bb.capacity = bb.contents.length;
        ml.push("合成完了！三元の刃3本が融合してアルテマソードに変化した！");
      /* 三元素武器：炎・氷・雷属性をすべて持つなら三元の刃に変化（ベースが属性剣のみ） */
      } else if (merged.type === "weapon" &&
                 (base.name === "炎の剣" || base.name === "氷の剣" || base.name === "雷の剣") &&
                 _mabs.includes("fire_elem") && _mabs.includes("ice_elem") && _mabs.includes("thunder_elem")) {
        const _tsAbs = [...new Set([..._mabs, ...TRIELEM_SWORD_T.abilities])];
        const _triSword = { ...TRIELEM_SWORD_T, id: uid(), plus: merged.plus, ability: _tsAbs[0], abilities: _tsAbs };
        bb.contents.push(_triSword);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！三元素の力が融合して三元の刃に変化した！`);
      /* 三耐性防具：炎・氷・雷耐性をすべて持つなら元素王の鎧に変化（ベースが耐性鎧のみ） */
      } else if (merged.type === "armor" &&
                 (base.name === "ドラゴンメイル" || base.name === "氷竜のウロコ" || base.name === "ゴムゴムの胴") &&
                 _mabs.includes("fire_resist") && _mabs.includes("ice_resist") && _mabs.includes("lightning_resist")) {
        const _taAbs = [...new Set([..._mabs.filter(a => !ELEM_RESIST_ABILITIES.includes(a)), ...TRIELEM_ARMOR_T.abilities])];
        const _triArmor = { ...TRIELEM_ARMOR_T, id: uid(), plus: merged.plus, ability: _taAbs[0], abilities: _taAbs };
        bb.contents.push(_triArmor);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！三属性の耐性が融合して元素王の鎧に変化した！`);
      /* 三種キラー：竜・不死・浮遊特効をすべて持つなら万能キラーに変化（ベースがキラー武器のみ） */
      } else if (merged.type === "weapon" &&
                 (base.name === "ゾンビキラー" || base.name === "ドラゴンキラー" || base.name === "バードキラー") &&
                 _mabs.includes("bane_dragon") && (_mabs.includes("bane_undead") || _mabs.includes("bane_undead_2")) && _mabs.includes("bane_float")) {
        const _abAbs = [...new Set([..._mabs, ...ALLBANE_SWORD_T.abilities])];
        const _allBane = { ...ALLBANE_SWORD_T, id: uid(), plus: merged.plus, ability: _abAbs[0], abilities: _abAbs };
        bb.contents.push(_allBane);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！三種の特効剣が融合して万能キラーに変化した！`);
      /* 三守護：刃反射・みかわし・杖反射をすべて持つなら神盾の鎧に変化（ベースが守護鎧のみ） */
      } else if (merged.type === "armor" &&
                 (base.name === "刃の鎧" || base.name === "みかわしの服" || base.name === "反射の鎧") &&
                 _mabs.includes("thorn") && _mabs.includes("dodge") && _mabs.includes("wand_reflect")) {
        const _dsAbs = [...new Set([..._mabs, ...DIVINE_SHIELD_T.abilities])];
        const _divShield = { ...DIVINE_SHIELD_T, id: uid(), plus: merged.plus, ability: _dsAbs[0], abilities: _dsAbs };
        bb.contents.push(_divShield);
        bb.capacity = bb.contents.length;
        ml.push(`合成完了！三守護の力が融合して神盾の鎧に変化した！`);
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
      const _bbIsRev = bb.revealed === true || !!sr.current?.allBcKnown;
      const _bbDN = bbDisplayName(bb, sr.current);
      ml.push(_bbIsRev
        ? `${_idn}を${_bbDN}に入れた。(${bb.contents.length}/${bb.capacity})`
        : `${_idn}を${_bbDN}に入れた。`,
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
          const wt = pickLootFromPool(WANDS, "change") || pick(WANDS);
          nit = { ...wt, id: uid() };
        } else if (rt === "arrow") {
          nit = makeArrow(rng(3, 15));
        } else if (rt === "pot") {
          nit = makePot("change");
        } else {
          const pool = ITEMS.filter((i) => i.type === rt);
          const fallback = ITEMS.filter((i) => i.type !== "gold");
          const tmpl = (pool.length ? pickLootFromPool(pool, "change") : null)
            || pickLootFromPool(fallback, "change")
            || pick(fallback);
          nit = { ...tmpl, id: uid() };
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
          if (item.effect === "wish" || item.noChargeBoost) {
            ml.push(`${_idn}の回数は増やせない…`);
          } else {
            const add = (item.effect === "curse_wand" || item.effect === "bless_wand") ? 1 : rng(1, 3);
            item.charges = (item.charges || 0) + add;
            ml.push(`${_idn}の回数が${add}増えた！(${item.charges}回)`);
          }
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
          trackItem(item);
        } else if (item.type === "weapon" || item.type === "armor") {
          item.bcKnown = true;
          item.fullIdent = true;
          ml.push(`${_idn}の詳細が判明した！`);
          trackItem(item);
        } else {
          const _wasFullIdent = !!item.fullIdent;
          const _wasBcKnown = !!item.bcKnown;
          item.bcKnown = true;
          item.fullIdent = true;
          if (!_wasFullIdent || !_wasBcKnown) {
            ml.push(`${_idn}の詳細が判明した！`);
            trackItem(item);
          } else {
            ml.push(`${_idn}は既に完全に識別済みだった。`);
          }
        }
      } else if (bb.kind === "split") {
        if (item.type === "gold" || item.type === "goal") {
          ml.push(`${_idn}は分裂しなかった。`);
        } else {
          const _clone = { ...item, id: uid() };
          if (_clone.abilities) _clone.abilities = [..._clone.abilities];
          if (_clone.contents) _clone.contents = [..._clone.contents];
          /* 中身入り壺：クローンは空にする */
          if (item.type === "pot" && item.contents?.length > 0) _clone.contents = [];
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
      } else if (bb.kind === "curse") {
        if (item.type === "goal" || item.type === "gold") {
          ml.push(`${_idn}には効果がなかった。`);
        } else if (item.type === "pot") {
          const _newCap = Math.max(0, (item.capacity || 1) - 1);
          item.capacity = _newCap;
          ml.push(`${_idn}の容量が1減った！(${_newCap})`);
        } else if (item.type === "food") {
          if (item.rotten) {
            ml.push(`${_idn}はすでに腐っている。`);
          } else {
            const _cOrigName = item.name;
            rotFood(item);
            item.bcKnown = true;
            ml.push(`${_cOrigName}が腐ってしまった！`);
          }
        } else {
          item.cursed = true;
          item.blessed = false;
          item.bcKnown = true;
          ml.push(`${_idn}が呪われた！【呪】`);
        }
      } else if (bb.kind === "scatter") {
        /* アイテムをbox内から即削除（消滅） */
        const _scIdx = bb.contents.indexOf(item);
        if (_scIdx >= 0) bb.contents.splice(_scIdx, 1);
        let _bbExploded = false;
        const p = sr.current.player;
        const _scRoom = findRoom(dg.rooms, bb.x, bb.y);
        const _scMons = _scRoom
          ? dg.monsters.filter(m => m.x >= _scRoom.x && m.x < _scRoom.x + _scRoom.w && m.y >= _scRoom.y && m.y < _scRoom.y + _scRoom.h)
          : [];
        const _scPInRoom = _scRoom && p.x >= _scRoom.x && p.x < _scRoom.x + _scRoom.w && p.y >= _scRoom.y && p.y < _scRoom.y + _scRoom.h;
        if (_scMons.length === 0 && !_scPInRoom) {
          ml.push("しかし部屋には誰もいなかった。");
        } else {
          ml.push(`${_idn}が部屋中に拡散した！`);
          if (item.type === "potion") {
            for (const m of [..._scMons]) {
              applyPotionEffect(item.effect, item.value || 0, "monster", m, dg, p, ml, lu, item.blessed || false, item.cursed || false);
              if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
            }
            if (_scPInRoom) applyPotionEffect(item.effect, item.value || 0, "player", p, dg, p, ml, lu, item.blessed || false, item.cursed || false);
          } else if (item.type === "wand") {
            const _scBm = getBlessMultiplier(item);
            const _scDnFn = (gi) => itemDisplayName(gi, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
            for (const m of [..._scMons]) {
              const _sdx = Math.sign(m.x - bb.x), _sdy = Math.sign(m.y - bb.y);
              applyWandEffect(item.effect, "monster", m, _sdx || 1, _sdy, dg, p, ml, lu, bigboxAddItem, _scBm, _scDnFn);
              if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
            }
            if (_scPInRoom) {
              const _sdx = Math.sign(p.x - bb.x), _sdy = Math.sign(p.y - bb.y);
              applyWandEffect(item.effect, "player", p, _sdx || 1, _sdy, dg, p, ml, lu, bigboxAddItem, _scBm, _scDnFn);
            }
          } else if (item.type === "pot") {
            /* 壺：種類に応じた破壊効果（中身は散乱しない） */
            const _oilMap = { olive: "オリーブオイル", sesame: "ごま油", butter: "バター" };
            if (item.potEffect === "gunpowder") {
              ml.push(`${_idn}が飛び散って各生き物のもとで爆発した！`);
              if (!isFireExplosionNullified(dg, p)) {
                for (const _gnMon of [..._scMons]) {
                  doGunpowderExplosion(_gnMon.x, _gnMon.y, dg, p, ml, lu);
                }
                if (_scPInRoom) doGunpowderExplosion(p.x, p.y, dg, p, ml, lu);
              } else {
                announceFireExplosionNullified(dg, p, ml, "爆発");
              }
              _bbExploded = true;
            } else if (_oilMap[item.potEffect] && (item.contents?.length || 0) < (item.capacity || 3)) {
              ml.push(`${_idn}が割れて${_oilMap[item.potEffect]}が飛び散った！`);
              dg.oilyTiles = dg.oilyTiles || [];
              const _addOilArea = (cx, cy) => {
                for (let _oy = -1; _oy <= 1; _oy++) for (let _ox = -1; _ox <= 1; _ox++) {
                  const _otx = cx + _ox, _oty = cy + _oy;
                  if (_otx >= 0 && _otx < MW && _oty >= 0 && _oty < MH && dg.map[_oty][_otx] !== T.WALL && dg.map[_oty][_otx] !== T.BWALL) {
                    if (!dg.oilyTiles.some(t => t.x === _otx && t.y === _oty)) dg.oilyTiles.push({ x: _otx, y: _oty });
                    const _aoTrap = dg.traps?.find(t => t.x === _otx && t.y === _oty && !t.permanent);
                    if (_aoTrap) removeTrap(dg, _aoTrap, ml, { message: `油で${_aoTrap.name}が消えた！`, p });
                  }
                }
              };
              for (const m of [..._scMons]) {
                m.oilyTurns = (m.oilyTurns || 0) + 100;
                ml.push(`${m.name}は油まみれになった！(100ターン)`);
                _addOilArea(m.x, m.y);
              }
              if (_scPInRoom) {
                p.oilyTurns = (p.oilyTurns || 0) + 100;
                ml.push("油を浴びた！炎ダメージが2倍になる！(100ターン)");
                _addOilArea(p.x, p.y);
              }
              /* 油をbox周囲にも飛散 */
              _addOilArea(bb.x, bb.y);
              /* 油がかかったマスの魔方陣を消滅 */
              if (dg.pentacles?.length > 0) {
                const _oiledPcs = dg.pentacles.filter(pc => dg.oilyTiles.some(t => t.x === pc.x && t.y === pc.y));
                if (_oiledPcs.length > 0) {
                  dg.pentacles = dg.pentacles.filter(pc => !_oiledPcs.includes(pc));
                  for (const _opc of _oiledPcs) ml.push(`油が${_opc.name}を消した！`);
                }
              }
            } else if (item.potEffect === "imprison") {
              ml.push(`${_idn}が割れた！`);
              releaseConfinedMonstersFromPot(item, dg, bb.x, bb.y, p, ml);
            } else {
              const _potDmg = 3 + rng(0, 3);
              const _healPotAmt = item.potEffect === "heal_pot" ? Math.max(0, (item.capacity || 3) - (item.contents?.length || 0)) * 100 : 0;
              for (const m of [..._scMons]) {
                const _itd = clampDmgFixed(m, _potDmg, true);
                m.hp -= _itd;
                ml.push(`${_idn}が${m.name}に命中！${_itd}ダメージ！`);
                if (_healPotAmt > 0) {
                  if (m.kind === "undead") {
                    m.hp -= _healPotAmt;
                    ml.push(`回復の光が${m.name}に${_healPotAmt}ダメージを与えた！`);
                  } else {
                    const _hpPrev = m.hp;
                    m.hp = Math.min(m.maxHp, m.hp + _healPotAmt);
                    ml.push(`${m.name}のHPが${m.hp - _hpPrev}回復した！`);
                    if (m.type === "shopkeeper" && m.state === "hostile" && m.hp >= m.maxHp && !dg.shopTheft) {
                      m.state = "friendly";
                      ml.push("店主のHPが全快した！敵対状態が解除された。");
                    }
                  }
                }
                if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
              }
              if (_scPInRoom) {
                p.deathCause = `${itemDisplayName(item, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}が当たって`;
                p.hp -= _potDmg;
                ml.push(`${_idn}がプレイヤーに命中！${_potDmg}ダメージ！`);
                if (_healPotAmt > 0) {
                  const _prevHp = p.hp;
                  p.hp = Math.min(p.maxHp, p.hp + _healPotAmt);
                  if (p.hp > _prevHp) ml.push(`プレイヤーのHPが${p.hp - _prevHp}回復した！`);
                }
              }
              ml.push(`${_idn}は割れた！`);
            }
          } else {
            /* 武器・防具・矢・その他：物理ダメージ＋矢の特殊効果 */
            const _scBaseAtk = item.type === "weapon" ? (item.atk || 3) + (item.plus || 0) : (item.type === "arrow" ? (item.atk || 3) : 3);
            const _scUseCalc = item.type === "arrow" || item.type === "weapon";
            if (item.type === "arrow" && item.bombArrow) {
              /* 爆弾矢（インベントリから入れた）：各生き物の場所でそれぞれ爆発＋箱も破壊 */
              ml.push(`${_idn}が部屋中に拡散してそれぞれ爆発した！`);
              const _baNF = (gi) => itemDisplayName(gi, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              if (!isFireExplosionNullified(dg, p)) {
                for (const _baMon of [..._scMons]) {
                  doExplosion(_baMon.x, _baMon.y, dg, p, ml, _baNF, `${itemDisplayName(item, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}の爆発`, null, lu);
                }
                if (_scPInRoom) {
                  doExplosion(p.x, p.y, dg, p, ml, _baNF, `${itemDisplayName(item, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}の爆発`, null, lu);
                }
              } else {
                announceFireExplosionNullified(dg, p, ml, `${itemDisplayName(item, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}の爆発`);
              }
              _bbExploded = true;
            } else {
              for (const m of [..._scMons]) {
                const _scRawDmg = _scUseCalc ? calcProjectileDmg(p, _scBaseAtk, m.def) : _scBaseAtk + rng(0, 3);
                const _itd = clampDmgFixed(m, _scRawDmg, true);
                m.hp -= _itd;
                let _msg = `${_idn}が${m.name}に命中！${_itd}ダメージ！`;
                if (item.type === "arrow" && item.poison) {
                  if (m.isBoss) {
                    if (!m.bossPoisonHalfAtk) { m.bossPoisonOrigAtk = m.atk; m.bossPoisonHalfAtk = true; m.bossPoisonHalfAtkTurns = 10; }
                    m.atk = Math.max(1, Math.floor(m.atk / 2));
                  } else {
                    m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
                  }
                  _msg += "攻撃力が半減した！";
                }
                ml.push(_msg);
                if (item.type === "food" && item.yabai && m.hp > 0) {
                  const _yScDmg = rng(15, 25);
                  m.hp -= _yScDmg;
                  ml.push(`ヤバイ食料が${m.name}に食べさせられた！さらに${_yScDmg}ダメージ！`);
                  if (m.hp > 0) {
                    m.poisoned = true;
                    m.confusedTurns = (m.confusedTurns || 0) + 5;
                    m.fleeingTurns = (m.fleeingTurns || 0) + 10;
                    m.slowTurns = (m.slowTurns || 0) + 10;
                    ml.push(`${m.name}は毒・混乱・幻惑・鈍足状態になった！`);
                  }
                }
                if (item.type === "food" && (item.rotten || item.burnt) && !item.yabai && m.hp > 0) {
                  m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
                  ml.push(`${item.rotten ? "腐った" : "焦げた"}食料を食べさせられた${m.name}の攻撃力が半減した！`);
                }
                if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
              }
              if (_scPInRoom) {
                p.deathCause = `${itemDisplayName(item, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}が当たって`;
                const _scPDmg = _scUseCalc ? calcProjectileDmg(p, _scBaseAtk, 0) : _scBaseAtk + rng(0, 3);
                p.hp -= _scPDmg;
                let _pmsg = `${_idn}がプレイヤーに命中！${_scPDmg}ダメージ！`;
                if (item.type === "arrow" && item.poison && !hasRingEffect(p, "antidote_ring")) { p.poisoned = true; _pmsg += "毒を受けた！"; }
                ml.push(_pmsg);
                if (item.type === "food" && item.yabai) {
                  const _syScDmg = rng(15, 25);
                  p.hp -= _syScDmg;
                  p.deathCause = "ヤバイ食料が当たって";
                  ml.push(`ヤバイ食料がぶつかって食べさせられた！さらに${_syScDmg}ダメージ！`);
                  if (hasRingEffect(p, "antidote_ring")) {
                    ml.push("毒消しの指輪が毒を防いだ！");
                  } else {
                    p.poisoned = true;
                    ml.push("食中毒になった！毒状態になった！");
                  }
                  p.confusedTurns = (p.confusedTurns || 0) + 5;
                  p.slowTurns = (p.slowTurns || 0) + 10;
                  ml.push("混乱・鈍足状態になった！");
                } else if (item.type === "food" && item.rotten && !item.yabai) {
                  if (hasRingEffect(p, "antidote_ring")) {
                    ml.push("毒消しの指輪が毒を防いだ！");
                  } else {
                    p.poisoned = true;
                    ml.push("腐った食料がぶつかった！毒状態になった！");
                  }
                }
              }
            }
          }
        }
        /* 爆発系は箱ごと破壊、それ以外は容量を1減らす */
        if (_bbExploded) {
          stageBigbox(bb);
          dg.bigboxes = dg.bigboxes.filter(b => b !== bb);
          const _bbFt = new Set();
          for (const ci of (bb.contents || [])) placeItemAt(dg, bb.x, bb.y, ci, ml, _bbFt);
          if (bb.contents?.length > 0) ml.push(`${bbDisplayName(bb, sr.current)}が壊れ中身が飛び出した！`);
          else ml.push(`${bbDisplayName(bb, sr.current)}が爆発で壊れた！`);
        } else {
          bb.capacity = Math.max(0, (bb.capacity || 1) - 1);
        }
      } else if (bb.kind === "trash") {
        /* 入れたアイテムを即削除（消滅）し容量を1減らす */
        const _trIdx = bb.contents.indexOf(item);
        if (_trIdx >= 0) bb.contents.splice(_trIdx, 1);
        bb.capacity = Math.max(0, (bb.capacity || 1) - 1);
        ml.push(`${_idn}は消えてしまった。`);
      }
      if (wasFull || bb.contents.length > bb.capacity) breakBigbox(bb, dg, ml);
    },
    [trySynthesize, breakBigbox],
  );
  /** 願い成功時：泉を必ず干上がらせる */
  const drySpringAlways = useCallback((dg, p, ml) => {
    const sprTarget = springTargetRef.current;
    springTargetRef.current = null;
    const spr = sprTarget || dg.springs?.find((s) => s.x === p.x && s.y === p.y);
    if (!spr) return;
    dg.springs = dg.springs.filter((s) => s !== spr);
    if (spr.contents?.length > 0) {
      ml.push("泉が干上がり、中のアイテムが現れた！");
      const ft = new Set();
      for (const item of spr.contents) placeItemAt(dg, spr.x, spr.y, item, ml, ft);
    }
    ml.push("泉は干上がってしまった...");
  }, []);

  const confirmWish = useCallback((wish) => {
    if (!sr.current) return;
    const mode = wishModeRef.current;
    const { player: p, dungeon: dg } = sr.current;
    const ml = ["願いが叶った！"];
    const res = grantWish(wish, {
      player: p,
      dungeon: dg,
      ml,
      ident: sr.current.ident,
      luFn: lu,
    });
    if (!res.ok) {
      setMsgs((prev) => [...prev.slice(-80), res.message || "願いが叶わなかった…"]);
      return;
    }
    if (mode?.source === "spring") {
      drySpringAlways(dg, p, ml);
    } else if (mode?.source === "wand" && mode.wandId) {
      const wand = p.inventory.find((i) => i.id === mode.wandId);
      if (wand && wand.type === "wand") {
        wand.charges = Math.max(0, (wand.charges || 1) - 1);
        if (wand.charges <= 0) {
          const wi = p.inventory.indexOf(wand);
          if (wi !== -1) p.inventory.splice(wi, 1);
          ml.push("願いの杖は力を使い果たして消えた…");
        }
      }
    }
    // pot: already consumed when opening wish
    endTurn(sr.current, p, ml);
    setMsgs((prev) => [...prev.slice(-80), ...ml]);
    setWishMode(null);
    setSpringMode(null);
    setThrowMode(null);
    setPutMode(null);
    setShowInv(false);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, [endTurn, drySpringAlways, lu]);

  const cancelWish = useCallback(() => {
    const mode = wishModeRef.current;
    setWishMode(null);
    if (!sr.current) return;
    if (mode?.endTurnOnCancel) {
      const { player: p, dungeon: dg } = sr.current;
      const ml = ["願いをやめた。"];
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    } else {
      setMsgs((prev) => [...prev.slice(-80), "願いをやめた。"]);
    }
  }, [endTurn]);

  const springDrink = useCallback(() => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    /* 超低確率で願い */
    if (rollWishChance("drink")) {
      const ml = ["泉の底から声が聞こえる…", "「何を願う？」"];
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setSpringMode(null);
      setWishMode({ source: "spring", endTurnOnCancel: false });
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
      return;
    }
    const ml = ["泉の水を飲んだ。"];
    const r = Math.random();
    if (r < 0.15) {
      // HP回復
      const h = rng(5, 15);
      const ah = Math.min(h, p.maxHp - p.hp);
      p.hp += ah;
      ml.push(`体に活力が戻った。HP+${ah}`);
    } else if (r < 0.22) {
      // 攻撃力+1
      p.atk += 1;
      ml.push("力が湧いてきた！攻撃力+1");
    } else if (r < 0.28) {
      // 防御力+1
      p.def += 1;
      ml.push("体が強くなった気がする。防御力+1");
    } else if (r < 0.34) {
      // 最大HP+3
      p.maxHp += 3;
      p.hp += 3;
      ml.push("生命力が満ちてきた。最大HP+3");
    } else if (r < 0.39) {
      // 満腹度回復
      p.hunger = Math.min(p.maxHunger, p.hunger + 20);
      ml.push("喉が潤った。");
    } else if (r < 0.45) {
      // MP回復
      if ((p.maxMp || 0) > 0) {
        const _mr = Math.min(10, (p.maxMp || 0) - (p.mp || 0));
        p.mp = (p.mp || 0) + _mr;
        ml.push(`魔力が戻ってきた！MP+${_mr}`);
      } else {
        ml.push("清らかな水を飲んだ。");
      }
    } else if (r < 0.52) {
      // 水の瓶が飛び出す
      const _wb = { ...WATER_BOTTLE, id: uid() };
      const _ft = new Set();
      placeItemAt(dg, p.x, p.y, _wb, ml, _ft);
      ml.push("泉の水が勢いよく飛び出した！水の瓶が転がっている。");
    } else if (r < 0.58) {
      // 金貨が飛び出す
      const _gv = rng(15, 60);
      const _gc = { name: `${_gv}枚の金貨`, type: "gold", value: _gv, tile: 22, id: uid() };
      const _ft2 = new Set();
      placeItemAt(dg, p.x, p.y, _gc, ml, _ft2);
      ml.push(`泉の底から金貨が${_gv}枚流れ出てきた！`);
    } else if (r < 0.63) {
      // 所持品がランダムで祝福される（壺は容量+1）
      const _blessable = p.inventory.filter(i => i.type !== "gold" && i.type !== "arrow" && (i.type === "pot" || !i.blessed));
      if (_blessable.length > 0) {
        const _bi = _blessable[Math.floor(Math.random() * _blessable.length)];
        if (_bi.type === "pot") {
          _bi.capacity += 1;
          ml.push(`${dnameRef(_bi)}が光り輝いた！容量が1増えた！(${_bi.capacity})`);
        } else {
          _bi.blessed = true;
          _bi.cursed = false;
          _bi.bcKnown = true;
          ml.push(`${dnameRef(_bi)}が光り輝いた！祝福された！`);
        }
      } else {
        ml.push("清らかな水だった。");
      }
    } else if (r < 0.68) {
      // ランダムな未識別アイテムが識別される
      const _unident = p.inventory.filter(i => {
        const _k = getIdentKey(i);
        return _k && !sr.current.ident.has(_k);
      });
      if (_unident.length > 0) {
        const _ui = _unident[Math.floor(Math.random() * _unident.length)];
        const _k = getIdentKey(_ui);
        if (_k) sr.current.ident.add(_k);
        _ui.fullIdent = true;
        _ui.bcKnown = true;
        ml.push(`水に映った${dnameRef(_ui)}の正体が分かった！`);
      } else {
        ml.push("澄んだ水に自分の姿が映った。");
      }
    } else if (r < 0.76) {
      // 混乱になる
      p.confusedTurns = (p.confusedTurns || 0) + 10;
      ml.push("頭がくらくらする...混乱した！(10ターン)");
    } else if (r < 0.84) {
      // ダメージ
      const d = rng(3, 8);
      p.deathCause = "苦い泉水により";
      p.hp -= d;
      ml.push(`苦い...！${d}ダメージ！`);
    } else if (r < 0.90) {
      // 毒状態になる
      p.poisoned = true;
      ml.push("なんか変な味がした...毒だ！");
    } else if (r < 0.95) {
      // 所持品がランダムで呪われる（壺は容量-1）
      const _cursable = p.inventory.filter(i => i.type !== "gold" && i.type !== "arrow" && (i.type === "pot" || !i.cursed));
      if (_cursable.length > 0) {
        const _ci = _cursable[Math.floor(Math.random() * _cursable.length)];
        if (_ci.type === "pot") {
          _ci.capacity = Math.max(0, _ci.capacity - 1);
          ml.push(`${dnameRef(_ci)}が黒く染まった！容量が1減った！(${_ci.capacity})`);
        } else {
          _ci.cursed = true;
          _ci.blessed = false;
          _ci.bcKnown = true;
          ml.push(`${dnameRef(_ci)}が黒く染まった！呪われてしまった！`);
        }
      } else {
        ml.push("ひどい味だった。");
      }
    } else {
      // わてりが出現（水のない場所で干上がり状態）
      const _wDef = MONS.find(m => m.baseKind === "wateri");
      if (_wDef) {
        const { levels: _wLvs, ..._wBase } = _wDef;
        const _wm = { ..._wBase, id: uid(), x: p.x, y: p.y, maxHp: _wBase.hp, baseSpeed: _wBase.speed ?? 1, turnAccum: 0, aware: true, dir: { x: 0, y: 0 }, lastPx: p.x, lastPy: p.y, patrolTarget: null };
        const _ft3 = new Set();
        const DIRS8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
        let _placed = false;
        for (const [dy, dx] of DIRS8) {
          const nx = p.x + dx, ny = p.y + dy;
          if ((dg.map[ny]?.[nx] === T.FLOOR) && !dg.monsters.some(m => m.x === nx && m.y === ny)) {
            _wm.x = nx; _wm.y = ny;
            dg.monsters.push(_wm);
            _placed = true;
            break;
          }
        }
        if (_placed) ml.push("泉からわてりが飛び出してきた！水がないので動けないようだ...");
        else ml.push("何かが泉の中でうごめいた。");
      }
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
        /* 特殊変化：ロングソード→エクスカリバー(5%)、短剣→猫の爪(5%)、バトルアクス/戦神の斧→ゴールデンアクス(20%) */
        if (it.type === "weapon" && it.name === "ロングソード" && Math.random() < 0.05) {
          const _oldPlus = it.plus || 0;
          const _oldName = it.name;
          const _oldAbs = [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])])].filter(Boolean);
          Object.assign(it, { ...EXCALIBUR_T, id: it.id, plus: Math.max(0, _oldPlus) });
          const _newAbs = [...new Set([..._oldAbs, EXCALIBUR_T.ability])];
          it.abilities = _newAbs; it.ability = _newAbs[0];
          ml.push(`${_oldName}が聖なる光を放ち...エクスカリバーに変化した！`);
        } else if (it.type === "weapon" && it.name === "短剣" && Math.random() < 0.05) {
          const _oldPlus = it.plus || 0;
          const _oldName = it.name;
          const _oldAbs = [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])])].filter(Boolean);
          Object.assign(it, { ...CAT_CLAW_T, id: it.id, plus: Math.max(0, _oldPlus) });
          const _newAbs = [...new Set([..._oldAbs, CAT_CLAW_T.ability])];
          it.abilities = _newAbs; it.ability = _newAbs[0];
          ml.push(`${_oldName}が鋭い輝きを放ち...猫の爪に変化した！`);
        } else if (it.type === "weapon" && (it.name === "バトルアクス" || it.name === "戦神の斧") && Math.random() < 0.20) {
          const _oldPlus = it.plus || 0;
          const _oldName = it.name;
          const _oldAbs = [...new Set([...(it.abilities || []), ...(it.ability ? [it.ability] : [])])].filter(Boolean);
          Object.assign(it, { ...GOLDEN_AXE_T, id: it.id, plus: Math.max(0, _oldPlus) });
          const _newAbs = [...new Set([..._oldAbs, GOLDEN_AXE_T.ability])];
          it.abilities = _newAbs; it.ability = _newAbs[0];
          ml.push(`${_oldName}が黄金の輝きを放ち...ゴールデンアクスに変化した！`);
        } else if (hasAbility(it, "no_degrade")) {
          let _ndNote = "";
          if (it.cursed) { it.cursed = false; _ndNote = " 呪いが解けた！"; }
          ml.push(`${it.name}が水に浸かったが金でできているので錆びなかった！${_ndNote}`);
        } else {
          let _rustNote = "";
          if (it.cursed) { it.cursed = false; _rustNote = " 呪いが解けた！"; }
          const _op = it.plus || 0;
          it.plus = _op - 1;
          const _fp = (v) =>
            v > 0 ? `+${v}` : v === 0 ? `\u7121\u5370` : `${v}`;
          ml.push(
            `${it.name}が水に浸かり...錆びてしまった！(${_fp(_op)}→${_fp(it.plus)})${_rustNote}`,
          );
        }
      } else if (it.type === "scroll") {
        if (it.effect !== "blank") {
          const _scrDN = dnameRef(it);
          it.name = "白紙の巻物";
          it.effect = "blank";
          it.desc = "何も書かれていない。魔法の筆で書き込める。";
          ml.push(`巻物「${_scrDN}」を泉に浸した...文字が消えた！`);
        } else {
          ml.push("白紙の巻物を泉に浸した...何も起こらなかった。");
        }
      } else if (it.type === "spellbook") {
        if (it.spell) {
          const _sbDN = dnameRef(it);
          it.name = "白紙の魔法書";
          it.spell = null;
          it.desc = "魔法が消えてしまった。魔法の筆(5回分)で好きな魔法書に変えられる。";
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
        let _soakNote = "";
        if (it.cursed) { it.cursed = false; _soakNote = " 呪いが解けた！"; }
        ml.push(`${dnameRef(it)}を泉に浸した。${_soakNote || "何も起こらなかった。"}`);
      }
      /* 超低確率で願い（浸したあと） */
      if (rollWishChance("soak")) {
        ml.push("泉が静かに光り、願いを叶えてくれそうだ…");
        ml.push("「何を願う？」");
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        setSpringMode(null);
        setWishMode({ source: "spring", endTurnOnCancel: true });
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
        return;
      }
      const _dried = springTryDry(dg, p, ml);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      if (_dried) {
        setSpringMode(null);
      } else {
        setSpringMode("soak");
        setSpringMenuSel(0);
        setSpringPage(0);
      }
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
        ml.push(`${bbDisplayName(bb, sr.current)}はもういっぱいだ。`);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        return;
      }
      const _bbIsEquipped = p.weapon === it || p.armor === it || p.arrow === it || (p.rings || []).includes(it);
      if (_bbIsEquipped && it.cursed) {
        ml.push("呪われているので外せない！");
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
        if (it.blessed) { p.maxHp = Math.max(1, p.maxHp - 10); p.hp = Math.min(p.hp, p.maxHp); }
        if (it.effect === "torch_ring") p.visionBonus = Math.max(0, (p.visionBonus || 0) - 1);
      }
      p.inventory.splice(itemIdx, 1);
      bigboxAddItem(bb, it, dg, ml);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      if (dg.bigboxes?.includes(bb) && bb.contents.length < bb.capacity) {
        setBigboxMode("put");
        setBigboxMenuSel(0);
        setBigboxPage(0);
      } else {
        setBigboxMode(null);
        bigboxRef.current = null;
      }
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
  const arrowHeldRef = useRef({});
  const floorPenDropRef = useRef(null);
  const floorWandRef = useRef(null);
  const floorPotRef = useRef(null);
  const floorArrowRef = useRef(null);
  useEffect(() => {
    const onUp = (e) => {
      if (e.key === "Shift") { shiftRef.current = false; arrowHeldRef.current = {}; }
      if (e.key === "a" || e.key === "A") aRef.current = false;
      const _arDir = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      if (_arDir[e.key]) arrowHeldRef.current[_arDir[e.key]] = false;
      const _npmDir = { Numpad8: "up", Numpad2: "down", Numpad4: "left", Numpad6: "right" };
      if (_npmDir[e.code]) arrowHeldRef.current[_npmDir[e.code]] = false;
    };
    window.addEventListener("keyup", onUp);
    return () => window.removeEventListener("keyup", onUp);
  }, []);
  /* 足元矢/杖の射撃・振りキャンセル時にアイテムを足元に戻す
     成功時は execDirection 内で既に ref が null 化されているので no-op */
  useEffect(() => {
    if (throwMode !== null) return;
    for (const ref of [floorArrowRef, floorWandRef]) {
      const it = ref.current;
      if (!it) continue;
      ref.current = null;
      const s = sr.current; if (!s) continue;
      const idx = s.player.inventory.indexOf(it);
      if (idx === -1) continue;
      s.player.inventory.splice(idx, 1);
      const _ml = []; const _ft = new Set();
      placeItemAt(s.dungeon, s.player.x, s.player.y, it, _ml, _ft, 0, s.player);
      if (_ml.length) setMsgs((prev) => [...prev.slice(-80), ..._ml]);
    }
  }, [throwMode]);
  /* 足元ペンのマーカーモードキャンセル時にペンを足元に戻す
     成功時は doMarkerWrite 内で既に floorPenDropRef.current = null されているので no-op */
  useEffect(() => {
    if (markerMode !== null) return;
    const it = floorPenDropRef.current;
    if (!it) return;
    floorPenDropRef.current = null;
    const s = sr.current; if (!s) return;
    const idx = s.player.inventory.indexOf(it);
    if (idx === -1) return;
    s.player.inventory.splice(idx, 1);
    const _ml = []; const _ft = new Set();
    placeItemAt(s.dungeon, s.player.x, s.player.y, it, _ml, _ft, 0, s.player);
    if (_ml.length) setMsgs((prev) => [...prev.slice(-80), ..._ml]);
  }, [markerMode]);
  useKeyHandler({
    // refs
    sr, shiftRef, aRef, arrowHeldRef, execRef, invActRef, doMarkerWriteRef, bigboxRef, dropModeRef, revealModeRef, shopModeRef, identifyCancelRef,
    // state values
    gs, dead, showScores, gameOverSel, throwMode, showInv, selIdx, invPage, invMenuSel,
    facingMode, springMode, springMenuSel, springPage, wishMode, putMode, putMenuSel, putPage,
    markerMode, markerMenuSel, markerPage, spellListMode, spellMenuSel, spellPage, shopMode, shopMenuSel,
    bigboxMode, bigboxMenuSel, bigboxPage, nicknameMode, identifyMode, revealMode,
    tpSelectMode, floorSelectMode, lookMode, debugSpellMode, debugSpellMenuSel,
    msgLogMode, msgLogScrollTop, msgsRef,
    showSign,
    exitHubConfirm, exitHubSel,
    gameOverCanReturn: !!(onReturnToHub && gameOverResult),
    performGameOverReturnToHub,
    // state setters
    setGs, setMsgs, setGameOverSel, setShowScores, setFloorSelectMode, setTpSelectMode,
    setLookMode, setShowInv, setSelIdx, setInvMenuSel, setShowDesc, setNicknameMode,
    setNicknameInput, setInvPage, setDropMode, setFacingMode, setThrowMode,
    setSpringMode, setSpringMenuSel, setSpringPage, setPutMode, setPutMenuSel, setPutPage,
    setMarkerMode, setMarkerMenuSel, setMarkerPage, setSpellListMode, setSpellMenuSel, setSpellPage, setShopMode,
    setShopMenuSel, setBigboxMode, setBigboxMenuSel, setBigboxPage, setIdentifyMode,
    setRevealMode, setDebugSpellMode, setDebugSpellMenuSel,
    setMsgLogMode, setMsgLogScrollTop,
    setShowSign,
    setExitHubConfirm, setExitHubSel, performExitToHub,
    // callbacks
    init, act, doDash, doExamineFront, endTurn, springDrink, springDoSoak,
    bigboxPutItem, sortInventory, getLookDesc, lu,
    pastIdent, discoveredItems,
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
    setIdentifyMode, setRevealMode, setWishMode,
    lu, endTurn, chgFloor, withPitfallBag,
    dnameRef, bigboxAddItem,
    onReturnToHub, dropModeRef, setFloorSelectMode, setTpSelectMode,
    floorPenDropRef, floorWandRef, floorPotRef, floorArrowRef,
  });
  doMarkerWriteRef.current = doMarkerWrite;
  /* ===== 足元ページ用コールバック ===== */
  const _doFloorPickup = (item) => {
    const s = sr.current; if (!s) return;
    const _p = s.player, _dg = s.dungeon, ml = [];
    if (_p.inventory.length >= (_p.maxInventory || 30)) { setMsgs(prev => [...prev.slice(-80), "持ちきれない！"]); return; }
    _dg.items = _dg.items.filter(i => i !== item);
    _p.inventory.push(item);
    if (item.shopPrice) {
      const _allS = getShops(_dg);
      const _ps = _allS.find(sh => sh.id === item._shopId) || _allS[0];
      if (_ps) {
        const _ap = applyShopUnpaidCharge(item, _ps, _p);
        const _sk = _dg.monsters.find(m => m.id === _ps.shopkeeperId && m.state === "friendly");
        if (_sk) _sk.state = "blocking";
        ml.push(`${dnameRef(item)}を取った！(${_ap}G${shopPriceNote(_p)}) 店主が入り口をふさいだ。`);
      }
    } else {
      ml.push(`${dnameRef(item)}を拾った！`);
    }
    endTurn(s, _p, ml);
    setMsgs(prev => [...prev.slice(-80), ...ml]);
    sr.current = { ...sr.current }; setGs({ ...sr.current });
    setShowInv(false); setSelIdx(null); setInvPage(0); setInvMenuSel(null);
  };
  const _doFloorTrap = (trap) => {
    const s = sr.current; if (!s) return;
    const _p = s.player, _dg = s.dungeon, ml = [];
    if (hasRingEffect(_p, "float_ring")) { setMsgs(prev => [...prev.slice(-80), "浮遊の指輪を付けているので罠を作動させられない！"]); return; }
    const _tnFn = (it) => itemDisplayName(it, s.fakeNames, s.ident, s.nicknames);
    const _tr2 = fireTrapPlayer(trap, _p, _dg, ml, _tnFn, lu, { ident: sr.current?.ident });
    if (_tr2 === "pitfall") { const nd2 = chgFloor(_p, 1, true); if (nd2) { s.dungeon = nd2; ml.push(`地下${_p.depth}階に落ちた！`); } }

    endTurn(s, _p, ml);
    setMsgs(prev => [...prev.slice(-80), ...ml]);
    sr.current = { ...sr.current }; setGs({ ...sr.current });
    setShowInv(false); setSelIdx(null); setInvPage(0); setInvMenuSel(null);
  };
  const _chargeShopFloorItem = (item, _p, _dg, s) => {
    if (!item.shopPrice) return;
    if (item.charges != null) item._origCharges = item._origCharges ?? item.charges;
    const _allS = getShops(_dg);
    const _ps = _allS.find(sh => sh.id === item._shopId) || _allS[0];
    if (_ps) {
      const _ap = applyShopUnpaidCharge(item, _ps, _p);
      const _sk = _dg.monsters.find(m => m.id === _ps.shopkeeperId && m.state === "friendly");
      if (_sk) _sk.state = "blocking";
      setMsgs(prev => [...prev.slice(-80), `${itemDisplayName(item, s.fakeNames, s.ident, s.nicknames)}を取った！(${_ap}G${shopPriceNote(_p)}) 店主が入り口をふさいだ。`]);
    }
    /* shopPrice/_shopId/_shopCharge は拾った場合と同様に維持（未払い表示・店への返却・使用分請求に必要） */
  };
  const _doFloorItemAction = (item, actionFn, skipCapCheck = false, keepInInventory = false) => {
    const s = sr.current; if (!s) return;
    const _p = s.player, _dg = s.dungeon;
    /* 満杯チェック（action前に記録） */
    const _wasInvFull = _p.inventory.length >= (_p.maxInventory || 30);
    if (!skipCapCheck && _wasInvFull) { setMsgs(prev => [...prev.slice(-80), "持ちきれない！"]); return; }
    /* 店のアイテムを床から直接使う場合は代金を請求 */
    _chargeShopFloorItem(item, _p, _dg, s);
    _dg.items = _dg.items.filter(i => i !== item);
    const _idx = _p.inventory.length;
    _p.inventory.push(item);
    if (keepInInventory) {
      /* 選択ダイアログがキャンセルされたとき巻物を床に返すクリーンアップ */
      identifyCancelRef.current = () => {
        const _si2 = sr.current.player.inventory.indexOf(item);
        if (_si2 !== -1) {
          sr.current.player.inventory.splice(_si2, 1);
          sr.current.dungeon.items.push(item);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
        }
        identifyCancelRef.current = null;
      };
    }
    /* 足元の薬を使う場合は空き瓶を足元に置くフラグを立てる */
    if (item.type === 'potion') floorPotRef.current = true;
    /* 足元の矢/石を射る場合はフロア戻しrefにセット */
    if (item.type === 'arrow') floorArrowRef.current = item;
    actionFn(_idx);
    /* 足元薬の空き瓶を床に配置 */
    if (item.type === 'potion') {
      const _bottle = floorPotRef.current;
      floorPotRef.current = null;
      if (_bottle && typeof _bottle === 'object') placeItemAt(_dg, _p.x, _p.y, _bottle, [], new Set(), 0, _p);
    }
    /* keepInInventory=falseの場合、残ったアイテムを床に戻す */
    if (!keepInInventory) {
      const _si = _p.inventory.indexOf(item);
      if (_si !== -1) {
        _p.inventory.splice(_si, 1);
        const _ml2 = [], _ft2 = new Set();
        placeItemAt(_dg, _p.x, _p.y, item, _ml2, _ft2, 0, _p);
        if (_ml2.length) setMsgs(prev => [...prev.slice(-80), ..._ml2]);
      }
      identifyCancelRef.current = null;
    } else if (_p.inventory.indexOf(item) === -1) {
      /* actionFnが即時消費した場合（選択ダイアログなし）はキャンセル不要 */
      identifyCancelRef.current = null;
    }
  };
  const _doFloorWaveWand = (item) => {
    const s = sr.current; if (!s) return;
    const _p = s.player, _dg = s.dungeon;
    _chargeShopFloorItem(item, _p, _dg, s);
    _dg.items = _dg.items.filter(i => i !== item);
    const _idx = _p.inventory.length;
    _p.inventory.push(item);
    floorWandRef.current = item;
    doWaveWand(_idx);
  };
  const _doFloorPen = (item) => {
    const s = sr.current; if (!s) return;
    const _p = s.player, _dg = s.dungeon;
    if (item.charges <= 0) { setMsgs(prev => [...prev.slice(-80), "マーカーのインクが切れている..."]); return; }
    const blanks = _p.inventory.filter(b => (b.type === "scroll" && b.effect === "blank") || (b.type === "spellbook" && !b.spell));
    if (blanks.length === 0) { setMsgs(prev => [...prev.slice(-80), "白紙の巻物も白紙の魔法書もない。"]); return; }
    _chargeShopFloorItem(item, _p, _dg, s);
    _dg.items = _dg.items.filter(i => i !== item);
    const _idx = _p.inventory.length;
    _p.inventory.push(item);
    floorPenDropRef.current = item;
    doUseMarker(_idx);
  };
  const _doFloorOpenPutMode = (pot) => {
    if ((pot.contents?.length || 0) >= pot.capacity) {
      setMsgs(prev => [...prev.slice(-80), `${itemDisplayName(pot, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいだ。`]);
      return;
    }
    setPutMode({ floorPot: pot });
    setPutMenuSel(0);
    setPutPage(0);
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setMsgs(prev => [...prev.slice(-80), "入れるアイテムを選んでください。"]);
  };
  /* 壺入れをやめる：所持品から開いた場合は壺にカーソルを戻して所持品を再表示 */
  const cancelPutMode = () => {
    const pm = putMode;
    const potIdx = pm && !pm.floorPot && typeof pm.potIdx === "number" ? pm.potIdx : null;
    setPutMode(null);
    setPutPage(0);
    setPutMenuSel(0);
    setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
    if (potIdx != null && potIdx >= 0) {
      setShowInv(true);
      setInvPage(Math.floor(potIdx / 10));
      setSelIdx(potIdx % 10);
      setInvMenuSel(null);
      setShowDesc(null);
    }
  };
  invActRef.current = { use: doUseItem, drop: doDropItem, throw: doThrow, shoot: doShoot, wave: doWaveWand, breakWand: doBreakWand, breakPot: doBreakPot, put: doPutItem, useMarker: doUseMarker, readSpellbook: doReadSpellbook, floorPickup: _doFloorPickup, floorTrap: _doFloorTrap, floorItemAction: _doFloorItemAction, floorOpenPutMode: _doFloorOpenPutMode, floorPen: _doFloorPen, floorWaveWand: _doFloorWaveWand, cancelPut: cancelPutMode };
  /* fixtures.js 等（render 循環回避）から未識別名でメッセージを出す用 */
  globalThis.__rogueItemNameFn = (it) =>
    itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
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
    /* 種別識別あり／武器・防具・食料・指輪は fullIdent|bcKnown のときだけ祝呪表示 */
    const _needFullIdent = !!_key || it.type === 'weapon' || it.type === 'armor' || it.type === 'ring' || it.type === 'food';
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
    } else if (it.type === "potion" && (it.effect === "heal" || it.effect === "heal_big") && _isIdent)
      s += ` (HP+${it.value})`;
    else if (it.type === "food") {
      const _rotMult = it.rotten ? 0.3 : 1;
      s += `(満+${Math.max(1, Math.round(it.value * _rotMult))})`;
      if (it.rotten || !it.cooked || it.potionEffects?.length) {
        s += "(";
        if (it.rotten) s += "腐";
        else if (!it.cooked) s += "生";
        if (it.potionEffects?.length) s += "★";
        s += ")";
      }
    } else if (it.type === "wand")   s += it.fullIdent ? ` [${it.charges}回]` : (!_isIdent && it._usedCount ? ` (-${it._usedCount})` : "");
    else if (it.type === "marker") s += ` [${it.charges}回]`;
    else if (it.type === "pen")    s += it.fullIdent ? ` [${it.charges || 0}回]` : "";
    else if (it.type === "pot")    s += _isIdent ? ` [${potOccupancyCount(it)}/${it.capacity}]` : "";
    else if (it.type === "ring" && ["power_ring", "defense_ring", "life_ring"].includes(it.effect)) s += `+${it.plus || 0}`;
    if (it.shopPrice) s += ` 〔未払:${getShopItemCharge(it)}G〕`;
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
        fontSize: 14,
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
        fontSize: mobile ? "13px" : "14px",
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
          fontSize: mobile ? "12px" : "14px",
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
          <span style={{ color: "#08f" }}>{p.def + (p.armor?.def || 0) + (p.armor?.plus || 0) + (p.rings||[]).reduce((s,r)=>r.effect==="defense_ring"?s+(r.plus||0):s,0) + (p.weapon?.ability==="def_bonus"||p.weapon?.abilities?.includes("def_bonus") ? 5 : 0)}</span>
        </span>{" "}
        <span>
          食:
          <span style={{ color: hunP > 40 ? "#0a0" : "#f80" }}>
            {p.hunger}/{p.maxHunger}
          </span>
        </span>{" "}
        <span style={{ color: "#ffd700" }}>${p.gold}</span>{" "}
        {p.weapon && (
          <span style={{ color: "#ff9966", fontSize: "0.85em" }}>
            ⚔{p.weapon.name}{(p.weapon.plus || 0) !== 0 ? `${p.weapon.plus > 0 ? "+" : ""}${p.weapon.plus}` : ""}
          </span>
        )}{" "}
        {p.armor && (
          <span style={{ color: "#66ccff", fontSize: "0.85em" }}>
            🛡{p.armor.name}{(p.armor.plus || 0) !== 0 ? `${p.armor.plus > 0 ? "+" : ""}${p.armor.plus}` : ""}
          </span>
        )}{" "}
        {p.arrow && (
          <span style={{ color: "#dda050" }}>
            {p.arrow.stone ? "石" : p.arrow.magicStone ? "魔法の石" : p.arrow.bombArrow ? "爆弾矢" : p.arrow.poison ? "毒矢" : p.arrow.pierce ? "貫きの矢" : "矢"}:{p.arrow.count}
          </span>
        )}{" "}
        {(p.rings || []).map((r, i) => (
          <span key={i} style={{ color: "#c0a0ff", fontSize: "0.85em" }}>
            💍{["power_ring","defense_ring","life_ring"].includes(r.effect) && gs?.ident?.has(`r:${r.effect}`) ? `${r.name}+${r.plus || 0}` : dname(r)}
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
        {(p.fireExplosionNullTurns || 0) > 0 && (
          <span style={{ color: "#6080a0" }}>🧯{p.fireExplosionNullTurns}</span>
        )}{" "}
        {(p.defSoftenedTurns || 0) > 0 && (
          <span style={{ color: "#c8a060" }}>🛡↓{p.defSoftenedTurns}</span>
        )}{" "}
        {(p.spicyAtkTurns || 0) > 0 && (
          <span style={{ color: "#ff6010" }}>🌶{p.spicyAtkTurns}</span>
        )}{" "}
        {(p.pacifistTurns || 0) > 0 && (
          <span style={{ color: "#40c0a0" }}>☮{p.pacifistTurns}</span>
        )}{" "}
        {(p.honeyRegenTurns || 0) > 0 && (
          <span style={{ color: "#f0c040" }}>🍯{p.honeyRegenTurns}</span>
        )}{" "}
        {(p.curryFireResTurns || 0) > 0 && (
          <span style={{ color: "#e07020" }}>🍛{p.curryFireResTurns}</span>
        )}{" "}
        {(p.misoDefTurns || 0) > 0 && (
          <span style={{ color: "#a06030" }}>🫘{p.misoDefTurns}</span>
        )}{" "}
        {(p.oliveEvasionTurns || 0) > 0 && (
          <span style={{ color: "#80b040" }}>🫒{p.oliveEvasionTurns}</span>
        )}{" "}
        {(p.sesameCritTurns || 0) > 0 && (
          <span style={{ color: "#c0a060" }}>⚡{p.sesameCritTurns}</span>
        )}{" "}
        {(p.butterHungerTurns || 0) > 0 && (
          <span style={{ color: "#f0d060" }}>🧈{p.butterHungerTurns}</span>
        )}{" "}
        {(p.yogurtImmuneTurns || 0) > 0 && (
          <span style={{ color: "#e0e0ff" }}>🥛{p.yogurtImmuneTurns}</span>
        )}{" "}
        {(p.soyExpTurns || 0) > 0 && (
          <span style={{ color: "#604020" }}>📖{p.soyExpTurns}</span>
        )}{" "}
        {(p.garlicDmgTurns || 0) > 0 && (
          <span style={{ color: "#d0c080" }}>🧄{p.garlicDmgTurns}</span>
        )}{" "}
        {(p.lemonThrowTurns || 0) > 0 && (
          <span style={{ color: "#e0e020" }}>🍋{p.lemonThrowTurns}</span>
        )}{" "}
        {(p.atkDebuffTurns || 0) > 0 && (
          <span style={{ color: "#ff6060" }}>⚔↓{p.atkDebuffTurns}</span>
        )}{" "}
        {(p.defDebuffTurns || 0) > 0 && (
          <span style={{ color: "#6080ff" }}>🛡↓↓{p.defDebuffTurns}</span>
        )}{" "}
        {(p.paralyzeTurns || 0) > 0 && (
          <span style={{ color: "#c0c0ff" }}>🔗{p.paralyzeTurns}</span>
        )}{" "}
        {(p.immobileTurns || 0) > 0 && (
          <span style={{ color: "#a08060" }}>🦶{p.immobileTurns}</span>
        )}{" "}
        {(p.soakedTurns || 0) > 0 && (
          <span style={{ color: "#48a8e8" }}>💧{p.soakedTurns}</span>
        )}
        {(p.frozenTurns || 0) > 0 && (
          <span style={{ color: "#80ddff" }}>🧊{p.frozenTurns}</span>
        )}
        {(p.oilyTurns || 0) > 0 && (
          <span style={{ color: "#e0a020" }}>🛢{p.oilyTurns}</span>
        )}{" "}
        {(p.invisibleTurns || 0) > 0 && (
          <span style={{ color: "#80e0ff" }}>👻{p.invisibleTurns}</span>
        )}{" "}
        {(p.potConfinedTurns || 0) > 0 && (
          <span style={{ color: "#c8a0e8" }}>🏺{p.potConfinedTurns}</span>
        )}{" "}
        {(p.wallWalkTurns || 0) > 0 && (
          <span style={{ color: "#a0ffa0" }}>🧱{p.wallWalkTurns}</span>
        )}{" "}
        {(p.reverseTurns || 0) > 0 && (
          <span style={{ color: "#e060e0" }}>☯{p.reverseTurns}</span>
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
          height: mobile ? 70 : 70,
          overflowY: "auto",
          borderTop: "1px solid #252530",
          padding: "2px",
          fontSize: mobile ? "11px" : "13px",
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
        {msgs.slice(-50).map((m, i, a) => {
          const _latestTurn = typeof a[a.length - 1] === "object" ? a[a.length - 1].turn : undefined;
          const _text = typeof m === "object" ? m.text : m;
          const _color = typeof m === "object" ? m.color : undefined;
          const _turn = typeof m === "object" ? m.turn : undefined;
          const _isCurTurn = _turn !== undefined && _turn === _latestTurn;
          return (
            <div key={i} style={{ opacity: _isCurTurn ? 1 : 0.6, color: _color ?? (_isCurTurn ? "#ffffff" : "#c0c0c0"), fontWeight: _color ? "bold" : undefined }}>
              {_turn > 0 && <span style={{ color: _isCurTurn ? "#80c0e8" : "#5a7a90", marginRight: 3, fontSize: "0.85em" }}>[{_turn}]</span>}
              {_text}
            </div>
          );
        })}
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
              /* === インベントリ表示中 === */
              if (showInv) {
                const inv = sr.current?.player?.inventory || [];
                const _invOnlyPg = Math.ceil(inv.length / 10) || 1;
                const _dg2 = sr.current?.dungeon;
                const _p2 = sr.current?.player;
                const _flItems2 = _dg2 && _p2 ? (_dg2.items || []).filter(i => i.x === _p2.x && i.y === _p2.y && !i.wallEmbedded && !i.noPickup) : [];
                const _flTraps2 = _dg2 && _p2 ? (_dg2.traps || []).filter(t => t.x === _p2.x && t.y === _p2.y) : [];
                const _flAll2 = [..._flItems2, ..._flTraps2];
                const _hasFl2 = _flAll2.length > 0;
                const totalPages = _invOnlyPg + (_hasFl2 ? 1 : 0);
                const _isFloorPg2 = _hasFl2 && invPage === _invOnlyPg;
                /* 足元ページ */
                if (_isFloorPg2) {
                  const _flLen2 = _flAll2.length;
                  if (invMenuSel !== null && selIdx !== null && selIdx < _flLen2) {
                    const _fle2 = _flAll2[selIdx];
                    const _fIsI2 = _flItems2.includes(_fle2);
                    let _flN2 = 2; // トラップ: 踏む+説明
                    if (_fIsI2) {
                      _flN2 = 1;
                      if (_fle2.type === "pot") _flN2 += 1; else if (_fle2.type === "marker") _flN2 += 1; else if (canUse(_fle2)) _flN2 += 1;
                      if (_fle2.type === "spellbook") _flN2 += 1;
                      if (_fle2.type === "arrow") _flN2 += 1;
                      if (_fle2.type === "wand") _flN2 += 2;
                      if (_fle2.type === "pot") _flN2 += 1;
                      _flN2 += 2; // 投げる+説明
                    }
                    if (dx !== 0 && dy === 0) { setInvMenuSel((s) => (s + dx + _flN2) % _flN2); }
                    else if (dy !== 0 && dx === 0) { setInvMenuSel(null); setSelIdx((prev) => prev === null ? (dy > 0 ? 0 : _flLen2 - 1) : (prev + dy + _flLen2) % _flLen2); setShowDesc(null); }
                    return;
                  }
                  if (dy !== 0 && dx === 0 && _flLen2 > 0) {
                    setSelIdx((prev) => { if (prev === null) return dy > 0 ? 0 : _flLen2 - 1; return (prev + dy + _flLen2) % _flLen2; });
                    setShowDesc(null); setInvMenuSel(null);
                  } else if (dx !== 0 && dy === 0 && totalPages > 1) {
                    setInvPage((p) => (p + dx + totalPages) % totalPages);
                    setSelIdx(0); setInvMenuSel(null); setShowDesc(null);
                  }
                  return;
                }
                const pageItems = inv.slice(invPage * 10, (invPage + 1) * 10);
                const len = pageItems.length;
                /* サブメニュー表示中: 左右でメニュー選択、上下でアイテム選択に戻す */
                if (invMenuSel !== null && selIdx !== null && pageItems[selIdx]) {
                  const _it = pageItems[selIdx];
                  const _n = _invActCount(_it, invPage * 10 + selIdx, canUse, gs);
                  if (dx !== 0 && dy === 0) {
                    setInvMenuSel((s) => (s + dx + _n) % _n);
                  } else if (dy !== 0 && dx === 0) {
                    setInvMenuSel(null);
                    setSelIdx((prev) => prev === null ? (dy > 0 ? 0 : len - 1) : (prev + dy + len) % len);
                    setShowDesc(null);
                  }
                  return;
                }
                if (dy !== 0 && dx === 0 && len > 0) {
                  setSelIdx((prev) => {
                    if (prev === null) return dy > 0 ? 0 : len - 1;
                    return (prev + dy + len) % len;
                  });
                  setShowDesc(null); setInvMenuSel(null);
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
                const _isSellMode_t = identifyMode.mode === 'sell_item';
                const _isTsfMode_t = identifyMode.mode === 'transform_item';
                const _isForgeMode_t = identifyMode.mode === 'forge_item';
                const _isWeaponUpMode_t = identifyMode.mode === 'weapon_up';
                const _isArmorUpMode_t  = identifyMode.mode === 'armor_up';
                const _filt = _p.inventory
                  .map((_it, _i) => ({ it: _it, i: _i }))
                  .filter(({ it, i }) => {
                    if (_isBCMode_t || _isDupMode_t) return it.type !== "gold";
                    if (_isSellMode_t || _isTsfMode_t) return it.type !== "gold" && i !== identifyMode.scrollIdx;
                    if (_isForgeMode_t) return it.type === "weapon" || it.type === "armor";
                    if (_isWeaponUpMode_t || _isArmorUpMode_t) {
                      if (identifyMode.wasUnknown) return it.type !== "gold" && i !== identifyMode.scrollIdx;
                      const _PR = ["power_ring","defense_ring","life_ring"];
                      if (_isWeaponUpMode_t) return it.type === "weapon" || (it.type === "ring" && _PR.includes(it.effect));
                      if (_isArmorUpMode_t)  return it.type === "armor"  || (it.type === "ring" && _PR.includes(it.effect));
                    }
                    if (identifyMode.scrollIdx === i) return false;
                    const _showAll_t = identifyMode.showAll;
                    if (it.type === 'weapon' || it.type === 'armor' || it.type === 'food') {
                      if (identifyMode.mode === 'identify') return _showAll_t || (!it.fullIdent && !it.bcKnown);
                      return it.fullIdent || it.bcKnown;
                    }
                    const _k = getIdentKey(it);
                    if (!_k) return false;
                    if (identifyMode.mode === 'identify') return _showAll_t || !sr.current.ident.has(_k) || (!it.fullIdent && !it.bcKnown);
                    return sr.current.ident.has(_k);
                  });
                const _hasBbTgt = !!(identifyMode.bbFootId && !_isBCMode_t && identifyMode.mode !== 'unidentify' && sr.current?.dungeon?.bigboxes?.find(b => b.id === identifyMode.bbFootId));
                const _len = _filt.length + (_hasBbTgt ? 1 : 0);
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
                const pItems4 = inv4.map((it, i) => ({ it, i })).filter(({ i }) => putMode.floorPot ? true : i !== putMode.potIdx);
                const _ps4 = 10;
                const _tp4 = Math.max(1, Math.ceil(pItems4.length / _ps4));
                const _plen4 = pItems4.slice(putPage * _ps4, (putPage + 1) * _ps4).length;
                const _selCount4 = _plen4 + 1; /* やめる */
                if (dy !== 0 && dx === 0 && _selCount4 > 0) {
                  setPutMenuSel((s) => (s + dy + _selCount4) % _selCount4);
                } else if (dx !== 0 && dy === 0 && _tp4 > 1) {
                  setPutPage((p) => (p + dx + _tp4) % _tp4);
                  setPutMenuSel(0);
                }
                return;
              }
              /* === マーカーモード：上下で選択 === */
              if (markerMode) {
                if (!sr.current) return;
                const _mps = 10;
                const inv5 = sr.current.player.inventory;
                const _mIdent5 = sr.current.ident ?? new Set();
                const _mCurDisc5 = getDiscoveries().items;
                const _mInvEff5 = new Set(inv5.filter(it => it.type === "scroll" && it.effect !== "blank").map(it => it.effect));
                let fullList = [];
                if (markerMode.step === "select_blank") {
                  fullList = inv5.filter(it => (it.type === "scroll" && it.effect === "blank") || (it.type === "spellbook" && !it.spell));
                } else if (markerMode.step === "select_type") {
                  fullList = ITEMS.filter(it => it.type === "scroll" && it.effect !== "blank" && (_mIdent5.has(`s:${it.effect}`) || _mCurDisc5[it.effect] || _mInvEff5.has(it.effect)));
                } else if (markerMode.step === "select_spellbook_type") {
                  fullList = SPELLBOOKS.filter(it => it.spell && _mIdent5.has(`b:${it.spell}`));
                }
                const _mTotalPages = Math.max(1, Math.ceil(fullList.length / _mps));
                if (dy !== 0 && dx === 0) {
                  const _pageLen = Math.min(_mps, fullList.length - markerPage * _mps);
                  if (_pageLen > 0) setMarkerMenuSel((s) => (s + dy + _pageLen) % _pageLen);
                } else if (dx !== 0 && dy === 0 && _mTotalPages > 1) {
                  setMarkerPage((p) => (p + dx + _mTotalPages) % _mTotalPages);
                  setMarkerMenuSel(0);
                }
                return;
              }
              /* === 店モード：上下で選択 === */
              if (shopMode === "pay") {
                if (dy !== 0 && dx === 0) setShopMenuSel((p) => (p + dy + 2) % 2);
                return;
              }
              if (shopMode === "sell") {
                if (!sr.current) return;
                const { player: _sp2, dungeon: _sd2 } = sr.current;
                const _ss2 = getShops(_sd2).find(s => s.room &&
                  _sp2.x >= s.room.x && _sp2.x < s.room.x + s.room.w &&
                  _sp2.y >= s.room.y && _sp2.y < s.room.y + s.room.h);
                const _sf2 = _ss2 ? _sd2.items.filter(
                  (i) => !i.shopPrice &&
                    i.x >= _ss2.room.x && i.x < _ss2.room.x + _ss2.room.w &&
                    i.y >= _ss2.room.y && i.y < _ss2.room.y + _ss2.room.h,
                ) : [];
                const _slen2 = _sf2.length + 1;
                if (dy !== 0 && dx === 0 && _slen2 > 0) {
                  setShopMenuSel((p) => (p + dy + _slen2) % _slen2);
                }
                return;
              }
              if (shopMode === "browse" || shopMode === "browseConfirm") {
                if (dy !== 0 && dx === 0) setShopMenuSel((p) => (p + dy + 2) % 2);
                return;
              }
              /* === 大箱モード：上下で選択、左右でページ送り === */
              if (bigboxMode) {
                if (bigboxMode === "menu") {
                  if (dy !== 0 && dx === 0) setBigboxMenuSel((p) => (p + dy + 4) % 4);
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
              /* === 泉モード：上下で選択、左右でページ送り(soak) === */
              if (springMode) {
                if (springMode === "menu") {
                  if (dy !== 0 && dx === 0) setSpringMenuSel((p) => (p + dy + 3) % 3);
                } else if (springMode === "soak") {
                  const inv = sr.current?.player?.inventory || [];
                  if (dy !== 0 && dx === 0 && inv.length > 0) {
                    const totalPg = Math.max(1, Math.ceil(inv.length / 10));
                    const curPg = Math.min(springPage, totalPg - 1);
                    const pgLen = inv.slice(curPg * 10, (curPg + 1) * 10).length;
                    setSpringMenuSel((s) => (s + dy + pgLen) % pgLen);
                  } else if (dx !== 0 && dy === 0 && inv.length > 10) {
                    const totalPg = Math.max(1, Math.ceil(inv.length / 10));
                    setSpringPage((p) => (p + dx + totalPg) % totalPg);
                    setSpringMenuSel(0);
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
                  small
                  label="矢"
                  sub="射る"
                  onClick={() => { if (spellListMode) return; if (springMode || identifyMode || putMode) return; act("shoot_arrow"); }}
                  color={p.arrow ? "#fc0" : "#555"}
                />
                <AB
                  small
                  label={showSign ? "閉" : spellListMode ? "閉" : (putMode || bigboxMode === "put") ? "戻" : (bigboxMode === "menu") ? "閉" : (showInv && invMenuSel !== null) ? "戻" : showInv ? "閉" : springMode === "soak" ? "戻" : springMode ? "閉" : identifyMode ? "閉" : "袋"}
                  sub={showSign ? "閉じる" : spellListMode ? "閉じる" : (putMode || bigboxMode === "put") ? "キャンセル" : (bigboxMode === "menu") ? "閉じる" : (showInv && invMenuSel !== null) ? "戻る" : showInv ? "閉じる" : springMode === "soak" ? "戻る" : springMode ? "閉じる" : identifyMode ? "閉じる" : "道具"}
                  onClick={() => {
                    if (showSign) { setShowSign(null); return; }
                    if (spellListMode) { setSpellListMode(false); return; }
                    if (shopMode === "browseConfirm") { setShopMode("browse"); setShopMenuSel(0); return; }
                    if (shopMode === "browse") { setShopMode(null); return; }
                    if (putMode) { cancelPutMode(); return; }
                    if (bigboxMode === "put") { setBigboxMode("menu"); setBigboxMenuSel(0); return; }
                    if (bigboxMode === "menu") { setBigboxMode(null); bigboxRef.current = null; return; }
                    if (showInv && invMenuSel !== null) { setInvMenuSel(null); return; }
                    if (springMode === "soak") { setSpringMode("menu"); setSpringMenuSel(0); setSpringPage(0); return; }
                    if (springMode) { setSpringMode(null); setSpringMenuSel(0); return; }
                    if (identifyMode) { identifyCancelRef.current?.(); setIdentifyMode(null); setMsgs(prev => [...prev.slice(-80), "やめた。"]); return; }
                    act("inventory");
                  }}
                  color={showSign ? "#f88" : spellListMode ? "#f88" : (putMode || bigboxMode === "put" || bigboxMode === "menu") ? "#f88" : showInv ? "#f88" : (springMode || identifyMode) ? "#f88" : "#ff0"}
                />
                <AB
                  small
                  label="見"
                  sub="見渡す"
                  onClick={() => {
                    if (spellListMode) return;
                    if (revealMode) return;
                    if (showInv || springMode || identifyMode || putMode) return;
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
              </div>{" "}
              <div style={{ display: "flex", gap: 3 }}>
                <AB
                  label={spellListMode ? "決" : showInv ? "決" : bigboxMode === "menu" ? "決" : putMode ? "決" : springMode ? "決" : identifyMode ? "決" : "足"}
                  sub={spellListMode ? "詠唱" : showInv ? "決定" : bigboxMode === "menu" ? "決定" : putMode ? "決定" : springMode ? "決定" : identifyMode ? "決定" : "足元"}
                  onClick={() => {
                    if (spellListMode) { if (spellConfirmRef.current) spellConfirmRef.current(spellMenuSel); return; }
                    if (bigboxMode === "menu") {
                      const _bbk = bigboxRef.current ? "bk:" + bigboxRef.current.kind : null;
                      const _bb = bigboxRef.current;
                      if (bigboxMenuSel === 0 && !(_bb?.contents?.length >= _bb?.capacity)) { setBigboxMode("put"); setBigboxMenuSel(0); setBigboxPage(0); }
                      else if (bigboxMenuSel === 1) { setBigboxMode(null); bigboxRef.current = null; setMsgs(prev => [...prev.slice(-80), "やめた。"]); }
                      else if (bigboxMenuSel === 2) { setBigboxMode("desc"); setBigboxMenuSel(0); }
                      else if (bigboxMenuSel === 3 && _bbk) { setBigboxMode(null); setNicknameMode({ identKey: _bbk }); setNicknameInput(gs?.nicknames?.[_bbk] || ""); }
                      return;
                    }
                    if (shopMode === "browse" || shopMode === "browseConfirm") {
                      if (shopMode === "browse") {
                        if (shopMenuSel === 0) { setShopMode(null); }
                        else if (sr.current) {
                          const { player: _bp, dungeon: _bd } = sr.current;
                          const _bsi = _bp.inventory.filter(it => it.type !== "gold" && !it.shopPrice);
                          const _bsh = getShops(_bd).find(s => s.room && _bp.x >= s.room.x && _bp.x < s.room.x + s.room.w && _bp.y >= s.room.y && _bp.y < s.room.y + s.room.h);
                          if (_bsi.length > 0 && _bsh) { setShopMode("browseConfirm"); setShopMenuSel(0); }
                        }
                      } else {
                        if (shopMenuSel === 0) { setShopMode("browse"); setShopMenuSel(0); }
                        else if (sr.current) {
                          const { player: _bp2, dungeon: _bd2 } = sr.current;
                          const _toSell = _bp2.inventory.filter(it => it.type !== "gold" && !it.shopPrice);
                          const _bsh2 = getShops(_bd2).find(s => s.room && _bp2.x >= s.room.x && _bp2.x < s.room.x + s.room.w && _bp2.y >= s.room.y && _bp2.y < s.room.y + s.room.h) || getShops(_bd2)[0];
                          if (_toSell.length > 0 && _bsh2) {
                            const _calcB = (it) => it.type === "gem" ? gemSellPrice(it, _bp2.depth) : Math.ceil(itemPrice(it) * 0.5);
                            let _earn = 0;
                            for (const it of _toSell) { const _bv = _calcB(it); it.shopPrice = it.type === "gem" ? (it._gemBuyPrice || _bv) + _bv : _bv; it._shopId = _bsh2.id; _earn += _bv; }
                            _bp2.gold += _earn; _bsh2.unpaidTotal += _earn;
                            const _sk3 = _bd2.monsters.find(m => m.id === _bsh2.shopkeeperId && m.state === "friendly");
                            if (_sk3) _sk3.state = "blocking";
                            setMsgs(prev => [...prev.slice(-80), `所持品 ${_toSell.length} 件が店の商品になった。${_earn.toLocaleString()}Gを受け取った。店主が入口をふさいだ。`]);
                            sr.current = { ...sr.current }; setGs({ ...sr.current });
                          }
                          setShopMode(null);
                        }
                      }
                      return;
                    }
                    if (putMode) {
                      const _putInv = sr.current?.player?.inventory || [];
                      const _putItems = _putInv.map((it, i) => ({ it, i })).filter(({ i }) => putMode.floorPot ? true : i !== putMode.potIdx);
                      const _pgItems = _putItems.slice(putPage * 10, (putPage + 1) * 10);
                      const _putLocal = Math.min(putMenuSel, _pgItems.length); /* length = やめる */
                      if (_putLocal >= _pgItems.length) { cancelPutMode(); return; }
                      const _putSel = _pgItems[_putLocal];
                      if (_putSel && _putSel.it.type !== "pot") doPutItem(_putSel.i);
                      return;
                    }
                    if (springMode === "menu") {
                      if (springMenuSel === 0) { springDrink(); }
                      else if (springMenuSel === 1) { setSpringMode("soak"); setSpringMenuSel(0); }
                      else { setSpringMode(null); setSpringMenuSel(0); }
                      return;
                    }
                    if (springMode === "soak") {
                      const _spInv2 = sr.current?.player?.inventory || [];
                      const _spAbsIdx = springPage * 10 + springMenuSel;
                      if (_spInv2[_spAbsIdx]) { springDoSoak(_spAbsIdx); setSpringPage(0); setSpringMenuSel(0); }
                      return;
                    }
                    if (identifyMode) {
                      if (identifyConfirmRef.current) identifyConfirmRef.current();
                      return;
                    }
                    if (showInv) {
                      if (selIdx !== null) {
                        /* 足元ページの場合 */
                        const _dg3 = sr.current?.dungeon;
                        const _p3 = sr.current?.player;
                        const _flItems3 = _dg3 && _p3 ? (_dg3.items || []).filter(i => i.x === _p3.x && i.y === _p3.y && !i.wallEmbedded && !i.noPickup) : [];
                        const _flTraps3 = _dg3 && _p3 ? (_dg3.traps || []).filter(t => t.x === _p3.x && t.y === _p3.y) : [];
                        const _flAll3 = [..._flItems3, ..._flTraps3];
                        const _invOnlyPg3 = Math.ceil((_p3?.inventory?.length || 0) / 10) || 1;
                        const _isFlPg3 = _flAll3.length > 0 && invPage === _invOnlyPg3;
                        if (_isFlPg3 && selIdx < _flAll3.length) {
                          const _fle3 = _flAll3[selIdx];
                          const _fIsI3 = _flItems3.includes(_fle3);
                          if (invMenuSel !== null) {
                            const _fns3 = [];
                            if (!_fIsI3) {
                              _fns3.push(() => invActRef.current?.floorTrap?.(_fle3));
                              _fns3.push(() => setShowDesc(d => d === 10000 + selIdx ? null : 10000 + selIdx));
                            } else {
                              _fns3.push(() => invActRef.current?.floorPickup?.(_fle3));
                              const _isEq3 = ["weapon","armor","arrow","ring"].includes(_fle3.type);
                              const _kInv3 = _isEq3 || _fle3.type === "scroll";
                              if (_fle3.type === "pot") _fns3.push(() => invActRef.current?.floorOpenPutMode?.(_fle3));
                              else if (_fle3.type === "marker") _fns3.push(() => invActRef.current?.floorPen?.(_fle3));
                              else if (canUse(_fle3)) _fns3.push(() => invActRef.current?.floorItemAction?.(_fle3, (i3) => invActRef.current?.use?.(i3), !_isEq3, _kInv3));
                              if (_fle3.type === "spellbook") _fns3.push(() => invActRef.current?.floorItemAction?.(_fle3, (i3) => invActRef.current?.readSpellbook?.(i3), true, false));
                              if (_fle3.type === "arrow") _fns3.push(() => invActRef.current?.floorItemAction?.(_fle3, (i3) => invActRef.current?.shoot?.(i3), true, true));
                              if (_fle3.type === "wand") _fns3.push(() => invActRef.current?.floorWaveWand?.(_fle3));
                              if (_fle3.type === "wand") _fns3.push(() => invActRef.current?.floorItemAction?.(_fle3, (i3) => invActRef.current?.breakWand?.(i3), true, false));
                              if (_fle3.type === "pot") _fns3.push(() => invActRef.current?.floorItemAction?.(_fle3, (i3) => invActRef.current?.breakPot?.(i3), true, false));
                              _fns3.push(() => invActRef.current?.floorItemAction?.(_fle3, (i3) => invActRef.current?.throw?.(i3), true, true));
                              _fns3.push(() => setShowDesc(d => d === 10000 + selIdx ? null : 10000 + selIdx));
                            }
                            if (invMenuSel >= 0 && invMenuSel < _fns3.length) { _fns3[invMenuSel](); setInvMenuSel(null); }
                          } else { setInvMenuSel(0); }
                          return;
                        }
                        const _absIdx = invPage * 10 + selIdx;
                        const _invList = sr.current?.player?.inventory || [];
                        const _it = _invList[_absIdx];
                        if (invMenuSel !== null && _it) {
                          /* サブメニュー選択中: 選択中のアクションを実行 */
                          const _CUT = ["potion","food","scroll","weapon","armor","arrow","ring","pot","pen"];
                          const _fns = [];
                          if (_CUT.includes(_it.type)) _fns.push(() => invActRef.current?.use?.(_absIdx));
                          if (_it.type === "spellbook") _fns.push(() => invActRef.current?.readSpellbook?.(_absIdx));
                          if (_it.type === "arrow") _fns.push(() => invActRef.current?.shoot?.(_absIdx));
                          if (_it.type === "wand") { _fns.push(() => invActRef.current?.wave?.(_absIdx)); _fns.push(() => invActRef.current?.breakWand?.(_absIdx)); }
                          if (_it.type === "marker") _fns.push(() => invActRef.current?.useMarker?.(_absIdx));
                          if (_it.type === "pot") _fns.push(() => invActRef.current?.breakPot?.(_absIdx));
                          _fns.push(() => invActRef.current?.drop?.(_absIdx));
                          _fns.push(() => invActRef.current?.throw?.(_absIdx));
                          _fns.push(() => setShowDesc((p) => (p === _absIdx ? null : _absIdx)));
                          const _nik = getIdentKey(_it);
                          if (_nik && gs?.ident && !gs.ident.has(_nik)) _fns.push(() => { setNicknameMode({ identKey: _nik }); setNicknameInput(gs?.nicknames?.[_nik] || ''); setShowInv(false); setSelIdx(null); setShowDesc(null); setInvMenuSel(null); });
                          if (invMenuSel >= 0 && invMenuSel < _fns.length) { _fns[invMenuSel](); setInvMenuSel(null); }
                        } else if (dropModeRef.current) {
                          doDropItem(_absIdx);
                        } else {
                          setInvMenuSel(0);
                        }
                      }
                    } else { act("interact"); }
                  }}
                  color={spellListMode ? "#fc0" : bigboxMode === "menu" ? "#fc0" : showInv ? "#fc0" : (putMode || springMode || identifyMode) ? "#fc0" : "#0ff"}
                />
                <AB
                  label={bigboxMode === "put" ? "決" : showInv ? "置" : "前"}
                  sub={bigboxMode === "put" ? "決定" : showInv ? "置く" : "調べる"}
                  onClick={() => {
                    if (spellListMode) return;
                    if (bigboxMode === "put") { bigboxPutItem(bigboxPage * 10 + bigboxMenuSel); return; }
                    if (springMode || identifyMode || putMode) return;
                    if (showInv) { const _nd = !dropModeRef.current; dropModeRef.current = _nd; setDropMode(_nd); } else { doExamineFront(); }
                  }}
                  color={bigboxMode === "put" ? "#fc0" : showInv ? (dropMode ? "#f88" : "#fa8") : "#4af"}
                />
                <AB
                  label={showInv ? "整" : "待"}
                  sub={showInv ? "整理" : "待機"}
                  onClick={() => { if (spellListMode) return; if (springMode || identifyMode || putMode) return; if (showInv) { sortInventory(); } else { act("wait"); } }}
                  color={showInv ? "#8f8" : "#666"}
                />
                <AB
                  label="罠"
                  sub="探る"
                  onClick={() => { if (spellListMode) return; if (springMode || identifyMode || putMode) return; act("search_traps"); }}
                  color="#fa0"
                />
              </div>{" "}
              <div style={{ display: "flex", gap: 3 }}>
                <AB
                  label="走"
                  sub={dashMode ? "ON" : "ダッシュ"}
                  onClick={() => { if (spellListMode) return; if (revealMode) return; if (springMode || identifyMode || putMode) return; setDashMode((v) => !v); }}
                  color={dashMode ? "#f44" : "#a8f"}
                />
                <AB
                  label="魔"
                  sub="魔法"
                  onClick={() => { if (spellListMode) { setSpellListMode(false); return; } if (revealMode || showInv || lookMode || springMode || identifyMode || putMode) return; setSpellListMode(true); setSpellMenuSel(0); }}
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
                fontSize: 14,
                lineHeight: "1.5em",
              }}
            >
              {" "}
              <div style={{ fontWeight: "bold", marginBottom: 2 }}>
                {tmL}
              </div>{" "}
              <div style={{ color: "#a66", fontSize: 14 }}>
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
                  fontSize: 13,
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
            fontSize: 13,
            color: "#7a9acc",
            textAlign: "center",
            marginTop: 2,
          }}
        >
          矢印/テンキー:移動　A+矢印/テンキー:ダッシュ　Shift+矢印2方向:斜め移動　.:待機　x:所持品(↑↓で選択/Z:使用/X:閉じる)　w:見渡す　c:魔法
          {"<>"}:階段　q:矢を射る　z:アクション　f:足元(拾う/罠/階段/大箱/泉)　t:向き変更
        </div>
      )}{" "}
      {!mobile && throwMode && (
        <div
          style={{
            fontSize: 14,
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
      <PotPutModal mode={putMode} setMode={setPutMode} p={p} gs={gs} putPage={putPage} putMenuSel={putMenuSel} doPutItem={doPutItem} onCancel={cancelPutMode} iLabel={iLabel} dname={dname} mobile={mobile} />{" "}
      <MarkerModal mode={markerMode} setMode={setMarkerMode} sr={sr} menuSel={markerMenuSel} setMenuSel={setMarkerMenuSel} page={markerPage} setPage={setMarkerPage} doMarkerWrite={doMarkerWrite} setMsgs={setMsgs} mobile={mobile} pastIdent={pastIdent} discoveredItems={discoveredItems} />{" "}
      <SpellListModal mode={spellListMode} setMode={setSpellListMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} menuSel={spellMenuSel} setMenuSel={setSpellMenuSel} page={spellPage} setPage={setSpellPage} setIdentifyMode={setIdentifyMode} setShowInv={setShowInv} setSelIdx={setSelIdx} setShowDesc={setShowDesc} setThrowMode={setThrowMode} setDebugSpellMode={setDebugSpellMode} endTurn={endTurn} lu={lu} mobile={mobile} spellConfirmRef={spellConfirmRef} />{" "}
      <DebugSpellModal mode={debugSpellMode} setMode={setDebugSpellMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} menuSel={debugSpellMenuSel} setMenuSel={setDebugSpellMenuSel} endTurn={endTurn} mobile={mobile} />
      <SignModal sign={showSign} onClose={() => setShowSign(null)} mobile={mobile} />
      <MsgLogModal show={msgLogMode} msgs={msgs} scrollTop={msgLogScrollTop} setScrollTop={setMsgLogScrollTop} onClose={() => setMsgLogMode(false)} mobile={mobile} />
      <ShopModal mode={shopMode} setMode={setShopMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} menuSel={shopMenuSel} setMenuSel={setShopMenuSel} mobile={mobile} />
      <BigboxModal mode={bigboxMode} setMode={setBigboxMode} gs={gs} setMsgs={setMsgs} bigboxRef={bigboxRef} page={bigboxPage} setPage={setBigboxPage} menuSel={bigboxMenuSel} setMenuSel={setBigboxMenuSel} bigboxPutItem={bigboxPutItem} iLabel={iLabel} mobile={mobile} setNicknameMode={setNicknameMode} setNicknameInput={setNicknameInput} />
      <IdentifyModal mode={identifyMode} setMode={setIdentifyMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} endTurn={endTurn} iLabel={iLabel} mobile={mobile} identifyConfirmRef={identifyConfirmRef} identifyCancelRef={identifyCancelRef} />
      <NicknameModal mode={nicknameMode} setMode={setNicknameMode} input={nicknameInput} setInput={setNicknameInput} gs={gs} sr={sr} setGs={setGs} />
      <SpringModal mode={springMode} setMode={setSpringMode} gs={gs} menuSel={springMenuSel} setMenuSel={setSpringMenuSel} page={springPage} setPage={setSpringPage} springDrink={springDrink} springDoSoak={springDoSoak} iLabel={iLabel} mobile={mobile} />{" "}
      <WishModal mode={wishMode} setMode={setWishMode} onConfirm={confirmWish} onCancel={cancelWish} mobile={mobile} />{" "}
      <InventoryModal show={showInv} p={p} gs={gs} mobile={mobile} dropMode={dropMode} dropModeRef={dropModeRef} invPage={invPage} selIdx={selIdx} showDesc={showDesc} invMenuSel={invMenuSel} setShowInv={setShowInv} setDropMode={setDropMode} setSelIdx={setSelIdx} setShowDesc={setShowDesc} setInvPage={setInvPage} setInvMenuSel={setInvMenuSel} setNicknameMode={setNicknameMode} setNicknameInput={setNicknameInput} sortInventory={sortInventory} canUse={canUse} useLabel={useLabel} iLabel={iLabel} doUseItem={doUseItem} doReadSpellbook={doReadSpellbook} doShoot={doShoot} doWaveWand={doWaveWand} doBreakWand={doBreakWand} doUseMarker={doUseMarker} doBreakPot={doBreakPot} doDropItem={doDropItem} doThrow={doThrow} containerRef={ref} doFloorPickup={_doFloorPickup} doFloorTrap={_doFloorTrap} doFloorItemAction={_doFloorItemAction} doFloorOpenPutMode={_doFloorOpenPutMode} doFloorPen={_doFloorPen} doFloorWaveWand={_doFloorWaveWand} />{" "}
      <GameOverModal dead={dead} p={p} gameOverSel={gameOverSel} setShowScores={setShowScores} init={init} mobile={mobile} onReturnToHub={onReturnToHub && gameOverResult ? () => onReturnToHub(gameOverResult) : undefined} />
      <EndingModal show={showEnding} p={p} endingResult={endingResult} mobile={mobile} onDismiss={() => { setShowEnding(false); if (onReturnToHub && endingResult) onReturnToHub(endingResult); }} />
      <ScoresModal show={showScores} setShow={setShowScores} mobile={mobile} />
      <SidebarPanel mobile={mobile} landscape={landscape} portraitSrc={portraitSrc} loadPortrait={loadPortrait} clearPortrait={clearPortrait} setShowScores={setShowScores} setShowSettings={setShowSettings} />
      <TileEditorModal show={showTileEditor} setShow={setShowTileEditor} loadCustomTile={loadCustomTile} clearCustomTile={clearCustomTile} setCtLoaded={setCtLoaded} loadTileset={loadTileset} currentTileset={currentTileset} />
      <SettingsModal show={showSettings} setShow={setShowSettings} loadPortrait={loadPortrait} clearPortrait={clearPortrait} portraitSrc={portraitSrc} loadTileset={loadTileset} currentTileset={currentTileset} desktopVW={desktopVW} setDesktopVW={(v) => { setDesktopVW(v); localStorage.setItem('roguelike_desktop_vw', String(v)); }} mobile={mobile} />
      <ExitHubConfirmModal show={exitHubConfirm} sel={exitHubSel} setSel={setExitHubSel}
        onConfirm={performExitToHub}
        onCancel={() => setExitHubConfirm(false)}
        mobile={mobile} />
    </div>
  );
}
