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
