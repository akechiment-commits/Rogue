/* ===== 超上級ダンジョンの階別モンスター候補 ===== */
/*
 * 超上級も開始はレベル1・短剣と革鎧。1階から盗賊や竜は出さない。
 * 序盤は殴れる雑魚、道具が揃ってから盗む・錆びる・爆発。
 * 同じ種族のLv違いは最低4階空ける。初登場は必ずLv1。
 */
export const LEGEND_MONSTER_BANDS = Object.freeze([
  /* 1〜4 だけ薄く、5階から帯を重ねて6種以上にする */
  { min: 1, max: 6, level: 1, kinds: ["rat", "bat", "centipede"] },
  { min: 3, max: 8, level: 1, kinds: ["kobold", "goblin"] },
  { min: 5, max: 10, level: 1, kinds: ["skeleton", "imp"] },
  { min: 7, max: 12, level: 1, kinds: ["runner", "zombie"] },
  { min: 9, max: 14, level: 1, kinds: ["archer", "wokka", "slime"] },
  { min: 11, max: 16, level: 1, kinds: ["grabber", "tripper"] },
  /* 13〜22 薬と魔方陣、化ける、突進。盗賊・錆は装備が付いてから */
  { min: 13, max: 17, level: 1, kinds: ["potionthrower", "rakugakima"] },
  { min: 15, max: 18, level: 1, kinds: ["itemMimic", "charger"] },
  { min: 17, max: 20, level: 1, kinds: ["thief", "tattoobird", "wolf"] },
  { min: 18, max: 21, level: 2, kinds: ["rat", "bat", "centipede"] },
  { min: 19, max: 22, level: 1, kinds: ["rustbug", "wizard"] },
  { min: 21, max: 24, level: 1, kinds: ["leprechaun", "bombgoblin", "orc", "dangerousPetal", "dreamEater"] },
  { min: 23, max: 26, level: 1, kinds: ["itemThrower", "trapmaster", "serpent"] },
  { min: 25, max: 27, level: 1, kinds: ["hypnotist", "dodgemole", "waterFlower"] },
  { min: 26, max: 29, level: 2, kinds: ["kobold", "goblin", "skeleton"] },
  { min: 28, max: 31, level: 2, kinds: ["imp", "zombie", "wolf"] },
  /* 28〜40 ドラゴンは装備が付いてからLv1で出す */
  { min: 28, max: 31, level: 1, kinds: ["dragon", "troll", "killplaster"] },
  /* 32〜39 吸血・拘束・氷。盗賊と突進のLv2、花びらLv2。火竜とは別帯 */
  { min: 32, max: 35, level: 1, kinds: ["vampire", "giantEel", "mimic", "knocker", "walldigger"] },
  { min: 32, max: 35, level: 2, kinds: ["thief", "charger"] },
  { min: 33, max: 36, level: 2, kinds: ["rakugakima"] },
  { min: 34, max: 37, level: 1, kinds: ["icedragon"] },
  { min: 36, max: 39, level: 1, kinds: ["golem", "darkness", "magicreflector"] },
  { min: 36, max: 39, level: 2, kinds: ["dangerousPetal", "dreamEater", "grabber", "rustbug", "orc"] },
  { min: 38, max: 41, level: 2, kinds: ["dragon"] },
  /* 40〜47 デーモンLv1。薬・爆発・水中花のLv2。催眠は花びらが終わってから */
  { min: 40, max: 43, level: 1, kinds: ["daemon", "puller", "witchdoc", "berserker"] },
  { min: 40, max: 43, level: 2, kinds: ["potionthrower", "bombgoblin", "waterFlower", "hypnotist"] },
  { min: 44, max: 47, level: 1, kinds: ["seaDevil", "disarmer", "lizardman"] },
  { min: 44, max: 47, level: 2, kinds: ["vampire", "golem", "troll", "killplaster", "itemThrower", "trapmaster"] },
  /* 48〜50 Lv3は竜と催眠。睡眠とは重ねない。他はLv2で厚くする */
  { min: 48, max: 50, level: 3, kinds: ["dragon", "hypnotist", "rakugakima"] },
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
