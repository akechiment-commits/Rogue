import { describe, it, expect } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import { fireTrapItem } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("fireTrapPlayer", () => {
  it("鈍足の罠でプレイヤーが鈍足になる", () => {
    const p = makePlayer();
    const dg = makeEmptyDg();
    const trap = { effect: "slow_trap", name: "鈍足の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.slowTurns).toBe(10);
    expect(trap.revealed).toBe(true);
    expect(ml.some(m => m.includes("鈍足"))).toBe(true);
  });

  it("耐鈍足の防具で鈍足の罠を防げる", () => {
    const armor = { name: "鉄の鎧", type: "armor", ability: "slow_proof" };
    const p = makePlayer({ armor });
    const dg = makeEmptyDg();
    const trap = { effect: "slow_trap", name: "鈍足の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.slowTurns).toBeUndefined();
    expect(ml.some(m => m.includes("耐鈍足"))).toBe(true);
  });

  it("空腹の罠で満腹度が10%減る", () => {
    const p = makePlayer({ hunger: 80, maxHunger: 100 });
    const dg = makeEmptyDg();
    const trap = { effect: "hunger_trap", name: "空腹の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.hunger).toBe(70);
  });

  it("錆びの罠で武器の強化値が下がる", () => {
    const sword = { name: "短剣", type: "weapon", plus: 2 };
    const p = makePlayer({ weapon: sword, inventory: [sword] });
    const dg = makeEmptyDg();
    const trap = { effect: "rust", name: "錆びの罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(sword.plus).toBe(1);
    expect(ml.some(m => m.includes("錆び"))).toBe(true);
  });

  it("落とし穴の罠は pitfall を返す", () => {
    const p = makePlayer();
    const dg = makeEmptyDg();
    const trap = { effect: "pitfall", name: "落とし穴", x: 5, y: 5, id: "t1" };
    const ml = [];
    const result = fireTrapPlayer(trap, p, dg, ml);
    expect(result).toBe("pitfall");
  });
});

describe("fireTrapItem rockfall", () => {
  it("落石の罠でモンスターが倒れたときメッセージを出す", () => {
    const p = makePlayer();
    const mon = { name: "スライム", hp: 10, maxHp: 10, x: 5, y: 5 };
    const dg = makeEmptyDg({ monsters: [mon] });
    const trap = { effect: "rockfall", name: "落石の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapItem(trap, { name: "石", type: "misc" }, dg, 5, 5, ml, new Set(), p);
    expect(dg.monsters).toHaveLength(0);
    expect(ml.some(m => m.includes("スライムは倒れた！"))).toBe(true);
  });

  it("落石の罠で対象がいないときそのマスに石が落ちる", () => {
    const p = makePlayer({ x: 1, y: 1 });
    const dg = makeEmptyDg();
    const trap = { effect: "rockfall", name: "落石の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapItem(trap, { name: "薬", type: "potion" }, dg, 5, 5, ml, new Set(["t1"]), p);
    expect(dg.items).toHaveLength(1);
    expect(dg.items[0].name).toBe("石");
    expect(dg.items[0].x).toBe(5);
    expect(dg.items[0].y).toBe(5);
    expect(ml.some(m => m.includes("転がった"))).toBe(true);
  });
});