/* ===== SAVE DATA PERSISTENCE ===== */
const SAVE_KEY = 'roguelike_hub_v1';

export const DEFAULT_SAVE = {
  version: 1,
  hubGold: 0,
  warehouse: [],          /* array of item objects (max 30) */
  discovered: {
    items:    {},         /* { effectKey: { name, tile, type, count } } */
    monsters: {},         /* { name: { name, tile, count } } */
    traps:    {},         /* { effectKey: { name, tile, count } } */
  },
  totalRuns: 0,
  bestDepth: 0,
  bestGold:  0,
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const data = JSON.parse(raw);
    /* merge missing keys from DEFAULT_SAVE */
    return {
      ...DEFAULT_SAVE,
      ...data,
      discovered: {
        items:    { ...(data.discovered?.items    || {}) },
        monsters: { ...(data.discovered?.monsters || {}) },
        traps:    { ...(data.discovered?.traps    || {}) },
      },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

/* Merge one run's discoveries into save's discovered map */
export function mergeDiscoveries(saveDiscovered, runDiscovered) {
  const result = {
    items:    { ...saveDiscovered.items },
    monsters: { ...saveDiscovered.monsters },
    traps:    { ...saveDiscovered.traps },
  };
  for (const [k, v] of Object.entries(runDiscovered.items || {}))
    result.items[k] = { ...v, count: ((result.items[k]?.count) || 0) + (v.count || 1) };
  for (const [k, v] of Object.entries(runDiscovered.monsters || {}))
    result.monsters[k] = { ...v, count: ((result.monsters[k]?.count) || 0) + (v.count || 1) };
  for (const [k, v] of Object.entries(runDiscovered.traps || {}))
    result.traps[k] = { ...v, count: ((result.traps[k]?.count) || 0) + (v.count || 1) };
  return result;
}
