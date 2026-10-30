import { itemPrice } from "./items.js";

export const ALTAR_PRIEST_SERVICES = Object.freeze([
  Object.freeze({ id: "refill_wand", label: "杖の回数を補充" }),
  Object.freeze({ id: "refill_pen", label: "ペンの回数を補充" }),
  Object.freeze({ id: "upgrade", label: "装備を強化" }),
]);

const PLUS_RING_EFFECTS = new Set(["power_ring", "defense_ring", "life_ring"]);

export function altarPriestServiceTargets(inventory, service) {
  return (inventory || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (service === "refill_wand") return item.type === "wand";
      if (service === "refill_pen") return item.type === "pen";
      if (service === "upgrade") {
        return item.type === "weapon" || item.type === "armor" ||
          (item.type === "ring" && PLUS_RING_EFFECTS.has(item.effect));
      }
      return false;
    });
}

/** 依頼ごとに50%ずつ加算。itemPriceには杖・ペンの回数と装備の+値が含まれる。 */
export function altarPriestServicePrice(item, service, completedRequests = 0) {
  const itemValue = Math.max(1, itemPrice(item));
  const escalation = 1 + Math.max(0, Number(completedRequests) || 0) * 0.5;
  if (service === "refill_wand" || service === "refill_pen") {
    return Math.max(300, Math.ceil(itemValue * 2 * escalation));
  }
  if (service === "upgrade" && altarPriestServiceTargets([item], service).length > 0) {
    const currentPlus = Math.max(0, Math.floor(item.plus || 0));
    return Math.max(500, Math.ceil(itemValue * (2.5 + currentPlus * 0.5) * escalation));
  }
  return 0;
}
