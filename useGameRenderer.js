import { useEffect, useRef, useCallback, useMemo } from 'react';
import { T, TI, MW, MH, clamp } from './utils.js';
import { drawTile, VW_M, VH_M, VW_D, VH_D, VW_L, VH_L, customTileImages } from './render.js';

/* 風穴の風向き別スプライト（画像未読込時は既存のキャンバス矢印へフォールバック） */
const VENT_TILE_BY_DIR = {
  '1,0': 194, '1,1': 195, '0,1': 196, '-1,1': 197,
  '-1,0': 198, '-1,-1': 199, '0,-1': 200, '1,-1': 201,
};

/* Easing */
function easeOutQuad(t) { return t * (2 - t); }

/* 8-direction player tile selection */
function playerTileForFacing(pf) {
  const { dx, dy } = pf;
  if (dx === 0 && dy > 0) return TI.PLAYER_DOWN;
  if (dx === 0 && dy < 0) return TI.PLAYER_UP;
  if (dx < 0 && dy === 0) return TI.PLAYER_LEFT;
  if (dx > 0 && dy === 0) return TI.PLAYER_RIGHT;
  if (dx < 0 && dy > 0) return TI.PLAYER_DOWN_LEFT;
  if (dx > 0 && dy > 0) return TI.PLAYER_DOWN_RIGHT;
  if (dx < 0 && dy < 0) return TI.PLAYER_UP_LEFT;
  if (dx > 0 && dy < 0) return TI.PLAYER_UP_RIGHT;
  return TI.PLAYER_DOWN;
}

/* 向きモード中にプレイヤー周囲に向き矢印を描画 (post-pass 用) */
function drawFacingIndicator(ctx, px, py, sz, dx, dy) {
  const arrowMap = {
    '0,-1':'↑','1,-1':'↗','1,0':'→','1,1':'↘',
    '0,1':'↓','-1,1':'↙','-1,0':'←','-1,-1':'↖',
  };
  const arrowChar = arrowMap[`${dx},${dy}`] || '↓';
  const ax = px + dx * sz, ay = py + dy * sz;
  ctx.save();
  /* プレイヤータイルに黄色枠 */
  ctx.strokeStyle = 'rgba(255,220,0,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, sz - 2, sz - 2);
  /* 隣接タイルに薄い黄色ハイライト */
  ctx.fillStyle = 'rgba(255,200,0,0.22)';
  ctx.fillRect(ax, ay, sz, sz);
  /* 隣接タイルに黄色枠 */
  ctx.strokeStyle = 'rgba(255,220,0,0.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ax + 1, ay + 1, sz - 2, sz - 2);
  /* 大きな矢印文字（影付き） */
  const fs = Math.max(10, Math.floor(sz * 0.82));
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillText(arrowChar, ax + sz / 2 + 1.5, ay + sz / 2 + 1.5);
  ctx.fillStyle = 'rgba(255,230,0,1.0)';
  ctx.fillText(arrowChar, ax + sz / 2, ay + sz / 2);
  ctx.restore();
}

/* ===== モンスターのバリア・状態異常ビジュアルオーバーレイ =====
 * バリア：タイル全体にシアンのパルス輝光（うっすら光る枠）
 * 状態異常：右上隅に小さなカラードット（下向きに積み重ね）
 * ─ 色凡例 ─  眠り=青  麻痺=白青  混乱=橙  移動封じ=氷青  毒=紫  封印=灰  暗闇=暗紫 */
