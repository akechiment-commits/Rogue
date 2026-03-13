/* ===== RUN DISCOVERY TRACKER =====
   Module-level singleton so any game code can track discoveries
   without threading refs through deeply nested callbacks.         */

let _disc = { items: {}, monsters: {}, traps: {} };

export function resetDiscoveries() {
  _disc = { items: {}, monsters: {}, traps: {} };
}

export function trackItem(item) {
  if (!item) return;
  const key = item.effect || (item.type + '_' + item.name);
  _disc.items[key] = {
    name:  item.name,
    tile:  item.tile,
    type:  item.type,
    count: (_disc.items[key]?.count || 0) + 1,
  };
}

export function trackMonster(mon) {
  if (!mon) return;
  const key = mon.name;
  _disc.monsters[key] = {
    name:  mon.name,
    tile:  mon.tile,
    count: (_disc.monsters[key]?.count || 0) + 1,
  };
}

export function trackTrap(trap) {
  if (!trap) return;
  const key = trap.effect || trap.name;
  _disc.traps[key] = {
    name:  trap.name,
    tile:  trap.tile,
    count: (_disc.traps[key]?.count || 0) + 1,
  };
}

export function getDiscoveries() {
  return {
    items:    { ..._disc.items },
    monsters: { ..._disc.monsters },
    traps:    { ..._disc.traps },
  };
}
