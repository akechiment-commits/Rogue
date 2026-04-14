/* ===== RUN DISCOVERY TRACKER =====
   Module-level singleton so any game code can track discoveries
   without threading refs through deeply nested callbacks.         */

let _disc = { items: {}, monsters: {}, traps: {}, bigboxes: {} };

export function resetDiscoveries() {
  _disc = { items: {}, monsters: {}, traps: {}, bigboxes: {} };
}

export function trackItem(item) {
  if (!item) return;
  const key = item.effect || (item.type + '_' + item.name);
  if (!_disc.items[key]) {
    _disc.items[key] = { name: item.name, tile: item.tile, type: item.type, count: 1 };
  }
}

export function trackMonster(mon) {
  if (!mon) return;
  const key = mon.name;
  if (!_disc.monsters[key]) {
    _disc.monsters[key] = { name: mon.name, tile: mon.tile, count: 1 };
  }
}

export function trackTrap(trap) {
  if (!trap) return;
  const key = trap.effect || trap.name;
  if (!_disc.traps[key]) {
    _disc.traps[key] = { name: trap.name, tile: trap.tile, count: 1 };
  }
}

export function trackBigbox(bb) {
  if (!bb?.kind || !bb?.name) return;
  const key = bb.kind;
  if (!_disc.bigboxes[key]) {
    _disc.bigboxes[key] = { name: bb.name, tile: 38, kind: bb.kind, count: 1 };
  }
}

export function restoreDiscoveries(data) {
  if (!data) return;
  _disc = {
    items:    { ...(data.items || {}) },
    monsters: { ...(data.monsters || {}) },
    traps:    { ...(data.traps || {}) },
    bigboxes: { ...(data.bigboxes || {}) },
  };
}

export function getDiscoveries() {
  return {
    items:    { ..._disc.items },
    monsters: { ..._disc.monsters },
    traps:    { ..._disc.traps },
    bigboxes: { ..._disc.bigboxes },
  };
}
