/** モンスターの1ターン分の移動・攻撃アニメーション用データを組み立てる。 */
export function createMonsterTurnAnimation() {
  return { moves: [], attacks: [], damages: [], lunges: [] };
}

export function snapshotMonsterPositions(monsters) {
  return new Map(monsters.map((monster) => [monster.id, { x: monster.x, y: monster.y }]));
}

/** 移動した敵を記録し、等速以下の敵には当ターン攻撃不可の印を付ける。 */
export function collectMonsterMoves(animation, monsters, snapshot) {
  for (const monster of monsters) {
    const before = snapshot.get(monster.id);
    if (!before || (monster.x === before.x && monster.y === before.y)) continue;
    animation.moves.push({
      id: monster.id,
      fromX: before.x,
      fromY: before.y,
      toX: monster.x,
      toY: monster.y,
      tile: monster.tile,
      hp: monster.hp,
      maxHp: monster.maxHp,
    });
    if ((monster.speed ?? 1) <= 1) monster._movedThisTurn = true;
  }
}

/** 攻撃フェーズ内で移動した突進を、専用の長めのスライドとして記録する。 */
export function collectChargerMoves(animation, monsters) {
  for (const monster of monsters) {
    const rush = monster._chargerMoveAnimation;
    if (!rush || (rush.fromX === rush.toX && rush.fromY === rush.toY)) {
      delete monster._chargerMoveAnimation;
      continue;
    }
    animation.moves.push({
      id: monster.id,
      fromX: rush.fromX,
      fromY: rush.fromY,
      toX: rush.toX,
      toY: rush.toY,
      tile: monster.tile,
      hp: monster.hp,
      maxHp: monster.maxHp,
      charger: true,
    });
    delete monster._chargerMoveAnimation;
  }
}

/** 攻撃フェーズで発生した命中・回避イベントを、描画用データに反映する。 */
export function collectMonsterAttackEvents(animation, hitEvents, lunges, hadActualHit, player) {
  if (hadActualHit && player.hp > 0) {
    animation.attacks.push({ type: "flash", x: player.x, y: player.y, color: "#ff4400" });
  }
  animation.damages.push(...hitEvents);
  animation.lunges.push(...lunges);
}
