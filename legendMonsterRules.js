/* ===== 超上級ダンジョンの階別モンスター候補 ===== */
/*
 * 出さないものは出さない。ネズミ・コボルドなどの雑魚や、
 * 同じ仕事の二番手（風・岩砕き・自爆スライム・光精霊など）は切る。
 * 各帯は4階。同じ種族のLv違い帯は最低6階空ける。
 * 初登場は必ずLv1。終盤のドラゴンも例外にしない。
 */
export const LEGEND_MONSTER_BANDS = Object.freeze([
  /* 1〜4 盗む / 錆びる / 魔方陣。数値より能力が本体 */
  { min: 1, max: 4, level: 1, kinds: ["thief", "rustbug", "rakugakima"] },
  /* 5〜8 化ける / 薬投げ / 拘束。拘束と薬は揃えるが足払いは出さない */
  { min: 5, max: 8, level: 1, kinds: ["itemMimic", "potionthrower", "grabber"] },
  /* 9〜12 突進 / 倍速 / 自爆。爆発はこの帯だけ */
  { min: 9, max: 12, level: 1, kinds: ["charger", "wolf", "bombgoblin"] },
  /* 13〜16 防御無視 / 拾い投げ / 罠。ラクガキはLv2で戻す */
  { min: 13, max: 16, level: 1, kinds: ["orc", "itemThrower", "trapmaster"] },
  { min: 13, max: 16, level: 2, kinds: ["rakugakima"] },
  /* 17〜20 睡眠コンボと毒二回。盗賊Lv2。催眠や状態杖とは重ねない */
  { min: 17, max: 20, level: 1, kinds: ["dangerousPetal", "dreamEater", "serpent"] },
  { min: 18, max: 21, level: 2, kinds: ["thief"] },
  /* 21〜24 状態杖 / 装備外し / 引き寄せ。移動強制は引きダコだけ */
  { min: 21, max: 24, level: 1, kinds: ["witchdoc", "disarmer", "puller"] },
  /* 25〜28 催眠 / 投擲回避 / 水中花。水は1種。花びらとも催眠とも別帯 */
  { min: 25, max: 28, level: 1, kinds: ["hypnotist", "dodgemole", "waterFlower"] },
  /* 29〜32 ドラゴンはLv1で初登場。痛恨と魔法無効は別回答 */
  { min: 29, max: 32, level: 1, kinds: ["dragon", "troll", "killplaster"] },
  /* 33〜36 吸血倍速 / 拘束ウナギ。花びらLv2。火竜・氷竜とは別 */
  { min: 33, max: 36, level: 1, kinds: ["vampire", "giantEel"] },
  { min: 33, max: 36, level: 2, kinds: ["dangerousPetal", "dreamEater"] },
  /* 37〜40 ゴーレム / 闇視界。毒蛇Lv2。氷竜は火竜の二番手なので出さない */
  { min: 37, max: 39, level: 1, kinds: ["golem"] },
  { min: 37, max: 40, level: 1, kinds: ["darkness"] },
  { min: 37, max: 40, level: 2, kinds: ["serpent"] },
  /* 38〜41 催眠Lv2。花びら帯が終わってから */
  { min: 38, max: 41, level: 2, kinds: ["hypnotist"] },
  /* 39〜42 ドラゴンLv2。氷竜とは重ねない */
  { min: 39, max: 42, level: 2, kinds: ["dragon"] },
  /* 41〜44 デーモンもLv1で初登場。ものまね。三回攻撃は土地のデーモンだけ */
  { min: 41, max: 44, level: 1, kinds: ["daemon", "mimic"] },
  { min: 42, max: 45, level: 3, kinds: ["rakugakima"] },
  /* 45〜47 吸血・ゴーレム・魔法無効のLv2。デーモンはLv1のまま戻さない */
  { min: 45, max: 47, level: 2, kinds: ["vampire", "golem", "killplaster"] },
  /* 48〜50 Lv3はドラゴンと催眠。夢喰いとは重ねない。闇はLv2 */
  { min: 48, max: 50, level: 3, kinds: ["dragon", "hypnotist"] },
  { min: 48, max: 50, level: 2, kinds: ["darkness"] },
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
