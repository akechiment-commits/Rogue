/** 敵移動後、固定転送陣とポータルに乗ったモンスターを転送する。 */
export function transitMonstersThroughPortals(state, player, messages, positionSnapshot, { randomTeleportDest }) {
  const dungeon = state.dungeon;
  if (!dungeon.pentacles?.some((pentacle) => pentacle.kind === "portal" || pentacle.kind === "fixed_portal")) return;

  const hasGoal = player.inventory?.some((item) => item.type === "goal");
  for (const monster of [...dungeon.monsters]) {
    const fixedPortal = dungeon.pentacles.find((pentacle) =>
      pentacle.kind === "fixed_portal" && pentacle.x === monster.x && pentacle.y === monster.y
    );
    if (fixedPortal) {
      const before = positionSnapshot.get(monster.id);
      if (before && before.x === fixedPortal.x && before.y === fixedPortal.y) continue;
      const pair = dungeon.pentacles.find((pentacle) =>
        pentacle.kind === "fixed_portal" && pentacle.pairId === fixedPortal.pairId &&
        !(pentacle.x === fixedPortal.x && pentacle.y === fixedPortal.y)
      );
      if (pair && !dungeon.monsters.some((other) => other !== monster && other.x === pair.x && other.y === pair.y) &&
          !(pair.x === player.x && pair.y === player.y)) {
        monster.x = pair.x;
        monster.y = pair.y;
        messages.push(`${monster.name}が転送の魔法陣から対の陣へ抜けた！`);
      }
      continue;
    }

    const portal = dungeon.pentacles.find((pentacle) =>
      pentacle.kind === "portal" && pentacle.x === monster.x && pentacle.y === monster.y
    );
    if (!portal) continue;
    const before = positionSnapshot.get(monster.id);
    if (before && before.x === portal.x && before.y === portal.y) continue;

    if (portal.cursed) {
      const destination = randomTeleportDest(dungeon, monster.x, monster.y);
      if (destination && !dungeon.monsters.some((other) => other !== monster && other.x === destination.x && other.y === destination.y) &&
          !(player.x === destination.x && player.y === destination.y)) {
        monster.x = destination.x;
        monster.y = destination.y;
        messages.push(`${monster.name}が${portal.name}に飲まれてランダムに飛んだ！【呪】`);
      }
      continue;
    }

    const cycle = [{ portal, dungeon, depth: portal.floor }];
    for (const candidate of dungeon.pentacles) {
      if (candidate !== portal && candidate.kind === "portal" && !candidate.cursed && !candidate.fixed) {
        cycle.push({ portal: candidate, dungeon, depth: portal.floor });
      }
    }
    if (!hasGoal && state.floors) {
      for (const [depth, floorDungeon] of Object.entries(state.floors)) {
        if (!floorDungeon.pentacles) continue;
        for (const candidate of floorDungeon.pentacles) {
          if (candidate.kind !== "portal" || candidate.cursed) continue;
          if (!(portal.blessed && candidate.blessed)) continue;
          cycle.push({ portal: candidate, dungeon: floorDungeon, depth: Number.parseInt(depth, 10) });
        }
      }
    }
    if (cycle.length < 2) continue;
    cycle.sort((left, right) => (left.portal.drawOrder || 0) - (right.portal.drawOrder || 0));
    const index = cycle.findIndex((entry) => entry.portal === portal);
    let destination = null;
    for (let offset = 1; offset < cycle.length; offset++) {
      const candidate = cycle[(index + offset) % cycle.length];
      if (candidate.dungeon.monsters?.some((other) => other !== monster && other.x === candidate.portal.x && other.y === candidate.portal.y)) continue;
      if (candidate.dungeon === dungeon && candidate.portal.x === player.x && candidate.portal.y === player.y) continue;
      destination = candidate;
      break;
    }
    if (!destination) continue;

    if (destination.dungeon === dungeon) {
      monster.x = destination.portal.x;
      monster.y = destination.portal.y;
      messages.push(`${monster.name}がポータルから${destination.portal.name}へ抜けた！`);
    } else {
      dungeon.monsters = dungeon.monsters.filter((entry) => entry !== monster);
      monster.x = destination.portal.x;
      monster.y = destination.portal.y;
      destination.dungeon.monsters = destination.dungeon.monsters || [];
      destination.dungeon.monsters.push(monster);
      messages.push(`${monster.name}がポータルに飲み込まれてどこかへ消えた！`);
    }
  }
}
