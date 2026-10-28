/** 拘束ダメージ・移動・敵行動で、同じ解除条件を使う。 */
export function releaseInvalidCapture(player, dungeon, messages) {
  if (!player.capturedBy) return false;
  const captor = dungeon.monsters.find(monster => monster.id === player.capturedBy);
  const distance = captor && Math.max(Math.abs(player.x - captor.x), Math.abs(player.y - captor.y));
  const disabled = captor && (
    captor.hp <= 0 || captor.paralyzed || captor.sealed || captor.bewitched || captor.blind ||
    ["sleepTurns", "confusedTurns", "drunkenTurns", "darknessTurns", "fleeingTurns",
      "poisonedTurns", "immobileTurns", "knockdownTurns", "oilyTurns", "petrifiedTurns", "frozenTurns"]
      .some(key => (captor[key] || 0) > 0)
  );
  if (captor && !(distance > 1) && !disabled) return false;
  player.capturedBy = null;
  if (captor) messages.push(captor.subtype === "giantEel"
    ? `${captor.name}の拘束が解けた！` : `${captor.name}の捕獲が解けた！`);
  return true;
}