function drawMonsterOverlays(ctx, mon, px, py, sz) {
  /* ── バリア輝光 ── */
  if (mon.barrier) {
    const _p = Math.sin(performance.now() / 400) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(30,190,255,${(0.06 + 0.05 * _p).toFixed(2)})`;
    ctx.fillRect(px, py, sz, sz);
    ctx.save();
    ctx.strokeStyle = `rgba(60,215,255,${(0.5 + 0.35 * _p).toFixed(2)})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 0.75, py + 0.75, sz - 1.5, sz - 1.5);
    ctx.restore();
  }
  /* ── 状態異常アイコン ── */
  const _sts = [];
  if ((mon.sleepTurns    || 0) > 0)                              _sts.push("#3870e8"); // 眠り：青
  if (mon.paralyzed || (mon.paralyzeTurns || 0) > 0)             _sts.push("#d0d8ff"); // 麻痺：白青
  if ((mon.confusedTurns || 0) > 0)                              _sts.push("#f09020"); // 混乱：橙
  if (mon.bewitched || (mon.bewitchedTurns || 0) > 0 || (mon.fleeingTurns || 0) > 0) _sts.push("#e0c020"); // 幻惑：黄金
  if ((mon.immobileTurns || 0) > 0)                              _sts.push("#50c8e8"); // 移動封じ：氷青
  if ((mon.poisonedTurns || 0) > 0)                              _sts.push("#b040d0"); // 毒：紫
  if (mon.sealed || (mon.sealedTurns || 0) > 0)                  _sts.push("#909090"); // 封印：灰
  if ((mon.darknessTurns || 0) > 0 && mon.darknessTurns < 9999)  _sts.push("#604878"); // 暗闇：暗紫
  if (mon.baseSpeed != null && (mon.speed ?? 1) > mon.baseSpeed)  _sts.push("#ff4040"); // 倍速：赤
  if (mon.baseSpeed != null && (mon.speed ?? 1) < mon.baseSpeed)  _sts.push("#20b8a0"); // 鈍足：青緑
  if ((mon.debuffAtkHalfTurns || 0) > 0)                           _sts.push("#ff6060"); // 攻撃力半減：赤橙
  if ((mon.debuffDefHalfTurns || 0) > 0)                           _sts.push("#6080ff"); // 防御力半減：青紫
  /* ── モンスターレベルバッジ（左上） ── */
  const _ml = mon.monLevel ?? 1;
  if (_ml >= 2) {
    const _fs = Math.max(7, Math.round(sz * 0.30));
    const _lbl = String(_ml);
    ctx.save();
    ctx.font = `bold ${_fs}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    /* 縁取り（黒） */
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.lineWidth = Math.max(2, Math.round(_fs * 0.35));
    ctx.lineJoin = "round";
    ctx.strokeText(_lbl, px + 2, py + 2);
    /* 本文字 */
    ctx.fillStyle = _ml >= 3 ? "#ff6600" : "#ffffff";
    ctx.fillText(_lbl, px + 2, py + 2);
    ctx.restore();
  }
  if (_sts.length === 0) return;
  const _ic = Math.max(4, Math.round(sz * 0.22)); // ドットサイズ（タイルの約22%）
  const _ox = px + sz - _ic - 1;
  for (let i = 0; i < _sts.length; i++) {
    const _iy = py + 2 + i * (_ic + 1);
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(_ox - 1, _iy - 1, _ic + 2, _ic + 2);
    ctx.fillStyle = _sts[i];
    ctx.fillRect(_ox, _iy, _ic, _ic);
  }
}

/*
 * Draw animation overlays (slash effects, damage popups, flashes, projectiles)
 * on top of the base scene.
 */
function drawOverlays(ctx, overlays, sx, sy, sz) {
  if (!overlays || overlays.length === 0) return;
  for (const o of overlays) {
    const t = o.t ?? easeOutQuad(o.progress ?? 0);  // eased progress 0-1
    const p = o.progress ?? 0;                       // raw progress 0-1
    if (o.type === "attack") {
      drawSlashEffect(ctx, o, sx, sy, sz, t);
    } else if (o.type === "damage") {
      drawDamagePopup(ctx, o, sx, sy, sz, p);
    } else if (o.type === "flash") {
      drawFlash(ctx, o, sx, sy, sz, p);
    } else if (o.type === "miss") {
      drawMissPopup(ctx, o, sx, sy, sz, p);
    } else if (o.type === "projectile") {
      drawProjectile(ctx, o, sx, sy, sz, t);
    } else if (o.type === "explosion") {
      drawExplosionEffect(ctx, o, sx, sy, sz, p);
    } else if (o.type === "splash") {
      drawSplashEffect(ctx, o, sx, sy, sz, p);
    } else if (o.type === "lightning") {
      drawLightningEffect(ctx, o, sx, sy, sz, p);
    } else if (o.type === "heal") {
      drawHealEffect(ctx, o, sx, sy, sz, p);
    } else if (o.type === "itemArc") {
      drawItemArc(ctx, o, sx, sy, sz, t);
    }
  }
}

/* ===== Slash Effect ===== */
function drawSlashEffect(ctx, o, sx, sy, sz, t) {
  const px = (o.x - sx) * sz;
  const py = (o.y - sy) * sz;
  const cx = px + sz / 2;
  const cy = py + sz / 2;
  const alpha = t < 0.5 ? 1 : 1 - (t - 0.5) * 2; // fade out in second half
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.translate(cx, cy);
  /* Rotate based on attack direction */
  const angle = Math.atan2(o.dy || 0, o.dx || 1);
  ctx.rotate(angle);
  /* Draw slash arc */
  const r = sz * 0.55;
  const sweep = t * Math.PI * 0.8;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(2, sz * 0.12);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, r, -sweep / 2, sweep / 2);
  ctx.stroke();
  /* Inner bright line */
  ctx.strokeStyle = "#ffe860";
  ctx.lineWidth = Math.max(1, sz * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, -sweep / 2, sweep / 2);
  ctx.stroke();
  ctx.restore();
}

/* ===== Damage Number Popup ===== */
function drawDamagePopup(ctx, o, sx, sy, sz, p) {
  const px = (o.x - sx) * sz + sz / 2;
  const baseY = (o.y - sy) * sz;
  /* Float upward */
  const floatY = baseY - p * sz * 0.8;
  /* Fade out in last 40% */
  const alpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const fontSize = Math.max(10, Math.floor(sz * 0.55));
  /* Scale up slightly at start */
  const scale = p < 0.15 ? 1 + (1 - p / 0.15) * 0.4 : 1;
  ctx.font = `bold ${Math.floor(fontSize * scale)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  /* Shadow */
  ctx.fillStyle = "#000";
  ctx.fillText(String(o.value), px + 1, floatY + 1);
  /* Number */
  ctx.fillStyle = o.color || "#ff4444";
  ctx.fillText(String(o.value), px, floatY);
  ctx.restore();
}

/* ===== Miss Popup ===== */
function drawMissPopup(ctx, o, sx, sy, sz, p) {
  const px = (o.x - sx) * sz + sz / 2;
  const baseY = (o.y - sy) * sz;
  const floatY = baseY - p * sz * 0.6;
  const alpha = p > 0.5 ? 1 - (p - 0.5) / 0.5 : 1;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha * 0.8;
  ctx.font = `bold ${Math.max(9, Math.floor(sz * 0.45))}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  ctx.fillText("MISS", px + 1, floatY + 1);
  ctx.fillStyle = "#aaaaaa";
  ctx.fillText("MISS", px, floatY);
  ctx.restore();
}

/* ===== Flash Effect ===== */
function drawFlash(ctx, o, sx, sy, sz, p) {
  const px = (o.x - sx) * sz;
  const py = (o.y - sy) * sz;
  const alpha = (1 - p) * 0.6;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = o.color || "#ffffff";
  ctx.fillRect(px, py, sz, sz);
  ctx.restore();
}

/* ===== Projectile ===== */
function _posOnOverlayPath(o, t, sx, sy, sz) {
  if (o.path?.length > 1) {
    /* マス座標 path をピクセル折れ線に */
    const segs = o.path.length - 1;
    const u = Math.max(0, Math.min(1, t)) * segs;
    const i = Math.min(segs - 1, Math.floor(u));
    const f = u - i;
    const a = o.path[i], b = o.path[i + 1];
    const mx = a.x + (b.x - a.x) * f;
    const my = a.y + (b.y - a.y) * f;
    return {
      cx: (mx - sx) * sz + sz / 2,
      cy: (my - sy) * sz + sz / 2,
    };
  }
  const fx = (o.fromX - sx) * sz + sz / 2;
  const fy = (o.fromY - sy) * sz + sz / 2;
  const tx = (o.toX - sx) * sz + sz / 2;
  const ty = (o.toY - sy) * sz + sz / 2;
  return { cx: fx + (tx - fx) * t, cy: fy + (ty - fy) * t, fx, fy, tx, ty };
}

function drawProjectile(ctx, o, sx, sy, sz, t) {
  const pos = _posOnOverlayPath(o, t, sx, sy, sz);
  const trail = _posOnOverlayPath(o, Math.max(0, t - 0.12), sx, sy, sz);
  const cx = pos.cx, cy = pos.cy;
  const alpha = t > 0.9 ? (1 - t) * 10 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  /* Draw projectile dot/trail */
  ctx.fillStyle = o.color || "#ffcc44";
  ctx.beginPath();
  ctx.arc(cx, cy, sz * 0.15, 0, Math.PI * 2);
  ctx.fill();
  /* Trail */
  ctx.globalAlpha = alpha * 0.45;
  ctx.strokeStyle = o.color || "#ffcc44";
  ctx.lineWidth = Math.max(1, sz * 0.08);
  ctx.beginPath();
  ctx.moveTo(trail.cx, trail.cy);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.restore();
}

/* ===== Explosion Effect ===== */
function drawExplosionEffect(ctx, o, sx, sy, sz, p) {
  const cx = (o.x - sx) * sz + sz / 2;
  const cy = (o.y - sy) * sz + sz / 2;
  const maxR = sz * (o.radius || 1.5);
  const r = Math.max(0, maxR * easeOutQuad(Math.min(1, p * 2)));
  const alpha = p > 0.4 ? Math.max(0, 1 - (p - 0.4) / 0.6) : 1;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  /* Outer glow */
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.3, "#ffaa22");
  grad.addColorStop(0.6, "#ff4400");
  grad.addColorStop(1, "rgba(255,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ===== Lightning Hit Effect ===== */
function drawLightningEffect(ctx, o, sx, sy, sz, p) {
  const bx = (o.x - sx) * sz;
  const by = (o.y - sy) * sz;
  const cx = bx + sz / 2;
  /* Fast flash then fade */
  const alpha = p < 0.25 ? 1 : Math.max(0, 1 - (p - 0.25) / 0.75);
  if (alpha <= 0) return;
  ctx.save();
  /* Blue-white background flash */
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = "#aabbff";
  ctx.fillRect(bx, by, sz, sz);
  /* Zigzag lightning bolt */
  const jx = sz * 0.22;
  const drawBolt = (lw, color, blur) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, lw);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = blur;
    ctx.shadowColor = "#88aaff";
    ctx.beginPath();
    ctx.moveTo(cx, by + sz * 0.04);
    ctx.lineTo(cx - jx, by + sz * 0.30);
    ctx.lineTo(cx + jx * 0.55, by + sz * 0.50);
    ctx.lineTo(cx - jx * 0.45, by + sz * 0.72);
    ctx.lineTo(cx, by + sz * 0.96);
    ctx.stroke();
  };
  ctx.globalAlpha = alpha * 0.88;
  drawBolt(sz * 0.1, "#ffffff", sz * 0.5);
  ctx.globalAlpha = alpha * 0.75;
  ctx.shadowBlur = 0;
  drawBolt(sz * 0.04, "#cce4ff", 0);
  ctx.restore();
}

/* ===== Heal Effect ===== */
function drawHealEffect(ctx, o, sx, sy, sz, p) {
  const bx = (o.x - sx) * sz;
  const by = (o.y - sy) * sz;
  const cx = bx + sz / 2;
  const cy = by + sz / 2;
  const alpha = p > 0.65 ? Math.max(0, 1 - (p - 0.65) / 0.35) : 1;
  if (alpha <= 0) return;
  ctx.save();
  /* Green radial glow */
  const r = Math.max(1, easeOutQuad(p) * sz * 0.72);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, "rgba(120,255,160,0.75)");
  grad.addColorStop(0.5, "rgba(60,200,100,0.4)");
  grad.addColorStop(1, "rgba(0,180,80,0)");
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  /* Rising sparkle particles */
  const sparkCount = 5;
  for (let i = 0; i < sparkCount; i++) {
    const angle = (i / sparkCount) * Math.PI * 2;
    const dist = sz * 0.3 * (0.55 + p * 0.65);
    const spx = cx + Math.cos(angle) * dist;
    const spy = cy + Math.sin(angle) * dist - p * sz * 0.45;
    const spr = Math.max(1, sz * 0.07 * (1 - p * 0.65));
    ctx.globalAlpha = alpha * 0.88;
    ctx.fillStyle = "#66ffaa";
    ctx.beginPath();
    ctx.arc(spx, spy, spr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ===== Splash Effect (potion/oil scatter) ===== */
function drawSplashEffect(ctx, o, sx, sy, sz, p) {
  const cx = (o.x - sx) * sz + sz / 2;
  const cy = (o.y - sy) * sz + sz / 2;
  const color = o.color || "#88ccff";
  const alpha = p > 0.55 ? Math.max(0, 1 - (p - 0.55) / 0.45) : 1;
  if (alpha <= 0) return;
  ctx.save();
  /* 8方向 + 中央のしぶき粒子 */
  const dirs = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const travel = easeOutQuad(Math.min(1, p * 1.6)) * sz * 0.82;
  for (const [dx, dy] of dirs) {
    const isCenter = dx === 0 && dy === 0;
    const px = cx + dx * travel;
    const py = cy + dy * travel;
    const r = Math.max(1, sz * (isCenter ? 0.16 : 0.11) * (1 - p * 0.55));
    ctx.globalAlpha = alpha * (isCenter ? 0.95 : 0.78);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    /* 各粒子に小さい光沢ハイライト */
    if (!isCenter && r > 2) {
      ctx.globalAlpha = alpha * 0.4;
      ctx.beginPath();
      ctx.arc(px - r * 0.25, py - r * 0.25, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  }
  /* 中央の広がる波紋 */
  const rippleR = easeOutQuad(p) * sz * 0.72;
  ctx.globalAlpha = alpha * 0.35 * (1 - p);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, sz * 0.06);
  ctx.beginPath();
  ctx.arc(cx, cy, rippleR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* ===== Item Fly Effect (straight throw or parabolic scatter) ===== */
function drawItemArc(ctx, o, sx, sy, sz, t) {
  /* 風で曲がる path 付き投擲：折れ線上を移動（直進→曲がる） */
  if (o.path?.length > 1 && o.straight) {
    const segs = o.path.length - 1;
    const u = Math.max(0, Math.min(1, t)) * segs;
    const i = Math.min(segs - 1, Math.floor(u));
    const f = u - i;
    const a = o.path[i], b = o.path[i + 1];
    const mx = a.x + (b.x - a.x) * f;
    const my = a.y + (b.y - a.y) * f;
    const curX = (mx - sx) * sz + sz / 2;
    const curY = (my - sy) * sz + sz / 2;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const spinAngle = angle + t * Math.PI * 1.5;
    const drawSz = sz * 0.95;
    ctx.save();
    /* 影 */
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(curX, curY + sz * 0.35, sz * 0.18, sz * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(curX, curY);
    ctx.rotate(spinAngle);
    try {
      drawTile(ctx, null, o.tile, -drawSz / 2, -drawSz / 2, drawSz);
    } catch {
      ctx.fillStyle = "#ffee88";
      ctx.fillRect(-drawSz / 2, -drawSz / 2, drawSz, drawSz);
    }
    ctx.restore();
    return;
  }

  const fx = (o.fromX - sx) * sz + sz / 2;
  const fy = (o.fromY - sy) * sz + sz / 2;
  const tx2 = (o.toX - sx) * sz + sz / 2;
  const ty2 = (o.toY - sy) * sz + sz / 2;
  const dist = Math.hypot(tx2 - fx, ty2 - fy);

  /* 弧の高さ：投擲(straight)は浅め、散乱は高め */
  const arcH = o.straight
    ? Math.max(sz * 0.25, dist * 0.12)   // 投擲：緩い弧
    : Math.max(sz * 0.9, dist * 0.55);   // 散乱：高い放物線

  const midX = (fx + tx2) / 2;
  const midY = (fy + ty2) / 2 - arcH;

  /* 2次ベジェ曲線上の現在地 */
  const curX = (1 - t) * (1 - t) * fx + 2 * (1 - t) * t * midX + t * t * tx2;
  const curY = (1 - t) * (1 - t) * fy + 2 * (1 - t) * t * midY + t * t * ty2;

  /* 地面の影（投擲は小さめ） */
  const shadowX = fx + (tx2 - fx) * t;
  const shadowY = fy + (ty2 - fy) * t + sz * 0.45;
  const heightFrac = Math.max(0, 1 - Math.abs(curY - shadowY) / (arcH + 1));
  const shadowScale = o.straight ? 0.6 : 1.0;
  const shadowRx = sz * 0.22 * shadowScale * (0.4 + heightFrac * 0.6);
  const shadowRy = sz * 0.06 * shadowScale * (0.4 + heightFrac * 0.6);
  ctx.save();
  ctx.globalAlpha = 0.25 * heightFrac * shadowScale;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(shadowX, shadowY, shadowRx, shadowRy, 0, 0, Math.PI * 2);
  ctx.fill();

  /* アイテムスプライト：投擲は回転あり、散乱は拡縮のみ */
  ctx.globalAlpha = 1;
  if (o.straight) {
    /* 投擲：飛行方向に軽く回転（スピン感） */
    const angle = Math.atan2(ty2 - fy, tx2 - fx);
    const spinAngle = angle + t * Math.PI * 1.5; // 1.5周回転
    const drawSz = sz * 0.9;
    ctx.translate(curX, curY);
    ctx.rotate(spinAngle);
    drawTile(ctx, null, o.tile, -drawSz / 2, -drawSz / 2, drawSz);
  } else {
    /* 散乱：頂点で少し大きくなる */
    const scale = 1 + 0.12 * Math.sin(t * Math.PI);
    const drawSz = sz * scale;
    drawTile(ctx, null, o.tile, curX - drawSz / 2, curY - drawSz / 2, drawSz);
  }
  ctx.restore();
}

/*
 * Core renderer hook.
 * Returns { renderFrame, overlaysRef } so animation loop can trigger redraws.
 */
export function useGameRenderer(canvasRef, gs, mobile, landscape, ctLoaded, tpSelectMode, lookMode, facingMode, desktopVW) {
  const overlaysRef = useRef([]);
  /* moveOffsets: Map<entityKey, {fromX, fromY, toX, toY, progress}> for smooth movement */
  const moveOffsetsRef = useRef(new Map());
  /* flyingItems: Set of "x,y" keys — items currently in-flight arc animation (hide at destination) */
  const flyingItemsRef = useRef(new Set());
  /* ダッシュ中の中間フレーム描画用：setGs を使わずに直接キャンバス更新するためのオーバーライド */
  const gsOverrideRef = useRef(null);

  const renderFrame = useCallback(() => {
    const _gs = gsOverrideRef.current || gs;
    if (!_gs || !canvasRef.current) return;
    const cvs = canvasRef.current,
      ctx = cvs.getContext("2d");
    const ts = null;
    const { player: p, dungeon: dg } = _gs;
    const _penMap = _gs.penSpriteMap;
    const _penTile = (it) => { const vi = 2000 + _penMap?.[it.effect]; return (it.tile === 42 && _penMap?.[it.effect] != null && customTileImages[vi]) ? vi : it.tile; };
    const _potMap = _gs.potionSpriteMap;
    const _potTile = (it) => { const vi = 3000 + _potMap?.[it.effect]; return ((it.tile === 16 || it.tile === 17) && it.type === 'potion' && _potMap?.[it.effect] != null && customTileImages[vi]) ? vi : it.tile; };
    const _categoryTile = (it) => {
      if (it?.type === "potion" && customTileImages[TI.ITEM_POTION]) return TI.ITEM_POTION;
      if (it?.type === "bottle" && customTileImages[TI.ITEM_BOTTLE]) return TI.ITEM_BOTTLE;
      if (it?.type === "pen" && customTileImages[TI.ITEM_PEN]) return TI.ITEM_PEN;
      return null;
    };
    const _spriteTile = (it) => {
      const category = _categoryTile(it);
      if (category != null) return category;
      const p2 = _potTile(it);
      return p2 !== it.tile ? p2 : _penTile(it);
    };
    const vw = mobile ? (landscape ? VW_L : VW_M) : (desktopVW || VW_D);
    const contW = cvs.parentElement?.clientWidth || 600;
    const sz = Math.max(12, Math.floor(contW / vw));
    let vh;
    if (mobile && !landscape) {
      const uiH = 270;
      const availH = window.innerHeight - uiH;
      vh = Math.max(VH_M, Math.min(Math.floor(availH / sz), MH));
    } else if (!mobile) {
      /* PC: ウィンドウ高さからUI固定要素（statsバー+メッセージ欄+padding+border）を引いて計算 */
      const uiH = 180; /* stats ~50px, msg 70px, padding/border ~60px */
      const availH = window.innerHeight - uiH;
      vh = Math.max(10, Math.floor(availH / sz));
    } else {
      vh = VH_L; /* mobile landscape */
    }
    const cw = vw * sz,
      ch = vh * sz;
    /* Only resize canvas when dimensions actually change (avoids full context reset) */
    if (cvs.width !== cw || cvs.height !== ch) {
      cvs.width = cw;
      cvs.height = ch;
      cvs.style.width = cw + "px";
      cvs.style.height = ch + "px";
    }
    ctx.imageSmoothingEnabled = false;
    const hw = Math.floor(vw / 2),
      hh = Math.floor(vh / 2);
    const _camCx = lookMode ? lookMode.cx : (tpSelectMode ? tpSelectMode.cx : p.x);
    const _camCy = lookMode ? lookMode.cy : (tpSelectMode ? tpSelectMode.cy : p.y);
    const sx = clamp(_camCx - hw, 0, Math.max(0, MW - vw)),
      sy = clamp(_camCy - hh, 0, Math.max(0, MH - vh));
    ctx.fillStyle = "#080810";
    ctx.fillRect(0, 0, cw, ch);

    /* Build move offset lookup */
    const moveOffsets = moveOffsetsRef.current;

    /* 座標インデックス構築 */
    const _k = (x, y) => y * MW + x;
    const _monMap = new Map(); for (const m of dg.monsters) { if (!m.disguisedAsItem) _monMap.set(_k(m.x, m.y), m); }
    const _flying = flyingItemsRef.current;
    /* flyingItemsRef はアイテムオブジェクト参照で管理 → 同座標の既存アイテムは隠さない */
    const _itemMap = new Map(); for (const i of dg.items) { if (!_itemMap.has(_k(i.x, i.y)) && !_flying.has(i)) _itemMap.set(_k(i.x, i.y), i); }
    const _trapMap = new Map(); for (const t2 of dg.traps) _trapMap.set(_k(t2.x, t2.y), t2);
    const _sprMap = new Map(); if (dg.springs) for (const s of dg.springs) _sprMap.set(_k(s.x, s.y), s);
    const _bbMap = new Map(); if (dg.bigboxes) for (const b of dg.bigboxes) _bbMap.set(_k(b.x, b.y), b);
    const _pentMap = new Map(); if (dg.pentacles) for (const pc of dg.pentacles) _pentMap.set(_k(pc.x, pc.y), pc);
    const _ventMap = new Map(); if (dg.vents) for (const v of dg.vents) _ventMap.set(_k(v.x, v.y), v);
    const _statueMap = new Map(); if (dg.statues) for (const s of dg.statues) _statueMap.set(_k(s.x, s.y), s);
    const _fakeStairMap = new Map();
    if (dg.traps) for (const tr of dg.traps) {
      if (tr.disguise && !tr.revealed) _fakeStairMap.set(_k(tr.x, tr.y), tr);
    }
    const _pendingBombMap = new Map(); if (dg.pendingBombs) for (const pb of dg.pendingBombs) _pendingBombMap.set(_k(pb.x, pb.y), pb);
    const _oilySet = new Set(); if (dg.oilyTiles) for (const ot of dg.oilyTiles) _oilySet.add(_k(ot.x, ot.y));
    const _roomSet = new Set();
    for (const r of [...dg.rooms, ...(dg.hiddenRooms || [])]) {
      for (let ry = r.y; ry < r.y + r.h; ry++) for (let rx = r.x; rx < r.x + r.w; rx++) _roomSet.add(_k(rx, ry));
    }

    /* Set of entities currently animating movement (skip normal draw at destination) */
    const _movingEntities = new Set();
    for (const [key] of moveOffsets) _movingEntities.add(key);
    const _hasBreakableWallArt = !!customTileImages[TI.BREAKABLE_WALL];
    const _hasOuterWallArt = !!customTileImages[TI.OUTER_WALL];
    const _hasWaterArt = !!customTileImages[TI.WATER];

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
        const t = dg.map[y][x];
        const _isOuterWall = t === T.WALL && (x === 0 || x === MW - 1 || y === 0 || y === MH - 1);
        let ti = TI.FLOOR;
        let _stairTile = null;
        if (t === T.WALL) ti = _isOuterWall && _hasOuterWallArt ? TI.OUTER_WALL : TI.WALL;
        else if (t === T.BWALL) ti = _hasBreakableWallArt ? TI.BREAKABLE_WALL : TI.WALL;
        else if (t === T.WATER) ti = _hasWaterArt ? TI.WATER : TI.FLOOR;
        else if (t === T.SD) {
          if ((p.bewitchedTurns || 0) > 0) ti = [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 3 + y * 17) % 9];
          else { _stairTile = TI.SD; ti = TI.CORR; }
        }
        else if (t === T.SU) {
          if ((p.bewitchedTurns || 0) > 0) ti = [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 5 + y * 11) % 9];
          else { _stairTile = TI.SU; ti = TI.CORR; }
        }
        if (t === T.FLOOR && !_roomSet.has(_k(x, y))) ti = TI.CORR;
        drawTile(ctx, ts, ti, px2, py2, sz);
        if (_stairTile != null) drawTile(ctx, ts, _stairTile, px2, py2, sz);
        /* 壊せる壁：特有の背景色＋目立つヒビ表示 */
        if (t === T.BWALL && !_hasBreakableWallArt && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          /* 通常壁より明るい褐色の背景 */
          ctx.fillStyle = "#3a2a14";
          ctx.fillRect(px2, py2, sz, sz);
          /* 砂岩っぽい文字色で # */
          ctx.fillStyle = "#7a5a30";
          ctx.font = "bold " + Math.floor(sz * 0.75) + "px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("#", px2 + sz / 2, py2 + sz / 2);
          ctx.textAlign = "start";
          /* 明るいヒビ（複数本、太め） */
          ctx.strokeStyle = "#ffcc66";
          ctx.lineWidth = Math.max(1.5, sz * 0.1);
          ctx.beginPath();
          ctx.moveTo(px2 + sz * 0.30, py2 + sz * 0.10);
          ctx.lineTo(px2 + sz * 0.48, py2 + sz * 0.45);
          ctx.lineTo(px2 + sz * 0.65, py2 + sz * 0.80);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px2 + sz * 0.48, py2 + sz * 0.45);
          ctx.lineTo(px2 + sz * 0.72, py2 + sz * 0.30);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px2 + sz * 0.20, py2 + sz * 0.60);
          ctx.lineTo(px2 + sz * 0.42, py2 + sz * 0.75);
          ctx.stroke();
          if (!vis) ctx.globalAlpha = 1;
        }
        /* 壁埋めアイテム */
        if ((t === T.WALL || t === T.BWALL) && (vis || exp2) && dg.itemsRevealed) {
          const _wi = dg.items.find(i => i.x === x && i.y === y && i.wallEmbedded);
          if (_wi) {
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = "rgba(255,220,60,0.25)";
            ctx.fillRect(px2, py2, sz, sz);
            drawTile(ctx, ts, _spriteTile(_wi), px2, py2, sz);
            ctx.globalAlpha = 1;
          }
        }
        /* Water tile */
        if (t === T.WATER && !_hasWaterArt && (vis || exp2)) {
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
        }
        if (t === T.WATER && vis && dg.waterItems?.some(wi => wi.x === x && wi.y === y)) {
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = "#ffee88";
          ctx.beginPath();
          ctx.arc(px2 + sz * 0.8, py2 + sz * 0.2, sz * 0.15, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        /* Oily floor */
        if (_oilySet.has(_k(x, y)) && (vis || exp2)) {
          ctx.globalAlpha = vis ? 0.38 : 0.15;
          ctx.fillStyle = "#b08820";
          ctx.fillRect(px2, py2, sz, sz);
          ctx.globalAlpha = 1;
        }
        /* 偽階段（未看破）：本物の階段と同じ見た目 */
        const _fakeSt = _fakeStairMap.get(_k(x, y));
        if (_fakeSt && (vis || exp2) && t === T.FLOOR) {
          if (!vis) ctx.globalAlpha = 0.4;
          const _fsTi = _fakeSt.disguise === "stair_up" ? TI.SU : TI.SD;
          drawTile(ctx, ts, TI.CORR, px2, py2, sz);
          drawTile(ctx, ts, _fsTi, px2, py2, sz);
          if (!vis) ctx.globalAlpha = 1;
        }
        /* 風穴：風向き別の専用スプライト。画像が未読込の環境では従来描画を使う */
        const _vent = _ventMap.get(_k(x, y));
        if (_vent && (vis || exp2)) {
          ctx.save();
          if (!vis) ctx.globalAlpha = 0.45;
          let vdx = Math.sign(_vent.dx || 0), vdy = Math.sign(_vent.dy || 0);
          if (vdx === 0 && vdy === 0) vdy = 1;
          const _ventTile = VENT_TILE_BY_DIR[`${vdx},${vdy}`];
          if (_ventTile && customTileImages[_ventTile]) {
            drawTile(ctx, ts, _ventTile, px2, py2, sz);
          } else {
            /* 旧環境用のフォールバック：濃い枠＋キャンバス矢印 */
            ctx.fillStyle = "rgba(30,120,200,0.45)";
            ctx.fillRect(px2 + 1, py2 + 1, sz - 2, sz - 2);
            ctx.strokeStyle = "rgba(80,220,255,0.95)";
            ctx.lineWidth = Math.max(2, sz * 0.08);
            ctx.strokeRect(px2 + 2, py2 + 2, sz - 4, sz - 4);
            const vcx = px2 + sz / 2, vcy = py2 + sz / 2;
            const len = sz * 0.32;
            const tipX = vcx + vdx * len, tipY = vcy + vdy * len;
            const tailX = vcx - vdx * len * 0.7, tailY = vcy - vdy * len * 0.7;
            ctx.strokeStyle = "#e8ffff";
            ctx.fillStyle = "#40e8ff";
            ctx.lineWidth = Math.max(2.5, sz * 0.12);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            const ang = Math.atan2(vdy, vdx);
            const ah = sz * 0.22;
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - Math.cos(ang - 0.55) * ah, tipY - Math.sin(ang - 0.55) * ah);
            ctx.lineTo(tipX - Math.cos(ang + 0.55) * ah, tipY - Math.sin(ang + 0.55) * ah);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
        /* 石像：スタイル3では専用画像、その他では従来のフォールバック */
        const _statue = _statueMap.get(_k(x, y));
        if (_statue && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.45;
          if (customTileImages[TI.STATUE]) {
            drawTile(ctx, ts, TI.STATUE, px2, py2, sz);
          } else {
            const m = Math.max(1, Math.floor(sz * 0.08));
            /* 本体 */
            ctx.fillStyle = "#6a6a78";
            ctx.fillRect(px2 + m, py2 + m, sz - m * 2, sz - m * 2);
            /* ハイライト／影で立体感 */
            ctx.fillStyle = "#9a9aaa";
            ctx.fillRect(px2 + m, py2 + m, sz - m * 2, Math.max(2, Math.floor(sz * 0.18)));
            ctx.fillStyle = "#3a3a48";
            ctx.fillRect(px2 + m, py2 + sz - m - Math.max(2, Math.floor(sz * 0.14)), sz - m * 2, Math.max(2, Math.floor(sz * 0.14)));
            /* 枠 */
            ctx.strokeStyle = "#d8d8e8";
            ctx.lineWidth = Math.max(1, sz * 0.06);
            ctx.strokeRect(px2 + m + 0.5, py2 + m + 0.5, sz - m * 2 - 1, sz - m * 2 - 1);
            ctx.fillStyle = "#f0f0ff";
            ctx.font = `bold ${Math.floor(sz * 0.55)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("石", px2 + sz / 2, py2 + sz / 2 + 1);
          }
          if (!vis) ctx.globalAlpha = 1;
        }
        /* Spring */
        const spr = _sprMap.get(_k(x, y));
        if (spr && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          const _sprTile = (p.bewitchedTurns || 0) > 0 ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 5 + y * 17) % 9] : TI.SPRING;
          drawTile(ctx, ts, _sprTile, px2, py2, sz);
          if (!vis) ctx.globalAlpha = 1;
        }
        const bba = _bbMap.get(_k(x, y));
        if (bba && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          const _bbaTile = (p.bewitchedTurns || 0) > 0 ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 17 + y * 5) % 9] : TI.BIGBOX;
          drawTile(ctx, ts, _bbaTile, px2, py2, sz);
          if (!vis) ctx.globalAlpha = 1;
        }
        /* Pentacle */
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
            _pent.kind === "plain"          ? (_pent.blessed ? "#dddddd" : _pent.cursed ? "#555555" : "#999999") :
            _pent.kind === "fixed_portal"   ? "#40e0c0" :
            _pent.kind === "portal"         ? (_pent.blessed ? "#80ffe0" : _pent.cursed ? "#204040" : "#40c0a0") : "#ff6020";
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = _pentClr;
          ctx.fillRect(px2, py2, sz, sz);
          ctx.globalAlpha = 0.85;
          const _pentImg = customTileImages[_pent.kind === "fixed_portal" ? TI.FIXED_PORTAL : TI.PENTACLE];
          if (_pentImg) {
            ctx.drawImage(_pentImg, px2, py2, sz, sz);
          } else {
            ctx.fillStyle = _pentClr;
            ctx.font = `bold ${Math.floor(sz * 0.78)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("✦", px2 + sz / 2, py2 + sz / 2);
          }
          ctx.globalAlpha = 1;
        }
        /* Pending bomb (作動済み時限爆弾) */
        const _pbAt = _pendingBombMap.get(_k(x, y));
        if (_pbAt) {
          if (vis) {
            drawTile(ctx, ts, 73, px2, py2, sz);
            const _pbClr = _pbAt.turnsLeft <= 1 ? "#ff2020" : _pbAt.turnsLeft <= 2 ? "#ff8800" : "#ffff00";
            ctx.font = `bold ${Math.floor(sz * 0.55)}px monospace`;
            ctx.fillStyle = _pbClr;
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            ctx.fillText(_pbAt.turnsLeft, px2 + sz - 1, py2 + 1);
            ctx.textAlign = "start";
          } else if (exp2) {
            ctx.globalAlpha = 0.4;
            drawTile(ctx, ts, 73, px2, py2, sz);
            ctx.globalAlpha = 1;
          }
        }
        if (vis) {
          /* Player — skip if currently animating (will be drawn separately) */
          if (x === p.x && y === p.y && !_movingEntities.has("player")) {
            if ((p.potConfinedTurns || 0) > 0) {
              drawTile(ctx, ts, TI.POT, px2, py2, sz);
            } else {
              const pf = p.facing || { dx: 0, dy: 1 };
              const pti = playerTileForFacing(pf);
              /* アイテム・罠をプレイヤーの下に先描画（階段と同様に隙間から見えるように） */
              const _pitItem = _itemMap.get(_k(x, y));
              if (_pitItem && !_pitItem.wallEmbedded) {
                const _piTile = (p.bewitchedTurns||0)>0 ? [16,17,18,20,21,22,23,24,32][(x*11+y*19)%9] : _spriteTile(_pitItem);
                drawTile(ctx, ts, _piTile, px2, py2, sz);
              }
              const _pitTrap = _trapMap.get(_k(x, y));
              if (_pitTrap?.revealed) {
                const _ptTile = (p.bewitchedTurns||0)>0 ? [16,17,18,20,21,22,23,24,32][(x*13+y*7)%9] : _pitTrap.tile;
                drawTile(ctx, ts, _ptTile, px2, py2, sz);
              }
              drawTile(ctx, ts, customTileImages[pti] ? pti : TI.PLAYER, px2, py2, sz);
            }
            continue;
          }
          /* Monster — skip if animating */
          const mon = (() => { const _m = _monMap.get(_k(x, y)); return _m && !_m.wallWalker ? _m : undefined; })();
          if (mon && !_movingEntities.has("mon_" + mon.id)) {
            const _monTile = (p.bewitchedTurns || 0) > 0
              ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 7 + y * 13) % 9]
              : mon.tile;
            drawTile(ctx, ts, _monTile, px2, py2, sz);
            if (mon.hp < mon.maxHp) {
              const bw = sz - 2, bh = 2, hpR = mon.hp / mon.maxHp;
              ctx.fillStyle = "#300";
              ctx.fillRect(px2 + 1, py2, bw, bh);
              ctx.fillStyle = hpR > 0.5 ? "#0c0" : hpR > 0.25 ? "#cc0" : "#f22";
              ctx.fillRect(px2 + 1, py2, Math.max(1, bw * hpR), bh);
            }
            drawMonsterOverlays(ctx, mon, px2, py2, sz);
            continue;
          }
          /* Item */
          const it = (() => { const _i = _itemMap.get(_k(x, y)); return _i && !_i.wallEmbedded ? _i : undefined; })();
          if (it) {
            const _itTile = (p.bewitchedTurns || 0) > 0
              ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 11 + y * 19) % 9]
              : _spriteTile(it);
            drawTile(ctx, ts, _itTile, px2, py2, sz);
            continue;
          }
          /* Trap */
          const tr = (() => { const _t = _trapMap.get(_k(x, y)); return _t?.revealed ? _t : undefined; })();
          if (tr) {
            const _trTile = (p.bewitchedTurns || 0) > 0 ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 13 + y * 7) % 9] : tr.tile;
            drawTile(ctx, ts, _trTile, px2, py2, sz);
          }
        } else if (exp2) {
          ctx.fillStyle = "rgba(0,0,8,0.6)";
          ctx.fillRect(px2, py2, sz, sz);
          const _inDark = (p.darknessTurns || 0) > 0;
          if (!_inDark) {
            const ri = (() => { const _i = _itemMap.get(_k(x, y)); return _i && !_i.wallEmbedded && (_i.discovered || dg.itemsRevealed) ? _i : undefined; })();
            if (ri) { ctx.globalAlpha = 0.4; drawTile(ctx, ts, _spriteTile(ri), px2, py2, sz); ctx.globalAlpha = 1; }
            const tr = (() => { const _t = _trapMap.get(_k(x, y)); return _t?.revealed ? _t : undefined; })();
            if (tr) { ctx.globalAlpha = 0.4; const _trTile2 = (p.bewitchedTurns || 0) > 0 ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 13 + y * 7) % 9] : tr.tile; drawTile(ctx, ts, _trTile2, px2, py2, sz); ctx.globalAlpha = 1; }
          }
        }
      }
    }

    /* ===== Draw moving entities at interpolated positions ===== */
    for (const [key, mo] of moveOffsets) {
      const t2 = easeOutQuad(mo.progress);
      const drawX = mo.fromX + (mo.toX - mo.fromX) * t2;
      const drawY = mo.fromY + (mo.toY - mo.fromY) * t2;
      const dpx = (drawX - sx) * sz;
      const dpy = (drawY - sy) * sz;
      if (dpx < -sz || dpx > cw + sz || dpy < -sz || dpy > ch + sz) continue;
      if (key === "player") {
        if ((p.potConfinedTurns || 0) > 0) {
          drawTile(ctx, ts, TI.POT, dpx, dpy, sz);
        } else {
          const pf = p.facing || { dx: 0, dy: 1 };
          const pti = playerTileForFacing(pf);
          drawTile(ctx, ts, customTileImages[pti] ? pti : TI.PLAYER, dpx, dpy, sz);
        }
      } else if (key.startsWith("mon_") && mo.tile != null) {
        /* Skip if neither start nor end position is visible to the player */
        const _fromVis = dg.visible[Math.round(mo.fromY)]?.[Math.round(mo.fromX)];
        const _toVis = dg.visible[Math.round(mo.toY)]?.[Math.round(mo.toX)];
        if (!_fromVis && !_toVis) continue;
        const _monTile2 = (p.bewitchedTurns || 0) > 0
          ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(Math.floor(drawX) * 7 + Math.floor(drawY) * 13) % 9]
          : mo.tile;
        drawTile(ctx, ts, _monTile2, dpx, dpy, sz);
        /* HP bar for moving monster */
        if (mo.hp != null && mo.maxHp != null && mo.hp < mo.maxHp) {
          const bw = sz - 2, bh = 2, hpR = mo.hp / mo.maxHp;
          ctx.fillStyle = "#300";
          ctx.fillRect(dpx + 1, dpy, bw, bh);
          ctx.fillStyle = hpR > 0.5 ? "#0c0" : hpR > 0.25 ? "#cc0" : "#f22";
          ctx.fillRect(dpx + 1, dpy, Math.max(1, bw * hpR), bh);
        }
        /* status overlays: look up live monster object by id */
        const _movMonRef = dg.monsters.find(m => m.id === key.slice(4));
        if (_movMonRef) drawMonsterOverlays(ctx, _movMonRef, dpx, dpy, sz);
      }
    }

    /* ===== モンスター感知（monsterSenseTurns / monsterSenseActive / 透視の指輪） ===== */
    const _hasClairvoyanceRing = p.rings?.some(r => r.effect === "clairvoyance_ring");
    if ((p.monsterSenseTurns || 0) > 0 || dg.monsterSenseActive || _hasClairvoyanceRing) {
      for (const _sm of dg.monsters) {
        if (_sm.wallWalker) continue;
        if (dg.visible[_sm.y]?.[_sm.x]) continue;
        if (_sm.x < sx || _sm.x >= sx + vw || _sm.y < sy || _sm.y >= sy + vh) continue;
        if (_movingEntities.has("mon_" + _sm.id)) continue;
        const _spx = (_sm.x - sx) * sz, _spy = (_sm.y - sy) * sz;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = "rgba(200,30,30,0.25)";
        ctx.fillRect(_spx, _spy, sz, sz);
        drawTile(ctx, ts, _sm.tile, _spx, _spy, sz);
        ctx.globalAlpha = 1;
      }
    }
    /* ===== アイテム感知（感知の指輪） ===== */
    if (p.rings?.some(r => r.effect === "detect_ring")) {
      for (const _si of dg.items) {
        if (_si.wallEmbedded) continue;
        if (dg.visible[_si.y]?.[_si.x]) continue;
        if (_si.x < sx || _si.x >= sx + vw || _si.y < sy || _si.y >= sy + vh) continue;
        const _ipx = (_si.x - sx) * sz, _ipy = (_si.y - sy) * sz;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = "rgba(30,120,200,0.25)";
        ctx.fillRect(_ipx, _ipy, sz, sz);
        drawTile(ctx, ts, _spriteTile(_si), _ipx, _ipy, sz);
        ctx.globalAlpha = 1;
      }
    }
    /* ===== 壁歩きモンスター ===== */
    for (const _wm of dg.monsters) {
      if (!_wm.wallWalker) continue;
      if (_wm.x < sx || _wm.x >= sx + vw || _wm.y < sy || _wm.y >= sy + vh) continue;
      const _wVisible = dg.visible?.[_wm.y]?.[_wm.x];
      const _wAdj = Math.abs(_wm.x - p.x) <= 1 && Math.abs(_wm.y - p.y) <= 1;
      if (!_wVisible && !_wAdj) continue;
      if (_movingEntities.has("mon_" + _wm.id)) continue;
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
      drawMonsterOverlays(ctx, _wm, _wpx, _wpy, sz);
    }

    /* ===== lookMode cursor ===== */
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
    /* ===== tpSelectMode cursor ===== */
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

    /* ===== 向きモード：向き矢印を全タイルの上に描画 ===== */
    if (facingMode) {
      const pf = p.facing || { dx: 0, dy: 1 };
      const _ppx = (p.x - sx) * sz, _ppy = (p.y - sy) * sz;
      drawFacingIndicator(ctx, _ppx, _ppy, sz, pf.dx, pf.dy);
    }

    /* ===== Animation overlays (effects drawn on top) ===== */
    drawOverlays(ctx, overlaysRef.current, sx, sy, sz);

  }, [gs, mobile, landscape, ctLoaded, tpSelectMode, lookMode, facingMode, desktopVW]);

  /* Auto-render on state change */
  useEffect(() => {
    renderFrame();
  }, [renderFrame]);

  /* Always-current ref so playAnim can call the latest renderFrame after async phases */
  const renderFrameRef = useRef(renderFrame);
  useEffect(() => { renderFrameRef.current = renderFrame; }, [renderFrame]);

  return { renderFrame, renderFrameRef, overlaysRef, moveOffsetsRef, flyingItemsRef, gsOverrideRef };
}
