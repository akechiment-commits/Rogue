import { useCallback, useEffect, useRef } from "react";
import { MW, MH, T, rng, uid, refreshFOV, getShops, getVisitedFloors } from "./utils.js";
import { itemDisplayName } from "./render.js";
import {
  ITEMS, SPELLBOOKS, SPELLS, WANDS, POTS, TRAPS, BB_TYPES, RINGS,
  RAW_FOODS, COOKED_FOODS,
  WEAPON_ABILITIES, ARMOR_ABILITIES,
  itemPrice, placeItemAt, applySpellEffect, inMagicSealRoom,
  getIdentKey, randPotCapacity, gemSellPrice, sellInventoryItemsToShop,
  extractPotContents, scatterPotContents,
} from "./items.js";
import { MONS, MON_LEVELS, BOSSES, INTERMEDIATE_BOSSES } from "./monsters.js";
import { prepareLastFloor } from "./dungeon.js";
import { getDiscoveries, trackBigbox, trackItem } from "./DiscoveryTracker.js";
import { isKeyUp, isKeyDown, isKeyLeft, isKeyRight } from "./inputKeys.js";
import { listFloorInventoryEntries, floorEntryRole, FLOOR_INFO_ROLES, floorUseLabel, isNonSteppableFloorTrap } from "./floorInventory.js";
import { pushPlayerTeleportAnim } from "./animEvents.js";
import { isScrollTargetCandidate } from "./scrollTargetRules.js";
import { isBigboxKindIdentified, markBigboxKindIdentified } from "./GameHelpers.js";

/** KeyboardEvent.DOM_KEY_LOCATION_NUMPAD */
const LOC_NUMPAD = 3;

/** window 上の単一 keydown（HMR で多重登録されても差し替え） */
const ROGUE_KD = "__rogueKeydownV2";

/** テンキー由来か（NumLock OFF で key が Arrow* になっても code/location で判定） */
function isNumpadEvent(e) {
  return e.location === LOC_NUMPAD || !!(e.code && e.code.startsWith("Numpad"));
}

/**
 * テンキー1押しで OS/ブラウザが Numpad* と Arrow* など複数 keydown を飛ばすことがある。
 * 同一方向の連続イベントを 1 回に潰す（見渡す・インベントリ・ダンジョン移動すべて共通）。
 */
let _dirGateT = 0;
let _dirGateFamily = "";

function directionFamily(e) {
  const c = e.code || "";
  const k = (e.key || "").toLowerCase();
  if (c === "Numpad8" || k === "arrowup") return "up";
  if (c === "Numpad2" || k === "arrowdown") return "down";
  if (c === "Numpad4" || k === "arrowleft") return "left";
  if (c === "Numpad6" || k === "arrowright") return "right";
  if (c === "Numpad7") return "upleft";
  if (c === "Numpad9") return "upright";
  if (c === "Numpad1") return "downleft";
  if (c === "Numpad3") return "downright";
  if (c === "Numpad5") return "wait";
  return null;
}

/** @returns {boolean} true = このイベントは捨てる */
function isDuplicateDirectionEvent(e) {
  const fam = directionFamily(e);
  if (!fam) return false;
  const now = performance.now();
  /* 押しっぱなしの key repeat は歩行用に通す（極端な連打だけ間引き） */
  if (e.repeat) {
    if (now - _dirGateT < 50) return true;
    _dirGateFamily = fam;
    _dirGateT = now;
    return false;
  }
  /* 同一方向の非リピートが 150ms 以内に複数 = テンキーの多重 keydown */
  if (fam === _dirGateFamily && now - _dirGateT < 150) return true;
  _dirGateFamily = fam;
  _dirGateT = now;
  return false;
}

/* テスト用に export */
export { isDuplicateDirectionEvent, directionFamily };

