/**
 * プレイヤーのターン開始後に必ず進む基礎状態（ターン数・空腹・自然回復）を更新する。
 * 依存する装備判定は注入し、ゲーム UI や敵行動には依存しない。
 */
export function advancePlayerUpkeep(player, messages, {
  hasAbility,
  hasRingEffect,
  calcHungerDrainRate,
  onHungerDamageStarted = () => {},
}) {
  player.turns++;
  const hasRegenRing = hasRingEffect(player, "regen_ring");
  const hungerRate = calcHungerDrainRate(player);
  player._hungerTick = (player._hungerTick || 0) + hungerRate;
  while (player._hungerTick >= 10) {
    player._hungerTick -= 10;
    player.hunger = Math.max(0, player.hunger - 1);
  }

  if (hasAbility(player.weapon, "gluttony") && player.turns % 5 === 0) {
    player.hunger = Math.max(0, player.hunger - 1);
  }

  if (player.hunger === 0) {
    player.deathCause = "空腹により";
    if (!player._hungerDmgStarted) {
      player._hungerDmgStarted = true;
      messages.push("空腹でHPが減り始めた！");
      onHungerDamageStarted();
    } else if (player.turns % 10 === 0) {
      messages.push("空腹でHPが減っている...");
    }
    player.hp--;
  } else if (player.hp > 0 && player.hp < player.maxHp) {
    const baseRegen = Math.max(1, Math.floor(player.maxHp / 100)) + (hasAbility(player.armor, "regen") ? 1 : 0);
    const regenAmount = hasRegenRing ? baseRegen * 2 : baseRegen;
    player.hp = Math.min(player.maxHp, player.hp + regenAmount);
  }
}
