import { MH, MW, T } from "./utils.js";
import { canPlayerWalkOnWater, hasWaterBreathRing } from "./items.js";

const ADJACENT_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

function isWall(tile) {
  return tile === T.WALL || tile === T.BWALL;
}

function hasMonsterAt(dungeon, x, y) {
  return dungeon.monsters.some((monster) => monster.x === x && monster.y === y);
}

/** 壁抜け解除、壁埋まり、深水・泉での地形ダメージをターンごとに解決する。 */
export function advancePlayerTerrainEffects(player, dungeon, messages) {
  if ((player.wallWalkTurns || 0) > 0) {
    player.wallWalkTurns--;
    if (player.wallWalkTurns === 0) {
      messages.push("壁抜けが解けた！");
      if (isWall(dungeon.map[player.y]?.[player.x])) {
        let pushed = false;
        for (const [dx, dy] of ADJACENT_DIRS) {
          const x = player.x + dx;
          const y = player.y + dy;
          if (x >= 0 && x < MW && y >= 0 && y < MH &&
              !isWall(dungeon.map[y][x]) && !hasMonsterAt(dungeon, x, y)) {
            player.x = x;
            player.y = y;
            messages.push("壁の外に押し出された！");
            pushed = true;
            break;
          }
        }
        if (!pushed) {
          messages.push(hasWaterBreathRing(player)
            ? "壁に埋まったまま抜け出せない！"
            : "壁に埋まったまま抜け出せない！毎ターンダメージを受ける！");
        }
      }
    }
  }

  if ((player.wallWalkTurns || 0) === 0 && !hasWaterBreathRing(player) && isWall(dungeon.map[player.y]?.[player.x])) {
    const damage = 15;
    player.hp -= damage;
    messages.push(`壁に挟まれて苦しい！${damage}ダメージ！`);
    if (player.hp <= 0) player.deathCause = "壁に埋まり";
  }

  const onDeepWater = dungeon.map[player.y]?.[player.x] === T.WATER;
  const onSpring = !!dungeon.springs?.some((spring) => spring.x === player.x && spring.y === player.y);
  const confinedInPot = (player.potConfinedTurns || 0) > 0;
  const canWalkWater = canPlayerWalkOnWater(player, dungeon);
  if (onDeepWater && !canWalkWater && player.hp > 0) {
    if (!confinedInPot) {
      for (const [dx, dy] of ADJACENT_DIRS) {
        const x = player.x + dx;
        const y = player.y + dy;
        if (x >= 0 && x < MW && y >= 0 && y < MH &&
            !isWall(dungeon.map[y][x]) && dungeon.map[y][x] !== T.WATER && !hasMonsterAt(dungeon, x, y)) {
          player.x = x;
          player.y = y;
          messages.push("浮遊が解けて水から弾き出された！");
          break;
        }
      }
    }
    const stillDeepWater = dungeon.map[player.y]?.[player.x] === T.WATER;
    if (stillDeepWater && !canPlayerWalkOnWater(player, dungeon) && player.hp > 0) {
      const damage = 15;
      player.hp -= damage;
      messages.push(confinedInPot
        ? `水中の壺の中で息ができない！${damage}ダメージ！`
        : `溺れて苦しい！${damage}ダメージ！`);
      if (player.hp <= 0) player.deathCause = "水没により";
    }
  } else if (confinedInPot && onSpring && !hasWaterBreathRing(player) && player.hp > 0) {
    const damage = 15;
    player.hp -= damage;
    messages.push(`水中の壺の中で息ができない！${damage}ダメージ！`);
    if (player.hp <= 0) player.deathCause = "水没により";
  }
}
