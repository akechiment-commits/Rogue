/* ===== 上級ダンジョンの階別モンスター候補 ===== */
/*
 * 超上級（50F・王道サバイバル）と対照的に、上級（30F）は
 * 「3階ごとに生態系・対処法がガラッと切り替わるコンボ＆ギミック実験場」として設計する。
 *
 * - 地上枠は1フロア8〜13種に絞り、1階ずらしの闇鍋を避けて章立てをはっきりさせる。
 * - Lv2止めの縛りは設けず、再登場する序盤種や水棲種はその階のステータス帯に合うLv1〜Lv3で出す。
 * - 水棲5種（まずい魚・わてり・水中花・巨大ウナギ・うみのあくま）は各階で複数種を混在させる。
 */
const band = (min, max, level, kinds) => Object.freeze({
  min,
  max,
  level,
  kinds: Object.freeze([...kinds]),
});

export const ADVANCED_MONSTER_BANDS = Object.freeze([
  /* 第1章 B1〜3F: 導入・基礎戦闘 */
  band(1, 2, 1, ["rat", "bat", "centipede"]),
  band(2, 3, 1, ["kobold", "goblin"]),
  band(3, 3, 1, ["skeleton", "imp", "runner"]),

  /* 第2章 B4〜6F: 足止めと狙撃 */
  band(4, 6, 1, ["zombie", "archer", "grabber", "tripper", "wolf", "runner", "mushroom"]),

  /* 第3章 B7〜9F: 薬・分裂・落書き・合成① */
  band(7, 9, 1, ["slime", "rakugakima", "wokka", "potionthrower", "potionhealer", "charger", "itemMimic"]),
  band(8, 10, 1, ["synthmonster"]),

  /* 第4章 B10〜12F: 盗賊・錆・魔力吸収の無法街 */
  band(10, 12, 1, ["thief", "rustbug", "stealthrower", "manaEater", "tattoobird", "wizard", "leprechaun"]),
  band(10, 12, 2, ["rat", "bat", "centipede"]),

  /* 第5章 B13〜15F: 暴風・投擲・反射の回廊 */
  band(13, 15, 1, ["sylph", "itemThrower", "itempusher", "itemblaster", "reflector"]),
  band(13, 15, 2, ["archer", "kobold", "goblin", "skeleton"]),

  /* 第6章 B16〜18F: 灼熱の厨房＆粘体室 */
  band(16, 18, 1, ["fireCook", "potRaider", "crystalslime", "rockspirit", "orc", "gelcube", "bombslime"]),
  band(16, 18, 2, ["mushroom", "imp", "zombie", "wolf"]),

  /* 第7章 B19〜21F: からくり爆弾工房＆合成② */
  band(18, 20, 2, ["synthmonster"]),
  band(19, 21, 1, ["knocker", "walldigger", "trapthrower", "magicreflector", "mimic"]),
  band(19, 21, 2, ["trapmaster", "bombgoblin", "dodgemole", "reflector"]),
  band(19, 24, 1, ["hauntedWillow"]),

  /* 第8章 B22〜24F: 強制移動・竜族・強風 */
  band(21, 27, 1, ["sleepingLion"]),
  band(22, 24, 1, ["monsterthrow", "lizardman", "dragonknight"]),
  band(22, 24, 2, ["windmage", "puller", "disarmer", "serpent", "sylph"]),
  band(22, 24, 3, ["archer"]),

  /* 第9章 B25〜27F: 悪夢と呪術・睡眠の迷宮 */
  band(25, 27, 2, [
    "hypnotist", "dreamEater", "dangerousPetal", "witchdoc", "shaman",
    "barriermage", "starlight", "manaEater", "hauntedWillow",
  ]),
  band(25, 27, 3, ["mushroom"]),

  /* 第10章 B28〜30F: 狂戦士と守護竜・総力戦 */
  band(27, 29, 3, ["synthmonster"]),
  band(28, 30, 1, ["troll", "dragon", "icedragon", "gargoyle", "vampire", "golem", "daemon", "darkness"]),
  band(28, 28, 1, ["machodragon"]),
  band(29, 30, 2, ["machodragon"]),
  band(28, 30, 2, ["berserker", "killplaster", "firedemon", "sleepingLion"]),

  /* 水棲5種（複数混在・階層相応レベル） */
  band(2, 5, 1, ["badFish"]),
  band(6, 10, 2, ["badFish"]),
  band(11, 18, 3, ["badFish"]),
  band(4, 9, 1, ["wateri"]),
  band(10, 20, 2, ["wateri"]),
  band(21, 30, 3, ["wateri"]),
  band(6, 11, 1, ["waterFlower"]),
  band(12, 21, 2, ["waterFlower"]),
  band(22, 30, 3, ["waterFlower"]),
  band(14, 22, 1, ["giantEel"]),
  band(23, 30, 2, ["giantEel"]),
  band(16, 23, 1, ["seaDevil"]),
  band(24, 30, 2, ["seaDevil"]),
]);

