/*
 * 毎ターン解決する、移動・罠に関する魔方陣効果。
 * 呼び出し側は魔方陣配列の順番を保って 1 枚ずつ呼ぶこと。
 */
export function resolveTeleportAndTrapPentacleEffect(pc, dungeon, player, messages, deps) {
  const {
    findRoom, inMagicSealRoom, random, randomTeleportDest,
    pick, rng, T, pickTrap, uid, removeTrap,
  } = deps;
  const pcRoom = findRoom(dungeon.rooms, pc.x, pc.y);
  const playerRoom = findRoom(dungeon.rooms, player.x, player.y);
  const inRange = pc.blessed || (playerRoom && pcRoom && playerRoom === pcRoom);
  const magicSealed = pc.kind !== "magic_seal" && inMagicSealRoom(pc.x, pc.y, dungeon);
  if (magicSealed) return;

  if (pc.kind === "teleport_trap" && !pc.cursed) {
    const floorBlocked = dungeon.pentacles.some(other =>
      other !== pc && other.kind === "teleport_trap" && other.cursed);
    if (!floorBlocked) {
      if (inRange && random() < 0.1) {
        const destination = randomTeleportDest(dungeon, player.x, player.y);
        if (destination) { player.x = destination.x; player.y = destination.y; }
        messages.push(`${pc.name}の力でテレポートした！`);
      }
      for (const monster of dungeon.monsters) {
        if (monster.magicImmune) continue;
        const monsterRoom = findRoom(dungeon.rooms, monster.x, monster.y);
        if ((pc.blessed || monsterRoom === pcRoom) && random() < 0.1) {
          const destination = randomTeleportDest(dungeon, monster.x, monster.y);
          if (destination) { monster.x = destination.x; monster.y = destination.y; }
          messages.push(`${pc.name}の力で${monster.name}がテレポートした！`);
        }
      }
    }
  }

  if (pc.kind !== "trap_gen") return;
  if (pc.cursed) {
    if (random() < 0.3) {
      const candidates = dungeon.traps.filter(trap => !trap.permanent);
      if (candidates.length > 0) {
        const trap = pick(candidates);
        removeTrap(dungeon, trap, messages, { message: `${pc.name}の呪いで罠が消えた！`, p: player });
      }
    }
    return;
  }
  if (random() >= 0.1) return;
  const roomScope = pc.blessed ? dungeon.rooms : (pcRoom ? [pcRoom] : []);
  if (roomScope.length === 0) return;
  const room = pick(roomScope);
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = rng(room.x, room.x + room.w - 1);
    const y = rng(room.y, room.y + room.h - 1);
    if (x === player.x && y === player.y) continue;
    if (dungeon.map[y][x] !== T.FLOOR) continue;
    if (dungeon.traps.some(trap => trap.x === x && trap.y === y)) continue;
    if (dungeon.items.some(item => item.x === x && item.y === y)) continue;
    if (dungeon.monsters.some(monster => monster.x === x && monster.y === y)) continue;
    if (dungeon.springs?.some(spring => spring.x === x && spring.y === y)) continue;
    if (dungeon.bigboxes?.some(bigbox => bigbox.x === x && bigbox.y === y)) continue;
    if (dungeon.pentacles?.some(other => other.x === x && other.y === y)) continue;
    if (dungeon.oilyTiles?.some(tile => tile.x === x && tile.y === y)) continue;
    if (dungeon.statues?.some(statue => statue.x === x && statue.y === y)) continue;
    dungeon.traps.push({ ...pickTrap(), id: uid(), x, y, revealed: false });
    return;
  }
}

