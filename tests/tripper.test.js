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
});
