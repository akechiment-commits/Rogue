/* 超上級だけの階別候補・抽選重み・連携・数値上書き。 */
const band = (min, max, level, weights) => Object.freeze({
  min, max, level,
  kinds: Object.freeze(Object.keys(weights)),
  weights: Object.freeze({ ...weights }),
});

export const LEGEND_MONSTER_BANDS = Object.freeze([
  band(1, 3, 1, { rat: 4, bat: 3, centipede: 3 }),
  band(3, 4, 1, { kobold: 3, goblin: 3, archer: 8 }),
  band(4, 6, 1, { skeleton: 2, zombie: 2, slime: 3, wokka: 4 }),
  band(5, 7, 1, { imp: 2, tripper: 4, grabber: 3, mushroom: 1, runner: 1, wolf: 2 }),

  /* B8の合成節目。B10ではB5グウェン召喚用のLv2ゾンビ・スライム・ワッカも候補。 */
  band(8, 10, 2, { rat: 2, bat: 2, centipede: 2, kobold: 3 }),
  band(8, 10, 1, { synthmonster: 4, itemMimic: 3, charger: 3, manaEater: 2 }),
  band(10, 12, 2, { goblin: 3, skeleton: 2, zombie: 3, slime: 3, wokka: 3 }),
  band(11, 13, 2, { archer: 3 }),
  band(13, 15, 1, { wizard: 2 }),
  band(13, 15, 1, { bombslime: 2, potionthrower: 2, potionhealer: 2, rakugakima: 2, leprechaun: 1 }),
  band(13, 15, 2, { imp: 3 }),
  band(16, 18, 2, { tripper: 2, grabber: 2, mushroom: 1 }),
  band(16, 18, 1, { tattoobird: 2, serpent: 2, waterFlower: 1 }),
  band(16, 18, 2, { wolf: 2 }),
  band(17, 19, 1, { thief: 1, rustbug: 1 }),
  band(19, 21, 2, { potionthrower: 2 }),
  band(19, 21, 3, { goblin: 2, imp: 2, zombie: 2 }),
  band(20, 22, 3, { kobold: 2, skeleton: 2 }),
  band(21, 23, 3, { rat: 2, bat: 2, centipede: 2 }),
  band(19, 21, 1, { sylph: 2, lizardman: 2 }),

  band(22, 24, 1, { dangerousPetal: 4, dreamEater: 4, orc: 2, bombgoblin: 2 }),
  band(22, 24, 2, { manaEater: 2 }),
  band(25, 27, 2, { bombslime: 2 }),
  band(23, 25, 1, { potRaider: 2, itemThrower: 2, trapmaster: 2 }),
  band(25, 27, 2, { rustbug: 1, itemMimic: 2, charger: 2, tattoobird: 2, waterFlower: 1 }),
  band(25, 27, 1, { hypnotist: 1, dodgemole: 2, machodragon: 2 }),
  band(26, 28, 1, { hauntedWillow: 1 }),
  band(28, 30, 1, { sleepingLion: 1 }),
  band(28, 30, 2, { dreamEater: 3, lizardman: 2 }),
  band(28, 30, 1, { troll: 2, killplaster: 2, dragon: 2 }),
  band(29, 31, 2, { sylph: 2, wizard: 2, leprechaun: 1 }),
  band(29, 31, 3, { wolf: 2 }),

  band(31, 33, 3, { archer: 2, slime: 2, wokka: 2 }),
  band(31, 33, 2, { serpent: 2, dangerousPetal: 2 }),
  band(32, 34, 1, { mimic: 2, vampire: 2, giantEel: 1, walldigger: 2 }),
  band(32, 34, 2, { itemThrower: 2 }),
  band(32, 34, 3, { charger: 2 }),
  band(34, 36, 1, { icedragon: 2, golem: 1, darkness: 2, magicreflector: 2, shaman: 2 }),
  band(37, 39, 2, { potionhealer: 2 }),
  band(34, 36, 2, { machodragon: 2 }),
  band(38, 40, 2, { potRaider: 2 }),
  band(34, 36, 3, { dreamEater: 2 }),
  band(37, 39, 3, { itemMimic: 1 }),
  band(37, 39, 2, { dragon: 2, hauntedWillow: 1, sleepingLion: 1 }),
  band(38, 40, 2, { vampire: 2, mimic: 2 }),
  band(37, 39, 1, { berserker: 2, puller: 2, witchdoc: 2 }),

  band(40, 42, 1, { daemon: 2 }),
  band(40, 42, 2, { shaman: 2, golem: 1, darkness: 2, magicreflector: 2, hypnotist: 1, dodgemole: 2, troll: 1, walldigger: 2, icedragon: 2 }),
  band(41, 43, 2, { orc: 1 }),
  band(41, 43, 3, { bombslime: 2, serpent: 2 }),
  band(43, 45, 1, { disarmer: 1, seaDevil: 1 }),
  band(43, 45, 2, { berserker: 2, puller: 2, witchdoc: 2, trapmaster: 2, killplaster: 2 }),
  band(43, 45, 3, { itemThrower: 2 }),
  band(43, 45, 3, { lizardman: 1, dangerousPetal: 1 }),
  band(44, 46, 3, { sylph: 1, vampire: 1 }),
  band(46, 48, 3, { sleepingLion: 1, hauntedWillow: 1, golem: 1, darkness: 1, magicreflector: 1, troll: 1, walldigger: 1 }),

  band(48, 50, 3, { dragon: 1 }),
  band(49, 50, 3, { hypnotist: 1, potionhealer: 1, rakugakima: 1, mushroom: 1, machodragon: 1, manaEater: 1, mimic: 1, potRaider: 1, shaman: 1 }),
  band(49, 50, 2, { disarmer: 1, seaDevil: 1 }),
]);