/** 石飛ばしと回復の魔方陣について、部屋内の毎ターン効果を解決する。 */
export function resolveStoneAndHealingPentacleEffect(pc, dungeon, player, messages, {
  findRoom,
  inMagicSealRoom,
  inCursedMagicSealRoom,
  random,
  pick,
  rng,
  T,
  hasAbility,
  makeMagicStone,
  placeItemAt,
  onMonsterDefeated,
}) {
  if (pc.kind !== "stone_throw" && pc.kind !== "heal_aura") return;

  const room = findRoom(dungeon.rooms, pc.x, pc.y);
  if (!room || inMagicSealRoom(pc.x, pc.y, dungeon)) return;

  const playerRoom = findRoom(dungeon.rooms, player.x, player.y);

  if (pc.kind === "heal_aura") {
    const amount = pc.blessed ? 10 : 5;
    const playerInRange = pc.blessed || playerRoom === room;

    if (playerInRange) {
      if (pc.cursed) {
        const multiplier = inCursedMagicSealRoom(player.x, player.y, dungeon) ? 2 : 1;
        const damage = amount * multiplier;
        player.deathCause = `${pc.name}の呪いにより`;
        player.hp -= damage;
        messages.push(`${pc.name}の呪いで${damage}ダメージを受けた！`);
      } else {
        const heal = Math.min(amount, player.maxHp - player.hp);
        if (heal > 0) player.hp += heal;
      }
    }

    for (const monster of dungeon.monsters) {
      if (monster.hp <= 0 || monster.magicImmune) continue;
      if (findRoom(dungeon.rooms, monster.x, monster.y) !== room) continue;

      if (pc.cursed) {
        const multiplier = inCursedMagicSealRoom(monster.x, monster.y, dungeon) ? 2 : 1;
        const damage = amount * multiplier;
        monster.hp -= damage;
        messages.push(`${pc.name}の呪いで${monster.name}が${damage}ダメージを受けた！`);
        if (monster.hp <= 0) onMonsterDefeated(monster);
      } else if (monster.kind === "undead") {
        monster.hp -= amount;
        messages.push(`${pc.name}の回復力が${monster.name}を傷つけた！${amount}ダメージ！(アンデッド)`);
        if (monster.hp <= 0) onMonsterDefeated(monster);
      } else {
        const heal = Math.min(amount, monster.maxHp - monster.hp);
        if (heal > 0) monster.hp += heal;
      }
    }
    return;
  }

  if (random() >= 0.25) return;

  const targets = [];
  if (playerRoom === room) targets.push({ kind: "player" });
  for (const monster of dungeon.monsters) {
    if (monster.magicImmune) continue;
    if (findRoom(dungeon.rooms, monster.x, monster.y) === room) {
      targets.push({ kind: "monster", monster });
    }
  }
  if (targets.length === 0) return;

  const target = pick(targets);
  const targetMonster = target.monster;
  const targetX = target.kind === "player" ? player.x : targetMonster.x;
  const targetY = target.kind === "player" ? player.y : targetMonster.y;
  const baseAmount = rng(5, 10);
  const dropStoneAt = (x = targetX, y = targetY) => {
    placeItemAt(dungeon, x, y, makeMagicStone(1), messages, new Set());
  };

  let dodged = false;
  if (!pc.cursed) {
    const targetRoom = findRoom(dungeon.rooms, targetX, targetY);
    const dodgePentacle = dungeon.pentacles?.some((other) => {
      if (other.kind !== "dodge" || other.cursed) return false;
      if (other.blessed) return true;
      return findRoom(dungeon.rooms, other.x, other.y) === targetRoom;
    });
    if (dodgePentacle) {
      const targetName = target.kind === "player" ? "プレイヤー" : targetMonster.name;
      messages.push(`みかわしの魔方陣の加護で${targetName}が${pc.name}の魔法の石をかわした！魔法の石が足元に落ちた。`);
      dropStoneAt();
      dodged = true;
    }
  }

  if (!dodged && target.kind === "player") {
    if (hasAbility(player.armor, "dodge") && random() < 0.25) {
      messages.push(`${pc.name}の魔法の石をひらりとかわした！魔法の石が足元に落ちた。`);
      dropStoneAt();
      dodged = true;
    } else if ((player.oliveEvasionTurns || 0) > 0 && random() < 0.15) {
      messages.push(`オリーブオイルの力で${pc.name}の魔法の石をするりとかわした！魔法の石が足元に落ちた。`);
      dropStoneAt();
      dodged = true;
    }
  }
  if (dodged) return;

  if (pc.cursed) {
    if (target.kind === "player") {
      const heal = Math.min(baseAmount, player.maxHp - player.hp);
      if (heal > 0) {
        player.hp += heal;
        messages.push(`${pc.name}の魔法の石がプレイヤーに当たった！${heal}回復！`);
      }
    } else if (targetMonster.kind === "undead") {
      targetMonster.hp -= baseAmount;
      messages.push(`${pc.name}の魔法の石が${targetMonster.name}に当たった！${baseAmount}ダメージ！(アンデッド)`);
      if (targetMonster.hp <= 0) onMonsterDefeated(targetMonster);
    } else {
      const heal = Math.min(baseAmount, targetMonster.maxHp - targetMonster.hp);
      if (heal > 0) {
        targetMonster.hp += heal;
        messages.push(`${pc.name}の魔法の石が${targetMonster.name}に当たった！${heal}回復！`);
      }
    }
    return;
  }

  const cursedSealMultiplier = inCursedMagicSealRoom(targetX, targetY, dungeon) ? 2 : 1;
  const damage = (pc.blessed ? baseAmount * 2 : baseAmount) * cursedSealMultiplier;
  if (target.kind === "player") {
    player.deathCause = `${pc.name}の魔法の石により`;
    player.hp -= damage;
    messages.push(`${pc.name}の魔法の石がプレイヤーに当たった！${damage}ダメージ！`);
    return;
  }

  if (targetMonster.baseKind === "gelcube") {
    targetMonster.heldItems ||= [];
    targetMonster.heldItems.push(makeMagicStone(1));
    if (!targetMonster._gelBaseAtk) targetMonster._gelBaseAtk = targetMonster.atk;
    targetMonster._gelBoost = Math.min(10, (targetMonster._gelBoost || 1) * 1.2);
    targetMonster.atk = Math.round(targetMonster._gelBaseAtk * targetMonster._gelBoost);
    messages.push(`${pc.name}の魔法の石が${targetMonster.name}に飲み込まれた！（攻撃力×${targetMonster._gelBoost.toFixed(2)}→${targetMonster.atk}）`);
    return;
  }

  if (targetMonster.baseKind === "synthmonster") {
    targetMonster.heldItems ||= [];
    targetMonster.heldItems.push(makeMagicStone(1));
    const previousSpeed = targetMonster.speed || 0.5;
    targetMonster.speed = Math.min(3, previousSpeed + 0.5);
    targetMonster.maxAttacks = Math.ceil(targetMonster.speed);
    messages.push(`${pc.name}の魔法の石が${targetMonster.name}に飲み込まれた！${targetMonster.speed !== previousSpeed ? `(速度${targetMonster.speed})` : ""}`);
    return;
  }

  if (targetMonster.subtype === "reflector") {
    messages.push(`${pc.name}の魔法の石が${targetMonster.name}に弾き返された！`);
    const candidates = [];
    const mapHeight = dungeon.map.length;
    const mapWidth = dungeon.map[0]?.length ?? 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = pc.x + dx;
        const y = pc.y + dy;
        if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) continue;
        if (dungeon.map[y][x] !== T.FLOOR) continue;
        if (x === player.x && y === player.y) continue;
        if (dungeon.items.some((item) => item.x === x && item.y === y)) continue;
        if (dungeon.monsters.some((monster) => monster.x === x && monster.y === y)) continue;
        candidates.push([x, y]);
      }
    }
    if (candidates.length > 0) {
      const [dropX, dropY] = pick(candidates);
      dropStoneAt(dropX, dropY);
      messages.push("魔法の石が魔方陣の周辺に落ちた。");
    }
    return;
  }

  targetMonster.hp -= damage;
  messages.push(`${pc.name}の魔法の石が${targetMonster.name}に当たった！${damage}ダメージ！`);
  if (targetMonster.hp <= 0) onMonsterDefeated(targetMonster);
}
