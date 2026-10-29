import {
  calcAtkDefDmg, calcPlayerDefense, rng, consumeBarrier,
  checkPlayerPhysicalAttackEvasion, checkMonsterEvasion
} from './utils.js';
import { inMagicSealRoom, isPlayerFloating, hasRingEffect, killMonster, applyPlayerTrip } from './items.js';
import { monEffectiveFloat } from './monTraits.js';
import { monsterPointDistance, monsterBodyCells } from './monsterGeometry.js';
import { isStatusImmune } from './statusImmunity.js';
import { applyPlayerPoison, resolveParalysisHit } from './statusDuration.js';
import { blockLargeMonsterStatus, startLargeMonsterStatusCooldown } from './largeMonsterStatus.js';
import { pushSplashAnim, pushAnim } from './animEvents.js';
import { plName } from './playerLabel.js';
/* monsters.js 本体との循環依存を避けるため、戦闘関数は monsters.js 側から登録してもらう（fixtures.js の setStatueSpawnHandler と同じ方式） */
let _combatDeps = null;
export function setChiranikuCombatDeps(deps) { _combatDeps = deps; }
function _resolveBolt(...args) { return _combatDeps._resolveBolt(...args); }
function hasLOS(...args) { return _combatDeps.hasLOS(...args); }
function monsterAttackPlayer(...args) { return _combatDeps.monsterAttackPlayer(...args); }

/**
 * ちらにくつんのくが特技を使用可能か（封印・睡眠・金縛り・石化・凍結・混乱・盲目等の状態異常中でないか）
 */
export function canUseChiranikuttsunnokuSpecial(monster) {
  return !monster.sealed &&
    !(monster.attackSealTurns > 0) &&
    !monster.blind &&
    !(monster.confusedTurns > 0) &&
    !monster.bewitched &&
    (monster.sleepTurns || 0) <= 0 &&
    !monster.paralyzed &&
    (monster.paralyzeTurns || 0) <= 0 &&
    (monster.petrifiedTurns || 0) <= 0 &&
    (monster.frozenTurns || 0) <= 0 &&
    (monster.knockdownTurns || 0) <= 0;
}

/**
 * 特技1: アースブレイカー
 * 自分の周囲1マスに無差別にダメージ＋転倒（ただし浮遊しているキャラには無効）
 */
export function chiranikuttsunnokuEarthbreaker(m, dg, pl, ml, opts = {}) {
  const luFn = opts.luFn || (() => {});
  const onHit = opts.onPlayerHit;
  const onMiss = opts.onPlayerMiss;
  const effAtk = (m.sharpStrikeTurns || 0) > 0 ? Math.floor(m.atk * 1.5) : m.atk;

  ml.push(`${m.name}の大地を揺るがすアースブレイカー！`);
  pushSplashAnim(m.x, m.y, "#906040");

  const inQuake = (x, y) => monsterPointDistance(m, x, y) === 1;

  // 1. プレイヤーへの判定
  const plInQuake = inQuake(pl.x, pl.y);
  const plOnSanc = !inMagicSealRoom(pl.x, pl.y, dg) &&
    !!dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y);

  if (plInQuake && pl.hp > 0) {
    if (isPlayerFloating(pl, dg)) {
      ml.push(`${plName(pl)}は宙に浮いているためアースブレイカーの揺れを受けない！`);
    } else if (plOnSanc) {
      ml.push(`聖域の加護が${m.name}のアースブレイカーを防いだ！`);
    } else if (checkPlayerPhysicalAttackEvasion(m, pl, ml, { attackName: "アースブレイカー", onMiss })) {
      // 回避成功：ダメージ・転倒なし
    } else {
      const dmg = Math.max(1, calcAtkDefDmg(effAtk, calcPlayerDefense(pl)) + rng(-2, 2));
      pl.hp -= dmg;
      pl.deathCause = `${m.name}のアースブレイカーで`;
      resolveParalysisHit(pl, ml);
      ml.push(`激しい地響きが${plName(pl)}を襲う！${dmg}ダメージ！`);
      onHit?.(dmg, m);

      // 転倒判定（所持品落とし、行動不能ではない）
      if (pl.hp > 0) {
        applyPlayerTrip(pl, dg, ml, {
          cause: `${m.name}のアースブレイカーで`,
          checkFloat: false,
          luFn,
          skipDamage: true,
          tripMsg: "激しい地響きで転んでしまった！",
        });
      }
    }
  }

  // 2. 他モンスターへの無差別判定
  for (const victim of [...(dg.monsters || [])]) {
    if (victim === m || victim.hp <= 0 || !dg.monsters.includes(victim) || victim.disguisedAsItem) continue;
    if (!monsterBodyCells(victim).some(cell => inQuake(cell.x, cell.y))) continue;

    if (monEffectiveFloat(victim)) {
      ml.push(`${victim.name}は宙に浮いているためアースブレイカーの揺れを受けない！`);
      continue;
    }

    if (consumeBarrier(victim, ml)) continue;

    if (checkMonsterEvasion(victim, { baseMissRate: 0.05 })) {
      ml.push(victim.baseKind === "boss_mireu" ? `${victim.name}は攻撃をかわした！` : `${victim.name}への攻撃は外れた！`);
      continue;
    }

    const vDef = victim.def || 0;
    const vDmg = Math.max(1, calcAtkDefDmg(effAtk, vDef, { defWeight: 1, variance: false }) + rng(-2, 2));
    victim.hp -= vDmg;
    ml.push(`激しい地響きが${victim.name}に命中！${vDmg}ダメージ！`);

    if (victim.hp > 0) {
      if (victim.type === "guard" || (victim.statusImmune || 0) > 0) {
        ml.push(`${victim.name}には転倒が効かなかった！`);
      } else if (!blockLargeMonsterStatus(victim, "knockdown", ml)) {
        victim.knockdownTurns = 2;
        startLargeMonsterStatusCooldown(victim, "knockdown");
        ml.push(`${victim.name}は激しい地響きで転倒した！(2ターン)`);
      }
    } else {
      killMonster(victim, dg, pl, ml, luFn, false, m);
    }
  }
}