export function useKeyHandler({
  // refs
  sr, shiftRef, aRef, arrowHeldRef, execRef, invActRef, doMarkerWriteRef, bigboxRef, gachaRef, gachaDrawRef, altarRef, merchantRef, dropModeRef, revealModeRef, shopModeRef, identifyCancelRef, gameOverInventoryRef,
  // state values
  gs, dead, showEnding, showScores, gameOverSel, gameOverView, endingSel = 0, endingView, throwMode, showInv, selIdx, invPage, invMenuSel,
  facingMode, springMode, springMenuSel, springPage, wishMode, putMode, putMenuSel, putPage,
  markerMode, markerMenuSel, markerPage = 0, spellListMode, spellMenuSel, spellPage, shopMode, shopMenuSel, pastIdent = [], discoveredItems = {},
  bigboxMode, bigboxMenuSel, bigboxPage, gachaMode, gachaMenuSel, altarMode, altarMenuSel, merchantMode, merchantMenuSel, nicknameMode, identifyMode, revealMode,
  tpSelectMode, floorSelectMode, lookMode, mapMode, debugSpellMode, debugSpellMenuSel,
  msgLogMode, msgLogScrollTop, msgsRef,
  showSign, miniTip,
  exitHubConfirm, exitHubSel,
  gameOverCanReturn, performGameOverReturnToHub, onDismissEnding,
  // state setters
  setGs, setMsgs, setGameOverSel, setGameOverView, setEndingSel, setEndingView, setShowScores, setFloorSelectMode, setTpSelectMode,
  setLookMode, setMapMode, setShowInv, setSelIdx, setInvMenuSel, setShowDesc, setNicknameMode,
  setNicknameInput, setInvPage, setDropMode, setFacingMode, setThrowMode,
  setSpringMode, setSpringMenuSel, setSpringPage, setPutMode, setPutMenuSel, setPutPage,
  setMarkerMode, setMarkerMenuSel, setMarkerPage, setSpellListMode, setSpellMenuSel, setSpellPage, setShopMode,
  setShopMenuSel, setBigboxMode, setBigboxMenuSel, setBigboxPage, setGachaMode, setGachaMenuSel, setAltarMode, setAltarMenuSel, setMerchantMode, setMerchantMenuSel, setIdentifyMode,
  setRevealMode, setDebugSpellMode, setDebugSpellMenuSel,
  setMsgLogMode, setMsgLogScrollTop,
  setShowSign, closeMiniTip,
  setExitHubConfirm, setExitHubSel, performExitToHub,
  // callbacks
  init, act, doDash, doExamineFront, endTurn, springDrink, springDoSoak,
  bigboxPutItem, sortInventory, getLookDesc, lu, doOfferFood, doMerchantBuy, doMerchantSell,
}) {
  /* handleKey を ref 経由で呼び、listener を1本に固定 */
  const handleKeyRef = useRef(null);

  const canUse = (it) =>
    ["potion", "food", "scroll", "weapon", "armor", "arrow", "ring", "pot", "pen"].includes(it.type);
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
  const handleKey = useCallback(
    (e) => {
      const k = e.key.toLowerCase();
      if (k === "shift") {
        shiftRef.current = true;
      }
      if (k === "a") {
        aRef.current = true;
      }
      /* テンキー多重 keydown をここで落とす（見渡す・メニュー・歩行すべて） */
      if (isDuplicateDirectionEvent(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (showEnding) {
        e.preventDefault();
        if (showScores) {
          if (k === "escape" || k === "enter" || k === " " || k === "z") setShowScores(false);
          return;
        }
        if (endingView === "inventory" && (isKeyUp(e) || isKeyDown(e) || isKeyLeft(e) || isKeyRight(e))) {
          const _scrollDir = isKeyUp(e) || isKeyLeft(e) ? -1 : 1;
          const _inventoryEl = gameOverInventoryRef?.current;
          if (_inventoryEl) _inventoryEl.scrollTop = Math.max(0, _inventoryEl.scrollTop + _scrollDir * 96);
          return;
        }
        if (endingView) {
          setEndingView(null);
          return;
        }
        if (isKeyUp(e) || isKeyLeft(e)) {
          setEndingSel((p) => (p - 1 + 4) % 4);
        } else if (isKeyDown(e) || isKeyRight(e)) {
          setEndingSel((p) => (p + 1) % 4);
        } else if (k === "enter" || k === " " || k === "z") {
          if (endingSel === 0) setShowScores(true);
          else if (endingSel === 1) setEndingView("map");
          else if (endingSel === 2) setEndingView("inventory");
          else onDismissEnding?.();
        }
        return;
      }
      if (miniTip) {
        if (k === "escape" || k === "x" || k === "enter" || k === " " || k === "z") {
          e.preventDefault(); closeMiniTip?.();
        }
        return;
      }
      if (showSign) {
        if (k === "escape" || k === "x" || k === "enter" || k === " " || k === "z") {
          e.preventDefault(); setShowSign(null);
        }
        return;
      }
      if (exitHubConfirm) {
        if (isKeyUp(e) || isKeyLeft(e)) {
          e.preventDefault(); setExitHubSel(0);
        } else if (isKeyDown(e) || isKeyRight(e)) {
          e.preventDefault(); setExitHubSel(1);
        } else if (k === "enter" || k === " " || k === "z") {
          e.preventDefault();
          if (exitHubSel === 0) performExitToHub();
          else setExitHubConfirm(false);
        } else if (k === "escape" || k === "x") {
          e.preventDefault(); setExitHubConfirm(false);
        }
        return;
      }
      if (dead) {
        if (gameOverView === "inventory" && (isKeyUp(e) || isKeyDown(e) || isKeyLeft(e) || isKeyRight(e))) {
          e.preventDefault();
          const _scrollDir = isKeyUp(e) || isKeyLeft(e) ? -1 : 1;
          const _inventoryEl = gameOverInventoryRef?.current;
          if (_inventoryEl) _inventoryEl.scrollTop = Math.max(0, _inventoryEl.scrollTop + _scrollDir * 96);
          return;
        }
        if (gameOverView) {
          e.preventDefault();
          setGameOverView(null);
          return;
        }
        if (!showScores) {
          const _goCount = gameOverCanReturn ? 5 : 4;
          if (isKeyUp(e) || isKeyLeft(e)) {
            e.preventDefault();
            setGameOverSel((p) => (p - 1 + _goCount) % _goCount);
          } else if (isKeyDown(e) || isKeyRight(e)) {
            e.preventDefault();
            setGameOverSel((p) => (p + 1) % _goCount);
          } else if (k === "enter" || k === " " || k === "z") {
            e.preventDefault();
            if (gameOverSel === 0) init();
            else if (gameOverSel === 1) setShowScores(true);
            else if (gameOverSel === 2) { setShowScores(false); setGameOverView("map"); }
            else if (gameOverSel === 3) { setShowScores(false); setGameOverView("inventory"); }
            else if (gameOverSel === 4) performGameOverReturnToHub?.();
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
        const _visited = getVisitedFloors(sr.current, _fsp.depth);
        const _vIdx = Math.max(0, _visited.indexOf(floorSelectMode.sel));
        const isUp   = k === "arrowup"   || e.code === "Numpad8";
        const isDown = k === "arrowdown" || e.code === "Numpad2";
        if (isUp) {
          if (_vIdx > 0) setFloorSelectMode({ sel: _visited[_vIdx - 1] });
          return;
        }
        if (isDown) {
          if (_vIdx < _visited.length - 1) setFloorSelectMode({ sel: _visited[_vIdx + 1] });
          return;
        }
        if (k === "z" || k === "enter") {
          const _f = floorSelectMode.sel;
          if (!_visited.includes(_f)) {
            setMsgs((prev) => [...prev.slice(-80), "まだ訪れていない階層には飛べない！"]);
            return;
          }
          const _ml = [];
          if (!sr.current.floors) sr.current.floors = {};
          sr.current.floors[_fsp.depth] = sr.current.dungeon;
          const _saved = sr.current.floors[_f];
          if (!_saved) {
            setMsgs((prev) => [...prev.slice(-80), "その階層のデータがない！"]);
            return;
          }
          const _d = _saved;
          delete sr.current.floors[_f];
          const _maxDTp = sr.current.maxDepth;
          if (_maxDTp !== null && _f >= _maxDTp && !_d.isLastFloor) {
            prepareLastFloor(_d, sr.current.dungeonType || "beginner");
          }
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
          const _tpFromX = p.x, _tpFromY = p.y;
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
          pushPlayerTeleportAnim(_tpFromX, _tpFromY, p.x, p.y);
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
      if (msgLogMode) {
        e.preventDefault();
        const _mlTotal = msgsRef.current.length;
        const _mlMax = Math.max(0, _mlTotal - 20);
        const isUpML = k === "arrowup" || e.code === "Numpad8";
        const isDownML = k === "arrowdown" || e.code === "Numpad2";
        if (isUpML) { setMsgLogScrollTop((s) => Math.max(0, s - 1)); return; }
        if (isDownML) { setMsgLogScrollTop((s) => Math.min(_mlMax, s + 1)); return; }
        if (k === "m" || k === "x" || k === "escape") { setMsgLogMode(false); return; }
        return;
      }
      if (mapMode) {
        e.preventDefault();
        if (k === " " || k === "x" || k === "escape") setMapMode(null);
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
          const _ldx = ncx - cx, _ldy = ncy - cy;
          if (aRef.current) {
            /* ルック・ダッシュ：通常ダッシュと同じ停止条件でカーソルを移動 */
            const _ldk = (x, y) => y * MW + x;
            const _lRoomSet = new Set();
            for (const r of (dg2.rooms || []))
              for (let ry = r.y; ry < r.y + r.h; ry++)
                for (let rx = r.x; rx < r.x + r.w; rx++)
                  _lRoomSet.add(_ldk(rx, ry));
            const _lItemMap = new Map();
            for (const i of (dg2.items || []))
              if (!_lItemMap.has(_ldk(i.x, i.y))) _lItemMap.set(_ldk(i.x, i.y), i);
            const _lGetPerps = (x, y) =>
              (_ldx !== 0 ? [[0,-1],[0,1]] : [[-1,0],[1,0]])
                .filter(([sdx, sdy]) => {
                  const sx = x + sdx, sy = y + sdy;
                  return sx >= 0 && sx < MW && sy >= 0 && sy < MH &&
                    dg2.map[sy][sx] !== T.WALL && dg2.map[sy][sx] !== T.BWALL;
                }).length;
            const _lStartInWall = dg2.map[cy]?.[cx] === T.WALL || dg2.map[cy]?.[cx] === T.BWALL;
            const _lStartInRoom = _lRoomSet.has(_ldk(cx, cy));
            let _lcx = cx, _lcy = cy, _lPrevPerps = _lGetPerps(cx, cy);
            for (let _ls = 0; _ls < 50; _ls++) {
              const nx = _lcx + _ldx, ny = _lcy + _ldy;
              if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) break;
              const _nTile = dg2.map[ny]?.[nx];
              if (_nTile === T.WALL || _nTile === T.BWALL) break;
              _lcx = nx; _lcy = ny;
              /* 壁内スタート：最初の床タイルで停止 */
              if (_lStartInWall) break;
              /* 通常停止条件 */
              if (_lItemMap.has(_ldk(_lcx, _lcy))) break;
              if (dg2.traps?.find(t => t.x === _lcx && t.y === _lcy)) break;
              if (dg2.map[_lcy][_lcx] === T.SD || dg2.map[_lcy][_lcx] === T.SU) break;
              if (dg2.springs?.find(s => s.x === _lcx && s.y === _lcy)) break;
              if (dg2.bigboxes?.find(b => b.x === _lcx && b.y === _lcy)) break;
              const _lCurInRoom = _lRoomSet.has(_ldk(_lcx, _lcy));
              const _lCurPerps = _lGetPerps(_lcx, _lcy);
              const _lfnx = _lcx + _ldx, _lfny = _lcy + _ldy;
              const _lNextBlocked = _lfnx < 0 || _lfnx >= MW || _lfny < 0 || _lfny >= MH ||
                dg2.map[_lfny]?.[_lfnx] === T.WALL || dg2.map[_lfny]?.[_lfnx] === T.BWALL;
              if (_lStartInRoom) {
                if (!_lCurInRoom || _lNextBlocked) break;
              } else {
                if ((_lCurPerps > _lPrevPerps && _lCurPerps > 0) || _lNextBlocked) break;
              }
              _lPrevPerps = _lCurPerps;
            }
            if (_lcx !== cx || _lcy !== cy) {
              setLookMode({ cx: _lcx, cy: _lcy });
              const _ldesc = getLookDesc(_lcx, _lcy, dg2);
              if (_ldesc) setMsgs(prev => [...prev.slice(-80), `[見渡す] ${_ldesc}`]);
            }
            return;
          }
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
        const _p2 = sr.current?.player;
        const _dg2 = sr.current?.dungeon;
        const _fl2 = _dg2 && _p2 ? listFloorInventoryEntries(_dg2, _p2.x, _p2.y, {
          allBcKnown: !!sr.current?.allBcKnown,
          bbFakeNames: sr.current?.bbFakeNames,
          ident: sr.current?.ident,
          identifiedBigboxes: sr.current?.identifiedBigboxes,
        }) : { items: [], traps: [], all: [] };
        const _flItems2 = _fl2.items;
        const _flTraps2 = _fl2.traps;
        const _flAll2 = _fl2.all;
        const _hasFl2 = _flAll2.length > 0;
        const _invTotalPg2 = Math.ceil(inv.length / 10) || 1;
        const totalPages = _invTotalPg2 + (_hasFl2 ? 1 : 0);
        const _isFloorPg2 = _hasFl2 && invPage === _invTotalPg2;
        const pageItems = _isFloorPg2 ? [] : inv.slice(invPage * 10, (invPage + 1) * 10);
        const _flPageItems2 = _isFloorPg2 ? _flAll2 : [];
        const len = _isFloorPg2 ? _flPageItems2.length : pageItems.length;
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
          if (!it.noDrop)
            a.push({ label: "置く", fn: () => invActRef.current?.drop?.(ai) });
          const _isCursedEquipped = it.cursed && (
            gs?.player?.weapon === it || gs?.player?.armor === it || (gs?.player?.rings || []).includes(it)
          );
          if (!_isCursedEquipped && !it.noThrow)
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
        const getFloorActs2 = (entry) => {
          const _role2 = floorEntryRole(entry, _flItems2, _flTraps2);
          const _j2 = _flAll2.indexOf(entry);
          const _descAct = { label: "説明", fn: () => setShowDesc((p) => (p === 10000 + _j2 ? null : 10000 + _j2)) };
          if (_role2 === "trap") {
            if (isNonSteppableFloorTrap(entry)) return [_descAct];
            return [
              { label: "踏む", fn: () => invActRef.current?.floorTrap?.(entry) },
              _descAct,
            ];
          }
          if (_role2 === "stair") {
            return [
              { label: floorUseLabel(entry, gs?.player), fn: () => invActRef.current?.floorStair?.(entry) },
              _descAct,
            ];
          }
          if (_role2 === "bigbox") {
            return [
              { label: floorUseLabel(entry, gs?.player), fn: () => invActRef.current?.floorBigbox?.(entry) },
              _descAct,
            ];
          }
          if (_role2 === "spring") {
            return [
              { label: floorUseLabel(entry, gs?.player), fn: () => invActRef.current?.floorSpring?.(entry) },
              _descAct,
            ];
          }
          if (_role2 === "gacha") {
            return [
              { label: floorUseLabel(entry, gs?.player), fn: () => invActRef.current?.floorGacha?.(entry) },
              _descAct,
            ];
          }
          if (_role2 === "altar") {
            return [
              { label: floorUseLabel(entry, gs?.player), fn: () => invActRef.current?.floorAltar?.(entry) },
              _descAct,
            ];
          }
          if (FLOOR_INFO_ROLES.has(_role2)) {
            return [_descAct];
          }
          const _isEquipType2 = ["weapon","armor","arrow","ring"].includes(entry.type);
          const acts2 = [];
          acts2.push({ label: "拾う", fn: () => invActRef.current?.floorPickup?.(entry) });
          const _addFloorAct2 = (label, actionFn, skipCap = false, keepInv = false) => {
            acts2.push({ label, fn: () => invActRef.current?.floorItemAction?.(entry, actionFn, skipCap, keepInv) });
          };
          if (entry.type === "pot") {
            acts2.push({ label: "入れる", fn: () => invActRef.current?.floorOpenPutMode?.(entry) });
          } else if (entry.type === "marker") {
            acts2.push({ label: "書く", fn: () => invActRef.current?.floorPen?.(entry) });
          } else if (canUse(entry)) {
            _addFloorAct2(useLabel(entry), (idx) => invActRef.current?.use?.(idx), !_isEquipType2, _isEquipType2 || entry.type === "scroll");
          }
          if (entry.type === "spellbook") _addFloorAct2("読む", (idx) => invActRef.current?.readSpellbook?.(idx), true, false);
          if (entry.type === "arrow") _addFloorAct2("射る", (idx) => invActRef.current?.shoot?.(idx), true, true);
          if (entry.type === "wand") acts2.push({ label: "振る", fn: () => invActRef.current?.floorWaveWand?.(entry) });
          if (entry.type === "wand") _addFloorAct2("壊す", (idx) => invActRef.current?.breakWand?.(idx), true, false);
          if (entry.type === "pot") _addFloorAct2("割る", (idx) => invActRef.current?.breakPot?.(idx), true, false);
          _addFloorAct2(entry.type === "arrow" ? "投げる(束)" : "投げる", (idx) => invActRef.current?.throw?.(idx), true, true);
          acts2.push(_descAct);
          return acts2;
        };
        if (invMenuSel !== null) {
          if (k === "escape" || k === "x") {
            e.preventDefault();
            setInvMenuSel(null);
            return;
          }
          const isLeft = k === "arrowleft" || e.code === "Numpad4";
          const isRight = k === "arrowright" || e.code === "Numpad6";
          if ((isLeft || isRight) && selIdx !== null) {
            e.preventDefault();
            if (_isFloorPg2 && _flPageItems2[selIdx]) {
              const acts = getFloorActs2(_flPageItems2[selIdx]);
              setInvMenuSel((p) => (p + (isRight ? 1 : -1) + acts.length) % acts.length);
            } else if (!_isFloorPg2 && pageItems[selIdx]) {
              const acts = getActs(pageItems[selIdx], absIdx);
              setInvMenuSel((p) => (p + (isRight ? 1 : -1) + acts.length) % acts.length);
            }
            return;
          }
          if ((k === "enter" || k === "z") && selIdx !== null) {
            e.preventDefault();
            if (_isFloorPg2 && _flPageItems2[selIdx]) {
              const acts = getFloorActs2(_flPageItems2[selIdx]);
              if (invMenuSel >= 0 && invMenuSel < acts.length) {
                acts[invMenuSel].fn();
                setInvMenuSel(null);
              }
            } else if (!_isFloorPg2 && pageItems[selIdx]) {
              const acts = getActs(pageItems[selIdx], absIdx);
              if (invMenuSel >= 0 && invMenuSel < acts.length) {
                acts[invMenuSel].fn();
                setInvMenuSel(null);
              }
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
          setShowInv(false);
          dropModeRef.current = false;
          setDropMode(false);
          setInvPage(0);
          setSelIdx(null);
          setShowDesc(null);
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
          setSelIdx(0);
          setInvMenuSel(null);
          setShowDesc(null);
          return;
        }
        if ((k === "enter" || k === "z") && selIdx !== null) {
          e.preventDefault();
          if (_isFloorPg2 && _flPageItems2[selIdx]) {
            setInvMenuSel(0);
          } else if (!_isFloorPg2 && pageItems[selIdx]) {
            if (dropModeRef.current) {
              invActRef.current?.drop?.(invPage * 10 + selIdx);
            } else {
              setInvMenuSel(0);
            }
          }
          return;
        }
        if (k === "s" && !_isFloorPg2) {
          e.preventDefault();
          sortInventory();
          return;
        }
        if (k === "d" && !_isFloorPg2) {
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
        const _npmFaceCard = { Numpad8: "up", Numpad2: "down", Numpad4: "left", Numpad6: "right" };
        const _isArrowF = k === "arrowup" || k === "arrowdown" || k === "arrowleft" || k === "arrowright";
        const _isNpmCardF = e.code in _npmFaceCard;
        if (shiftRef?.current && (_isArrowF || _isNpmCardF)) {
          e.preventDefault();
          const _dmap = { arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right" };
          const _dir = _isArrowF ? _dmap[k] : _npmFaceCard[e.code];
          if (arrowHeldRef) arrowHeldRef.current[_dir] = true;
          const _h = arrowHeldRef?.current || {};
          const _sdx = (_h.right ? 1 : 0) - (_h.left ? 1 : 0);
          const _sdy = (_h.down ? 1 : 0) - (_h.up ? 1 : 0);
          if (_sdx !== 0 && _sdy !== 0) {
            if (sr.current) { sr.current.player.facing = { dx: _sdx, dy: _sdy }; setGs({ ...sr.current }); }
            setFacingMode(false);
          }
          return;
        }
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
      if (revealMode) {
        /* 何かキーで続きのメッセージを表示。この入力はメッセージ送り専用（同キーでの移動・行動はしない） */
        if (revealModeRef?.current) {
          if (revealMode.pendingMsgs.length) setMsgs(prev => [...prev.slice(-80), ...revealMode.pendingMsgs]);
          setRevealMode(null);
          revealModeRef.current = null;
        }
        e.preventDefault();
        return;
      }
      /* ※ ダンジョン移動（テンキー含む）は全モーダル処理の「後」で行う。
         ここでテンキーを return すると魔法欄・識別など後続モーダルが操作不能になる */
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
        const _filt_id = _p_id.inventory
          .map((_it, _i) => ({ it: _it, i: _i }))
          .filter(({ it, i }) => {
            return isScrollTargetCandidate(identifyMode, it, i, sr.current.ident);
          });
        const _dg_id = sr.current.dungeon;
        const _footBb_id = identifyMode.bbFootId ? _dg_id?.bigboxes?.find(b => b.id === identifyMode.bbFootId) : null;
        const _bbOk_id = !!(_footBb_id && !_isBCMode && identifyMode.mode !== 'unidentify');
        const _allList_id = [...(_bbOk_id ? [{ it: { _isBbTarget: true, _bbId: _footBb_id.id }, i: -1 }] : []), ..._filt_id];
        const _len_id = _allList_id.length;
        const _idPage    = identifyMode.page || 0;
        const _idTotalPg = Math.max(1, Math.ceil(_len_id / 10));
        const _idPageItems = _allList_id.slice(_idPage * 10, (_idPage + 1) * 10);
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
          identifyCancelRef?.current?.();
          setIdentifyMode(null);
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          return;
        }
        if ((k === "enter" || k === "z") && _idPageLen > 0) {
          const _curSel_id = Math.min(identifyMode.sel || 0, _idPageLen - 1);
          const { it: _selIt } = _idPageItems[_curSel_id];
          /* ===== 大箱ターゲット処理 ===== */
          if (_selIt._isBbTarget) {
            const _bb = _dg_id?.bigboxes?.find(b => b.id === _selIt._bbId);
            let _bbMsg = "";
            if (_bb) {
              const _bbT = BB_TYPES.find(t => t.kind === _bb.kind);
              if (identifyMode.mode === 'identify') {
                markBigboxKindIdentified(sr.current, _bb); _bb.revealed = true; trackBigbox(_bb);
                _bbMsg = `大箱「${_bb.name}」の正体が明らかになった！`;
              } else if (identifyMode.mode === 'duplicate') {
                if (identifyMode.cursed) {
                  sr.current.dungeon.bigboxes = sr.current.dungeon.bigboxes.filter(b => b.id !== _bb.id);
                  _bbMsg = `${_bb.name}が消えてしまった！【呪】`;
                } else {
                  let _dupPlaced = false;
                  for (const [_ddx, _ddy] of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
                    const _nx = _bb.x + _ddx, _ny = _bb.y + _ddy;
                    if (_dg_id.map[_ny]?.[_nx] === T.FLOOR && !_dg_id.bigboxes?.some(b => b.x === _nx && b.y === _ny)) {
                      const _newBb = { id: uid(), x: _nx, y: _ny, tile: _bb.tile, kind: _bb.kind, name: _bb.name, capacity: _bbT?.cap() ?? _bb.capacity, contents: [], revealed: !!identifyMode.blessed || isBigboxKindIdentified(_bb, sr.current) };
                      if (identifyMode.blessed) { markBigboxKindIdentified(sr.current, _newBb); trackBigbox(_newBb); }
                      _dg_id.bigboxes.push(_newBb);
                      _dupPlaced = true;
                      _bbMsg = identifyMode.blessed ? `祝福された${_bb.name}が隣に現れた！【祝】` : `${_bb.name}の複製が隣に現れた！`;
                      break;
                    }
                  }
                  if (!_dupPlaced) _bbMsg = "複製する場所がなかった。";
                }
              } else if (identifyMode.mode === 'sell_item') {
                const _remaining = Math.max(1, (_bb.capacity || 1) - (_bb.contents?.length || 0));
                const _baseG = (_bbT?.rare ? 3000 : 500) * _remaining;
                const _earnedG = identifyMode.blessed ? _baseG * 2 : identifyMode.cursed ? Math.floor(_baseG / 2) : _baseG;
                sr.current.player.gold = (sr.current.player.gold || 0) + _earnedG;
                sr.current.dungeon.bigboxes = sr.current.dungeon.bigboxes.filter(b => b.id !== _bb.id);
                _bbMsg = identifyMode.blessed ? `${_bb.name}を${_earnedG}Gで換金した！（2倍）【祝】`
                       : identifyMode.cursed  ? `${_bb.name}を${_earnedG}Gで換金した…（半額）【呪】`
                                              : `${_bb.name}を${_earnedG}Gで換金した！`;
              } else if (identifyMode.mode === 'transform_item' || identifyMode.mode === 'forge_item') {
                const _otherBbs = BB_TYPES.filter(t => t.kind !== _bb.kind);
                const _newBbT = _otherBbs[Math.floor(Math.random() * _otherBbs.length)];
                if (_newBbT) {
                  const _oldBbName = isBigboxKindIdentified(_bb, sr.current) ? _bb.name : (sr.current.bbFakeNames?.[_bb.kind] || "謎の大箱");
                  _bb.kind = _newBbT.kind; _bb.name = _newBbT.name; _bb.capacity = _newBbT.cap(); _bb.contents = []; _bb.revealed = !!identifyMode.blessed || isBigboxKindIdentified(_bb, sr.current);
                  if (identifyMode.blessed) markBigboxKindIdentified(sr.current, _bb);
                  const _newBbName = isBigboxKindIdentified(_bb, sr.current) ? _newBbT.name : (sr.current.bbFakeNames?.[_newBbT.kind] || "謎の大箱");
                  _bbMsg = `${_oldBbName}が${_newBbName}に変わった！`;
                } else { _bbMsg = "変化しなかった。"; }
              } else if (identifyMode.mode === 'pot_extract') {
                const _extItems = [...(_bb.contents || [])];
                _bb.contents = [];
                const _extFts = new Set();
                for (const _ci of _extItems) placeItemAt(sr.current.dungeon, sr.current.player.x, sr.current.player.y, _ci, [], _extFts);
                if (identifyMode.cursed) {
                  sr.current.dungeon.bigboxes = sr.current.dungeon.bigboxes.filter(b => b.id !== _bb.id);
                  _bbMsg = `${_bb.name}の中身を吸い出した！大箱は壊れた！【呪】`;
                } else {
                  if (identifyMode.blessed) _bb.capacity = (_bb.capacity || 1) + 1;
                  _bbMsg = _extItems.length > 0
                    ? `${_bb.name}から${_extItems.map(c => c.name).join('、')}が出た！${identifyMode.blessed ? '（容量+1）【祝】' : ''}`
                    : `${_bb.name}は空だった。${identifyMode.blessed ? '（容量+1）【祝】' : ''}`;
                }
              } else if (identifyMode.mode === 'weapon_up' || identifyMode.mode === 'armor_up') {
                _bbMsg = `${_bb.name}には効果がなかった。巻物は消えた。`;
              }
            }
            if (identifyMode.identKey && sr.current) { const _scrWasUnk = !sr.current.ident.has(identifyMode.identKey); sr.current.ident.add(identifyMode.identKey); if (_scrWasUnk && identifyMode.scrollIdx != null) { const _sc = sr.current.player.inventory[identifyMode.scrollIdx]; if (_sc) trackItem(_sc); } }
            if (identifyMode.revMsg) setMsgs((prev) => [...prev.slice(-80), identifyMode.revMsg]);
            if (identifyMode.scrollIdx != null) { sr.current.player.inventory.splice(identifyMode.scrollIdx, 1); }
            if (identifyMode.spellCost != null) { sr.current.player.mp -= identifyMode.spellCost; }
            const _etMl_bb = [];
            endTurn(sr.current, sr.current.player, _etMl_bb);
            setIdentifyMode(null);
            setMsgs((prev) => [...prev.slice(-80), ...(identifyMode.spellMsg ? [identifyMode.spellMsg] : []), _bbMsg, ..._etMl_bb]);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
          /* 確定時に巻物を識別 & reveal メッセージ表示 */
          if (identifyMode.identKey && sr.current) sr.current.ident.add(identifyMode.identKey);
          if (identifyMode.revMsg) setMsgs((prev) => [...prev.slice(-80), identifyMode.revMsg]);
          let _msgResult;
          if (identifyMode.mode === 'sell_item') {
            /* ===== 売却の巻物 ===== */
            const _baseGold = itemPrice(_selIt);
            const _earned = identifyMode.blessed ? _baseGold * 2 : identifyMode.cursed ? Math.floor(_baseGold / 2) : _baseGold;
            if (_p_id.weapon === _selIt) _p_id.weapon = null;
            if (_p_id.armor === _selIt) _p_id.armor = null;
            const _rmIdx_sell = _p_id.inventory.indexOf(_selIt);
            if (_rmIdx_sell !== -1) {
              _p_id.inventory.splice(_rmIdx_sell, 1);
              if (identifyMode.scrollIdx != null && _rmIdx_sell < identifyMode.scrollIdx) identifyMode.scrollIdx--;
            }
            _p_id.gold = (_p_id.gold || 0) + _earned;
            _msgResult = identifyMode.blessed ? `${_selIt.name}を${_earned}Gで換金した！（2倍）【祝】`
                       : identifyMode.cursed  ? `${_selIt.name}を${_earned}Gで換金した…（半額）【呪】`
                                              : `${_selIt.name}を${_earned}Gで換金した！`;
          } else if (identifyMode.mode === 'transform_item') {
            /* ===== 変換の巻物 ===== */
            const _RARITY_UP   = { E:"D", D:"C", C:"B", B:"A", A:"S", S:"S" };
            const _RARITY_DOWN = { E:"E", D:"E", C:"D", B:"C", A:"B", S:"A" };
            const _excl = (t) => t.type === "gold" || (t.effect === _selIt.effect && t.type === _selIt.type);
            let _tsfPool;
            if (identifyMode.blessed) {
              _tsfPool = ITEMS.filter(t => t.rarity === _RARITY_UP[_selIt.rarity || "C"] && !_excl(t));
            } else if (identifyMode.cursed) {
              _tsfPool = ITEMS.filter(t => t.rarity === _RARITY_DOWN[_selIt.rarity || "C"] && !_excl(t));
            } else {
              _tsfPool = ITEMS.filter(t => !_excl(t));
            }
            const _tsfFb = ITEMS.filter(t => !_excl(t));
            const _tsfTmpl = _tsfPool.length > 0 ? _tsfPool[Math.floor(Math.random() * _tsfPool.length)]
                                                  : _tsfFb[Math.floor(Math.random() * _tsfFb.length)];
            if (_tsfTmpl) {
              const _newIt = { ..._tsfTmpl, id: uid() };
              if (_tsfTmpl.type === "wand") _newIt.charges = _tsfTmpl.maxCharges ?? _tsfTmpl.charges ?? 5;
              if (_tsfTmpl.type === "arrow") _newIt.count = _tsfTmpl.count ?? 1;
              if (_p_id.weapon === _selIt) _p_id.weapon = null;
              if (_p_id.armor === _selIt) _p_id.armor = null;
              const _rmIdx_tsf = _p_id.inventory.indexOf(_selIt);
              if (_rmIdx_tsf !== -1) {
                _p_id.inventory.splice(_rmIdx_tsf, 1, _newIt);
              }
              const _selDisp = itemDisplayName(_selIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              const _newDisp = itemDisplayName(_newIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              _msgResult = identifyMode.blessed ? `${_selDisp}が${_newDisp}に変わった！【祝】`
                         : identifyMode.cursed  ? `${_selDisp}が${_newDisp}に変わってしまった…【呪】`
                                                : `${_selDisp}が${_newDisp}に変わった！`;
            } else { _msgResult = "変換できるアイテムがなかった。"; }
          } else if (identifyMode.mode === 'forge_item') {
            /* ===== 錬成の巻物 ===== */
            if (_selIt.type !== "weapon" && _selIt.type !== "armor") {
              _msgResult = `${_selIt.name}には効果がなかった。巻物は消えた。`;
            } else {
            const _isWeapon = _selIt.type === "weapon";
            const _allAbils = _isWeapon ? WEAPON_ABILITIES : ARMOR_ABILITIES;
            const _owned = new Set([...(_selIt.abilities || []), _selIt.ability].filter(Boolean));
            const _WS = new Set(["reach","critical","critical_oni_club","critical_war_god_axe","critical_cat_claw","oil_proof","bane_dragon","bane_float","fire_elem","ice_elem","thunder_elem","inflict_seal","inflict_immobile","inflict_bewitch","bane_undead","bane_humanoid"]);
            const _WW = new Set(["no_degrade","def_bonus","inflict_slow","knockback"]);
            const _AS = new Set(["regen","thorn","dodge","wand_reflect","fire_resist","lightning_resist","ice_resist","oil_proof"]);
            const _AW = new Set(["slow_hunger","anti_steal","no_degrade","sleep_proof"]);
            const _str = _isWeapon ? _WS : _AS;
            const _wk  = _isWeapon ? _WW : _AW;
            const _cands = _allAbils.filter(ab => !_owned.has(ab.id) && !ab.specialOnly && (
              identifyMode.blessed ? _str.has(ab.id)
              : identifyMode.cursed ? _wk.has(ab.id)
              : !ab.curseOnly && !ab.blessedOnly));
            const _pool = _cands.length > 0 ? _cands : _allAbils.filter(ab => !_owned.has(ab.id) && !ab.specialOnly);
            if (_pool.length > 0) {
              const _ab = _pool[Math.floor(Math.random() * _pool.length)];
              _selIt.abilities = [...(_selIt.abilities || []), _ab.id].filter(Boolean);
              if (!_selIt.ability) _selIt.ability = _ab.id;
              if (_ab.id === "pickaxe" && _selIt.durability == null) _selIt.durability = 30;
              _selIt.fullIdent = true;
              _msgResult = identifyMode.blessed ? `${_selIt.name}に「${_ab.name}」が宿った！【祝】`
                         : identifyMode.cursed  ? `${_selIt.name}に「${_ab.name}」が刻まれてしまった…【呪】`
                                                : `${_selIt.name}に「${_ab.name}」が宿った！`;
            } else { _msgResult = `${_selIt.name}はもうこれ以上能力を宿せない。`; }
            }
          } else if (identifyMode.mode === 'weapon_up' || identifyMode.mode === 'armor_up') {
            /* ===== 武器強化・防具強化の巻物 ===== */
            const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
            const _gain = identifyMode.blessed ? 2 : identifyMode.cursed ? -1 : 1;
            const _sfx = identifyMode.blessed ? "【祝】" : identifyMode.cursed ? "【呪】" : "";
            const _isValidUpTarget = identifyMode.mode === "weapon_up"
              ? (_selIt.type === "weapon" || (_selIt.type === "ring" && ["power_ring","defense_ring","life_ring"].includes(_selIt.effect)))
              : (_selIt.type === "armor" || (_selIt.type === "ring" && ["power_ring","defense_ring","life_ring"].includes(_selIt.effect)));
            if (_isValidUpTarget) {
              const _bef = _selIt.plus || 0;
              _selIt.plus = _bef + _gain;
              const _glow = _gain > 0 ? "輝いた" : "くすんだ";
              _msgResult = `${_selIt.name}が${_glow}！(${_fp(_bef)}→${_fp(_selIt.plus)})${_sfx}`;
              if (_gain > 0 && _selIt.cursed) { _selIt.cursed = false; _msgResult += " 呪いが解けた！"; }
            } else if (_selIt.type === "ring") {
              const _bef = _selIt.plus || 0;
              _selIt.plus = _bef + _gain;
              const _glow = _gain > 0 ? "輝いた" : "くすんだ";
              _msgResult = `${_selIt.name}が${_glow}！(${_fp(_bef)}→${_fp(_selIt.plus)})${_sfx}`;
              if (_gain > 0 && _selIt.cursed) { _selIt.cursed = false; _msgResult += " 呪いが解けた！"; }
            } else {
              _msgResult = `${_selIt.name}には効果がなかった。巻物は消えた。`;
            }
            /* 巻物の削除は下の共通処理（identifyMode.scrollIdx）に任せる。
               ここで先に削除すると scrollIdx がずれて別アイテムまで消える二重削除バグが起きる。 */
          } else if (identifyMode.mode === 'bless') {
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
            const _dupCount = identifyMode.cursed ? 0 : 1;
            if (_dupCount === 0) {
              if (_selIt.type === "goal") {
                _msgResult = `${_selIt.name}は呪いに耐えた！【呪】`;
              } else {
                const _rmIdx = _p_id.inventory.indexOf(_selIt);
                if (_rmIdx !== -1) {
                  _p_id.inventory.splice(_rmIdx, 1);
                  if (identifyMode.scrollIdx != null && _rmIdx < identifyMode.scrollIdx) {
                    identifyMode.scrollIdx--;
                  }
                }
                _msgResult = `${_selIt.name}が消えてしまった！【呪】`;
              }
            } else {
              /* 同種の新品アイテムを生成（チャージ・中身・強化値は複製元と無関係） */
              const _makeFresh = () => {
                if (_selIt.type === "wand") {
                  const _tpl = WANDS.find(w => w.effect === _selIt.effect) || _selIt;
                  return { ..._tpl, id: uid() };
                }
                if (_selIt.type === "pot") {
                  const _tpl = POTS.find(pp => pp.potEffect === _selIt.potEffect) || _selIt;
                  return { ..._tpl, id: uid(), contents: [], capacity: randPotCapacity(_tpl.potEffect) };
                }
                if (_selIt.type === "weapon" || _selIt.type === "armor") {
                  const _tpl = ITEMS.find(i => i.name === _selIt.name) || _selIt;
                  return { ..._tpl, id: uid() };
                }
                /* その他（薬・巻物・食料・矢など）は名前と種別を保ち新品として生成 */
                const { blessed: _b, cursed: _c, bcKnown: _bck, fullIdent: _fi, plus: _pl, ...rest } = _selIt;
                return { ...rest, id: uid() };
              };
              const _newIt = _makeFresh();
              if (identifyMode.blessed) {
                if (_newIt.type === "pot") {
                  _newIt.capacity = (_newIt.capacity || 3) + 1;
                  delete _newIt.blessed;
                  delete _newIt.cursed;
                } else {
                  _newIt.blessed = true;
                  _newIt.cursed = false;
                  _newIt.bcKnown = true;
                }
              }
              _p_id.inventory.push(_newIt);
              const _dupDispName = itemDisplayName(_selIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              _msgResult = identifyMode.blessed ? `祝福された${_dupDispName}が1つ増えた！【祝】` : `${_dupDispName}が1つ増えた！`;
            }
          } else if (identifyMode.mode === 'pot_extract') {
            /* ===== 吸い出しの巻物 ===== */
            const _p_pe = sr.current.player;
            const _dg_pe = sr.current.dungeon;
            const _ml_pe = [];
            const _peRes = _selIt.type === "pot"
              ? extractPotContents(_selIt, _dg_pe, _p_pe.x, _p_pe.y, _p_pe, _ml_pe, null, identifyMode.blessed, identifyMode.cursed)
              : null;
            /* 壺がインベントリから削除されていたら scrollIdx を補正 */
            if (_peRes?.potRemovedAt != null && identifyMode.scrollIdx != null && _peRes.potRemovedAt < identifyMode.scrollIdx) {
              identifyMode.scrollIdx--;
            }
            _msgResult = _selIt.type === "pot" ? _ml_pe : `${_selIt.name}には効果がなかった。巻物は消えた。`;
          } else {
            const _isBcOnly = _selIt.type === 'weapon' || _selIt.type === 'armor' || _selIt.type === 'food';
            const _selKey = _isBcOnly ? null : getIdentKey(_selIt);
            if (identifyMode.mode === 'identify') {
              const _wasAlreadyNamed = !_isBcOnly && _selKey && sr.current.ident.has(_selKey);
              if (_selKey) sr.current.ident.add(_selKey);
              _selIt.fullIdent = true; _selIt.bcKnown = true;
              _msgResult = (_isBcOnly || _wasAlreadyNamed) ? `${_selIt.name}の祝呪が判明した！` : `${_selIt.name}と判明した！`;
            } else {
              if (_selKey) sr.current.ident.delete(_selKey);
              _selIt.fullIdent = false; _selIt.bcKnown = false;
              _msgResult = `${_selIt.name}の識別が失われた...`;
            }
          }
          if (identifyMode.scrollIdx != null) {
            sr.current.player.inventory.splice(identifyMode.scrollIdx, 1);
          }
          if (identifyMode.spellCost != null) {
            sr.current.player.mp -= identifyMode.spellCost;
          }
          const _etMl_k = [];
          endTurn(sr.current, sr.current.player, _etMl_k);
          const _ml_id = [...(identifyMode.spellMsg ? [identifyMode.spellMsg] : []), ...(Array.isArray(_msgResult) ? _msgResult : (_msgResult ? [_msgResult] : [])), ..._etMl_k];
          /* bless/curseの魔法：MPが続く限りモーダルを開き続ける */
          const _isBCSpell_k = (identifyMode.mode === 'bless' || identifyMode.mode === 'curse') && identifyMode.spellCost != null && identifyMode.scrollIdx == null;
          if (_isBCSpell_k && sr.current.player.mp >= identifyMode.spellCost) {
            setIdentifyMode({ mode: identifyMode.mode, sel: 0, spellCost: identifyMode.spellCost, spellMsg: identifyMode.spellMsg });
          } else {
            setIdentifyMode(null);
            if (_isBCSpell_k) _ml_id.push("MPが足りない。");
          }
          setMsgs((prev) => [...prev.slice(-80), ..._ml_id]);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }
        return;
      }
      if (putMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") {
          invActRef.current?.cancelPut?.();
          return;
        }
        if (!sr.current) return;
        const inv4 = sr.current.player.inventory;
        const pItems4 = inv4
          .map((it, i) => ({ it, i }))
          .filter(({ i }) => (putMode.floorPot ? true : i !== putMode.potIdx));
        const _ps4 = 10;
        const _tp4 = Math.max(1, Math.ceil(pItems4.length / _ps4));
        const _pg4 = pItems4.slice(putPage * _ps4, (putPage + 1) * _ps4);
        const _plen4 = _pg4.length;
        const _selCount4 = _plen4 + 1; /* 末尾が「やめる」 */
        const isUp4 = k === "arrowup" || e.code === "Numpad8";
        const isDown4 = k === "arrowdown" || e.code === "Numpad2";
        const isLeft4 = k === "arrowleft" || e.code === "Numpad4";
        const isRight4 = k === "arrowright" || e.code === "Numpad6";
        if ((isUp4 || isDown4) && _selCount4 > 0) {
          setPutMenuSel((s) => (s + (isDown4 ? 1 : -1) + _selCount4) % _selCount4);
          return;
        }
        if ((isLeft4 || isRight4) && _tp4 > 1) {
          setPutPage((p) => (p + (isRight4 ? 1 : -1) + _tp4) % _tp4);
          setPutMenuSel(0);
          return;
        }
        if (k === "enter" || k === "z") {
          const _localSel = Math.min(putMenuSel, _selCount4 - 1);
          if (_localSel >= _plen4) {
            invActRef.current?.cancelPut?.();
            return;
          }
          if (_plen4 > 0) {
            const sel4 = _pg4[_localSel];
            if (sel4.it.type === "pot")
              setMsgs((prev) => [
                ...prev.slice(-80),
                "壺の中に壺は入れられない。",
              ]);
            else invActRef.current?.put?.(sel4.i);
          }
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
        const isUp5    = k === "arrowup"    || e.code === "Numpad8";
        const isDown5  = k === "arrowdown"  || e.code === "Numpad2";
        const isLeft5  = k === "arrowleft"  || e.code === "Numpad4";
        const isRight5 = k === "arrowright" || e.code === "Numpad6";
        const _mps = 10;
        if (markerMode.step === "select_blank") {
          const blanks5 = inv5
            .map((it, i) => ({ it, i }))
            .filter(({ it }) => (it.type === "scroll" && it.effect === "blank") || (it.type === "spellbook" && !it.spell));
          const _blen5 = blanks5.length;
          const _bPages = Math.max(1, Math.ceil(_blen5 / _mps));
          if ((isLeft5 || isRight5) && _bPages > 1) { setMarkerPage((p) => (p + (isRight5 ? 1 : -1) + _bPages) % _bPages); setMarkerMenuSel(0); return; }
          if ((isUp5 || isDown5) && _blen5 > 0) {
            const _bPageLen = Math.min(_mps, _blen5 - markerPage * _mps);
            setMarkerMenuSel((s) => (s + (isDown5 ? 1 : -1) + _bPageLen) % _bPageLen);
            return;
          }
          if ((k === "enter" || k === "z") && _blen5 > 0) {
            const _bActualIdx = markerPage * _mps + Math.min(markerMenuSel, Math.min(_mps, _blen5 - markerPage * _mps) - 1);
            const sel5 = blanks5[_bActualIdx];
            if (!sel5) return;
            const kind5 = sel5.it.type === "spellbook" ? "spellbook" : "scroll";
            const nextStep5 = kind5 === "spellbook" ? "select_spellbook_type" : "select_type";
            setMarkerMode({ ...markerMode, step: nextStep5, blankIdx: sel5.i, blankKind: kind5 });
            setMarkerMenuSel(0);
            setMarkerPage(0);
            const msg5 = kind5 === "spellbook" ? "どの魔法書に変えますか...(インク5回消費)" : "どの魔法を書き込みますか...";
            setMsgs((prev) => [...prev.slice(-80), msg5]);
          }
        } else if (markerMode.step === "select_type") {
          const _kIdent5 = new Set([...(sr.current?.ident ?? []), ...pastIdent]);
          const _curDisc5 = getDiscoveries().items;
          const _invEff5 = new Set(inv5.filter(it => it.type === "scroll" && it.effect !== "blank").map(it => it.effect));
          const types5 = ITEMS.filter((it) => it.type === "scroll" && it.effect !== "blank" && (_kIdent5.has(`s:${it.effect}`) || discoveredItems[it.effect] || _curDisc5[it.effect] || _invEff5.has(it.effect)));
          const _tlen5 = types5.length;
          const _tPages = Math.max(1, Math.ceil(_tlen5 / _mps));
          if ((isLeft5 || isRight5) && _tPages > 1) { setMarkerPage((p) => (p + (isRight5 ? 1 : -1) + _tPages) % _tPages); setMarkerMenuSel(0); return; }
          if ((isUp5 || isDown5) && _tlen5 > 0) {
            const _tPageLen = Math.min(_mps, _tlen5 - markerPage * _mps);
            setMarkerMenuSel((s) => (s + (isDown5 ? 1 : -1) + _tPageLen) % _tPageLen);
            return;
          }
          if ((k === "enter" || k === "z") && _tlen5 > 0) {
            const _tActualIdx = markerPage * _mps + Math.min(markerMenuSel, Math.min(_mps, _tlen5 - markerPage * _mps) - 1);
            const tmpl5 = types5[_tActualIdx];
            if (tmpl5) doMarkerWriteRef.current?.(markerMode.blankIdx, tmpl5);
          }
        } else if (markerMode.step === "select_spellbook_type") {
          const _kIdent5sb = new Set([...(sr.current?.ident ?? []), ...pastIdent]);
          const sbTypes5 = SPELLBOOKS.filter((it) => it.spell && _kIdent5sb.has(`b:${it.spell}`));
          const _sbLen5 = sbTypes5.length;
          const _sbPages = Math.max(1, Math.ceil(_sbLen5 / _mps));
          if ((isLeft5 || isRight5) && _sbPages > 1) { setMarkerPage((p) => (p + (isRight5 ? 1 : -1) + _sbPages) % _sbPages); setMarkerMenuSel(0); return; }
          if ((isUp5 || isDown5) && _sbLen5 > 0) {
            const _sbPageLen = Math.min(_mps, _sbLen5 - markerPage * _mps);
            setMarkerMenuSel((s) => (s + (isDown5 ? 1 : -1) + _sbPageLen) % _sbPageLen);
            return;
          }
          if ((k === "enter" || k === "z") && _sbLen5 > 0) {
            const _sbActualIdx = markerPage * _mps + Math.min(markerMenuSel, Math.min(_mps, _sbLen5 - markerPage * _mps) - 1);
            const tmpl5 = sbTypes5[_sbActualIdx];
            if (tmpl5) doMarkerWriteRef.current?.(markerMode.blankIdx, tmpl5);
          }
        }
        return;
      }
      if (spellListMode) {
        e.preventDefault();
        if (k === "escape" || k === "x" || k === "c") { setSpellListMode(false); return; }
        const knownSpells = (sr.current?.player?.spells || []).map((id) => {
          const s = SPELLS.find((sp) => sp.id === id);
          if (!s) return null;
          const _lv = (sr.current?.player?.spellLevels?.[id] || 1);
          return { ...s, mpCost: s.fixedMpCost ? s.mpCost : Math.max(1, Math.round(s.mpCost * (1 - (_lv - 1) * 0.15))), spellLevel: _lv };
        }).filter(Boolean);
        const slen = knownSpells.length;
        const _sps = 10;
        const _totalPages = Math.max(1, Math.ceil(slen / _sps));
        const _curPage = Math.min(spellPage, _totalPages - 1);
        const _pageSpells = knownSpells.slice(_curPage * _sps, (_curPage + 1) * _sps);
        const _plen = _pageSpells.length;
        const isUpS = k === "arrowup" || e.code === "Numpad8";
        const isDownS = k === "arrowdown" || e.code === "Numpad2";
        const isLeftS = k === "arrowleft" || e.code === "Numpad4";
        const isRightS = k === "arrowright" || e.code === "Numpad6";
        if ((isUpS || isDownS) && _plen > 0) { setSpellMenuSel((s) => (s + (isDownS ? 1 : -1) + _plen) % _plen); return; }
        if ((isLeftS || isRightS) && _totalPages > 1) {
          setSpellPage((p) => (p + (isRightS ? 1 : -1) + _totalPages) % _totalPages);
          setSpellMenuSel(0);
          return;
        }
        if ((k === "enter" || k === "z") && _plen > 0) {
          const spell = _pageSpells[Math.min(spellMenuSel, _plen - 1)];
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
                if (_ii.type === 'weapon' || _ii.type === 'armor' || _ii.type === 'food') return !_ii.fullIdent && !_ii.bcKnown;
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
            } else if (spell.effect.startsWith("debug_")) {
              setDebugSpellMode({ effect: spell.effect });
              setDebugSpellMenuSel(0);
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
      if (debugSpellMode) {
        e.preventDefault();
        const _dsEff = debugSpellMode.effect;
        const _dsPage = debugSpellMode.page ?? 0;
        const _dsCat = debugSpellMode.category ?? null;

        /* X/Escape: カテゴリ選択中なら戻る、そうでなければ閉じる */
        if (k === "escape" || k === "x") {
          if (_dsEff === "debug_get_item" && _dsCat) {
            setDebugSpellMode({ ...debugSpellMode, category: null, page: 0 });
            setDebugSpellMenuSel(0);
          } else {
            setDebugSpellMode(null);
          }
          return;
        }

        /* 全エントリ数を計算 */
        let _dsTotalEntries = 0;
        if (_dsEff === "debug_summon_mon") {
          for (const m of MONS) { _dsTotalEntries++; const lvs = MON_LEVELS[m.baseKind]; if (lvs) { if (lvs[0]) _dsTotalEntries++; if (lvs[1]) _dsTotalEntries++; } }
          _dsTotalEntries += BOSSES.length + INTERMEDIATE_BOSSES.length;
        } else if (_dsEff === "debug_get_item") {
          if (!_dsCat) { _dsTotalEntries = 14; } // カテゴリ数（special_synth追加済み）
          else if (_dsCat === "potions")      _dsTotalEntries = ITEMS.filter(x=>x.type==="potion").length + 1;
          else if (_dsCat === "scrolls")      _dsTotalEntries = ITEMS.filter(x=>x.type==="scroll").length + 1;
          else if (_dsCat === "weapons")      _dsTotalEntries = ITEMS.filter(x=>x.type==="weapon").length + 2;
          else if (_dsCat === "armors")       _dsTotalEntries = ITEMS.filter(x=>x.type==="armor").length;
          else if (_dsCat === "special_synth") _dsTotalEntries = 18;
          else if (_dsCat === "pens")         _dsTotalEntries = ITEMS.filter(x=>x.type==="pen").length + 1;
          else if (_dsCat === "arrows")       _dsTotalEntries = ITEMS.filter(x=>x.type==="arrow").length + 3;
          else if (_dsCat === "wands")        _dsTotalEntries = WANDS.length;
          else if (_dsCat === "spellbooks")   _dsTotalEntries = SPELLBOOKS.length;
          else if (_dsCat === "rings")        _dsTotalEntries = RINGS.length;
          else if (_dsCat === "pots")         _dsTotalEntries = POTS.length;
          else if (_dsCat === "raw_food")     _dsTotalEntries = RAW_FOODS.length;
          else if (_dsCat === "cooked_food")  _dsTotalEntries = COOKED_FOODS.length;
          else if (_dsCat === "others")       _dsTotalEntries = 1;
        } else if (_dsEff === "debug_create_trap") {
          _dsTotalEntries = TRAPS.length;
        } else if (_dsEff === "debug_summon_bb") {
          _dsTotalEntries = BB_TYPES.length;
        } else if (_dsEff === "debug_summon_object") {
          /* オブジェクト召喚はガチャ・泉・風穴・石像・祭壇・次元宝物庫の6項目。 */
          _dsTotalEntries = 6;
        }
        const _dsIsCategory = _dsEff === "debug_get_item" && !_dsCat;
        const _dsPageSize = _dsIsCategory ? _dsTotalEntries : 10;
        const _dsTotalPages = _dsIsCategory ? 1 : Math.max(1, Math.ceil(_dsTotalEntries / _dsPageSize));
        const _dsSafePage = Math.min(_dsPage, _dsTotalPages - 1);
        const _dsLen = Math.min(_dsPageSize, Math.max(0, _dsTotalEntries - _dsSafePage * _dsPageSize));

        /* 上下: カーソル移動 */
        const _dsUp = k === "arrowup" || e.code === "Numpad8";
        const _dsDown = k === "arrowdown" || e.code === "Numpad2";
        if ((_dsUp || _dsDown) && _dsLen > 0) {
          setDebugSpellMenuSel((s) => ((s ?? 0) + (_dsDown ? 1 : -1) + _dsLen) % _dsLen);
          return;
        }

        /* 左右: ページ切り替え */
        const _dsLeft = k === "arrowleft" || e.code === "Numpad4";
        const _dsRight = k === "arrowright" || e.code === "Numpad6";
        if ((_dsLeft || _dsRight) && _dsTotalPages > 1) {
          const _np = ((_dsSafePage + (_dsRight ? 1 : -1)) + _dsTotalPages) % _dsTotalPages;
          setDebugSpellMode({ ...debugSpellMode, page: _np });
          setDebugSpellMenuSel(0);
          return;
        }

        /* Z/Enter: 選択確定 */
        if ((k === "enter" || k === "z") && _dsLen > 0) {
          const modal = document.querySelector('[data-debug-spell-modal]');
          if (modal) {
            const items = modal.querySelectorAll('[data-debug-entry]');
            const sel = Math.min(debugSpellMenuSel ?? 0, items.length - 1);
            if (items[sel]) items[sel].click();
          }
          return;
        }
        return;
      }
      if (shopMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") {
          setShopMode(null);
          return;
        }
        if (shopMode === "pay") {
          if (isKeyUp(e) || isKeyDown(e)) {
            setShopMenuSel((p2) => (p2 + (isKeyDown(e) ? 1 : -1) + 2) % 2);
            return;
          }
          if (k === "enter" || k === "z" || e.code === "Digit1" || e.code === "Numpad1") {
            if (shopMenuSel === 0) {
              if (sr.current) {
                const { player: p2, dungeon: dg2 } = sr.current;
                const _allShopsPay = getShops(dg2);
                const _totalUnpaid = _allShopsPay.reduce((s, sh) => s + (sh.unpaidTotal || 0), 0);
                if (p2.gold >= _totalUnpaid) {
                  p2.gold -= _totalUnpaid;
                  _allShopsPay.forEach(sh => { sh.unpaidTotal = 0; });
                  dg2.shopTheft = false;
                  p2.isThief = false;
                  const _clearShopPrice2 = (it2) => {
                    if (it2.shopPrice) { delete it2.shopPrice; delete it2._shopId; delete it2._shopCharge; }
                    if (it2.type === "pot" && it2.contents) it2.contents.forEach(_clearShopPrice2);
                  };
                  p2.inventory.forEach(_clearShopPrice2);
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
          if (e.code === "Digit2") {
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
          const _curSellShop = getShops(dg2).find(s => s.room &&
            p2.x >= s.room.x && p2.x < s.room.x + s.room.w &&
            p2.y >= s.room.y && p2.y < s.room.y + s.room.h);
          const fis3 = _curSellShop ? dg2.items.filter(
            (i) =>
              !i.shopPrice &&
              i.x >= _curSellShop.room.x &&
              i.x < _curSellShop.room.x + _curSellShop.room.w &&
              i.y >= _curSellShop.room.y &&
              i.y < _curSellShop.room.y + _curSellShop.room.h,
          ) : [];
          const mlen3 = fis3.length + 1;
          if (isKeyUp(e) || isKeyDown(e)) {
            setShopMenuSel((p2) => (p2 + (isKeyDown(e) ? 1 : -1) + mlen3) % mlen3);
            return;
          }
          if (k === "enter" || k === "z") {
            if (shopMenuSel < fis3.length) {
              const it2 = fis3[shopMenuSel];
              const bp = it2.type === "gem" ? gemSellPrice(it2, p2.depth) : Math.ceil(itemPrice(it2) * 0.5);
              p2.gold += bp;
              it2.shopPrice = it2.type === "gem" ? (it2._gemBuyPrice || bp) + bp : itemPrice(it2);
              if (_curSellShop) it2._shopId = _curSellShop.id;
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
                const dt = _curSellShop?.unpaidTotal ?? 0;
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
              const dt = _curSellShop?.unpaidTotal ?? 0;
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
        if (shopMode === "browse" || shopMode === "browseConfirm") {
          if (isKeyUp(e) || isKeyDown(e)) {
            setShopMenuSel((p2) => (p2 + (isKeyDown(e) ? 1 : -1) + 2) % 2);
            return;
          }
          if (k === "enter" || k === "z") {
            if (shopMode === "browse") {
              if (shopMenuSel === 0) { setShopMode(null); } // やめる
              else { // 所持品を全て売る
                if (sr.current) {
                  const { player: p2, dungeon: dg2 } = sr.current;
                  const _bSellItems = p2.inventory.filter(it => it.type !== "gold" && !it.shopPrice);
                  const _bInShop = getShops(dg2).find(s => s.room && p2.x >= s.room.x && p2.x < s.room.x + s.room.w && p2.y >= s.room.y && p2.y < s.room.y + s.room.h);
                  if (_bSellItems.length > 0 && _bInShop) { setShopMode("browseConfirm"); setShopMenuSel(0); }
                }
              }
            } else { // browseConfirm
              if (shopMenuSel === 0) { setShopMode("browse"); setShopMenuSel(0); } // やめる
              else { // はい、全て売る
                if (sr.current) {
                  const { player: p2, dungeon: dg2 } = sr.current;
                  const toSell = p2.inventory.filter(it => it.type !== "gold" && !it.shopPrice);
                  const _sellShop = getShops(dg2).find(s => s.room && p2.x >= s.room.x && p2.x < s.room.x + s.room.w && p2.y >= s.room.y && p2.y < s.room.y + s.room.h) || getShops(dg2)[0];
                  if (toSell.length > 0 && _sellShop) {
                    const _earned = sellInventoryItemsToShop(toSell, p2, _sellShop);
                    const _sk2 = dg2.monsters.find(m => m.id === _sellShop.shopkeeperId && m.state === "friendly");
                    if (_sk2) _sk2.state = "blocking";
                    setMsgs(prev => [...prev.slice(-80), `所持品 ${toSell.length} 件が店の商品になった。${_earned.toLocaleString()}Gを受け取った。店主が入口をふさいだ。`]);
                    sr.current = { ...sr.current }; setGs({ ...sr.current });
                  }
                  setShopMode(null);
                }
              }
            }
            return;
          }
          return;
        }
        return;
      }
      if (merchantMode) {
        e.preventDefault();
        const up = isKeyUp(e), down = isKeyDown(e);
        if (k === "escape" || k === "x") {
          setMerchantMode(null);
          if (merchantRef) merchantRef.current = null;
          return;
        }
        const merchant = merchantRef?.current;
        const shop = sr.current?.dungeon?.merchantShops?.find((entry) => entry.id === merchant?.merchantShopId);
        const stockLen = shop?.stock?.length || 0;
        const sellLen = (sr.current?.player?.inventory || []).filter((item) =>
          item.type !== "gold" && item.type !== "goal" && sr.current.player.weapon !== item && sr.current.player.armor !== item && sr.current.player.arrow !== item && !(sr.current.player.rings || []).includes(item)
        ).length;
        const itemCount = merchantMode === "buy" ? stockLen : sellLen;
        const pageCount = Math.max(1, Math.ceil(itemCount / 10));
        if (merchantMode !== "menu" && (isKeyLeft(e) || isKeyRight(e))) {
          e.preventDefault();
          setMerchantMenuSel((value) => {
            const currentPage = value >= itemCount ? pageCount - 1 : Math.floor(value / 10);
            const nextPage = (currentPage + (isKeyRight(e) ? 1 : -1) + pageCount) % pageCount;
            return Math.min(nextPage * 10, itemCount);
          });
          return;
        }
        const len = merchantMode === "menu" ? 3 : itemCount + 1;
        if ((up || down) && len > 0) {
          setMerchantMenuSel((value) => (value + (down ? 1 : -1) + len) % len);
          return;
        }
        if (k === "enter" || k === "z" || /^[1-9]$/.test(k)) {
          const selected = /^[1-9]$/.test(k) ? Number(k) - 1 : merchantMenuSel;
          if (merchantMode === "menu") {
            if (selected === 0) { setMerchantMode("buy"); setMerchantMenuSel(0); }
            else if (selected === 1) { setMerchantMode("sell"); setMerchantMenuSel(0); }
            else { setMerchantMode(null); if (merchantRef) merchantRef.current = null; }
          } else if (merchantMode === "buy") {
            if (selected < stockLen) doMerchantBuy?.(selected);
            else { setMerchantMode("menu"); setMerchantMenuSel(0); }
          } else if (merchantMode === "sell") {
            if (selected < sellLen) {
              const sellable = (sr.current?.player?.inventory || []).map((item, index) => ({ item, index })).filter(({ item }) =>
                item.type !== "gold" && item.type !== "goal" && sr.current.player.weapon !== item && sr.current.player.armor !== item && sr.current.player.arrow !== item && !(sr.current.player.rings || []).includes(item)
              );
              if (sellable[selected]) doMerchantSell?.(sellable[selected].index);
            } else { setMerchantMode("menu"); setMerchantMenuSel(0); }
          }
          return;
        }
        return;
      }
      if (altarMode) {
        e.preventDefault();
        const up = isKeyUp(e), down = isKeyDown(e);
        if (k === "escape" || k === "x") { setAltarMode(null); if (altarRef) altarRef.current = null; return; }
        const foods = (sr.current?.player?.inventory || []).map((item, index) => ({ item, index })).filter(({ item }) => item.type === "food");
        const len = foods.length + 1;
        if (up || down) { setAltarMenuSel((value) => (value + (down ? 1 : -1) + len) % len); return; }
        if (k === "enter" || k === "z" || /^[1-9]$/.test(k)) {
          const selected = /^[1-9]$/.test(k) ? Number(k) - 1 : altarMenuSel;
          if (selected < foods.length) doOfferFood?.(foods[selected].item);
          else { setAltarMode(null); if (altarRef) altarRef.current = null; }
        }
        return;
      }
      if (bigboxMode) {
        e.preventDefault();
        const isUpBB = k === "arrowup" || e.code === "Numpad8";
        const isDownBB = k === "arrowdown" || e.code === "Numpad2";
        if (bigboxMode === "menu") {
          const mlen2 = 4;
          if (isUpBB || isDownBB) {
            setBigboxMenuSel((p) => (p + (isDownBB ? 1 : -1) + mlen2) % mlen2);
            return;
          }
          const _bbNickKey2 = bigboxRef.current ? "bk:" + bigboxRef.current.kind : null;
          if (k === "enter" || k === "z") {
            if (bigboxMenuSel === 0) {
              setBigboxMode("put");
              setBigboxMenuSel(0);
              setBigboxPage(0);
            } else if (bigboxMenuSel === 1) {
              setBigboxMode(null);
              bigboxRef.current = null;
              setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
            } else if (bigboxMenuSel === 2) {
              setBigboxMode("desc");
              setBigboxMenuSel(0);
            } else if (bigboxMenuSel === 3 && _bbNickKey2) {
              setBigboxMode(null);
              setNicknameMode({ identKey: _bbNickKey2 });
              setNicknameInput(gs?.nicknames?.[_bbNickKey2] || "");
            }
            return;
          }
          if (k === "x" || k === "escape") {
            setBigboxMode(null);
            bigboxRef.current = null;
            setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
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
          } else if (k === "3") {
            setBigboxMode("desc");
            setBigboxMenuSel(0);
          } else if (k === "4" && _bbNickKey2) {
            setBigboxMode(null);
            setNicknameMode({ identKey: _bbNickKey2 });
            setNicknameInput(gs?.nicknames?.[_bbNickKey2] || "");
          }
          return;
        }
        if (bigboxMode === "desc") {
          if (k === "x" || k === "escape" || k === "enter" || k === "z") {
            setBigboxMode("menu");
            setBigboxMenuSel(0);
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
            setBigboxMode(null);
            bigboxRef.current = null;
            setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
            return;
          }
          return;
        }
        return;
      }
      if (gachaMode) {
        e.preventDefault();
        const isUpGacha = k === "arrowup" || e.code === "Numpad8";
        const isDownGacha = k === "arrowdown" || e.code === "Numpad2";
        if (isUpGacha || isDownGacha) {
          setGachaMenuSel((p) => (p + (isDownGacha ? 1 : -1) + 2) % 2);
          return;
        }
        if (k === "enter" || k === "z" || k === "1" || k === "2") {
          const selected = k === "1" ? 0 : k === "2" ? 1 : gachaMenuSel;
          if (selected === 0) gachaDrawRef.current?.();
          else { setGachaMode(null); gachaRef.current = null; setMsgs((prev) => [...prev.slice(-80), "やめた。"]); }
          return;
        }
        if (k === "x" || k === "escape") {
          setGachaMode(null); gachaRef.current = null;
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
        }
        return;
      }
      if (wishMode) {
        /* WishModal が capture で処理。ここではゲーム操作を止めるだけ */
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
        const _npmThrowCard = { Numpad8: "up", Numpad2: "down", Numpad4: "left", Numpad6: "right" };
        if (e.code in numpadThrow) {
          e.preventDefault();
          /* 投擲方向もテンキーは1回だけ（下の Arrow 分岐と二重にしない） */
          if (shiftRef?.current && e.code in _npmThrowCard) {
            if (arrowHeldRef) arrowHeldRef.current[_npmThrowCard[e.code]] = true;
            const _h = arrowHeldRef?.current || {};
            const _sdx = (_h.right ? 1 : 0) - (_h.left ? 1 : 0);
            const _sdy = (_h.down ? 1 : 0) - (_h.up ? 1 : 0);
            if (_sdx !== 0 && _sdy !== 0) execRef.current?.(_sdx, _sdy);
            return;
          }
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
          if (isNumpadEvent(e)) return;
          if (bigboxMode || gachaMode || springMode || putMode || markerMode || spellListMode || debugSpellMode || msgLogMode) {
            return;
          }
          /* Shift+矢印：2方向同時押しで斜め方向選択 */
          if (shiftRef?.current) {
            const _dmap = { arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right" };
            if (arrowHeldRef) arrowHeldRef.current[_dmap[k]] = true;
            const _h = arrowHeldRef?.current || {};
            const _sdx = (_h.right ? 1 : 0) - (_h.left ? 1 : 0);
            const _sdy = (_h.down ? 1 : 0) - (_h.up ? 1 : 0);
            if (_sdx !== 0 && _sdy !== 0) {
              execRef.current?.(_sdx, _sdy);
            }
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
      /* ===== ダンジョン移動（テンキー・矢印をここで一度だけ処理） ===== */
      if (bigboxMode || gachaMode || springMode || putMode || markerMode || spellListMode || debugSpellMode || msgLogMode || (shopModeRef?.current ?? shopMode) || throwMode !== null) {
        /* 投擲方向は throwMode ブロック側。ここでは移動しない */
      } else {
        const npm = {
          Numpad1: [-1, 1], Numpad2: [0, 1], Numpad3: [1, 1],
          Numpad4: [-1, 0], Numpad5: [0, 0], Numpad6: [1, 0],
          Numpad7: [-1, -1], Numpad8: [0, -1], Numpad9: [1, -1],
        };
        const km = {
          arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0],
        };
        const _npmCardinal = { Numpad8: "up", Numpad2: "down", Numpad4: "left", Numpad6: "right" };
        let dx = null, dy = null;

        if (isNumpadEvent(e)) {
          const npmCode = (e.code && e.code.startsWith("Numpad"))
            ? e.code
            : ({ ArrowUp: "Numpad8", ArrowDown: "Numpad2", ArrowLeft: "Numpad4", ArrowRight: "Numpad6" }[e.key]);
          if (npmCode && npm[npmCode] !== undefined) {
            e.preventDefault();
            /* Shift+テンキー縦横：2方向同時押しでのみ斜め */
            if (shiftRef?.current && npmCode in _npmCardinal) {
              if (arrowHeldRef) arrowHeldRef.current[_npmCardinal[npmCode]] = true;
              const _h = arrowHeldRef?.current || {};
              const _sdx = (_h.right ? 1 : 0) - (_h.left ? 1 : 0);
              const _sdy = (_h.down ? 1 : 0) - (_h.up ? 1 : 0);
              if (_sdx !== 0 && _sdy !== 0) { dx = _sdx; dy = _sdy; }
              else { return; }
            } else {
              [dx, dy] = npm[npmCode];
            }
          }
        } else if (km[k]) {
          e.preventDefault();
          if (shiftRef?.current) {
            const _dmap = { arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right" };
            if (arrowHeldRef) arrowHeldRef.current[_dmap[k]] = true;
            const _h = arrowHeldRef?.current || {};
            const _sdx = (_h.right ? 1 : 0) - (_h.left ? 1 : 0);
            const _sdy = (_h.down ? 1 : 0) - (_h.up ? 1 : 0);
            if (_sdx !== 0 && _sdy !== 0) { dx = _sdx; dy = _sdy; }
            else { return; }
          } else {
            [dx, dy] = km[k];
          }
        }

        if (dx !== null && dy !== null) {
          if (dx === 0 && dy === 0) act("wait");
          else if (aRef.current) doDash(dx, dy);
          else act("move", dx, dy);
          return;
        }
      }
      if (k === "w" && !showInv && !bigboxMode && !gachaMode && !springMode && !throwMode && !putMode) {
        e.preventDefault();
        const { player: _lp, dungeon: _ld } = sr.current || {};
        if (_lp && _ld) {
          setLookMode({ cx: _lp.x, cy: _lp.y });
          const _initDesc = getLookDesc(_lp.x, _lp.y, _ld);
          setMsgs(prev => [...prev.slice(-80), `[見渡す] 矢印キーで移動、xでキャンセル / ${_initDesc}`]);
        }
        return;
      }
      if (k === "m" && !showInv && !bigboxMode && !gachaMode && !springMode && !throwMode && !putMode && !spellListMode && !debugSpellMode) {
        e.preventDefault();
        const _mlTotal = msgsRef.current.length;
        setMsgLogScrollTop(Math.max(0, _mlTotal - 20));
        setMsgLogMode(true);
        return;
      }
      if (k === ".") {
        e.preventDefault();
        act("wait");
      } else if (k === " ") {
        e.preventDefault();
        setMapMode(true);
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
        !gachaMode &&
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
      springPage,
      wishMode,
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
      gachaMode,
      gachaMenuSel,
      setGachaMode,
      setGachaMenuSel,
      gachaRef,
      gachaDrawRef,
      altarRef,
      merchantRef,
      altarMode,
      altarMenuSel,
      merchantMode,
      merchantMenuSel,
      setAltarMode,
      setAltarMenuSel,
      setMerchantMode,
      setMerchantMenuSel,
      doOfferFood,
      doMerchantBuy,
      doMerchantSell,
      sortInventory,
      putPage,
      markerMode,
      markerMenuSel,
      markerPage,
      spellListMode,
      spellMenuSel,
      spellPage,
      debugSpellMode,
      debugSpellMenuSel,
      msgLogMode,
      msgLogScrollTop,
      dead,
      showEnding,
      gameOverSel,
      gameOverView,
      endingSel,
      endingView,
      showScores,
      nicknameMode,
      identifyMode,
      revealMode,
      tpSelectMode,
      floorSelectMode,
      lookMode,
      mapMode,
      setMapMode,
      getLookDesc,
      showSign,
      miniTip,
      closeMiniTip,
      exitHubConfirm,
      exitHubSel,
      setExitHubConfirm,
      setExitHubSel,
      performExitToHub,
      gameOverCanReturn,
      performGameOverReturnToHub,
      onDismissEnding,
      setEndingSel,
      setEndingView,
    ],
  );
  handleKeyRef.current = handleKey;
  /* グローバルに keydown は常に1本。HMR 後も古い listener を必ず外す */
  useEffect(() => {
    const onKeyDown = (e) => handleKeyRef.current?.(e);
    if (typeof window !== "undefined") {
      if (window[ROGUE_KD]) {
        window.removeEventListener("keydown", window[ROGUE_KD], true);
      }
      window[ROGUE_KD] = onKeyDown;
      window.addEventListener("keydown", onKeyDown, true);
    }
    return () => {
      if (typeof window !== "undefined" && window[ROGUE_KD] === onKeyDown) {
        window.removeEventListener("keydown", onKeyDown, true);
        delete window[ROGUE_KD];
      }
    };
  }, []);
}
