/* 発動記録はプレイヤー行動から敵行動・遅延効果まで共有する。
 * 一時情報なのでセーブ対象のダンジョンには書き込まない。 */
const activations = new WeakMap();

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
