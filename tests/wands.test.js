import { describe, it, expect, vi } from "vitest";
import { applyWandEffect, triggerWandBreakEffect, fireWandBolt } from "../wands.js";
import { applySpellEffect } from "../items.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { makeStatue } from "../fixtures.js";
import { drainAnims, pushPlayerTeleportAnim } from "../animEvents.js";

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

  it("氷の杖は氷弱点の敵にダメージ2倍", () => {
    const normal = { name: "スライム", hp: 200, maxHp: 200, x: 6, y: 5, atk: 3 };
    const weak = { name: "ドラゴン", hp: 200, maxHp: 200, x: 7, y: 5, atk: 3, elemWeak: "ice" };
    const p = makePlayer();
    const ml1 = [];
    const ml2 = [];
    applyWandEffect("ice_wand", "monster", normal, 1, 0, dg, p, ml1, noop);
    applyWandEffect("ice_wand", "monster", weak, 1, 0, dg, p, ml2, noop);
    const dmgNormal = 200 - normal.hp;
    const dmgWeak = 200 - weak.hp;
    // normal: rng(15,25) / weak: rng(15,25)*2 → ranges 15-25 vs 30-50
    expect(dmgNormal).toBeGreaterThanOrEqual(15);
    expect(dmgNormal).toBeLessThanOrEqual(25);
    expect(dmgWeak).toBeGreaterThanOrEqual(30);
    expect(dmgWeak).toBeLessThanOrEqual(50);
    expect(ml2.some(m => m.includes("氷弱点"))).toBe(true);
    expect(weak.immobileTurns).toBe(5);
  });

  it("呪われた鈍足の杖はプレイヤーを加速させる", () => {
    const p = makePlayer();
    const ml = [];
    applyWandEffect("slow", "player", p, 0, 0, dg, p, ml, noop, null, 0.5);
    expect(p.hasteTurns).toBe(10);
    expect(ml.some(m => m.includes("2倍速"))).toBe(true);
  });

  it("プレイヤーの吹き飛ばしは移動元・移動先の演出イベントを発行する", () => {
    drainAnims();
    const localDg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    applyWandEffect("knockback", "player", p, 1, 0, localDg, p, [], noop);
    const ev = drainAnims().find(e => e.type === "playerKnockback");
    expect(ev).toMatchObject({ fromX: 5, fromY: 5, toX: 15, toY: 5, dx: 1, dy: 0 });
  });

  it("プレイヤーのテレポート演出は同じマスでは発行しない", () => {
    drainAnims();
    pushPlayerTeleportAnim(5, 5, 12, 8);
    expect(drainAnims()).toContainEqual({ type: "playerTeleport", fromX: 5, fromY: 5, toX: 12, toY: 8 });
    pushPlayerTeleportAnim(5, 5, 5, 5);
    expect(drainAnims()).toEqual([]);
  });

  it("階層移動は同じ座標でも落下待機を発行できる", () => {
    drainAnims();
    pushPlayerTeleportAnim(5, 5, 5, 5, true);
    expect(drainAnims()).toContainEqual({ type: "playerTeleport", fromX: 5, fromY: 5, toX: 5, toY: 5 });
  });

  it("魔法無効のモンスターには杖が効かない", () => {
    const mon = { name: "キラープラスター", magicImmune: true, hp: 50, maxHp: 50, x: 6, y: 5 };
    const p = makePlayer();
    const ml = [];
    applyWandEffect("sleep", "monster", mon, 1, 0, dg, p, ml, noop);
    expect(mon.sleepTurns).toBeUndefined();
    expect(ml.some(m => m.includes("効かない"))).toBe(true);
  });

  it("変化の杖は現フロアの敵へ変え、祝福・呪いでLvを補正する", () => {
    const floorOneNames = ["ネズミ", "バット", "ムカデ"];
    const p = makePlayer({ depth: 0 });
    for (const [sourceLevel, blMult, expectedLevel] of [[2, 1, 2], [1, 2, 1], [3, 0.5, 3]]) {
      const dg = makeEmptyDg();
      const mon = { name: "対象", hp: 20, maxHp: 20, x: 6, y: 5, monLevel: sourceLevel };
      applyWandEffect("transform", "monster", mon, 1, 0, dg, p, [], noop, null, blMult);
      expect(mon.monLevel).toBe(expectedLevel);
      const namesByLevel = [floorOneNames, ["殺人ネズミ", "青バット", "大ムカデ"], ["ものすごいネズミ", "ゴルァバット", "覇ムカデ"]];
      expect(namesByLevel[expectedLevel - 1]).toContain(mon.name);
    }
  });

  it("変化の魔法は現フロアの敵へ同Lvで変化する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ depth: 0 });
    const mon = { name: "対象", hp: 20, maxHp: 20, x: 6, y: 5, monLevel: 2 };
    applySpellEffect("transform_magic", "monster", mon, 1, 0, dg, p, [], noop);
    expect(mon.monLevel).toBe(2);
    expect(["殺人ネズミ", "青バット", "大ムカデ"]).toContain(mon.name);
  });

  it("自分に跳ね返った変化の杖は最大HPを変化させ、減少時は死因を記録する", () => {
    const p = makePlayer({ hp: 100, maxHp: 100 });
    const rngSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      applyWandEffect("transform", "player", p, 0, 0, makeEmptyDg(), p, [], noop);
      expect(p.maxHp).toBe(90);
      expect(p.hp).toBe(90);
      expect(p.deathCause).toBe("変化の杖で");
    } finally {
      rngSpy.mockRestore();
    }
  });

  it("石像と場所替えできる（壊れない）", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [], monsters: [], statues: [],
    });
    const st = makeStatue(8, 5);
    dg.statues.push(st);
    const p = makePlayer({ x: 5, y: 5 });
    const ml = [];
    applyWandEffect("swap", "statue", st, 1, 0, dg, p, ml, noop);
    expect(p.x).toBe(8);
    expect(p.y).toBe(5);
    expect(st.x).toBe(5);
    expect(st.y).toBe(5);
    expect(dg.statues.length).toBe(1);
    expect(ml.some(m => m.includes("入れ替わった"))).toBe(true);
  });

  it("石像にテレポートの杖で石像が移動する（壊れない）", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [], monsters: [], statues: [],
    });
    const st = makeStatue(8, 5);
    dg.statues.push(st);
    const p = makePlayer({ x: 5, y: 5 });
    const ml = [];
    applyWandEffect("warp", "statue", st, 1, 0, dg, p, ml, noop);
    expect(dg.statues.length).toBe(1);
    expect(st.x !== 8 || st.y !== 5).toBe(true);
    expect(ml.some(m => m.includes("テレポート"))).toBe(true);
  });

  it("石像に穴掘り・軟化は敵なしでアイテムのみ", () => {
    for (const eff of ["dig", "soften"]) {
      const dg = makeEmptyDg({
        map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
        items: [], monsters: [], statues: [], dungeonType: "intermediate",
      });
      const st = makeStatue(8, 5);
      dg.statues.push(st);
      const p = makePlayer({ x: 5, y: 5, depth: 5 });
      const ml = [];
      applyWandEffect(eff, "statue", st, 1, 0, dg, p, ml, noop);
      expect(dg.statues.length).toBe(0);
      expect(dg.monsters.length).toBe(0);
      expect(dg.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("飛びつきの杖は石像の前に着地する", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [], monsters: [], statues: [], traps: [],
    });
    const st = makeStatue(10, 5);
    dg.statues.push(st);
    const p = makePlayer({ x: 5, y: 5 });
    const ml = [];
    fireWandBolt(p, dg, "leap", 1, 0, ml, noop, null, 1);
    expect(p.x).toBe(9);
    expect(p.y).toBe(5);
    expect(dg.statues.length).toBe(1);
    expect(ml.some(m => m.includes("飛びついた"))).toBe(true);
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
