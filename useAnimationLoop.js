import { useRef, useCallback } from 'react';

/*
 * Animation Queue System for Rogue
 *
 * Animation types:
 *   move:   { type:"move", entity:"player"|id, fromX, fromY, toX, toY, duration }
 *   attack: { type:"attack", x, y, dx, dy, duration }     — slash effect
 *   damage: { type:"damage", x, y, value, color, duration } — damage popup
 *   flash:  { type:"flash", x, y, color, duration }         — tile flash
 *   shake:  { type:"shake", entity, duration }               — entity shake on hit
 *   multi:  { type:"multi", anims:[], duration }             — parallel group
 *
 * Each animation has: startTime, duration (ms), progress (0-1)
 */

const DEFAULT_MOVE_DUR   = 100;  // ms
const DEFAULT_ATTACK_DUR = 120;
const DEFAULT_DAMAGE_DUR = 500;
const DEFAULT_FLASH_DUR  = 150;

export function useAnimationQueue() {
  const queueRef    = useRef([]);       // pending animations
  const activeRef   = useRef(null);     // currently playing animation(s)
  const startRef    = useRef(0);        // start timestamp of current animation
  const busyRef     = useRef(false);    // whether animation is in progress
  const rafRef      = useRef(null);     // requestAnimationFrame id
  const callbackRef = useRef(null);     // called when queue fully drained
  const overlaysRef = useRef([]);       // visual overlays for renderer to draw

  /* Enqueue one or more animations. Animations in the same array play in parallel. */
  const enqueue = useCallback((anims) => {
    if (!Array.isArray(anims)) anims = [anims];
    for (const a of anims) {
      if (!a.duration) {
        if (a.type === "move")   a.duration = DEFAULT_MOVE_DUR;
        if (a.type === "attack") a.duration = DEFAULT_ATTACK_DUR;
        if (a.type === "damage") a.duration = DEFAULT_DAMAGE_DUR;
        if (a.type === "flash")  a.duration = DEFAULT_FLASH_DUR;
        if (a.type === "multi")  a.duration = Math.max(...a.anims.map(a2 => a2.duration || DEFAULT_MOVE_DUR));
      }
    }
    queueRef.current.push(anims);
  }, []);

  /* Enqueue a batch of animations that all play simultaneously */
  const enqueueParallel = useCallback((anims) => {
    if (!anims || anims.length === 0) return;
    for (const a of anims) {
      if (!a.duration) {
        if (a.type === "move")   a.duration = DEFAULT_MOVE_DUR;
        if (a.type === "attack") a.duration = DEFAULT_ATTACK_DUR;
        if (a.type === "damage") a.duration = DEFAULT_DAMAGE_DUR;
        if (a.type === "flash")  a.duration = DEFAULT_FLASH_DUR;
      }
    }
    queueRef.current.push(anims);
  }, []);

  /* Start processing the queue. Returns a promise that resolves when done. */
  const flush = useCallback((renderFn) => {
    return new Promise((resolve) => {
      if (queueRef.current.length === 0) { resolve(); return; }
      busyRef.current = true;
      callbackRef.current = () => { busyRef.current = false; resolve(); };
      const tick = (now) => {
        if (!activeRef.current) {
          if (queueRef.current.length === 0) {
            overlaysRef.current = [];
            busyRef.current = false;
            rafRef.current = null;
            if (renderFn) renderFn([], now);
            callbackRef.current?.();
            return;
          }
          activeRef.current = queueRef.current.shift();
          startRef.current = now;
        }
        const anims = activeRef.current;
        const elapsed = now - startRef.current;
        const maxDur = Math.max(...anims.map(a => a.duration || 100));
        const progress = Math.min(1, elapsed / maxDur);

        /* Build overlay list from active animations */
        const overlays = [];
        for (const a of anims) {
          const p = Math.min(1, elapsed / (a.duration || 100));
          const t = easeOutQuad(p);
          overlays.push({ ...a, progress: p, t });
        }
        overlaysRef.current = overlays;

        if (renderFn) renderFn(overlays, now);

        if (progress >= 1) {
          activeRef.current = null;
          overlaysRef.current = [];
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    });
  }, []);

  const isBusy = useCallback(() => busyRef.current, []);
  const getOverlays = useCallback(() => overlaysRef.current, []);

  /* Cancel all pending animations */
  const cancel = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    queueRef.current = [];
    activeRef.current = null;
    overlaysRef.current = [];
    busyRef.current = false;
  }, []);

  return { enqueue, enqueueParallel, flush, isBusy, getOverlays, cancel };
}

/* Easing functions */
function easeOutQuad(t) { return t * (2 - t); }
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeInOutQuad(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
