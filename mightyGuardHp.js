/**
 * Shinryu's Mighty Guard halves every HP loss while active. Damage is written
 * directly to monster.hp by many independent combat systems, so install an
 * enumerable accessor on this one boss to apply the rule at the shared state
 * boundary. JSON saves retain the visible hp value; loadGameState reinstalls
 * the accessor after deserialization.
 */
const mightyGuardGetters = new WeakSet();

export function installShinryuMightyGuardHpHook(monster) {
  if (!monster || monster.baseKind !== "boss_shinryu") return false;
  const descriptor = Object.getOwnPropertyDescriptor(monster, "hp");
  if (descriptor?.get && mightyGuardGetters.has(descriptor.get)) return false;

  let currentHp = Number(monster.hp) || 0;
  const getHp = function getShinryuHp() { return currentHp; };
  mightyGuardGetters.add(getHp);
  Object.defineProperty(monster, "hp", {
    configurable: true,
    enumerable: true,
    get: getHp,
    set(value) {
      const nextHp = Number(value);
      if (Number.isFinite(nextHp) && nextHp < currentHp && (this.mightyGuardTurns || 0) > 0) {
        const incomingDamage = currentHp - nextHp;
        currentHp = Math.max(0, currentHp - Math.max(1, Math.floor(incomingDamage / 2)));
        return;
      }
      currentHp = nextHp;
    },
  });
  return true;
}
