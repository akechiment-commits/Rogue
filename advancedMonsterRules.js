/* ===== 上級ダンジョンの階別モンスター候補 ===== */
/*
 * 上級は MONS の minFloor/maxFloor をそのまま足し合わせず、
 * 3階単位の短い帯を順番に入れ替える。各基礎種は原則3階に出し、
 * 終盤だけ最終候補を少し長く残す。
 */
const ADVANCED_MONSTER_STARTS = Object.freeze({
  1: ["rat", "bat", "centipede"],
  2: ["kobold", "goblin"],
  3: ["skeleton", "imp"],
  4: ["runner", "zombie"],
  5: ["archer", "wokka", "slime"],
  6: ["grabber", "tripper"],
  7: ["potionthrower", "rakugakima"],
  8: ["itemMimic", "charger"],
  9: ["tattoobird", "thief"],
  10: ["wolf", "rustbug", "wizard"],
  11: ["leprechaun", "itemblaster"],
  12: ["stealthrower", "itempusher"],
  13: ["itemThrower", "bombslime", "reflector"],
  14: ["crystalslime", "rockspirit", "orc"],
  15: ["dangerousPetal", "dreamEater", "wateri"],
  16: ["lizardman", "dragonknight", "gelcube"],
  17: ["trapmaster", "bombgoblin", "knocker"],
  18: ["magicreflector", "mimic", "walldigger"],
  19: ["waterFlower", "serpent", "trapthrower"],
  20: ["witchdoc", "shaman", "disarmer"],
  21: ["monsterthrow", "synthmonster", "barriermage"],
  22: ["windmage", "puller", "hypnotist"],
  23: ["troll", "firedemon", "giantEel"],
  24: ["starlight", "dodgemole", "berserker"],
  25: ["killplaster", "icedragon", "seaDevil"],
  26: ["gargoyle", "vampire", "dragon"],
  28: ["golem", "daemon", "darkness"],
});

const _ADVANCED_MONSTER_FLOOR_POOLS = Array.from({ length: 31 }, () => []);
for (const [startText, kinds] of Object.entries(ADVANCED_MONSTER_STARTS)) {
  const start = Number(startText);
  for (let floor = start; floor < start + 3 && floor <= 30; floor++) {
    _ADVANCED_MONSTER_FLOOR_POOLS[floor].push(...kinds);
  }
}

/* 28〜30階は上級の締めとして、最終系の候補を少し厚く残す。 */
for (const floor of [28, 29, 30]) {
  _ADVANCED_MONSTER_FLOOR_POOLS[floor].push("gargoyle", "vampire", "dragon", "icedragon");
}

export const ADVANCED_MONSTER_FLOOR_POOLS = Object.freeze(
  _ADVANCED_MONSTER_FLOOR_POOLS.map((kinds) => Object.freeze([...new Set(kinds)])),
);

export function advancedMonsterKindsAtFloor(floor) {
  return ADVANCED_MONSTER_FLOOR_POOLS[floor] ?? [];
}

export function advancedMonsterAllowed(baseKind, floor) {
  return advancedMonsterKindsAtFloor(floor).includes(baseKind);
}
