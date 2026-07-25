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

export function resolveStoneAndHealingPentacleEffect(pc, dungeon, player, messages, deps) {
  const { findRoom, inMagicSealRoom, inCursedMagicSealRoom, random, pick, rng, MW, MH, T,
    hasAbility, makeMagicStone, placeItemAt, killMonster, trackMonster, lu } = deps;
  const room = findRoom(dungeon.rooms, pc.x, pc.y);
  if (!room || (pc.kind !== "magic_seal" && inMagicSealRoom(pc.x, pc.y, dungeon))) return;
  const playerRoom = findRoom(dungeon.rooms, player.x, player.y);
  const inRange = pc.blessed || playerRoom === room;
  const kill = monster => { trackMonster(monster); killMonster(monster, dungeon, player, messages, lu); };
  if (pc.kind === "heal_aura") {
    const amount = pc.blessed ? 10 : 5;
    if (inRange) {
      if (pc.cursed) { const damage = amount * (inCursedMagicSealRoom(player.x, player.y, dungeon) ? 2 : 1); player.deathCause = `${pc.name}の呪いにより`; player.hp -= damage; messages.push(`${pc.name}の呪いで${damage}ダメージを受けた！`); }
      else player.hp += Math.min(amount, player.maxHp - player.hp);
    }
    for (const monster of dungeon.monsters) {
      if (monster.hp <= 0 || monster.magicImmune || findRoom(dungeon.rooms, monster.x, monster.y) !== room) continue;
      if (pc.cursed) { const damage = amount * (inCursedMagicSealRoom(monster.x, monster.y, dungeon) ? 2 : 1); monster.hp -= damage; messages.push(`${pc.name}の呪いで${monster.name}が${damage}ダメージを受けた！`); if (monster.hp <= 0) kill(monster); }
      else if (monster.kind === "undead") { monster.hp -= amount; messages.push(`${pc.name}の回復力が${monster.name}を傷つけた！${amount}ダメージ！(アンデッド)`); if (monster.hp <= 0) kill(monster); }
      else monster.hp += Math.min(amount, monster.maxHp - monster.hp);
    }
    return;
  }
  if (pc.kind !== "stone_throw" || random() >= 0.25) return;
  const targets = [];
  if (playerRoom === room) targets.push({ player: true });
  for (const monster of dungeon.monsters) if (!monster.magicImmune && findRoom(dungeon.rooms, monster.x, monster.y) === room) targets.push({ monster });
  if (!targets.length) return;
  const target = pick(targets), monster = target.monster, x = target.player ? player.x : monster.x, y = target.player ? player.y : monster.y, amount = rng(5, 10);
  const drop = (dx = x, dy = y) => placeItemAt(dungeon, dx, dy, makeMagicStone(1), messages, new Set());
  let dodged = false;
  if (!pc.cursed && dungeon.pentacles?.some(other => other.kind === "dodge" && !other.cursed && (other.blessed || findRoom(dungeon.rooms, other.x, other.y) === findRoom(dungeon.rooms, x, y)))) { messages.push(`みかわしの魔方陣の加護で${target.player ? "プレイヤー" : monster.name}が${pc.name}の魔法の石をかわした！魔法の石が足元に落ちた。`); drop(); dodged = true; }
  if (!dodged && target.player && hasAbility(player.armor, "dodge") && random() < .25) { messages.push(`${pc.name}の魔法の石をひらりとかわした！魔法の石が足元に落ちた。`); drop(); dodged = true; }
  if (!dodged && target.player && (player.oliveEvasionTurns || 0) > 0 && random() < .15) { messages.push(`オリーブオイルの力で${pc.name}の魔法の石をするりとかわした！魔法の石が足元に落ちた。`); drop(); dodged = true; }
  if (dodged) return;
  if (pc.cursed) {
    if (target.player) { const heal = Math.min(amount, player.maxHp - player.hp); if (heal) { player.hp += heal; messages.push(`${pc.name}の魔法の石がプレイヤーに当たった！${heal}回復！`); } }
    else if (monster.kind === "undead") { monster.hp -= amount; messages.push(`${pc.name}の魔法の石が${monster.name}に当たった！${amount}ダメージ！(アンデッド)`); if (monster.hp <= 0) kill(monster); }
    else { const heal = Math.min(amount, monster.maxHp - monster.hp); if (heal) { monster.hp += heal; messages.push(`${pc.name}の魔法の石が${monster.name}に当たった！${heal}回復！`); } }
    return;
  }
  const damage = (pc.blessed ? amount * 2 : amount) * (inCursedMagicSealRoom(x, y, dungeon) ? 2 : 1);
  if (target.player) { player.deathCause = `${pc.name}の魔法の石により`; player.hp -= damage; messages.push(`${pc.name}の魔法の石がプレイヤーに当たった！${damage}ダメージ！`); return; }
  if (monster.baseKind === "gelcube") { monster.heldItems ||= []; monster.heldItems.push(makeMagicStone(1)); monster._gelBaseAtk ||= monster.atk; monster._gelBoost = Math.min(10, (monster._gelBoost || 1) * 1.2); monster.atk = Math.round(monster._gelBaseAtk * monster._gelBoost); messages.push(`${pc.name}の魔法の石が${monster.name}に飲み込まれた！（攻撃力×${monster._gelBoost.toFixed(2)}→${monster.atk}）`); return; }
  if (monster.baseKind === "synthmonster") { monster.heldItems ||= []; monster.heldItems.push(makeMagicStone(1)); const before = monster.speed || .5; monster.speed = Math.min(3, before + .5); monster.maxAttacks = Math.ceil(monster.speed); messages.push(`${pc.name}の魔法の石が${monster.name}に飲み込まれた！${monster.speed !== before ? `(速度${monster.speed})` : ""}`); return; }
  if (monster.subtype === "reflector") { messages.push(`${pc.name}の魔法の石が${monster.name}に弾き返された！`); const cells=[]; for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2){ const cx=pc.x+dx,cy=pc.y+dy; if(cx>=0&&cx<MW&&cy>=0&&cy<MH&&dungeon.map[cy][cx]===T.FLOOR&&!(cx===player.x&&cy===player.y)&&!dungeon.items.some(i=>i.x===cx&&i.y===cy)&&!dungeon.monsters.some(m=>m.x===cx&&m.y===cy)) cells.push([cx,cy]); } if(cells.length){ const [dx,dy]=pick(cells); drop(dx,dy); messages.push("魔法の石が魔方陣の周辺に落ちた。"); } return; }
  monster.hp -= damage; messages.push(`${pc.name}の魔法の石が${monster.name}に当たった！${damage}ダメージ！`); if (monster.hp <= 0) kill(monster);
}
