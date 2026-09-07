/* ===== RUN DISCOVERY TRACKER =====
   Module-level singleton so any game code can track discoveries
   without threading refs through deeply nested callbacks.         */

/* 敵名変更前の図鑑キーを、現行名へ一度だけ移行する。 */
export const MONSTER_DISCOVERY_MIGRATION_VERSION = 1;
const MONSTER_DISCOVERY_NAME_ALIASES_V1 = Object.freeze({
  "大ムカデ": "巨大ムカデ",
  "覇ムカデ": "重装甲ムカデ",
  "盗投士": "ひったくり",
  "大盗投士": "分捕り",
  "覇盗投士": "根刮ぎ",
  "強スケルトン": "骸骨戦士",
  "アンデッドナイト": "アンデッドナイ",
  "強水晶スライム": "プラチナスライム",
  "覇水晶スライム": "ダマスカスライム",
  "強ゼラチンキューブ": "大ゼラチンキューブ",
  "覇ゼラチンキューブ": "暴食ゼラチンキューブ",
  "術師": "杖術師",
  "強術師": "杖魔人",
  "大術師": "杖ゴミ",
  "解装士": "強引タヌキ",
  "強解装士": "無理矢理タヌキ",
  "覇解装士": "すっぽんタヌキ",
  "シールド蟹": "どこにも居場所がカニ",
  "強引きダコ": "ひっぱりダコ",
  "覇引きダコ": "吸い込みダコ",
  "催眠術使い": "土下座鈴木右衛門",
  "強催眠術使い": "飛翔土下座鈴木右衛門",
  "大催眠術使い": "焼き土下座鈴木右衛門",
  "強ゴーレム": "ゴーレムLv2",
  "覇ゴーレム": "ゴーレムーガ",
  "強からめ鬼": "がんじがらめ鬼",
  "覇からめ鬼": "こんがらマッチョ",
  "強突進角獣": "激突角獣",
  "覇突進角獣": "猪突角獣",
  "むちちむち": "モチチモチ",
  "強ハンマーオーガ": "ボンバーオーガ",
  "覇ハンマーオーガ": "オーガキング",
  "魔法反射師": "ミラーマン",
  "強魔法反射師": "全反射マン",
  "覇魔法反射師": "ペルセウスマン",
  "ラプラス": "ナンチュウ",
  "キラープラスター": "ラプラス",
});

let _disc = { items: {}, monsters: {}, traps: {}, bigboxes: {}, monsterNameMigrationVersion: MONSTER_DISCOVERY_MIGRATION_VERSION };
let _pendingBigboxes = {}; /* 今回の冒険で壊した大箱（ゲームオーバー/帰還時に確定） */

function countOf(entry) {
  const count = Number(entry?.count);
  return Number.isFinite(count) ? count : 1;
}

function renameMonsterDiscoveryEntries(entries) {
  const result = {};
  for (const [key, rawEntry] of Object.entries(entries || {})) {
    const entry = rawEntry && typeof rawEntry === "object"
      ? rawEntry
      : { name: key, count: 1 };
    const sourceName = entry.name || key;
    const targetName = MONSTER_DISCOVERY_NAME_ALIASES_V1[sourceName]
      || MONSTER_DISCOVERY_NAME_ALIASES_V1[key]
      || sourceName;
    const existing = result[targetName];
    const incomingIsCanonical = sourceName === targetName && key === targetName;
    const merged = existing
      ? (incomingIsCanonical ? { ...existing, ...entry } : { ...entry, ...existing })
      : { ...entry };
    result[targetName] = {
      ...merged,
      name: targetName,
      count: (existing ? countOf(existing) : 0) + countOf(entry),
    };
  }
  return result;
}

export function migrateMonsterDiscoveries(entries, version = 0) {
  const fromVersion = Number.isInteger(version) ? version : 0;
  return fromVersion < MONSTER_DISCOVERY_MIGRATION_VERSION
    ? renameMonsterDiscoveryEntries(entries)
    : { ...(entries || {}) };
}

export function normalizeDiscoveryData(data) {
  if (!data) return null;
  return {
    ...data,
    monsters: migrateMonsterDiscoveries(data.monsters, data.monsterNameMigrationVersion),
    monsterNameMigrationVersion: MONSTER_DISCOVERY_MIGRATION_VERSION,
  };
}

export function resetDiscoveries() {
  _disc = { items: {}, monsters: {}, traps: {}, bigboxes: {}, monsterNameMigrationVersion: MONSTER_DISCOVERY_MIGRATION_VERSION };
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
  const normalized = normalizeDiscoveryData(data);
  _disc = {
    items:    { ...(normalized.items || {}) },
    monsters: { ...(normalized.monsters || {}) },
    traps:    { ...(normalized.traps || {}) },
    bigboxes: { ...(normalized.bigboxes || {}) },
    monsterNameMigrationVersion: normalized.monsterNameMigrationVersion,
  };
}

export function getDiscoveries() {
  return {
    items:    { ..._disc.items },
    monsters: { ..._disc.monsters },
    traps:    { ..._disc.traps },
    bigboxes: { ..._disc.bigboxes },
    monsterNameMigrationVersion: _disc.monsterNameMigrationVersion,
  };
}
