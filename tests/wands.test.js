import { describe, it, expect } from "vitest";
import { applyWandEffect, triggerWandBreakEffect } from "../wands.js";
import { T } from "../utils.js";
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

describe("triggerWandBreakEffect", () => {
  const noop = () => {};

  it("残回数0で命中対象なしでは発動しない", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    const ml = [];
    const wand = { type: "wand", effect: "sleep", charges: 0 };
    const res = triggerWandBreakEffect(wand, 5, 5, dg, p, ml, noop);
    expect(res.triggered).toBe(false);
    expect(ml.length).toBe(0);
  });

  it("残回数0で命中対象ありなら本人に1回だけ効果", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 3, y: 3 });
    const mon = { name: "スライム", hp: 20, maxHp: 20, x: 6, y: 5, atk: 3 };
    const bystander = { name: "ゴブリン", hp: 20, maxHp: 20, x: 5, y: 5, atk: 3 };
    dg.monsters.push(mon, bystander);
    const ml = [];
    const wand = { type: "wand", effect: "sleep", charges: 0 };
    const res = triggerWandBreakEffect(wand, 6, 5, dg, p, ml, noop, {
      singleTargetKind: "monster", singleTarget: mon, effectDx: 1, effectDy: 0,
    });
    expect(res.triggered).toBe(true);
    expect(res.zeroChargeSingle).toBe(true);
    expect(mon.sleepTurns).toBe(6);
    expect(bystander.sleepTurns).toBeUndefined();
  });

  it("指定座標を中心に周囲へ効果が出る", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 3, y: 3 });
    const mon = { name: "スライム", hp: 20, maxHp: 20, x: 6, y: 5, atk: 3 };
    dg.monsters.push(mon);
    const ml = [];
    const wand = { type: "wand", effect: "sleep", charges: 2 };
    triggerWandBreakEffect(wand, 6, 5, dg, p, ml, noop);
    expect(mon.sleepTurns).toBe(6);
    expect(ml.some(m => m.includes("眠"))).toBe(true);
  });

  it("中心が隣のモンスターでもプレイヤーが周囲8マスなら巻き込まれる", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    const mon = { name: "ゴブリン", hp: 20, maxHp: 20, x: 6, y: 5, atk: 3, speed: 1 };
    dg.monsters.push(mon);
    const ml = [];
    const wand = { type: "wand", effect: "slow", charges: 2 };
    triggerWandBreakEffect(wand, 6, 5, dg, p, ml, noop);
    expect(p.slowTurns).toBe(10);
    expect(mon.speed).toBeLessThan(1);
  });

  it("氷の杖を壊すと水を凍らせつつ周囲の敵に氷ダメージ", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 3, y: 3 });
    dg.map[5][7] = T.WATER;
    const mon = { name: "スライム", hp: 50, maxHp: 50, x: 6, y: 5, atk: 3 };
    dg.monsters.push(mon);
    const ml = [];
    const wand = { type: "wand", effect: "ice_wand", charges: 2 };
    triggerWandBreakEffect(wand, 6, 5, dg, p, ml, noop);
    expect(dg.map[5][7]).toBe(T.FLOOR);
    expect(mon.hp).toBeLessThan(50);
    expect(mon.immobileTurns).toBe(5);
    expect(ml.some(m => m.includes("凍"))).toBe(true);
    expect(ml.some(m => m.includes("氷"))).toBe(true);
  });

  it("残回数に応じてceil(残/2)回発動する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    const ml = [];
    const wand = { type: "wand", effect: "leap", charges: 5 };
    triggerWandBreakEffect(wand, 5, 5, dg, p, ml, noop);
    expect(ml.filter(m => m.includes("何も起こらなかった")).length).toBe(3);
  });
});

describe("destroyFloorWand", () => {
  const noop = () => {};

  it("軟化で床の杖が壊れると周囲に壊し効果が出る", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 3, y: 3 });
    const mon = { name: "ゴブリン", hp: 20, maxHp: 20, x: 7, y: 5, atk: 3 };
    dg.monsters.push(mon);
    const wand = { id: "w1", type: "wand", effect: "sleep", charges: 2, name: "眠りの杖", x: 6, y: 5, tile: 24 };
    dg.items.push(wand);
    const ml = [];
    applyWandEffect("soften", "item", wand, 1, 0, dg, p, ml, noop);
    expect(dg.items.some(i => i.id === "w1")).toBe(false);
    expect(mon.sleepTurns).toBe(6);
    expect(ml.some(m => m.includes("崩れ落ちた"))).toBe(true);
  });
});