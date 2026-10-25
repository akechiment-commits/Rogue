/* ===== 超上級ダンジョンの階別モンスター候補 ===== */
/*
 * 超上級も開始はレベル1・短剣と革鎧。1階から盗賊や竜は出さない。
 * 序盤は殴れる雑魚、道具が揃ってから盗む・錆びる・爆発。
 * 同じ種族のLv違いは最低4階空ける。初登場は必ずLv1。
 */
export const LEGEND_MONSTER_BANDS = Object.freeze([
  { min: 20, max: 29, level: 1, kinds: ["hauntedWillow"] },
  { min: 35, max: 39, level: 2, kinds: ["hauntedWillow"] },
  { min: 44, max: 50, level: 3, kinds: ["hauntedWillow"] },
  { min: 26, max: 30, level: 1, kinds: ["sleepingLion"] },
  { min: 35, max: 39, level: 2, kinds: ["sleepingLion"] },
  { min: 44, max: 50, level: 3, kinds: ["sleepingLion"] },
  { min: 23, max: 26, level: 1, kinds: ["potRaider"] },
  { min: 36, max: 39, level: 2, kinds: ["potRaider"] },
  { min: 48, max: 50, level: 3, kinds: ["potRaider"] },
  { min: 19, max: 22, level: 1, kinds: ["sylph"] },
  { min: 29, max: 32, level: 2, kinds: ["sylph"] },
  { min: 44, max: 47, level: 3, kinds: ["sylph"] },
  /* 1〜4 だけ薄く、5階から帯を重ねて6種以上にする */
  { min: 1, max: 6, level: 1, kinds: ["rat", "bat", "centipede"] },
  { min: 3, max: 8, level: 1, kinds: ["kobold", "goblin"] },
  { min: 5, max: 10, level: 1, kinds: ["skeleton", "imp"] },
  { min: 7, max: 12, level: 1, kinds: ["runner", "zombie", "mushroom"] },
  { min: 5, max: 8, level: 1, kinds: ["archer"] },
  { min: 7, max: 11, level: 1, kinds: ["slime"] },
  { min: 9, max: 12, level: 1, kinds: ["wokka"] },
  { min: 11, max: 16, level: 1, kinds: ["grabber", "tripper"] },
  { min: 12, max: 16, level: 2, kinds: ["archer"] },
  { min: 13, max: 18, level: 1, kinds: ["bombslime"] },
  { min: 17, max: 23, level: 2, kinds: ["slime"] },
  { min: 18, max: 23, level: 2, kinds: ["wokka"] },
  { min: 24, max: 29, level: 3, kinds: ["archer"] },
  { min: 24, max: 30, level: 2, kinds: ["bombslime"] },
  { min: 31, max: 38, level: 3, kinds: ["slime"] },
  { min: 32, max: 37, level: 3, kinds: ["wokka"] },
  { min: 38, max: 45, level: 3, kinds: ["bombslime"] },
  /* 13〜22 薬と魔方陣、化ける、突進。盗賊・錆は装備が付いてから */
  { min: 13, max: 17, level: 1, kinds: ["potionthrower", "potionhealer", "rakugakima"] },
  { min: 15, max: 18, level: 1, kinds: ["itemMimic", "charger", "manaEater"] },
  { min: 17, max: 20, level: 1, kinds: ["thief", "tattoobird", "wolf"] },
  { min: 18, max: 20, level: 2, kinds: ["rat", "bat", "centipede"] },
  { min: 19, max: 22, level: 1, kinds: ["rustbug", "wizard"] },
  { min: 21, max: 24, level: 1, kinds: ["leprechaun", "bombgoblin", "orc", "dangerousPetal", "dreamEater"] },
  { min: 21, max: 24, level: 2, kinds: ["mushroom"] },
  { min: 23, max: 26, level: 1, kinds: ["itemThrower", "trapmaster", "serpent"] },
  { min: 25, max: 27, level: 1, kinds: ["hypnotist", "dodgemole", "waterFlower", "machodragon"] },
  { min: 26, max: 29, level: 2, kinds: ["kobold", "goblin", "skeleton"] },
  { min: 28, max: 31, level: 2, kinds: ["imp", "zombie", "wolf", "manaEater"] },
  /* 28〜40 ドラゴンは装備が付いてからLv1で出す */
  { min: 28, max: 31, level: 1, kinds: ["dragon", "troll", "killplaster"] },
  /* 32〜39 吸血・拘束・氷。盗賊と突進のLv2、花びらLv2。火竜とは別帯 */
  { min: 32, max: 35, level: 1, kinds: ["vampire", "giantEel", "mimic", "knocker", "walldigger"] },
  { min: 32, max: 35, level: 2, kinds: ["thief", "charger"] },
  { min: 33, max: 36, level: 2, kinds: ["rakugakima"] },
  { min: 34, max: 37, level: 1, kinds: ["icedragon"] },
  { min: 36, max: 39, level: 1, kinds: ["golem", "darkness", "magicreflector"] },
  { min: 36, max: 39, level: 2, kinds: ["dangerousPetal", "dreamEater", "grabber", "rustbug", "orc"] },
  { min: 38, max: 41, level: 2, kinds: ["dragon", "machodragon"] },
  /* 40〜47 デーモンLv1。薬・爆発・水中花のLv2。催眠は花びらが終わってから */
  { min: 40, max: 43, level: 1, kinds: ["daemon", "puller", "witchdoc", "berserker"] },
  { min: 40, max: 43, level: 2, kinds: ["potionthrower", "potionhealer", "bombgoblin", "waterFlower", "hypnotist"] },
  { min: 44, max: 47, level: 1, kinds: ["seaDevil", "disarmer", "lizardman"] },
  { min: 44, max: 47, level: 2, kinds: ["vampire", "golem", "troll", "killplaster", "itemThrower", "trapmaster"] },
  /* 48〜50 Lv3は竜と催眠。睡眠とは重ねない。他はLv2で厚くする */
  { min: 48, max: 50, level: 3, kinds: ["dragon", "hypnotist", "potionhealer", "rakugakima", "mushroom", "machodragon", "manaEater"] },
  { min: 48, max: 50, level: 2, kinds: ["darkness", "daemon", "mimic", "knocker", "dodgemole"] },
]);

