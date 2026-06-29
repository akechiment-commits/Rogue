/* ===== SAVE DATA PERSISTENCE ===== */
const SAVE_KEY = 'roguelike_hub_v1';

export const DEFAULT_SAVE = {
  version: 1,
  hubGold: 0,
  warehouse: [],            /* array of item objects */
  hubInventory: [],         /* items player will carry into dungeon */
  warehouseMax: 100,        /* current max capacity */
  discovered: {
    items:    {},           /* { effectKey: { name, tile, type, count } } */
    monsters: {},           /* { name: { name, tile, count } } */
    traps:    {},           /* { effectKey: { name, tile, count } } */
    bigboxes: {},           /* { kind: { name, kind, tile, count } } */
  },
  identifiedEffects: [],    /* 永続的に識別済みの巻物・魔法書のeffectキー（魔法の筆用） */
  clearedDungeons: {},      /* { dungeonType: true } クリア済みダンジョン記録 */
  totalRuns: 0,
  bestDepth: 0,
  bestGold:  0,
  hubShopStock: [],       /* 拠点ショップの在庫（帰還ごとに更新・最大1点） */
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
      hubInventory: [...(data.hubInventory || [])],
      discovered: {
        items:    { ...(data.discovered?.items    || {}) },
        monsters: { ...(data.discovered?.monsters || {}) },
        traps:    { ...(data.discovered?.traps    || {}) },
        bigboxes: { ...(data.discovered?.bigboxes || {}) },
      },
      identifiedEffects: [...(data.identifiedEffects || [])],
      clearedDungeons:   { ...(data.clearedDungeons   || {}) },
      hubShopStock:      [...(data.hubShopStock      || [])],
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
    bigboxes: { ...saveDiscovered.bigboxes },
  };
  for (const [k, v] of Object.entries(runDiscovered.items || {}))
    result.items[k] = { ...v, count: ((result.items[k]?.count) || 0) + (v.count || 1) };
  for (const [k, v] of Object.entries(runDiscovered.monsters || {}))
    result.monsters[k] = { ...v, count: ((result.monsters[k]?.count) || 0) + (v.count || 1) };
  for (const [k, v] of Object.entries(runDiscovered.traps || {}))
    result.traps[k] = { ...v, count: ((result.traps[k]?.count) || 0) + (v.count || 1) };
  for (const [k, v] of Object.entries(runDiscovered.bigboxes || {}))
    result.bigboxes[k] = { ...v, count: ((result.bigboxes[k]?.count) || 0) + (v.count || 1) };
  return result;
}
