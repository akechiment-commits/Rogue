import { T, MW, MH } from "../utils.js";

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
  return {
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
}