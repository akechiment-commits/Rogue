/* ===== 超上級ダンジョンの階別モンスター候補 ===== */
/*
 * 超上級も開始はレベル1・短剣と革鎧。1階から盗賊や竜は出さない。
 * 序盤は殴れる雑魚、道具が揃ってから盗む・錆びる・爆発。
 * 同じ種族のLv違いは最低4階空ける。初登場は必ずLv1。
 */
export const LEGEND_MONSTER_BANDS = Object.freeze([
  {
    "min": 20,
    "max": 29,
    "level": 1,
    "kinds": [
      "hauntedWillow"
    ]
  },
  {
    "min": 35,
    "max": 39,
    "level": 2,
    "kinds": [
      "hauntedWillow"
    ]
  },
  {
    "min": 44,
    "max": 50,
    "level": 3,
    "kinds": [
      "hauntedWillow"
    ]
  },
  {
    "min": 26,
    "max": 30,
    "level": 1,
    "kinds": [
      "sleepingLion"
    ]
  },
  {
    "min": 35,
    "max": 39,
    "level": 2,
    "kinds": [
      "sleepingLion"
    ]
  },
  {
    "min": 44,
    "max": 50,
    "level": 3,
    "kinds": [
      "sleepingLion"
    ]
  },
  {
    "min": 23,
    "max": 26,
    "level": 1,
    "kinds": [
      "potRaider"
    ]
  },
  {
    "min": 36,
    "max": 39,
    "level": 2,
    "kinds": [
      "potRaider"
    ]
  },
  {
    "min": 48,
    "max": 50,
    "level": 3,
    "kinds": [
      "potRaider"
    ]
  },
  {
    "min": 19,
    "max": 22,
    "level": 1,
    "kinds": [
      "sylph"
    ]
  },
  {
    "min": 29,
    "max": 32,
    "level": 2,
    "kinds": [
      "sylph"
    ]
  },
  {
    "min": 44,
    "max": 47,
    "level": 3,
    "kinds": [
      "sylph"
    ]
  },
  {
    "min": 1,
    "max": 6,
    "level": 1,
    "kinds": [
      "rat",
      "bat",
      "centipede"
    ]
  },
  {
    "min": 3,
    "max": 8,
    "level": 1,
    "kinds": [
      "kobold",
      "goblin"
    ]
  },
  {
    "min": 5,
    "max": 10,
    "level": 1,
    "kinds": [
      "skeleton",
      "imp"
    ]
  },
  {
    "min": 7,
    "max": 12,
    "level": 1,
    "kinds": [
      "runner",
      "zombie",
      "mushroom"
    ]
  },
  {
    "min": 9,
    "max": 14,
    "level": 1,
    "kinds": [
      "archer",
      "wokka",
      "slime"
    ]
  },
  {
    "min": 11,
    "max": 16,
    "level": 1,
    "kinds": [
      "grabber",
      "tripper"
    ]
  },
  {
    "min": 13,
    "max": 17,
    "level": 1,
    "kinds": [
      "potionthrower",
      "potionhealer",
      "rakugakima"
    ]
  },
  {
    "min": 15,
    "max": 18,
    "level": 1,
    "kinds": [
      "itemMimic",
      "charger",
      "manaEater"
    ]
  },
  {
    "min": 17,
    "max": 20,
    "level": 1,
    "kinds": [
      "thief",
      "tattoobird",
      "wolf"
    ]
  },
  {
    "min": 18,
    "max": 21,
    "level": 2,
    "kinds": [
      "rat",
      "bat",
      "centipede"
    ]
  },
  {
    "min": 19,
    "max": 22,
    "level": 1,
    "kinds": [
      "rustbug",
      "wizard"
    ]
  },
  {
    "min": 21,
    "max": 24,
    "level": 1,
    "kinds": [
      "leprechaun",
      "bombgoblin",
      "orc",
      "dangerousPetal",
      "dreamEater"
    ]
  },
  {
    "min": 21,
    "max": 24,
    "level": 2,
    "kinds": [
      "mushroom",
      "runner"
    ]
  },
  {
    "min": 23,
    "max": 26,
    "level": 1,
    "kinds": [
      "itemThrower",
      "trapmaster",
      "serpent",
      "itempusher",
      "trapthrower"
    ]
  },
  {
    "min": 25,
    "max": 27,
    "level": 1,
    "kinds": [
      "hypnotist",
      "dodgemole",
      "waterFlower",
      "machodragon",
      "berserker"
    ]
  },
  {
    "min": 26,
    "max": 29,
    "level": 2,
    "kinds": [
      "kobold",
      "goblin",
      "skeleton",
      "wokka",
      "slime",
      "archer",
      "tripper"
    ]
  },
  {
    "min": 28,
    "max": 31,
    "level": 1,
    "kinds": [
      "dragon",
      "troll",
      "killplaster"
    ]
  },
  {
    "min": 28,
    "max": 31,
    "level": 2,
    "kinds": [
      "imp",
      "zombie",
      "wolf",
      "manaEater",
      "thief",
      "leprechaun",
      "rustbug",
      "wizard"
    ]
  },
  {
    "min": 30,
    "max": 33,
    "level": 1,
    "kinds": [
      "itemblaster",
      "stealthrower",
      "crystalslime",
      "bombslime"
    ]
  },
  {
    "min": 32,
    "max": 34,
    "level": 1,
    "kinds": [
      "vampire",
      "mimic",
      "knocker",
      "walldigger",
      "gelcube"
    ]
  },
  {
    "min": 32,
    "max": 34,
    "level": 2,
    "kinds": [
      "charger",
      "rakugakima",
      "itemMimic",
      "tattoobird"
    ]
  },
  {
    "min": 33,
    "max": 35,
    "level": 1,
    "kinds": [
      "giantEel"
    ]
  },
  {
    "min": 34,
    "max": 36,
    "level": 1,
    "kinds": [
      "icedragon",
      "golem",
      "darkness",
      "magicreflector",
      "reflector"
    ]
  },
  {
    "min": 34,
    "max": 36,
    "level": 1,
    "kinds": [
      "lizardman",
      "dragonknight",
      "synthmonster",
      "barriermage",
      "windmage",
      "starlight",
      "disarmer",
      "firedemon",
      "gargoyle"
    ]
  },
  {
    "min": 35,
    "max": 37,
    "level": 2,
    "kinds": [
      "dangerousPetal",
      "dreamEater",
      "grabber",
      "orc",
      "bombgoblin",
      "trapmaster",
      "serpent",
      "itemThrower",
      "itempusher",
      "trapthrower"
    ]
  },
  {
    "min": 36,
    "max": 37,
    "level": 1,
    "kinds": [
      "seaDevil"
    ]
  },
  {
    "min": 36,
    "max": 39,
    "level": 3,
    "kinds": [
      "rat",
      "bat",
      "centipede",
      "kobold",
      "goblin"
    ]
  },
  {
    "min": 37,
    "max": 40,
    "level": 1,
    "kinds": [
      "daemon",
      "puller",
      "witchdoc",
      "shaman",
      "fireCook"
    ]
  },
  {
    "min": 38,
    "max": 40,
    "level": 2,
    "kinds": [
      "dragon",
      "machodragon",
      "crystalslime",
      "bombslime",
      "itemblaster",
      "stealthrower",
      "troll",
      "killplaster"
    ]
  },
  {
    "min": 38,
    "max": 40,
    "level": 2,
    "kinds": [
      "waterFlower"
    ]
  },
  {
    "min": 39,
    "max": 41,
    "level": 2,
    "kinds": [
      "gelcube",
      "walldigger"
    ]
  },
  {
    "min": 40,
    "max": 43,
    "level": 3,
    "kinds": [
      "imp",
      "skeleton",
      "zombie",
      "wokka",
      "slime",
      "archer",
      "wolf",
      "thief",
      "tripper",
      "rustbug"
    ]
  },
  {
    "min": 41,
    "max": 42,
    "level": 2,
    "kinds": [
      "giantEel"
    ]
  },
  {
    "min": 41,
    "max": 43,
    "level": 2,
    "kinds": [
      "hypnotist",
      "dodgemole",
      "berserker",
      "knocker",
      "potionthrower",
      "potionhealer"
    ]
  },
  {
    "min": 41,
    "max": 43,
    "level": 2,
    "kinds": [
      "icedragon",
      "golem",
      "darkness",
      "magicreflector",
      "reflector",
      "vampire",
      "mimic"
    ]
  },
  {
    "min": 41,
    "max": 43,
    "level": 2,
    "kinds": [
      "lizardman",
      "dragonknight",
      "synthmonster",
      "barriermage",
      "windmage",
      "starlight",
      "disarmer",
      "firedemon",
      "gargoyle"
    ]
  },
  {
    "min": 43,
    "max": 44,
    "level": 2,
    "kinds": [
      "seaDevil"
    ]
  },
  {
    "min": 44,
    "max": 46,
    "level": 3,
    "kinds": [
      "dangerousPetal",
      "dreamEater"
    ]
  },
  {
    "min": 44,
    "max": 46,
    "level": 3,
    "kinds": [
      "itemMimic",
      "itemThrower",
      "fireCook",
      "bombslime",
      "bombgoblin",
      "orc",
      "trapmaster",
      "serpent",
      "trapthrower",
      "tattoobird",
      "rakugakima",
      "manaEater",
      "leprechaun",
      "wizard",
      "itempusher",
      "grabber",
      "charger"
    ]
  },
  {
    "min": 44,
    "max": 46,
    "level": 2,
    "kinds": [
      "daemon",
      "puller",
      "witchdoc",
      "shaman"
    ]
  },
  {
    "min": 45,
    "max": 46,
    "level": 3,
    "kinds": [
      "waterFlower"
    ]
  },
  {
    "min": 45,
    "max": 47,
    "level": 3,
    "kinds": [
      "dragon",
      "machodragon",
      "troll",
      "killplaster"
    ]
  },
  {
    "min": 46,
    "max": 48,
    "level": 3,
    "kinds": [
      "gelcube",
      "walldigger"
    ]
  },
  {
    "min": 47,
    "max": 48,
    "level": 3,
    "kinds": [
      "giantEel"
    ]
  },
  {
    "min": 48,
    "max": 50,
    "level": 3,
    "kinds": [
      "hypnotist",
      "dodgemole",
      "berserker",
      "runner",
      "itemblaster",
      "stealthrower",
      "crystalslime"
    ]
  },
  {
    "min": 48,
    "max": 50,
    "level": 3,
    "kinds": [
      "icedragon",
      "golem",
      "darkness",
      "magicreflector",
      "reflector",
      "vampire",
      "mimic"
    ]
  },
  {
    "min": 48,
    "max": 50,
    "level": 3,
    "kinds": [
      "potionthrower",
      "potionhealer"
    ]
  },
  {
    "min": 48,
    "max": 50,
    "level": 3,
    "kinds": [
      "lizardman",
      "dragonknight",
      "synthmonster",
      "barriermage",
      "windmage",
      "starlight",
      "disarmer",
      "firedemon",
      "gargoyle"
    ]
  },
  {
    "min": 49,
    "max": 50,
    "level": 3,
    "kinds": [
      "seaDevil"
    ]
  },
  {
    "min": 50,
    "max": 50,
    "level": 3,
    "kinds": [
      "daemon",
      "puller",
      "witchdoc",
      "shaman"
    ]
  }
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
