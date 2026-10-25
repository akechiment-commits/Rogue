/* ===== 超上級ダンジョンの階別モンスター候補 ===== */
/*
 * 超上級も開始はレベル1・短剣と革鎧。1階から盗賊や竜は出さない。
 * 序盤は殴れる雑魚、道具が揃ってから盗む・錆びる・爆発。
 * 同じ種族の上位形態は段階的に配置し、初登場は必ずLv1にする。
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
  /* B1〜5は基本形中心。B6以降は弱い形態だけが長く残らないよう上位形態を順次混ぜる。 */
  { min: 1, max: 5, level: 1, kinds: ["rat", "bat", "centipede"] },
  { min: 6, max: 10, level: 2, kinds: ["rat", "bat", "centipede"] },
  { min: 16, max: 20, level: 3, kinds: ["rat", "bat", "centipede"] },
  { min: 3, max: 7, level: 1, kinds: ["kobold"] },
  { min: 8, max: 11, level: 2, kinds: ["kobold"] },
  { min: 18, max: 22, level: 3, kinds: ["kobold"] },
  { min: 3, max: 8, level: 1, kinds: ["goblin"] },
  { min: 9, max: 12, level: 2, kinds: ["goblin"] },
  { min: 19, max: 23, level: 3, kinds: ["goblin"] },
  { min: 5, max: 9, level: 1, kinds: ["skeleton"] },
  { min: 10, max: 13, level: 2, kinds: ["skeleton"] },
  { min: 20, max: 24, level: 3, kinds: ["skeleton"] },
  { min: 5, max: 10, level: 1, kinds: ["imp"] },
  { min: 11, max: 14, level: 2, kinds: ["imp"] },
  { min: 24, max: 28, level: 3, kinds: ["imp"] },
  { min: 7, max: 12, level: 1, kinds: ["runner", "zombie", "mushroom"] },
  { min: 13, max: 16, level: 2, kinds: ["zombie"] },
  { min: 25, max: 29, level: 3, kinds: ["zombie"] },
  { min: 5, max: 8, level: 1, kinds: ["archer"] },
  { min: 7, max: 11, level: 1, kinds: ["slime"] },
  { min: 9, max: 12, level: 1, kinds: ["wokka"] },
  { min: 11, max: 16, level: 1, kinds: ["grabber", "tripper"] },
  { min: 17, max: 20, level: 2, kinds: ["grabber", "tripper"] },
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
  { min: 18, max: 21, level: 2, kinds: ["potionthrower", "potionhealer"] },
  { min: 15, max: 18, level: 1, kinds: ["itemMimic", "charger", "manaEater"] },
  { min: 21, max: 24, level: 2, kinds: ["manaEater"] },
  { min: 24, max: 27, level: 2, kinds: ["itemMimic", "charger"] },
  { min: 32, max: 35, level: 3, kinds: ["charger"] },
  { min: 17, max: 20, level: 1, kinds: ["thief", "tattoobird", "wolf"] },
  { min: 19, max: 22, level: 1, kinds: ["rustbug", "wizard"] },
  { min: 24, max: 28, level: 2, kinds: ["rustbug", "wizard"] },
  { min: 26, max: 29, level: 2, kinds: ["leprechaun", "tattoobird"] },
  { min: 36, max: 39, level: 3, kinds: ["itemMimic", "wizard", "leprechaun", "tattoobird", "rustbug", "potionthrower", "potionhealer"] },
  { min: 21, max: 24, level: 1, kinds: ["leprechaun", "bombgoblin", "orc", "dangerousPetal", "dreamEater"] },
  { min: 21, max: 24, level: 2, kinds: ["mushroom"] },
  { min: 23, max: 26, level: 1, kinds: ["itemThrower", "trapmaster", "serpent"] },
  { min: 31, max: 34, level: 2, kinds: ["serpent"] },
  { min: 25, max: 27, level: 1, kinds: ["hypnotist", "dodgemole", "waterFlower", "machodragon"] },
  { min: 21, max: 24, level: 2, kinds: ["wolf"] },
  { min: 29, max: 32, level: 3, kinds: ["wolf"] },
  /* 28〜40 ドラゴンは装備が付いてからLv1で出す */
  { min: 28, max: 31, level: 1, kinds: ["dragon", "troll", "killplaster"] },
  /* 32〜43は中堅種の上位形態を重ね、低ステータスの新顔だけに偏らせない。 */
  { min: 32, max: 35, level: 1, kinds: ["vampire", "giantEel", "mimic", "knocker", "walldigger"] },
  { min: 32, max: 35, level: 2, kinds: ["thief"] },
  { min: 33, max: 36, level: 2, kinds: ["rakugakima"] },
  { min: 34, max: 37, level: 1, kinds: ["icedragon"] },
  { min: 36, max: 39, level: 1, kinds: ["golem", "darkness", "magicreflector"] },
  { min: 36, max: 39, level: 2, kinds: ["dangerousPetal", "dreamEater", "grabber", "orc"] },
  { min: 36, max: 43, level: 2, kinds: ["vampire", "troll"] },
  { min: 38, max: 43, level: 2, kinds: ["dragon", "machodragon"] },
  { min: 40, max: 43, level: 2, kinds: ["golem", "darkness", "mimic", "knocker", "walldigger"] },
  /* 40〜47は重戦士・術師・引き寄せ役を順に上位形態へ移す。 */
  { min: 40, max: 43, level: 1, kinds: ["daemon", "puller", "witchdoc", "berserker"] },
  { min: 40, max: 43, level: 3, kinds: ["potionthrower", "potionhealer"] },
  { min: 40, max: 43, level: 2, kinds: ["bombgoblin", "waterFlower", "hypnotist"] },
  { min: 44, max: 47, level: 1, kinds: ["seaDevil", "disarmer", "lizardman"] },
  { min: 44, max: 47, level: 2, kinds: ["daemon", "puller", "witchdoc", "berserker", "killplaster", "itemThrower", "trapmaster", "magicreflector"] },
  { min: 48, max: 50, level: 2, kinds: ["darkness", "daemon", "mimic", "knocker", "dodgemole"] },
  /* 最終帯のLv3は当初の7系統に絞り、その他は既存の階帯で出す。 */
  { min: 48, max: 50, level: 3, kinds: ["dragon", "hypnotist", "potionhealer", "rakugakima", "mushroom", "machodragon", "manaEater"] },
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
