import { T, MW, MH, installPlayerHpReverseHook } from "../utils.js";

export function makeEmptyDg(overrides = {}) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
  return {
    map,
    monsters: [],
    items: [],
    traps: [],
    springs: [],
    bigboxes: [],
    pentacles: [],
    ...overrides,
  };
}

export function makePlayer(overrides = {}) {
  const p = {
    hp: 100,
    maxHp: 100,
    x: 5,
    y: 5,
    inventory: [],
    weapon: null,
    armor: null,
    rings: [],
    maxHunger: 100,
    hunger: 80,
    ...overrides,
  };
  installPlayerHpReverseHook(p);
  return p;
}