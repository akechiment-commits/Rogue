import { uid } from "./utils.js";

/** 遺物の番人の出現回数を段階へ変換する（最大50段階）。 */
export function relicGuardianStage(spawnCount) {
  const _count = Number(spawnCount);
  return Math.max(1, Math.min(50, Number.isFinite(_count) ? Math.floor(_count) : 1));
}

/** 遺物の番人の段階別ステータス。出現するたびに強くなる。 */
export function relicGuardianStats(spawnCount) {
  const stage = relicGuardianStage(spawnCount);
  const speed = stage >= 20 ? 2 : 1;
  return {
    stage,
    hp: 60 + stage * 10,
    atk: 18 + stage * 2,
    def: 8 + stage,
    exp: 150 + stage * 20,
    speed,
  };
}

export function makeRelicGuardian({
  x,
  y,
  spawnCount = 1,
  lastPx = x,
  lastPy = y,
  id = uid(),
} = {}) {
  const stats = relicGuardianStats(spawnCount);
  return {
    id,
    name: "遺物の番人",
    hp: stats.hp,
    maxHp: stats.hp,
    atk: stats.atk,
    def: stats.def,
    exp: stats.exp,
    speed: stats.speed,
    baseSpeed: stats.speed,
    turnAccum: 0,
    tile: 58,
    kind: "beast",
    baseKind: "pursuer",
    relicGuardian: true,
    guardianStage: stats.stage,
    guardianSpawnCount: stats.stage,
    monLevel: 1,
    /* 戦利品だけ monsterDrop 側で専用分岐し、ボスの耐性・状態異常短縮は維持する。 */
    isBoss: true,
    aware: true,
    x,
    y,
    dir: { x: 0, y: 0 },
    lastPx,
    lastPy,
    patrolTarget: null,
  };
}

/** 旧セーブに残る遺物の番人へ、現行のボス特性を適用する。 */
export function restoreRelicGuardianBossTraits(dungeon) {
  for (const monster of dungeon?.monsters || []) {
    if (monster?.relicGuardian) {
      monster.isBoss = true;
      /* 旧セーブには出現回数がないため、保存されていた段階を暫定的な回数として引き継ぐ。 */
      if (!Number.isFinite(monster.guardianSpawnCount)) {
        monster.guardianSpawnCount = relicGuardianStage(monster.guardianStage);
      }
    }
  }
  return dungeon;
}
