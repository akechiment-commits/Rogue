import { T } from "./utils.js";
import { playerTargetAlt } from "./playerLabel.js";
import { isKeyUp, isKeyDown, isKeyLeft, isKeyRight } from "./inputKeys.js";

const BAD_STATUSES = ["poisoned", "sleepTurns", "paralyzeTurns", "frozenTurns", "immobileTurns",
  "confusedTurns", "darknessTurns", "bewitchedTurns", "sealedTurns", "slowTurns", "oilyTurns",
  "soakedTurns", "attackSealTurns", "capturedBy"];

export function snapshotSoundState(state) {
  const p = state?.player;
  if (!p) return null;
  const itemKey = item => item?.id || (item ? `${item.type}:${item.name}:${item.effect}` : "");
  return {
    x: p.x, y: p.y, depth: p.depth, hp: p.hp, playerName: p.playerName,
    tile: state.dungeon?.map?.[p.y]?.[p.x],
    equipment: [p.weapon, p.armor, p.arrow, ...(p.rings || [])].map(itemKey).join("|"),
    badStatuses: BAD_STATUSES.map(key => key === "capturedBy" ? !!p[key] : Number(p[key]) > 0),
  };
}

export function soundStateChanges(previous, next) {
  if (!previous || !next) return [];
  const sounds = [];
  if (previous.depth !== next.depth) sounds.push("stairs");
  else if (previous.x !== next.x || previous.y !== next.y) sounds.push(next.tile === T.WATER ? "water" : "footstep");
  if (next.hp < previous.hp) sounds.push("playerDamage");
  if (next.equipment !== previous.equipment) sounds.push("equip");
  if (next.badStatuses.some((active, i) => active && !previous.badStatuses[i])) sounds.push("status");
  if (next.hp > 0 && next.badStatuses.some((active, i) => !active && previous.badStatuses[i])) sounds.push("statusClear");
  return sounds;
}

/** ログの1種類に打ち切らず、同じ行動の使用・命中・撃破・被弾を別々に拾う。 */
export function classifySoundMessages(messages, { playerName = "" } = {}) {
  const sounds = [];
  const playerDamage = new RegExp(`(?:${playerTargetAlt(playerName)})[^。！]*?(?:に|は|が)?\\d+ダメージ`);
  for (const message of messages) {
    const text = String(message?.text ?? message);
    const add = id => sounds.push(id);
    if (/レベルアップ[！!]/.test(text)) add("levelUp");
    if (/を倒した[！!。]|を撃破|は消し飛んだ[！!]/.test(text)) add("defeat");
    if (/会心の一撃|痛恨の一撃|強烈な一撃/.test(text)) add("crit");
    if (/外れた|かわした|命中しなかった|攻撃.*空振り/.test(text)) add("miss");
    if (/割れた|割れてしまった|粉々に|壊れた|壊れてしまった/.test(text)) add("shatter");
    if (/爆発した|大爆発|誘爆した|爆破した|爆発を受けた/.test(text)) add("explosion");
    if (/罠.*(?:発動|作動)|(?:地雷|回転板|落とし穴).*発動/.test(text)) add("trap");
    if (/(?:G|ゴールド|金貨).*?(?:拾った|手に入れた)/.test(text)) add("gold");
    else if (/拾った|手に入れた/.test(text)) add("pickup");
    if (/食べた|たいらげた|口にした/.test(text)) add("eat");
    if (/飲んだ/.test(text)) add("drink");
    if (/巻物.*読んだ/.test(text)) add("scroll");
    else if (/読んだ|唱えた|杖を振った|魔法.*放った|光弾.*放った/.test(text)) add("magic");
    if (/射った|射た[！!。]|撃った|発射した|矢.*放った/.test(text)) add("shoot");
    else if (/投げた|放った/.test(text)) add("throw");
    if (/降りた|昇った|次の階|フロアへ進んだ|穴に落ちた/.test(text)) add("stairs");
    if (/ダメージを受けた|攻撃を受けた|痛打/.test(text) || playerDamage.test(text) ||
        /の攻撃[！!]\d+ダメージ|(?:溺れ|苦しい|窒息|毒のダメージ).+\d+ダメージ/.test(text)) add("playerDamage");
    else if (/に\d+ダメージ|ダメージを与えた/.test(text)) add("hit");
    if (/HP.*(?:回復した|回復[！!]|全回復)|HP\+\d+回復/.test(text)) add("heal");
    if (/復活した|として復活|復活の魔方陣の力で/.test(text)) add("revive");
    if (/テレポートした|ワープした|ポータルから.+抜けた|対の陣へ抜けた/.test(text)) add("teleport");
    if (/を装備した|を外した|装備を解除した/.test(text)) add("equip");
    if (/正体が明らか|は.+だった[！!]|を識別した/.test(text)) add("identify");
    if (/強化された[！!。]|祝福された[！!。]|攻撃力が.+上が|防御力が.+上が|倍速になった/.test(text)) add("buff");
    if (/呪われた[！!。]|呪われてしまった|呪われている[！!]|呪いがかかった/.test(text)) add("curse");
    if (/毒状態.+なった|眠りについた|混乱した|凍りついた|金縛りにあった|幻惑された|封印された|鈍足になった/.test(text)) add("status");
    if (/呪いが解けた|毒が治った|状態異常が治った/.test(text)) add("statusClear");
    if (/壁.*(?:叩き壊した|掘った|崩れた)|石像が砕け散った/.test(text)) add("wallBreak");
    if (/から.+取り出した|(?:壺|大箱|箱).*(?:入れた|収納した|開けた)/.test(text)) add("container");
    if (/購入した|買った|代金.*払った/.test(text)) add("shopBuy");
    if (/売った|売却した|換金した|買い取った/.test(text)) add("shopSell");
    if (/ガチャ.*(?:回した|出てきた)|景品.*出た/.test(text)) add("gacha");
    if (/泉.*(?:浸した|入れた)|水.*飛び散った/.test(text)) add("water");
    if (/【ピンチ】|空腹でHPが減り始めた/.test(text)) add("alert");
  }
  return sounds;
}

export function animationSounds(data) {
  const sounds = [];
  if (data.attacks?.some(event => event.type === "attack")) {
    if (data.damages?.some(event => event.type === "damage" && event.value > 0)) {
      sounds.push(data.damages.some(event => event.color === "#ffff00") ? "crit" : "hit");
    } else if (data.damages?.some(event => event.type === "miss")) sounds.push("miss");
  }
  if (data.monDamages?.some(event => event.type === "damage" && event.value > 0)) sounds.push("playerDamage");
  if (data.monDamages?.some(event => event.type === "miss")) sounds.push("miss");
  for (const event of data.explosions || []) {
    if (event.type === "heal") sounds.push("heal");
    else if (event.type === "lightning") sounds.push("magic");
    else if (event.type === "explosion") sounds.push("explosion");
  }
  if (data.playerTeleport) sounds.push("teleport");
  if (data.playerKnockback) sounds.push("knockback");
  if (data.monProjectiles?.length) sounds.push("throw");
  if (data.splashes?.length) sounds.push("water");
  return sounds;
}

export function soundForInterfaceKey(event) {
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return null;
  if (isKeyUp(event) || isKeyDown(event) || isKeyLeft(event) || isKeyRight(event) || event.key === "Tab") return "cursor";
  const key = event.key?.toLowerCase();
  if (["enter", "z", " "].includes(key)) return "select";
  if (["escape", "x", "backspace"].includes(key)) return "cancel";
  return null;
}
