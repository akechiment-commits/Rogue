/** 呪われた聖域と雷の魔方陣について、プレイヤー足元の毎ターン効果を解決する。 */
export function resolvePlayerPentacleEffects(player, dungeon, messages, {
  inMagicSealRoom,
  inCursedMagicSealRoom,
  hasCursedExplosionPentacle,
  hasLightningResist,
  reduceLightningDamage,
  lightningResistDamageLabel,
  applyLightningToInventory,
  lu,
  getItemName,
}) {
  const cursedSanctuary = !inMagicSealRoom(player.x, player.y, dungeon) && dungeon.pentacles?.find((pentacle) =>
    pentacle.kind === "sanctuary" && pentacle.cursed && pentacle.x === player.x && pentacle.y === player.y
  );
  if (cursedSanctuary && player.hp > 0) {
    player.deathCause = `${cursedSanctuary.name}により`;
    player.hp = 0;
    messages.push(`${cursedSanctuary.name}に触れた！呪いの力で即死した！`);
  }

  const thunderPentacle = dungeon.pentacles?.find((pentacle) =>
    pentacle.kind === "thunder_trap" && pentacle.x === player.x && pentacle.y === player.y
  );
  if (!thunderPentacle || player.hp <= 0 || inMagicSealRoom(player.x, player.y, dungeon)) return;

  if (!thunderPentacle.cursed && hasCursedExplosionPentacle(dungeon)) {
    messages.push("呪われた爆発の魔方陣が雷を打ち消した！");
    return;
  }
  if (thunderPentacle.cursed) {
    const heal = Math.min(25, player.maxHp - player.hp);
    if (heal > 0) {
      player.hp += heal;
      messages.push(`${thunderPentacle.name}の力でHPが${heal}回復した！`);
    }
    return;
  }

  const hasLightningResistance = hasLightningResist(player);
  const cursedSealMultiplier = inCursedMagicSealRoom(player.x, player.y, dungeon) ? 2 : 1;
  const damage = reduceLightningDamage(
    Math.max(1, Math.floor((thunderPentacle.blessed ? 50 : 25) * cursedSealMultiplier)),
    player,
  );
  player.deathCause = `${thunderPentacle.name}の雷撃により`;
  player.hp -= damage;
  messages.push(`${thunderPentacle.name}に打たれた！${damage}ダメージ！${lightningResistDamageLabel(player)}`);
  if (!hasLightningResistance) {
    applyLightningToInventory(player, dungeon, messages, lu, getItemName);
  } else {
    messages.push("ゴムゴムの胴がアイテムへの雷を弾いた！");
  }
}
