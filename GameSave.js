/* ===== MID-DUNGEON SAVE / LOAD =====
   ダンジョン途中のゲーム状態をlocalStorageに保存・復元する。
   装備品はインベントリ内のインデックスで参照を保持する。   */

import { installPlayerHpReverseHook } from "./utils.js";

const GAME_SAVE_KEY = 'roguelike_dungeon_save_v1';
const GAME_SAVE_VERSION = 2;

function isInternalGravityTrigger(item) {
  return item?.name === '重力の力' && item?.type === 'misc';
}

function withoutInternalGravityTriggers(dungeon) {
  if (!dungeon || !Array.isArray(dungeon.items)) return dungeon;
  return {
    ...dungeon,
    items: dungeon.items.filter(item => !isInternalGravityTrigger(item)),
  };
}

/* ---------- serialize ---------- */

function serializePlayer(p) {
  const inventory = p.inventory.filter(item => !isInternalGravityTrigger(item));
  const out = { ...p, inventory };
  /* 装備品をインデックスに変換（inventory内のオブジェクト参照を保存不可能なため） */
  out._weaponIdx = p.weapon ? inventory.indexOf(p.weapon) : -1;
  out._armorIdx  = p.armor  ? inventory.indexOf(p.armor)  : -1;
  out._arrowIdx  = p.arrow  ? inventory.indexOf(p.arrow)  : -1;
  out._ringIdxs  = (p.rings || []).map(r => inventory.indexOf(r));
  /* シリアライズ用に参照を消す（JSONで循環しないように） */
  delete out.weapon;
  delete out.armor;
  delete out.arrow;
  delete out.rings;
  return out;
}

function deserializePlayer(data) {
  const p = { ...data };
  /* インデックスから装備品参照を復元 */
  p.weapon = data._weaponIdx >= 0 ? p.inventory[data._weaponIdx] : null;
  p.armor  = data._armorIdx  >= 0 ? p.inventory[data._armorIdx]  : null;
  p.arrow  = data._arrowIdx  >= 0 ? p.inventory[data._arrowIdx]  : null;
  p.rings  = (data._ringIdxs || []).map(i => i >= 0 ? p.inventory[i] : null).filter(Boolean);
  delete p._weaponIdx;
  delete p._armorIdx;
  delete p._arrowIdx;
  delete p._ringIdxs;
  delete p._hpReverseHook; /* フックは再インストール */
  installPlayerHpReverseHook(p);
  return p;
}

/* ---------- migration / validation ---------- */

function migrateV1ToV2(data) {
  return {
    ...data,
    version: GAME_SAVE_VERSION,
    floors: data.floors || {},
    ident: data.ident || [],
    nicknames: data.nicknames || {},
    floorTurns: data.floorTurns || 0,
    runActiveMs: data.runActiveMs || 0,
    penSpriteMap: data.penSpriteMap || {},
    potionSpriteMap: data.potionSpriteMap || {},
    msgs: data.msgs || [],
  };
}

function normalizeSaveData(data) {
  if (!data || typeof data !== 'object') return null;
  const migrated = data.version === 1 ? migrateV1ToV2(data) : data;
  if (migrated.version !== GAME_SAVE_VERSION) return null;
  if (!migrated.player || !Array.isArray(migrated.player.inventory)) return null;
  const oldInventory = migrated.player.inventory;
  const remapIndex = (index) => {
    if (!Number.isInteger(index) || index < 0 || isInternalGravityTrigger(oldInventory[index])) return -1;
    return index - oldInventory.slice(0, index).filter(isInternalGravityTrigger).length;
  };
  migrated.player.inventory = oldInventory.filter(item => !isInternalGravityTrigger(item));
  migrated.player._weaponIdx = remapIndex(migrated.player._weaponIdx);
  migrated.player._armorIdx = remapIndex(migrated.player._armorIdx);
  migrated.player._arrowIdx = remapIndex(migrated.player._arrowIdx);
  migrated.player._ringIdxs = (migrated.player._ringIdxs || []).map(remapIndex);
  migrated.dungeon = withoutInternalGravityTriggers(migrated.dungeon);
  migrated.floors = Object.fromEntries(
    Object.entries(migrated.floors || {}).map(([depth, dungeon]) => [
      depth,
      withoutInternalGravityTriggers(dungeon),
    ]),
  );
  return migrated;
}

/* ---------- public API ---------- */

export function saveGameState(session, msgs, dungeonConfig, discoveries) {
  try {
    const data = {
      version: GAME_SAVE_VERSION,
      timestamp: Date.now(),
      player: serializePlayer(session.player),
      dungeon: withoutInternalGravityTriggers(session.dungeon),
      floors: Object.fromEntries(
        Object.entries(session.floors || {}).map(([depth, dungeon]) => [
          depth,
          withoutInternalGravityTriggers(dungeon),
        ]),
      ),
      ident: [...(session.ident || [])],       /* Set → Array */
      fakeNames: session.fakeNames,
      bbFakeNames: session.bbFakeNames,
      nicknames: session.nicknames || {},
      isDebugRun: session.isDebugRun,
      dungeonType: session.dungeonType,
      maxDepth: session.maxDepth,
      allBcKnown: session.allBcKnown,
      floorTurns: session.floorTurns || 0,
      runActiveMs: session.runActiveMs || 0,
      penSpriteMap: session.penSpriteMap || {},
      potionSpriteMap: session.potionSpriteMap || {},
      msgs: (msgs || []).slice(-80),
      dungeonConfig: dungeonConfig || null,
      discoveries: discoveries || null,
    };
    localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('GameSave: save failed', e);
    return false;
  }
}

export function loadGameState() {
  try {
    const raw = localStorage.getItem(GAME_SAVE_KEY);
    if (!raw) return null;
    const data = normalizeSaveData(JSON.parse(raw));
    if (!data) return null;
    return {
      player: deserializePlayer(data.player),
      dungeon: data.dungeon,
      floors: data.floors || {},
      ident: new Set(data.ident || []),         /* Array → Set */
      fakeNames: data.fakeNames,
      bbFakeNames: data.bbFakeNames,
      nicknames: data.nicknames || {},
      isDebugRun: data.isDebugRun,
      dungeonType: data.dungeonType,
      maxDepth: data.maxDepth,
      allBcKnown: data.allBcKnown,
      floorTurns: data.floorTurns || 0,
      runActiveMs: data.runActiveMs || 0,
      penSpriteMap: data.penSpriteMap || {},
      potionSpriteMap: data.potionSpriteMap || {},
      msgs: data.msgs || [],
      dungeonConfig: data.dungeonConfig || null,
      discoveries: data.discoveries || null,
    };
  } catch (e) {
    console.warn('GameSave: load failed', e);
    return null;
  }
}

export function clearGameSave() {
  localStorage.removeItem(GAME_SAVE_KEY);
}

export function hasGameSave() {
  return localStorage.getItem(GAME_SAVE_KEY) !== null;
}
