import { withEnemyDamageContext } from "./utils.js";
import { monsterBodySize, monsterBounds } from "./monsterGeometry.js";

function monsterLungeTarget(monster, player) {
  if (monsterBodySize(monster) <= 1) return { x: player.x, y: player.y };
  const bounds = monsterBounds(monster);
  const edgeX = Math.max(bounds.x, Math.min(player.x, bounds.x + bounds.width - 1));
  const edgeY = Math.max(bounds.y, Math.min(player.y, bounds.y + bounds.height - 1));
  return {
    x: monster.x + Math.sign(player.x - edgeX),
    y: monster.y + Math.sign(player.y - edgeY),
  };
}

/** モンスター攻撃フェーズを実行し、描画に必要な命中・突進データを返す。 */
export function runMonsterAttackPhase(dungeon, player, messages, {
  skipMonsterActions = false,
  spinFired = false,
  moveMons,
}) {
  const hitEvents = [];
  const lunges = [];
  let hadActualHit = false;
  if (!skipMonsterActions && !spinFired) {
    withEnemyDamageContext(player, () => moveMons(dungeon, player, messages, "attackOnly", {
      onPlayerHit: (damage, monster) => {
        hitEvents.push({ type: "damage", x: player.x, y: player.y, value: damage, color: "#ff6644" });
        if (monster) {
          const target = monsterLungeTarget(monster, player);
          lunges.push({ id: monster.id, tile: monster.tile, fromX: monster.x, fromY: monster.y, toX: target.x, toY: target.y, hp: monster.hp, maxHp: monster.maxHp });
        }
        hadActualHit = true;
      },
      onPlayerMiss: (monster) => {
        hitEvents.push({ type: "miss", x: player.x, y: player.y });
        if (monster) {
          const target = monsterLungeTarget(monster, player);
          lunges.push({ id: monster.id, tile: monster.tile, fromX: monster.x, fromY: monster.y, toX: target.x, toY: target.y, hp: monster.hp, maxHp: monster.maxHp });
        }
      },
    }));
  }
  return { hitEvents, lunges, hadActualHit };
}
