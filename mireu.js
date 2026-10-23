import {
  MW, MH, T, uid, calcAtkDefDmg, calcPlayerDefense, randomTeleportDest,
  stepProjectile, playerHpEffectLabel, rng, consumeBarrier,
  checkPlayerPhysicalAttackEvasion, checkMonsterEvasion
} from './utils.js';
import { monsterPointDistance, monsterBodyCells, canPlaceMonsterBody, monsterOccupiesCell } from './monsterGeometry.js';
import { pushAnim, pushSplashAnim } from './animEvents.js';
import { plName } from './playerLabel.js';
import { statusTurns, resolveParalysisHit } from './statusDuration.js';
import {
  reduceFireDamage, hasFireResist, fireResistDamageLabel, isFireExplosionNullified,
  applyLightningToInventory, killMonster, inMagicSealRoom, blockPlayerStatus,
  hasRingEffect
} from './items.js';

/**
 * ミレウが特技を使用可能か（封印・睡眠・金縛り・石化・凍結・混乱・盲目等の状態異常中でないか）
 */
export function canUseMireuSpecial(monster) {
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
 * ハイパーサーミックブレスの発射起点（ボスの体セル）と方向を算出する。
 * プレイヤーとの8方向直線（上下左右・斜め45度）で距離2〜10マスかつ射線が通るセルを探す。
 * プレイヤーから矢を撃って命中する体のマスがあれば、そのマスからブレスを撃ち返せるようにする。
 */
export function getMireuBreathOriginAndDir(monster, dungeon, player) {
  if (!player || player.hp <= 0) return null;
  const overallDist = monsterPointDistance(monster, player.x, player.y);
  if (overallDist < 2 || overallDist > 10) return null;

  const cells = monsterBodyCells(monster);
  let best = null;
  let bestDist = 999;
  let bestCenterDist = 999;

  for (const cell of cells) {
    // 壁に埋まった体セルは射線の起点にしない
    if (dungeon.map?.[cell.y]?.[cell.x] === T.WALL || dungeon.map?.[cell.y]?.[cell.x] === T.BWALL) continue;

    const dx = player.x - cell.x;
    const dy = player.y - cell.y;
    const isLine = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
    if (!isLine) continue;

    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist < 1 || dist > 10) continue;

    // cell から player への直線上に壁がないか確認
    const sgnX = Math.sign(dx);
    const sgnY = Math.sign(dy);
    let blocked = false;
    let cx = cell.x + sgnX;
    let cy = cell.y + sgnY;
    while (cx !== player.x || cy !== player.y) {
      if (cx < 0 || cx >= MW || cy < 0 || cy >= MH ||
          dungeon.map?.[cy]?.[cx] === T.WALL || dungeon.map?.[cy]?.[cx] === T.BWALL) {
        blocked = true;
        break;
      }
      cx += sgnX;
      cy += sgnY;
    }
    if (blocked) continue;

    // プレイヤーへの最短距離を優先。同距離ならボスの中心セル(monster.x, monster.y)に近いものを優先
    const centerDist = Math.abs(cell.x - monster.x) + Math.abs(cell.y - monster.y);
    if (dist < bestDist || (dist === bestDist && centerDist < bestCenterDist)) {
      bestDist = dist;
      bestCenterDist = centerDist;
      best = {
        origin: cell,
        dx: sgnX,
        dy: sgnY,
        dist,
      };
    }
  }

  return best;
}

/**
 * プレイヤーが遠距離直線上にいるか（体のいずれかのセルから距離2〜10マス、視線が通る）
 */
export function isMireuFarLine(m, dg, pl) {
  return getMireuBreathOriginAndDir(m, dg, pl) !== null;
}

/**
 * 特技1: ハイパーサーミックブレス
 * 遠距離直線上に50%で発射する炎属性の大ダメージブレス
 */