const _pools = Array.from({ length: 51 }, () => []);
const _levels = Array.from({ length: 51 }, () => new Map());
const _weights = Array.from({ length: 51 }, () => new Map());
for (const entry of LEGEND_MONSTER_BANDS) {
  for (let floor = entry.min; floor <= entry.max; floor++) {
    for (const kind of entry.kinds) {
      if (!_pools[floor].includes(kind)) _pools[floor].push(kind);
      _levels[floor].set(kind, entry.level);
      _weights[floor].set(kind, entry.weights[kind] ?? 3);
    }
  }
}

for (let floor = 1; floor <= 50; floor++) {
  const largeCount = ["hauntedWillow", "sleepingLion"].filter(kind => _pools[floor].includes(kind)).length;
  const limit = 13 + largeCount;
  if (_pools[floor].length <= limit) continue;
  const keep = new Set([..._pools[floor]]
    .sort((a, b) => (_weights[floor].get(b) ?? 3) - (_weights[floor].get(a) ?? 3))
    .slice(0, limit));
  _pools[floor] = _pools[floor].filter(kind => keep.has(kind));
  for (const kind of _levels[floor].keys()) {
    if (!keep.has(kind)) { _levels[floor].delete(kind); _weights[floor].delete(kind); }
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

export function legendMonsterSpawnWeight(baseKind, floor) {
  return _weights[floor]?.get(baseKind) ?? 1;
}

export const LEGEND_ACTIVE_SPECIAL_KINDS = new Set([
  "archer", "wokka", "slime", "tripper", "grabber", "mushroom", "synthmonster",
  "itemMimic", "charger", "manaEater", "thief", "rustbug", "wizard", "bombslime",
  "potionthrower", "potionhealer", "rakugakima", "trapmaster", "leprechaun",
  "itemThrower", "tattoobird", "serpent", "waterFlower", "sylph", "lizardman",
  "dangerousPetal", "dreamEater", "orc", "bombgoblin", "hypnotist", "dodgemole",
  "potRaider", "sleepingLion", "hauntedWillow", "dragon", "troll", "killplaster",
  "vampire", "giantEel", "mimic", "knocker", "walldigger", "icedragon", "golem",
  "darkness", "magicreflector", "shaman", "daemon", "berserker", "puller", "witchdoc",
  "disarmer", "seaDevil",
]);

export const LEGEND_MONSTER_SYNERGY_GROUPS = Object.freeze([
  Object.freeze({ min: 6, max: 6, chance: 0.35, maxDistance: 3, sameRoom: true, kinds: Object.freeze(["wokka", "tripper"]) }),
  Object.freeze({ min: 22, max: 24, chance: 0.30, maxDistance: 6, sameRoom: true, kinds: Object.freeze(["dangerousPetal", "dreamEater"]) }),
  Object.freeze({ min: 28, max: 28, chance: 0.25, maxDistance: 8, sameRoom: true, kinds: Object.freeze(["sleepingLion", "dreamEater"]) }),
  Object.freeze({ min: 32, max: 33, chance: 0.25, maxDistance: 1, sameRoom: true, kinds: Object.freeze(["mimic", "archer"]) }),
  Object.freeze({ min: 40, max: 42, chance: 0.40, maxDistance: 3, sameRoom: true, kinds: Object.freeze(["shaman", "daemon"]) }),
]);

export function legendMonsterSynergyGroupsAtFloor(floor) {
  return LEGEND_MONSTER_SYNERGY_GROUPS.filter(group => group.min <= floor && floor <= group.max);
}

export function legendMonsterAffinityMultiplier(baseKind, floor, existingMonsters = []) {
  const kinds = new Set((existingMonsters || []).filter(monster => monster?.hp > 0).map(monster => monster.baseKind));
  for (const group of legendMonsterSynergyGroupsAtFloor(floor)) {
    if (group.kinds.includes(baseKind) && group.kinds.some(kind => kind !== baseKind && kinds.has(kind))) return 2;
  }
  return 1;
}
