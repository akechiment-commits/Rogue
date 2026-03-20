import { useCallback, useEffect } from "react";
import { MW, MH, T, rng, uid, refreshFOV, getShops } from "./utils.js";
import {
  ITEMS, SPELLBOOKS, SPELLS, WANDS, POTS, TRAPS, BB_TYPES, RINGS,
  RAW_FOODS, COOKED_FOODS,
  itemPrice, placeItemAt, applySpellEffect, inMagicSealRoom,
  getIdentKey, randPotCapacity,
} from "./items.js";
import { MONS, MON_LEVELS } from "./monsters.js";
import { genDungeon } from "./dungeon.js";

export function useKeyHandler({
  // refs
  sr, shiftRef, aRef, execRef, invActRef, doMarkerWriteRef, bigboxRef, dropModeRef,
  // state values
  gs, dead, showScores, gameOverSel, throwMode, showInv, selIdx, invPage, invMenuSel,
  facingMode, springMode, springMenuSel, springPage, putMode, putMenuSel, putPage,
  markerMode, markerMenuSel, spellListMode, spellMenuSel, shopMode, shopMenuSel,
  bigboxMode, bigboxMenuSel, bigboxPage, nicknameMode, identifyMode, revealMode,
  tpSelectMode, floorSelectMode, lookMode, debugSpellMode, debugSpellMenuSel,
  // state setters
  setGs, setMsgs, setGameOverSel, setShowScores, setFloorSelectMode, setTpSelectMode,
  setLookMode, setShowInv, setSelIdx, setInvMenuSel, setShowDesc, setNicknameMode,
  setNicknameInput, setInvPage, setDropMode, setFacingMode, setThrowMode,
  setSpringMode, setSpringMenuSel, setSpringPage, setPutMode, setPutMenuSel, setPutPage,
  setMarkerMode, setMarkerMenuSel, setSpellListMode, setSpellMenuSel, setShopMode,
  setShopMenuSel, setBigboxMode, setBigboxMenuSel, setBigboxPage, setIdentifyMode,
  setRevealMode, setDebugSpellMode, setDebugSpellMenuSel,
  // callbacks
  init, act, doDash, doExamineFront, endTurn, springDrink, springDoSoak,
  bigboxPutItem, sortInventory, getLookDesc, lu,
}) {
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
            invActRef.current?.drop?.(invPage * 10 + selIdx);
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
            else if (aRef.current) doDash(dx, dy);
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
              if (identifyMode.blessed) { _newIt.blessed = true; _newIt.cursed = false; _newIt.bcKnown = true; }
              _p_id.inventory.push(_newIt);
              _msgResult = identifyMode.blessed ? `祝福された${_selIt.name}が1つ増えた！【祝】` : `${_selIt.name}が1つ増えた！`;
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
          if (identifyMode.scrollIdx != null) {
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
        } else if (_dsEff === "debug_get_item") {
          if (!_dsCat) { _dsTotalEntries = 13; } // カテゴリ数
          else if (_dsCat === "potions")     _dsTotalEntries = ITEMS.filter(x=>x.type==="potion").length + 1;
          else if (_dsCat === "scrolls")     _dsTotalEntries = ITEMS.filter(x=>x.type==="scroll").length + 1;
          else if (_dsCat === "weapons")     _dsTotalEntries = ITEMS.filter(x=>x.type==="weapon").length + 2;
          else if (_dsCat === "armors")      _dsTotalEntries = ITEMS.filter(x=>x.type==="armor").length;
          else if (_dsCat === "pens")        _dsTotalEntries = ITEMS.filter(x=>x.type==="pen").length + 1;
          else if (_dsCat === "arrows")      _dsTotalEntries = ITEMS.filter(x=>x.type==="arrow").length + 3;
          else if (_dsCat === "wands")       _dsTotalEntries = WANDS.length;
          else if (_dsCat === "spellbooks")  _dsTotalEntries = SPELLBOOKS.length;
          else if (_dsCat === "rings")       _dsTotalEntries = RINGS.length;
          else if (_dsCat === "pots")        _dsTotalEntries = POTS.length;
          else if (_dsCat === "raw_food")    _dsTotalEntries = RAW_FOODS.length;
          else if (_dsCat === "cooked_food") _dsTotalEntries = COOKED_FOODS.length;
          else if (_dsCat === "others")      _dsTotalEntries = 1; // 空き瓶のみ
        } else if (_dsEff === "debug_create_trap") {
          _dsTotalEntries = TRAPS.length;
        } else if (_dsEff === "debug_summon_bb") {
          _dsTotalEntries = BB_TYPES.length;
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
                const _allShopsPay = getShops(dg2);
                const _totalUnpaid = _allShopsPay.reduce((s, sh) => s + (sh.unpaidTotal || 0), 0);
                if (p2.gold >= _totalUnpaid) {
                  p2.gold -= _totalUnpaid;
                  _allShopsPay.forEach(sh => { sh.unpaidTotal = 0; });
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
          const mlen2 = 3;
          if (isUpBB || isDownBB) {
            setBigboxMenuSel((p) => (p + (isDownBB ? 1 : -1) + mlen2) % mlen2);
            return;
          }
          if (k === "enter" || k === "z") {
            if (bigboxMenuSel === 0) {
              setBigboxMode("put");
              setBigboxMenuSel(0);
              setBigboxPage(0);
            } else if (bigboxMenuSel === 1) {
              setBigboxMode(null);
              bigboxRef.current = null;
              setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
            } else {
              setBigboxMode("desc");
              setBigboxMenuSel(0);
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
          if (bigboxMode || springMode || putMode || markerMode || spellListMode || debugSpellMode) {
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
      if (e.code in numpadGame && !bigboxMode && !springMode && !putMode && !markerMode && !spellListMode && !debugSpellMode) {
        e.preventDefault();
        const nd = numpadGame[e.code];
        if (nd === null) {
          act("wait");
        } else if (aRef.current) {
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
        if (bigboxMode || springMode || putMode || markerMode || spellListMode || debugSpellMode) {
          return;
        }
        if (aRef.current) {
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
      springPage,
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
      debugSpellMode,
      debugSpellMenuSel,
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
}