export function mireuHyperthermicBreath(m, dg, pl, ml, opts = {}) {
  // 爆発・炎の打ち消し判定
  if (isFireExplosionNullified(dg, pl)) {
    ml.push((pl.fireExplosionNullTurns || 0) > 0
      ? `炎と爆発が不発にされた！（残り${pl.fireExplosionNullTurns}ターン）`
      : `呪われた爆発の魔方陣が${m.name}のハイパーサーミックブレスを打ち消した！`);
    return true;
  }

  const line = getMireuBreathOriginAndDir(m, dg, pl);
  let fdx = line ? line.dx : Math.sign(pl.x - m.x);
  let fdy = line ? line.dy : Math.sign(pl.y - m.y);
  if (fdx === 0 && fdy === 0) fdy = 1;
  const origin = line ? line.origin : { x: m.x, y: m.y };

  ml.push(`${m.name}は青白く燃え盛る超高温の炎を凝縮させた！`);

  // ブレス発射点（起点セル）
  let cx = origin.x;
  let cy = origin.y;
  const breathPath = [{ x: cx, y: cy }];
  let windMsg = false;

  const emitBreathAnim = () => {
    if (breathPath.length <= 1) return;
    const end = breathPath[breathPath.length - 1];
    pushAnim({
      type: "monProjectile",
      fromX: origin.x,
      fromY: origin.y,
      toX: end.x,
      toY: end.y,
      color: "#00d8ff",
      path: breathPath
    });
  };

  const applyFireToPlayer = () => {
    // 防御力無視の固定70ダメージ（耐性でのみ軽減）
    const baseDmg = 70;
    const hasProt = hasFireResist(pl);
    let dmg = reduceFireDamage(baseDmg, pl);

    // 油まみれ判定（炎2倍）
    const oilyMult = (pl.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === pl.x && t.y === pl.y) ? 2 : 1;
    if (oilyMult > 1) dmg *= 2;

    pl.deathCause = `${m.name}のハイパーサーミックブレスで`;
    pl.hp -= dmg;
    opts.onPlayerHit?.(dmg, m);

    ml.push(`${m.name}のハイパーサーミックブレスが直撃！${playerHpEffectLabel(pl, dmg)}！${fireResistDamageLabel(pl)}${oilyMult > 1 ? "(油まみれ×2)" : ""}`);

    // 睡眠・金縛り解除
    if ((pl.sleepTurns || 0) > 0) { pl.sleepTurns = 0; ml.push("超高熱で目が覚めた！"); }
    resolveParalysisHit(pl, ml);

    // 炎耐性なしの場合は所持品ロースト
    if (!hasProt) {
      applyLightningToInventory(pl, dg, ml, null, null, true, { killerMon: m, sourceIsPlayer: false });
    }
  };

  const applyFireToMon = (victim) => {
    const baseDmg = 70;
    const oilyMult = (victim.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === victim.x && t.y === victim.y) ? 2 : 1;
    const finalDmg = baseDmg * oilyMult;
    victim.hp -= finalDmg;
    ml.push(`${m.name}のハイパーサーミックブレスが${victim.name}に直撃！${finalDmg}ダメージ！${oilyMult > 1 ? "(油まみれ×2)" : ""}`);
    if (victim.hp <= 0) {
      killMonster(victim, dg, pl, ml, opts.luFn || null, false, m);
    }
  };

  // 軌道を進める（風穴で曲がる）
  for (let i = 1; i < MW + MH; i++) {
    const st = stepProjectile(dg, cx, cy, fdx, fdy, { wind: true });
    if (st.bent && !windMsg) {
      ml.push("風穴の風がハイパーサーミックブレスを曲げた！");
      windMsg = true;
    }
    fdx = st.dx;
    fdy = st.dy;
    const fx = st.x;
    const fy = st.y;
    cx = fx;
    cy = fy;

    if (fx < 0 || fx >= MW || fy < 0 || fy >= MH) {
      emitBreathAnim();
      return true;
    }
    if (dg.map[fy]?.[fx] === T.WALL || dg.map[fy]?.[fx] === T.BWALL) {
      emitBreathAnim();
      return true;
    }

    breathPath.push({ x: fx, y: fy });

    // プレイヤー命中判定
    if (fx === pl.x && fy === pl.y) {
      emitBreathAnim();
      applyFireToPlayer();
      return true;
    }

    // 他モンスター命中判定
    const hitMon = dg.monsters?.find(other => other !== m && other.hp > 0 && monsterOccupiesCell(other, fx, fy));
    if (hitMon) {
      emitBreathAnim();
      applyFireToMon(hitMon);
      return true;
    }
  }

  emitBreathAnim();
  return true;
}

/**
 * 特技2: スパイクフレイル
 * 隣接時25%で発動。隣接マス（周囲外周マス）無差別に3倍ダメージ＋テレポート効果
 */
