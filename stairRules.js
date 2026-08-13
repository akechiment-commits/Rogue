/** プレイヤーが階段を使えない状態なら、その理由を返す。 */
export function getPlayerStairBlockMessage(player) {
  if (player?.capturedBy) return "からめ鬼に捕まっているので階段を使えない！";
  if ((player?.immobileTurns || 0) > 0) return "影に縫い付けられているので階段を使えない！";
  return null;
}
