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

/** プレイヤーの近接攻撃メッセージか（モンスターの「の攻撃！」は除外） */
export function msgToMeleeAttackKey(msg) {
  if (!msg) return null;
  if (/への攻撃は外れた/.test(msg)) return "attack";
  if (/ガーディアンに\d+ダメージ/.test(msg)) return "attack";
  if (/に\d+ダメージ！/.test(msg) && !/の攻撃！/.test(msg)) return "attack";
  return null;
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
  if (/魔法書/.test(msg)) return "act_spellbook";
  if (/巻物|読んだ/.test(msg)) return "act_scroll";
  if (/杖を振|ワンド/.test(msg)) return "act_wand";
  if (/魔方陣|ペンで/.test(msg)) return "act_pen";
  if (/魔法を放|魔法陣/.test(msg)) return "act_magic";
  if (/矢を射|弓/.test(msg)) return "act_bow";
  if (/投げた|投擲/.test(msg)) return "act_throw";
  if (/壺/.test(msg)) return "act_pot";
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
  if (/プレイヤーに(命中|激突|当た)/.test(msg)) return false;
  if (/が.+に命中！\d+ダメージ！/.test(msg)) return true;
  if (/に命中！\d+ダメージ！/.test(msg) && !/プレイヤーに/.test(msg)) return true;
  if (/に\d+ダメージ！/.test(msg) && !/の攻撃！/.test(msg) && !/お互いに/.test(msg)) return true;
  return false;
}

/** プレイヤーがダメージを受けたログか */
export function isPlayerDamageMsg(msg) {
  if (!msg || isMonsterDamageMsg(msg)) return false;
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
  if (/^[^(]+！[1-9]\d*ダメージ！/.test(msg) && !/に/.test(msg.split("！")[0])) return true;
  if (/が命中！\d+ダメージ！/.test(msg) && !/に命中！/.test(msg)) return true;
  if (/が墨を吐いた！\d+ダメージ！/.test(msg)) return true;
  return false;
}

/** 今回のログからプレイヤー被ダメメッセージを探す（新規ログ優先） */
export function findPlayerDamageMsg(newMsgs = [], lastMsg = "") {
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
  if (/矢|弓|跳ね返された.*矢|射撃の指輪/.test(msg)) return "damage_arrow";
  if (/石|魔法の石/.test(msg)) return "damage_rock";
  if (/銃撃|銃弾/.test(msg)) return "damage_gun";
  if (/水鉄砲/.test(msg)) return "damage_watergun";
  if (/水の|水没/.test(msg)) return "damage_wet";
  if (/罠|トラップ|岩が降/.test(msg)) return "damage_trap";
  if (/爆発|炸裂|爆弾|時限|地雷|自爆/.test(msg)) return "damage_explosion";
  if (/吹き飛|激突|壁に叩|壁に激突|ノッカー|挟まれ/.test(msg)) return "damage_knockback";
  if (/穴|落下|奈落|底に落|落とし穴/.test(msg)) return "damage_falling";
  if (/雷|電撃|サンダー|打たれた/.test(msg)) return "damage_heavy";
  if (/痛恨|強打|の攻撃！|攻撃で|武器の反動/.test(msg)) return "damage_heavy";
  return "damage";
}

export function pickDamagePortrait(msg, sets = PORTRAIT_SETS) {
  const key = msgToDamageKey(msg);
  if (sets[key]?.length) return pickPortrait(key, sets);
  return pickPortrait("damage", sets);
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

export function snapshotPlayer(p) {
  return {
    hp: p.hp,
    maxHp: p.maxHp,
    hunger: p.hunger,
    maxHunger: p.maxHunger,
    x: p.x,
    y: p.y,
    level: p.level,
    poisoned: !!p.poisoned,
    sleepTurns: p.sleepTurns || 0,
    confusedTurns: p.confusedTurns || 0,
    darknessTurns: p.darknessTurns || 0,
    oilyTurns: p.oilyTurns || 0,
    paralyzeTurns: p.paralyzeTurns || 0,
  };
}

/**
 * gs 変化時の立ち絵イベントを解決。
 * @returns {{ src: string, cooldownUntil: number, force?: boolean } | null}
 */
export function resolvePortraitEvent({ player: p, prev, lastMsg, recentMsgs = [], newMsgs = [], now = Date.now() }) {
  if (!p) return null;

  if (p.hp <= 0) {
    return { src: CHAR_PATH("gameover_dead"), cooldownUntil: now + 99999, force: true };
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

  if (p.hp > prev.hp) {
    return { src: pickPortrait("hp_healed"), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }

  if (p.level > prev.level) {
    return { src: pickPortrait("levelup"), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }

  if (p.poisoned && !prev.poisoned) {
    return { src: pickPortrait("status_poison"), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }
  if (p.sleepTurns > 0 && prev.sleepTurns <= 0) {
    return { src: pickPortrait("status_sleep"), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }
  if (p.confusedTurns > 0 && prev.confusedTurns <= 0) {
    return { src: pickPortrait("status_confused"), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }
  if (p.darknessTurns > 0 && prev.darknessTurns <= 0) {
    return { src: pickPortrait("status_blind"), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }
  if (p.oilyTurns > 0 && prev.oilyTurns <= 0) {
    return { src: pickPortrait("status_oiled"), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }

  const hungerMsg = findHungerMsg(newMsgs, lastMsg);
  if (hungerMsg) {
    return {
      src: pickPortrait("hp_hunger"),
      cooldownUntil: now + PORTRAIT_COOLDOWN_MS,
      force: true,
    };
  }

  if (actionKey) {
    return { src: pickPortrait(actionKey), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }

  const meleeKey = msgToMeleeAttackKey(lastMsg);
  if (meleeKey) {
    return { src: pickPortrait(meleeKey), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }

  return { isLow, moved: p.x !== prev.x || p.y !== prev.y, now };
}