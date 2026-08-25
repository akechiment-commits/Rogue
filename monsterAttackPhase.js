import { withEnemyDamageContext } from "./utils.js";

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
        if (monster) lunges.push({ id: monster.id, tile: monster.tile, fromX: monster.x, fromY: monster.y, toX: player.x, toY: player.y, hp: monster.hp, maxHp: monster.maxHp });
        hadActualHit = true;
      },
      onPlayerMiss: (monster) => {
        hitEvents.push({ type: "miss", x: player.x, y: player.y });
        if (monster) lunges.push({ id: monster.id, tile: monster.tile, fromX: monster.x, fromY: monster.y, toX: player.x, toY: player.y, hp: monster.hp, maxHp: monster.maxHp });
      },
    }));
  }
  return { hitEvents, lunges, hadActualHit };
}
