import extraSlotsJson from "./portrait-extra-slots.json";
import { buildPortraitSets, mergePortraitCategories } from "./portraitCatalog.js";
import { getActivePlayerName, playerTargetAlt } from "./playerLabel.js";

const MERGED_PORTRAIT_CATEGORIES = mergePortraitCategories(extraSlotsJson.slots || []);

export const PORTRAIT_COOLDOWN_MS = 4000;
/** 腐敗・ヤバイ食事の専用リアクションを状態異常が上書きしない表示時間 */
export const PORTRAIT_BAD_FOOD_HOLD_MS = 3000;
/** 被ダメ立ち絵：他が無いときだけ。連続ヒットで切り替わりすぎないよう長め */
export const PORTRAIT_DAMAGE_COOLDOWN_MS = 10000;
/** 歩行立ち絵：無イベント時のみ */
export const PORTRAIT_WALK_COOLDOWN_MS = 8000;
/** 歩行立ち絵を出すまでの最低歩数 */
export const PORTRAIT_WALK_STEPS_MIN = 12;
export const PORTRAIT_WALK_STEPS_JITTER = 8;
export const PORTRAIT_FALLBACK = "stand_normal";

export const CHAR_PATH = (name) => `/tiles/Character/${name}.png`;

export const PORTRAIT_SETS = buildPortraitSets(MERGED_PORTRAIT_CATEGORIES);

export function pickPortrait(key, sets = PORTRAIT_SETS) {
  const list = sets[key];
  if (!list?.length) return CHAR_PATH(PORTRAIT_FALLBACK);
  return CHAR_PATH(list[Math.floor(Math.random() * list.length)]);
}

/* 防具なし欄が空のとき、img の読み込み失敗時に元の状況へ戻すための情報 */
function addPortraitFallback(src, fallback) {
  if (!src || !fallback || src === fallback) return src;
  const joiner = src.includes("?") ? "&" : "?";
  return `${src}${joiner}portraitFallback=${encodeURIComponent(fallback)}`;
}

/**
 * 防具なし時は下着姿の歩行・素手攻撃グループへ差し替える。
 * @param {string} key
 * @param {{ armor?: unknown } | null | undefined} player
 */
export function resolvePortraitSetKey(key, player = null) {
  if (!key || player?.armor) return key;
  if (key === "walk") return "walk_unarmored";
  if (key === "attack_unarmed") return "attack_unarmed_bare";
  if (key.endsWith("_unarmored") || key.endsWith("_bare")) return key;
  return `${key}_unarmored`;
}

/** プレイヤー装備を考慮して立ち絵パスを選ぶ */
export function pickPortraitForPlayer(key, player = null, sets = PORTRAIT_SETS) {
  const resolvedKey = resolvePortraitSetKey(key, player);
  if (resolvedKey === key || !sets[resolvedKey]?.length) return pickPortrait(key, sets);
  return addPortraitFallback(pickPortrait(resolvedKey, sets), pickPortrait(key, sets));
}

export function hpKey(p) {
  const hp = Math.max(0, Number(p?.hp) || 0);
  const maxHp = Math.max(1, Number(p?.maxHp) || 1);
  const r = hp / maxHp;
  if (r <= 0.15) return "hp_critical";
  if (r <= 0.3) return "hp_low_kneel";
  if (r <= 0.5) return "hp_low_stand";
  if (r <= 0.75) return "hp_mid";
  if (r < 1) return "hp_high";
  return "hp_full";
}

/** 軽装備立ち絵を出す防具名（みかわしの服・腹持ちの胴） */
export const LIGHT_ARMOR_STAND_NAMES = new Set(["みかわしの服", "腹持ちの胴"]);

export function isLightArmorStand(armor) {
  if (!armor) return false;
  return LIGHT_ARMOR_STAND_NAMES.has(armor.name);
}

/**
 * 待機時の立ち絵グループ。
 * HP満タン寄りのみ装備で分岐：未装備→下着、みかわし/腹持ち→軽装、その他→通常装備群。
 */