const _pools = Array.from({ length: 51 }, () => []);
const _levels = Array.from({ length: 51 }, () => new Map());
for (const band of LEGEND_MONSTER_BANDS) {
  for (let floor = band.min; floor <= band.max; floor++) {
    for (const kind of band.kinds) {
      if (!_pools[floor].includes(kind)) _pools[floor].push(kind);
      _levels[floor].set(kind, band.level);
    }
  }
}

export const LEGEND_MONSTER_FLOOR_POOLS = Object.freeze(
  _pools.map((kinds) => Object.freeze([...kinds])),
);

export function legendMonsterKindsAtFloor(floor) {
  return LEGEND_MONSTER_FLOOR_POOLS[floor] ?? [];
}

export function legendMonsterAllowed(baseKind, floor) {
  return legendMonsterKindsAtFloor(floor).includes(baseKind);
}

export function legendMonsterSpawnLevel(base, floor) {
  if (!base?.baseKind) return 1;
  return _levels[floor]?.get(base.baseKind) ?? 1;
}

/* ボス撃破後のプレイヤー成長に対して、超上級の通常敵だけが序盤形態のまま
 * 取り残されないようにするための階別能力値ベンチマーク。既にこの数値を
 * 上回る敵は変えず、下回る能力だけを一定割合で近づける。 */
export const LEGEND_MONSTER_STAT_BENCHMARKS = Object.freeze([
  Object.freeze({ floor: 6, hp: 42, atk: 17, def: 5 }),
  Object.freeze({ floor: 11, hp: 75, atk: 28, def: 10 }),
  Object.freeze({ floor: 16, hp: 100, atk: 32, def: 12 }),
  Object.freeze({ floor: 21, hp: 150, atk: 42, def: 16 }),
  Object.freeze({ floor: 26, hp: 190, atk: 48, def: 20 }),
  Object.freeze({ floor: 31, hp: 230, atk: 56, def: 24 }),
  Object.freeze({ floor: 36, hp: 280, atk: 62, def: 28 }),
  Object.freeze({ floor: 41, hp: 350, atk: 70, def: 32 }),
  Object.freeze({ floor: 46, hp: 400, atk: 78, def: 36 }),
  Object.freeze({ floor: 50, hp: 450, atk: 82, def: 38 }),
]);