const _ADVANCED_MONSTER_FLOOR_POOLS = Array.from({ length: 31 }, () => []);
const _ADVANCED_MONSTER_LEVELS = Array.from({ length: 31 }, () => new Map());

for (const entry of ADVANCED_MONSTER_BANDS) {
  for (let floor = entry.min; floor <= entry.max; floor++) {
    for (const kind of entry.kinds) {
      if (!_ADVANCED_MONSTER_FLOOR_POOLS[floor].includes(kind)) {
        _ADVANCED_MONSTER_FLOOR_POOLS[floor].push(kind);
      }
      _ADVANCED_MONSTER_LEVELS[floor].set(kind, entry.level);
    }
  }
}

export const ADVANCED_MONSTER_FLOOR_POOLS = Object.freeze(
  _ADVANCED_MONSTER_FLOOR_POOLS.map((kinds) => Object.freeze([...kinds])),
);

export function advancedMonsterKindsAtFloor(floor) {
  return ADVANCED_MONSTER_FLOOR_POOLS[floor] ?? [];
}

export function advancedMonsterAllowed(baseKind, floor) {
  return advancedMonsterKindsAtFloor(floor).includes(baseKind);
}

export function advancedMonsterSpawnLevel(base, floor) {
  if (!base?.levels?.length) return 1;
  return _ADVANCED_MONSTER_LEVELS[floor]?.get(base.baseKind) ?? 1;
}

/*
 * 連携グループ。グループの片方がフロアに居ると、相方の抽選重みが2倍になる。
 */
export const ADVANCED_MONSTER_SYNERGY_GROUPS = Object.freeze([
  /* 錆で装備を弱らせてから盗む */
  Object.freeze({ min: 10, max: 30, kinds: Object.freeze(["rustbug", "thief"]) }),
  /* MP吸収と呪文の魔道コンビ */
  Object.freeze({ min: 10, max: 30, kinds: Object.freeze(["manaEater", "wizard"]) }),
  /* 風で矢筋を逸らす相方を弓で守る */
  Object.freeze({ min: 13, max: 30, kinds: Object.freeze(["sylph", "archer"]) }),
  /* 投げて押し出して、道具をばらまく */
  Object.freeze({ min: 13, max: 30, kinds: Object.freeze(["itemThrower", "itempusher"]) }),
  /* 壺を荒らして所持品を焼く厨房コンビ */
  Object.freeze({ min: 16, max: 30, kinds: Object.freeze(["fireCook", "potRaider"]) }),
  /* 罠を敷いて爆弾で追い込む工房コンビ */
  Object.freeze({ min: 19, max: 30, kinds: Object.freeze(["trapmaster", "bombgoblin"]) }),
  /* 魔法反射＋物理反射のダブル反射コンビ */
  Object.freeze({ min: 19, max: 30, kinds: Object.freeze(["magicreflector", "reflector"]) }),
  /* 吹き飛ばし＋引き寄せで位置を狂わせる */
  Object.freeze({ min: 22, max: 30, kinds: Object.freeze(["windmage", "puller"]) }),
  /* 眠らせて夢を喰う悪夢コンビ */
  Object.freeze({ min: 25, max: 30, kinds: Object.freeze(["hypnotist", "dreamEater"]) }),
]);

export function advancedMonsterSynergyGroupsAtFloor(floor) {
  return ADVANCED_MONSTER_SYNERGY_GROUPS.filter(group => group.min <= floor && floor <= group.max);
}

export function advancedMonsterAffinityMultiplier(baseKind, floor, existingMonsters = []) {
  const kinds = new Set((existingMonsters || []).filter(monster => monster?.hp > 0).map(monster => monster.baseKind));
  for (const group of advancedMonsterSynergyGroupsAtFloor(floor)) {
    if (group.kinds.includes(baseKind) && group.kinds.some(kind => kind !== baseKind && kinds.has(kind))) return 2;
  }
  return 1;
}
