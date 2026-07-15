import extraSlotsJson from "./portrait-extra-slots.json";
import { buildPortraitSets, mergePortraitCategories } from "./portraitCatalog.js";

const MERGED_PORTRAIT_CATEGORIES = mergePortraitCategories(extraSlotsJson.slots || []);

export const PORTRAIT_COOLDOWN_MS = 4000;
export const PORTRAIT_FALLBACK = "stand_normal";

export const CHAR_PATH = (name) => `/tiles/Character/${name}.png`;

export const PORTRAIT_SETS = buildPortraitSets(MERGED_PORTRAIT_CATEGORIES);

export function pickPortrait(key, sets = PORTRAIT_SETS) {
  const list = sets[key];
  if (!list?.length) return CHAR_PATH(PORTRAIT_FALLBACK);
  return CHAR_PATH(list[Math.floor(Math.random() * list.length)]);
}

export function hpKey(p) {
  const r = p.hp / p.maxHp;
  if (r <= 0.25) return "hp_low";
  if (r <= 0.6) return "hp_mid";
  return "hp_full";
}

/** プレイヤーの近接攻撃メッセージか（モンスターの「の攻撃！」は除外）
 *  武器未装備なら attack_unarmed、装備中なら attack
 *  player 省略時は attack（ダメージ判定用）
 */
export function msgToMeleeAttackKey(msg, player = null) {
  if (!msg) return null;
  const isMelee =
    /への攻撃は外れた/.test(msg) ||
    /ガーディアンに\d+ダメージ/.test(msg) ||
    (/に\d+ダメージ！/.test(msg) && !/の攻撃！/.test(msg));
  if (!isMelee) return null;
  if (player && !player.weapon) return "attack_unarmed";
  return "attack";
}

/** メッセージからアイテム使用の種別を判定（直近ログも参照） */
export function msgToActionKey(msg, recentMsgs = []) {
  const texts = [...recentMsgs];
  if (msg && texts[texts.length - 1] !== msg) texts.push(msg);

  for (let i = texts.length - 1; i >= 0; i--) {
    const m = texts[i];
    if (!m) continue;
    if (/ヤバすぎる！/.test(m)) return "act_food_yabai";
    if (/腐っていた！/.test(m)) return "act_food_rotten";
  }

  if (!msg) return null;
  if (/薬を飲|ポーション|飲んだ/.test(msg)) return "act_potion";
  if (/食べ|食料|料理/.test(msg)) return "act_food";
  if (/魔法書.*(?:を)?(?:読|使)|(?:読|使).*(?:魔法書)/.test(msg)) return "act_spellbook";
  if (/巻物.*(?:を)?(?:読|使)|(?:読|使).*(?:巻物)/.test(msg)) return "act_scroll";
  if (/杖を振|ワンド/.test(msg)) return "act_wand";
  /* プレイヤー自身が描いたときだけ（敵「〜が足元に〜を描いた」は除外） */
  if (/^足元に.+を描いた|魔方陣を描いた瞬間|ペンで/.test(msg)) return "act_pen";
  if (/魔法を放/.test(msg)) return "act_magic";
  if (/矢を射|弓/.test(msg)) return "act_bow";
  if (/投げた|投擲/.test(msg)) return "act_throw";
  if (/(?:壺.*(?:を)?(?:使|割|投|入|取り出)|(?:使|割|投|入|取り出).*(?:壺))/.test(msg)) return "act_pot";
  if (/宝箱/.test(msg)) return "act_chest";
  return null;
}

/** モンスターがダメージを受けたログか（プレイヤー被ダメと区別） */
export function isMonsterDamageMsg(msg) {
  if (!msg) return false;
  if (msgToMeleeAttackKey(msg)) return true;
  if (/毒に侵された.+は\d+ダメージ！/.test(msg)) return true;
  if (/闘気が.+に\d+ダメージ！/.test(msg)) return true;
  if (/爆風で.+に\d+ダメージ！/.test(msg)) return true;
  if (/爆発で.+は\d+ダメージ！/.test(msg)) return true;
  if (/.+は(変な薬を浴びた|炎に包まれた|毒を浴びた|壁に叩きつけられた)！/.test(msg)) return true;
  if (/.+の(炎|氷)ブレスが.+に命中！/.test(msg)) return true;
  /* 回復魔方陣がアンデッドを傷つける等 */
  if (/を傷つけた！\d+ダメージ/.test(msg)) return true;
  if (/が.+に当たった！\d+ダメージ/.test(msg) && !/プレイヤーに|自分に/.test(msg)) return true;
  if (/プレイヤーに(命中|激突|当た)/.test(msg)) return false;
  if (/が.+に命中！\d+ダメージ！/.test(msg)) return true;
  if (/に命中！\d+ダメージ！/.test(msg) && !/プレイヤーに/.test(msg)) return true;
  if (/に\d+ダメージ！/.test(msg) && !/の攻撃！/.test(msg) && !/お互いに/.test(msg)) return true;
  return false;
}

