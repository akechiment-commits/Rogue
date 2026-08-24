/* ===== RUN DISCOVERY TRACKER =====
   Module-level singleton so any game code can track discoveries
   without threading refs through deeply nested callbacks.         */

let _disc = { items: {}, monsters: {}, traps: {}, bigboxes: {} };
let _pendingBigboxes = {}; /* 今回の冒険で壊した大箱（ゲームオーバー/帰還時に確定） */

export function resetDiscoveries() {
  _disc = { items: {}, monsters: {}, traps: {}, bigboxes: {} };
  _pendingBigboxes = {};
}

function _bumpEntry(bucket, key, entry) {
  if (!bucket[key]) {
    bucket[key] = { ...entry, count: 1 };
  } else {
    bucket[key].count = (bucket[key].count || 0) + 1;
  }
}

export function trackItem(item) {
  if (!item) return;
  const key = item.type === "food"
    ? `food_${item._foodBase || item.name}`
    : item.effect || (item.type + '_' + item.name);
  const entry = { name: item.name, tile: item.tile, type: item.type };
  if (item.type === "food") {
    entry.effect = item.effect;
    entry._foodBase = item._foodBase;
  }
  _bumpEntry(_disc.items, key, entry);
}

export function trackMonster(mon) {
  if (!mon) return;
  const key = mon.name;
  _bumpEntry(_disc.monsters, key, { name: mon.name, tile: mon.tile });
}

export function trackTrap(trap) {
  if (!trap) return;
  const key = trap.effect || trap.name;
  _bumpEntry(_disc.traps, key, { name: trap.name, tile: trap.tile });
}

export function trackBigbox(bb) {
  if (!bb?.kind || !bb?.name) return;
  const key = bb.kind;
  _bumpEntry(_disc.bigboxes, key, { name: bb.name, tile: 38, kind: bb.kind });
}

/* 今回の冒険で壊した大箱を一時ステージ（ゲームオーバー/帰還時に確定） */
export function stageBigbox(bb) {
  if (!bb?.kind || !bb?.name) return;
  const key = bb.kind;
  if (!_pendingBigboxes[key]) {
    _pendingBigboxes[key] = { name: bb.name, tile: 38, kind: bb.kind, count: 1 };
  }
}

/* ステージ中の大箱を図鑑に確定する */
export function commitPendingBigboxes() {
  for (const [key, val] of Object.entries(_pendingBigboxes)) {
    if (!_disc.bigboxes[key]) _disc.bigboxes[key] = val;
  }
  _pendingBigboxes = {};
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
