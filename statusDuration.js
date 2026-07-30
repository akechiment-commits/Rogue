/**
 * 状態異常の継続ターン数を一元管理する。
 *
 * ルール:
 * - 同じ状態異常なら、付与原因に関わらず同じ基準ターン（対象種別ごと）
 * - 祝福されたアイテムが原因のときだけ例外: 時間2倍、または永続（9999）
 * - ボスは従来どおり効果時間が半減（主に tick 側で isBoss ? 2 : 1 減算）。
 *   付与時に半分を入れない（二重半減を防ぐ）。
 * - 永続（9999）のボス扱い:
 *     seal / mpCooldown … 有限 BOSS_SEAL_TURNS（20T）に置換
 *     それ以外（暗闇・幻惑・金縛り祝福など）… 付与は永続のまま。
 *     tick 側は 9999 を減らさないためボスでも時間では解けない
 *     （金縛りはダメージ解除が別途有効）
 */

export const PERMANENT_TURNS = 9999;

/** ボスへの「本来永続」封印系の有限ターン */
export const BOSS_SEAL_TURNS = 20;

/**
 * 基準ターン（通常・呪い・罠・敵特技・副次効果すべて共通）
 * player / monster で別値を持てる
 */
export const STATUS_BASE = {
  sleep:         { player: 6,   monster: 6 },
  paralyze:      { player: 10,  monster: 100 },
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

/** 祝福時、モンスターに永続になる状態 */
const BLESS_PERMANENT_ON_MONSTER = new Set(["darkness", "bewitch", "paralyze"]);

/** ボスに付けると有限化する「永続」ステータス */
const BOSS_FINITE_WHEN_PERMANENT = new Set(["seal", "mpCooldown"]);

/**
 * @param {string} status STATUS_BASE のキー
 * @param {object} [opts]
 * @param {"player"|"monster"} [opts.kind]
 * @param {boolean} [opts.blessed] 祝福アイテム由来なら true
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

  if (blessed) {
    if (kind === "monster" && BLESS_PERMANENT_ON_MONSTER.has(status)) {
      turns = PERMANENT_TURNS;
    } else if (turns < PERMANENT_TURNS) {
      turns *= 2;
    }
  }

  // 封印系の永続だけボスは有限化。他の永続はボスでも 9999 のまま
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
 * モンスターに金縛りを付与（通常100T / 祝福は永続 / ボスは tick 半減）。
 * ダメージでも解除される（_paralyzeHp 監視）。
 * @returns {number} 付与ターン
 */
export function applyMonsterParalyze(target, { blessed = false, ml = null, name = null } = {}) {
  if (!target) return 0;
  const turns = statusTurns("paralyze", { kind: "monster", blessed, target });
  target.paralyzed = true;
  target._paralyzeHp = target.hp;
  target.paralyzeTurns = Math.max(target.paralyzeTurns || 0, turns);
  if (ml) {
    const nm = name || target.name || "敵";
    if (isPermanentTurns(turns)) ml.push(`${nm}は永続の金縛りになった！動けない！${blessed ? "【祝】" : ""}`);
    else ml.push(`${nm}は金縛りになった！(${turns}ターン)${blessed ? "【祝】" : ""}`);
  }
  return turns;
}
