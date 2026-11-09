import { consumeBarrier, clampDmgFixed } from "./utils.js";
import { wakeIfDormant, triggerMushroomCounterSpore } from "./monsterRuntime.js";
import { resolveParalysisHit } from "./statusDuration.js";
import { beginNpcRetaliation } from "./npcRetaliation.js";
import { markShopkeeperHostileToPlayer, killMonster } from "./items.js";

/**
 * モンスターへのダメージを一元的に適用する。
 * バリア消費、固定ダメージ制限、休眠解除、麻痺解除、キノコ反撃毒胞子、NPC報復・敵対、撃破判定を漏れなく実行する。
 *
 * @param {object} target - ダメージを受けるモンスター
 * @param {number} rawDamage - 軽減・倍率計算後の未クランプダメージ
 * @param {object} [options={}]
 * @param {boolean} [options.isPhysical=false] - 物理攻撃か（水晶スライムの固定1ダメージ適用）
 * @param {object|null} [options.attacker=null] - 攻撃者モンスター
 * @param {object|null} [options.dungeon=null] - ダンジョン
 * @param {object|null} [options.player=null] - プレイヤー
 * @param {Array|null} [options.messages=null] - ログメッセージ配列
 * @param {boolean} [options.sourceIsPlayer=false] - プレイヤーによる攻撃・被弾か
 * @param {boolean} [options.skipBarrier=false] - バリア判定をスキップするか
 * @param {boolean} [options.killIfDead=true] - HP<=0のときkillMonsterを呼ぶか
 * @param {boolean} [options.awardExpToPlayer=false] - 撃破経験値をプレイヤーに付与するか
 * @param {function|null} [options.luFn=null] - レベルアップコールバック
 * @returns {{ damage: number, blocked: boolean, killed: boolean }}
 */
export function applyDamageToMonster(target, rawDamage, {
  isPhysical = false,
  attacker = null,
  dungeon = null,
  player = null,
  messages = null,
  sourceIsPlayer = false,
  skipBarrier = false,
  killIfDead = true,
  awardExpToPlayer = false,
  luFn = null,
} = {}) {
  if (!target || target.hp <= 0) {
    return { damage: 0, blocked: false, killed: false };
  }

  // 1. 休眠解除（攻撃を受けた時点で目を覚ます）
  wakeIfDormant(target, messages);

  // 2. バリア消費判定
  if (!skipBarrier && consumeBarrier(target, messages)) {
    if (sourceIsPlayer) {
      if (dungeon && player) markShopkeeperHostileToPlayer(target, dungeon, player, messages);
    } else if (attacker && dungeon?.monsters?.includes(attacker)) {
      beginNpcRetaliation(target, attacker, messages);
    }
    return { damage: 0, blocked: true, killed: false };
  }

  // 3. 固定ダメージ制限（水晶スライム等）
  const damage = clampDmgFixed(target, Math.max(0, Math.floor(rawDamage)), isPhysical);

  // 4. HP減少
  target.hp -= damage;

  // 5. 麻痺解除・弱体化
  resolveParalysisHit(target, messages);

  // 6. キノコ反撃毒胞子
  if (dungeon && player) {
    triggerMushroomCounterSpore(target, dungeon, player, messages);
  }

  // 7. 店主・NPC報復 / 敵対化
  if (target.hp > 0) {
    if (sourceIsPlayer) {
      if (dungeon && player) markShopkeeperHostileToPlayer(target, dungeon, player, messages);
    } else if (attacker && dungeon?.monsters?.includes(attacker)) {
      beginNpcRetaliation(target, attacker, messages);
    }
  }

  // 8. 撃破判定
  let killed = false;
  if (target.hp <= 0 && killIfDead && dungeon?.monsters?.includes(target)) {
    killMonster(target, dungeon, player, messages, luFn || null, awardExpToPlayer, attacker);
    killed = true;
  }

  return { damage, blocked: false, killed };
}
