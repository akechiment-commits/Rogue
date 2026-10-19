import { isStatusImmune, statusTurns } from "./statusDuration.js";

export const DRUNK_DIRECTION_CHANCE = 1 / 8;
export const DRUNK_VOMIT_CHANCE = 0.05;
export const DRUNK_VOMIT_HUNGER_LOSS = 10;
export const DRUNK_VOMIT_HP_RATIO = 0.1;
export const DRUNKEN_COMA_TURNS = 20;

/** 酒の状態を付与する。酔い中なら酩酊、酩酊中なら昏睡に切り替える。 */
export function applySakeEffect(entity, {
  kind = "player",
  target = entity,
  blessed = false,
  cursed = false,
} = {}) {
  if (!entity) return { status: "none", turns: 0, cleared: [] };

  if (cursed) {
    const cleared = [];
    if ((entity.drunkTurns || 0) > 0) cleared.push("酔い");
    if ((entity.drunkenTurns || 0) > 0) cleared.push("酩酊");
    if ((entity.confusedTurns || 0) > 0) cleared.push("混乱");
    entity.drunkTurns = 0;
    entity.drunkenTurns = 0;
    entity.confusedTurns = 0;
    return { status: "cured", turns: 0, cleared };
  }

  if (isStatusImmune(entity)) return { status: "blocked", turns: 0, cleared: [] };

  if ((entity.drunkenTurns || 0) > 0) {
    entity.sleepTurns = DRUNKEN_COMA_TURNS;
    return { status: "coma", turns: DRUNKEN_COMA_TURNS, cleared: [] };
  }

  const escalating = (entity.drunkTurns || 0) > 0;
  const status = escalating ? "drunken" : "drunk";
  const turns = statusTurns(status, { kind, blessed, target });
  entity.drunkTurns = escalating ? 0 : turns;
  entity.drunkenTurns = escalating ? turns : 0;
  return { status, turns, cleared: [] };
}

/** 酩酊は毎回、通常の酔いは8分の1で行動方向を乱す。 */
export function isAlcoholDirectionRandomized(entity, random = Math.random) {
  if ((entity?.drunkenTurns || 0) > 0) return true;
  return (entity?.drunkTurns || 0) > 0 && random() < DRUNK_DIRECTION_CHANCE;
}

export function shouldVomit(entity, random = Math.random) {
  return (entity?.drunkenTurns || 0) > 0 && random() < DRUNK_VOMIT_CHANCE;
}

export function drunkenVomitDamage(currentHp) {
  const hp = Math.max(0, Math.floor(Number(currentHp) || 0));
  return hp > 0 ? Math.min(hp, Math.max(1, Math.floor(hp * DRUNK_VOMIT_HP_RATIO))) : 0;
}
