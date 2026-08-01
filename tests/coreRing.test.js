import { describe, it, expect } from "vitest";
import { hasRingEffect, resistsForcedMove, pushEntity, RINGS } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

describe("体幹の指輪 core_ring", () => {
  it("RINGS に定義されている", () => {
    const r = RINGS.find((x) => x.effect === "core_ring");
    expect(r).toBeTruthy();
    expect(r.name).toBe("体幹の指輪");
    expect(r.rarity).toBe("B");
  });

  it("resistsForcedMove は core_ring 装備時 true", () => {
    expect(resistsForcedMove({ rings: [] })).toBe(false);
    expect(resistsForcedMove({ rings: [{ effect: "core_ring" }] })).toBe(true);
    expect(hasRingEffect({ rings: [{ effect: "core_ring" }] }, "core_ring")).toBe(true);
  });

  it("pushEntity がプレイヤーを動かさない", () => {
    const map = Array.from({ length: 15 }, () => Array(20).fill(T.FLOOR));
    const dg = makeEmptyDg({ map, monsters: [], traps: [] });
    const p = makePlayer({ x: 5, y: 5, rings: [{ effect: "core_ring" }], hp: 30, maxHp: 30 });
    const ml = [];
    const res = pushEntity(dg, p.x, p.y, 1, 0, 5, ml, "player", p, p, null, 0);
    expect(p.x).toBe(5);
    expect(p.y).toBe(5);
    expect(res.blocked).toBe(true);
    expect(ml.some((m) => m.includes("体幹"))).toBe(true);
  });
});
