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

/** メッセージからアイテム使用の種別を判定 */
export function msgToActionKey(msg) {
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

/** 被ダメージメッセージから立ち絵グループを判定 */
export function msgToDamageKey(msg) {
  if (!msg) return "damage";
  if (/氷|凍|氷ブレス|氷の魔法/.test(msg)) return "damage_ice";
  if (/炎|火|炎ブレス|炎の魔法|引火|燃え移|油まみれに炎/.test(msg)) return "damage_fire";
  if (/矢|弓|跳ね返された.*矢|射撃の指輪/.test(msg)) return "damage_arrow";
  if (/石|魔法の石/.test(msg)) return "damage_rock";
  if (/水鉄砲|水の/.test(msg)) return "damage_wet";
  if (/罠|トラップ|岩が降/.test(msg)) return "damage_trap";
  if (/爆発|炸裂|爆弾|時限/.test(msg)) return "damage_explosion";
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

export function snapshotPlayer(p) {
  return {
    hp: p.hp,
    maxHp: p.maxHp,
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
export function resolvePortraitEvent({ player: p, prev, lastMsg, now = Date.now() }) {
  if (!p) return null;

  if (p.hp <= 0) {
    return { src: CHAR_PATH("gameover_dead"), cooldownUntil: now + 99999, force: true };
  }
  if (!prev) {
    return { src: pickPortrait(hpKey(p)), cooldownUntil: now, force: true };
  }

  const isLow = p.hp / p.maxHp <= 0.25;

  if (p.hp < prev.hp) {
    return {
      src: pickDamagePortrait(lastMsg),
      cooldownUntil: now + PORTRAIT_COOLDOWN_MS,
      force: true,
    };
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

  const actionKey = msgToActionKey(lastMsg);
  if (actionKey) {
    return { src: pickPortrait(actionKey), cooldownUntil: now + PORTRAIT_COOLDOWN_MS };
  }

  return { isLow, moved: p.x !== prev.x || p.y !== prev.y, now };
}