/** プレイヤーがダメージを受けたログか */
export function isPlayerDamageMsg(msg) {
  if (!msg || isMonsterDamageMsg(msg)) return false;
  /* タトゥーバード等の痛恨は被ダメ確定の後続ログ */
  if (/痛恨の一撃/.test(msg)) return true;
  if (/プレイヤーに(命中|激突|当た)/.test(msg)) return true;
  if (/自分に(激突|命中|直撃|当た)/.test(msg)) return true;
  if (/自分にも.*\d+ダメージ/.test(msg)) return true;
  if (/の攻撃！\d+ダメージ！/.test(msg)) return true;
  if (/が(炎|氷)ブレスを吐いた！\d+ダメージ！/.test(msg)) return true;
  if (/炎に包まれた！\d+ダメージ！/.test(msg)) return true;
  if (/変な薬を浴びた！\d+ダメージ！/.test(msg)) return true;
  if (/腐っていた！\d+ダメージ/.test(msg)) return true;
  if (/ヤバすぎる！\d+ダメージ/.test(msg)) return true;
  if (/壁に(激突|叩きつけられた)！\d+ダメージ！/.test(msg)) return true;
  if (/モンスターに激突した！\d+ダメージ！/.test(msg)) return true;
  if (/お互いに\d+ダメージ！/.test(msg)) return true;
  if (/に激突！お互いに\d+ダメージ！/.test(msg)) return true;
  if (/油まみれに炎が燃え移った！/.test(msg)) return true;
  if (/油が引火して追加炎ダメージ！/.test(msg)) return true;
  if (/が跳ね返ってきた！\d+ダメージ！/.test(msg)) return true;
  if (/の爆発を受けた！\d+ダメージ！/.test(msg)) return true;
  if (/大爆発！(\d+ダメージ！|HPが1になった！)/.test(msg)) return true;
  if (/爆発が自分を直撃！/.test(msg)) return true;
  if (/呪いのエネルギーが爆発した！\d+ダメージ！/.test(msg)) return true;
  if (/^(矢の罠の矢|毒矢)が命中！\d+ダメージ！/.test(msg)) return true;
  if (/骨が自分に激突！/.test(msg)) return true;
  /* 汎用パターン：第三者へのダメージ文（傷つけた・当たった等）は除外 */
  if (/^[^(]+！[1-9]\d*ダメージ！/.test(msg) && !/に/.test(msg.split("！")[0])) {
    if (/を傷つけ|を倒した|に当たった|に命中|回復力が/.test(msg)) return false;
    return true;
  }
  if (/が命中！\d+ダメージ！/.test(msg) && !/に命中！/.test(msg)) return true;
  if (/が墨を吐いた！\d+ダメージ！/.test(msg)) return true;
  return false;
}

/** 今回のログからプレイヤー被ダメメッセージを探す（新規ログ優先） */
export function findPlayerDamageMsg(newMsgs = [], lastMsg = "") {
  /* 痛恨は強打立ち絵のため、同バッチ内なら優先して返す */
  for (let i = newMsgs.length - 1; i >= 0; i--) {
    if (newMsgs[i] && /痛恨の一撃/.test(newMsgs[i])) return newMsgs[i];
  }
  if (lastMsg && /痛恨の一撃/.test(lastMsg)) return lastMsg;
  for (let i = newMsgs.length - 1; i >= 0; i--) {
    if (newMsgs[i] && isPlayerDamageMsg(newMsgs[i])) return newMsgs[i];
  }
  if (lastMsg && isPlayerDamageMsg(lastMsg)) return lastMsg;
  return null;
}

/** 被ダメージメッセージから立ち絵グループを判定 */
export function msgToDamageKey(msg) {
  if (!msg) return "damage";
  if (/氷|凍|氷ブレス|氷の魔法/.test(msg)) return "damage_ice";
  if (/炎|火|炎ブレス|炎の魔法|引火|燃え移|油まみれに炎/.test(msg)) return "damage_fire";
  if (/毒矢|毒を浴び|毒.*ダメージ/.test(msg)) return "damage_poison";
  if (/矢|弓|跳ね返された.*矢|射撃の指輪/.test(msg)) return "damage_arrow";
  if (/石|魔法の石|岩が命中|岩が降/.test(msg)) return "damage_rock";
  if (/銃撃|銃弾/.test(msg)) return "damage_gun";
  if (/水鉄砲/.test(msg)) return "damage_watergun";
  if (/水の|水没|溺/.test(msg)) return "damage_wet";
  if (/罠|トラップ/.test(msg)) return "damage_trap";
  if (/爆発|炸裂|爆弾|時限|地雷|自爆/.test(msg)) return "damage_explosion";
  if (/吹き飛|激突|壁に叩|壁に激突|ノッカー|挟まれ/.test(msg)) return "damage_knockback";
  /* 「風穴」を落下と誤認しないよう bare「穴」は使わない */
  if (/落下|奈落|底に落|落とし穴|穴に落ち/.test(msg)) return "damage_falling";
  if (/雷の魔法|雷が.*ダメージ|呪われた雷|電撃|サンダー.*ダメージ/.test(msg)) return "damage_lightning";
  /* 風で曲がった投擲の自分ヒットなど物理ヒット */
  if (/風に煽られ|自分に当た|飛び道具が自分/.test(msg)) return "damage_heavy";
  if (/痛恨|強打|の攻撃！|攻撃で|武器の反動|打たれた/.test(msg)) return "damage_heavy";
  return "damage";
}

export function pickDamagePortrait(msg, sets = PORTRAIT_SETS) {
  const key = msgToDamageKey(msg);
  /* 汎用は hp_hurt のみ。属性プールに落下などが混ざらないようにする */
  if (key !== "damage" && sets[key]?.length) return pickPortrait(key, sets);
  if (sets.damage?.length) return pickPortrait("damage", sets);
  return CHAR_PATH("hp_hurt");
}

/** 満腹度0（飢餓状態）か */
export function isStarving(p) {
  return (p?.hunger ?? 1) === 0;
}

/** 空腹・飢餓に関するログか */
export function isHungerMsg(msg) {
  if (!msg) return false;
  return /空腹でHPが減|急に空腹を感じた|満腹度が\d+%下がった/.test(msg);
}

/** 今回のログから空腹メッセージを探す */
export function findHungerMsg(newMsgs = [], lastMsg = "") {
  for (let i = newMsgs.length - 1; i >= 0; i--) {
    if (newMsgs[i] && isHungerMsg(newMsgs[i])) return newMsgs[i];
  }
  if (lastMsg && isHungerMsg(lastMsg)) return lastMsg;
  return null;
}

function findMsgInNew(newMsgs, lastMsg, test) {
  for (let i = newMsgs.length - 1; i >= 0; i--) {
    if (newMsgs[i] && test(newMsgs[i])) return newMsgs[i];
  }
  if (lastMsg && test(lastMsg)) return lastMsg;
  return null;
}

/** 呪い装備・呪いデバフ付与のログか */
export function isCursedAcquireMsg(msg) {
  if (!msg) return false;
  return /呪われている！外せなくなった|呪いの力が自分に|呪われていて外せない/.test(msg);
}

/** 階段・フロア移動のログか */
export function isStairsMsg(msg) {
  if (!msg) return false;
  return /地下\d+階に(降りた|昇った)|地下\d+階に落ちた/.test(msg);
}

/** 店・買い物のログか */
export function isShopMsg(msg) {
  if (!msg) return false;
  return /代金を支払った|の代金が請求された|を取った！\(\d+G\)|店主が入り口をふさいだ/.test(msg);
}

/** 装備変更の種別（武器・防具・指輪） */
export function detectEquipChange(p, prev) {
  if (!prev) return null;
  const weaponId = p.weapon?.id ?? null;
  if (weaponId && weaponId !== (prev.weaponId ?? null)) return "act_equip_weapon";
  const armorId = p.armor?.id ?? null;
  if (armorId && armorId !== (prev.armorId ?? null)) return "act_equip_armor";
  const prevRingIds = new Set(prev.ringIds || []);
  for (const r of p.rings || []) {
    if (r?.id && !prevRingIds.has(r.id)) return "act_equip_ring";
  }
  return null;
}

/** 食事で満腹度が大きく回復したか */
export function isSatiatedGain(p, prev) {
  const maxH = p.maxHunger || 100;
  const prevH = prev.hunger ?? 0;
  const gain = (p.hunger ?? 0) - prevH;
  return gain >= Math.max(15, Math.floor(maxH * 0.2)) || (p.hunger ?? 0) >= Math.floor(maxH * 0.9);
}

/** 「回復した」は自然回復では出さず、大きなHP回復だけで表示する。 */
export function isMajorHeal(p, prev) {
  const gain = (p.hp ?? 0) - (prev.hp ?? 0);
  return gain >= Math.max(20, Math.ceil((p.maxHp || 100) * 0.2));
}

export function snapshotPlayer(p, opts = {}) {
  return {
    hp: p.hp,
    maxHp: p.maxHp,
    hunger: p.hunger,
    maxHunger: p.maxHunger,
    x: p.x,
    y: p.y,
    level: p.level,
    weaponId: p.weapon?.id ?? null,
    armorId: p.armor?.id ?? null,
    ringIds: (p.rings || []).map((r) => r.id),
    poisoned: !!p.poisoned,
    sleepTurns: p.sleepTurns || 0,
    confusedTurns: p.confusedTurns || 0,
    darknessTurns: p.darknessTurns || 0,
    oilyTurns: p.oilyTurns || 0,
    soakedTurns: p.soakedTurns || 0,
    paralyzeTurns: p.paralyzeTurns || 0,
    potConfinedTurns: p.potConfinedTurns || 0,
    capturedBy: p.capturedBy || null,
    slowTurns: p.slowTurns || 0,
    bewitchedTurns: p.bewitchedTurns || 0,
    immobileTurns: p.immobileTurns || 0,
    mpCooldownTurns: p.mpCooldownTurns || 0,
    sealedTurns: p.sealedTurns || 0,
    floating: !!opts.floating,
  };
}

function portraitEvent(key, now, { force = false, rateLimited = false } = {}) {
  return {
    src: pickPortrait(key),
    cooldownUntil: rateLimited ? now + PORTRAIT_COOLDOWN_MS : now,
    force,
    bypassCooldown: !rateLimited,
  };
}

/** 溺死によるゲームオーバーか */
export function isDrownDeath(deathCause) {
  if (!deathCause) return false;
  return /水没|溺/.test(deathCause);
}

/** 死因に応じたゲームオーバー立ち絵 */
export function pickDeathPortrait(deathCause, sets = PORTRAIT_SETS) {
  if (isDrownDeath(deathCause)) {
    if (sets.death_drown?.length) return pickPortrait("death_drown", sets);
    return CHAR_PATH("gameover_drown");
  }
  return CHAR_PATH("gameover_dead");
}

/**
 * gs 変化時の立ち絵イベントを解決。
 * @param {{ dashed?: boolean }} opts dashed: 今回の移動がダッシュ由来
 * @returns {{ src: string, cooldownUntil: number, force?: boolean } | null}
 */
export function resolvePortraitEvent({ player: p, prev, lastMsg, recentMsgs = [], newMsgs = [], floating = false, dashed = false, now = Date.now() }) {
  if (!p) return null;

  if (p.hp <= 0) {
    return { src: pickDeathPortrait(p.deathCause), cooldownUntil: now + 99999, force: true };
  }
  if (!prev) {
    return { src: pickPortrait(hpKey(p)), cooldownUntil: now, force: true };
  }

  const isLow = p.hp / p.maxHp <= 0.25;
  const actionKey = msgToActionKey(lastMsg, recentMsgs);
  const badFoodKey =
    actionKey === "act_food_yabai" || actionKey === "act_food_rotten" ? actionKey : null;

  if (p.hp < prev.hp) {
    if (badFoodKey) {
      return {
        src: pickPortrait(badFoodKey),
        cooldownUntil: now + PORTRAIT_COOLDOWN_MS,
        force: true,
      };
    }
    const damageMsg = findPlayerDamageMsg(newMsgs, lastMsg);
    if (damageMsg) {
      return {
        src: pickDamagePortrait(damageMsg),
        cooldownUntil: now + PORTRAIT_COOLDOWN_MS,
        force: true,
      };
    }
    if (isStarving(p) && (isStarving(prev) || findHungerMsg(newMsgs, lastMsg))) {
      return {
        src: pickPortrait("hp_hunger"),
        cooldownUntil: now + PORTRAIT_COOLDOWN_MS,
        force: true,
      };
    }
  }

  /* からめ鬼など拘束中：攻撃・アイテム使用・歩行より拘束立ち絵を常に優先
   * （死亡・被ダメだけは上で処理済み） */
  if (p.capturedBy) {
    return portraitEvent("status_bound", now, { force: true });
  }

  if (isMajorHeal(p, prev)) {
    return portraitEvent("hp_healed", now, { rateLimited: true });
  }

  if (
    (p.hunger ?? 0) > (prev.hunger ?? 0) &&
    findMsgInNew(newMsgs, lastMsg, (m) => /を食べた[。（]/.test(m)) &&
    isSatiatedGain(p, prev)
  ) {
    return portraitEvent("hp_satiated", now);
  }

  if (p.level > prev.level) {
    return portraitEvent("levelup", now);
  }

  if (findMsgInNew(newMsgs, lastMsg, isStairsMsg)) {
    return portraitEvent("reaction_stairs", now, { force: true });
  }
  if (findMsgInNew(newMsgs, lastMsg, isShopMsg)) {
    return portraitEvent("reaction_shop", now, { force: true });
  }

  const equipKey = detectEquipChange(p, prev);
  if (equipKey) {
    return portraitEvent(equipKey, now);
  }

  if (findMsgInNew(newMsgs, lastMsg, isCursedAcquireMsg)) {
    return portraitEvent("status_cursed", now, { force: true });
  }

  if (p.paralyzeTurns > 0 && prev.paralyzeTurns <= 0) {
    return portraitEvent("status_paralyze", now);
  }
  /* とじこめの壺：閉じ込め */
  if ((p.potConfinedTurns || 0) > 0 && (prev.potConfinedTurns || 0) <= 0) {
    return portraitEvent("status_confined", now, { force: true });
  }
  if (p.immobileTurns > 0 && prev.immobileTurns <= 0) {
    return portraitEvent("status_immobile", now);
  }
  if (p.slowTurns > 0 && prev.slowTurns <= 0) {
    return portraitEvent("status_slow", now);
  }
  if (
    (p.mpCooldownTurns > 0 && prev.mpCooldownTurns <= 0) ||
    (p.sealedTurns > 0 && prev.sealedTurns <= 0)
  ) {
    return portraitEvent("status_sealed", now);
  }
  if (p.bewitchedTurns > 0 && prev.bewitchedTurns <= 0) {
    return portraitEvent("status_bewitched", now);
  }
  if (floating && !prev.floating) {
    return portraitEvent("status_floating", now);
  }

  if (p.poisoned && !prev.poisoned) {
    return portraitEvent("status_poison", now);
  }
  if (p.sleepTurns > 0 && prev.sleepTurns <= 0) {
    return portraitEvent("status_sleep", now);
  }
  if (p.confusedTurns > 0 && prev.confusedTurns <= 0) {
    return portraitEvent("status_confused", now);
  }
  if (p.darknessTurns > 0 && prev.darknessTurns <= 0) {
    return portraitEvent("status_blind", now);
  }
  if (p.oilyTurns > 0 && prev.oilyTurns <= 0) {
    return portraitEvent("status_oiled", now);
  }
  if (p.soakedTurns > 0 && prev.soakedTurns <= 0) {
    return portraitEvent("status_soaked", now);
  }

  const hungerMsg = findHungerMsg(newMsgs, lastMsg);
  if (hungerMsg) {
    return portraitEvent("hp_hunger", now, { force: true });
  }

  if (actionKey) {
    return portraitEvent(actionKey, now);
  }

  const meleeKey = msgToMeleeAttackKey(lastMsg, p);
  if (meleeKey) {
    return portraitEvent(meleeKey, now);
  }

  const moved = p.x !== prev.x || p.y !== prev.y;
  if (dashed && moved) {
    return portraitEvent("dash", now);
  }

  return { isLow, moved, now };
}
