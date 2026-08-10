import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function makeWaterBattlefield(monster) {
  const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
  map[5][5] = T.WATER;
  return makeEmptyDg({
    map,
    rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
    monsters: [monster],
  });
}

describe("水上限定モンスターの自発移動", () => {
  it("詰まり脱出でもわてりを水の外へ移動させない", () => {
    const wateri = makeMonsterFromBase(MONS.find((m) => m.baseKind === "wateri"), 1, 5, 5, { aware: false });
    wateri.turnAttacks = 0;
    wateri.posHistory = Array.from({ length: 6 }, () => ({ x: 5, y: 5 }));
    wateri._idleStuck = 8;
    const dg = makeWaterBattlefield(wateri);
    const p = makePlayer({ x: 25, y: 25 });

    monsterAI(wateri, dg, p, [], { moveOnly: true });

    expect({ x: wateri.x, y: wateri.y }).toEqual({ x: 5, y: 5 });
    expect(dg.map[wateri.y][wateri.x]).toBe(T.WATER);
  });
});
