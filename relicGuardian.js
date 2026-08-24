import { uid } from "./utils.js";

/** 最深部から何段、地上側へ進んだかを1始まりで返す。 */
export function relicGuardianStage(maxDepth, currentDepth) {
  const _maxDepth = Math.max(1, Number(maxDepth) || Number(currentDepth) || 1);
  const _currentDepth = Math.max(1, Number(currentDepth) || _maxDepth);
  return Math.max(1, _maxDepth - Math.min(_maxDepth, _currentDepth) + 1);
}

/** 遺物の番人の段階別ステータス。最深部では控えめ、B1Fで従来の最大値になる。 */
export function relicGuardianStats(maxDepth, currentDepth) {
  const stage = relicGuardianStage(maxDepth, currentDepth);
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
  maxDepth,
  currentDepth,
  lastPx = x,
  lastPy = y,
  id = uid(),
} = {}) {
  const stats = relicGuardianStats(maxDepth, currentDepth);
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
    if (monster?.relicGuardian) monster.isBoss = true;
  }
  return dungeon;
}
