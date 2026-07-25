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

/** 敵行動より前に減少する、地形に依存しない状態タイマーを更新する。 */
export function advanceEarlyStatusTimers(player, messages) {
  if ((player.mpCooldownTurns || 0) > 0) player.mpCooldownTurns--;
  if (player.turns % 100 === 0 && (player.mpCooldownTurns || 0) === 0 && (player.mp || 0) < (player.maxMp || 0)) {
    player.mp = Math.min(player.mp + 1, player.maxMp);
  }
  if ((player.sealedTurns || 0) > 0) {
    player.sealedTurns--;
    if (player.sealedTurns === 0) messages.push("封印が解けた！");
  }
  if ((player.fireExplosionNullTurns || 0) > 0) {
    player.fireExplosionNullTurns--;
    if (player.fireExplosionNullTurns === 0) messages.push("炎と爆発の不発効果が切れた！");
  }
  if (player.poisoned && player.turns % 3 === 0) {
    if ((player.poisonAtkLoss || 0) >= 3) {
      player.poisoned = false;
      messages.push("毒の効果が切れた。攻撃力の低下は残っている...");
    } else if (player.atk > 1) {
      player.atk--;
      player.poisonAtkLoss = (player.poisonAtkLoss || 0) + 1;
      messages.push("毒に冒されている！攻撃力が下がった...");
      if (player.poisonAtkLoss >= 3) {
        player.poisoned = false;
        messages.push("毒の効果が切れた。");
      }
    }
  }
  if ((player.oilyTurns || 0) > 0) {
    player.oilyTurns--;
    if (player.oilyTurns === 0) messages.push("油が落ちた。炎への弱点が消えた。");
  }
  if ((player.soakedTurns || 0) > 0) {
    player.soakedTurns--;
    if (player.soakedTurns === 0) messages.push("体が乾いた。ずぶ濡れが解けた。");
  }
  if ((player.immobileTurns || 0) > 0) player.immobileTurns--;
  if ((player.floatTurns || 0) > 0) {
    player.floatTurns--;
    if (player.floatTurns === 0) messages.push("浮遊が解けた！");
  }
  if ((player.invisibleTurns || 0) > 0) {
    player.invisibleTurns--;
    if (player.invisibleTurns === 0) messages.push("透明が解けた！敵に見えるようになった。");
  }
}
