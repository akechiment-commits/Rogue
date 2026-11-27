import { canPlaceMonsterBody, monsterBodyCells } from "./monsterGeometry.js";

/** 大型モンスターは体のどのマスがポータルに触れても転送対象になる。 */
function bodyOverlapsPortal(monster, x, y, pentacle) {
  return monsterBodyCells(monster, x, y).some((cell) => cell.x === pentacle.x && cell.y === pentacle.y);
}

function touchedPortalBefore(monster, before, pentacle) {
  return !!before && bodyOverlapsPortal(monster, before.x, before.y, pentacle);
}
/** 敵移動後、固定転送陣とポータルに乗ったモンスターを転送する。 */
export function transitMonstersThroughPortals(state, player, messages, positionSnapshot, { randomTeleportDest }) {
  const dungeon = state.dungeon;
  if (!dungeon.pentacles?.some((pentacle) => pentacle.kind === "portal" || pentacle.kind === "fixed_portal")) return;

  const hasGoal = player.inventory?.some((item) => item.type === "goal");
  for (const monster of [...dungeon.monsters]) {
    if (monster.forcedMoveImmune) continue;
    const canCrossFloors = !monster.isBoss && !(monster.type === "shopkeeper" && monster.state !== "hostile");
    const fixedPortal = dungeon.pentacles.find((pentacle) =>
      pentacle.kind === "fixed_portal" && bodyOverlapsPortal(monster, monster.x, monster.y, pentacle)
    );
    if (fixedPortal) {
      const before = positionSnapshot.get(monster.id);
      if (touchedPortalBefore(monster, before, fixedPortal)) continue;
      const pair = dungeon.pentacles.find((pentacle) =>
        pentacle.kind === "fixed_portal" && pentacle.pairId === fixedPortal.pairId &&
        !(pentacle.x === fixedPortal.x && pentacle.y === fixedPortal.y)
      );
      if (pair && canPlaceMonsterBody(dungeon, monster, pair.x, pair.y, player)) {
        monster.x = pair.x;
        monster.y = pair.y;
        messages.push(`${monster.name}が転送の魔法陣から対の陣へ抜けた！`);
      }
      continue;
    }

    const portal = dungeon.pentacles.find((pentacle) =>
      pentacle.kind === "portal" && bodyOverlapsPortal(monster, monster.x, monster.y, pentacle)
    );
    if (!portal) continue;
    const before = positionSnapshot.get(monster.id);
    if (touchedPortalBefore(monster, before, portal)) continue;

    if (portal.cursed) {
      const destination = randomTeleportDest(dungeon, monster.x, monster.y,
        (x, y) => canPlaceMonsterBody(dungeon, monster, x, y, player));
      if (destination && canPlaceMonsterBody(dungeon, monster, destination.x, destination.y, player)) {
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
    if (!hasGoal && canCrossFloors && state.floors) {
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
      if (!canPlaceMonsterBody(candidate.dungeon, monster, candidate.portal.x, candidate.portal.y,
          candidate.dungeon === dungeon ? player : null)) continue;
      destination = candidate;
      break;
    }
    if (!destination) continue;

    if (destination.dungeon === dungeon) {
      monster.x = destination.portal.x;
      monster.y = destination.portal.y;
      messages.push(`${monster.name}がポータルから${destination.portal.name}へ抜けた！`);
    } else if (monster.isPlayerClone) {
      dungeon.monsters = dungeon.monsters.filter((entry) => entry !== monster);
      messages.push("分身は階層の境界を越えられず消滅した！");
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
