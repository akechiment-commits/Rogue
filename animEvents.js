/*
 * Global animation event collector.
 * Game logic functions push events here via pushAnim().
 * Game.jsx drains them after each action to play animations.
 *
 * Event types:
 *   projectile: { type, fromX, fromY, toX, toY, color }
 *   explosion:  { type, x, y }
 *   damage:     { type, x, y, value, color }
 *   flash:      { type, x, y, color }
 *   miss:       { type, x, y }
 */

import { MW, MH, T, monsterAt, itemAt, stepProjectile, traceProjectilePath } from './utils.js';

const animEvents = [];

export function pushAnim(event) {
  animEvents.push(event);
}

export function drainAnims() {
  const evts = [...animEvents];
  animEvents.length = 0;
  return evts;
}

/* 空腹ダメージ開始シグナル */
let _hungerWarnPending = false;
export function signalHungerWarn() { _hungerWarnPending = true; }
export function drainHungerWarn() { const v = _hungerWarnPending; _hungerWarnPending = false; return v; }

/* ピンチアラートシグナル */
let _pinchAlertPending = false;
export function signalPinchAlert() { _pinchAlertPending = true; }
export function drainPinchAlert() { const v = _pinchAlertPending; _pinchAlertPending = false; return v; }

/*
 * Item fly animation queue.
 *
 * straight: true  → 投擲（緩い弧、直線的）seq=0 で最初に再生
 * straight: false → 散乱・罠バウンス（高い放物線）seq=1+ で順次再生
 *
 * Groups with the same seq play in parallel; lower seq plays first.
 */
const _itemArcQueue = [];

/*
 * Player throws an item — flight with optional path (wind bends).
 * path: [{x,y},...] があれば折れ線飛行。なければ from→to 直線。
 * seq=0 ensures it plays before any scatter arcs.
 */
export function pushItemFlyAnim(fromX, fromY, toX, toY, tile, path = null) {
  if (path?.length > 1) {
    const end = path[path.length - 1];
    _itemArcQueue.push({
      type: "itemArc", fromX: path[0].x, fromY: path[0].y,
      toX: end.x, toY: end.y, tile, seq: 0, straight: true, path,
    });
    return;
  }
  if (fromX === toX && fromY === toY) return;
  _itemArcQueue.push({ type: "itemArc", fromX, fromY, toX, toY, tile, seq: 0, straight: true });
}

/** 風を含む経路で投擲アニメを登録 */
export function pushItemFlyAnimAlongWind(dg, fromX, fromY, dx, dy, maxRange, tile, opts = {}) {
  const tr = traceProjectilePath(dg, fromX, fromY, dx, dy, maxRange, {
    stopAtMon: opts.stopAtMon !== false,
    stopAtPlayer: opts.stopAtPlayer || null,
    stopAtContainers: !!opts.stopAtContainers,
    passWall: !!opts.passWall,
  });
  pushItemFlyAnim(fromX, fromY, tr.endX, tr.endY, tile, tr.path);
  return tr;
}

/*
 * Item scattered/displaced (placeItemAt, explosion, pot break, trap bounce).
 * Parabolic arc. seq=dep+1 so trap-bounced items play after initial scatter.
 * itemRef: 着地してdg.itemsに追加されたオブジェクト参照（flyingItemsRef用）
 */
export function pushItemArcAnim(fromX, fromY, toX, toY, tile, seq = 1, itemRef = null) {
  if (fromX === toX && fromY === toY) return;
  _itemArcQueue.push({ type: "itemArc", fromX, fromY, toX, toY, tile, seq, straight: false, itemRef });
}

/*
 * Push a return arc for a reflected thrown item.
 * seq=1 ensures it plays after the outgoing throw (seq=0) in Phase 2d.
 */
export function pushItemReturnAnim(fromX, fromY, toX, toY, tile) {
  if (fromX === toX && fromY === toY) return;
  _itemArcQueue.push({ type: "itemArc", fromX, fromY, toX, toY, tile, seq: 1, straight: true });
}


export function drainItemArcs() {
  if (_itemArcQueue.length === 0) return [];
  const arcs = [..._itemArcQueue];
  _itemArcQueue.length = 0;
  const groups = {};
  for (const a of arcs) {
    const s = a.seq ?? 1;
    (groups[s] = groups[s] || []).push(a);
  }
  return Object.keys(groups).map(Number).sort((a, b) => a - b).map(k => groups[k]);
}

