/* ===== MID-DUNGEON SAVE / LOAD =====
   ダンジョン途中のゲーム状態をlocalStorageに保存・復元する。
   装備品はインベントリ内のインデックスで参照を保持する。   */

const GAME_SAVE_KEY = 'roguelike_dungeon_save_v1';

/* ---------- serialize ---------- */

function serializePlayer(p) {
  const out = { ...p };
  /* 装備品をインデックスに変換（inventory内のオブジェクト参照を保存不可能なため） */
  out._weaponIdx = p.weapon ? p.inventory.indexOf(p.weapon) : -1;
  out._armorIdx  = p.armor  ? p.inventory.indexOf(p.armor)  : -1;
  out._arrowIdx  = p.arrow  ? p.inventory.indexOf(p.arrow)  : -1;
  out._ringIdxs  = (p.rings || []).map(r => p.inventory.indexOf(r));
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
  return p;
}

/* ---------- public API ---------- */

export function saveGameState(session, msgs, dungeonConfig, discoveries) {
  try {
    const data = {
      version: 1,
      timestamp: Date.now(),
      player: serializePlayer(session.player),
      dungeon: session.dungeon,
      floors: session.floors || {},
      ident: [...(session.ident || [])],       /* Set → Array */
      fakeNames: session.fakeNames,
      bbFakeNames: session.bbFakeNames,
      nicknames: session.nicknames || {},
      isDebugRun: session.isDebugRun,
      dungeonType: session.dungeonType,
      maxDepth: session.maxDepth,
      allBcKnown: session.allBcKnown,
      floorTurns: session.floorTurns || 0,
      penSpriteMap: session.penSpriteMap || {},
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
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
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
      penSpriteMap: data.penSpriteMap || {},
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
