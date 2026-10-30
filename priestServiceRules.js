import { itemPrice, ITEMS } from "./items.js";
import { hasClearableStatusAilments } from "./statusDuration.js";

export const ALTAR_PRIEST_SERVICES = Object.freeze([
  Object.freeze({ id: "refill_wand", label: "杖の回数を補充" }),
  Object.freeze({ id: "refill_pen", label: "ペンの回数を補充" }),
  Object.freeze({ id: "upgrade", label: "装備を強化" }),
  Object.freeze({ id: "remove_curse", label: "呪いを解く" }),
  Object.freeze({ id: "cure_status", label: "状態異常を解除" }),
]);

const PLUS_RING_EFFECTS = new Set(["power_ring", "defense_ring", "life_ring"]);

export function altarPriestServiceTargets(inventory, service, player = null) {
  if (service === "cure_status") {
    return hasClearableStatusAilments(player) || (player?.dopingAftereffectTurns || 0) > 0
      ? [{ item: null, index: -1 }]
      : [];
  }
  return (inventory || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (service === "refill_wand") return item.type === "wand";
      if (service === "refill_pen") return item.type === "pen";
      if (service === "upgrade") {
        return item.type === "weapon" || item.type === "armor" ||
          (item.type === "ring" && PLUS_RING_EFFECTS.has(item.effect));
      }
      if (service === "remove_curse") {
        return item.type !== "gold" && item.type !== "goal" && !!item.cursed && !!(item.fullIdent || item.bcKnown);
      }
      return false;
    });
}

/** 同じ司祭への完了依頼1回ごとに20%ずつ加算。 */
export function altarPriestServicePrice(item, service, completedRequests = 0) {
  const escalation = 1 + Math.max(0, Math.floor(Number(completedRequests) || 0)) * 0.2;
  if (service === "cure_status") {
    const panacea = ITEMS.find((entry) => entry.type === "potion" && entry.effect === "panacea");
    return Math.max(300, Math.ceil((panacea ? itemPrice(panacea) : 2500) * 0.3 * escalation));
  }
  if (!item) return 0;
  const itemValue = Math.max(1, itemPrice(item));
  if (service === "refill_wand" || service === "refill_pen") {
    return Math.max(300, Math.ceil(itemValue * 2 * escalation));
  }
  if (service === "upgrade" && altarPriestServiceTargets([item], service).length > 0) {
    const currentPlus = Math.max(0, Math.floor(item.plus || 0));
    return Math.max(500, Math.ceil(itemValue * (2.5 + currentPlus * 0.5) * escalation));
  }
  if (service === "remove_curse" && altarPriestServiceTargets([item], service).length > 0) {
    return Math.max(100, Math.ceil(itemValue * 0.5 * escalation));
  }
  return 0;
}
