/* 発動記録はプレイヤー行動から敵行動・遅延効果まで共有する。
 * 一時情報なのでセーブ対象のダンジョンには書き込まない。 */
const activations = new WeakMap();

const directTrapEffects = new Set([
  "pitfall", "rust", "spin", "sleep", "slow_trap", "level_down_trap",
  "confuse_trap", "bewitch_trap", "darkness_trap", "seal_trap", "steal_trap",
  "trip_trap", "hunger_trap", "shadow_stitch", "mp_absorb_trap", "float_trap",
  "oil_trap", "unident_trap", "watergun_trap", "rot_trap", "blowback_trap",
  "unequip_trap",
]);

export function trapHitsOccupantDirectly(effect) {
  return directTrapEffects.has(effect);
}

function trapKey(trap) { return trap?.id ?? trap; }

export function canActivateTrap(dungeon, trap, allowReserved = false) {
  if (!dungeon || !trap) return false;
  const status = activations.get(dungeon)?.get(trapKey(trap));
  return status == null || (allowReserved && status === "reserved");
}

export function claimTrapActivation(dungeon, trap, { reserve = false, allowReserved = false } = {}) {
  if (!canActivateTrap(dungeon, trap, allowReserved)) return false;
  let records = activations.get(dungeon);
  if (!records) { records = new Map(); activations.set(dungeon, records); }
  records.set(trapKey(trap), reserve ? "reserved" : "activated");
  return true;
}

/* 行動時計はendTurnの冒頭で進むため、時計の値で記録をリセットしない。
 * 階移動があっても、元の階を含め全ての記録をターン終了時に解放する。 */
export function finishTrapActivationTurn(state) {
  if (state?.dungeon) activations.delete(state.dungeon);
  for (const dungeon of Object.values(state?.floors || {})) {
    if (dungeon) activations.delete(dungeon);
  }
}