export function mireuSpikeFlail(m, dg, pl, ml, opts = {}, onPlayerHit = null, onPlayerMiss = null, luFn = null) {
  const onHit = onPlayerHit || opts.onPlayerHit;
  const onMiss = onPlayerMiss || opts.onPlayerMiss;
  const lu = luFn || opts.luFn || null;

  ml.push(`${m.name}の尻尾が棘だらけの鉄球と化して唸る！スパイクフレイル！`);
  pushSplashAnim(m.x, m.y, "#0088dd");

  const inStorm = (x, y) => monsterPointDistance(m, x, y) === 1;

  // 1. プレイヤーへの判定
  const plInFlail = inStorm(pl.x, pl.y);
  const plOnSanc = !inMagicSealRoom(pl.x, pl.y, dg) &&
    !!dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y);

  if (plInFlail && pl.hp > 0) {
    if (plOnSanc) {
      ml.push(`聖域の加護が${m.name}のスパイクフレイルを防いだ！`);
    } else if (checkPlayerPhysicalAttackEvasion(m, pl, ml, { attackName: "スパイクフレイル", onMiss })) {
      // 回避成功：ダメージおよびテレポートなし
    } else {
      // 3倍ダメージ
      const baseDmg = calcAtkDefDmg(m.atk * 3, calcPlayerDefense(pl), { defWeight: 1.5 });
      const dmg = Math.max(1, baseDmg + rng(-3, 3));
      pl.deathCause = `${m.name}のスパイクフレイルで`;
      pl.hp -= dmg;
      onHit?.(dmg, m);
      resolveParalysisHit(pl, ml);
      ml.push(`強烈な鉄球の一撃が${plName(pl)}を粉砕！${dmg}ダメージ！`);

      // テレポート効果（ランダムテレポート）
      if (pl.hp > 0) {
        const tpDst = randomTeleportDest(dg, pl.x, pl.y, (x, y) => !dg.monsters?.some(other => monsterOccupiesCell(other, x, y)));
        if (tpDst) {
          pl.x = tpDst.x;
          pl.y = tpDst.y;
          ml.push(`衝撃で空間が歪み、${plName(pl)}はどこかへ吹き飛んだ！`);
        }
      }
    }
  }

  // 2. 他モンスターへの判定
  for (const victim of [...(dg.monsters || [])]) {
    if (victim === m || victim.hp <= 0 || victim.disguisedAsItem) continue;
    if (!monsterBodyCells(victim).some(cell => inStorm(cell.x, cell.y))) continue;
    if (consumeBarrier(victim, ml)) continue;

    if (checkMonsterEvasion(victim, { baseMissRate: 0.05 })) {
      ml.push(victim.baseKind === "boss_mireu" ? `${victim.name}は攻撃をかわした！` : `${victim.name}への攻撃は外れた！`);
      continue;
    }

    const vDmg = Math.max(1, calcAtkDefDmg(m.atk * 3, victim.def || 0, { defWeight: 1 }) + rng(-2, 2));
    victim.hp -= vDmg;
    ml.push(`スパイクフレイルが${victim.name}を強打！${vDmg}ダメージ！`);

    if (victim.hp > 0) {
      const tpDst = randomTeleportDest(dg, victim.x, victim.y, (x, y) => canPlaceMonsterBody(dg, victim, x, y, pl));
      if (tpDst) {
        victim.x = tpDst.x;
        victim.y = tpDst.y;
        ml.push(`${victim.name}は吹き飛ばされてテレポートした！`);
      }
    } else {
      killMonster(victim, dg, pl, ml, lu, false, m);
    }
  }
}

/**
 * 特技3: アブソルートテラー
 * プレイヤーが視界内にいる時10%で発動。鈍足＋移動封じを付与
 */
export function mireuAbsoluteTerror(m, dg, pl, ml, opts = {}) {
  ml.push(`${m.name}が深淵の咆哮を轟かせた！アブソルートテラー！`);
  pushSplashAnim(pl.x, pl.y, "#0055ff");

  // 聖域チェック
  const plOnSanc = !inMagicSealRoom(pl.x, pl.y, dg) &&
    !!dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y);
  if (plOnSanc) {
    ml.push(`聖域の加護が${m.name}のアブソルートテラーを遮った！`);
    return;
  }

  // 1. 鈍足付与（耐鈍足で防御可能）
  let appliedStatus = false;
  if (!blockPlayerStatus(pl, ml, { proofAbility: "slow_proof", proofMsg: "しかし防具が鈍足を防いだ！(耐鈍足)" })) {
    const slowT = statusTurns("slow", { kind: "player" });
    pl.slowTurns = (pl.slowTurns || 0) + slowT;
    appliedStatus = true;
    ml.push(`${plName(pl)}は圧倒的な恐怖に足がすくみ、鈍足になった！(${slowT}ターン)`);
  }

  // 2. 移動封じ付与（耐影縫い または 体幹の指輪で防御可能）
  if (hasRingEffect(pl, "trunk_ring")) {
    ml.push(`体幹の指輪の力で恐怖の重圧に耐え切った！(移動封じ無効)`);
  } else if (!blockPlayerStatus(pl, ml, { proofAbility: "shadow_stitch_proof", proofMsg: "しかし防具が影縫いを防いだ！(耐影縫い)" })) {
    const immT = statusTurns("immobile", { kind: "player" });
    pl.immobileTurns = (pl.immobileTurns || 0) + immT;
    appliedStatus = true;
    ml.push(`${plName(pl)}は恐怖の重圧でその場から動けなくなった！(${immT}ターン)`);
  }
  if (appliedStatus) resolveParalysisHit(pl, ml);
}
