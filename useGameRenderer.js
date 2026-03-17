import { useEffect } from 'react';
import { T, TI, MW, MH, clamp } from './utils.js';
import { drawTile, VW_M, VH_M, VW_D, VH_D, VW_L, VH_L, customTileImages } from './render.js';

export function useGameRenderer(canvasRef, gs, mobile, landscape, ctLoaded, tpSelectMode, lookMode) {
  useEffect(() => {
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
    /* 座標インデックス構築: O(n)→O(1)ルックアップ */
    const _k = (x, y) => y * MW + x;
    const _monMap = new Map(); for (const m of dg.monsters) _monMap.set(_k(m.x, m.y), m);
    const _itemMap = new Map(); for (const i of dg.items) { if (!_itemMap.has(_k(i.x, i.y))) _itemMap.set(_k(i.x, i.y), i); }
    const _trapMap = new Map(); for (const t2 of dg.traps) _trapMap.set(_k(t2.x, t2.y), t2);
    const _sprMap = new Map(); if (dg.springs) for (const s of dg.springs) _sprMap.set(_k(s.x, s.y), s);
    const _bbMap = new Map(); if (dg.bigboxes) for (const b of dg.bigboxes) _bbMap.set(_k(b.x, b.y), b);
    const _pentMap = new Map(); if (dg.pentacles) for (const pc of dg.pentacles) _pentMap.set(_k(pc.x, pc.y), pc);
    const _oilySet = new Set(); if (dg.oilyTiles) for (const ot of dg.oilyTiles) _oilySet.add(_k(ot.x, ot.y));
    /* 部屋マップ: 全部屋の矩形をタイルレベルでフラグ化 */
    const _roomSet = new Set();
    for (const r of [...dg.rooms, ...(dg.hiddenRooms || [])]) {
      for (let ry = r.y; ry < r.y + r.h; ry++) for (let rx = r.x; rx < r.x + r.w; rx++) _roomSet.add(_k(rx, ry));
    }
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
        /* Check if in corridor (not in any room, including hidden rooms) */
        if (t === T.FLOOR && !_roomSet.has(_k(x, y))) ti = TI.CORR;
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
          const _wi = dg.items.find(i => i.x === x && i.y === y && i.wallEmbedded); /* wall-embedded: rare, keep linear */
          if (_wi) {
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = "rgba(255,220,60,0.25)";
            ctx.fillRect(px2, py2, sz, sz);
            drawTile(ctx, ts, _wi.tile, px2, py2, sz);
            ctx.globalAlpha = 1;
          }
        }
        /* Water tile */
        if (t === T.WATER && (vis || exp2)) {
          ctx.globalAlpha = vis ? 1 : 0.4;
          ctx.fillStyle = "#0d2a5c";
          ctx.fillRect(px2, py2, sz, sz);
          ctx.globalAlpha = vis ? 0.8 : 0.25;
          ctx.fillStyle = "#1a5fcc";
          ctx.fillRect(px2, py2, sz, sz);
          ctx.globalAlpha = vis ? 0.9 : 0.3;
          ctx.fillStyle = "#4499ff";
          ctx.font = `bold ${sz}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("~", px2 + sz / 2, py2 + sz / 2);
          ctx.globalAlpha = 1;
          /* waterItems as faint dots */
          if (vis && dg.waterItems?.some(wi => wi.x === x && wi.y === y)) {
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = "#ffee88";
            ctx.beginPath();
            ctx.arc(px2 + sz * 0.8, py2 + sz * 0.2, sz * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
        /* Oily floor */
        if (_oilySet.has(_k(x, y)) && (vis || exp2)) {
          ctx.globalAlpha = vis ? 0.38 : 0.15;
          ctx.fillStyle = "#b08820";
          ctx.fillRect(px2, py2, sz, sz);
          ctx.globalAlpha = 1;
        }
        /* Spring */ const spr = _sprMap.get(_k(x, y));
        if (spr && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          drawTile(ctx, ts, TI.SPRING, px2, py2, sz);
          if (!vis) ctx.globalAlpha = 1;
        }
        const bba = _bbMap.get(_k(x, y));
        if (bba && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          drawTile(ctx, ts, TI.BIGBOX, px2, py2, sz);
          if (!vis) ctx.globalAlpha = 1;
        }
        /* Pentacle (魔方陣) */
        const _pent = _pentMap.get(_k(x, y));
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
          /* Monster (壁歩きは別パスで描画) */ const mon = (() => { const _m = _monMap.get(_k(x, y)); return _m && !_m.wallWalker ? _m : undefined; })();
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
          /* Item */ const it = (() => { const _i = _itemMap.get(_k(x, y)); return _i && !_i.wallEmbedded ? _i : undefined; })();
          if (it) {
            const _itTile = (p.bewitchedTurns || 0) > 0
              ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 11 + y * 19) % 9]
              : it.tile;
            drawTile(ctx, ts, _itTile, px2, py2, sz);
            continue;
          }
          /* Trap */ const tr = (() => { const _t = _trapMap.get(_k(x, y)); return _t?.revealed ? _t : undefined; })();
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
            const ri = (() => { const _i = _itemMap.get(_k(x, y)); return _i && !_i.wallEmbedded && (_i.discovered || dg.itemsRevealed) ? _i : undefined; })();
            if (ri) { ctx.globalAlpha = 0.4; drawTile(ctx, ts, ri.tile, px2, py2, sz); ctx.globalAlpha = 1; }
            /* 発見済み罠を薄く表示 */
            const tr = (() => { const _t = _trapMap.get(_k(x, y)); return _t?.revealed ? _t : undefined; })();
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
}
