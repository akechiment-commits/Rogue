/** HP0からのMP復活後に付く、通常の魔法封印とは別の回復禁止ターン。 */
export const MP_REVIVAL_SEAL_TURNS = 1000;

/** プレイヤーのMP回復を妨げる状態。HP0復活の1000ターン以外では使わない。 */
export function isMpRecoveryBlocked(player) {
  return (player?.mpSealTurns || 0) > 0;
}

/** 表示・メッセージ用のMP回復禁止残りターン。 */
export function mpRecoveryBlockTurns(player) {
  return player?.mpSealTurns || 0;
}

/** 呪われた封印の薬だけが、復活後のMP回復禁止を解除する。 */
export function clearMpRecoveryBlockFromCursedSealPotion(player) {
  if (!player) return false;
  const wasBlocked = isMpRecoveryBlocked(player);
  player.mpSealTurns = 0;
  return wasBlocked;
}