export function idleStandKey(p) {
  if (!p) return "hp_full";
  const band = hpKey(p);
  if (band !== "hp_full") return band;
  if (!p.armor) return "stand_unarmored";
  if (isLightArmorStand(p.armor)) return "stand_light_armor";
  return band;
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

/**
 * 今回のログバッチから近接攻撃キーを探す。
 * lastMsg だけだと「倒した」「敵の反撃」で埋もれて攻撃立ち絵が出ないため newMsgs を遡る。
 */
export function findMeleeAttackKey(newMsgs = [], lastMsg = "", player = null) {
  for (let i = newMsgs.length - 1; i >= 0; i--) {
    const k = msgToMeleeAttackKey(newMsgs[i], player);
    if (k) return k;
  }
  return msgToMeleeAttackKey(lastMsg, player);
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
  /* 泉は「飲んだ」より先に判定（薬立ち絵に吸われないように） */
  if (/泉の水を飲んだ|清らかな水を飲んだ/.test(msg)) return "act_spring_drink";
  if (/を泉に浸した|泉に浸した/.test(msg)) return "act_spring_soak";
  if (/薬を飲|ポーション|飲んだ/.test(msg)) return "act_potion";
  if (/食べ|食料|料理/.test(msg)) return "act_food";
  if (/魔法書.*(?:を)?(?:読|使)|(?:読|使).*(?:魔法書)/.test(msg)) return "act_spellbook";
  if (/巻物.*(?:を)?(?:読|使)|(?:読|使).*(?:巻物)/.test(msg)) return "act_scroll";
  /* 敵の「○○が杖を振った！」はプレイヤーの使用ログではない */
  if (
    /杖を振|ワンド/.test(msg) &&
    !/^[^！\n]*が[^！\n]*(?:杖を振|ワンド)/.test(msg)
  ) return "act_wand";
  /* プレイヤー自身が描いたときだけ（敵「〜が足元に〜を描いた」は除外） */
  if (/^足元に.+を描いた|魔方陣を描いた瞬間|ペンで/.test(msg)) return "act_pen";
  if (/魔法を放/.test(msg)) return "act_magic";
  if (/矢を射|弓/.test(msg)) return "act_bow";
  if (/投げた|投擲/.test(msg)) return "act_throw";
  /* プレイヤーが壺を操作したときだけ。
   * 「壺〜が爆発で割れた」など副次破壊は除外（自爆の巻物後に壺使用立ち絵になるのを防ぐ） */
  if (/が爆発で割れ|が割れて|が爆発で壊れ/.test(msg)) {
    /* fall through — not act_pot */
  } else if (
    /壺を(?:使|割|投|入|取り)/.test(msg) ||
    /を割った！/.test(msg) && /壺/.test(msg) ||
    /壺に.+を(?:入れ|投じ)/.test(msg) ||
    /を.+壺に(?:入れ|投じ)/.test(msg) ||
    /加熱の壺で/.test(msg)
  ) {
    return "act_pot";
  }
  if (/宝箱/.test(msg)) return "act_chest";
  return null;
}

/**
 * 今回追加されたログだけからアイテム操作立ち絵を探す。
 *
 * lastMsg だけを毎回参照すると、移動や拾得で gs が更新された際にも
 * 過去の「巻物を読んだ」などが再発火してしまう。newMsgs が空なら
 * 「今回はアイテム操作なし」とし、現在の操作に紐づくログだけを返す。
 */
export function findItemActionKey(newMsgs = []) {
  if (!Array.isArray(newMsgs) || newMsgs.length === 0) return null;
  for (let i = newMsgs.length - 1; i >= 0; i--) {
    const key = msgToActionKey(newMsgs[i], newMsgs);
    if (key) return key;
  }
  return null;
}

/** プレイヤー対象ヒット（「Xに命中」系）か */
function isPlayerTargetHitMsg(msg, playerName) {
  if (!msg) return false;
  const alt = playerTargetAlt(playerName ?? getActivePlayerName());
  return new RegExp(`(?:${alt})に(命中|激突|当た|ホーミング命中)`).test(msg);
}

/** モンスターがダメージを受けたログか（プレイヤー被ダメと区別） */
export function isMonsterDamageMsg(msg, playerName) {
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
  if (isPlayerTargetHitMsg(msg, playerName)) return false;
  const alt = playerTargetAlt(playerName ?? getActivePlayerName());
  if (/が.+に当たった！\d+ダメージ/.test(msg) && !new RegExp(`(?:${alt})に`).test(msg)) return true;
  if (/が.+に命中！\d+ダメージ！/.test(msg)) return true;
  if (/に命中！\d+ダメージ！/.test(msg) && !new RegExp(`(?:${alt})に命中`).test(msg)) return true;
  if (/に\d+ダメージ！/.test(msg) && !/の攻撃！/.test(msg) && !/お互いに/.test(msg)) return true;
  return false;
}

/** プレイヤーがダメージを受けたログか */
export function isPlayerDamageMsg(msg, playerName) {
  if (!msg || isMonsterDamageMsg(msg, playerName)) return false;
  /* タトゥーバード等の痛恨は被ダメ確定の後続ログ */
  if (/痛恨の一撃/.test(msg)) return true;
  if (isPlayerTargetHitMsg(msg, playerName)) return true;
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
  /* 杖・魔法弾の自分ヒット（「Xに命中」汎用が 自分に を除外するため個別） */
  if (/自分に命中！/.test(msg) && /ダメージ/.test(msg)) return true;
  if (/雷撃が命中！/.test(msg)) return true;
  if (/に打たれた！\d+ダメージ/.test(msg)) return true; /* 雷の魔方陣など */
  if (/体が燃えるように熱い！/.test(msg)) return true; /* 炎の薬 */
  if (/ゴッドスパーク炸裂！自分に/.test(msg)) return true;
  if (/呪われた雷が自分/.test(msg)) return true;
  if (/呪われた炎が爆発した！/.test(msg)) return true;
  if (/(炎|雷)の魔法が跳ね返ってきた！/.test(msg)) return true;
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
export function findPlayerDamageMsg(newMsgs = [], lastMsg = "", playerName) {
  /* 痛恨は強打立ち絵のため、同バッチ内なら優先して返す */
  for (let i = newMsgs.length - 1; i >= 0; i--) {
    if (newMsgs[i] && /痛恨の一撃/.test(newMsgs[i])) return newMsgs[i];
  }
  if (lastMsg && /痛恨の一撃/.test(lastMsg)) return lastMsg;
  for (let i = newMsgs.length - 1; i >= 0; i--) {
    if (newMsgs[i] && isPlayerDamageMsg(newMsgs[i], playerName)) return newMsgs[i];
  }
  if (lastMsg && isPlayerDamageMsg(lastMsg, playerName)) return lastMsg;
  return null;
}

/** 被ダメージメッセージから立ち絵グループを判定 */
export function msgToDamageKey(msg) {
  if (!msg) return "damage";
  if (/氷|凍|氷ブレス|氷の魔法|氷の弾/.test(msg)) return "damage_ice";
  if (/炎|火|炎ブレス|炎の魔法|炎の弾|引火|燃え移|油まみれに炎|燃えるように熱い/.test(msg)) return "damage_fire";
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
  /* 雷撃・魔方陣・巻物。打たれたは雷系メッセージ内だけ（近接の「打たれた」は下で heavy） */
  if (/雷撃|雷の魔法|雷の魔方陣|呪われた雷|電撃|サンダー|ゴッドスパーク|雷が自分/.test(msg)) {
    return "damage_lightning";
  }
  if (/に打たれた！/.test(msg) && /雷|魔方陣/.test(msg)) return "damage_lightning";
  /* 風で曲がった投擲の自分ヒットなど物理ヒット */
  if (/風に煽られ|自分に当た|飛び道具が自分/.test(msg)) return "damage_heavy";
  if (/痛恨|強打|の攻撃！|攻撃で|武器の反動|打たれた/.test(msg)) return "damage_heavy";
  return "damage";
}

/** 属性被ダメは杖・薬などの行動立ち絵より優先する */
export const PRIORITY_DAMAGE_KEYS = new Set([
  "damage_explosion",
  "damage_fire",
  "damage_lightning",
  "damage_ice",
  "damage_poison",
]);

export function pickDamagePortrait(msg, sets = PORTRAIT_SETS, player = null) {
  const key = msgToDamageKey(msg);
  /* 汎用は hp_hurt のみ。属性プールに落下などが混ざらないようにする */
  if (key !== "damage" && sets[key]?.length) return pickPortraitForPlayer(key, player, sets);
  if (sets.damage?.length) return pickPortraitForPlayer("damage", player, sets);
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
  return /呪われている！外せなくなった|呪いの力が自分に|呪われていて外せない|が呪われた！(?:【呪】)?/.test(msg);
}

/** 階段・フロア移動のログか */
export function isStairsMsg(msg) {
  if (!msg) return false;
  return /地下\d+階に(降りた|昇った)|地下\d+階に落ちた/.test(msg);
}

/** 転倒の罠など、転んだログか */
export function isFallMsg(msg) {
  if (!msg) return false;
  return /転倒の罠が発動|転んでしまった！/.test(msg);
}

/** 召喚の罠が発動したログか */
export function isSummonTrapMsg(msg) {
  if (!msg) return false;
  return /召喚の罠が発動/.test(msg);
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

/** HP0→残りMPで復活したログか（ピンチ復活。通常回復とは別立ち絵） */
export function isMpReviveMsg(msg) {
  if (!msg) return false;
  return /HPがゼロになった！.*残りMP\d+でHP\d+として復活/.test(msg)
    || /残りMP\d+でHP\d+として復活！MPは\d+ターン回復しない/.test(msg);
}

/** MP復活立ち絵（未設定時はピンチ系へフォールバック。回復立ち絵は使わない） */
export function pickMpRevivePortrait(sets = PORTRAIT_SETS, player = null) {
  if (sets.hp_mp_revive?.length) return pickPortraitForPlayer("hp_mp_revive", player, sets);
  if (sets.hp_low_stand?.length) return pickPortraitForPlayer("hp_low_stand", player, sets);
  return CHAR_PATH("hp_critical");
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
    frozenTurns: p.frozenTurns || 0,
    mpCooldownTurns: p.mpCooldownTurns || 0,
    sealedTurns: p.sealedTurns || 0,
    wallSuffocationDamage: !!p._wallSuffocationDamage,
    wallWalkTurns: p.wallWalkTurns || 0,
    floating: !!opts.floating,
  };
}

/**
 * 継続中の状態異常立ち絵キー（優先度順・最初にマッチしたもの）。
 * 歩行・被ダメより強く、治るまで維持する。
 */
export function getActiveStatusPortraitKey(p, floating = false) {
  if (!p) return null;
  if (p._wallSuffocationDamage && !(p.wallWalkTurns > 0)) return "status_wall_suffocation";
  if (p.capturedBy) return "status_bound";
  if ((p.potConfinedTurns || 0) > 0) return "status_confined";
  if ((p.paralyzeTurns || 0) > 0) return "status_paralyze";
  if ((p.sleepTurns || 0) > 0) return "status_sleep";
  if ((p.frozenTurns || 0) > 0) return "status_immobile"; /* 凍結は移動封じ寄り立ち絵を流用 */
  if ((p.immobileTurns || 0) > 0) return "status_immobile";
  if (p.poisoned) return "status_poison";
  if ((p.confusedTurns || 0) > 0) return "status_confused";
  if ((p.darknessTurns || 0) > 0) return "status_blind";
  if ((p.bewitchedTurns || 0) > 0) return "status_bewitched";
  if ((p.slowTurns || 0) > 0) return "status_slow";
  if ((p.mpCooldownTurns || 0) > 0 || (p.sealedTurns || 0) > 0) return "status_sealed";
  if ((p.oilyTurns || 0) > 0) return "status_oiled";
  if ((p.soakedTurns || 0) > 0) return "status_soaked";
  if (floating) return "status_floating";
  return null;
}

function portraitEvent(key, now, { force = false, rateLimited = false, player = null } = {}) {
  return {
    src: pickPortraitForPlayer(key, player),
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
export function pickDeathPortrait(deathCause, sets = PORTRAIT_SETS, player = null) {
  if (isDrownDeath(deathCause)) {
    if (sets.death_drown?.length) return pickPortraitForPlayer("death_drown", player, sets);
    return CHAR_PATH("gameover_drown");
  }
  if (sets.death_dead?.length) return pickPortraitForPlayer("death_dead", player, sets);
  return CHAR_PATH("gameover_dead");
}

/**
 * gs 変化時の立ち絵イベントを解決。
 *
 * 優先度（高い順）:
 *  1. 死亡
 *  2. 腐った/ヤバイ食事（例外的ワンショット）
 *  3. 状態異常の維持（治るまで歩行・被ダメで上書きしない）
 *  4. 復活・大回復・満腹・LvUp・階段・店・装備・呪い
 *  5. アイテム使用・近接攻撃
 *  6. 被ダメ・ダッシュ・歩行（低優先・クールダウン長め）
 *
 * @returns {{ src?: string, cooldownUntil?: number, force?: boolean, holdKey?: string, isLow?: boolean, moved?: boolean, lowPriority?: boolean } | null}
 */
export function resolvePortraitEvent({ player: p, prev, lastMsg, recentMsgs = [], newMsgs = null, floating = false, dashed = false, now = Date.now() }) {
  if (!p) return null;

  if (p.hp <= 0) {
    return { src: pickDeathPortrait(p.deathCause, PORTRAIT_SETS, p), cooldownUntil: now + 99999, force: true };
  }
  if (!prev) {
    return { src: pickPortraitForPlayer(idleStandKey(p), p), cooldownUntil: now, force: true };
  }

  const isLow = p.hp / p.maxHp <= 0.25;
  const hasNewMsgBatch = Array.isArray(newMsgs);
  newMsgs = hasNewMsgBatch ? newMsgs : [];
  /* usePortrait は newMsgs=[] を渡すため、過去のアイテム使用ログを再利用しない。
   * 旧呼び出し側が newMsgs を省略した場合だけ lastMsg にフォールバックする。 */
  const actionKey = hasNewMsgBatch
    ? findItemActionKey(newMsgs)
    : msgToActionKey(lastMsg, recentMsgs);
  const badFoodKey =
    actionKey === "act_food_yabai" || actionKey === "act_food_rotten" ? actionKey : null;
  const stickyKey = getActiveStatusPortraitKey(p, floating);
  const pe = (key, opts = {}) => portraitEvent(key, now, { ...opts, player: p });

  /* 召喚の罠は、敵の即時行動や被ダメが同じターンに続いても専用リアクションを優先 */
  if (findMsgInNew(newMsgs, lastMsg, isSummonTrapMsg)) {
    /* エディタ欄とイベントキーは先に用意し、画像投入までは驚き立ち絵を仮使用 */
    return pe("reaction_surprised", { force: true });
  }

  /* 腐った/ヤバイ食事は状態異常より先（食べた瞬間のリアクション） */
  if (p.hp < prev.hp && badFoodKey) {
    return {
      src: pickPortraitForPlayer(badFoodKey, p),
      cooldownUntil: now + PORTRAIT_COOLDOWN_MS,
      force: true,
      transientHoldMs: PORTRAIT_BAD_FOOD_HOLD_MS,
    };
  }

  /* 状態異常中：治るまでその立ち絵を維持（歩行・被ダメ・通常行動で上書きしない） */
  if (stickyKey) {
    return {
      src: pickPortraitForPlayer(stickyKey, p),
      cooldownUntil: now + PORTRAIT_COOLDOWN_MS,
      force: true,
      holdKey: stickyKey,
    };
  }

  /* MP消費でのHP0復活 */
  if (findMsgInNew(newMsgs, lastMsg, isMpReviveMsg)) {
    return {
      src: pickMpRevivePortrait(PORTRAIT_SETS, p),
      cooldownUntil: now + PORTRAIT_COOLDOWN_MS,
      force: true,
    };
  }

  if (isMajorHeal(p, prev)) {
    return pe("hp_healed", { rateLimited: true });
  }

  if (
    (p.hunger ?? 0) > (prev.hunger ?? 0) &&
    findMsgInNew(newMsgs, lastMsg, (m) => /を食べた[。（]/.test(m)) &&
    isSatiatedGain(p, prev)
  ) {
    return pe("hp_satiated");
  }

  if (p.level > prev.level) {
    return pe("levelup");
  }

  if (findMsgInNew(newMsgs, lastMsg, isStairsMsg)) {
    return pe("reaction_stairs", { force: true });
  }
  if (findMsgInNew(newMsgs, lastMsg, isFallMsg)) {
    return pe("reaction_fall", { force: true });
  }
  if (findMsgInNew(newMsgs, lastMsg, isShopMsg)) {
    return pe("reaction_shop", { force: true });
  }

  const equipKey = detectEquipChange(p, prev);
  if (equipKey) {
    return pe(equipKey);
  }
  /* 防具を外した直後は未装備（下着）待機へ */
  if ((prev.armorId ?? null) && !p.armor) {
    return pe("stand_unarmored");
  }

  if (findMsgInNew(newMsgs, lastMsg, isCursedAcquireMsg)) {
    return pe("status_cursed", { force: true });
  }

  /* 状態異常「付与瞬間」— sticky が無いフレーム用（付与と同時に sticky に乗るのでほぼ到達しない） */
  if (p.paralyzeTurns > 0 && prev.paralyzeTurns <= 0) {
    return pe("status_paralyze", { force: true });
  }
  if ((p.potConfinedTurns || 0) > 0 && (prev.potConfinedTurns || 0) <= 0) {
    return pe("status_confined", { force: true });
  }
  if (p.immobileTurns > 0 && prev.immobileTurns <= 0) {
    return pe("status_immobile", { force: true });
  }
  if ((p.frozenTurns || 0) > 0 && (prev.frozenTurns || 0) <= 0) {
    return pe("status_immobile", { force: true });
  }
  if (p.slowTurns > 0 && prev.slowTurns <= 0) {
    return pe("status_slow", { force: true });
  }
  if (
    (p.mpCooldownTurns > 0 && prev.mpCooldownTurns <= 0) ||
    (p.sealedTurns > 0 && prev.sealedTurns <= 0)
  ) {
    return pe("status_sealed", { force: true });
  }
  if (p.bewitchedTurns > 0 && prev.bewitchedTurns <= 0) {
    return pe("status_bewitched", { force: true });
  }
  if (floating && !prev.floating) {
    return pe("status_floating", { force: true });
  }
  if (p.poisoned && !prev.poisoned) {
    return pe("status_poison", { force: true });
  }
  if (p.sleepTurns > 0 && prev.sleepTurns <= 0) {
    return pe("status_sleep", { force: true });
  }
  if (p.confusedTurns > 0 && prev.confusedTurns <= 0) {
    return pe("status_confused", { force: true });
  }
  if (p.darknessTurns > 0 && prev.darknessTurns <= 0) {
    return pe("status_blind", { force: true });
  }
  if (p.oilyTurns > 0 && prev.oilyTurns <= 0) {
    return pe("status_oiled", { force: true });
  }
  if (p.soakedTurns > 0 && prev.soakedTurns <= 0) {
    return pe("status_soaked", { force: true });
  }

  const hungerMsg = findHungerMsg(newMsgs, lastMsg);
  if (hungerMsg) {
    return pe("hp_hunger", { force: true });
  }

  /* 属性被ダメ（爆発・炎・雷・氷・毒）は杖・薬・壺割れなどの行動立ち絵より優先 */
  if (p.hp < prev.hp) {
    const priorityDmgMsg = findPlayerDamageMsg(newMsgs, lastMsg, p?.playerName);
    if (priorityDmgMsg && PRIORITY_DAMAGE_KEYS.has(msgToDamageKey(priorityDmgMsg))) {
      return {
        src: pickDamagePortrait(priorityDmgMsg, PORTRAIT_SETS, p),
        cooldownUntil: now + PORTRAIT_DAMAGE_COOLDOWN_MS,
        force: true,
      };
    }
  }

  if (actionKey) {
    return pe(actionKey);
  }

  /* 近接：newMsgs 全体を見る（同ターンの「倒した／敵反撃」で lastMsg が上書きされても拾う）
   * 被ダメより優先（自分が振った行動を優先表示） */
  const meleeKey = findMeleeAttackKey(newMsgs, lastMsg, p);
  if (meleeKey) {
    return pe(meleeKey);
  }

  /* 被ダメ：状態異常なし＆クールダウン明けのみ（force しない） */
  if (p.hp < prev.hp) {
    const damageMsg = findPlayerDamageMsg(newMsgs, lastMsg, p?.playerName);
    if (damageMsg) {
      return {
        src: pickDamagePortrait(damageMsg, PORTRAIT_SETS, p),
        cooldownUntil: now + PORTRAIT_DAMAGE_COOLDOWN_MS,
        force: false,
        lowPriority: true,
        bypassCooldown: false,
      };
    }
    if (isStarving(p) && (isStarving(prev) || findHungerMsg(newMsgs, lastMsg))) {
      return {
        src: pickPortraitForPlayer("hp_hunger", p),
        cooldownUntil: now + PORTRAIT_COOLDOWN_MS,
        force: true,
      };
    }
  }

  const moved = p.x !== prev.x || p.y !== prev.y;
  /* ダッシュも低優先（クールダウン尊重） */
  if (dashed && moved) {
    return {
      src: pickPortraitForPlayer("dash", p),
      cooldownUntil: now + PORTRAIT_WALK_COOLDOWN_MS,
      force: false,
      lowPriority: true,
    };
  }

  return { isLow, moved, now };
}
