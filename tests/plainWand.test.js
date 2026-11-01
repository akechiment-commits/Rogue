import { describe, it, expect } from "vitest";
import { WANDS } from "../items.js";
import { applyWandEffect, breakWandAoE } from "../wands.js";
import { makePlayer } from "./helpers.js";

describe("ただの杖の実装", () => {
  it("WANDS にただの杖が正しく定義されている", () => {
    const wand = WANDS.find((w) => w.name === "ただの杖");
    expect(wand).toBeDefined();
    expect(wand.effect).toBe("plain");
    expect(wand.charges).toBe(5);
    expect(wand.rarity).toBe("E");
    expect(wand.weight).toBe(12);
    expect(wand.sellPrice).toBe(50);
    expect(wand.tile).toBe(24);
  });

  it("振ってモンスターに命中しても何も起こらない", () => {
    const p = makePlayer({ x: 2, y: 2 });
    const m = { id: "mon1", name: "ゴブリン", x: 4, y: 2, hp: 20, maxHp: 20 };
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(0)), monsters: [m], items: [] };
    const ml = [];

    applyWandEffect("plain", "monster", m, 1, 0, dg, p, ml, null, null);
    expect(m.hp).toBe(20);
    expect(ml.some((msg) => msg.includes("ゴブリンに光が当たったが、何も起こらなかった"))).toBe(true);
  });

  it("プレイヤー自身に当たっても何も起こらない", () => {
    const p = makePlayer({ x: 2, y: 2, hp: 30, maxHp: 30 });
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(0)), monsters: [], items: [] };
    const ml = [];

    applyWandEffect("plain", "player", p, 0, 0, dg, p, ml, null, null);
    expect(p.hp).toBe(30);
    expect(ml.some((msg) => msg.includes("光を浴びたが、何も起こらなかった"))).toBe(true);
  });

  it("壊しても何も起こらない", () => {
    const p = makePlayer({ x: 2, y: 2, depth: 1 });
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(0)), monsters: [], items: [] };
    const ml = [];

    breakWandAoE(p, dg, "plain", ml, null, 1);
    expect(ml.some((msg) => msg.includes("杖が壊れたが何も起こらなかった"))).toBe(true);
  });
});
