/**
 * 状態異常の継続ターン数を一元管理する。
 *
 * ルール:
 * - 同じ状態異常なら、付与原因に関わらず同じ基準ターン（対象種別ごと）
 * - 祝福されたアイテムが原因のときだけ例外: 時間2倍
 * - ボスは付与時に持続ターンを半分にする。付与後の減少は通常敵と同じ1ターンずつ
 * - 「永続」になるのは通常敵への封印・金縛りなど。ボスに永続は付けず有限化
 *
 * 金縛り（敵）の特例:
 * - 通常敵: 時間制限なし（被ダメで解除）。祝福時は paralyzeHits=2（2回被ダメが必要）
 * - ボス: 有限 BOSS_PARALYZE_TURNS（50）の半分から開始（25T）。祝福時は100Tの半分で50T
 */

export const PERMANENT_TURNS = 9999;

/** ボスへの「本来永続」系の基準有限ターン（封印など）。付与時に半分にする */
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
  attackSeal:    { player: 10,  monster: 10 },
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
const BOSS_FINITE_WHEN_PERMANENT = new Set(["seal"]);

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
    return Math.max(1, Math.ceil(BOSS_SEAL_TURNS / 2));
  }

  // ボスは付与時点で半分から始める。奇数は切り上げ、最低1ターンを保証する。
  if (kind === "monster" && target?.isBoss && turns < PERMANENT_TURNS) {
    return Math.max(1, Math.ceil(turns / 2));
  }

  return turns;
}

export function isPermanentTurns(t) {
  return (t || 0) >= PERMANENT_TURNS;
}

/** STATUS_BASEにないモンスター専用の一時効果にも、ボス半減を適用する。 */
export function monsterStatusTurns(baseTurns, target) {
  const turns = Math.max(1, Math.floor(Number(baseTurns) || 0));
  return target?.isBoss ? Math.max(1, Math.ceil(turns / 2)) : turns;
}

/**
 * プレイヤーへ毒を付与する。
 * 毒の再付与では攻撃力低下を重ねず、持続だけ加算する。
 * 攻撃力低下は解毒処理で戻すため poisonAtkLoss に記録する。
 */
export function applyPlayerPoison(player, { blessed = false, atkLoss: atkLossOverride } = {}) {
  if (!player) return { newlyApplied: false, atkLoss: 0, turns: 0, remaining: 0 };
  const newlyApplied = !player.poisoned;
  const turns = statusTurns("poison", { kind: "player", blessed });
  player.poisoned = true;
  player.poisonedTurns = (player.poisonedTurns || 0) + turns;

  let atkLoss = 0;
  if (newlyApplied) {
    const desiredLoss = atkLossOverride ?? (blessed ? 3 : 1);
    atkLoss = Math.min(desiredLoss, Math.max(0, (player.atk || 1) - 1));
    player.atk = Math.max(1, (player.atk || 1) - atkLoss);
    player.poisonAtkLoss = (player.poisonAtkLoss || 0) + atkLoss;
  }
  return { newlyApplied, atkLoss, turns, remaining: player.poisonedTurns };
}

/** ヤバイ食料の毒。攻撃力-2、持続は通常毒の2倍。 */
export function applyYabaiPoison(entity, kind, opts = {}) {
  if (kind === "player") {
    return applyPlayerPoison(entity, { blessed: true, atkLoss: 2 });
  }
  const target = opts.target || entity;
  const newlyApplied = !entity.poisoned;
  const turns = statusTurns("poison", { kind: "monster", blessed: true, target });
  entity.poisoned = true;
  entity.poisonedTurns = (entity.poisonedTurns || 0) + turns;
  let atkLoss = 0;
  if (newlyApplied && !entity.poisonHalfAtk) {
    entity.poisonOrigAtk = entity.atk;
    atkLoss = Math.min(2, Math.max(0, (entity.atk || 1) - 1));
    entity.atk = Math.max(1, (entity.atk || 1) - atkLoss);
    entity.poisonHalfAtk = true;
  }
  return { newlyApplied, atkLoss, turns, remaining: entity.poisonedTurns };
}

/** プレイヤーの毒と、それに紐づく攻撃力低下をまとめて解除する。 */
export function clearPlayerPoison(player) {
  if (!player) return false;
  const hadPoison = !!player.poisoned || (player.poisonedTurns || 0) > 0;
  player.poisoned = false;
  player.poisonedTurns = 0;
  if ((player.poisonAtkLoss || 0) > 0) {
    player.atk += player.poisonAtkLoss;
    player.poisonAtkLoss = 0;
  }
  return hadPoison;
}

/**
 * HPが0以下になった瞬間に解除する状態異常。
 *
 * HP0後に蘇生する場合でも、眠り・鈍足などの行動阻害が残ると
 * 自動ターン処理だけが進み続けるため、HP代入フックから共通で呼ぶ。
 * MP回復禁止（mpSealTurns。HP0復活の1000ターンのみ）や有利な効果は対象外。
 */
