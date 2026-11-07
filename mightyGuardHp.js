import { installMonsterHpHook } from "./statusDuration.js";

/**
 * Shinryu's Mighty Guard halves every HP loss while active. Damage is written
 * directly to monster.hp by many independent combat systems, so install an
 * enumerable accessor on this one boss to apply the rule at the shared state
 * boundary. JSON saves retain the visible hp value; loadGameState reinstalls
 * the accessor after deserialization.
 */
export function installShinryuMightyGuardHpHook(monster) {
  if (!monster || monster.baseKind !== "boss_shinryu") return false;
  return installMonsterHpHook(monster);
}
