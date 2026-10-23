import { isStatusImmune } from "./statusImmunity.js";
import { T, applyMonsterDopingStats, restoreMonsterDopingStats } from "./utils.js";
import { advanceLargeMonsterStatusCooldowns } from "./largeMonsterStatus.js";
import { drunkenVomitDamage, shouldVomit } from "./intoxication.js";
import { blockLargeMonsterDamage } from "./largeMonsterDamage.js";
import { monEffectiveFloat, monEffectiveWallWalker } from "./monTraits.js";

/** 攻撃後のモンスター回復・状態タイマー・地形と魔方陣の継続効果を進める。 */
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
    advanceLargeMonsterStatusCooldowns(monster);
    if (monster.isPlayerClone && monster.hp > 0 && (monster.cloneTurns || 0) > 0) {
      monster.cloneTurns = Math.max(0, monster.cloneTurns - 1);
      if (monster.cloneTurns <= 0) {
        monster.hp = 0;
        messages.push("分身の時間切れで消えた！");
      }
    }
    if ((monster.dopingTurns || 0) > 0) {
      monster.dopingTurns--;
      if (monster.dopingTurns <= 0) {
        if (monster.dopingAftereffectPending && !isStatusImmune(monster, messages, monster.name)) {
          monster.dopingAftereffectTurns = 50;
          monster.dopingAftereffectPending = false;
          applyMonsterDopingStats(monster, 0.5);
          messages.push(`${monster.name}のドーピング効果が切れ、副作用で攻撃力と防御力が半減した！(50ターン)`);
        } else {
          monster.dopingAftereffectPending = false;
          restoreMonsterDopingStats(monster);
          messages.push(`${monster.name}のドーピング効果が切れた！攻撃力と防御力が戻った！`);
        }
      }
    } else if ((monster.dopingAftereffectTurns || 0) > 0) {
      monster.dopingAftereffectTurns--;
      if (monster.dopingAftereffectTurns <= 0) {
        restoreMonsterDopingStats(monster);
        messages.push(`${monster.name}のドーピング副作用が切れた！攻撃力と防御力が戻った！`);
      }
    }
    if ((monster.oilyTurns || 0) > 0) {
      monster.oilyTurns = Math.max(0, monster.oilyTurns - 1);
      if (monster.oilyTurns <= 0) messages.push(`${monster.name}の油まみれが取れた。`);
    }
    if ((monster.floatTurns || 0) > 0) {
      monster.floatTurns--;
      if (monster.floatTurns <= 0) messages.push(`${monster.name}の浮遊が解けた！`);
    }
    if ((monster.foodHasteTurns || 0) > 0) {
      monster.foodHasteTurns--;
      if (monster.foodHasteTurns <= 0) {
        delete monster.foodHasteMultiplier;
        messages.push(`${monster.name}の速さが元に戻った！`);
      }
    }
    if ((monster.drunkTurns || 0) > 0) {
      monster.drunkTurns--;
      if (monster.drunkTurns <= 0) messages.push(`${monster.name}の酔いが覚めた！`);
    }
    if ((monster.drunkenTurns || 0) > 0) {
      if (shouldVomit(monster)) {
        const damage = drunkenVomitDamage(monster.hp);
        monster.hp -= damage;
        messages.push(`${monster.name}は酩酊して嘔吐した！自分に${damage}ダメージ！`);
        if (monster.hp <= 0) {
          onMonsterDefeated(monster, { killerMon: monster });
          continue;
        }
      }
      monster.drunkenTurns--;
      if (monster.drunkenTurns <= 0) messages.push(`${monster.name}の酩酊が覚めた！`);
    }
  }

  const _expiredClones = dungeon.monsters.filter((monster) => monster.isPlayerClone && monster.hp <= 0);
  if (_expiredClones.length > 0) {
    dungeon.monsters = dungeon.monsters.filter((monster) => !_expiredClones.includes(monster));
  }

  for (const monster of [...dungeon.monsters]) {
    if (monster.hp <= 0 || !monster.isBoss) continue;
    const sanctuary = dungeon.pentacles?.find((pentacle) =>
      pentacle.kind === "sanctuary" && pentacle.x === monster.x && pentacle.y === monster.y
    );
    if (!sanctuary || inMagicSealRoom(sanctuary.x, sanctuary.y, dungeon)) continue;

    const currentTurn = player?._largeMonsterDamageTurn ?? player?.turns;
    if (monster._sanctuaryEntryDamageTurn != null && monster._sanctuaryEntryDamageTurn === currentTurn) {
      delete monster._sanctuaryEntryDamageTurn;
      continue;
    }
    if (blockLargeMonsterDamage(monster, player, messages)) continue;

    const damage = Math.max(1, Math.floor(monster.hp / 4));
    monster.hp -= damage;
    messages.push(`${sanctuary.name || "聖域の魔方陣"}の力で${monster.name}が${damage}ダメージを受けた！`);
    if (monster.hp <= 0) onMonsterDefeated(monster);
  }

  const currentTurn = player?._largeMonsterDamageTurn ?? player?.turns;
  for (const monster of [...dungeon.monsters]) {
    if (monster.hp <= 0 || !monster.isBoss) continue;
    const onWater = dungeon.map[monster.y]?.[monster.x] === T.WATER ||
      dungeon.springs?.some((spring) => spring.x === monster.x && spring.y === monster.y);
    if (!onWater || monster.waterOnly || monster.waterWalker || monEffectiveFloat(monster)) {
      delete monster._waterEntryDamageTurn;
      continue;
    }
    if (monster._waterEntryDamageTurn != null && monster._waterEntryDamageTurn === currentTurn) {
      delete monster._waterEntryDamageTurn;
      continue;
    }
    if (blockLargeMonsterDamage(monster, player, messages)) continue;

    const damage = Math.max(1, Math.floor(monster.hp / 4));
    monster.hp -= damage;
    messages.push(`${monster.name}は水中から逃れられず${damage}ダメージを受けた！`);
    if (monster.hp <= 0) onMonsterDefeated(monster);
  }

  for (const monster of [...dungeon.monsters]) {
    if (monster.hp <= 0 || !monster.isBoss) continue;
    const tile = dungeon.map[monster.y]?.[monster.x];
    const canRemainInWall = tile === T.WALL && monEffectiveWallWalker(monster);
    if ((tile !== T.WALL && tile !== T.BWALL) || canRemainInWall) {
      delete monster._wallEntryDamageTurn;
      continue;
    }
    if (monster._wallEntryDamageTurn != null && monster._wallEntryDamageTurn === currentTurn) {
      delete monster._wallEntryDamageTurn;
      continue;
    }
    if (blockLargeMonsterDamage(monster, player, messages)) continue;

    const damage = Math.max(1, Math.floor(monster.hp / 4));
    monster.hp -= damage;
    messages.push(`${monster.name}は壁から出られず${damage}ダメージを受けた！`);
    if (monster.hp <= 0) onMonsterDefeated(monster);
  }

  if (!dungeon.pentacles?.some((pentacle) => pentacle.kind === "thunder_trap") || hasCursedExplosionPentacle(dungeon)) return;
  for (const monster of [...dungeon.monsters]) {
    if (monster.hp <= 0) continue;
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
