import { hasLOS } from './monsters.js';
import { inMagicSealRoom } from './items.js';
import { applyMonsterFlameMantle } from './statusDuration.js';
import { isStatusImmune } from './statusImmunity.js';
import { pushAnim, pushHealAnim } from './animEvents.js';
import { plName } from './playerLabel.js';

/**
 * タイサイジンが特技を使用可能か（封印・睡眠・金縛り・石化・凍結・混乱・盲目等の状態異常中でないか）
 */
export function canUseTaisaijinSpecial(monster) {
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
 * 遠距離直線上にいるか判定（距離2〜10マス、水平・垂直・斜め45度、射線LOSあり）
 */
export function isFarLineToPlayer(monster, dungeon, player) {
  const dx = player.x - monster.x;
  const dy = player.y - monster.y;
  const isLine = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (!isLine || dist < 2 || dist > 10) return false;
  return hasLOS(dungeon.map, monster.x, monster.y, player.x, player.y);
}

/**
 * 特技1: 催眠
 * 遠距離直線上にいる時、25%で催眠術をかける（次の行動を勝手に行ってしまう）
 */
export function taisaijinHypnosis(m, dg, pl, ml) {
  m.turnAttacks++;
  if (inMagicSealRoom(m.x, m.y, dg) || inMagicSealRoom(pl.x, pl.y, dg)) {
    ml.push(`${m.name}が催眠術をかけようとしたが、魔封じの魔方陣で封じられた！`);
    return;
  }
  const plOnBlessedSanc = !inMagicSealRoom(pl.x, pl.y, dg) &&
    !!dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
  if (plOnBlessedSanc) {
    ml.push(`祝福された聖域の加護が${m.name}の催眠術を防いだ！`);
    return;
  }
  if (!isStatusImmune(pl, ml, "自分")) {
    pl.hypnosisPending = (pl.hypnosisPending || 0) + 1;
    ml.push(`${m.name}の無数の目が怪しく光り、催眠術をかけた！次の行動を勝手に行ってしまう！`);
    pushAnim({ type: "flash", x: pl.x, y: pl.y, color: "#aa44ff", duration: 300 });
  }
}

/**
 * 特技2: ブレイズスパイク
 * プレイヤーが視界内にいる時、10%でブレイズスパイクを唱えて炎まとい状態（10ターン）になる
 */
export function taisaijinBlazeSpike(m, dg, ml) {
  m.turnAttacks++;
  if (inMagicSealRoom(m.x, m.y, dg)) {
    ml.push(`${m.name}はブレイズスパイクを唱えようとしたが、魔封じの魔方陣で封じられた！`);
    return;
  }
  ml.push(`${m.name}はブレイズスパイクを唱えた！`);
  applyMonsterFlameMantle(m, ml, 10);
  pushAnim({ type: "flash", x: m.x, y: m.y, color: "#ff6600", duration: 300 });
}

/**
 * 特技3: リフレシュ
 * プレイヤーが視界内にいる時、10%でリフレシュを唱えてHP持続回復状態になり20ターンの間毎ターン5回復する
 */
export function taisaijinRefresh(m, dg, ml) {
  m.turnAttacks++;
  if (inMagicSealRoom(m.x, m.y, dg)) {
    ml.push(`${m.name}はリフレシュを唱えようとしたが、魔封じの魔方陣で封じられた！`);
    return;
  }
  m.refreshTurns = 20;
  ml.push(`${m.name}はリフレシュを唱えた！HP持続回復状態になった！（20ターンの間、毎ターン5回復）`);
  pushHealAnim(m.x, m.y);
}
