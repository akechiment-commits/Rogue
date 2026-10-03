/* タップとキーが共有する、1つの対象選択画面の確定状態。再描画を待たずに閉じる。 */
const finished = new WeakSet();

export function claimModalConfirmation(mode, player) {
  if (!mode || finished.has(mode)) return false;
  if (mode.scrollIdx != null && player?.inventory?.[mode.scrollIdx]?.type !== "scroll") return false;
  if (mode.spellCost != null && (player?.mp || 0) < mode.spellCost) return false;
  finished.add(mode);
  return true;
}

export function cancelModalConfirmation(mode) {
  if (mode) finished.add(mode);
}