export function clearStatusEffectsOnHpZero(entity) {
  if (!entity) return false;

  const hadStatus = [
    entity.sleepTurns, entity.sleepInterruptedTurns, entity.paralyzeTurns,
    entity.paralyzed, entity.frozenTurns, entity.slowTurns, entity.slowSkip,
    entity.confusedTurns, entity.poisoned, entity.poisonedTurns,
    entity.sealedTurns, entity.sealed, entity.attackSealTurns, entity.darknessTurns, entity.blind,
    entity.blindTurns, entity.bewitchedTurns, entity.fleeingTurns,
    entity.immobileTurns, entity.knockdownTurns, entity.potConfinedTurns,
    entity.capturedBy, entity.oilyTurns, entity.soakedTurns,
    entity.defSoftenedTurns, entity.atkDebuffTurns, entity.defDebuffTurns,
    entity.pacifistTurns, entity.hypnosisPending,
  ].some((value) => typeof value === "boolean" ? value : (value || 0) > 0);

  /* プレイヤーの毒による攻撃力低下を戻す。 */
  if ((entity.poisonAtkLoss || 0) > 0) {
    entity.atk = (Number(entity.atk) || 0) + entity.poisonAtkLoss;
    entity.poisonAtkLoss = 0;
  }
  /* モンスターの毒による攻撃力半減を戻す。 */
  if (entity.poisonHalfAtk) {
    entity.atk = entity.poisonOrigAtk ?? entity.atk;
    delete entity.poisonHalfAtk;
    delete entity.poisonOrigAtk;
  }

  entity.sleepTurns = 0;
  entity.sleepInterruptedTurns = 0;
  entity.paralyzeTurns = 0;
  entity.paralyzed = false;
  entity._paralyzeHp = null;
  entity.paralyzeHits = 0;
  entity.frozenTurns = 0;
  entity.slowTurns = 0;
  entity.slowSkip = false;
  entity.confusedTurns = 0;
  entity.poisoned = false;
  entity.poisonedTurns = 0;
  entity.sealedTurns = 0;
  entity.sealed = false;
  entity.attackSealTurns = 0;
  entity.darknessTurns = 0;
  entity.blind = false;
  entity.blindTurns = 0;
  entity.bewitchedTurns = 0;
  entity.fleeingTurns = 0;
  entity.immobileTurns = 0;
  entity.knockdownTurns = 0;
  entity.potConfinedTurns = 0;
  entity.potConfinedPotId = null;
  entity.capturedBy = null;
  entity.oilyTurns = 0;
  entity.soakedTurns = 0;
  entity.defSoftenedTurns = 0;
  entity.atkDebuffTurns = 0;
  entity.defDebuffTurns = 0;
  entity.pacifistTurns = 0;
  entity.hypnosisPending = 0;

  /* 自動スキップ・次回行動予約の残骸も状態異常と一緒に捨てる。 */
  delete entity._slowAutoAdv;
  delete entity._eqSpeedAutoAdv;
  delete entity._eqSpeedSlowPending;
  delete entity._dashInterrupt;

  return hadStatus;
}

export function isAttackSealed(entity) {
  return (entity?.attackSealTurns || 0) > 0;
}

/** 祝福された封印の追加効果。通常攻撃を封じる。祝福倍率はかけない（10T固定、ボスは半分）。 */
export function applyAttackSeal(entity, opts = {}) {
  const { kind = "player", target = entity } = opts;
  if (!entity) return 0;
  const turns = statusTurns("attackSeal", { kind, target: kind === "monster" ? target : null });
  entity.attackSealTurns = (entity.attackSealTurns || 0) + turns;
  return turns;
}

/**
 * モンスターに金縛りを付与。
 * - 通常敵: 永続（被ダメで解除）。祝福時は paralyzeHits=2（2回被ダメが必要）
 * - ボス: 有限 50T（祝福 100T）の半分を付与。被ダメでも解除
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

/** 敵の暗闇。再付与は持続を加算し、直進方向は維持する。 */
export function applyMonsterDarkness(monster, turns) {
  if (!monster || !(turns > 0)) return 0;
  const wasDark = (monster.darknessTurns || 0) > 0;
  monster.darknessTurns = (monster.darknessTurns || 0) + turns;
  monster.aware = false;
  if (!wasDark) monster.darkDir = null;
  return monster.darknessTurns;
}

/** 敵の幻惑。再付与は逃走タイマーを加算する。 */
export function applyMonsterBewitch(monster, turns) {
  if (!monster || !(turns > 0)) return 0;
  monster.fleeingTurns = (monster.fleeingTurns || 0) + turns;
  return monster.fleeingTurns;
}
