/**
 * 状態異常の継続ターン数を一元管理する。
 *
 * ルール:
 * - 同じ状態異常なら、付与原因に関わらず同じ基準ターン（対象種別ごと）
 * - 祝福されたアイテムが原因のときだけ例外: 時間2倍
 * - ボスは tick 側で半減（isBoss ? 2 : 1 減算）。付与時に半分は入れない
 * - 「永続」になるのは通常敵への封印・金縛りなど。ボスに永続は付けず有限化
 *
 * 金縛り（敵）の特例:
 * - 通常敵: 時間制限なし（被ダメで解除）。祝福時は paralyzeHits=2（2回被ダメが必要）
 * - ボス: 有限 BOSS_PARALYZE_TURNS（50）。祝福時は ×2 の 100T
 */

export const PERMANENT_TURNS = 9999;

/** ボスへの「本来永続」系の有限ターン（封印など） */
export const BOSS_SEAL_TURNS = 20;

/** ボス金縛りの有限ターン（通常敵は永続＝被ダメ解除） */
export const BOSS_PARALYZE_TURNS = 50;

/**
 * 基準ターン（通常・呪い・罠・敵特技・副次効果すべて共通）
 * player / monster で別値を持てる
 *
 * 注意: paralyze.monster はボス用の有限ターン参照用。
 * 通常敵は applyMonsterParalyze で永続扱い（ターン非消費）。
 */
export const STATUS_BASE = {
  sleep:         { player: 6,   monster: 6 },
  paralyze:      { player: 10,  monster: BOSS_PARALYZE_TURNS },
  slow:          { player: 10,  monster: 10 },
  confuse:       { player: 5,   monster: 20 },
  darkness:      { player: 20,  monster: 50 },
  bewitch:       { player: 20,  monster: 50 }, // 敵は fleeingTurns
  seal:          { player: 50,  monster: PERMANENT_TURNS },
  mpCooldown:    { player: 50,  monster: PERMANENT_TURNS },
  immobile:      { player: 5,   monster: 5 },
  poison:        { player: 5,   monster: 5 },
  haste:         { player: 10,  monster: 10 },
  sureHit:       { player: 100, monster: 100 },
  statusImmune:  { player: 200, monster: 200 },
  oily:          { player: 50,  monster: 100 },
  float:         { player: 30,  monster: 30 },
  soaked:        { player: 10,  monster: 10 },
  frozen:        { player: 5,   monster: 5 },
  bossSlow:      { player: 10,  monster: 10 },
  monsterSense:  { player: 100, monster: 100 },
  defSoftened:   { player: 10,  monster: 10 },
  berserker:     { player: 50,  monster: 50 },
};

/** ベースが永続のとき、ボスへは有限化するステータス */
const BOSS_FINITE_WHEN_PERMANENT = new Set(["seal", "mpCooldown"]);

/**
 * @param {string} status STATUS_BASE のキー
 * @param {object} [opts]
 * @param {"player"|"monster"} [opts.kind]
 * @param {boolean} [opts.blessed] 祝福アイテム由来なら true（×2）
 * @param {{ isBoss?: boolean }|null} [opts.target] ボス判定用
 * @returns {number}
 */
export function statusTurns(status, opts = {}) {
  const { kind = "player", blessed = false, target = null } = opts;
  const def = STATUS_BASE[status];
  if (!def) {
    console.warn(`[statusDuration] unknown status: ${status}`);
    return 1;
  }

  let turns = kind === "monster" ? def.monster : def.player;

  // 祝福は基本すべて ×2（永続ベースは ×2 しない）
  if (blessed && turns < PERMANENT_TURNS) {
    turns *= 2;
  }

  // 永続をボスに付ける場合は有限化（封印系）
  if (
    kind === "monster" &&
    target?.isBoss &&
    turns >= PERMANENT_TURNS &&
    BOSS_FINITE_WHEN_PERMANENT.has(status)
  ) {
    return BOSS_SEAL_TURNS;
  }

  return turns;
}

export function isPermanentTurns(t) {
  return (t || 0) >= PERMANENT_TURNS;
}

/**
 * モンスターに金縛りを付与。
 * - 通常敵: 永続（被ダメで解除）。祝福時は paralyzeHits=2（2回被ダメが必要）
 * - ボス: 有限 50T（祝福 100T）。tick 半減あり。被ダメでも解除
 * @returns {number} 付与ターン（通常敵の永続は PERMANENT_TURNS）
 */
export function applyMonsterParalyze(target, { blessed = false, ml = null, name = null } = {}) {
  if (!target) return 0;
  const nm = name || target.name || "敵";
  target.paralyzed = true;
  target._paralyzeHp = target.hp;

  if (target.isBoss) {
    const turns = statusTurns("paralyze", { kind: "monster", blessed, target });
    target.paralyzeTurns = Math.max(target.paralyzeTurns || 0, turns);
    target.paralyzeHits = 0;
    if (ml) ml.push(`${nm}は金縛りになった！(${turns}ターン)${blessed ? "【祝】" : ""}`);
    return turns;
  }

  // 通常敵: 時間制限なし
  target.paralyzeTurns = 0;
  if (blessed) {
    target.paralyzeHits = 2;
    if (ml) ml.push(`${nm}は強い金縛りになった！2回ダメージを受けないと解けない！【祝】`);
  } else {
    target.paralyzeHits = 0;
    if (ml) ml.push(`${nm}は金縛りになった！動けない！`);
  }
  return PERMANENT_TURNS;
}
