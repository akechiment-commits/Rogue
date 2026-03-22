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

import { MW, MH, T, monsterAt, itemAt } from './utils.js';

const animEvents = [];

export function pushAnim(event) {
  animEvents.push(event);
}

export function drainAnims() {
  const evts = [...animEvents];
  animEvents.length = 0;
  return evts;
}

/*
 * Item arc animation queue.
 * seq: 1 = first flight (scatter or direct throw), 2+ = after trap bounce, etc.
 * Groups with the same seq play in parallel; higher seq plays after lower seq.
 */
const _itemArcQueue = [];

export function pushItemArcAnim(fromX, fromY, toX, toY, tile, seq = 1) {
  if (fromX === toX && fromY === toY) return;
  _itemArcQueue.push({ type: "itemArc", fromX, fromY, toX, toY, tile, seq });
}

/* Returns array of arc batches sorted by seq: [[seq1 arcs], [seq2 arcs], ...] */
export function drainItemArcs() {
  if (_itemArcQueue.length === 0) return [];
  const arcs = [..._itemArcQueue];
  _itemArcQueue.length = 0;
  const groups = {};
  for (const a of arcs) {
    const s = a.seq || 1;
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
  let lx = sx, ly = sy;
  for (let d = 1; d < MW + MH; d++) {
    const tx = sx + dx * d, ty = sy + dy * d;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
    if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
    if (monsterAt(dg, tx, ty)) { lx = tx; ly = ty; break; }
    if (itemAt(dg, tx, ty)) { lx = tx; ly = ty; break; }
    if (dg.traps?.find(t => t.x === tx && t.y === ty)) { lx = tx; ly = ty; break; }
    if (dg.bigboxes?.find(b => b.x === tx && b.y === ty)) { lx = tx; ly = ty; break; }
    lx = tx; ly = ty;
  }
  if (lx !== sx || ly !== sy) {
    pushAnim({ type: "projectile", fromX: sx, fromY: sy, toX: lx, toY: ly, color });
  }
}

/*
 * Push a projectile animation for a known path (from→to).
 */
export function pushProjectileAnim(fromX, fromY, toX, toY, color = "#d0a050") {
  if (fromX !== toX || fromY !== toY) {
    pushAnim({ type: "projectile", fromX, fromY, toX, toY, color });
  }
}

/*
 * Trace a bolt fired BY a monster. Same as pushBoltAnim but also stops at player position.
 * Emits "monProjectile" so it plays in the monster-animation phase.
 */
export function pushMonsterBoltAnim(sx, sy, dx, dy, dg, pl, effectOrColor = "#a050f0") {
  const color = WAND_COLORS[effectOrColor] || effectOrColor;
  let lx = sx, ly = sy;
  for (let d = 1; d < MW + MH; d++) {
    const tx = sx + dx * d, ty = sy + dy * d;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
    if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
    if (tx === pl.x && ty === pl.y) { lx = tx; ly = ty; break; }
    if (monsterAt(dg, tx, ty)) { lx = tx; ly = ty; break; }
    if (itemAt(dg, tx, ty)) { lx = tx; ly = ty; break; }
    if (dg.traps?.find(t => t.x === tx && t.y === ty)) { lx = tx; ly = ty; break; }
    if (dg.bigboxes?.find(b => b.x === tx && b.y === ty)) { lx = tx; ly = ty; break; }
    lx = tx; ly = ty;
  }
  if (lx !== sx || ly !== sy) {
    pushAnim({ type: "monProjectile", fromX: sx, fromY: sy, toX: lx, toY: ly, color });
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