/* Wand effect → bolt color */
const WAND_COLORS = {
  lightning: "#88ccff", slow: "#20d0d0", paralyze: "#ffcc00", sleep: "#80ff40",
  confuse: "#ff40ff", darkness: "#606080", bewitch: "#ff80c0", levelup: "#ffff60",
  seal: "#8040e0", knockback: "#20e0c0", swap: "#ff8800", dig: "#aa8844",
  leap: "#40ff80", ice_wand: "#80ddff", curse_wand: "#9020b0", blowback_wand: "#20e0c0",
  confuse_wand: "#dd44ff", sleep_wand: "#44ff88", teleport_wand: "#ff9900",
};

/*
 * Trace a bolt/projectile path and push a projectile animation.
 * Stops at walls, monsters, items, traps, bigboxes.
 * Call BEFORE the actual game logic (which may modify state).
 */
export function pushBoltAnim(sx, sy, dx, dy, dg, effectOrColor = "#a050f0") {
  const color = WAND_COLORS[effectOrColor] || effectOrColor;
  const tr = traceProjectilePath(dg, sx, sy, dx, dy, MW + MH, {
    stopAtMon: true,
    stopAtPlayer: null,
    stopAtContainers: true,
  });
  /* 罠・アイテムでも止める追加チェックは path 上で実施 */
  let path = tr.path;
  let endX = tr.endX, endY = tr.endY;
  for (let i = 1; i < path.length; i++) {
    const { x: tx, y: ty } = path[i];
    if (itemAt(dg, tx, ty) || dg.traps?.find(t => t.x === tx && t.y === ty) ||
        dg.bigboxes?.find(b => b.x === tx && b.y === ty)) {
      path = path.slice(0, i + 1);
      endX = tx; endY = ty;
      break;
    }
  }
  if (endX !== sx || endY !== sy) {
    const evt = { type: "projectile", fromX: sx, fromY: sy, toX: endX, toY: endY, color, path };
    pushAnim(evt);
    return evt;
  }
  return null;
}

/*
 * Trace a bolt fired BY a monster. Same as pushBoltAnim but also stops at player position.
 * Emits "monProjectile" so it plays in the monster-animation phase.
 */
export function pushMonsterBoltAnim(sx, sy, dx, dy, dg, pl, effectOrColor = "#a050f0") {
  const color = WAND_COLORS[effectOrColor] || effectOrColor;
  const tr = traceProjectilePath(dg, sx, sy, dx, dy, MW + MH, {
    stopAtMon: true,
    stopAtPlayer: pl ? { x: pl.x, y: pl.y } : null,
  });
  let path = tr.path;
  let lx = tr.endX, ly = tr.endY;
  for (let i = 1; i < path.length; i++) {
    const { x: tx, y: ty } = path[i];
    if (pl && tx === pl.x && ty === pl.y) { lx = tx; ly = ty; path = path.slice(0, i + 1); break; }
    if (monsterAt(dg, tx, ty) || itemAt(dg, tx, ty) ||
        dg.traps?.find(t => t.x === tx && t.y === ty) ||
        dg.bigboxes?.find(b => b.x === tx && b.y === ty)) {
      lx = tx; ly = ty; path = path.slice(0, i + 1); break;
    }
  }
  if (lx !== sx || ly !== sy) {
    pushAnim({ type: "monProjectile", fromX: sx, fromY: sy, toX: lx, toY: ly, color, path });
  }
}

/** 既知の from→to、または path 折れ線で弾アニメ */
export function pushProjectileAnim(fromX, fromY, toX, toY, color = "#d0a050", path = null) {
  if (path?.length > 1 || fromX !== toX || fromY !== toY) {
    pushAnim({ type: "projectile", fromX, fromY, toX, toY, color, path: path || null });
  }
}

/*
 * Push an explosion animation.
 */
export function pushExplosionAnim(cx, cy) {
  pushAnim({ type: "explosion", x: cx, y: cy, radius: 1.5 });
}

/*
 * Push a splash animation (potion/oil scatter effect).
 * cx, cy: center tile. color: droplet color.
 */
export function pushSplashAnim(cx, cy, color = "#88ccff") {
  pushAnim({ type: "splash", x: cx, y: cy, color });
}

/*
 * Push a lightning hit animation on a tile.
 */
export function pushLightningAnim(x, y) {
  pushAnim({ type: "lightning", x, y });
}

/*
 * Push a heal animation on a tile.
 */
export function pushHealAnim(x, y) {
  pushAnim({ type: "heal", x, y });
}
