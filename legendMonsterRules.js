/* ===== 超上級ダンジョンの階別モンスター候補 ===== */
/*
 * 超上級は50階あるので、上級と同じ種族順を2階おき・4階帯で伸ばす。
 * 序盤は3〜9種、終盤は再登場を含めて最大16種。各基礎種は最低3階出す。
 * 自然出現のLv3はここで解禁する。
 */
const LEGEND_MONSTER_BAND = 4;

const LEGEND_MONSTER_STARTS = Object.freeze({
  1: ["rat", "bat", "centipede"],
  3: ["kobold", "goblin"],
  5: ["skeleton", "imp"],
  7: ["runner", "zombie"],
  9: ["archer", "wokka", "slime"],
  11: ["grabber", "tripper"],
  13: ["potionthrower", "rakugakima"],
  15: ["itemMimic", "charger"],
  17: ["tattoobird", "thief"],
  19: ["wolf", "rustbug", "wizard"],
  21: ["leprechaun", "itemblaster"],
  23: ["stealthrower", "itempusher"],
  25: ["itemThrower", "bombslime", "reflector"],
  27: ["crystalslime", "rockspirit", "orc"],
  29: ["dangerousPetal", "dreamEater", "wateri"],
  31: ["lizardman", "dragonknight", "gelcube"],
  33: ["trapmaster", "bombgoblin", "knocker"],
  35: ["magicreflector", "mimic", "walldigger"],
  37: ["waterFlower", "serpent", "trapthrower"],
  39: ["witchdoc", "shaman", "disarmer"],
  41: ["monsterthrow", "synthmonster", "barriermage"],
  43: ["windmage", "puller", "hypnotist"],
  45: ["troll", "firedemon", "giantEel"],
  46: ["killplaster", "icedragon", "seaDevil"],
  47: ["starlight", "dodgemole", "berserker"],
  48: ["gargoyle", "vampire", "dragon", "golem", "daemon", "darkness"],
});

const _LEGEND_MONSTER_FLOOR_POOLS = Array.from({ length: 51 }, () => []);
for (const [startText, kinds] of Object.entries(LEGEND_MONSTER_STARTS)) {
  const start = Number(startText);
  for (let floor = start; floor < start + LEGEND_MONSTER_BAND && floor <= 50; floor++) {
    _LEGEND_MONSTER_FLOOR_POOLS[floor].push(...kinds);
  }
}

/*
 * 再登場帯。序盤の単純敵は中盤にLv2、後半にLv3で戻す。
 * 能力は厄介だが数値は低めの敵も終盤へもう一度入れる。
 */
const LEGEND_MONSTER_REINFORCEMENTS = Object.freeze({
  16: ["rat", "bat", "centipede"],
  20: ["kobold", "goblin", "skeleton"],
  24: ["imp", "zombie", "wolf"],
  32: ["rat", "bat", "centipede"],
  36: ["kobold", "goblin", "skeleton"],
  40: ["imp", "zombie", "wolf"],
  38: ["dangerousPetal", "dreamEater"],
  42: ["dangerousPetal", "dreamEater", "hypnotist"],
  45: ["dangerousPetal", "dreamEater", "hypnotist"],
  46: ["dangerousPetal", "dreamEater", "hypnotist"],
  47: ["dangerousPetal", "dreamEater", "hypnotist"],
  49: ["dangerousPetal", "dreamEater", "hypnotist", "giantEel", "seaDevil"],
  50: ["dangerousPetal", "dreamEater", "hypnotist", "giantEel", "seaDevil"],
});

for (const [floorText, kinds] of Object.entries(LEGEND_MONSTER_REINFORCEMENTS)) {
  const floor = Number(floorText);
  _LEGEND_MONSTER_FLOOR_POOLS[floor].push(...kinds);
}

/* 50階だけ氷竜が帯から外れるので、締めとして残す。 */
_LEGEND_MONSTER_FLOOR_POOLS[50].push("icedragon");

export const LEGEND_MONSTER_FLOOR_POOLS = Object.freeze(
  _LEGEND_MONSTER_FLOOR_POOLS.map((kinds) => Object.freeze([...new Set(kinds)])),
);

const LEGEND_MONSTER_LEVEL_RANGES = Object.freeze({
  rat: { lv2: { min: 16, max: 19 }, lv3: { min: 32, max: 35 } },
  bat: { lv2: { min: 16, max: 19 }, lv3: { min: 32, max: 35 } },
  centipede: { lv2: { min: 16, max: 19 }, lv3: { min: 32, max: 35 } },
  kobold: { lv2: { min: 20, max: 23 }, lv3: { min: 36, max: 39 } },
  goblin: { lv2: { min: 20, max: 23 }, lv3: { min: 36, max: 39 } },
  skeleton: { lv2: { min: 20, max: 23 }, lv3: { min: 36, max: 39 } },
  imp: { lv2: { min: 24, max: 27 }, lv3: { min: 40, max: 43 } },
  zombie: { lv2: { min: 24, max: 27 }, lv3: { min: 40, max: 43 } },
  wolf: { lv2: { min: 24, max: 27 }, lv3: { min: 40, max: 43 } },
  dangerousPetal: { lv2: { min: 38, max: 44 }, lv3: { min: 45, max: 50 } },
  dreamEater: { lv2: { min: 38, max: 44 }, lv3: { min: 45, max: 50 } },
  hypnotist: { lv2: { min: 43, max: 46 }, lv3: { min: 47, max: 50 } },
  giantEel: { lv2: { min: 45, max: 47 }, lv3: { min: 48, max: 50 } },
  seaDevil: { lv2: { min: 46, max: 48 }, lv3: { min: 49, max: 50 } },
});

export function legendMonsterKindsAtFloor(floor) {
  return LEGEND_MONSTER_FLOOR_POOLS[floor] ?? [];
}

export function legendMonsterAllowed(baseKind, floor) {
  return legendMonsterKindsAtFloor(floor).includes(baseKind);
}

export function legendMonsterSpawnLevel(base, floor) {
  if (!base?.levels?.length) return 1;
  const maxLevel = Math.min(3, base.levels.length + 1);
  const spec = LEGEND_MONSTER_LEVEL_RANGES[base.baseKind];
  if (spec) {
    if (spec.lv3 && floor >= spec.lv3.min && floor <= spec.lv3.max) return Math.min(3, maxLevel);
    if (spec.lv2 && floor >= spec.lv2.min && floor <= spec.lv2.max) return Math.min(2, maxLevel);
    return 1;
  }
  if (floor >= 40) return maxLevel;
  if (floor >= 28) return Math.min(2, maxLevel);
  return 1;
}