/**
 * ベノムスティングの発射起点（ボスの体セル）と方向を算出する。
 * プレイヤーとの直線（水平・垂直・斜め45度）で距離2〜10マスかつ射線が通るセルを探す。
 */
export function getVenomStingOriginAndDir(monster, dungeon, player) {
  const cells = monsterBodyCells(monster);
  let best = null;
  let bestDist = 999;

  for (const cell of cells) {
    const dx = player.x - cell.x;
    const dy = player.y - cell.y;
    const isLine = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
    const dist = Math.max(Math.abs(dx), Math.abs(dy));

    if (isLine && dist >= 2 && dist <= 10) {
      if (hasLOS(dungeon.map, cell.x, cell.y, player.x, player.y)) {
        if (dist < bestDist) {
          bestDist = dist;
          best = {
            origin: cell,
            dx: Math.sign(dx),
            dy: Math.sign(dy),
            dist,
          };
        }
      }
    }
  }

  return best;
}

/**
 * 特技2: ベノムスティング
 * 遠距離直線上にいるとき、ダメージ＋毒を付与する物理飛び道具（命中80%）
 */
export function chiranikuttsunnokuVenomSting(m, dg, pl, ml, luFn, aim) {
  const effAtk = (m.sharpStrikeTurns || 0) > 0 ? Math.floor(m.atk * 1.5) : m.atk;

  /* 発射起点だけを尾の体セルへずらし、射手の同一性は実体 m のままにする
     （コピーを射手にすると自分の体を別個体と誤認し、風で戻った弾が実体でなくコピーを撃破処理してしまう） */
  _resolveBolt(m, dg, pl, ml, luFn, {
    startX: aim.origin.x,
    startY: aim.origin.y,
    dx: aim.dx,
    dy: aim.dy,
    baseRange: aim.dist,
    animColor: "#8020a0",
    fireMsg: `${m.name}が尾の毒針からベノムスティングを放った！`,
    boltName: "猛毒針",
    deathCause: `${m.name}のベノムスティングで`,
    hitChance: 0.80,
    calcPlDmg: () => Math.max(1, calcAtkDefDmg(effAtk, calcPlayerDefense(pl)) + rng(-2, 2)),
    calcMonDmg: (mon) => Math.max(1, calcAtkDefDmg(effAtk, mon.def || 0, { defWeight: 1, variance: false }) + rng(-2, 2)),
    onPlHit: (mlx) => {
      if (!isStatusImmune(pl, mlx, "自分")) {
        applyPlayerPoison(pl, { atkLoss: 1 });
        mlx.push("猛毒針が突き刺さった！毒を受けた！");
      }
    },
    onMonHit: (mon, mlx) => {
      if (!blockLargeMonsterStatus(mon, "poison", mlx)) {
        mon.poisonedTurns = (mon.poisonedTurns || 0) + 15;
        startLargeMonsterStatusCooldown(mon, "poison");
        mlx.push(`${mon.name}は猛毒針で毒に侵された！`);
      }
    },
  });
}

/**
 * 特技3: シャープストライク
 * 10ターンの間、自身の攻撃力を1.5倍にする（行動消費）
 */
export function chiranikuttsunnokuSharpStrike(m, ml) {
  m.sharpStrikeTurns = 10;
  ml.push(`${m.name}は尾の毒針を鋭く研ぎ澄ました！10ターンの間、攻撃力が1.5倍になった！`);
  pushAnim({ type: "flash", x: m.x, y: m.y, color: "#ff2244", duration: 250 });
}

/**
 * 特技4: デスシザース
 * 隣接時10%で発動。巨大なハサミで挟み込み2倍の物理打撃を繰り出す。
 * 通常攻撃と同様に見切りの盾・オリーブオイル・10%通常ミスで回避可能。
 */
export function chiranikuttsunnokuDeathScissors(m, dg, pl, ml, opts = {}, onHit = null, onMiss = null, luFn = null) {
  const plOnSanc = !inMagicSealRoom(pl.x, pl.y, dg) &&
    !!dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y);
  if (plOnSanc) {
    ml.push(`聖域の加護が${m.name}のデスシザースを防いだ！`);
    return;
  }

  pushAnim({
    type: "slash",
    x: pl.x,
    y: pl.y,
    color: "#ff2200"
  });

  monsterAttackPlayer(
    m, dg, pl, ml,
    d => `${m.name}の巨大なハサミが挟み込む！デスシザース！${d}ダメージ！`,
    {
      attackName: "デスシザース",
      damageMultiplier: 2,
      criticalLabel: true,
      onPlayerHit: onHit || opts.onPlayerHit,
      onPlayerMiss: onMiss || opts.onPlayerMiss,
      luFn: luFn || opts.luFn,
    }
  );
}
