import { describe, it, expect } from "vitest";
import {
  makeFakeStairTrap, materializeFakeStair, trapDisplayAsStair,
  makeVent, makeStatue, makeFixedPortalPair, findFixedPortalPair,
  breakStatue, applyWindDir, getWindAt,
} from "../fixtures.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

describe("偽階段", () => {
  it("未看破時は階段に見える", () => {
    const t = makeFakeStairTrap(3, 4, "down");
    expect(trapDisplayAsStair(t)).toBe("stair_down");
    expect(t.effect).toBe("fake_stair");
    t.revealed = true;
    expect(trapDisplayAsStair(t)).toBeNull();
  });

  it("materialize で通常罠に変わる", () => {
    const t = makeFakeStairTrap(1, 1, "down");
    materializeFakeStair(t);
    expect(t.effect).not.toBe("fake_stair");
    expect(t.revealed).toBe(true);
    expect(t.disguise).toBeUndefined();
  });
});

describe("風穴", () => {
  it("5x5 内で方向を上書き", () => {
    const dg = makeEmptyDg({ vents: [makeVent(5, 5, 1, 0)] });
    expect(getWindAt(dg, 5, 5)).toBeTruthy();
    expect(getWindAt(dg, 7, 7)).toBeTruthy();
    expect(getWindAt(dg, 8, 5)).toBeNull();
    const bent = applyWindDir(dg, 6, 5, 0, 1);
    expect(bent.dx).toBe(1);
    expect(bent.dy).toBe(0);
    expect(bent.bent).toBe(true);
  });
});

describe("固定転送", () => {
  it("ペア同士だけ繋がる", () => {
    const [a, b] = makeFixedPortalPair(1, 1, 8, 8, 3);
    expect(a.pairId).toBe(b.pairId);
    const dg = makeEmptyDg({ pentacles: [a, b] });
    expect(findFixedPortalPair(dg, a)).toBe(b);
    expect(findFixedPortalPair(dg, b)).toBe(a);
  });
});

describe("石像", () => {
  it("壊すとアイテムとフロア敵（レベル+1）が出る", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [],
      monsters: [],
      statues: [],
      dungeonType: "intermediate",
    });
    const st = makeStatue(5, 5);
    dg.statues.push(st);
    const p = makePlayer({ x: 1, y: 1, depth: 5 });
    const ml = [];
    breakStatue(st, dg, p, ml, null, 4);
    expect(dg.statues.length).toBe(0);
    expect(dg.monsters.length).toBeGreaterThanOrEqual(1);
    const mon = dg.monsters[0];
    expect(mon.monLevel).toBeGreaterThanOrEqual(2); /* 通常1なら+1で2以上 */
    expect(ml.some(m => m.includes("砕け"))).toBe(true);
    expect(ml.some(m => m.includes("が現れた"))).toBe(true);
  });
});
