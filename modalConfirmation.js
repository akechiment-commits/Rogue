/* タップとキーが共有する、1つの対象選択画面の確定状態。再描画を待たずに閉じる。 */
const finished = new WeakSet();
const sourceScrolls = new WeakMap();

export function claimModalConfirmation(mode, player) {
  if (!mode || finished.has(mode)) return false;
  if (mode.scrollIdx != null && player?.inventory?.[mode.scrollIdx]?.type !== "scroll") return false;
  if (mode.spellCost != null && (player?.mp || 0) < mode.spellCost) return false;
  if (mode.scrollIdx != null) sourceScrolls.set(mode, player.inventory[mode.scrollIdx]);
  finished.add(mode);
  return true;
}

/* 効果中に道具が消滅・移動しても、古い添字で隣の道具を消費しない。 */
export function consumeModalScroll(mode, player) {
  const source = sourceScrolls.get(mode);
  if (!source) return;
  const index = player?.inventory?.indexOf(source) ?? -1;
  if (index >= 0) player.inventory.splice(index, 1);
  sourceScrolls.delete(mode);
}

export function cancelModalConfirmation(mode) {
  if (mode) finished.add(mode);
}
