import { useState, useEffect, useCallback, useRef } from "react";
import { MW, MH, T, TI, rng, pick, uid, clamp, DRO, refreshFOV, removeFloorItem, monsterAt, itemAt } from "./utils.js";
import {
  MONS,
  hasLOS,
  bfsNext,
  findRoom,
  getOpenDirs,
  monsterAI,
  makeMonster,
  makeGuard,
  spawnMonsters,
} from "./monsters.js";
import {
  ITEM_TILES,
  ITEMS,
  ARROW_T,
  EMPTY_BOTTLE,
  WATER_BOTTLE,
  BLANK_SCROLL,
  MAGIC_MARKER,
  SPELLBOOKS,
  SPELLS,
  WANDS,
  POTS,
  TRAPS,
  RAW_FOODS,
  COOKED_FOODS,
  RAW_SIZES,
  COOKED_SIZES,
  FOOD_EFFECTS,
  FOOD_DESCS,
  POT_FOOD_PREFIX,
  POT_FOOD_DESCS,
  POTION_FOOD_PREFIX,
  itemPrice,
  wPick,
  genFood,
  makeArrow,
  makePoisonArrow,
  makePiercingArrow,
  makeStone,
  makeMagicStone,
  makeBombArrow,
  addArrowsInv,
  addStonesInv,
  doExplosion,
  wallBreakDrop,
  applyPotEffect,
  makePot,
  scatterPotContents,
  applyPotionEffect,
  applyPotionToItem,
  splashPotion,
  applyWaterSplash,
  soakItemIntoSpring,
  placeItemAt,
  pushEntity,
  fireTrapItem,
  burnFoodItem,
  setPitfallBag,
  clearPitfallBag,
  applyWandEffect,
  fireWandBolt,
  getBlessMultiplier,
  breakWandAoE,
  shootArrow,
  monsterFireLightning,
  checkShopTheft,
  castSpellBolt,
  applySpellEffect,
  applyLightningToInventory,
  WEAPON_ABILITIES,
  ARMOR_ABILITIES,
  BB_TYPES,
  inMagicSealRoom,
  inCursedMagicSealRoom,
  getFarcastMode,
  monsterDrop,
  killMonster,
  getIdentKey,
  generateFakeNames,
  hasCursedExplosionPentacle,
  applyFireInventoryDamage,
} from "./items.js";
import { fireTrapPlayer } from "./traps.js";
import { genDungeon, genDebugDungeon, genDebugDungeonFloor2, triggerMonsterHouse } from "./dungeon.js";
import { trackItem, trackMonster, trackTrap, resetDiscoveries, getDiscoveries } from "./DiscoveryTracker.js";
import { TILE_NAMES, CUSTOM_TILE_PATH, customTileImages, clearCustomTileImages, ST, drawTile, VW_M, VH_M, VW_D, VH_D, VW_L, VH_L, _itemPickupSuffix, processPitfallBag, itemDisplayName } from "./render.js";
import { TileEditorModal, GameOverModal, ScoresModal, NicknameModal, IdentifyModal, ShopModal, SpringModal, BigboxModal, TpSelectModal, PotPutModal, MarkerModal, SpellListModal, InventoryModal, SidebarPanel, FloorSelectModal } from "./GameModals.jsx";
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
  const [springMode, setSpringMode] = useState(null);
  const [springMenuSel, setSpringMenuSel] = useState(0);
  const [springPage, setSpringPage] = useState(0);
  const [bigboxMode, setBigboxMode] = useState(null);
  const [bigboxMenuSel, setBigboxMenuSel] = useState(0);
  const [bigboxPage, setBigboxPage] = useState(0);
  const bigboxRef = useRef(null);
  const [facingMode, setFacingMode] = useState(false);
  const springTargetRef = useRef(null);
  const [shopMode, setShopMode] = useState(null);
  const [shopMenuSel, setShopMenuSel] = useState(0);
  const [putMenuSel, setPutMenuSel] = useState(0);
  const [putPage, setPutPage] = useState(0);
  /* null | "menu" | "soak" */ const [putMode, setPutMode] = useState(null);
  /* null | {markerIdx,step:"select_blank"|"select_type",blankIdx:number|null} */
  const [markerMode, setMarkerMode] = useState(null);
  const [markerMenuSel, setMarkerMenuSel] = useState(0);
  const [spellListMode, setSpellListMode] = useState(false);
  const [spellMenuSel, setSpellMenuSel] = useState(0);
  /* null | {potIdx:number} */ const [dashMode, setDashMode] = useState(false);
  /* null | {cx:number, cy:number} */ const [tpSelectMode, setTpSelectMode] = useState(null);
  /* null | {cx:number, cy:number} */ const [lookMode, setLookMode] = useState(null);
  /* null | {sel:number} */ const [floorSelectMode, setFloorSelectMode] = useState(null);
  /* null | { mode:'identify'|'unidentify' } */ const [identifyMode, setIdentifyMode] = useState(null);
  /* null | { identKey:string } */ const [nicknameMode, setNicknameMode] = useState(null);
  /* null | { pendingMsgs:string[] } */ const [revealMode, setRevealMode] = useState(null);
  const [nicknameInput, setNicknameInput] = useState('');
  /* mobile dash toggle */ const [dead, setDead] = useState(false);
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
  /* Load custom tile images (silently fail if not found — spritesheet fallback) */ useEffect(() => {
    clearCustomTileImages();
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
    const d = dungeonConfig?.dungeonType === "debug"
      ? genDebugDungeon()
      : genDungeon(startDepth - 1, dungeonConfig?.dungeonType || "beginner");
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
      spells: [],
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

  /* Canvas render */ useEffect(() => {
    if (!gs || !canvasRef.current) return;
    const cvs = canvasRef.current,
      ctx = cvs.getContext("2d");
    const ts = null;
    const { player: p, dungeon: dg } = gs;
    const vw = mobile ? (landscape ? VW_L : VW_M) : VW_D;
    const contW = cvs.parentElement?.clientWidth || 600;
    const sz = Math.max(12, Math.floor(contW / vw));
    /* モバイル縦：画面高さからUI要素分を引いてマップ表示行数を動的計算 */
    let vh;
    if (mobile && !landscape) {
      const uiH = 224; /* ステータスバー+HPバー+メッセージログ(4行)+操作ボタン+余白 */
      const availH = window.innerHeight - uiH;
      vh = Math.max(VH_M, Math.min(Math.floor(availH / sz), MH));
    } else {
      vh = mobile ? VH_L : VH_D;
    }
    const cw = vw * sz,
      ch = vh * sz;
    cvs.width = cw;
    cvs.height = ch;
    cvs.style.width = cw + "px";
    cvs.style.height = ch + "px";
    ctx.imageSmoothingEnabled = false;
    const hw = Math.floor(vw / 2),
      hh = Math.floor(vh / 2);
    const _camCx = lookMode ? lookMode.cx : (tpSelectMode ? tpSelectMode.cx : p.x);
    const _camCy = lookMode ? lookMode.cy : (tpSelectMode ? tpSelectMode.cy : p.y);
    const sx = clamp(_camCx - hw, 0, Math.max(0, MW - vw)),
      sy = clamp(_camCy - hh, 0, Math.max(0, MH - vh));
    ctx.fillStyle = "#080810";
    ctx.fillRect(0, 0, cw, ch);
    for (let vy = 0; vy < vh; vy++) {
      for (let vx = 0; vx < vw; vx++) {
        const x = sx + vx,
          y = sy + vy;
        if (x < 0 || x >= MW || y < 0 || y >= MH) continue;
        const px2 = vx * sz,
          py2 = vy * sz;
        const vis = dg.visible[y][x],
          exp2 = dg.explored[y][x];
        if (!vis && !exp2) {
          if (tpSelectMode && dg.map[y][x] !== T.WALL && dg.map[y][x] !== T.BWALL) {
            ctx.fillStyle = "#0d0d1a";
            ctx.fillRect(px2, py2, sz, sz);
          }
          continue;
        }
        /* Draw base tile */ const t = dg.map[y][x];
        let ti = TI.FLOOR;
        if (t === T.WALL || t === T.BWALL) ti = TI.WALL;
        else if (t === T.SD) ti = TI.SD;
        else if (t === T.SU) ti = TI.SU;
        /* Check if in corridor (not in any room, including hidden rooms) */ if (
          t === T.FLOOR &&
          ![...dg.rooms, ...(dg.hiddenRooms || [])].some(
            (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
          )
        )
          ti = TI.CORR;
        drawTile(ctx, ts, ti, px2, py2, sz);
        /* 壊せる壁にヒビ表示 */
        if (t === T.BWALL && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          ctx.strokeStyle = "#aa8844";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px2 + sz * 0.3, py2 + sz * 0.15);
          ctx.lineTo(px2 + sz * 0.5, py2 + sz * 0.5);
          ctx.lineTo(px2 + sz * 0.7, py2 + sz * 0.85);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px2 + sz * 0.5, py2 + sz * 0.5);
          ctx.lineTo(px2 + sz * 0.7, py2 + sz * 0.35);
          ctx.stroke();
          if (!vis) ctx.globalAlpha = 1;
        }
        /* 壁埋めアイテム：祝福マップ使用後に壁タイル上で薄く表示 */
        if ((t === T.WALL || t === T.BWALL) && (vis || exp2) && dg.itemsRevealed) {
          const _wi = dg.items.find(i => i.x === x && i.y === y && i.wallEmbedded);
          if (_wi) {
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = "rgba(255,220,60,0.25)";
            ctx.fillRect(px2, py2, sz, sz);
            drawTile(ctx, ts, _wi.tile, px2, py2, sz);
            ctx.globalAlpha = 1;
          }
        }
        /* Spring */ const spr = dg.springs?.find(
          (s) => s.x === x && s.y === y,
        );
        if (spr && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          drawTile(ctx, ts, TI.SPRING, px2, py2, sz);
          if (!vis) ctx.globalAlpha = 1;
        }
        const bba = dg.bigboxes?.find((b) => b.x === x && b.y === y);
        if (bba && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          drawTile(ctx, ts, TI.BIGBOX, px2, py2, sz);
          if (!vis) ctx.globalAlpha = 1;
        }
        /* Pentacle (魔方陣) */
        const _pent = dg.pentacles?.find((pc) => pc.x === x && pc.y === y);
        if (_pent && vis) {
          const _pentClr =
            _pent.kind === "sanctuary"    ? (_pent.blessed ? "#c0ffd8" : _pent.cursed ? "#800040" : "#40ff80") :
            _pent.kind === "vulnerability"? (_pent.blessed ? "#ff9060" : _pent.cursed ? "#804020" : "#ff6020") :
            _pent.kind === "magic_seal"   ? (_pent.blessed ? "#c0a0ff" : _pent.cursed ? "#403080" : "#8060ff") :
            _pent.kind === "thunder_trap" ? (_pent.blessed ? "#ffffa0" : _pent.cursed ? "#806020" : "#ffe040") :
            _pent.kind === "farcast"        ? (_pent.blessed ? "#a0ffff" : _pent.cursed ? "#204060" : "#40c0e0") :
            _pent.kind === "light"          ? (_pent.blessed ? "#ffffff" : _pent.cursed ? "#303030" : "#ffffaa") :
            _pent.kind === "teleport_trap"  ? (_pent.blessed ? "#c0a0ff" : _pent.cursed ? "#200040" : "#8040ff") :
            _pent.kind === "trap_gen"       ? (_pent.blessed ? "#ff8080" : _pent.cursed ? "#401010" : "#cc4040") :
            _pent.kind === "stone_throw"    ? (_pent.blessed ? "#80c0ff" : _pent.cursed ? "#102040" : "#4080cc") :
            _pent.kind === "knockback_aura" ? (_pent.blessed ? "#ffcc80" : _pent.cursed ? "#402010" : "#ff8040") :
            _pent.kind === "explosion"      ? (_pent.blessed ? "#ff8844" : _pent.cursed ? "#301008" : "#ff5500") :
            _pent.kind === "plain"          ? (_pent.blessed ? "#dddddd" : _pent.cursed ? "#555555" : "#999999") : "#ff6020";
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = _pentClr;
          ctx.fillRect(px2, py2, sz, sz);
          ctx.globalAlpha = 1;
          ctx.fillStyle = _pentClr;
          ctx.font = `bold ${Math.floor(sz * 0.78)}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("✦", px2 + sz / 2, py2 + sz / 2);
        }
        if (vis) {
          /* Player */ if (x === p.x && y === p.y) {
            const pf = p.facing || { dx: 0, dy: 1 };
            const pti =
              pf.dy > 0
                ? TI.PLAYER_DOWN
                : pf.dy < 0
                  ? TI.PLAYER_UP
                  : pf.dx < 0
                    ? TI.PLAYER_LEFT
                    : TI.PLAYER_RIGHT;
            drawTile(
              ctx,
              ts,
              customTileImages[pti] ? pti : TI.PLAYER,
              px2,
              py2,
              sz,
            );
            continue;
          }
          /* Monster (壁歩きは別パスで描画) */ const mon = dg.monsters.find(
            (m) => m.x === x && m.y === y && !m.wallWalker,
          );
          if (mon) {
            const _monTile = (p.bewitchedTurns || 0) > 0
              ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 7 + y * 13) % 9]
              : mon.tile;
            drawTile(ctx, ts, _monTile, px2, py2, sz);
            /* HP bar */ if (mon.hp < mon.maxHp) {
              const bw = sz - 2,
                bh = 2,
                hpR = mon.hp / mon.maxHp;
              ctx.fillStyle = "#300";
              ctx.fillRect(px2 + 1, py2, bw, bh);
              ctx.fillStyle = hpR > 0.5 ? "#0c0" : hpR > 0.25 ? "#cc0" : "#f22";
              ctx.fillRect(px2 + 1, py2, Math.max(1, bw * hpR), bh);
            }
            continue;
          }
          /* Item */ const it = dg.items.find((i) => i.x === x && i.y === y && !i.wallEmbedded);
          if (it) {
            const _itTile = (p.bewitchedTurns || 0) > 0
              ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 11 + y * 19) % 9]
              : it.tile;
            drawTile(ctx, ts, _itTile, px2, py2, sz);
            continue;
          }
          /* Trap */ const tr = dg.traps.find(
            (t2) => t2.x === x && t2.y === y && t2.revealed,
          );
          if (tr) {
            drawTile(ctx, ts, tr.tile, px2, py2, sz);
          }
        } else if (exp2) {
          /* Dim explored tiles */ ctx.fillStyle = "rgba(0,0,8,0.6)";
          ctx.fillRect(px2, py2, sz, sz);
          /* 暗闇中は発見済みオブジェクトを非表示 */
          const _inDark = (p.darknessTurns || 0) > 0;
          if (!_inDark) {
            /* 発見済みアイテムを薄く表示（祝福マップ時は未発見も含む） */
            const ri = dg.items.find((i) => i.x === x && i.y === y && !i.wallEmbedded && (i.discovered || dg.itemsRevealed));
            if (ri) { ctx.globalAlpha = 0.4; drawTile(ctx, ts, ri.tile, px2, py2, sz); ctx.globalAlpha = 1; }
            /* 発見済み罠を薄く表示 */
            const tr = dg.traps.find((t2) => t2.x === x && t2.y === y && t2.revealed);
            if (tr) { ctx.globalAlpha = 0.4; drawTile(ctx, ts, tr.tile, px2, py2, sz); ctx.globalAlpha = 1; }
          }
        }
      }
    }
    /* ===== モンスター感知：視界外モンスターを薄く表示 ===== */
    if ((p.monsterSenseTurns || 0) > 0 || dg.monsterSenseActive) {
      for (const _sm of dg.monsters) {
        if (_sm.wallWalker) continue; /* 壁歩きは別パスで描画 */
        if (dg.visible[_sm.y]?.[_sm.x]) continue; /* 視界内は通常描画済み */
        if (_sm.x < sx || _sm.x >= sx + vw || _sm.y < sy || _sm.y >= sy + vh) continue;
        const _spx = (_sm.x - sx) * sz, _spy = (_sm.y - sy) * sz;
        ctx.globalAlpha = 0.45;
        /* 感知は赤みがかった色調でオーバーレイ */
        ctx.fillStyle = "rgba(200,30,30,0.25)";
        ctx.fillRect(_spx, _spy, sz, sz);
        drawTile(ctx, ts, _sm.tile, _spx, _spy, sz);
        ctx.globalAlpha = 1;
      }
    }
    /* ===== 壁歩きモンスターを最前面に描画（視界内か隣接マスのみ） ===== */
    for (const _wm of dg.monsters) {
      if (!_wm.wallWalker) continue;
      if (_wm.x < sx || _wm.x >= sx + vw || _wm.y < sy || _wm.y >= sy + vh) continue;
      const _wVisible = dg.visible?.[_wm.y]?.[_wm.x];
      const _wAdj = Math.abs(_wm.x - p.x) <= 1 && Math.abs(_wm.y - p.y) <= 1;
      if (!_wVisible && !_wAdj) continue;
      const _wpx = (_wm.x - sx) * sz, _wpy = (_wm.y - sy) * sz;
      const _onWall = dg.map[_wm.y]?.[_wm.x] === T.WALL;
      if (_onWall) ctx.globalAlpha = 0.75;
      drawTile(ctx, ts, _wm.tile, _wpx, _wpy, sz);
      ctx.globalAlpha = 1;
      if (_wm.hp < _wm.maxHp) {
        const bw = sz - 2, bh = 2, hpR = _wm.hp / _wm.maxHp;
        ctx.fillStyle = "#300"; ctx.fillRect(_wpx + 1, _wpy, bw, bh);
        ctx.fillStyle = hpR > 0.5 ? "#0c0" : hpR > 0.25 ? "#cc0" : "#f22";
        ctx.fillRect(_wpx + 1, _wpy, Math.max(1, bw * hpR), bh);
      }
    }
    /* lookMode cursor overlay */
    if (lookMode) {
      const { cx: _lcx, cy: _lcy } = lookMode;
      if (_lcx >= sx && _lcx < sx + vw && _lcy >= sy && _lcy < sy + vh) {
        const _cpx = (_lcx - sx) * sz, _cpy = (_lcy - sy) * sz;
        ctx.fillStyle = "rgba(0,220,255,0.2)";
        ctx.fillRect(_cpx, _cpy, sz, sz);
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(_cpx + 1, _cpy + 1, sz - 2, sz - 2);
      }
    }
    /* tpSelectMode cursor overlay */
    if (tpSelectMode) {
      const { cx: _tcx, cy: _tcy } = tpSelectMode;
      if (_tcx >= sx && _tcx < sx + vw && _tcy >= sy && _tcy < sy + vh) {
        const _cpx = (_tcx - sx) * sz, _cpy = (_tcy - sy) * sz;
        const _tgtWall = dg.map[_tcy]?.[_tcx] === T.WALL || dg.map[_tcy]?.[_tcx] === T.BWALL;
        ctx.fillStyle = _tgtWall ? "rgba(255,60,60,0.25)" : "rgba(255,220,40,0.25)";
        ctx.fillRect(_cpx, _cpy, sz, sz);
        ctx.strokeStyle = _tgtWall ? "#ff4040" : "#ffe040";
        ctx.lineWidth = 2;
        ctx.strokeRect(_cpx + 1, _cpy + 1, sz - 2, sz - 2);
      }
    }
  }, [gs, mobile, landscape, ctLoaded, tpSelectMode, lookMode]);
  const lu = useCallback((p, ml) => {
    while (p.exp >= p.nextExp) {
      p.level++;
      p.exp -= p.nextExp;
      p.nextExp = Math.floor(p.nextExp * 1.5);
      p.maxHp += 5;
      p.hp = Math.min(p.hp + 10, p.maxHp);
      p.atk++;
      if (p.level % 2 === 0) p.def++;
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
          ml.push(`${it.name}がある。持ち物がいっぱいだ！`);
          break;
        }
      } else if (it.type === "arrow" && !it.shopPrice) {
        if (addArrowsInv(p.inventory, it.count, !!it.poison, !!it.pierce, p.maxInventory || 30, !!it.bombArrow)) {
          ml.push(`${it.name || "矢"}(${it.count}本)を拾った。`);
          removeFloorItem(dg, it);
          go = true;
        } else {
          ml.push(`${it.name || "矢"}がある。持ち物がいっぱいだ！`);
          break;
        }
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
        ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}がある。持ち物がいっぱいだ！`);
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
    const _nameFn = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
    trackTrap(trap);
    return fireTrapPlayer(trap, p, dg, ml, _nameFn);
  }, []);
  const moveMons = useCallback((dg, pl, ml) => {
    const opts = {
      bbFn: bigboxAddItem,
      fireTrapFn: (trap, p, dg2, ml2) => fireTrapPlayer(trap, p, dg2, ml2),
      monsterWandFn: (m, dx, dy) => {
        const _we = m.wandEffect || "lightning";
        if (_we === "lightning") {
          ml.push(`${m.name}が雷の杖を振った！`);
          monsterFireLightning(m.x, m.y, dg, pl, dx, dy, ml, lu, bigboxAddItem, m.name,
            (it) => itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames));
        } else if (_we === "curse_wand") {
          ml.push(`${m.name}が呪いの杖を振った！`);
          /* 呪いボルトを発射（魔封じチェック・障害物チェックあり） */
          let _cwHit = false;
          for (let _d = 1; _d < 20; _d++) {
            const _tx = m.x + dx * _d, _ty = m.y + dy * _d;
            if (inMagicSealRoom(_tx, _ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); _cwHit = true; break; }
            if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH || dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) { ml.push("呪いの魔法弾は壁に消えた。"); _cwHit = true; break; }
            if (_tx === pl.x && _ty === pl.y) {
              /* 反射の鎧チェック */
              if (pl.armor?.ability === "wand_reflect" || pl.armor?.abilities?.includes("wand_reflect")) {
                ml.push("反射の鎧が呪いの魔法弾を反射した！");
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
              if (pl.armor?.ability === "wand_reflect" || pl.armor?.abilities?.includes("wand_reflect")) {
                ml.push("反射の鎧が吹き飛ばしの魔法弾を反射した！");
                applyWandEffect("knockback", "monster", m, -dx, -dy, dg, pl, ml, lu, bigboxAddItem, 1, _nameFn, pl.atk || 3);
                if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, pl, ml, lu); }
              } else if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
                ml.push("祝福された聖域の加護が魔法弾を防いだ！");
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
              applyWandEffect("knockback", "monster", _bwMon, dx, dy, dg, pl, ml, lu, bigboxAddItem, 1, _nameFn, m.atk);
              if (_bwMon.hp <= 0) { trackMonster(_bwMon); killMonster(_bwMon, dg, pl, ml, lu); }
              _bwHit = true; break;
            }
          }
          if (!_bwHit) ml.push("吹き飛ばしの魔法弾は虚空に消えた。");
        }
      },
      monsterDropFn: (m, dg2, ml2) => monsterDrop(m, dg2, ml2, pl),
    };
    /* 近い敵から処理することで通路でのチェーン移動を自然に解決する */
    dg.monsters.sort((a, b) =>
      (Math.abs(a.x - pl.x) + Math.abs(a.y - pl.y)) -
      (Math.abs(b.x - pl.x) + Math.abs(b.y - pl.y))
    );
    dg.monsters.forEach((m) => {
      if (m.hp <= 0) return;
      m.turnAccum += m.speed;
      m.turnAttacks = 0;
      while (m.turnAccum >= 1) {
        m.turnAccum -= 1;
        if (m.hp <= 0) break;
        monsterAI(m, dg, pl, ml, opts);
      }
    });
  }, []);
  const chgFloor = useCallback((pl, dir, pitfall = false) => {
    const nd = pl.depth + dir;
    if (nd < 1) return null;
    if (!sr.current.floors) sr.current.floors = {};
    /* 店の部屋内で落とし穴等により階層を離脱した場合は泥棒状態にする */
    const _chgShops = sr.current.dungeon?.shops || (sr.current.dungeon?.shop ? [sr.current.dungeon.shop] : []);
    for (const _cs of _chgShops) {
      if (_cs.unpaidTotal > 0 && _cs.room &&
          pl.x >= _cs.room.x && pl.x < _cs.room.x + _cs.room.w &&
          pl.y >= _cs.room.y && pl.y < _cs.room.y + _cs.room.h) {
        sr.current.dungeon.shopTheft = true;
        break;
      }
    }
    sr.current.floors[pl.depth] = sr.current.dungeon;
    const _saved = sr.current.floors[nd];
    let d;
    if (_saved) {
      d = _saved;
      delete sr.current.floors[nd];
    } else if (sr.current.isDebugRun && nd >= 2) {
      d = genDebugDungeonFloor2();
    } else {
      d = genDungeon(nd - 1, sr.current.dungeonType || "beginner");
    }
    pl.depth = nd;
    if (sr.current.allBcKnown) {
      d.items.forEach(it => { it.fullIdent = true; it.bcKnown = true; });
    }
    if (pitfall) {
      const _pr = d.rooms[rng(0, d.rooms.length - 1)];
      pl.x = rng(_pr.x, _pr.x + _pr.w - 1);
      pl.y = rng(_pr.y, _pr.y + _pr.h - 1);
    } else {
      pl.x = dir > 0 ? d.stairUp.x : d.stairDown.x;
      pl.y = dir > 0 ? d.stairUp.y : d.stairDown.y;
    }
    refreshFOV(d, pl);
    d.nextSpawnTurn = pl.turns + rng(10, 50);
    return d;
  }, []);
  const endTurn = useCallback(
    (st, p, ml) => {
      /* 落とし穴バッグをセット — moveMons内のmonsterDropなどで発動した落とし穴を収集 */
      const _etPfBag = [];
      setPitfallBag(_etPfBag);
      p.turns++;
      const hd =
        p.armor?.ability === "slow_hunger" ||
        !!p.armor?.abilities?.includes("slow_hunger")
          ? 2
          : 1;
      if (p.turns % (15 * hd) === 0) {
        p.hunger = Math.max(0, p.hunger - 1);
      }
      if (p.hunger === 0) {
        p.deathCause = "空腹により";
        p.hp--;
        if (p.turns % 10 === 0) ml.push("空腹でHPが減っている...");
      } else if (p.hp > 0 && p.hp < p.maxHp) {
        const regenAmt =
          Math.max(1, Math.floor(p.maxHp / 100)) +
          (p.armor?.ability === "regen" ||
          !!p.armor?.abilities?.includes("regen")
            ? 1
            : 0);
        p.hp = Math.min(p.maxHp, p.hp + regenAmt);
      }
      /* MPクールダウンカウント */
      if ((p.mpCooldownTurns || 0) > 0) p.mpCooldownTurns--;
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
          const _thasLR = p.armor?.ability === "lightning_resist" || p.armor?.abilities?.includes("lightning_resist");
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
      moveMons(st.dungeon, p, ml);
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
              /* 呪い：フロア内の罠をランダムに1つ消す */
              if (_dg2.traps.length > 0) {
                const _ri = rng(0, _dg2.traps.length - 1);
                _dg2.traps.splice(_ri, 1);
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
          _dg.nextSpawnTurn = p.turns + (_dg.shopTheft ? rng(5, 15) : rng(10, 50));
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
    const timer = setTimeout(() => {
      if (!sr.current) return;
      const st = sr.current;
      const { player: p } = st;
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
        /* 鈍足スキップターン：モンスターだけ行動してプレイヤーはスキップ */
        p.slowSkip = false;
        p.slowTurns = Math.max(0, (p.slowTurns || 0) - 1);
        if (p.slowTurns <= 0) {
          ml.push("鈍足が解けた！");
        } else {
          ml.push("鈍足でターンがスキップされた...");
        }
      }
      endTurn(st, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...st };
      setGs({ ...st });
    }, 400);
    return () => clearTimeout(timer);
  }, [gs, endTurn]);

  const act = useCallback(
    (type, dx = 0, dy = 0) => {
      if (dead || !sr.current) return;
      if (revealMode) return;
      if (bigboxMode) return;
      if (lookMode) return;
      if (springMode) return;
      if (putMode) return;
      if (markerMode) return;
      if (spellListMode) return;
      if (throwMode !== null && type !== "inventory") return;
      if (showInv && type !== "inventory") return;
      const st = sr.current,
        { player: p, dungeon: dg } = st;
      let acted = false;
      const ml = [];
      if (p.sleepTurns > 0 || p.paralyzeTurns > 0 || p.slowSkip) return;
      if (type === "inventory") {
        setSpellListMode(false);
        setShowInv((v) => {
          if (v) { dropModeRef.current = false; setDropMode(false); }
          return !v;
        });
        setSelIdx(null);
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
                acted = true;
              } else {
              if (attackMon.paralyzed) {
                attackMon.paralyzed = false;
                ml.push(`${attackMon.name}の金縛りが解けた！`);
              }
              let ap = p.atk + (p.weapon?.atk || 0) + (p.weapon?.plus || 0);
              const _isBane = wab?.startsWith("bane_") && (
                (wab === "bane_float" ? attackMon.float : attackMon.kind === wab.slice(5)) ||
                (p.weapon?.abilities?.some(a => a.startsWith("bane_") && (
                  a === "bane_float" ? attackMon.float : attackMon.kind === a.slice(5)
                )))
              );
              if (_isBane) ap *= 2;
              let d = Math.max(1, Math.floor(ap * ap / (ap + attackMon.def)) + rng(-2, 2));
              let crit = false;
              if (wabHas("critical") && Math.random() < 0.25) {
                d *= 2;
                crit = true;
              }
              /* 脆弱の魔方陣チェック：祝福4倍/通常2倍/呪い半減 */
              const _vulnRoom = findRoom(dg.rooms, attackMon.x, attackMon.y);
              const _vulnPc = _vulnRoom && dg.pentacles?.find((pc) => pc.kind === "vulnerability" && pc.x >= _vulnRoom.x && pc.x < _vulnRoom.x + _vulnRoom.w && pc.y >= _vulnRoom.y && pc.y < _vulnRoom.y + _vulnRoom.h);
              if (_vulnPc) d = _vulnPc.cursed ? Math.max(1, Math.floor(d / 2)) : d * (_vulnPc.blessed ? 4 : 2);
              /* 壁の中の壁歩きモンスターへの攻撃：ダメージ半減 */
              const _atkInWall = attackMon.wallWalker && dg.map[attackMon.y]?.[attackMon.x] === T.WALL;
              if (_atkInWall) d = Math.max(1, Math.floor(d / 2));
              attackMon.hp -= d;
              if (attackMon.type === "shopkeeper") { attackMon.state = "hostile"; dg.shopTheft = true; }
              const atkSfx =
                (crit ? "会心！" : "") +
                (_isBane ? "特効！" : "") +
                (_atkInWall ? "（壁越し・半減）" : "");
              ml.push(`${attackMon.name}に${d}ダメージ！${atkSfx}`);
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
                if (_kbPcP) {
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
              if (attackMon.hp <= 0 && dg.monsters.includes(attackMon)) { trackMonster(attackMon); killMonster(attackMon, dg, p, ml, lu); }
              acted = true;
              } /* end else (hit) */
            }
          } else if (dg.map[ny][nx] !== T.WALL && dg.map[ny][nx] !== T.BWALL) {
            /* 呪われた聖域の魔方陣：プレイヤーは通行できない */
            const _cursedSanc = dg.pentacles?.find(pc => pc.kind === "sanctuary" && pc.cursed && pc.x === nx && pc.y === ny);
            if (_cursedSanc) {
              ml.push("呪われた魔方陣が行く手を阻んでいる！");
            } else {
            const _allShopsM = dg.shops || (dg.shop ? [dg.shop] : []);
            const _wasInShopOf = _allShopsM.filter(s => s.unpaidTotal > 0 && s.room &&
              p.x >= s.room.x && p.x < s.room.x + s.room.w &&
              p.y >= s.room.y && p.y < s.room.y + s.room.h);
            p.x = nx;
            p.y = ny;
            for (const _esh of _wasInShopOf) {
              if (!(p.x >= _esh.room.x && p.x < _esh.room.x + _esh.room.w &&
                  p.y >= _esh.room.y && p.y < _esh.room.y + _esh.room.h)) {
                dg.shopTheft = true;
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
            }
            autoPickup(p, st.dungeon, ml);
            if (dg.map[p.y][p.x] === T.SD) ml.push("下り階段がある。");
            if (dg.map[p.y][p.x] === T.SU) ml.push("上り階段がある。");
            const _bbStep = st.dungeon.bigboxes?.find(b => b.x === p.x && b.y === p.y);
            if (_bbStep) ml.push(`${_bbStep.name}がある。`);
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
          const _maxD = sr.current.maxDepth;
          if (_maxD !== null && p.depth >= _maxD) {
            /* 最下層クリア → 地上帰還 */
            if (onReturnToHub) {
              ml.push(`地下${p.depth}階の最深部を踏破した！地上へ帰還する…`);
              sr.current = { ...st };
              onReturnToHub({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: true, returnItems: [...p.inventory] });
              return;
            }
          } else {
            const nd = chgFloor(p, 1);
            if (nd) {
              st.dungeon = nd;
              ml.push(`地下${p.depth}階に降りた。`);
              acted = true;
            }
          }
        } else ml.push("ここに下り階段はない。");
      } else if (type === "stairs_up") {
        if (dg.map[p.y][p.x] === T.SU) {
          if (p.depth === 1) {
            if (onReturnToHub) {
              onReturnToHub({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: true, returnItems: [...p.inventory] });
              return;
            }
          } else {
            const nd = chgFloor(p, -1);
            if (nd) {
              st.dungeon = nd;
              ml.push(`地下${p.depth}階に昇った。`);
              acted = true;
            }
          }
        } else ml.push("ここに上り階段はない。");
      } else if (type === "interact") {
        /* 足元の階段チェック */
        if (dg.map[p.y][p.x] === T.SD) {
          const _maxD2 = sr.current.maxDepth;
          if (_maxD2 !== null && p.depth >= _maxD2) {
            if (onReturnToHub) {
              ml.push(`地下${p.depth}階の最深部を踏破した！地上へ帰還する…`);
              sr.current = { ...st };
              onReturnToHub({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: true, returnItems: [...p.inventory] });
              return;
            }
          } else {
            const nd = chgFloor(p, 1);
            if (nd) { st.dungeon = nd; ml.push(`地下${p.depth}階に降りた。`); acted = true; }
          }
        } else if (dg.map[p.y][p.x] === T.SU) {
          if (p.depth === 1) {
            if (onReturnToHub) {
              onReturnToHub({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: true, returnItems: [...p.inventory] });
              return;
            }
          } else {
            const nd = chgFloor(p, -1);
            if (nd) { st.dungeon = nd; ml.push(`地下${p.depth}階に昇った。`); acted = true; }
          }
        } else {
          /* 足元の大箱チェック（前方は除く） */
          const bb2 = dg.bigboxes?.find((b) => b.x === p.x && b.y === p.y);
          if (bb2) {
            bigboxRef.current = bb2;
            setBigboxMode("menu"); setBigboxMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), `${bb2.name}がある。どうする？`]);
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
                const _allS2 = dg.shops || (dg.shop ? [dg.shop] : []);
                const _pickShop = _allS2.find(s => s.id === _grIt._shopId) || _allS2[0];
                if (_pickShop) {
                  _pickShop.unpaidTotal += _grIt.shopPrice;
                  const _sk2 = dg.monsters.find((m) => m.id === _pickShop.shopkeeperId && m.state === "friendly");
                  if (_sk2) _sk2.state = "blocking";
                }
                ml.push(`${itemDisplayName(_grIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を取った！(${_grIt.shopPrice}G) 店主が入り口をふさいだ。`);
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
              const _tnFn = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              const _tr2 = fireTrapPlayer(_trapHere, p, dg, ml, _tnFn);
              if (_tr2 === "pitfall") {
                const nd2 = chgFloor(p, 1, true);
                if (nd2) { st.dungeon = nd2; ml.push(`地下${p.depth}階に落ちた！`); }
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
        /* 2倍速ターン減少 */
        if ((p.hasteTurns || 0) > 0) {
          p.hasteTurns--;
          if (p.hasteTurns <= 0) { p.hasteUsed = false; ml.push("2倍速が解けた！"); }
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
      }
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...st };
      setGs({ ...st });
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
    ],
  );
  /* 目の前を調べる（zキー・モバイル調べるボタン共通） */
  const doExamineFront = useCallback(() => {
    if (!sr.current) return;
    if (lookMode) return;
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
        if (_pweapon?.ability === "pickaxe" || _pweapon?.abilities?.includes("pickaxe")) {
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
          setMsgs((prev) => [...prev.slice(-80), `${bb6.name}がある。どうする？`]);
        } else {
          setMsgs((prev) => [...prev.slice(-80), "何もない。"]);
        }
      }
    }
  }, [act, lookMode]);
  const doDash = useCallback(
    (dx, dy) => {
      if (dead || !sr.current) return;
      if (springMode || putMode || markerMode || spellListMode || throwMode || showInv || lookMode) return;
      const st = sr.current,
        { player: p, dungeon: dg } = st;
      if (p.sleepTurns > 0 || p.paralyzeTurns > 0 || (p.slowTurns || 0) > 0 || (p.confusedTurns || 0) > 0) return;
      const ml = [];
      let steps = 0;
      const startInRoom =
        dg.rooms?.some(
          (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h,
        ) ?? false;
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
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.cursed && pc.x === nx && pc.y === ny)) break;
        const _allShopsD = dg.shops || (dg.shop ? [dg.shop] : []);
        const _wasInShopDOf = _allShopsD.filter(s => s.unpaidTotal > 0 && s.room &&
          p.x >= s.room.x && p.x < s.room.x + s.room.w &&
          p.y >= s.room.y && p.y < s.room.y + s.room.h);
        p.x = nx;
        p.y = ny;
        for (const _eshD of _wasInShopDOf) {
          if (!(p.x >= _eshD.room.x && p.x < _eshD.room.x + _eshD.room.w &&
              p.y >= _eshD.room.y && p.y < _eshD.room.y + _eshD.room.h)) {
            dg.shopTheft = true;
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
        if (tr) {
          endTurn(st, p, ml);
          break;
        }
        const _dashRevTrap = dg.traps.find((t) => t.x === p.x && t.y === p.y && t.revealed);
        if (_dashRevTrap) {
          ml.push(`${_dashRevTrap.name}がある。`);
          endTurn(st, p, ml);
          break;
        }
        {
          const _dashIt = st.dungeon.items.find((i) => i.x === p.x && i.y === p.y);
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
        const _dashSpr = st.dungeon.springs?.find((s) => s.x === p.x && s.y === p.y);
        if (_dashSpr) {
          ml.push("泉がある。");
          endTurn(st, p, ml);
          break;
        }
        const _dashBb = st.dungeon.bigboxes?.find((b) => b.x === p.x && b.y === p.y);
        if (_dashBb) {
          ml.push(`${_dashBb.name}がある。`);
          endTurn(st, p, ml);
          break;
        }
        const curInRoom =
          dg.rooms?.some(
            (r) =>
              p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h,
          ) ?? false;
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
        if (startInRoom) {
          if (!curInRoom || blocked) break;
        } else {
          if ((curPerps > prevPerps && curPerps > 0) || blocked) break;
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
      /* pickaxe能力を持つ場合、耐久値をベース/素材から引き継ぐ */
      if (_mabs.includes("pickaxe")) {
        merged.durability = merged.durability ?? mat.durability ?? 30;
      } else {
        delete merged.durability;
      }
      bb.contents = bb.contents.filter((i) => i !== base && i !== mat);
      bb.contents.push(merged);
      bb.capacity = bb.contents.length;
      ml.push(`合成完了！${base.name}と${mat.name}が融合した！`);
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
        if (item.type === "weapon" || item.type === "armor") {
          const before = item.plus || 0;
          item.plus = before + 1;
          const fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
          ml.push(`${item.name}が強化された！(${fp(before)}→${fp(item.plus)})`);
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
              ]
            : [
                { l: "極小の", v: 10 },
                { l: "小さい", v: 20 },
                { l: "普通の", v: 35 },
                { l: "大きい", v: 55 },
                { l: "特大", v: 80 },
              ];
          let upgraded = false;
          for (let si = 0; si < szLevels.length - 1; si++) {
            if (item.name.includes(szLevels[si].l)) {
              const oldName = item.name;
              const cur = szLevels[si];
              const next = szLevels[si + 1];
              item.name = item.name.replace(cur.l, next.l);
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
        if (it.ability === "no_degrade" || it.abilities?.includes("no_degrade")) {
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
      p.inventory.splice(itemIdx, 1);
      bigboxAddItem(bb, it, dg, ml);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setBigboxMode("menu");
      setBigboxMenuSel(0);
      setBigboxPage(0);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [bigboxAddItem, endTurn],
  );
  const sortInventory = useCallback(() => {
    if (!sr.current) return;
    const p = sr.current.player;
    const ORDER = [
      "weapon",
      "armor",
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
  useEffect(() => {
    const onUp = (e) => {
      if (e.key === "Shift") shiftRef.current = false;
    };
    window.addEventListener("keyup", onUp);
    return () => window.removeEventListener("keyup", onUp);
  }, []);
  const handleKey = useCallback(
    (e) => {
      const k = e.key.toLowerCase();
      if (k === "shift") {
        shiftRef.current = true;
      }
      if (dead) {
        if (!showScores) {
          if (k === "arrowleft" || k === "arrowup" || k === "h") {
            e.preventDefault(); setGameOverSel(0);
          } else if (k === "arrowright" || k === "arrowdown" || k === "l") {
            e.preventDefault(); setGameOverSel(1);
          } else if (k === "enter" || k === " " || k === "z") {
            e.preventDefault();
            if (gameOverSel === 0) init();
            else setShowScores(true);
          }
        } else {
          if (k === "escape" || k === "enter" || k === " " || k === "z") {
            e.preventDefault(); setShowScores(false);
          }
        }
        return;
      }
      if (floorSelectMode) {
        e.preventDefault();
        const { player: _fsp } = sr.current || {};
        if (!_fsp) return;
        const MAX_FLOOR = 30;
        const isUp   = k === "arrowup"   || e.code === "Numpad8";
        const isDown = k === "arrowdown" || e.code === "Numpad2";
        if (isUp)   { setFloorSelectMode({ sel: Math.max(1, floorSelectMode.sel - 1) }); return; }
        if (isDown) { setFloorSelectMode({ sel: Math.min(MAX_FLOOR, floorSelectMode.sel + 1) }); return; }
        if (k === "z" || k === "enter") {
          const _f = floorSelectMode.sel;
          const _ml = [];
          if (!sr.current.floors) sr.current.floors = {};
          sr.current.floors[_fsp.depth] = sr.current.dungeon;
          const _saved = sr.current.floors[_f];
          let _d;
          if (_saved) { _d = _saved; delete sr.current.floors[_f]; }
          else { _d = genDungeon(_f - 1, sr.current.dungeonType || "beginner"); }
          _fsp.depth = _f;
          const _rm = _d.rooms[rng(0, _d.rooms.length - 1)];
          _fsp.x = rng(_rm.x, _rm.x + _rm.w - 1);
          _fsp.y = rng(_rm.y, _rm.y + _rm.h - 1);
          refreshFOV(_d, _fsp);
          _d.nextSpawnTurn = _fsp.turns + rng(10, 50);
          sr.current.dungeon = _d;
          _ml.push(`${_f}階へテレポートした！【呪】`);
          endTurn(sr.current, _fsp, _ml);
          setFloorSelectMode(null);
          setMsgs((prev) => [...prev.slice(-80), ..._ml]);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        }
        if (k === "x" || k === "escape") { setFloorSelectMode(null); return; }
        return;
      }
      if (tpSelectMode) {
        e.preventDefault();
        const { player: p, dungeon: dg } = sr.current || {};
        if (!p || !dg) return;
        const { cx, cy } = tpSelectMode;
        const isUp    = k === "arrowup"    || e.code === "Numpad8";
        const isDown  = k === "arrowdown"  || e.code === "Numpad2";
        const isLeft  = k === "arrowleft"  || e.code === "Numpad4";
        const isRight = k === "arrowright" || e.code === "Numpad6";
        const isUL = e.code === "Numpad7", isUR = e.code === "Numpad9";
        const isDL = e.code === "Numpad1", isDR = e.code === "Numpad3";
        let ncx = cx, ncy = cy;
        if (isUp)    ncy = Math.max(0, cy - 1);
        else if (isDown)  ncy = Math.min(MH - 1, cy + 1);
        else if (isLeft)  ncx = Math.max(0, cx - 1);
        else if (isRight) ncx = Math.min(MW - 1, cx + 1);
        else if (isUL) { ncx = Math.max(0, cx - 1); ncy = Math.max(0, cy - 1); }
        else if (isUR) { ncx = Math.min(MW - 1, cx + 1); ncy = Math.max(0, cy - 1); }
        else if (isDL) { ncx = Math.max(0, cx - 1); ncy = Math.min(MH - 1, cy + 1); }
        else if (isDR) { ncx = Math.min(MW - 1, cx + 1); ncy = Math.min(MH - 1, cy + 1); }
        if (ncx !== cx || ncy !== cy) { setTpSelectMode({ cx: ncx, cy: ncy }); return; }
        const doTpConfirm = (tx, ty) => {
          const ml = [];
          const isWalkable = dg.map[ty]?.[tx] !== T.WALL && dg.map[ty]?.[tx] !== T.BWALL && dg.map[ty]?.[tx] !== undefined;
          if (isWalkable) {
            p.x = tx; p.y = ty;
            ml.push("テレポートした！（目的地指定）【祝】");
          } else {
            const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
            p.x = rng(rm.x, rm.x + rm.w - 1);
            p.y = rng(rm.y, rm.y + rm.h - 1);
            ml.push("壁の中！ランダムにテレポートした。");
          }
          endTurn(sr.current, p, ml);
          refreshFOV(dg, p);
          setTpSelectMode(null);
          setMsgs((prev) => [...prev.slice(-80), ...ml]);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
        };
        if (k === "z" || k === "enter") { doTpConfirm(cx, cy); return; }
        if (k === "x" || k === "escape") {
          const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
          doTpConfirm(rng(rm.x, rm.x + rm.w - 1), rng(rm.y, rm.y + rm.h - 1));
          return;
        }
        return;
      }
      if (lookMode) {
        e.preventDefault();
        const { player: p2, dungeon: dg2 } = sr.current || {};
        if (!p2 || !dg2) return;
        const { cx, cy } = lookMode;
        const isUp    = k === "arrowup"    || e.code === "Numpad8";
        const isDown  = k === "arrowdown"  || e.code === "Numpad2";
        const isLeft  = k === "arrowleft"  || e.code === "Numpad4";
        const isRight = k === "arrowright" || e.code === "Numpad6";
        const isUL = e.code === "Numpad7", isUR = e.code === "Numpad9";
        const isDL = e.code === "Numpad1", isDR = e.code === "Numpad3";
        let ncx = cx, ncy = cy;
        if (isUp)         ncy = Math.max(0, cy - 1);
        else if (isDown)  ncy = Math.min(MH - 1, cy + 1);
        else if (isLeft)  ncx = Math.max(0, cx - 1);
        else if (isRight) ncx = Math.min(MW - 1, cx + 1);
        else if (isUL) { ncx = Math.max(0, cx - 1); ncy = Math.max(0, cy - 1); }
        else if (isUR) { ncx = Math.min(MW - 1, cx + 1); ncy = Math.max(0, cy - 1); }
        else if (isDL) { ncx = Math.max(0, cx - 1); ncy = Math.min(MH - 1, cy + 1); }
        else if (isDR) { ncx = Math.min(MW - 1, cx + 1); ncy = Math.min(MH - 1, cy + 1); }
        if (ncx !== cx || ncy !== cy) {
          setLookMode({ cx: ncx, cy: ncy });
          const _lookDesc = getLookDesc(ncx, ncy, dg2);
          if (_lookDesc) setMsgs(prev => [...prev.slice(-80), `[見渡す] ${_lookDesc}`]);
          return;
        }
        if (k === "x" || k === "escape") {
          setLookMode(null);
          setMsgs(prev => [...prev.slice(-80), "見渡しを終了した。"]);
          return;
        }
        return;
      }
      if (showInv) {
        const inv = sr.current?.player?.inventory || [];
        const totalPages = Math.ceil(inv.length / 10) || 1;
        const pageItems = inv.slice(invPage * 10, (invPage + 1) * 10);
        const len = pageItems.length;
        const absIdx = selIdx !== null ? invPage * 10 + selIdx : null;
        const getActs = (it, ai) => {
          const a = [];
          if (canUse(it))
            a.push({
              label: useLabel(it),
              fn: () => invActRef.current?.use?.(ai),
            });
          if (it.type === "spellbook")
            a.push({ label: "読む", fn: () => invActRef.current?.readSpellbook?.(ai) });
          if (it.type === "arrow")
            a.push({ label: "射る", fn: () => invActRef.current?.shoot?.(ai) });
          if (it.type === "wand")
            a.push({ label: "振る", fn: () => invActRef.current?.wave?.(ai) });
          if (it.type === "wand")
            a.push({
              label: "壊す",
              fn: () => invActRef.current?.breakWand?.(ai),
            });
          if (it.type === "marker")
            a.push({ label: "書く", fn: () => invActRef.current?.useMarker?.(ai) });
          if (it.type === "pot")
            a.push({
              label: "割る",
              fn: () => invActRef.current?.breakPot?.(ai),
            });
          a.push({ label: "置く", fn: () => invActRef.current?.drop?.(ai) });
          a.push({
            label: it.type === "arrow" ? "投げる(束)" : "投げる",
            fn: () => invActRef.current?.throw?.(ai),
          });
          a.push({
            label: "説明",
            fn: () => setShowDesc((p) => (p === ai ? null : ai)),
          });
          const _nik = getIdentKey(it);
          if (_nik && gs?.ident && !gs.ident.has(_nik)) {
            a.push({
              label: "名付ける",
              fn: () => {
                setNicknameMode({ identKey: _nik });
                setNicknameInput(gs?.nicknames?.[_nik] || '');
                setShowInv(false); setSelIdx(null); setShowDesc(null);
              },
            });
          }
          return a;
        };
        if (invMenuSel !== null) {
          if (k === "escape" || k === "x") {
            e.preventDefault();
            setInvMenuSel(null);
            return;
          }
          const isLeft = k === "arrowleft" || e.code === "Numpad4";
          const isRight = k === "arrowright" || e.code === "Numpad6";
          if ((isLeft || isRight) && selIdx !== null && pageItems[selIdx]) {
            e.preventDefault();
            const acts = getActs(pageItems[selIdx], absIdx);
            setInvMenuSel(
              (p) => (p + (isRight ? 1 : -1) + acts.length) % acts.length,
            );
            return;
          }
          if (
            (k === "enter" || k === "z") &&
            selIdx !== null &&
            pageItems[selIdx]
          ) {
            e.preventDefault();
            const acts = getActs(pageItems[selIdx], absIdx);
            if (invMenuSel >= 0 && invMenuSel < acts.length) {
              acts[invMenuSel].fn();
              setInvMenuSel(null);
            }
            return;
          }
          return;
        }
        const isUp = k === "arrowup" || e.code === "Numpad8";
        const isDown = k === "arrowdown" || e.code === "Numpad2";
        const isLeft = k === "arrowleft" || e.code === "Numpad4";
        const isRight = k === "arrowright" || e.code === "Numpad6";
        if (k === "escape" || k === "x" || k === "i") {
          e.preventDefault();
          if (selIdx !== null) {
            setSelIdx(null);
            setShowDesc(null);
          } else {
            setShowInv(false);
            dropModeRef.current = false;
            setDropMode(false);
            setInvPage(0);
          }
          return;
        }
        if ((isUp || isDown) && len > 0) {
          e.preventDefault();
          setSelIdx((prev) => {
            if (prev === null) return isDown ? 0 : len - 1;
            return (prev + (isDown ? 1 : -1) + len) % len;
          });
          setShowDesc(null);
          return;
        }
        if (isLeft || isRight) {
          e.preventDefault();
          const newPage =
            (invPage + (isRight ? 1 : -1) + totalPages) % totalPages;
          setInvPage(newPage);
          setSelIdx(null);
          setInvMenuSel(null);
          setShowDesc(null);
          return;
        }
        if (
          (k === "enter" || k === "z") &&
          selIdx !== null &&
          pageItems[selIdx]
        ) {
          e.preventDefault();
          if (dropModeRef.current) {
            doDropItem(invPage * 10 + selIdx);
          } else {
            setInvMenuSel(0);
          }
          return;
        }
        if (k === "s") {
          e.preventDefault();
          sortInventory();
          return;
        }
        if (k === "d") {
          e.preventDefault();
          const newMode = !dropModeRef.current;
          dropModeRef.current = newMode;
          setDropMode(newMode);
          return;
        }
        return;
      }
      if (facingMode) {
        const npm2 = {
          Numpad8: [0, -1],
          Numpad2: [0, 1],
          Numpad4: [-1, 0],
          Numpad6: [1, 0],
          Numpad7: [-1, -1],
          Numpad9: [1, -1],
          Numpad1: [-1, 1],
          Numpad3: [1, 1],
        };
        const fdir =
          npm2[e.code] ||
          (k === "arrowup"
            ? [0, -1]
            : k === "arrowdown"
              ? [0, 1]
              : k === "arrowleft"
                ? [-1, 0]
                : k === "arrowright"
                  ? [1, 0]
                  : null);
        if (fdir) {
          e.preventDefault();
          if (sr.current) {
            sr.current.player.facing = { dx: fdir[0], dy: fdir[1] };
            setGs({ ...sr.current });
          }
          setFacingMode(false);
          return;
        }
        if (k === "t" || k === "escape") {
          e.preventDefault();
          setFacingMode(false);
          return;
        }
        return;
      }
      if (e.code && e.code.startsWith("Numpad")) {
        const npm = {
          Numpad1: [-1, 1],
          Numpad2: [0, 1],
          Numpad3: [1, 1],
          Numpad4: [-1, 0],
          Numpad5: [0, 0],
          Numpad6: [1, 0],
          Numpad7: [-1, -1],
          Numpad8: [0, -1],
          Numpad9: [1, -1],
        };
        if (
          npm[e.code] !== undefined &&
          !putMode &&
          !springMode &&
          !bigboxMode &&
          !markerMode
        ) {
          e.preventDefault();
          const [dx, dy] = npm[e.code];
          if (throwMode !== null) {
            execRef.current?.(dx, dy);
          } else if (!showInv) {
            if (dx === 0 && dy === 0) act("wait");
            else if (e.shiftKey || shiftRef.current) doDash(dx, dy);
            else act("move", dx, dy);
          }
          return;
        }
      }
      if (revealMode) {
        // 何かキーで続きのメッセージを表示
        if (revealMode.pendingMsgs.length) setMsgs(prev => [...prev.slice(-80), ...revealMode.pendingMsgs]);
        setRevealMode(null);
        e.preventDefault();
        return;
      }
      if (nicknameMode) {
        // input要素がフォーカスを持つのでキー入力はinputが処理する。ESCのみ対応
        if (k === "escape") { e.preventDefault(); setNicknameMode(null); }
        return;
      }
      if (identifyMode) {
        e.preventDefault();
        if (!sr.current) return;
        const _p_id = sr.current.player;
        const _isBCMode = identifyMode.mode === 'bless' || identifyMode.mode === 'curse';
        const _isDupMode = identifyMode.mode === 'duplicate';
        const _filt_id = _p_id.inventory
          .map((_it, _i) => ({ it: _it, i: _i }))
          .filter(({ it, i }) => {
            if (_isBCMode || _isDupMode) return it.type !== "gold";
            if (identifyMode.scrollIdx === i) return false;
            if (it.type === 'weapon' || it.type === 'armor') {
              return identifyMode.mode === 'identify' ? (!it.fullIdent && !it.bcKnown) : (it.fullIdent || it.bcKnown);
            }
            const _k = getIdentKey(it);
            if (!_k) return false;
            if (identifyMode.mode === 'identify') return !sr.current.ident.has(_k) || (!it.fullIdent && !it.bcKnown);
            return sr.current.ident.has(_k);
          });
        const _len_id = _filt_id.length;
        const _idPage    = identifyMode.page || 0;
        const _idTotalPg = Math.max(1, Math.ceil(_len_id / 10));
        const _idPageItems = _filt_id.slice(_idPage * 10, (_idPage + 1) * 10);
        const _idPageLen   = _idPageItems.length;
        const _isUp_id    = k === "arrowup"    || e.code === "Numpad8";
        const _isDown_id  = k === "arrowdown"  || e.code === "Numpad2";
        const _isLeft_id  = k === "arrowleft"  || e.code === "Numpad4";
        const _isRight_id = k === "arrowright" || e.code === "Numpad6";
        if (_isUp_id || _isDown_id) {
          if (_idPageLen > 0) setIdentifyMode({ ...identifyMode, sel: ((identifyMode.sel || 0) + (_isDown_id ? 1 : -1) + _idPageLen) % _idPageLen });
          return;
        }
        if (_isLeft_id || _isRight_id) {
          if (_idTotalPg > 1) setIdentifyMode({ ...identifyMode, page: ((_idPage + (_isRight_id ? 1 : -1)) + _idTotalPg) % _idTotalPg, sel: 0 });
          return;
        }
        if (k === "escape" || k === "x") {
          setIdentifyMode(null);
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          return;
        }
        if ((k === "enter" || k === "z") && _idPageLen > 0) {
          const _curSel_id = Math.min(identifyMode.sel || 0, _idPageLen - 1);
          const { it: _selIt } = _idPageItems[_curSel_id];
          let _msgResult;
          if (identifyMode.mode === 'bless') {
            if (_selIt.type === 'pot') {
              _selIt.capacity = (_selIt.capacity || 1) + 1;
              _msgResult = `${_selIt.name}を祝福した！(容量+1 → ${_selIt.capacity})【祝】`;
            } else { _selIt.blessed = true; _selIt.cursed = false; _selIt.bcKnown = true; _msgResult = `${_selIt.name}を祝福した！【祝】`; }
          } else if (identifyMode.mode === 'curse') {
            if (_selIt.type === 'pot') {
              const _nc = Math.max(0, (_selIt.capacity || 1) - 1);
              if ((_selIt.contents?.length || 0) > _nc) {
                const _rmIdx = _p_id.inventory.indexOf(_selIt);
                if (_rmIdx !== -1) { const _fts2 = new Set(); for (const _ci of (_selIt.contents || [])) placeItemAt(sr.current.dungeon, _p_id.x, _p_id.y, _ci, [], _fts2); _p_id.inventory.splice(_rmIdx, 1); }
                _msgResult = `${_selIt.name}が呪いで割れた！中身が足元に落ちた！【呪】`;
              } else { _selIt.capacity = _nc; _msgResult = `${_selIt.name}を呪った！(容量-1 → ${_selIt.capacity})【呪】`; }
            } else { _selIt.cursed = true; _selIt.blessed = false; _selIt.bcKnown = true; _msgResult = `${_selIt.name}を呪った！【呪】`; }
          } else if (identifyMode.mode === 'duplicate') {
            const _dupCount = identifyMode.blessed ? 2 : identifyMode.cursed ? 0 : 1;
            if (_dupCount === 0) {
              const _rmIdx = _p_id.inventory.indexOf(_selIt);
              if (_rmIdx !== -1) _p_id.inventory.splice(_rmIdx, 1);
              _msgResult = `${_selIt.name}が消えてしまった！【呪】`;
            } else {
              for (let _di = 0; _di < _dupCount; _di++) _p_id.inventory.push({ ..._selIt, id: uid() });
              _msgResult = identifyMode.blessed ? `${_selIt.name}が2つ増えた！【祝】` : `${_selIt.name}が1つ増えた！`;
            }
          } else {
            const _isWA = _selIt.type === 'weapon' || _selIt.type === 'armor';
            const _selKey = _isWA ? null : getIdentKey(_selIt);
            if (identifyMode.mode === 'identify') {
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
          if (identifyMode.mode !== 'duplicate' && identifyMode.scrollIdx != null) {
            sr.current.player.inventory.splice(identifyMode.scrollIdx, 1);
          }
          if (identifyMode.spellCost != null) {
            sr.current.player.mp -= identifyMode.spellCost;
          }
          endTurn(sr.current, sr.current.player, []);
          const _ml_id = identifyMode.spellMsg ? [identifyMode.spellMsg, _msgResult] : [_msgResult];
          setIdentifyMode(null);
          setMsgs((prev) => [...prev.slice(-80), ..._ml_id]);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }
        return;
      }
      if (putMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") {
          setPutMode(null);
          setPutPage(0);
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          return;
        }
        if (!sr.current) return;
        const inv4 = sr.current.player.inventory;
        const pItems4 = inv4
          .map((it, i) => ({ it, i }))
          .filter(({ i }) => i !== putMode.potIdx);
        const _ps4 = 10;
        const _tp4 = Math.max(1, Math.ceil(pItems4.length / _ps4));
        const _pg4 = pItems4.slice(putPage * _ps4, (putPage + 1) * _ps4);
        const _plen4 = _pg4.length;
        const isUp4 = k === "arrowup" || e.code === "Numpad8";
        const isDown4 = k === "arrowdown" || e.code === "Numpad2";
        const isLeft4 = k === "arrowleft" || e.code === "Numpad4";
        const isRight4 = k === "arrowright" || e.code === "Numpad6";
        if ((isUp4 || isDown4) && _plen4 > 0) {
          setPutMenuSel((s) => (s + (isDown4 ? 1 : -1) + _plen4) % _plen4);
          return;
        }
        if ((isLeft4 || isRight4) && _tp4 > 1) {
          setPutPage((p) => (p + (isRight4 ? 1 : -1) + _tp4) % _tp4);
          setPutMenuSel(0);
          return;
        }
        if ((k === "enter" || k === "z") && _plen4 > 0) {
          const sel4 = _pg4[Math.min(putMenuSel, _plen4 - 1)];
          if (sel4.it.type === "pot")
            setMsgs((prev) => [
              ...prev.slice(-80),
              "壺の中に壺は入れられない。",
            ]);
          else invActRef.current?.put?.(sel4.i);
        }
        return;
      }
      if (markerMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") {
          setMarkerMode(null);
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          return;
        }
        if (!sr.current) return;
        const inv5 = sr.current.player.inventory;
        const isUp5   = k === "arrowup"   || e.code === "Numpad8";
        const isDown5 = k === "arrowdown"  || e.code === "Numpad2";
        if (markerMode.step === "select_blank") {
          const blanks5 = inv5
            .map((it, i) => ({ it, i }))
            .filter(({ it }) => (it.type === "scroll" && it.effect === "blank") || (it.type === "spellbook" && !it.spell));
          const _blen5 = blanks5.length;
          if ((isUp5 || isDown5) && _blen5 > 0) {
            setMarkerMenuSel((s) => (s + (isDown5 ? 1 : -1) + _blen5) % _blen5);
            return;
          }
          if ((k === "enter" || k === "z") && _blen5 > 0) {
            const sel5 = blanks5[Math.min(markerMenuSel, _blen5 - 1)];
            const kind5 = sel5.it.type === "spellbook" ? "spellbook" : "scroll";
            const nextStep5 = kind5 === "spellbook" ? "select_spellbook_type" : "select_type";
            setMarkerMode((prev) => ({ ...prev, step: nextStep5, blankIdx: sel5.i, blankKind: kind5 }));
            setMarkerMenuSel(0);
            const msg5 = kind5 === "spellbook" ? "どの魔法書に変えますか...(インク5回消費)" : "どの魔法を書き込みますか...";
            setMsgs((prev) => [...prev.slice(-80), msg5]);
          }
        } else if (markerMode.step === "select_type") {
          const types5 = ITEMS.filter((it) => it.type === "scroll");
          const _tlen5 = types5.length;
          if ((isUp5 || isDown5) && _tlen5 > 0) {
            setMarkerMenuSel((s) => (s + (isDown5 ? 1 : -1) + _tlen5) % _tlen5);
            return;
          }
          if ((k === "enter" || k === "z") && _tlen5 > 0) {
            const tmpl5 = types5[Math.min(markerMenuSel, _tlen5 - 1)];
            doMarkerWriteRef.current?.(markerMode.blankIdx, tmpl5);
          }
        } else if (markerMode.step === "select_spellbook_type") {
          const sbTypes5 = SPELLBOOKS.filter((it) => it.spell);
          const _sbLen5 = sbTypes5.length;
          if ((isUp5 || isDown5) && _sbLen5 > 0) {
            setMarkerMenuSel((s) => (s + (isDown5 ? 1 : -1) + _sbLen5) % _sbLen5);
            return;
          }
          if ((k === "enter" || k === "z") && _sbLen5 > 0) {
            const tmpl5 = sbTypes5[Math.min(markerMenuSel, _sbLen5 - 1)];
            doMarkerWriteRef.current?.(markerMode.blankIdx, tmpl5);
          }
        }
        return;
      }
      if (spellListMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") { setSpellListMode(false); return; }
        const knownSpells = (sr.current?.player?.spells || []).map((id) => {
          const s = SPELLS.find((sp) => sp.id === id);
          if (!s) return null;
          const _lv = (sr.current?.player?.spellLevels?.[id] || 1);
          return { ...s, mpCost: s.fixedMpCost ? s.mpCost : Math.max(1, 20 - (_lv - 1) * 3), spellLevel: _lv };
        }).filter(Boolean);
        const slen = knownSpells.length;
        const isUpS = k === "arrowup" || e.code === "Numpad8";
        const isDownS = k === "arrowdown" || e.code === "Numpad2";
        if ((isUpS || isDownS) && slen > 0) { setSpellMenuSel((s) => (s + (isDownS ? 1 : -1) + slen) % slen); return; }
        if ((k === "enter" || k === "z") && slen > 0) {
          const spell = knownSpells[Math.min(spellMenuSel, slen - 1)];
          if (!spell) return;
          if ((sr.current?.player?.mp || 0) < spell.mpCost) {
            setMsgs((prev) => [...prev.slice(-80), `MPが足りない！(必要:${spell.mpCost} 現在:${sr.current?.player?.mp || 0})`]);
            setSpellListMode(false); return;
          }
          setSpellListMode(false);
          if (!spell.needsDir) {
            // 非指向魔法：即時発動
            if (!sr.current) return;
            const { player: p2, dungeon: dg2 } = sr.current;
            const ml2 = [];
            if (inMagicSealRoom(p2.x, p2.y, dg2) || (p2.sealedTurns || 0) > 0) {
              ml2.push(`魔法が封印されている！MPは消費しない。`);
              endTurn(sr.current, p2, ml2); setMsgs((prev) => [...prev.slice(-80), ...ml2]); sr.current = { ...sr.current }; setGs({ ...sr.current });
            } else if (spell.effect === "identify_magic") {
              const _idt = p2.inventory.filter(_ii => {
                if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
                const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
              });
              if (_idt.length === 0) {
                p2.mp -= spell.mpCost;
                ml2.push(`${spell.name}を唱えた！[MP -${spell.mpCost}]`);
                ml2.push("未識別のアイテムがない。");
                endTurn(sr.current, p2, ml2); setMsgs((prev) => [...prev.slice(-80), ...ml2]); sr.current = { ...sr.current }; setGs({ ...sr.current });
              } else {
                setMsgs((prev) => [...prev.slice(-80), "識別するアイテムを選んでください。"]);
                setIdentifyMode({ mode: 'identify', sel: 0, spellCost: spell.mpCost, spellMsg: `${spell.name}を唱えた！[MP -${spell.mpCost}]` });
                setShowInv(false); setSelIdx(null); setShowDesc(null);
                sr.current = { ...sr.current }; setGs({ ...sr.current });
              }
            } else if (spell.effect === "bless_magic" || spell.effect === "curse_magic") {
              const _bcMode = spell.effect === "bless_magic" ? 'bless' : 'curse';
              const _bcPrompt = _bcMode === 'bless' ? "祝福するアイテムを選んでください。" : "呪うアイテムを選んでください。";
              setMsgs((prev) => [...prev.slice(-80), _bcPrompt]);
              setIdentifyMode({ mode: _bcMode, sel: 0, spellCost: spell.mpCost, spellMsg: `${spell.name}を唱えた！[MP -${spell.mpCost}]` });
              setShowInv(false); setSelIdx(null); setShowDesc(null);
              sr.current = { ...sr.current }; setGs({ ...sr.current });
            } else {
            p2.mp -= spell.mpCost;
            ml2.push(`${spell.name}を唱えた！[MP -${spell.mpCost}]`);
            applySpellEffect(spell.effect, "self", null, 0, 0, dg2, p2, ml2, lu);
            endTurn(sr.current, p2, ml2);
            setMsgs((prev) => [...prev.slice(-80), ...ml2]);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            }
          } else {
            setThrowMode({ idx: spell.id, mode: "cast_spell" });
            setMsgs((prev) => [...prev.slice(-80), `${spell.name}：方向を選んでください (矢印キー)`]);
          }
        }
        return;
      }
      if (shopMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") {
          setShopMode(null);
          return;
        }
        const isUp3 = k === "arrowup" || e.code === "Numpad8";
        const isDown3 = k === "arrowdown" || e.code === "Numpad2";
        if (shopMode === "pay") {
          if (isUp3 || isDown3) {
            setShopMenuSel((p2) => (p2 + (isDown3 ? 1 : -1) + 2) % 2);
            return;
          }
          if (k === "enter" || k === "z" || k === "1") {
            if (shopMenuSel === 0) {
              if (sr.current) {
                const { player: p2, dungeon: dg2 } = sr.current;
                if (p2.gold >= dg2.shop.unpaidTotal) {
                  p2.gold -= dg2.shop.unpaidTotal;
                  dg2.shop.unpaidTotal = 0;
                  dg2.shopTheft = false;
                  p2.inventory.forEach((it2) => {
                    if (it2.shopPrice) delete it2.shopPrice;
                  });
                  const sk5 = dg2.monsters.find((m) => m.type === "shopkeeper");
                  if (sk5) {
                    sk5.state = "friendly";
                    /* homePos から近い順に空きタイルを探してテレポート */
                    const _skCandidates = [];
                    for (let _r = 0; _r <= 4; _r++) {
                      for (let _dy = -_r; _dy <= _r; _dy++) {
                        for (let _dx = -_r; _dx <= _r; _dx++) {
                          if (Math.abs(_dx) !== _r && Math.abs(_dy) !== _r) continue;
                          const _cx = sk5.homePos.x + _dx, _cy = sk5.homePos.y + _dy;
                          const _ct = dg2.map[_cy]?.[_cx];
                          if (_ct !== T.FLOOR && _ct !== T.SD && _ct !== T.SU) continue;
                          if (_cx === p2.x && _cy === p2.y) continue;
                          if (dg2.monsters.some(o => o !== sk5 && o.x === _cx && o.y === _cy)) continue;
                          _skCandidates.push({ x: _cx, y: _cy, d: Math.abs(_dx) + Math.abs(_dy) });
                        }
                      }
                      if (_skCandidates.length > 0) break;
                    }
                    if (_skCandidates.length > 0) {
                      _skCandidates.sort((a, b) => a.d - b.d);
                      sk5.x = _skCandidates[0].x;
                      sk5.y = _skCandidates[0].y;
                    }
                  }
                  setMsgs((prev) => [
                    ...prev.slice(-80),
                    "代金を支払った。ありがとうございます！",
                  ]);
                  setShopMode(null);
                  sr.current = { ...sr.current };
                  setGs({ ...sr.current });
                } else
                  setMsgs((prev) => [...prev.slice(-80), "お金が足りない！"]);
              }
            } else setShopMode(null);
            return;
          }
          if (k === "2") {
            setShopMode(null);
            return;
          }
          return;
        }
        if (shopMode === "sell") {
          if (!sr.current) {
            setShopMode(null);
            return;
          }
          const { player: p2, dungeon: dg2 } = sr.current;
          const fis3 = dg2.items.filter(
            (i) =>
              !i.shopPrice &&
              dg2.shop &&
              i.x >= dg2.shop.room.x &&
              i.x < dg2.shop.room.x + dg2.shop.room.w &&
              i.y >= dg2.shop.room.y &&
              i.y < dg2.shop.room.y + dg2.shop.room.h,
          );
          const mlen3 = fis3.length + 1;
          if (isUp3 || isDown3) {
            setShopMenuSel((p2) => (p2 + (isDown3 ? 1 : -1) + mlen3) % mlen3);
            return;
          }
          if (k === "enter" || k === "z") {
            if (shopMenuSel < fis3.length) {
              const it2 = fis3[shopMenuSel];
              const bp = Math.ceil(itemPrice(it2) * 0.5);
              p2.gold += bp;
              it2.shopPrice = itemPrice(it2);
              setMsgs((prev) => [
                ...prev.slice(-80),
                `${it2.name}を${bp}Gで買い取った。`,
              ]);
              setShopMenuSel(
                Math.min(shopMenuSel, Math.max(0, fis3.length - 2)),
              );
              sr.current = { ...sr.current };
              setGs({ ...sr.current });
              if (fis3.length <= 1) {
                const dt = dg2.shop.unpaidTotal;
                if (dt > 0) {
                  setShopMode("pay");
                  setShopMenuSel(0);
                  setMsgs((prev) => [
                    ...prev.slice(-80),
                    `店主：「お代は${dt}Gです。」`,
                  ]);
                } else setShopMode(null);
              }
            } else {
              const dt = dg2.shop.unpaidTotal;
              if (dt > 0) {
                setShopMode("pay");
                setShopMenuSel(0);
                setMsgs((prev) => [
                  ...prev.slice(-80),
                  `店主：「お代は${dt}Gです。」`,
                ]);
              } else setShopMode(null);
            }
            return;
          }
          return;
        }
        return;
      }
      if (bigboxMode) {
        e.preventDefault();
        const isUpBB = k === "arrowup" || e.code === "Numpad8";
        const isDownBB = k === "arrowdown" || e.code === "Numpad2";
        if (bigboxMode === "menu") {
          const mlen2 = 2;
          if (isUpBB || isDownBB) {
            setBigboxMenuSel((p) => (p + (isDownBB ? 1 : -1) + mlen2) % mlen2);
            return;
          }
          if (k === "enter" || k === "z" || k === "x" || k === "escape") {
            if ((k === "enter" || k === "z") && bigboxMenuSel === 0) {
              setBigboxMode("put");
              setBigboxMenuSel(0);
              setBigboxPage(0);
            } else {
              setBigboxMode(null);
              bigboxRef.current = null;
              setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
            }
            return;
          }
          if (k === "1") {
            setBigboxMode("put");
            setBigboxMenuSel(0);
            setBigboxPage(0);
          } else if (k === "2") {
            setBigboxMode(null);
            bigboxRef.current = null;
            setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          }
          return;
        }
        if (bigboxMode === "put") {
          const inv2 = sr.current?.player?.inventory || [];
          const il2 = inv2.length;
          const _ps = 10;
          const _tp = Math.max(1, Math.ceil(il2 / _ps));
          const _pi = inv2.slice(bigboxPage * _ps, (bigboxPage + 1) * _ps);
          const _pil = _pi.length;
          const isLeftBB = k === "arrowleft" || e.code === "Numpad4";
          const isRightBB = k === "arrowright" || e.code === "Numpad6";
          if ((isUpBB || isDownBB) && _pil > 0) {
            setBigboxMenuSel((p) => (p + (isDownBB ? 1 : -1) + _pil) % _pil);
            return;
          }
          if ((isLeftBB || isRightBB) && _tp > 1) {
            setBigboxPage((p) => (p + (isRightBB ? 1 : -1) + _tp) % _tp);
            setBigboxMenuSel(0);
            return;
          }
          if (k === "enter" || k === "z") {
            if (_pil > 0) bigboxPutItem(bigboxPage * _ps + bigboxMenuSel);
            return;
          }
          if (k === "x" || k === "escape") {
            setBigboxMode("menu");
            setBigboxMenuSel(0);
            setBigboxPage(0);
            return;
          }
          return;
        }
        return;
      }
      if (springMode) {
        e.preventDefault();
        const isUp = k === "arrowup" || e.code === "Numpad8";
        const isDown = k === "arrowdown" || e.code === "Numpad2";
        if (k === "escape" || k === "x") {
          if (springMode === "soak") {
            setSpringMode("menu");
            setSpringMenuSel(0);
          } else {
            setSpringMode(null);
            setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          }
          return;
        }
        if (springMode === "menu") {
          const mlen = 3;
          if (isUp || isDown) {
            setSpringMenuSel((p) => (p + (isDown ? 1 : -1) + mlen) % mlen);
            return;
          }
          if (k === "enter" || k === "z") {
            if (springMenuSel === 0) springDrink();
            else if (springMenuSel === 1) {
              setSpringMode("soak");
              setSpringMenuSel(0);
            } else {
              setSpringMode(null);
              setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
            }
            return;
          }
          if (k === "1") springDrink();
          else if (k === "2") {
            setSpringMode("soak");
            setSpringMenuSel(0);
          } else if (k === "3") {
            setSpringMode(null);
            setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          }
          return;
        }
        if (springMode === "soak") {
          const inv = sr.current?.player?.inventory || [];
          const ilen = inv.length;
          const _spTotalPg = Math.max(1, Math.ceil(ilen / 10));
          const isLeft = k === "arrowleft" || e.code === "Numpad4";
          const isRight = k === "arrowright" || e.code === "Numpad6";
          if ((isUp || isDown) && ilen > 0) {
            setSpringMenuSel((s) => (s + (isDown ? 1 : -1) + 10) % 10);
            return;
          }
          if (isLeft) { setSpringPage((pg) => (pg - 1 + _spTotalPg) % _spTotalPg); setSpringMenuSel(0); return; }
          if (isRight) { setSpringPage((pg) => (pg + 1) % _spTotalPg); setSpringMenuSel(0); return; }
          if ((k === "enter" || k === "z") && ilen > 0) {
            const _spAbsIdx = springPage * 10 + springMenuSel;
            if (inv[_spAbsIdx]) { springDoSoak(_spAbsIdx); setSpringPage(0); setSpringMenuSel(0); }
            return;
          }
          return;
        }
        return;
      }
      if (throwMode !== null) {
        if (k === "escape" || k === "x") {
          e.preventDefault();
          setThrowMode(null);
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          return;
        }
        const numpadThrow = {
          Numpad1: [-1, 1],
          Numpad2: [0, 1],
          Numpad3: [1, 1],
          Numpad4: [-1, 0],
          Numpad6: [1, 0],
          Numpad7: [-1, -1],
          Numpad8: [0, -1],
          Numpad9: [1, -1],
        };
        if (e.code in numpadThrow) {
          e.preventDefault();
          execRef.current?.(numpadThrow[e.code][0], numpadThrow[e.code][1]);
          return;
        }
        const km = {
          arrowup: [0, -1],
          arrowdown: [0, 1],
          arrowleft: [-1, 0],
          arrowright: [1, 0],
        };
        if (km[k]) {
          e.preventDefault();
          if (bigboxMode || springMode || putMode || markerMode || spellListMode) {
            return;
          }
          execRef.current?.(km[k][0], km[k][1]);
        }
        return;
      }
      if (k === "i" || k === "x" || k === "escape") {
        e.preventDefault();
        act("inventory");
        return;
      }
      if (showInv) return;
      const numpadGame = {
        Numpad1: [-1, 1],
        Numpad2: [0, 1],
        Numpad3: [1, 1],
        Numpad4: [-1, 0],
        Numpad5: null,
        Numpad6: [1, 0],
        Numpad7: [-1, -1],
        Numpad8: [0, -1],
        Numpad9: [1, -1],
      };
      if (e.code in numpadGame && !bigboxMode && !springMode && !putMode && !markerMode && !spellListMode) {
        e.preventDefault();
        const nd = numpadGame[e.code];
        if (nd === null) {
          act("wait");
        } else if (e.shiftKey || shiftRef.current) {
          doDash(nd[0], nd[1]);
        } else {
          act("move", nd[0], nd[1]);
        }
        return;
      }
      const km = {
        arrowup: [0, -1],
        arrowdown: [0, 1],
        arrowleft: [-1, 0],
        arrowright: [1, 0],
      };
      if (km[k]) {
        e.preventDefault();
        if (bigboxMode || springMode || putMode || markerMode || spellListMode) {
          return;
        }
        if (e.shiftKey || shiftRef.current) {
          doDash(km[k][0], km[k][1]);
        } else {
          act("move", km[k][0], km[k][1]);
        }
        return;
      }
      if (k === "w" && !showInv && !bigboxMode && !springMode && !throwMode && !putMode) {
        e.preventDefault();
        const { player: _lp, dungeon: _ld } = sr.current || {};
        if (_lp && _ld) {
          setLookMode({ cx: _lp.x, cy: _lp.y });
          const _initDesc = getLookDesc(_lp.x, _lp.y, _ld);
          setMsgs(prev => [...prev.slice(-80), `[見渡す] 矢印キーで移動、xでキャンセル / ${_initDesc}`]);
        }
        return;
      }
      if (k === "." || k === " ") {
        e.preventDefault();
        act("wait");
      } else if (k === "s") {
        e.preventDefault();
        act("search_traps");
      } else if (k === "q") act("shoot_arrow");
      else if (k === ">") act("stairs_down");
      else if (k === "<") act("stairs_up");
      else if (k === "f") act("interact");
      else if (
        k === "z" &&
        !showInv &&
        !bigboxMode &&
        !springMode &&
        !throwMode &&
        !putMode
      ) {
        e.preventDefault();
        doExamineFront();
      } else if (
        k === "c" &&
        !showInv &&
        !springMode &&
        !throwMode &&
        !putMode &&
        !markerMode
      ) {
        e.preventDefault();
        setSpellListMode((f) => !f);
        setSpellMenuSel(0);
      } else if (
        k === "t" &&
        !showInv &&
        !springMode &&
        !throwMode &&
        !putMode
      ) {
        e.preventDefault();
        setFacingMode((f) => !f);
      }
    },
    [
      act,
      doDash,
      showInv,
      selIdx,
      invPage,
      invMenuSel,
      throwMode,
      springMode,
      springMenuSel,
      springDrink,
      springDoSoak,
      putMode,
      putMenuSel,
      facingMode,
      setFacingMode,
      shopMode,
      shopMenuSel,
      bigboxMode,
      bigboxMenuSel,
      bigboxPutItem,
      bigboxPage,
      sortInventory,
      putPage,
      markerMode,
      markerMenuSel,
      spellListMode,
      spellMenuSel,
      dead,
      gameOverSel,
      showScores,
      nicknameMode,
      identifyMode,
      revealMode,
      tpSelectMode,
      floorSelectMode,
      lookMode,
      getLookDesc,
    ],
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);
  const useLabel = (it) => {
    const _p = gs?.player;
    if (it.type === "weapon") return _p?.weapon === it ? "外す" : "装備";
    if (it.type === "armor")  return _p?.armor  === it ? "外す" : "装備";
    if (it.type === "arrow")  return _p?.arrow  === it ? "外す" : "装備";
    if (it.type === "food") return "食べる";
    if (it.type === "scroll") return "読む";
    if (it.type === "pen") return "描く";
    if (it.type === "pot") return "入れる";
    return "使う";
  };
  const canUse = (it) =>
    ["potion", "food", "scroll", "weapon", "armor", "arrow", "pot", "pen"].includes(
      it.type,
    );
  const doUseItem = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const it = p.inventory[idx];
    if (!it) return;
    if (p.sleepTurns > 0 || p.paralyzeTurns > 0) return;

    const ml = [];
    // 未識別消耗品の判定（使用前に取得）
    const _ik_reveal = (it.type === 'potion' || it.type === 'scroll') ? getIdentKey(it) : null;
    const _wasUnknown = !!(_ik_reveal && !sr.current.ident.has(_ik_reveal));
    const _revFake = _wasUnknown ? itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames) : null;
    const _revReal = _wasUnknown ? it.name : null;
    if (it.type === "potion") {
      const _potBm = getBlessMultiplier(it);
      p.inventory.splice(idx, 1);
      { const _ik = getIdentKey(it); if (_ik) sr.current.ident.add(_ik); }
      // 毒回復ヘルパー
      const _curePoison = () => {
        if (p.poisoned) {
          p.poisoned = false;
          if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
          return true;
        }
        return false;
      };
      if (it.effect === "heal") {
        if (it.cursed) {
          // 呪い：反転→ダメージ
          const d = Math.max(1, Math.round(it.value * 0.7));
          p.deathCause = "呪われた回復薬を飲んで";
          p.hp -= d;
          ml.push(`${it.name}を飲んだ。まずい！${d}ダメージ！【呪】`);
        } else {
          // 通常/祝福：HP回復（祝福=1.5x + 全状態異常回復）
          const h = Math.min(Math.round(it.value * _potBm), p.maxHp - p.hp);
          let _hMsg;
          if (h <= 0) {
            // HPが最大：最大HP上昇（回復薬+1/+2、大回復薬+2/+4）
            const _maxHpGain = (it.value >= 30 ? 2 : 1) * (it.blessed ? 2 : 1);
            p.maxHp += _maxHpGain;
            p.hp += _maxHpGain;
            _hMsg = `${it.name}を飲んだ。HPが最大なので最大HP+${_maxHpGain}！${it.blessed ? "（祝福）" : ""}`;
          } else {
            p.hp += h;
            _hMsg = `${it.name}を飲んだ。HP+${h}${it.blessed ? "（祝福）" : ""}`;
          }
          if (it.blessed) {
            const _cured = [];
            if ((p.sleepTurns || 0) > 0) { p.sleepTurns = 0; _cured.push("睡眠"); }
            if ((p.confusedTurns || 0) > 0) { p.confusedTurns = 0; _cured.push("混乱"); }
            if ((p.slowTurns || 0) > 0) { p.slowTurns = 0; _cured.push("鈍足"); }
            if (_curePoison()) _cured.push("毒");
            if (!p.poisoned && (p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; _cured.push("毒による攻撃力低下"); }
            if (_cured.length > 0) _hMsg += ` ${_cured.join("・")}も解消！`;
          }
          ml.push(_hMsg);
        }
      } else if (it.effect === "poison") {
        if (it.cursed) {
          // 呪い：反転→解毒薬
          const _wasPoison = _curePoison();
          const _hadAtkLoss = !p.poisoned && (p.poisonAtkLoss || 0) > 0;
          if (_hadAtkLoss) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
          if (_wasPoison || _hadAtkLoss) {
            ml.push(`${it.name}を飲んだ。毒が体から消えた！攻撃力も回復！【呪→解毒】`);
          } else {
            ml.push(`${it.name}を飲んだ。変な味がするが…毒はかかっていなかった。【呪→解毒】`);
          }
        } else {
          // 通常：毒状態を付与。祝福=即時ATK-3の追加ペナルティ
          p.poisoned = true;
          if (it.blessed) {
            const _extraLoss = Math.min(3, p.atk - 1);
            p.atk -= _extraLoss;
            p.poisonAtkLoss = (p.poisonAtkLoss || 0) + _extraLoss;
            ml.push(`${it.name}を飲んだ。強烈な毒を浴びた！毒状態になり攻撃力が${_extraLoss}下がった！【祝=強毒】`);
          } else {
            ml.push(`${it.name}を飲んだ。毒状態になった！攻撃力が徐々に下がっていく…`);
          }
        }
      } else if (it.effect === "fire") {
        if (!it.cursed && dg.pentacles?.some(pc => pc.kind === "explosion" && pc.cursed)) {
          ml.push(`${it.name}を飲んだが、呪われた爆発の魔方陣が炎を打ち消した！`);
        } else if (it.cursed) {
          // 呪い：反転→HP回復
          const h = Math.min(it.value, p.maxHp - p.hp);
          p.hp += h;
          ml.push(`${it.name}を飲んだ。体が温まりHP+${h}回復した！【呪→回復】`);
        } else {
          // 通常/祝福：炎ダメージ（祝福=1.5x）
          const rd = Math.max(1, Math.round((it.value + rng(-5, 5)) * _potBm));
          const d =
            p.armor?.ability === "fire_resist" ||
            !!p.armor?.abilities?.includes("fire_resist")
              ? Math.floor(rd / 2)
              : rd;
          p.deathCause = "炎の薬を飲んで";
          p.hp -= d;
          ml.push(
            `${it.name}を飲んだ。体が燃えるように熱い！${d}ダメージ！${p.armor?.ability === "fire_resist" || !!p.armor?.abilities?.includes("fire_resist") ? "(耘火)" : ""}${it.blessed ? "【祝=強炎】" : ""}`,
          );
        }
      } else if (it.effect === "sleep") {
        if (it.cursed) {
          // 呪い：反転→フロア中全ての敵の位置が常に見通せる
          dg.monsterSenseActive = true;
          ml.push(`${it.name}を飲んだ。幻覚が見える...フロアの敵が全て見え続ける！【呪→透視】`);
        } else {
          // 通常/祝福：プレイヤーを眠らせる（祝福=2倍ターン）
          const t = Math.max(1, Math.round((it.value + rng(-1, 1)) * (it.blessed ? 2 : 1)));
          if (
            p.armor?.ability === "sleep_proof" ||
            !!p.armor?.abilities?.includes("sleep_proof")
          ) {
            ml.push(`${it.name}を飲んだ。なんとも無い。(耔眠)`);
          } else if ((p.statusImmune || 0) > 0) {
            ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
          } else {
            p.sleepTurns = (p.sleepTurns || 0) + t;
            ml.push(
              `${it.name}を飲んだ。眠くなってきた...(${t}ターン)${it.blessed ? "【祝=強眠】" : ""}`,
            );
          }
        }
      } else if (it.effect === "power") {
        if (it.cursed) {
          // 呪い：反転→攻撃力減少
          const _pv = Math.max(1, Math.round(it.value * 0.5));
          p.atk = Math.max(1, p.atk - _pv);
          ml.push(`${it.name}を飲んだ。力が抜けた...攻撃力-${_pv}【呪】`);
        } else {
          // 通常/祝福：攻撃力増加（祝福=1.5x）
          const _pv = Math.max(1, Math.round(it.value * _potBm));
          p.atk += _pv;
          ml.push(`${it.name}を飲んだ。力が湧いてきた！攻撃力+${_pv}${it.blessed ? "（祝福）" : ""}`);
        }
      } else if (it.effect === "slow") {
        if (it.cursed) {
          // 呪い：反転→2倍速
          p.hasteTurns = (p.hasteTurns || 0) + 10;
          ml.push(`${it.name}を飲んだ。体が軽くなった！(2倍速10ターン)【呪→加速】`);
        } else {
          // 通常/祝福：鈍足（祝福=2倍ターン）
          const _st = it.blessed ? 20 : 10;
          if ((p.statusImmune || 0) > 0) {
            ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
          } else {
            p.slowTurns = (p.slowTurns || 0) + _st;
            ml.push(`${it.name}を飲んだ。体が重くなった...(鈍足${_st}ターン)${it.blessed ? "【祝=強鈍】" : ""}`);
          }
        }
      } else if (it.effect === "confuse") {
        if (it.cursed) {
          // 呪い：混乱解消 + 必中100ターン
          p.confusedTurns = 0;
          p.sureHitTurns = (p.sureHitTurns || 0) + 100;
          ml.push(`${it.name}を飲んだ。頭が冴えた！混乱が消え、必中状態になった！(100ターン)【呪→必中】`);
        } else {
          // 通常/祝福：混乱（祝福=2倍ターン）
          const _cturns = it.blessed ? 10 : 5;
          p.confusedTurns = (p.confusedTurns || 0) + _cturns;
          ml.push(`${it.name}を飲んだ。頭がくらくらする！(混乱${p.confusedTurns}ターン)${it.blessed ? "【祝=強混乱】" : ""}`);
        }
      } else if (it.effect === "paralyze") {
        if (it.cursed) {
          // 呪い→状態異常防止200ターン
          p.statusImmune = (p.statusImmune || 0) + 200;
          ml.push(`${it.name}を飲んだ。状態異常を防ぐ力が宿った！(200ターン)【呪→状態防止】`);
        } else {
          // 通常/祝福：金縛り（祝福=2倍ターン）
          if ((p.statusImmune || 0) > 0) {
            ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
          } else {
            const _pt = it.blessed ? 20 : 10;
            p.paralyzeTurns = _pt;
            ml.push(`${it.name}を飲んだ。体が動かない！(${_pt}ターン金縛り)${it.blessed ? "【祝=強金縛り】" : ""}`);
          }
        }
      } else if (it.effect === "mana") {
        if (it.cursed) {
          // 呪い：反転→MP封印50ターン
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
          ml.push(`${it.name}を飲んだ。魔力が封じられた！(MP封印50ターン)【呪】`);
        } else if ((p.mpCooldownTurns || 0) > 0) {
          ml.push(`${it.name}を飲んだ。MPが封印中のため回復できない！(残り${p.mpCooldownTurns}ターン)`);
        } else {
          // 通常/祝福：MP回復（祝福=1.5x）。MP最大時は最大MP増加
          const _madd = Math.min(Math.round(it.value * _potBm), (p.maxMp || 20) - (p.mp || 0));
          if (_madd <= 0) {
            const _maxMpGain = it.blessed ? 2 : 1;
            p.maxMp = (p.maxMp || 20) + _maxMpGain;
            p.mp = (p.mp || 0) + _maxMpGain;
            ml.push(`${it.name}を飲んだ。MPが最大なので最大MP+${_maxMpGain}！${it.blessed ? "（祝福）" : ""}`);
          } else {
            p.mp = (p.mp || 0) + _madd;
            ml.push(`${it.name}を飲んだ。MP+${_madd}${it.blessed ? "（祝福）" : ""}`);
          }
        }
      } else if (it.effect === "seal") {
        if (it.cursed) {
          // 呪い：MP封印解除
          p.mpCooldownTurns = 0;
          ml.push(`${it.name}を飲んだ。MP封印が解けた！【呪→解封】`);
        } else {
          // 通常/祝福：MP封印50ターン（祝福：さらに鈍足10ターン）
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
          let _seMsg = `${it.name}を飲んだ。魔力が封じられた！(MP封印50ターン)${it.blessed ? "（祝福）" : ""}`;
          if (it.blessed) {
            p.slowTurns = (p.slowTurns || 0) + 10;
            _seMsg += " さらに鈍足10ターン！";
          }
          ml.push(_seMsg);
        }
      } else if (it.effect === "levelup") {
        if (it.cursed) {
          // 呪い：1階上へワープ（1階なら効果なし）
          if (p.depth <= 1) {
            if (onReturnToHub) {
              ml.push(`${it.name}を飲んだ。天井を突き破って地上へ飛ばされた！【呪】`);
              sr.current = { ...st };
              onReturnToHub({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: true, returnItems: [...p.inventory] });
              return;
            } else {
              ml.push(`${it.name}を飲んだ。ここは1階だ。何も起こらなかった。【呪】`);
            }
          } else {
            ml.push(`${it.name}を飲んだ。天井を突き破って上の階へ飛ばされた！【呪】`);
            const _luNd = chgFloor(p, -1, true);
            if (_luNd) sr.current.dungeon = _luNd;
          }
        } else {
          const _luTimes = it.blessed ? 2 : 1;
          for (let _lui = 0; _lui < _luTimes; _lui++) {
            p.exp = p.nextExp;
            lu(p, ml);
          }
          ml.push(`${it.name}を飲んだ。${it.blessed ? "【祝=2レベルアップ】" : ""}`);
        }
      }
      if (p.inventory.length < (p.maxInventory || 30)) {
        const bottle = { ...EMPTY_BOTTLE, id: uid() };
        p.inventory.push(bottle);
        ml.push("空き瓶が残った。");
      }
    } else if (it.type === "food") {
      const _foodBm = getBlessMultiplier(it);
      const _foodVal = Math.max(1, Math.round(it.value * _foodBm));
      p.inventory.splice(idx, 1);
      const _foodAdded = Math.min(_foodVal, p.maxHunger - p.hunger);
      p.hunger = Math.min(p.maxHunger, p.hunger + _foodVal);
      ml.push(
        `${it.name}を食べた。(満腹度+${_foodAdded})${it.blessed ? "（祝福：よく味わえた）" : it.cursed ? "（呪い：まずかった）" : ""}`,
      );
      const fe = it.effect;
      if (fe === "heal_food") {
        const h = rng(10, 20);
        const ah = Math.min(h, p.maxHp - p.hp);
        p.hp += ah;
        if (ah > 0) ml.push(`体が温まりHPが${ah}回復した。`);
      } else if (fe === "power_food") {
        p.atk += 1;
        ml.push("力が湧いてきた！攻撃力+1");
      } else if (fe === "speed_food") {
        if (p.sleepTurns > 0) {
          p.sleepTurns = 0;
          ml.push("目が覚めた！");
        } else ml.push("体が軽くなった！");
      } else if (fe === "def_food") {
        p.def += 1;
        ml.push("体が頑丈になった！防御力+1");
      } else if (fe === "vitality_food") {
        p.maxHp += 2;
        p.hp += 2;
        ml.push("生命力が増した！最大HP+2");
      } else if (fe === "exp_food") {
        const ex = rng(5, 10 + p.level * 3);
        p.exp += ex;
        ml.push(`知恵が付いた。経験値+${ex}`);
        lu(p, ml);
      } else if (fe === "luck_food") {
        const g = rng(10, 30);
        p.gold += g;
        ml.push(`幸運だ！${g}ゴールドを見つけた。`);
      } else if (fe === "reveal_food") {
        for (let y2 = 0; y2 < MH; y2++)
          for (let x2 = 0; x2 < MW; x2++) dg.explored[y2][x2] = true;
        dg.traps.forEach((t2) => (t2.revealed = true));
        ml.push("目が冴えてフロア全体が見えた！");
      } else if (fe === "antidote_food") {
        const _acured = [];
        if (p.sleepTurns > 0) { p.sleepTurns = 0; _acured.push("睡眠"); }
        if (p.paralyzeTurns > 0) { p.paralyzeTurns = 0; _acured.push("金縛り"); }
        if (p.poisoned) {
          p.poisoned = false;
          if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
          _acured.push("毒");
        } else if ((p.poisonAtkLoss || 0) > 0) {
          p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0;
          _acured.push("毒による攻撃力低下");
        }
        if (_acured.length > 0) ml.push(`状態異常が消えた！(${_acured.join("・")})`);
        const h2 = rng(3, 8);
        p.hp = Math.min(p.maxHp, p.hp + h2);
        ml.push(`体の調子が良くなった。HP+${h2}`);
      } else if (fe === "satiate_food") {
        ml.push("とても腹持ちが良い！");
      }
      if (it.potionEffects && it.potionEffects.length > 0) {
        for (const pe of it.potionEffects) {
          if (pe === "heal") {
            const ph = rng(10, 25);
            const pah = Math.min(ph, p.maxHp - p.hp);
            p.hp += pah;
            if (pah > 0) ml.push(`回復効果でHP+${pah}`);
          } else if (pe === "poison") {
            p.poisoned = true;
            ml.push("毒が混じっていた！毒状態になった！攻撃力が徐々に下がっていく…");
          } else if (pe === "sleep") {
            const st = rng(3, 6);
            if ((p.statusImmune || 0) > 0) ml.push("睡眠効果！状態防止中のため効かなかった！");
            else { p.sleepTurns = (p.sleepTurns || 0) + st; ml.push(`睡眠効果で${st}ターン眠ってしまった...`); }
          } else if (pe === "power") {
            p.atk += 2;
            ml.push("強化効果で攻撃力+2！");
          } else if (pe === "mana") {
            if ((p.mpCooldownTurns || 0) > 0) {
              ml.push(`MP封印中のため魔力効果は発揮されなかった！(残り${p.mpCooldownTurns}ターン)`);
            } else {
              const _mpRec = Math.min(10, (p.maxMp || 0) - (p.mp || 0));
              p.mp = (p.mp || 0) + _mpRec;
              if (_mpRec > 0) ml.push(`魔力効果でMP+${_mpRec}`);
            }
          } else if (pe === "confuse") {
            const _ct = rng(3, 8);
            p.confusedTurns = (p.confusedTurns || 0) + _ct;
            ml.push(`混乱成分が！頭がくらくらする...(${_ct}ターン)`);
          } else if (pe === "slow") {
            if ((p.statusImmune || 0) > 0) ml.push("鈍足成分！状態防止中のため効かなかった！");
            else { p.slowTurns = (p.slowTurns || 0) + 10; ml.push("鈍足成分が！体が重くなった...(鈍足10ターン)"); }
          } else if (pe === "darkness") {
            p.darknessTurns = (p.darknessTurns || 0) + 20;
            ml.push("暗闇成分が！視界が1マスになった...(20ターン)");
          } else if (pe === "bewitch") {
            p.bewitchedTurns = (p.bewitchedTurns || 0) + 50;
            ml.push("幻惑成分が！周囲の見た目がおかしくなった！(50ターン)");
          } else if (pe === "paralyze") {
            if ((p.statusImmune || 0) > 0) ml.push("金縛り成分！状態防止中のため効かなかった！");
            else { p.paralyzeTurns = (p.paralyzeTurns || 0) + 10; ml.push("金縛り成分が！体が動かない！(10ターン)"); }
          // 呪い系効果
          } else if (pe === "c_heal") {
            p.poisoned = true;
            ml.push("呪いの回復成分が！毒状態になった！攻撃力が徐々に下がっていく…");
          } else if (pe === "c_poison") {
            if (p.poisoned) {
              p.poisoned = false;
              if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
              ml.push("解毒成分が！毒が消えた！攻撃力も回復！");
            } else ml.push("解毒成分が入っていたが毒ではなかった。");
          } else if (pe === "c_sleep") {
            p.hasteTurns = (p.hasteTurns || 0) + 5;
            ml.push("覚醒成分が！体が覚醒した！(2倍速5ターン)");
          } else if (pe === "c_power") {
            p.atk = Math.max(1, p.atk - 2);
            ml.push("弱化成分が！攻撃力-2...");
          } else if (pe === "c_mana") {
            p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
            ml.push("封印成分が！MP封印50ターン！");
          } else if (pe === "c_confuse") {
            p.sureHitTurns = (p.sureHitTurns || 0) + 100;
            ml.push("必中成分が！必中状態になった！(100ターン)");
          } else if (pe === "c_slow") {
            p.hasteTurns = (p.hasteTurns || 0) + 10;
            ml.push("加速成分が！体が軽くなった！(2倍速10ターン)");
          } else if (pe === "c_darkness") {
            p.monsterSenseTurns = (p.monsterSenseTurns || 0) + 100;
            ml.push("感知成分が！フロアのモンスターが見えるようになった！(100ターン)");
          } else if (pe === "c_bewitch") {
            dg.traps.forEach(t => t.revealed = true);
            ml.push("看破成分が！フロアの罠が全て見えた！");
          } else if (pe === "c_paralyze") {
            p.statusImmune = (p.statusImmune || 0) + 100;
            ml.push("予防成分が！状態異常防止100ターン！");
          } else if (pe === "levelup") {
            const _luEx = rng(5, 10 + p.level * 3);
            p.exp += _luEx;
            ml.push(`知恵が付いた。経験値+${_luEx}`);
            lu(p, ml);
          } else if (pe === "c_levelup") {
            p.atk = Math.max(1, p.atk - 2);
            ml.push("退化成分が！攻撃力-2...");
          } else if (pe === "seal") {
            p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
            ml.push("封魔成分が！MP封印50ターン！");
          } else if (pe === "c_seal") {
            p.mpCooldownTurns = 0;
            ml.push("解封成分が！MP封印が解けた！");
          }
        }
      }
    } else if (it.type === "scroll") {
      if (it.effect === "blank") {
        ml.push("白紙の巻物だ。魔法のマーカーで書き込めるかもしれない。");
        endTurn(sr.current, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        setSelIdx(null);
        setShowDesc(null);
        setShowInv(false);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
        return;
      }
      // 識別の巻物でダイアログが必要な場合は消費せず early-return（魔封じの魔方陣内は除く）
      if (it.effect === "identify" && !it.blessed && !inMagicSealRoom(p.x, p.y, dg)) {
        const _ik_scr = getIdentKey(it); // "s:identify"
        if (it.cursed) {
          const _tgts = p.inventory.filter((_ii, _i) => {
            if (_i === idx) return false;
            if (_ii.type === 'weapon' || _ii.type === 'armor') return _ii.fullIdent || _ii.bcKnown;
            const _k = getIdentKey(_ii); return _k && sr.current.ident.has(_k);
          });
          if (_tgts.length > 0) {
            if (_ik_scr) sr.current.ident.add(_ik_scr);
            const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "どのアイテムの識別を解除する？【呪】"]);
            setIdentifyMode({ mode: 'unidentify', sel: 0, scrollIdx: idx });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        } else {
          const _tgts = p.inventory.filter((_ii, _i) => {
            if (_i === idx) return false;
            if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
            const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
          });
          if (_tgts.length > 0) {
            if (_ik_scr) sr.current.ident.add(_ik_scr);
            const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "識別するアイテムを選んでください。"]);
            setIdentifyMode({ mode: 'identify', sel: 0, scrollIdx: idx });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        }
      }
      /* 複製の巻物：アイテム選択ダイアログが必要な場合はsplice前にreturn（identify同様） */
      if (it.effect === "duplicate" && !inMagicSealRoom(p.x, p.y, dg) && !((p.sealedTurns || 0) > 0)) {
        const _dupTargets = p.inventory.filter((_ii) => _ii.type !== "gold");
        if (_dupTargets.length > 0) {
          const _ik_dup = getIdentKey(it);
          if (_ik_dup) sr.current.ident.add(_ik_dup);
          const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
          setMsgs((prev) => [...prev.slice(-80), ..._rp]);
          setIdentifyMode({ mode: 'duplicate', blessed: it.blessed || false, cursed: it.cursed || false, scrollIdx: idx });
          setShowInv(false); setSelIdx(null); setShowDesc(null);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }
      }
      const _scrBm = getBlessMultiplier(it);
      p.inventory.splice(idx, 1);
      { const _ik = getIdentKey(it); if (_ik) sr.current.ident.add(_ik); }
      if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
        ml.push(`${it.name}を読んだが、魔法が封印されている！`);
      } else if (it.effect === "teleport") {
        if (it.cursed) {
          setFloorSelectMode({ sel: p.depth });
          { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "飛びたい階層を選んでください... (↑↓:選択 Z/Enter:決定)"]); }
          setSelIdx(null); setShowDesc(null); setShowInv(false);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        } else if (it.blessed) {
          setTpSelectMode({ cx: p.x, cy: p.y });
          { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "テレポート先を選んでください... (Z/Enter:決定 X:キャンセル→ランダム)"]); }
          setSelIdx(null); setShowDesc(null); setShowInv(false);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        } else {
          const _tpBlocked = dg.pentacles?.some(pc => pc.kind === "teleport_trap" && pc.cursed);
          if (_tpBlocked) {
            ml.push("呪われたテレポートの魔方陣に阻まれてテレポートできない！");
          } else {
            const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
            p.x = rng(rm.x, rm.x + rm.w - 1);
            p.y = rng(rm.y, rm.y + rm.h - 1);
            ml.push("テレポートした！");
          }
        }
      } else if (it.effect === "reveal") {
        if (it.cursed) {
          // 呪い：マップも罠の位置も全て忘れる
          for (let y = 0; y < MH; y++)
            for (let x = 0; x < MW; x++) dg.explored[y][x] = false;
          dg.traps.forEach((t) => (t.revealed = false));
          ml.push("記憶が消えた…マップと罠の位置を全て忘れてしまった！【呪】");
        } else {
          for (let y = 0; y < MH; y++)
            for (let x = 0; x < MW; x++) dg.explored[y][x] = true;
          dg.traps.forEach((t) => (t.revealed = true));
          if (it.blessed) {
            // 祝福：全開示＋アイテム・敵の位置も地図に常時表示
            dg.itemsRevealed = true;
            dg.monsterSenseActive = true;
            ml.push("フロア全体・罠・アイテム・敵の位置が明らかになった！【祝】");
          } else {
            ml.push("フロア全体と罠が明らかになった！");
          }
        }
      } else if (it.effect === "weapon_up") {
        if (p.weapon) {
          const _bef = p.weapon.plus || 0;
          const _gain = it.blessed ? 2 : it.cursed ? -1 : 1;
          p.weapon.plus = _bef + _gain;
          const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
          let _wMsg = `${p.weapon.name}が${_gain > 0 ? "輝いた" : "くすんだ"}！(${_fp(_bef)}→${_fp(p.weapon.plus)})${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`;
          if (p.weapon.cursed) { p.weapon.cursed = false; _wMsg += " 呪いが解けた！"; }
          ml.push(_wMsg);
        } else {
          ml.push("武器を装備していないので効果がなかった。");
        }
      } else if (it.effect === "armor_up") {
        if (p.armor) {
          const _bef = p.armor.plus || 0;
          const _gain = it.blessed ? 2 : it.cursed ? -1 : 1;
          p.armor.plus = _bef + _gain;
          const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
          let _aMsg = `${p.armor.name}が${_gain > 0 ? "輝いた" : "くすんだ"}！(${_fp(_bef)}→${_fp(p.armor.plus)})${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`;
          if (p.armor.cursed) { p.armor.cursed = false; _aMsg += " 呪いが解けた！"; }
          ml.push(_aMsg);
        } else {
          ml.push("防具を装備していないので効果がなかった。");
        }
      } else if (it.effect === "thunder") {
        if (hasCursedExplosionPentacle(dg)) {
          ml.push("呪われた爆発の魔方陣が雷を打ち消した！");
        } else {
        // 祝福：フロア全モンスターに雷、通常：視界内のみ、呪い：視界内＋自分にも雷
        const _tTargets = it.blessed
          ? dg.monsters
          : dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
        if (_tTargets.length === 0 && !it.cursed) {
          ml.push("雷が走るが、視界に敵はいない。");
        } else {
          if (it.blessed && _tTargets.length === 0) {
            ml.push("雷が走るが、フロアに敵はいない。【祝】");
          }
          for (const _m of _tTargets) {
            let _dmg = Math.max(1, Math.round(rng(20, 30) * _scrBm));
            if (inCursedMagicSealRoom(_m.x, _m.y, dg)) _dmg *= 2;
            _m.hp -= _dmg;
            ml.push(`雷が${_m.name}を直撃！${_dmg}ダメージ！${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`);
            if (_m.hp <= 0) { trackMonster(_m); killMonster(_m, dg, p, ml, lu); }
          }
          // 呪い：自分にも雷が落ちる
          if (it.cursed) {
            const _selfDmg = Math.max(1, rng(10, 20));
            p.hp -= _selfDmg;
            p.deathCause = "呪われた雷の巻物で";
            ml.push(`呪われた雷が自分にも落ちた！${_selfDmg}ダメージ！【呪】`);
          }
        }
        } // end hasCursedExplosionPentacle else
      } else if (it.effect === "recovery") {
        if (it.cursed) {
          // 呪い：自分がダメージ、視界内モンスターが回復
          const _rdmg = Math.max(1, rng(10, 20));
          p.hp -= _rdmg;
          p.deathCause = "呪われた回復の巻物で";
          ml.push(`体が焼けるような痛みが走った！${_rdmg}ダメージ！【呪】`);
          const _rvisC = dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
          for (const _m of _rvisC) {
            const _ma = Math.min(rng(10, 20), _m.maxHp - _m.hp);
            if (_ma > 0) { _m.hp += _ma; ml.push(`${_m.name}が回復した！HP+${_ma}`); }
          }
        } else {
          const _rh = Math.max(1, Math.round(rng(15, 25) * _scrBm));
          const _ra = Math.min(_rh, p.maxHp - p.hp);
          p.hp += _ra;
          if (it.blessed) {
            // 祝福：自分だけ回復（敵は回復しない）
            ml.push(`体が癒された！HP+${_ra}（祝福：自分だけ回復！）`);
          } else {
            // 通常：自分と視界内モンスターも回復
            ml.push(`体が回復した！HP+${_ra}`);
            const _rvis = dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
            for (const _m of _rvis) {
              const _mh = Math.max(1, Math.round(rng(10, 20)));
              const _ma = Math.min(_mh, _m.maxHp - _m.hp);
              if (_ma > 0) { _m.hp += _ma; ml.push(`${_m.name}も回復した！HP+${_ma}`); }
            }
          }
        }
      } else if (it.effect === "item_gather") {
        const _toG = dg.items.filter((gi) => !gi.shopPrice);
        const _cnt = _toG.length;
        if (_cnt === 0) {
          ml.push("引き寄せるアイテムがなかった。");
        } else if (it.cursed) {
          // 呪い：フロアのアイテムをランダムな場所に飛ばす
          dg.items = dg.items.filter((gi) => gi.shopPrice);
          const _floorCands = [];
          for (let _fy = 0; _fy < MH; _fy++)
            for (let _fx = 0; _fx < MW; _fx++)
              if (dg.map[_fy][_fx] !== T.WALL && dg.map[_fy][_fx] !== T.BWALL &&
                  dg.map[_fy][_fx] !== T.SD && dg.map[_fy][_fx] !== T.SU)
                _floorCands.push([_fx, _fy]);
          for (const gi of _toG) {
            const [_rx, _ry] = pick(_floorCands);
            gi.x = _rx; gi.y = _ry;
            delete gi.wallEmbedded;
            dg.items.push(gi);
          }
          ml.push(`${_cnt}個のアイテムがフロアに散らばった！【呪】`);
        } else if (it.blessed) {
          // 祝福：フロアのアイテムを直接インベントリに吸収（満杯分は通常の落下ルールで配置）
          dg.items = dg.items.filter((gi) => gi.shopPrice);
          let _picked = 0, _dropped = 0;
          const _blessFt = new Set();
          for (const gi of _toG) {
            delete gi.wallEmbedded;
            if (p.inventory.length < (p.maxInventory || 30)) {
              p.inventory.push(gi);
              _picked++;
            } else {
              placeItemAt(dg, p.x, p.y, gi, ml, _blessFt, 0, p);
              _dropped++;
            }
          }
          ml.push(`${_picked}個のアイテムを拾った！【祝】${_dropped > 0 ? `（${_dropped}個は満杯で周囲に配置）` : ""}`);
        } else {
          // 通常：隣接マスに引き寄せる
          dg.items = dg.items.filter((gi) => gi.shopPrice);
          const _gft = new Set();
          const _igPfBag = [];
          setPitfallBag(_igPfBag);
          for (const gi of _toG) {
            let _placed = false;
            for (const [_dx, _dy] of DRO) {
              const _cx = p.x + _dx, _cy = p.y + _dy;
              if (_cx < 0 || _cx >= MW || _cy < 0 || _cy >= MH) continue;
              if (dg.map[_cy][_cx] === T.WALL || dg.map[_cy][_cx] === T.BWALL || dg.map[_cy][_cx] === T.SD || dg.map[_cy][_cx] === T.SU) continue;
              const _gb = dg.bigboxes?.find((b) => b.x === _cx && b.y === _cy);
              if (_gb) { bigboxAddItem(_gb, gi, dg, ml); _placed = true; break; }
              const _gs = dg.springs?.find((s) => s.x === _cx && s.y === _cy);
              if (_gs) { soakItemIntoSpring(_gs, gi, ml, dg, dnameRef); _placed = true; break; }
              const _gt = dg.traps.find((t) => t.x === _cx && t.y === _cy && !_gft.has(t.id));
              if (_gt) {
                _gft.add(_gt.id);
                _gt.revealed = true;
                const _gr = fireTrapItem(_gt, gi, dg, _cx, _cy, ml, _gft, p, dnameRef);
                if (Math.random() < 0.3) { dg.traps = dg.traps.filter((t) => t !== _gt); ml.push(`${_gt.name}は壊れた。`); }
                if (_gr === "destroyed") { _placed = true; break; }
                if (_gr === "restart") { placeItemAt(dg, _cx, _cy, gi, ml, _gft, 0, p); _placed = true; break; }
                continue;
              }
              if (dg.items.some((i) => i.x === _cx && i.y === _cy)) continue;
              gi.x = _cx; gi.y = _cy;
              delete gi.wallEmbedded;
              dg.items.push(gi);
              _placed = true;
              break;
            }
            if (!_placed) ml.push(`${gi.name}は引き寄せられなかった！`);
          }
          clearPitfallBag();
          if (!sr.current.floors) sr.current.floors = {};
          processPitfallBag(_igPfBag, sr.current.floors, p.depth);
          ml.push(`${_cnt}個のアイテムを引き寄せた！`);
        }
      } else if (it.effect === "sleep_scroll") {
        if (it.cursed) {
          // 呪い：プレイヤーが眠る
          const _pst = Math.max(2, rng(3, 5));
          if ((p.statusImmune || 0) > 0) ml.push("眠気が自分を襲った！状態防止中のため効かなかった！【呪】");
          else { p.sleepTurns = (p.sleepTurns || 0) + _pst; ml.push(`眠気が自分を襲った！${_pst}ターン眠ってしまう…【呪】`); }
        } else {
          // 通常：視界内、祝福：フロア全モンスター
          const _sSleep = it.blessed ? dg.monsters : dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
          if (_sSleep.length === 0) {
            ml.push(it.blessed ? "眠気が漂うが、フロアに敵はいない。【祝】" : "眠気が漂うが、視界に敵はいない。");
          } else {
            for (const _m of _sSleep) {
              const _st = Math.max(1, Math.round(rng(3, 6) * _scrBm));
              if ((_m.statusImmune || 0) > 0) { ml.push(`${_m.name}には効かなかった！(状態防止中)`); continue; }
              _m.sleepTurns = (_m.sleepTurns || 0) + _st;
              ml.push(`${_m.name}が眠りに落ちた！(${_st}ターン)${it.blessed ? "【祝】" : ""}`);
            }
          }
        }
      } else if (it.effect === "identify") {
        if (it.blessed) {
          // 全アイテム完全識別（武器・防具も含む）
          for (const _ii of p.inventory) {
            const _k = getIdentKey(_ii);
            if (_k) { sr.current.ident.add(_k); _ii.fullIdent = true; }
            else if (_ii.type === 'weapon' || _ii.type === 'armor') { _ii.fullIdent = true; }
          }
          ml.push("全てのアイテムが識別された！");
        } else if (it.cursed) {
          // 識別済みアイテムを1つ選んで未識別に戻す（武器・防具も含む）
          const _targets = p.inventory.filter(_ii => {
            if (_ii.type === 'weapon' || _ii.type === 'armor') return _ii.fullIdent || _ii.bcKnown;
            const _k = getIdentKey(_ii); return _k && sr.current.ident.has(_k);
          });
          if (_targets.length === 0) {
            ml.push("未識別に戻せるアイテムがない。");
          } else {
            { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
              setMsgs((prev) => [...prev.slice(-80), ..._rp, ...ml, "どのアイテムの識別を解除する？【呪】"]); }
            setIdentifyMode({ mode: 'unidentify' });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        } else {
          // 通常: 1つ選んで識別（武器・防具も含む）
          const _targets = p.inventory.filter(_ii => {
            if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
            const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
          });
          if (_targets.length === 0) {
            ml.push("未識別のアイテムがない。");
          } else {
            { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
              setMsgs((prev) => [...prev.slice(-80), ..._rp, ...ml, "識別するアイテムを選んでください。"]); }
            setIdentifyMode({ mode: 'identify' });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        }
      } else if (it.effect === "duplicate") {
        // ここに到達するのは「アイテムなし」または「魔封じ」の場合のみ
        const _dupTargets = p.inventory.filter((_ii) => _ii.type !== "gold");
        if (_dupTargets.length === 0) {
          ml.push("複製できるアイテムがない。");
        }
        /* 魔封じ時は魔法封印メッセージが ml に入っているので何もしない */
      } else if (it.effect === "summon") {
        // 召喚の巻物
        if (it.cursed) {
          // 呪い：同じ部屋の敵を別の部屋に飛ばす
          const _sumRoom = findRoom(dg.rooms, p.x, p.y);
          const _inRoom = _sumRoom
            ? dg.monsters.filter((m) => findRoom(dg.rooms, m.x, m.y) === _sumRoom)
            : [];
          if (_inRoom.length === 0) {
            ml.push("部屋に敵がいないのに呪いが発動した…【呪】");
          } else {
            const _otherRooms = dg.rooms.filter((r) => r !== _sumRoom);
            for (const _sm of _inRoom) {
              const _tr = pick(_otherRooms);
              if (!_tr) continue;
              for (let _att = 0; _att < 20; _att++) {
                const _tx = rng(_tr.x + 1, _tr.x + _tr.w - 2);
                const _ty = rng(_tr.y + 1, _tr.y + _tr.h - 2);
                if (dg.map[_ty]?.[_tx] === T.FLOOR && !dg.monsters.some((m) => m.x === _tx && m.y === _ty) && (_tx !== p.x || _ty !== p.y)) {
                  _sm.x = _tx; _sm.y = _ty; _sm.aware = false; break;
                }
              }
            }
            ml.push(`${_inRoom.length}体の敵が別の部屋へ飛んだ！【呪】`);
          }
        } else {
          // 通常4体、祝福8体召喚
          const _sumCount = it.blessed ? 8 : 4;
          let _spawned = 0;
          _spawned = spawnMonsters(dg, _sumCount, p.depth + 1, p.x, p.y, p, { aware: !!it.blessed });
          ml.push(it.blessed ? `${_spawned}体の敵に囲まれた！【祝】` : `${_spawned}体の敵が召喚された！`);
        }
      } else if (it.effect === "trap_scatter") {
        // 罠の巻物
        if (it.cursed) {
          dg.traps = [];
          ml.push("罠の巻物を読んだ！フロア内の全ての罠が消えた！【呪】");
        } else {
          const _tCount = it.blessed ? rng(15, 25) : rng(8, 15);
          let _placed = 0;
          for (let _ti = 0; _ti < _tCount * 3 && _placed < _tCount; _ti++) {
            const _tr = dg.rooms[rng(0, dg.rooms.length - 1)];
            const _tx = rng(_tr.x, _tr.x + _tr.w - 1);
            const _ty = rng(_tr.y, _tr.y + _tr.h - 1);
            if (_tx === p.x && _ty === p.y) continue;
            if (dg.map[_ty][_tx] !== T.FLOOR) continue;
            if (dg.traps.some(t => t.x === _tx && t.y === _ty)) continue;
            if (dg.items.some(i => i.x === _tx && i.y === _ty)) continue;
            const _td = pick(TRAPS);
            dg.traps.push({ ..._td, id: uid(), x: _tx, y: _ty, revealed: false });
            _placed++;
          }
          ml.push(it.blessed
            ? `罠の巻物を読んだ！大量の罠がフロアに出現した！(${_placed}個)【祝】`
            : `罠の巻物を読んだ！罠がフロアに出現した！(${_placed}個)`);
        }
      } else if (it.effect === "expand_inv") {
        // 収納上手の巻物
        const _curMax = p.maxInventory || 30;
        if (it.cursed) {
          const _loss = rng(1, 3);
          const _newMax = Math.max(10, _curMax - _loss);
          const _actual = _curMax - _newMax;
          p.maxInventory = _newMax;
          // 超過分のアイテムを足元に落とす
          if (p.inventory.length > _newMax) {
            const _excess = p.inventory.splice(_newMax);
            const _fts = new Set();
            for (const _ei of _excess) placeItemAt(dg, p.x, p.y, _ei, ml, _fts, 0, p);
            ml.push(`最大所持数が${_actual}減った…(${_curMax}→${_newMax}) 超過分が落ちた！【呪】`);
          } else {
            ml.push(`最大所持数が${_actual}減った…(${_curMax}→${_newMax})【呪】`);
          }
        } else {
          const _gain = it.blessed ? rng(2, 6) : rng(1, 3);
          p.maxInventory = _curMax + _gain;
          ml.push(it.blessed
            ? `収納が上手くなった！最大所持数が${_gain}増えた！(${_curMax}→${p.maxInventory})【祝】`
            : `収納が上手くなった！最大所持数が${_gain}増えた！(${_curMax}→${p.maxInventory})`);
        }
      }
    } else if (it.type === "pen") {
      if ((it.charges || 0) <= 0) {
        ml.push(`${it.name}のインクが尽きている。充填の大箱で補充できる。`);
        endTurn(sr.current, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        setSelIdx(null); setShowDesc(null); setShowInv(false);
        sr.current = { ...sr.current }; setGs({ ...sr.current });
        return;
      }
      const _exPen = dg.pentacles?.find((pc) => pc.x === p.x && pc.y === p.y);
      const _penBlocked =
        dg.items.some((gi) => gi.x === p.x && gi.y === p.y) ||
        dg.traps.some((tr) => tr.x === p.x && tr.y === p.y) ||
        dg.springs?.some((s) => s.x === p.x && s.y === p.y) ||
        dg.bigboxes?.some((b) => b.x === p.x && b.y === p.y) ||
        dg.map[p.y][p.x] === T.SD ||
        dg.map[p.y][p.x] === T.SU;
      if (_exPen) {
        ml.push(`すでに${_exPen.name}がある。`);
      } else if (_penBlocked) {
        ml.push("足元に別のものがあって魔方陣を描けない。");
      } else {
        dg.pentacles = dg.pentacles || [];
        const _isBlessed = it.blessed || false;
        const _isCursed = it.cursed || false;
        const _penIK = getIdentKey(it); // "n:sanctuary" etc
        const _penIsIdent = !_penIK || sr.current.ident.has(_penIK);
        const _bcPrefix = _isBlessed ? "祝福された" : _isCursed ? "呪われた" : "";
        let _pName;
        if (_penIsIdent) {
          const _baseName =
            it.effect === "sanctuary"      ? "聖域の魔方陣" :
            it.effect === "vulnerability"  ? "脆弱の魔方陣" :
            it.effect === "magic_seal"     ? "魔封じの魔方陣" :
            it.effect === "thunder_trap"   ? "雷の魔方陣" :
            it.effect === "farcast"        ? "遠投の魔方陣" :
            it.effect === "light"          ? "明かりの魔方陣" :
            it.effect === "teleport_trap"  ? "テレポートの魔方陣" :
            it.effect === "trap_gen"       ? "罠の魔方陣" :
            it.effect === "stone_throw"    ? "石飛ばしの魔方陣" :
            it.effect === "knockback_aura" ? "吹き飛ばしの魔方陣" :
            it.effect === "explosion"      ? "爆発の魔方陣" :
            it.effect === "plain"          ? "無の魔方陣" : "魔方陣";
          _pName = _bcPrefix + _baseName;
        } else {
          const _nick = sr.current.nicknames?.[_penIK];
          let _circleBase;
          if (_nick) {
            _circleBase = `${_nick}の魔方陣`;
          } else {
            const _fake = sr.current.fakeNames?.[_penIK] ?? it.name;
            _circleBase = _fake.replace(/ペン$/, '魔方陣'); // "朱色のペン"→"朱色の魔方陣"
          }
          _pName = _bcPrefix ? `${_bcPrefix}${_circleBase}` : _circleBase;
        }
        dg.pentacles.push({ x: p.x, y: p.y, kind: it.effect, name: _pName, blessed: _isBlessed, cursed: _isCursed });
        it.charges = (it.charges || 1) - 1;
        if (it.charges <= 0) {
          ml.push(`足元に${_pName}を描いた！ペンのインクが尽きた。(充填の大箱で補充できる)`);
        } else {
          ml.push(`足元に${_pName}を描いた！(残り${it.charges}回)`);
        }
        /* 呪われた聖域の魔方陣：描いた直後に隣のマスに弾き出される */
        if (it.effect === "sanctuary" && _isCursed) {
          const _dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
          let _pushed = false;
          for (const [_pdx, _pdy] of _dirs) {
            const _px = p.x + _pdx, _py = p.y + _pdy;
            if (_px >= 0 && _px < MW && _py >= 0 && _py < MH && dg.map[_py][_px] !== T.WALL && dg.map[_py][_px] !== T.BWALL &&
                !dg.monsters.some(m => m.x === _px && m.y === _py) &&
                !dg.pentacles.some(pc => pc.kind === "sanctuary" && pc.cursed && pc.x === _px && pc.y === _py)) {
              p.x = _px; p.y = _py;
              ml.push("呪われた魔方陣に弾き出された！");
              _pushed = true;
              break;
            }
          }
          if (!_pushed) ml.push("逃げ場がない！");
        }
        /* テレポートの魔方陣：描いた瞬間に即テレポート（呪い以外） */
        if (it.effect === "teleport_trap" && !_isCursed) {
          const _tpRm = dg.rooms[rng(0, dg.rooms.length - 1)];
          p.x = rng(_tpRm.x, _tpRm.x + _tpRm.w - 1);
          p.y = rng(_tpRm.y, _tpRm.y + _tpRm.h - 1);
          ml.push("魔方陣を描いた瞬間、テレポートした！");
        }
        /* 雷の魔方陣：描いたそのターンにも即座に発動 */
        if (it.effect === "thunder_trap") {
          if (_isCursed) {
            const _drawHeal = Math.min(25, p.maxHp - p.hp);
            if (_drawHeal > 0) { p.hp += _drawHeal; ml.push(`描いた瞬間、癒しの力が湧き上がった！HPが${_drawHeal}回復！`); }
          } else if (hasCursedExplosionPentacle(dg)) {
            ml.push("呪われた爆発の魔方陣が雷を打ち消した！");
          } else {
            const _tdrawDmg = _isBlessed ? 50 : 25;
            if (p.hp > 0) {
              p.deathCause = `${_pName}の雷撃により`;
              p.hp -= _tdrawDmg;
              ml.push(`描いた瞬間、雷が落ちた！${_tdrawDmg}ダメージ！`);
              applyLightningToInventory(p, dg, ml, lu,
                (it) => itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames));
            }
            for (const _tm of [...dg.monsters]) {
              if (_tm.x === p.x && _tm.y === p.y) {
                _tm.hp -= _tdrawDmg;
                ml.push(`${_pName}が${_tm.name}を打った！${_tdrawDmg}ダメージ！`);
                if (_tm.hp <= 0) { trackMonster(_tm); killMonster(_tm, dg, p, ml, lu); }
              }
            }
          }
        }
      }
    } else if (it.type === "weapon") {
      if (p.weapon === it) {
        if (it.cursed) { ml.push(`${it.name}は呪われていて外せない！泉か強化の巻物で呪いを解こう。`); }
        else { p.weapon = null; ml.push(`${it.name}を外した。`); }
      } else {
        p.weapon = it;
        it.bcKnown = true;
        ml.push(`${it.name}を装備した。${it.cursed ? "【呪】呪われている！外せなくなった！" : ""}`);
      }
    } else if (it.type === "armor") {
      if (p.armor === it) {
        if (it.cursed) { ml.push(`${it.name}は呪われていて外せない！泉か強化の巻物で呪いを解こう。`); }
        else { p.armor = null; ml.push(`${it.name}を外した。`); }
      } else {
        p.armor = it;
        it.bcKnown = true;
        ml.push(`${it.name}を装備した。${it.cursed ? "【呪】呪われている！外せなくなった！" : ""}`);
      }
    } else if (it.type === "arrow") {
      if (p.arrow === it) { p.arrow = null; ml.push(`${it.name}を外した。`); }
      else { p.arrow = it; ml.push(`${it.name}(${it.count}${(it.stone || it.magicStone) ? "個" : "本"})を装備した。`); }
    } else if (it.type === "pot") {
      if (it.contents.length >= it.capacity) {
        ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいだ。`);
      } else {
        setPutMode({ potIdx: idx });
        setPutMenuSel(0);
        setPutPage(0);
        setShowInv(false);
        setSelIdx(null);
        setShowDesc(null);
        setMsgs((prev) => [
          ...prev.slice(-80),
          `${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}に入れるアイテムを選んでください...(${it.contents.length}/${it.capacity})`,
        ]);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
        return;
      }
    }
    if (_wasUnknown && _revFake && _revFake !== _revReal) {
      setMsgs(prev => [...prev.slice(-80), `${_revFake}は${_revReal}だった！`]);
      if (ml.length) setRevealMode({ pendingMsgs: [...ml] });
    } else {
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
    }
    endTurn(sr.current, p, ml);
    refreshFOV(dg, p);
    setSelIdx(null);
    setShowDesc(null);
    setShowInv(false);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, [lu, endTurn, chgFloor]);
  const doDropItem = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const it = p.inventory[idx];
    if (!it) return;
    if (p.weapon === it) p.weapon = null;
    if (p.armor  === it) p.armor  = null;
    if (p.arrow  === it) p.arrow  = null;
    p.inventory.splice(idx, 1);
    const ml = [],
      ft = new Set();
    const _allShopsDrop = dg.shops || (dg.shop ? [dg.shop] : []);
    const _itemShopDrop = _allShopsDrop.find(s => s.id === it._shopId) || _allShopsDrop.find(s => s.unpaidTotal > 0);
    const prevDebt = _itemShopDrop?.unpaidTotal ?? 0;
    /* 足元に泉があればアイテムを泉に落とす */
    const _dropSpr = dg.springs?.find((s) => s.x === p.x && s.y === p.y);
    if (_dropSpr) {
      soakItemIntoSpring(_dropSpr, it, ml, dg, dnameRef);
    } else {
      const _dropPfBag = [];
      setPitfallBag(_dropPfBag);
      const _dr = placeItemAt(dg, p.x, p.y, it, ml, ft, 0, p);
      clearPitfallBag();
      if (!sr.current.floors) sr.current.floors = {};
      processPitfallBag(_dropPfBag, sr.current.floors, p.depth);
      if (_dr === "pitfall_player") {
        const _nd = chgFloor(p, 1, true);
        if (_nd) {
          sr.current.dungeon = _nd;
          ml.push(`地下${p.depth}階に落ちた！`);
        }
      }
    }
    if (
      it.shopPrice &&
      _itemShopDrop &&
      _itemShopDrop.unpaidTotal < prevDebt &&
      _itemShopDrop.unpaidTotal > 0
    )
      ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を戻した。（残り${_itemShopDrop.unpaidTotal}G）`);
    if (ml.length === 0) ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}${_itemPickupSuffix(it, sr.current?.ident)}を置いた。`);
    endTurn(sr.current, p, ml);
    setMsgs((prev) => [...prev.slice(-80), ...ml]);
    setSelIdx(null);
    setShowDesc(null);
    if (!dropModeRef.current) {
      setShowInv(false);
    }
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, [endTurn]);
  const doThrow = useCallback((idx) => {
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setThrowMode({ idx, mode: "throw" });
    const _it = sr.current?.player?.inventory[idx];
    const _nm = _it ? itemDisplayName(_it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames) : "アイテム";
    setMsgs((prev) => [...prev.slice(-80), `${_nm}を投げる方向を選んでください...`]);
  }, []);
  const doShoot = useCallback((idx) => {
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    const _it = sr.current?.player?.inventory[idx];
    /* 石・魔法の石・爆弾矢は投げるモードで処理（装備時と同じ挙動） */
    if (_it?.stone || _it?.magicStone || _it?.bombArrow) {
      setThrowMode({ idx, mode: "throw" });
      const _nm = itemDisplayName(_it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
      setMsgs((prev) => [...prev.slice(-80), `${_nm}を投げる方向を選んでください...`]);
      return;
    }
    setThrowMode({ idx, mode: "shoot" });
    setMsgs((prev) => [...prev.slice(-80), "矢を射る方向を選んでください..."]);
  }, []);
  const doWaveWand = useCallback((idx) => {
    if (!sr.current) return;
    const it = sr.current.player.inventory[idx];
    if (!it || it.type !== "wand") return;
    if (it.charges <= 0) {
      setMsgs((prev) => [...prev.slice(-80), "杖の力が残っていない..."]);
      return;
    }
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setThrowMode({ idx, mode: "wand_wave" });
    setMsgs((prev) => [
      ...prev.slice(-80),
      `${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を振る方向を選んでください...`,
    ]);
  }, []);
  const doBreakWand = useCallback(
    (idx) => {
      if (!sr.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[idx];
      if (!it || it.type !== "wand") return;
      p.inventory.splice(idx, 1);
      const ml = [];
      ml.push(`${dnameRef(it)}を壊した！`);
      try {
        if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
          ml.push("魔法が封印されている！効果は発動しなかった。");
        } else {
          const times = Math.max(1, Math.ceil((it.charges ?? 0) / 2));
          const _bwBlMult = it.blessed ? 1.5 : it.cursed ? 0.5 : 1;
          for (let t = 0; t < times; t++) breakWandAoE(p, dg, it.effect, ml, lu, _bwBlMult);
          /* 呪われたレベルアップの杖の壊し：上の階へワープ */
          if (p._pendingWarpUp) {
            delete p._pendingWarpUp;
            if (p.depth > 1) {
              const _bwNd = chgFloor(p, -1);
              if (_bwNd) sr.current.dungeon = _bwNd;
            } else {
              ml.push("ここは1階だ。何も起こらなかった。");
            }
          }
        }
      } catch (e) {
        console.error("doBreakWand error:", e);
        ml.push("杖の破砕中にエラーが発生した。");
      }
      endTurn(sr.current, p, ml);
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setSelIdx(null);
      setShowDesc(null);
      setShowInv(false);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [lu, endTurn, chgFloor],
  );
  const doUseMarker = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p } = sr.current;
    const it = p.inventory[idx];
    if (!it || it.type !== "marker") return;
    if (it.charges <= 0) {
      setMsgs((prev) => [...prev.slice(-80), "マーカーのインクが切れている..."]);
      return;
    }
    const blanks = p.inventory.filter((b) =>
      (b.type === "scroll" && b.effect === "blank") ||
      (b.type === "spellbook" && !b.spell)
    );
    if (blanks.length === 0) {
      setMsgs((prev) => [...prev.slice(-80), "白紙の巻物も白紙の魔法書もない。"]);
      return;
    }
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setMarkerMode({ markerIdx: idx, step: "select_blank", blankIdx: null, blankKind: null });
    setMarkerMenuSel(0);
    setMsgs((prev) => [...prev.slice(-80), "書き込む白紙アイテムを選んでください..."]);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, []);
  const doReadSpellbook = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const it = p.inventory[idx];
    if (!it || it.type !== "spellbook") return;
    const ml = [];
    if (!p.spells) p.spells = [];
    /* 未識別チェック（dnameRef は render後に定義されているが closure で参照可能） */
    const _sbIK = getIdentKey(it); // "b:fire_bolt" etc
    const _wasUnknown = !!(_sbIK && !sr.current.ident.has(_sbIK));
    const _revFake = _wasUnknown ? itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames) : null;
    const _revReal = _wasUnknown ? it.name : null;
    /* 識別 */
    if (_sbIK && _wasUnknown) sr.current.ident.add(_sbIK);
    if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
      p.inventory.splice(idx, 1);
      ml.push(`${it.name}を読んだが、魔法が封印されている！魔法書は消えた。`);
    } else if (it.cursed) {
      // 呪い：この魔法以外のランダムな魔法を1つ選んで習得 or レベルアップ
      if (!p.spellLevels) p.spellLevels = {};
      const _otherSpells = SPELLS.filter((s) => s.id !== it.spell);
      const _candidates = _otherSpells.filter((s) => {
        if (!p.spells.includes(s.id)) return true;          // 未習得 → 習得できる
        return (p.spellLevels[s.id] || 1) < 6;              // 習得済みでも最大未満ならLvUP
      });
      p.inventory.splice(idx, 1);
      if (_candidates.length === 0) {
        ml.push(`${it.name}を読んだが、呪いで魔力が乱れ何も起きなかった。【呪】`);
      } else {
        const _tgt = pick(_candidates);
        if (p.spells.includes(_tgt.id)) {
          const _curLv = p.spellLevels[_tgt.id] || 1;
          const _newLv = _curLv + 1;
          p.spellLevels[_tgt.id] = _newLv;
          ml.push(`${it.name}を読んだ。呪いで魔力が乱れ「${_tgt.name}」がレベルアップした！(Lv.${_newLv})【呪】`);
        } else {
          p.spells = [...p.spells, _tgt.id];
          p.spellLevels[_tgt.id] = 1;
          ml.push(`${it.name}を読んだ。呪いで魔力が乱れ「${_tgt.name}」を習得した！(Lv.1)【呪】`);
        }
      }
    } else if (p.spells.includes(it.spell)) {
      // 既習得 → レベルアップ（祝福なら+2）
      if (!p.spellLevels) p.spellLevels = {};
      const _curLv = p.spellLevels[it.spell] || 1;
      const spellDef = SPELLS.find((s) => s.id === it.spell);
      const _spName = spellDef ? spellDef.name : it.spell;
      if (_curLv >= 6) {
        ml.push(`「${_spName}」はすでに最大レベルだ。(Lv.${_curLv} MP:${Math.max(1, 20 - (_curLv - 1) * 3)})`);
        // 最大レベルの場合は魔法書を消費しない
      } else {
        const _gain = it.blessed ? 2 : 1;
        const _newLv = Math.min(6, _curLv + _gain);
        p.spellLevels[it.spell] = _newLv;
        p.inventory.splice(idx, 1);
        const _newCost = Math.max(1, 20 - (_newLv - 1) * 3);
        ml.push(`${it.name}を読んだ。「${_spName}」がレベルアップ！(Lv.${_newLv} 消費MP:${_newCost})${it.blessed ? "【祝】" : ""}`);
      }
    } else {
      // 未習得 → 習得（祝福ならLv.2から）
      if (!p.spellLevels) p.spellLevels = {};
      const _startLv = it.blessed ? 2 : 1;
      p.spellLevels[it.spell] = _startLv;
      p.spells = [...p.spells, it.spell];
      p.inventory.splice(idx, 1);
      const spellDef = SPELLS.find((s) => s.id === it.spell);
      const _initCost = Math.max(1, 20 - (_startLv - 1) * 3);
      ml.push(`${it.name}を読んだ。「${spellDef ? spellDef.name : it.spell}」を習得した！(Lv.${_startLv} 消費MP:${_initCost})${it.blessed ? "【祝】" : ""}`);
    }
    setShowInv(false); setSelIdx(null); setShowDesc(null);
    endTurn(sr.current, p, ml);
    /* リビールメッセージ */
    if (_wasUnknown && _revFake && _revFake !== _revReal) {
      setMsgs(prev => [...prev.slice(-80), `${_revFake}は${_revReal}だった！`]);
      if (ml.length) setRevealMode({ pendingMsgs: [...ml] });
    } else {
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
    }
    sr.current = { ...sr.current }; setGs({ ...sr.current });
  }, [endTurn]);
  const doMarkerWrite = useCallback(
    (blankIdx, template) => {
      if (!sr.current || !markerMode) return;
      const { player: p } = sr.current;
      const marker = p.inventory[markerMode.markerIdx];
      const blank = p.inventory[blankIdx];
      if (!marker || marker.type !== "marker") { setMarkerMode(null); return; }
      const ml = [];
      if (markerMode.blankKind === "spellbook") {
        if (!blank || blank.type !== "spellbook" || blank.spell) { setMarkerMode(null); return; }
        if (marker.charges < 5) {
          ml.push(`インクが足りない！(必要:5回 現在:${marker.charges}回)`);
          setMarkerMode(null);
          setMsgs((prev) => [...prev.slice(-80), ...ml]);
          return;
        }
        blank.name = template.name;
        blank.spell = template.spell;
        blank.desc = template.desc;
        marker.charges -= 5;
        ml.push(`${template.name}に変化した！[${marker.name} 残り${marker.charges}回]`);
      } else {
        if (!blank || blank.effect !== "blank") { setMarkerMode(null); return; }
        blank.name = template.name;
        blank.effect = template.effect;
        blank.desc = template.desc;
        if (marker.blessed) { blank.blessed = true; blank.cursed = false; }
        else if (marker.cursed) { blank.cursed = true; blank.blessed = false; }
        marker.charges--;
        const _mBcLabel = marker.blessed ? "【祝】" : marker.cursed ? "【呪】" : "";
        ml.push(`${template.name}${_mBcLabel}に変化した！[${marker.name} 残り${marker.charges}回]`);
      }
      if (marker.charges <= 0) {
        p.inventory.splice(markerMode.markerIdx, 1);
        ml.push(`${marker.name}のインクが切れた。`);
      }
      setMarkerMode(null);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [markerMode, endTurn],
  );
  doMarkerWriteRef.current = doMarkerWrite;
  const doPutItem = useCallback(
    (itemIdx) => {
      if (!sr.current || !putMode) return;
      const { player: p, dungeon: dg } = sr.current;
      const pot = p.inventory[putMode.potIdx];
      if (!pot || pot.type !== "pot") {
        setPutMode(null);
        return;
      }
      const it = p.inventory[itemIdx];
      if (!it) return;
      if (it.type === "pot") {
        setMsgs((prev) => [...prev.slice(-80), "壺の中に壺は入れられない。"]);
        return;
      }
      if (pot.contents.length >= pot.capacity) {
        setMsgs((prev) => [...prev.slice(-80), `${itemDisplayName(pot, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいだ。`]);
        setPutMode(null);
        return;
      }
      if (p.weapon === it) p.weapon = null;
      if (p.armor  === it) p.armor  = null;
      if (p.arrow  === it) p.arrow  = null;
      p.inventory.splice(itemIdx, 1);
      if (itemIdx < putMode.potIdx) putMode.potIdx--;
      const ml = [];
      if (pot.potEffect === "boil") {
        if (it.type === "potion") {
          ml.push(`${dnameRef(it)}を加熱の壺に投じた！薬効が部屋中に広がった！`);
          const _boilRoom = findRoom(dg.rooms, p.x, p.y);
          if (_boilRoom) {
            applyPotionEffect(it.effect, it.value || 0, "player", p, dg, p, ml, lu, it.blessed || false, it.cursed || false);
            const _boilMons = dg.monsters.filter(
              (m) => m.x >= _boilRoom.x && m.x < _boilRoom.x + _boilRoom.w &&
                     m.y >= _boilRoom.y && m.y < _boilRoom.y + _boilRoom.h,
            );
            for (const _bm of _boilMons) {
              applyPotionEffect(it.effect, it.value || 0, "monster", _bm, dg, p, ml, lu, it.blessed || false, it.cursed || false);
            }
            const _boilBurnSet = [];
            for (const _bi of dg.items.filter(
              (fi) => fi.x >= _boilRoom.x && fi.x < _boilRoom.x + _boilRoom.w &&
                      fi.y >= _boilRoom.y && fi.y < _boilRoom.y + _boilRoom.h,
            )) {
              const _br = applyPotionToItem(it.effect, it.value || 0, _bi, dg, ml, it.cursed || false, dnameRef);
              if (_br === "burn") _boilBurnSet.push(_bi);
            }
            if (_boilBurnSet.length > 0) dg.items = dg.items.filter((fi) => !_boilBurnSet.includes(fi));
          } else {
            ml.push("（回廊では薬効が拡散しにくい…自分にだけ効いた）");
            applyPotionEffect(it.effect, it.value || 0, "player", p, dg, p, ml, lu, it.blessed || false, it.cursed || false);
          }
          pot.capacity = Math.max(0, pot.capacity - 1);
          // 呪われたレベルアップの薬でワープフラグが立った場合
          if (p._pendingWarpUp) {
            delete p._pendingWarpUp;
            if (p.depth > 1) {
              const _boilWarpNd = chgFloor(p, -1, true);
              if (_boilWarpNd) sr.current.dungeon = _boilWarpNd;
            }
          }
        } else if (it.type === "scroll" || it.type === "spellbook") {
          ml.push(`${dnameRef(it)}は加熱の壺の熱で燃えてなくなった！`);
          pot.capacity = Math.max(0, pot.capacity - 1);
          /* 壺には残さない */
        } else if (it.type === "food" && !it.cooked) {
          it.value = it.value * 2;
          it.cooked = true;
          it.name = "焼いた" + it.name;
          ml.push(`加熱の壺で${it.name}になった！`);
          pot.contents.push(it);
        } else if (it.type === "food" && it.cooked) {
          burnFoodItem(it, ml);
          pot.contents.push(it);
        } else {
          ml.push(`${dnameRef(it)}を加熱の壺に入れた。`);
          pot.contents.push(it);
        }
      } else {
        applyPotEffect(pot, it, ml, dnameRef);
        pot.contents.push(it);
      }
      if (pot.contents.length >= pot.capacity)
        ml.push(`${itemDisplayName(pot, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいになった。`);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      if (pot.contents.length < pot.capacity) {
        setPutMode({ potIdx: p.inventory.indexOf(pot) });
        setPutMenuSel(0);
        setPutPage(0);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
      } else {
        setPutMode(null);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
      }
    },
    [putMode, endTurn],
  );
  const doBreakPot = useCallback(
    (idx) => {
      if (!sr.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[idx];
      if (!it || it.type !== "pot") return;
      p.inventory.splice(idx, 1);
      const ml = [];
      ml.push(`${dnameRef(it)}を割った！`);
      scatterPotContents(it, dg, p.x, p.y, p, ml, lu, dnameRef);
      endTurn(sr.current, p, ml);
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setSelIdx(null);
      setShowDesc(null);
      setShowInv(false);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [lu, endTurn],
  );
  invActRef.current = {
    use: doUseItem,
    drop: doDropItem,
    throw: doThrow,
    shoot: doShoot,
    wave: doWaveWand,
    breakWand: doBreakWand,
    breakPot: doBreakPot,
    put: doPutItem,
    useMarker: doUseMarker,
    readSpellbook: doReadSpellbook,
  };
  const execDirection = useCallback(
    (dx, dy) => {
      if (!throwMode || !sr.current) return;
      const { idx, mode } = throwMode;
      const { player: p, dungeon: dg } = sr.current;
      const ml = [];
      /* 遠投判定（投げ・射撃にのみ影響） */
      const _fcMode = (mode === "shoot_equipped" || mode === "shoot" || mode === "throw" || !mode)
        ? getFarcastMode(p.x, p.y, dg) : false;
      const _isFarcast = _fcMode === "farcast";
      const _isCursedFc = _fcMode === "cursed";
      const _maxRange = _isCursedFc ? 1 : _isFarcast ? 50 : 10;
      if (mode === "shoot_equipped") {
        if (!p.arrow || p.arrow.count <= 0) {
          ml.push("矢がない！");
          setThrowMode(null);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          return;
        }
        const _arItem = p.arrow;

        /* ── 石 / 魔法の石 専用処理 ── */
        if (_arItem.stone || _arItem.magicStone) {
          const _stName = _arItem.name;
          p.arrow.count--;
          if (_isFarcast) {
            /* 遠投：消滅 */
            ml.push(`${_stName}を投げた。${_stName}は消滅した。`);
          } else if (_arItem.magicStone) {
            /* 魔法の石：10マス以内の最近敵にホーミング */
            const _msDist = (mn) => Math.hypot(mn.x - p.x, mn.y - p.y);
            const _msTarget = [...dg.monsters]
              .filter(mn => Math.max(Math.abs(mn.x - p.x), Math.abs(mn.y - p.y)) <= 10)
              .sort((a, b) => _msDist(a) - _msDist(b))[0];
            ml.push(`${_stName}を投げた！`);
            if (!_msTarget) {
              ml.push(`近くに敵がいない！${_stName}は消えた。`);
            } else {
              const _msSureHit = (p.sureHitTurns || 0) > 0;
              const _msMiss = !_msSureHit && Math.random() >= 0.90;
              const _msDmg = (_arItem.atk || 5) + rng(0, 3);
              if (_msMiss) {
                ml.push(`${_stName}は${_msTarget.name}に外れ、足元に落ちた！`);
                const _msft = new Set(); const _msPfBag = [];
                setPitfallBag(_msPfBag);
                placeItemAt(dg, _msTarget.x, _msTarget.y, makeMagicStone(1), ml, _msft);
                clearPitfallBag();
                if (!sr.current.floors) sr.current.floors = {};
                processPitfallBag(_msPfBag, sr.current.floors, p.depth);
              } else {
                _msTarget.hp -= _msDmg;
                ml.push(`${_stName}が${_msTarget.name}にホーミング命中！${_msDmg}ダメージ！`);
                if (_msTarget.hp <= 0) { trackMonster(_msTarget); killMonster(_msTarget, dg, p, ml, lu); }
              }
            }
          } else {
            /* 通常の石：必ず3マス先（呪い遠投は1マス先）に着弾 */
            const _stRange = _isCursedFc ? 1 : 3;
            let _stLx = p.x, _stLy = p.y;
            for (let d = 1; d <= _stRange; d++) {
              const tx = p.x + dx * d, ty = p.y + dy * d;
              if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
              if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
              _stLx = tx; _stLy = ty;
            }
            const _stM = monsterAt(dg, _stLx, _stLy);
            const _stSureHit = (p.sureHitTurns || 0) > 0;
            const _stDmg = (_arItem.atk || 3) + rng(0, 3);
            ml.push(`${_stName}を投げた！`);
            if (_stM) {
              const _stMiss = !_stSureHit && Math.random() >= 0.90;
              if (_stMiss) {
                ml.push(`${_stName}は${_stM.name}に外れた！`);
                const _stft = new Set(); const _stPfBag = [];
                setPitfallBag(_stPfBag);
                placeItemAt(dg, _stLx, _stLy, makeStone(1), ml, _stft);
                clearPitfallBag();
                if (!sr.current.floors) sr.current.floors = {};
                processPitfallBag(_stPfBag, sr.current.floors, p.depth);
              } else {
                _stM.hp -= _stDmg;
                ml.push(`${_stName}が${_stM.name}に命中！${_stDmg}ダメージ！`);
                if (_stM.hp <= 0) { trackMonster(_stM); killMonster(_stM, dg, p, ml, lu); }
              }
            } else {
              /* 敵なし：着弾点に落ちる（罠も起動） */
              const _stft = new Set(); const _stPfBag = [];
              setPitfallBag(_stPfBag);
              placeItemAt(dg, _stLx, _stLy, makeStone(1), ml, _stft);
              clearPitfallBag();
              if (!sr.current.floors) sr.current.floors = {};
              processPitfallBag(_stPfBag, sr.current.floors, p.depth);
            }
          }
          if (p.arrow.count <= 0) {
            const _stEx = p.arrow;
            p.arrow = null;
            p.inventory = p.inventory.filter(i => i !== _stEx);
            ml.push(`${_stName}を投げ尽くした。`);
          }
          endTurn(sr.current, p, ml);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          setThrowMode(null);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        }

        /* ── 爆弾矢 専用処理 ── */
        if (_arItem.bombArrow) {
          const _baName = _arItem.name;
          const _baNF = (it) => itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames);
          p.arrow.count--;
          ml.push(`${_baName}を射った！`);
          if (_isFarcast) {
            ml.push(`${_baName}は消滅した。`);
          } else {
            let _baLx = p.x, _baLy = p.y;
            const _baMaxR = _isCursedFc ? 1 : 10;
            for (let d = 1; d <= _baMaxR; d++) {
              const tx = p.x + dx * d, ty = p.y + dy * d;
              if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
              if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
              const _baM = monsterAt(dg, tx, ty);
              if (_baM) {
                const _baDmg = (_arItem.atk || 6) + rng(1, 4);
                _baM.hp -= _baDmg;
                ml.push(`${_baName}が${_baM.name}に命中！${_baDmg}ダメージ！`);
                if (_baM.hp <= 0) { trackMonster(_baM); killMonster(_baM, dg, p, ml, lu); }
                _baLx = tx; _baLy = ty;
                break;
              }
              _baLx = tx; _baLy = ty;
            }
            ml.push("爆発！");
            doExplosion(_baLx, _baLy, dg, p, ml, _baNF, "爆弾矢の爆発");
          }
          if (p.arrow.count <= 0) {
            const _baEx = p.arrow;
            p.arrow = null;
            p.inventory = p.inventory.filter(i => i !== _baEx);
            ml.push(`${_baName}を使い切った。`);
          }
          endTurn(sr.current, p, ml);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          setThrowMode(null);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }

        const _arIsPoison = !!_arItem.poison;
        const _arIsPierce = !!_arItem.pierce;
        const _arName = _arItem.name || "矢";
        const _arPierceMode = _arIsPierce || _isFarcast;
        const _arMaxRange = _isCursedFc ? 1 : _arPierceMode ? 50 : 10;
        const _arDropItem = () => _arIsPierce ? makePiercingArrow(1) : _arIsPoison ? makePoisonArrow(1) : makeArrow(1);
        p.arrow.count--;
        const dmg = (_arItem.atk || 4) + rng(1, 4);
        let lx = p.x,
          ly = p.y,
          hit = false;
        for (let d = 1; d <= _arMaxRange; d++) {
          const tx = p.x + dx * d,
            ty = p.y + dy * d;
          if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
          if (!_arPierceMode && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
          const m = monsterAt(dg, tx, ty);
          if (m) {
            /* 矢の命中率90%（必中状態なら100%） */
            const _arSureHit = (p.sureHitTurns || 0) > 0;
            const _arMiss = !_arSureHit && Math.random() >= 0.90;
            if (_arMiss) {
              ml.push(`${_arName}は${m.name}に外れた！`);
              /* 矢はそのまま飛び続ける */
            } else {
              m.hp -= dmg;
              if (_arIsPoison) m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
              ml.push(`${_arName}が${m.name}に命中！${dmg}ダメージ！${_arIsPoison ? "攻撃力が半減した！" : ""}`);
              if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
              if (!_arPierceMode) { hit = true; break; }
              /* 貫通：飛び続ける */
            }
          }
          if (!_arPierceMode) {
            const bb = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
            if (bb) {
              ml.push(`${_arName}を射った。`);
              bigboxAddItem(bb, _arDropItem(), dg, ml);
              hit = true;
              break;
            }
          }
          lx = tx;
          ly = ty;
        }
        if (_arPierceMode || _isCursedFc) {
          ml.push(`${_arName}を射った。矢は消滅した。`);
          hit = true;
        }
        if (!hit) {
          ml.push(`${_arName}を射った。`);
          const ft = new Set();
          const _arPfBag = [];
          setPitfallBag(_arPfBag);
          placeItemAt(dg, lx, ly, _arDropItem(), ml, ft);
          clearPitfallBag();
          if (!sr.current.floors) sr.current.floors = {};
          processPitfallBag(_arPfBag, sr.current.floors, p.depth);
        }
        if (p.arrow.count <= 0) {
          const _ex = p.arrow;
          p.arrow = null;
          p.inventory = p.inventory.filter(i => i !== _ex);
          ml.push(`${_arName}を撃ち尽くした。`);
        }
      } else if (mode === "shoot") {
        const it = p.inventory[idx];
        if (!it) {
          setThrowMode(null);
          return;
        }
        shootArrow(p, dg, idx, dx, dy, ml, lu, bigboxAddItem);
        if (p.arrow && !p.inventory.includes(p.arrow)) p.arrow = null;
      } else if (mode === "wand_wave") {
        const it = p.inventory[idx];
        if (!it || it.type !== "wand") {
          setThrowMode(null);
          return;
        }
        const _wandBm = getBlessMultiplier(it);
        it.charges--;
        if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
          ml.push(`${dnameRef(it)}を振ったが、魔法が封印されている！[残${it.charges}回]`);
        } else {
          ml.push(`${dnameRef(it)}を振った！[残${it.charges}回]${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`);
          const _wandItemDName = (gi) => itemDisplayName(gi, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
          fireWandBolt(p, dg, it.effect, dx, dy, ml, lu, bigboxAddItem, _wandBm, _wandItemDName);
          if (p._pendingWarpUp) {
            delete p._pendingWarpUp;
            if (p.depth > 1) {
              const _warpNd = chgFloor(p, -1, true);
              if (_warpNd) sr.current.dungeon = _warpNd;
            } else {
              ml.push("ここは1階だ。何も起こらなかった。");
            }
          }
        }
        if (it.charges <= 0) {
          ml.push(`${dnameRef(it)}は力を失った...`);
          p.inventory.splice(idx, 1);
        }
      } else if (mode === "cast_spell") {
        const spellDef = SPELLS.find((s) => s.id === idx);
        if (!spellDef) { setThrowMode(null); return; }
        const _csLv = (p.spellLevels?.[spellDef.id] || 1);
        const _csCost = Math.max(1, 20 - (_csLv - 1) * 3);
        if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
          ml.push(`魔法が封印されている！MPは消費しない。`);
        } else if ((p.mp || 0) < _csCost) {
          ml.push(`MPが足りない！(必要:${_csCost} 現在:${p.mp || 0})`);
        } else {
          p.mp = (p.mp || 0) - _csCost;
          ml.push(`${spellDef.name}を唱えた！[MP -${_csCost}]`);
          castSpellBolt(p, dg, spellDef, dx, dy, ml, lu);
        }
      } else {
        const it = p.inventory[idx];
        if (!it) {
          setThrowMode(null);
          return;
        }
        if (p.weapon === it) p.weapon = null;
        if (p.armor  === it) p.armor  = null;
        if (p.arrow  === it) p.arrow  = null;

        /* ── インベントリから投げる石／魔法の石 専用処理 ── */
        if (it.type === "arrow" && (it.stone || it.magicStone)) {
          /* スタックから1個だけ使う */
          it.count--;
          if (it.count <= 0) p.inventory.splice(idx, 1);
          const _invStName = it.name;
          const _invStAtk = it.atk || (it.magicStone ? 5 : 3);
          if (_isFarcast) {
            ml.push(`${_invStName}を投げた。${_invStName}は消滅した。`);
          } else if (it.magicStone) {
            const _msDist2 = (mn) => Math.hypot(mn.x - p.x, mn.y - p.y);
            const _msTarget2 = [...dg.monsters]
              .filter(mn => Math.max(Math.abs(mn.x - p.x), Math.abs(mn.y - p.y)) <= 10)
              .sort((a, b) => _msDist2(a) - _msDist2(b))[0];
            ml.push(`${_invStName}を投げた！`);
            if (!_msTarget2) {
              ml.push(`近くに敵がいない！${_invStName}は消えた。`);
            } else {
              const _msMiss2 = !((p.sureHitTurns || 0) > 0) && Math.random() >= 0.90;
              const _msDmg2 = _invStAtk + rng(0, 3);
              if (_msMiss2) {
                ml.push(`${_invStName}は${_msTarget2.name}に外れ、足元に落ちた！`);
                const _msft2 = new Set(); const _msPfBag2 = [];
                setPitfallBag(_msPfBag2);
                placeItemAt(dg, _msTarget2.x, _msTarget2.y, makeMagicStone(1), ml, _msft2);
                clearPitfallBag();
                if (!sr.current.floors) sr.current.floors = {};
                processPitfallBag(_msPfBag2, sr.current.floors, p.depth);
              } else {
                _msTarget2.hp -= _msDmg2;
                ml.push(`${_invStName}が${_msTarget2.name}にホーミング命中！${_msDmg2}ダメージ！`);
                if (_msTarget2.hp <= 0) { trackMonster(_msTarget2); killMonster(_msTarget2, dg, p, ml, lu); }
              }
            }
          } else {
            const _stRange2 = _isCursedFc ? 1 : 3;
            let _stLx2 = p.x, _stLy2 = p.y;
            for (let d = 1; d <= _stRange2; d++) {
              const tx = p.x + dx * d, ty = p.y + dy * d;
              if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
              if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
              _stLx2 = tx; _stLy2 = ty;
            }
            const _stM2 = monsterAt(dg, _stLx2, _stLy2);
            const _stDmg2 = _invStAtk + rng(0, 3);
            ml.push(`${_invStName}を投げた！`);
            if (_stM2) {
              const _stMiss2 = !((p.sureHitTurns || 0) > 0) && Math.random() >= 0.90;
              if (_stMiss2) {
                ml.push(`${_invStName}は${_stM2.name}に外れた！`);
                const _stft2 = new Set(); const _stPfBag2 = [];
                setPitfallBag(_stPfBag2);
                placeItemAt(dg, _stLx2, _stLy2, makeStone(1), ml, _stft2);
                clearPitfallBag();
                if (!sr.current.floors) sr.current.floors = {};
                processPitfallBag(_stPfBag2, sr.current.floors, p.depth);
              } else {
                _stM2.hp -= _stDmg2;
                ml.push(`${_invStName}が${_stM2.name}に命中！${_stDmg2}ダメージ！`);
                if (_stM2.hp <= 0) { trackMonster(_stM2); killMonster(_stM2, dg, p, ml, lu); }
              }
            } else {
              const _stft2 = new Set(); const _stPfBag2 = [];
              setPitfallBag(_stPfBag2);
              placeItemAt(dg, _stLx2, _stLy2, makeStone(1), ml, _stft2);
              clearPitfallBag();
              if (!sr.current.floors) sr.current.floors = {};
              processPitfallBag(_stPfBag2, sr.current.floors, p.depth);
            }
          }
          endTurn(sr.current, p, ml);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          setThrowMode(null);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        }

        /* ── 爆弾矢 (道具欄から) 専用処理 ── */
        if (it.type === "arrow" && it.bombArrow) {
          it.count--;
          if (it.count <= 0) p.inventory.splice(idx, 1);
          const _baName2 = it.name;
          const _baNF2 = (gi) => itemDisplayName(gi, sr.current.fakeNames, sr.current.ident, sr.current.nicknames);
          ml.push(`${_baName2}を射った！`);
          if (_isFarcast) {
            ml.push(`${_baName2}は消滅した。`);
          } else {
            let _baLx2 = p.x, _baLy2 = p.y;
            const _baMaxR2 = _isCursedFc ? 1 : 10;
            for (let d = 1; d <= _baMaxR2; d++) {
              const tx = p.x + dx * d, ty = p.y + dy * d;
              if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
              if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
              const _baM2 = monsterAt(dg, tx, ty);
              if (_baM2) {
                const _baDmg2 = (it.atk || 6) + rng(1, 4);
                _baM2.hp -= _baDmg2;
                ml.push(`${_baName2}が${_baM2.name}に命中！${_baDmg2}ダメージ！`);
                if (_baM2.hp <= 0) { trackMonster(_baM2); killMonster(_baM2, dg, p, ml, lu); }
                _baLx2 = tx; _baLy2 = ty;
                break;
              }
              _baLx2 = tx; _baLy2 = ty;
            }
            ml.push("爆発！");
            doExplosion(_baLx2, _baLy2, dg, p, ml, _baNF2, "爆弾矢の爆発");
          }
          endTurn(sr.current, p, ml);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          setThrowMode(null);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }

        p.inventory.splice(idx, 1);
        if (it.type === "potion") {
          let lx = p.x, ly = p.y, sprHit = null;
          const _potHits = []; /* 遠投時：軌道上のモンスターを全て記録 */
          for (let d = 1; d <= _maxRange; d++) {
            const tx = p.x + dx * d, ty = p.y + dy * d;
            if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
            if (!_isFarcast && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
            const m = monsterAt(dg, tx, ty);
            if (m) {
              if (_isFarcast) {
                /* 遠投：splash せず個別に薬効果を適用、貫通 */
                _potHits.push(m);
              } else {
                lx = tx; ly = ty; break;
              }
            }
            if (!_isFarcast) {
              const spr = dg.springs?.find((s) => s.x === tx && s.y === ty);
              if (spr) { lx = tx; ly = ty; sprHit = spr; break; }
              const bb3 = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
              if (bb3) { lx = tx; ly = ty; sprHit = bb3; break; }
            }
            lx = tx; ly = ty;
          }
          ml.push(`${dnameRef(it)}を投げた！`);
          if (_isFarcast) {
            /* 遠投：軌道上の全モンスターに個別に効果 */
            if (_potHits.length > 0) {
              for (const _pm of _potHits) {
                applyPotionEffect(it.effect, it.value || 0, "monster", _pm, dg, p, ml, lu, it.blessed || false, it.cursed || false);
                if (_pm.hp <= 0) { trackMonster(_pm); killMonster(_pm, dg, p, ml, lu); }
              }
            }
            ml.push(`${dnameRef(it)}は消滅した。`);
          } else if (_isCursedFc) {
            /* 呪い遠投：1マスで落ちてsplash */
            if (it.effect === "water") applyWaterSplash(dg, lx, ly, it.blessed || false, it.cursed || false, ml);
            else splashPotion(dg, lx, ly, it.effect, it.value || 0, p, ml, lu, it.blessed || false, it.cursed || false, dnameRef);
          } else if (sprHit?.kind) {
            bigboxAddItem(sprHit, it, dg, ml);
          } else if (sprHit && !sprHit.kind) {
            soakItemIntoSpring(sprHit, it, ml, dg, dnameRef);
          } else if (!sprHit) {
            if (it.effect === "water") applyWaterSplash(dg, lx, ly, it.blessed || false, it.cursed || false, ml);
            else splashPotion(dg, lx, ly, it.effect, it.value || 0, p, ml, lu, it.blessed || false, it.cursed || false, dnameRef);
          }
        } else if (it.type === "pot") {
          let lx = p.x, ly = p.y, sprHit = null;
          for (let d = 1; d <= _maxRange; d++) {
            const tx = p.x + dx * d, ty = p.y + dy * d;
            if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
            if (!_isFarcast && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
            const m = monsterAt(dg, tx, ty);
            if (m) {
              const _potSureHit = (p.sureHitTurns || 0) > 0;
              const _potMiss = !_isFarcast && !_potSureHit && Math.random() >= 0.90;
              if (_potMiss) {
                /* 外れ：敵の足元に落ちて壺の内容物が散らばる */
                lx = tx; ly = ty;
                ml.push(`${dnameRef(it)}は${m.name}に外れ、足元に落ちた！`);
                const _ptTrap = dg.traps.find(t => t.x === tx && t.y === ty);
                if (_ptTrap) fireTrapItem(_ptTrap, it, dg, tx, ty, ml, new Set(), p, dnameRef);
                break;
              }
              const td = 3 + rng(0, 3);
              m.hp -= td;
              ml.push(`${dnameRef(it)}が${m.name}に命中！${td}ダメージ！`);
              if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
              if (!_isFarcast) { lx = tx; ly = ty; break; }
            }
            if (!_isFarcast) {
              const spr = dg.springs?.find((s) => s.x === tx && s.y === ty);
              if (spr) { lx = tx; ly = ty; sprHit = spr; break; }
              const bb4 = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
              if (bb4) { lx = tx; ly = ty; sprHit = bb4; break; }
            }
            lx = tx; ly = ty;
          }
          ml.push(`${dnameRef(it)}を投げた！`);
          if (_isFarcast) {
            /* 遠投：壺は消滅（中身もろとも） */
            ml.push(`${dnameRef(it)}は消滅した。`);
          } else if (sprHit?.kind) {
            bigboxAddItem(sprHit, it, dg, ml);
          } else if (sprHit && !sprHit.kind) {
            soakItemIntoSpring(sprHit, it, ml, dg, dnameRef);
          } else {
            scatterPotContents(it, dg, lx, ly, p, ml, lu, dnameRef);
          }
        } else {
          const td =
            (it.type === "weapon"
              ? it.atk || 3
              : it.type === "arrow"
                ? it.atk * Math.min(it.count, 5) + it.count
                : 3) + rng(0, 3);
          let lx = p.x, ly = p.y, hit = false, sprHit = null;
          for (let d = 1; d <= _maxRange; d++) {
            const tx = p.x + dx * d, ty = p.y + dy * d;
            if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
            if (!_isFarcast && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
            const m = monsterAt(dg, tx, ty);
            if (m) {
              const _thSureHit = (p.sureHitTurns || 0) > 0;
              const _thMiss = !_isFarcast && !_thSureHit && Math.random() >= 0.90;
              const lb = it.type === "arrow" ? ((it.stone || it.magicStone) ? `${it.name}(${it.count}個)` : `矢の束(${it.count}本)`) : dnameRef(it);
              if (_thMiss) {
                /* 外れ：敵の足元に落ちる */
                lx = tx; ly = ty; hit = true;
                ml.push(`${lb}は${m.name}に外れ、足元に落ちた！`);
                const _thTrap = dg.traps.find(t => t.x === tx && t.y === ty);
                if (_thTrap) fireTrapItem(_thTrap, it, dg, tx, ty, ml, new Set(), p, dnameRef);
                break;
              }
              m.hp -= td;
              ml.push(`${lb}が${m.name}に命中！${td}ダメージ！`);
              if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
              if (!_isFarcast) { lx = tx; ly = ty; hit = true; break; }
            }
            if (!_isFarcast) {
              const spr = dg.springs?.find((s) => s.x === tx && s.y === ty);
              if (spr) { lx = tx; ly = ty; sprHit = spr; break; }
              const bb5 = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
              if (bb5) { lx = tx; ly = ty; sprHit = bb5; break; }
            }
            lx = tx; ly = ty;
          }
          if (_isFarcast) {
            const lb = it.type === "arrow" ? `矢の束(${it.count}本)` : dnameRef(it);
            ml.push(`${lb}を投げた。${lb}は消滅した。`);
          } else if (!hit) {
            const lb = it.type === "arrow" ? `矢の束(${it.count}本)` : dnameRef(it);
            ml.push(`${lb}を投げた。`);
            if (sprHit?.kind) {
              bigboxAddItem(sprHit, it, dg, ml);
            } else if (sprHit && !sprHit.kind) {
              soakItemIntoSpring(sprHit, it, ml, dg, dnameRef);
            } else if (it.type === "bottle") {
              ml.push(`${it.name}は割れてしまった！`);
            } else {
              const ft = new Set();
              const _thPfBag = [];
              setPitfallBag(_thPfBag);
              placeItemAt(dg, lx, ly, it, ml, ft);
              clearPitfallBag();
              if (!sr.current.floors) sr.current.floors = {};
              processPitfallBag(_thPfBag, sr.current.floors, p.depth);
            }
          }
        }
      }
      endTurn(sr.current, p, ml);
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setThrowMode(null);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [throwMode, lu, endTurn, chgFloor],
  );
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
  const B = ({ label, onClick, w = 40, h = 40, fs = 15, style: s = {} }) => (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        width: w,
        height: h,
        background: "#181828",
        color: "#8f8",
        border: "1px solid #3a3a4a",
        borderRadius: 8,
        fontSize: fs,
        fontWeight: "bold",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        touchAction: "manipulation",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        ...s,
      }}
    >
      {label}
    </button>
  );
  const AB = ({ label, sub, onClick, color = "#8f8" }) => (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        flex: 1,
        minWidth: 38,
        height: 36,
        background: "#181828",
        color,
        border: "1px solid #3a3a4a",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: "bold",
        cursor: "pointer",
        touchAction: "manipulation",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 3px",
      }}
    >
      <span style={{ fontSize: 15 }}>{label}</span>
      {sub && <span style={{ fontSize: 8, opacity: 0.5 }}>{sub}</span>}
    </button>
  );
  const tbs = {
    background: "#2a1a1a",
    border: "1px solid #5a3a3a",
    color: "#f88",
  };
  const dbs = {
    background: "#1a1a2a",
    border: "1px solid #4a3a6a",
    color: "#c8f",
  };
  const DPad = ({ onClick }) => {
    const ds = throwMode ? tbs : dashMode ? dbs : {};
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 2 }}>
          <B
            label="↖"
            onClick={() => onClick(-1, -1)}
            w={32}
            h={32}
            fs={12}
            style={facingMode ? { background: "#2a2a0a", border: "1px solid #aa0" } : ds}
          />
          <B label="↑" onClick={() => onClick(0, -1)} style={facingMode ? { background: "#2a2a0a", border: "1px solid #aa0" } : ds} />
          <B
            label="↗"
            onClick={() => onClick(1, -1)}
            w={32}
            h={32}
            fs={12}
            style={facingMode ? { background: "#2a2a0a", border: "1px solid #aa0" } : ds}
          />
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <B
            label="←"
            onClick={() => onClick(-1, 0)}
            style={
              facingMode
                ? { background: "#2a2a0a", border: "1px solid #aa0" }
                : ds
            }
          />
          <B
            label={facingMode ? "✕" : throwMode ? "✕" : dashMode ? "⇒" : "向"}
            fs={facingMode || throwMode || dashMode ? 15 : 11}
            onClick={() => {
              if (facingMode) {
                setFacingMode(false);
              } else if (throwMode) {
                setThrowMode(null);
                setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
              } else if (dashMode) {
                setDashMode(false);
              } else {
                setFacingMode((f) => !f);
              }
            }}
            style={
              facingMode
                ? {
                    background: "#2a2a0a",
                    border: "1px solid #aa0",
                    color: "#ff4",
                  }
                : throwMode
                  ? {
                      background: "#1a1a1a",
                      border: "1px solid #555",
                      color: "#888",
                    }
                  : dashMode
                    ? {
                        background: "#1a1a2a",
                        border: "1px solid #4a3a6a",
                        color: "#c8f",
                      }
                    : { opacity: 0.7 }
            }
          />
          <B
            label="→"
            onClick={() => onClick(1, 0)}
            style={
              facingMode
                ? { background: "#2a2a0a", border: "1px solid #aa0" }
                : ds
            }
          />
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <B
            label="↙"
            onClick={() => onClick(-1, 1)}
            w={32}
            h={32}
            fs={12}
            style={facingMode ? { background: "#2a2a0a", border: "1px solid #aa0" } : ds}
          />
          <B label="↓" onClick={() => onClick(0, 1)} style={facingMode ? { background: "#2a2a0a", border: "1px solid #aa0" } : ds} />
          <B
            label="↘"
            onClick={() => onClick(1, 1)}
            w={32}
            h={32}
            fs={12}
            style={facingMode ? { background: "#2a2a0a", border: "1px solid #aa0" } : ds}
          />
        </div>
      </div>
    );
  };
  /* 表示名ヘルパー (gsを参照) */
  const dname = (it) => itemDisplayName(it, gs?.fakeNames, gs?.ident, gs?.nicknames);
  /* callbacks内で sr.current を参照するバージョン */
  const dnameRef = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);

  const iLabel = (it) => {
    const _ep = gs?.player;
    const _eq = _ep?.weapon === it ? "【武器】" : _ep?.armor === it ? "【防具】" : _ep?.arrow === it ? "【矢】" : "";
    const _key = getIdentKey(it);
    const _isIdent = !_key || gs?.ident?.has(_key);
    /* 識別対象アイテムはfullIdentまたはbcKnownのみ祝呪表示、それ以外(武器・防具等)は常に表示 */
    const _needFullIdent = !!_key || it.type === 'weapon' || it.type === 'armor';
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
      if (!it.cooked) s += " 生";
      if (it.potionEffects?.length) s += " ★";
      s += ")";
    } else if (it.type === "wand")   s += it.fullIdent ? ` [${it.charges}回]` : "";
    else if (it.type === "marker") s += ` [${it.charges}回]`;
    else if (it.type === "pen")    s += it.fullIdent ? ` [${it.charges || 0}回]` : "";
    else if (it.type === "pot")    s += _isIdent ? ` [${it.contents?.length || 0}/${it.capacity}]` : "";
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
              {p.atk + (p.weapon?.atk || 0)}/
              <span style={{ color: "#aaa", fontSize: "0.9em" }}>{p.atk + (p.poisonAtkLoss || 0) + (p.weapon?.atk || 0)}</span>
            </span>
          ) : (
            <span style={{ color: "#fa0" }}>{p.atk + (p.weapon?.atk || 0)}</span>
          )}
        </span>{" "}
        <span>
          防:
          <span style={{ color: "#08f" }}>{p.def + (p.armor?.def || 0)}</span>
        </span>{" "}
        <span>
          食:
          <span style={{ color: hunP > 40 ? "#0a0" : "#f80" }}>
            {Math.floor(hunP)}%
          </span>
        </span>{" "}
        <span style={{ color: "#ffd700" }}>${p.gold}</span>{" "}
        {p.arrow && (
          <span style={{ color: "#dda050" }}>{p.arrow.stone ? "石" : p.arrow.magicStone ? "魔法の石" : "矢"}:{p.arrow.count}</span>
        )}{" "}
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
                  setSelIdx(null); setInvMenuSel(null); setShowDesc(null);
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
                  if (dy !== 0 && dx === 0) setBigboxMenuSel((p) => (p + dy + 2) % 2);
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
                    if (inv.length > 0) setSpringMenuSel((s) => (s + dy + 10) % 10);
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
                  onClick={() => { if (revealMode || showInv || lookMode) return; setSpellListMode((f) => !f); setSpellMenuSel(0); }}
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
      <SpellListModal mode={spellListMode} setMode={setSpellListMode} gs={gs} sr={sr} setGs={setGs} setMsgs={setMsgs} menuSel={spellMenuSel} setMenuSel={setSpellMenuSel} setIdentifyMode={setIdentifyMode} setShowInv={setShowInv} setSelIdx={setSelIdx} setShowDesc={setShowDesc} setThrowMode={setThrowMode} endTurn={endTurn} lu={lu} mobile={mobile} />{" "}
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
