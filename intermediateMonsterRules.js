/* ===== 中級ダンジョンの階別モンスター候補 ===== */
/*
 * 中級の味付けは「群れ」。1体は初級寄りの強さだが、同種がフロアに居るほど
 * 次も同種が出やすくなり（群れ抽選）、分裂・増殖と合わせて数で圧をかける。
 * 超上級のようなレベル単調上昇はせず、レベルは各種の従来帯どおり最大Lv2まで。
 * 上級専用の強種（INTERMEDIATE で出さない種）は候補に含めない。
 */
const INTERMEDIATE_MONSTER_STARTS = Object.freeze({
  1: ["rat", "bat", "centipede"],
  2: ["kobold"],
  3: ["goblin"],
  4: ["skeleton", "runner", "archer", "mushroom"],
  5: ["tripper", "slime"],
  6: ["imp", "grabber", "potionthrower"],
  7: ["zombie", "rakugakima", "manaEater"],
  8: ["itemMimic", "wokka", "potionhealer"],
  9: ["thief", "charger", "tattoobird", "wolf"],
  10: ["rustbug"],
  11: ["wizard", "sylph", "bombslime"],
  12: ["itemblaster", "stealthrower"],
  13: ["leprechaun", "itempusher", "reflector"],
  14: ["potRaider", "fireCook", "rockspirit"],
  15: ["itemThrower", "orc", "wateri", "machodragon"],
  16: ["crystalslime", "gelcube", "mimic", "lizardman"],
  17: ["trapmaster", "knocker", "dragonknight"],
  18: ["dangerousPetal", "dreamEater", "trapthrower", "shaman", "hypnotist", "magicreflector", "hauntedWillow", "giantEel", "seaDevil"],
});

/* 帯(3階)を超えて居座る種・再登場する種。単階指定でプールへ足す。 */
const INTERMEDIATE_MONSTER_EXTRA_FLOORS = Object.freeze({
  rakugakima: [10, 11, 12],
  thief: [12],
  slime: [8, 9],
  tattoobird: [13, 14],
  mushroom: [14, 15, 16, 17],
  bombslime: [14, 15],
  potRaider: [17, 18, 19, 20],
  fireCook: [17, 18, 19, 20],
  potionhealer: [17, 18, 19, 20],
  mimic: [19, 20],
});

const _INTERMEDIATE_MONSTER_FLOOR_POOLS = Array.from({ length: 21 }, () => []);
for (const [startText, kinds] of Object.entries(INTERMEDIATE_MONSTER_STARTS)) {
  const start = Number(startText);
  for (let floor = start; floor < start + 3 && floor <= 20; floor++) {
    _INTERMEDIATE_MONSTER_FLOOR_POOLS[floor].push(...kinds);
  }
}
for (const [kind, floors] of Object.entries(INTERMEDIATE_MONSTER_EXTRA_FLOORS)) {
  for (const floor of floors) {
    if (floor >= 1 && floor <= 20) _INTERMEDIATE_MONSTER_FLOOR_POOLS[floor].push(kind);
  }
}

export const INTERMEDIATE_MONSTER_FLOOR_POOLS = Object.freeze(
  _INTERMEDIATE_MONSTER_FLOOR_POOLS.map((kinds) => Object.freeze([...new Set(kinds)])),
);

export function intermediateMonsterKindsAtFloor(floor) {
  return INTERMEDIATE_MONSTER_FLOOR_POOLS[floor] ?? [];
}

export function intermediateMonsterAllowed(baseKind, floor) {
  return intermediateMonsterKindsAtFloor(floor).includes(baseKind);
}

/*
 * レベルは各種の levels 側に残した中級帯で決める（従来の dungeonFloors.intermediate
 * のレベル帯をそのまま使う）。プール側では帯だけを管理し、レベル帯は二重管理しない。
 */
export function intermediateMonsterSpawnLevel(base, floor) {
  if (base?.levels?.length > 0) {
    for (let i = base.levels.length; i >= 1; i--) {
      const lv = base.levels[i - 1];
      const lvDf = lv.dungeonFloors?.intermediate;
      if (lvDf === null) continue;
      const lvMin = lvDf?.min ?? lv.minFloor;
      const lvMax = lvDf?.max ?? lv.maxFloor;
      if (lvMin !== undefined && floor >= lvMin && (lvMax === undefined || floor <= lvMax)) {
        return i + 1;
      }
    }
  }
  return 1;
}

/* 群れ抽選の対象。同種がフロアに居るほど同種が続けて出やすい。 */
export const INTERMEDIATE_PACK_KINDS = new Set([
  "rat", "bat", "centipede", "kobold", "goblin", "skeleton", "imp",
  "slime", "wokka", "zombie", "wolf", "archer", "rakugakima", "tattoobird",
]);

export const INTERMEDIATE_PACK_MULTIPLIER = 3;

export function intermediateMonsterPackMultiplier(baseKind, existingMonsters = []) {
  if (!INTERMEDIATE_PACK_KINDS.has(baseKind)) return 1;
  const packPresent = (existingMonsters || []).some(
    (monster) => monster?.hp > 0 && monster.baseKind === baseKind,
  );
  return packPresent ? INTERMEDIATE_PACK_MULTIPLIER : 1;
}
