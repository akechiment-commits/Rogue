import { isWanderingNpc } from "./wanderingAdventurer.js";

export function clearNpcRetaliation(monster) {
  if (!monster) return;
  delete monster._npcRetaliationTargetId;
  delete monster._npcRetaliationReturnState;
  delete monster._npcRetaliationReturnSpeed;
  delete monster._npcRetaliationReturnAware;
  delete monster._npcRetaliationReturnLastPos;
  delete monster._npcRetaliationReturnPos;
  delete monster._npcReturningHome;
}

export function beginNpcRetaliation(npc, attacker, messages) {
  if (!npc || npc.type !== "shopkeeper" || !attacker || attacker === npc || attacker.isPlayerClone || attacker.hp <= 0) return false;
  const previousTarget = npc._npcRetaliationTargetId;
  if (!previousTarget) {
    npc._npcRetaliationReturnState = npc.state || "friendly";
    npc._npcRetaliationReturnSpeed = npc.speed ?? npc.baseSpeed ?? 1;
    npc._npcRetaliationReturnAware = npc.aware;
    if (Number.isFinite(npc.lastPx) && Number.isFinite(npc.lastPy)) {
      npc._npcRetaliationReturnLastPos = { x: npc.lastPx, y: npc.lastPy };
    }
    if (!isWanderingNpc(npc)) {
      const returnPos = npc.state === "blocking" ? npc.blockPos
        : npc.state === "friendly" ? npc.homePos
          : { x: npc.x, y: npc.y };
      npc._npcRetaliationReturnPos = returnPos ? { x: returnPos.x, y: returnPos.y } : { x: npc.x, y: npc.y };
    }
    delete npc._npcReturningHome;
  }
  npc._npcRetaliationTargetId = attacker.id;
  npc.state = "hostile";
  npc.speed = 1;
  npc.aware = true;
  npc.lastPx = attacker.x;
  npc.lastPy = attacker.y;
  if (previousTarget !== attacker.id) {
    const label = npc.isWanderingMerchant ? "行商人" : npc.isWanderingAdventurer ? npc.name : "店主";
    messages?.push(`${label}が${attacker.name}に怒った！`);
  }
  return true;
}
