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

/** 闘気防具の隣接ダメージを適用し、倒した敵は既存の撃破処理へ渡す。 */
export function applyArmorAura(player, dungeon, messages, { hasAbility, killMonster }) {
  if (!hasAbility(player.armor, "aura") || dungeon.monsters.length === 0) return;
  const adjacentMonsters = dungeon.monsters.filter((monster) =>
    Math.abs(monster.x - player.x) <= 1 && Math.abs(monster.y - player.y) <= 1
  );
  for (const monster of adjacentMonsters) {
    monster.hp -= 2;
    messages.push(`闘気が${monster.name}に2ダメージ！`);
    if (monster.hp <= 0 && dungeon.monsters.includes(monster)) {
      killMonster(monster);
    }
  }
}

/** 乗られ続けた魔方陣を消耗させる。固定転送陣は別経路でしか消えない。 */
export function advancePentacleWear(player, dungeon, messages) {
  if (!dungeon.pentacles?.length || player.hp <= 0) return;
  const toRemove = [];
  for (const pentacle of dungeon.pentacles) {
    if (pentacle.kind === "fixed_portal" || pentacle.fixed) continue;
    const playerOn = pentacle.x === player.x && pentacle.y === player.y;
    const monsterOn = !playerOn && dungeon.monsters.some((monster) =>
      monster.hp > 0 && monster.x === pentacle.x && monster.y === pentacle.y
    );
    if (!playerOn && !monsterOn) continue;

    pentacle.standTurns = (pentacle.standTurns || 0) + 1;
    if (pentacle.standTurns === 25) {
      messages.push(`${pentacle.name}がかすれてきた…(残り${30 - pentacle.standTurns}ターン)`);
    }
    if (pentacle.standTurns >= 30) {
      toRemove.push(pentacle);
      messages.push(`${pentacle.name}が消えた！`);
    }
  }
  if (toRemove.length > 0) {
    dungeon.pentacles = dungeon.pentacles.filter((pentacle) => !toRemove.includes(pentacle));
  }
}

/** プレイヤー操作を受け付けず、ターンだけを進める状態かを返す。 */
export function hasForcedTurn(player) {
  return (player.sleepTurns || 0) > 0 ||
    (player.paralyzeTurns || 0) > 0 ||
    (player.frozenTurns || 0) > 0 ||
    !!player.slowSkip ||
    (player.potConfinedTurns || 0) > 0;
}

/**
 * 行動不能・自動スキップの1ターン分を進める。
 * 壺からの脱出だけは敵行動後に解決するため、呼び出し側へ通知する。
 */
export function advanceForcedTurn(player, messages) {
  if ((player.sleepTurns || 0) > 0) {
    player.sleepTurns--;
    messages.push(player.sleepTurns > 0 ? `眠っている...あと${player.sleepTurns}ターン` : "目が覚めた！");
    return { advanced: true, exitPotAfterTurn: false };
  }
  if ((player.paralyzeTurns || 0) > 0) {
    player.paralyzeTurns--;
    messages.push(player.paralyzeTurns > 0 ? `金縛りにあっている...あと${player.paralyzeTurns}ターン` : "金縛りが解けた！");
    return { advanced: true, exitPotAfterTurn: false };
  }
  if ((player.frozenTurns || 0) > 0) {
    player.frozenTurns--;
    messages.push(player.frozenTurns > 0 ? `凍りついている...あと${player.frozenTurns}ターン` : "氷が解けた！動けるようになった！");
    return { advanced: true, exitPotAfterTurn: false };
  }
  if ((player.potConfinedTurns || 0) > 0) {
    messages.push("壺から出られない！");
    if (player.potConfinedTurns > 1) player.potConfinedTurns--;
    return { advanced: true, exitPotAfterTurn: player.potConfinedTurns === 1 };
  }
  if (player.slowSkip) {
    player.slowSkip = false;
    const isEqualSpeedSkip = player._eqSpeedSlowPending || false;
    delete player._eqSpeedSlowPending;
    if (isEqualSpeedSkip) {
      messages.push("等速の魔方陣によりターンがスキップされた...");
      player._eqSpeedAutoAdv = true;
    } else {
      messages.push("鈍足でターンがスキップされた...");
      player._slowAutoAdv = true;
    }
    return { advanced: true, exitPotAfterTurn: false };
  }
  return { advanced: false, exitPotAfterTurn: false };
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

/** 行動速度と知覚系の基本状態タイマーを更新する。 */
export function advanceCoreStatusTimers(player, messages, { hasRingEffect, isSlowAutoAdvance = false }) {
  if ((player.slowTurns || 0) > 0) {
    player.slowTurns--;
    if (player.slowTurns <= 0) messages.push("鈍足が解けた！");
    else if (!isSlowAutoAdvance) player.slowSkip = true;
  }
  if (hasRingEffect(player, "slow_ring") && !isSlowAutoAdvance) player.slowSkip = true;
  const timedMessages = [
    ["confusedTurns", "混乱が解けた！"],
    ["darknessTurns", "暗闇が晴れた！視界が戻った！"],
    ["bewitchedTurns", "幻惑が解けた！周囲の見た目が正常に戻った！"],
    ["defSoftenedTurns", "軟化が解けた！防御力が戻った！"],
    ["monsterSenseTurns", "モンスター感知が切れた！"],
    ["statusImmune", "状態防止が切れた！"],
    ["sureHitTurns", "必中状態が切れた！"],
  ];
  for (const [key, message] of timedMessages) {
    if ((player[key] || 0) > 0) {
      player[key]--;
      if (player[key] <= 0) messages.push(message);
    }
  }
}

/** 食料などで得る一時強化とデバフを更新する。 */
export function advanceConsumableBuffTimers(player, messages) {
  const timers = [
    ["spicyAtkTurns", "辛さによるダメージブーストが切れた！"],
    ["pacifistTurns", "平和主義状態が解けた！攻撃できるようになった。"],
    ["reverseTurns", "逆転状態が解けた！ダメージと回復が元に戻った。"],
    ["curryFireResTurns", "カレーの炎耐性が切れた！"],
    ["misoDefTurns", "味噌の防御ブーストが切れた！"],
    ["oliveEvasionTurns", "オリーブオイルの回避効果が切れた！"],
    ["sesameCritTurns", "ごまの会心ブーストが切れた！"],
    ["butterHungerTurns", "バターの腹持ち効果が切れた！"],
    ["yogurtImmuneTurns", "ヨーグルトの免疫効果が切れた！"],
    ["soyExpTurns", "醤油の経験値ブーストが切れた！"],
    ["garlicDmgTurns", "にんにくの追加ダメージが切れた！"],
    ["lemonThrowTurns", "レモンの投擲ブーストが切れた！"],
    ["atkDebuffTurns", "攻撃力の半減デバフが解けた！"],
    ["defDebuffTurns", "防御力の半減デバフが解けた！"],
  ];
  for (const [key, message] of timers) {
    if ((player[key] || 0) > 0) {
      player[key]--;
      if (player[key] <= 0) messages.push(message);
    }
  }
  if ((player.honeyRegenTurns || 0) > 0) {
    const heal = Math.min(2, player.maxHp - player.hp);
    if (heal > 0) player.hp += heal;
    player.honeyRegenTurns--;
    if (player.honeyRegenTurns <= 0) messages.push("蜂蜜の自然回復が切れた！");
  }
}