export const LEGEND_MONSTER_STAT_PRESSURE = Object.freeze({
  normal: 0.60,
  abilityHpDef: 0.45,
  abilityAttack: 0.35,
  multiAttack: 0.20,
});

const LEGEND_MONSTER_STAT_PRESSURE_VERSION = 1;

function benchmarkAtFloor(floor) {
  const checkpoints = LEGEND_MONSTER_STAT_BENCHMARKS;
  if (floor <= checkpoints[0].floor) return checkpoints[0];
  if (floor >= checkpoints.at(-1).floor) return checkpoints.at(-1);
  for (let i = 1; i < checkpoints.length; i++) {
    const upper = checkpoints[i];
    if (floor > upper.floor) continue;
    const lower = checkpoints[i - 1];
    const t = (floor - lower.floor) / (upper.floor - lower.floor);
    return {
      hp: lower.hp + (upper.hp - lower.hp) * t,
      atk: lower.atk + (upper.atk - lower.atk) * t,
      def: lower.def + (upper.def - lower.def) * t,
    };
  }
  return checkpoints.at(-1);
}

function catchUpStat(value, target, rate) {
  const current = Math.max(0, Number(value) || 0);
  if (current >= target) return current;
  return Math.round(current + (target - current) * rate);
}

/**
 * 超上級の通常敵を階層の能力値目安へ近づける。
 * ボス、逃走役、物理ダメージ1固定の敵は個性を守るため除外する。
 * 既存セーブの敵にも到着時に一度だけ適用できるよう、処理版を個体に記録する。
 */
export function applyLegendMonsterStatPressure(monster, dungeonType, floor) {
  if (!monster || dungeonType !== "legend") return monster;
  if (monster._legendStatPressureVersion >= LEGEND_MONSTER_STAT_PRESSURE_VERSION) return monster;

  const appliedFloor = Math.max(1, Math.min(50, Math.floor(Number(floor) || 1)));
  const marker = {
    _legendStatPressureVersion: LEGEND_MONSTER_STAT_PRESSURE_VERSION,
    _legendStatFloor: appliedFloor,
  };
  if (appliedFloor < 6 || !monster.baseKind || monster.isBoss || monster.isPlayerClone ||
      monster.isWanderingMerchant || monster.isWanderingAdventurer || monster.relicGuardian ||
      monster.type === "shopkeeper" || monster.penaltyOnly || monster.baseKind === "runner" || monster.fixedDamageOnly) {
    return { ...monster, ...marker };
  }

  const target = benchmarkAtFloor(appliedFloor);
  const hasGimmick = !!monster.subtype;
  const hpDefRate = hasGimmick
    ? LEGEND_MONSTER_STAT_PRESSURE.abilityHpDef
    : LEGEND_MONSTER_STAT_PRESSURE.normal;
  const attackRate = (Number(monster.maxAttacks) || 1) > 1
    ? LEGEND_MONSTER_STAT_PRESSURE.multiAttack
    : hasGimmick
      ? LEGEND_MONSTER_STAT_PRESSURE.abilityAttack
      : LEGEND_MONSTER_STAT_PRESSURE.normal;

  const oldMaxHp = Math.max(1, Number(monster.maxHp ?? monster.hp) || 1);
  const oldHp = Number.isFinite(monster.hp) ? monster.hp : oldMaxHp;
  const maxHp = monster.baseKind === "runner"
    ? oldMaxHp
    : catchUpStat(oldMaxHp, target.hp, hpDefRate);
  const hp = Number.isFinite(monster.maxHp)
    ? (oldHp <= 0 ? oldHp : Math.max(1, Math.min(maxHp, Math.round(oldHp * maxHp / oldMaxHp))))
    : (oldHp <= 0 ? oldHp : maxHp);
  const atk = (Number(monster.atk) || 0) <= 0
    ? (Number(monster.atk) || 0)
    : catchUpStat(monster.atk, target.atk, attackRate);
  const def = catchUpStat(monster.def, target.def, hpDefRate);

  return {
    ...monster,
    hp,
    ...(Number.isFinite(monster.maxHp) ? { maxHp } : {}),
    ...(Number.isFinite(monster._dormantHp)
      ? { _dormantHp: catchUpStat(monster._dormantHp, target.hp, hpDefRate) }
      : {}),
    atk,
    def,
    ...marker,
  };
}
