import { describe, it, expect } from "vitest";
import { applyPlayerTrip, isPlayerFloating } from "../items.js";
import { MONS } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

describe("足払い鬼 tripper", () => {
  it("MONS に tripper が定義されている", () => {
    const m = MONS.find((x) => x.subtype === "tripper" || x.baseKind === "tripper");
    expect(m).toBeTruthy();
    expect(m.name).toBe("足払い鬼");
    expect(m.levels?.length).toBe(2);
  });

  it("applyPlayerTrip は体幹の指輪で無効", () => {
    const p = makePlayer({
      hp: 40,
      maxHp: 40,
      x: 5,
      y: 5,
      rings: [{ effect: "core_ring" }],
      inventory: [{ name: "パン", type: "food", id: "f1" }],
    });
    const dg = makeEmptyDg({ items: [], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
    const ml = [];
    const r = applyPlayerTrip(p, dg, ml, { checkFloat: true, cause: "テスト" });
    expect(r).toBe("blocked_core");
    expect(p.hp).toBe(40);
    expect(p.inventory.length).toBe(1);
  });

  it("applyPlayerTrip は checkFloat 時に浮遊で無効", () => {
    const p = makePlayer({
      hp: 40,
      maxHp: 40,
      x: 5,
      y: 5,
      floatTurns: 10,
      inventory: [{ name: "パン", type: "food", id: "f1" }],
    });
    const dg = makeEmptyDg({
      map: Array.from({ length: 15 }, () => Array(20).fill(T.FLOOR)),
      items: [],
      rooms: [{ x: 1, y: 1, w: 10, h: 10 }],
    });
    expect(isPlayerFloating(p, dg)).toBe(true);
    const ml = [];
    const r = applyPlayerTrip(p, dg, ml, { checkFloat: true, cause: "テスト" });
    expect(r).toBe("blocked_float");
    expect(p.hp).toBe(40);
  });

  it("applyPlayerTrip は通常時ダメージと所持品落下", () => {
    const food = { name: "パン", type: "food", id: "f1" };
    const pot = { name: "回復薬", type: "potion", id: "p1" };
    const p = makePlayer({
      hp: 40,
      maxHp: 40,
      x: 5,
      y: 5,
      inventory: [food, pot],
    });
    const dg = makeEmptyDg({ items: [], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
    const ml = [];
    const r = applyPlayerTrip(p, dg, ml, { checkFloat: true, cause: "足払い" });
    expect(r).toBe("tripped");
    expect(p.hp).toBeLessThan(40);
    expect(ml.some((m) => m.includes("転んでしまった"))).toBe(true);
  });

  it("落ちた壺・薬・空き瓶は低確率で割れる", () => {
    const orig = Math.random;
    Math.random = () => 0;
    try {
      const potion = { name: "回復薬", type: "potion", effect: "heal", value: 30, id: "tripPotion" };
      const p = makePlayer({ hp: 50, maxHp: 100, x: 5, y: 5, inventory: [potion] });
      const dg = makeEmptyDg({ items: [], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
      const ml = [];
      applyPlayerTrip(p, dg, ml);
      expect(dg.items).toHaveLength(0);
      expect(ml.some((m) => m.includes("瓶が割れて中身が飛び散った"))).toBe(true);

      const pot = { name: "回復の壺", type: "pot", potEffect: "heal_pot", capacity: 3, contents: [], id: "tripPot" };
      const p2 = makePlayer({ hp: 50, maxHp: 100, x: 5, y: 5, inventory: [pot] });
      const dg2 = makeEmptyDg({ items: [], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
      const ml2 = [];
      applyPlayerTrip(p2, dg2, ml2);
      expect(dg2.items).toHaveLength(0);
      expect(ml2.some((m) => m.includes("回復の壺が割れた"))).toBe(true);

      const bottle = { name: "空き瓶", type: "bottle", id: "tripBottle" };
      const p3 = makePlayer({ x: 5, y: 5, inventory: [bottle] });
      const dg3 = makeEmptyDg({ items: [], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
      const ml3 = [];
      applyPlayerTrip(p3, dg3, ml3);
      expect(dg3.items).toHaveLength(0);
      expect(ml3.some((m) => m.includes("空き瓶が割れてしまった"))).toBe(true);
    } finally {
      Math.random = orig;
    }
  });
});
