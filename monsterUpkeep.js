import { T } from "./utils.js";

/** 攻撃後のモンスター回復・状態タイマー・雷の魔方陣効果を進める。 */
export function advanceMonsterUpkeep(dungeon, player, messages, {
  hasCursedExplosionPentacle,
  inMagicSealRoom,
  inCursedMagicSealRoom,
  onMonsterDefeated,
}) {
  for (const monster of dungeon.monsters) {
    if (monster.hp <= 0) continue;
    if (monster.baseKind === "im_boss_titan") {
      const heal = Math.min(5, monster.maxHp - monster.hp);
      if (heal > 0) {
        monster.hp += heal;
        messages.push(`${monster.name}の肉体が再生した！(+${heal}HP)`);
      }
    }
    if (monster.baseKind === "im_boss_kraken" && dungeon.map[monster.y]?.[monster.x] === T.WATER) {
      const heal = Math.min(20, monster.maxHp - monster.hp);
      if (heal > 0) {
        monster.hp += heal;
        messages.push(`${monster.name}は水中で体力を回復した！(+${heal}HP)`);
      }
    }
  }

  for (const monster of dungeon.monsters) {
    if ((monster.oilyTurns || 0) > 0) {
      monster.oilyTurns = Math.max(0, monster.oilyTurns - (monster.isBoss ? 2 : 1));
      if (monster.oilyTurns <= 0) messages.push(`${monster.name}の油まみれが取れた。`);
    }
    if ((monster.floatTurns || 0) > 0) {
      monster.floatTurns--;
      if (monster.floatTurns <= 0) messages.push(`${monster.name}の浮遊が解けた！`);
    }
  }

  if (!dungeon.pentacles?.some((pentacle) => pentacle.kind === "thunder_trap") || hasCursedExplosionPentacle(dungeon)) return;
  for (const monster of [...dungeon.monsters]) {
    const pentacle = dungeon.pentacles.find((entry) =>
      entry.kind === "thunder_trap" && entry.x === monster.x && entry.y === monster.y
    );
    if (!pentacle || monster.magicImmune || inMagicSealRoom(pentacle.x, pentacle.y, dungeon)) continue;

    if (pentacle.cursed) {
      if (monster.kind === "undead") {
        monster.hp -= 25;
        messages.push(`${pentacle.name}の力が${monster.name}を傷つけた！25ダメージ！(アンデッド)`);
        if (monster.hp <= 0) onMonsterDefeated(monster);
      } else {
        const heal = Math.min(25, monster.maxHp - monster.hp);
        if (heal > 0) {
          monster.hp += heal;
          messages.push(`${pentacle.name}の力で${monster.name}のHPが${heal}回復した！`);
        }
      }
      continue;
    }

    const weaknessMultiplier = monster.elemWeak === "thunder" ? 1.5 : 1;
    const cursedSealMultiplier = inCursedMagicSealRoom(pentacle.x, pentacle.y, dungeon) ? 2 : 1;
    const damage = Math.round((pentacle.blessed ? 50 : 25) * weaknessMultiplier * cursedSealMultiplier);
    monster.hp -= damage;
    messages.push(`${pentacle.name}が${monster.name}を打った！${damage}ダメージ！${weaknessMultiplier > 1 ? "雷弱点！" : ""}`);
    if (monster.hp <= 0) onMonsterDefeated(monster);
  }
}
