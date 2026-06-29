import { describe, it, expect } from "vitest";
import { applyWandEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("applyWandEffect", () => {
  const dg = makeEmptyDg();
  const noop = () => {};

  it("眠りの杖でモンスターを睡眠させる", () => {
    const mon = { name: "スライム", hp: 20, maxHp: 20, x: 6, y: 5, atk: 3 };
    const p = makePlayer();
    const ml = [];
    applyWandEffect("sleep", "monster", mon, 1, 0, dg, p, ml, noop);
    expect(mon.sleepTurns).toBe(6);
    expect(ml.some(m => m.includes("眠り"))).toBe(true);
  });

  it("祝福の眠りの杖は睡眠ターンが長い", () => {
    const mon = { name: "スライム", hp: 20, maxHp: 20, x: 6, y: 5, atk: 3 };
    const p = makePlayer();
    const ml = [];
    applyWandEffect("sleep", "monster", mon, 1, 0, dg, p, ml, noop, null, 1.5);
    expect(mon.sleepTurns).toBe(12);
  });

  it("呪われた鈍足の杖はプレイヤーを加速させる", () => {
    const p = makePlayer();
    const ml = [];
    applyWandEffect("slow", "player", p, 0, 0, dg, p, ml, noop, null, 0.5);
    expect(p.hasteTurns).toBe(10);
    expect(ml.some(m => m.includes("2倍速"))).toBe(true);
  });

  it("魔法無効のモンスターには杖が効かない", () => {
    const mon = { name: "キラープラスター", magicImmune: true, hp: 50, maxHp: 50, x: 6, y: 5 };
    const p = makePlayer();
    const ml = [];
    applyWandEffect("sleep", "monster", mon, 1, 0, dg, p, ml, noop);
    expect(mon.sleepTurns).toBeUndefined();
    expect(ml.some(m => m.includes("効かない"))).toBe(true);
  });
});