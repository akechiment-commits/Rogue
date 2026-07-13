import { describe, it, expect } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import { fireTrapItem, removeTrap, runMineExplosion, mineExplosionPending, fireTrapArrowFromFacing, multiplyRoomMonsters, unidentPlayerItems, TRAPS, trapStepBreakChance } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T, MW, MH } from "../utils.js";

describe("fireTrapPlayer mp_absorb_trap", () => {
  it("プレイヤーのMPが5減る", () => {
    const p = makePlayer({ mp: 20, maxMp: 30 });
    const dg = makeEmptyDg();
    const trap = { effect: "mp_absorb_trap", name: "MP吸収の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.mp).toBe(15);
    expect(ml.some(m => m.includes("MPが5吸い取られた"))).toBe(true);
  });
});

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

  it("地雷を踏んでも爆発前は壊れず pending に登録される", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const trap = { effect: "explode", name: "地雷", x: 5, y: 5, id: "t1" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ml = [];
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = fireTrapPlayer(trap, p, dg, ml);
      expect(result).toBe("deferred_explosion");
      expect(dg.traps).toHaveLength(1);
      expect(dg._pendingMineExplosion?.trapId).toBe("t1");
      expect(ml.some(m => m.includes("壊れた"))).toBe(false);
    } finally {
      Math.random = origRandom;
    }
  });

  it("地雷の爆発後25%未満なら残る", () => {
    const p = makePlayer({ x: 5, y: 5, hp: 100, maxHp: 100 });
    const trap = { effect: "explode", name: "地雷", x: 5, y: 5, id: "t1" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ml = [];
    const origRandom = Math.random;
    Math.random = () => 0.99;
    try {
      runMineExplosion(dg, mineExplosionPending(trap), p, ml, () => {});
      expect(dg.traps).toHaveLength(1);
      expect(ml.some(m => m.includes("壊れた"))).toBe(false);
    } finally {
      Math.random = origRandom;
    }
  });

  it("地雷の爆発後25%以上で壊れる", () => {
    const p = makePlayer({ x: 5, y: 5, hp: 100, maxHp: 100 });
    const trap = { effect: "explode", name: "地雷", x: 5, y: 5, id: "t1" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ml = [];
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      runMineExplosion(dg, mineExplosionPending(trap), p, ml, () => {});
      expect(dg.traps).toHaveLength(0);
      expect(ml.some(m => m.includes("壊れた"))).toBe(true);
    } finally {
      Math.random = origRandom;
    }
  });

  it("誘爆した地雷も爆発後25%未満なら残る", () => {
    const p = makePlayer({ x: 5, y: 5, hp: 100, maxHp: 100 });
    const center = { effect: "explode", name: "地雷", x: 5, y: 5, id: "t0" };
    const chained = { effect: "explode", name: "地雷", x: 6, y: 5, id: "t1" };
    const dg = makeEmptyDg({ traps: [center, chained] });
    const ml = [];
    const origRandom = Math.random;
    Math.random = () => 0.99;
    try {
      runMineExplosion(dg, mineExplosionPending(center), p, ml, () => {});
      expect(dg.traps.some(t => t.id === "t1")).toBe(true);
      expect(ml.some(m => m.includes("誘爆"))).toBe(true);
      expect(ml.some(m => m.includes("壊れた"))).toBe(false);
    } finally {
      Math.random = origRandom;
    }
  });

  it("投げ命中の地雷も爆発後に破壊判定する", () => {
    const p = makePlayer({ x: 1, y: 1, hp: 100, maxHp: 100 });
    const trap = { effect: "explode", name: "地雷", x: 5, y: 5, id: "t1" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ml = [];
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      fireTrapItem(trap, { name: "石", type: "misc" }, dg, 5, 5, ml, new Set(), p);
      expect(dg.traps).toHaveLength(0);
      expect(ml.some(m => m.includes("壊れた"))).toBe(true);
    } finally {
      Math.random = origRandom;
    }
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

describe("fireTrapItem mp_absorb_trap", () => {
  it("モンスターが封印状態になる", () => {
    const p = makePlayer({ x: 1, y: 1, mp: 20 });
    const mon = { name: "スライム", hp: 10, x: 5, y: 5 };
    const dg = makeEmptyDg({ monsters: [mon] });
    const trap = { effect: "mp_absorb_trap", name: "MP吸収の罠", x: 5, y: 5, id: "t1" };
    const ml = [];
    fireTrapItem(trap, { name: "石", type: "misc" }, dg, 5, 5, ml, new Set(), p);
    expect(mon.sealed).toBe(true);
    expect(p.mp).toBe(20);
    expect(ml.some(m => m.includes("特技が封印された"))).toBe(true);
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

  it("落石の罠で対象がいないとき石が罠の近くに落ちる", () => {
    const p = makePlayer({ x: 1, y: 1 });
    const trap = { effect: "rockfall", name: "落石の罠", x: 5, y: 5, id: "t1" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ml = [];
    fireTrapItem(trap, { name: "薬", type: "potion" }, dg, 5, 5, ml, new Set(["t1"]), p);
    expect(dg.items).toHaveLength(1);
    const stone = dg.items[0];
    expect(stone.name).toBe("石");
    expect(stone.x === 5 && stone.y === 5).toBe(false);
    expect(Math.abs(stone.x - 5) + Math.abs(stone.y - 5)).toBeLessThanOrEqual(2);
    expect(ml.some(m => m.includes("転がった"))).toBe(true);
  });
});

describe("arrow trap facing", () => {
  it("矢がプレイヤー正面から飛んできて命中する", () => {
    /* 床全面。プレイヤーは下向き → 南の壁相当から北へ矢が来る */
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
    for (let x = 0; x < MW; x++) map[MH - 1][x] = T.WALL;
    const p = makePlayer({ x: 10, y: 10, hp: 50, maxHp: 50, facing: { dx: 0, dy: 1 } });
    const trap = { effect: "arrow_trap", name: "矢の罠", x: 10, y: 10, id: "at1" };
    const dg = makeEmptyDg({ map, traps: [trap], monsters: [] });
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.hp).toBeLessThan(50);
    expect(ml.some((m) => m.includes("矢が命中") || m.includes("命中"))).toBe(true);
  });

  it("正面の敵に矢が当たる（プレイヤーより先）", () => {
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
    for (let x = 0; x < MW; x++) map[0][x] = T.WALL;
    const p = makePlayer({ x: 10, y: 10, hp: 50, maxHp: 50, facing: { dx: 0, dy: -1 } });
    const mon = { id: "m1", name: "的", x: 10, y: 5, hp: 20, maxHp: 20, atk: 1 };
    const trap = { effect: "arrow_trap", name: "矢の罠", x: 10, y: 10, id: "at2" };
    const dg = makeEmptyDg({ map, traps: [trap], monsters: [mon] });
    const ml = [];
    fireTrapArrowFromFacing(trap, p, dg, ml, { poison: false });
    expect(p.hp).toBe(50);
    expect(mon.hp).toBeLessThan(20);
  });

  it("強矢の罠は通常矢より大きなダメージになる", () => {
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
    for (let x = 0; x < MW; x++) map[MH - 1][x] = T.WALL;
    const p = makePlayer({ x: 10, y: 10, hp: 100, maxHp: 100, facing: { dx: 0, dy: 1 } });
    const trap = { effect: "strong_arrow", name: "強矢の罠", x: 10, y: 10, id: "sa1" };
    const dg = makeEmptyDg({ map, traps: [trap], monsters: [] });
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    /* base 8 + rng(2,6) => 10..14 vs 通常矢 max 約7 */
    expect(p.hp).toBeLessThanOrEqual(90);
    expect(p.hp).toBeGreaterThanOrEqual(86);
    expect(ml.some((m) => m.includes("強矢"))).toBe(true);
  });

  it("壊した強矢の罠から強矢が散らばる", () => {
    const trap = { effect: "strong_arrow", name: "強矢の罠", x: 5, y: 5, id: "sa2" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ml = [];
    removeTrap(dg, trap, ml, { message: "壊れた" });
    expect(dg.items).toHaveLength(1);
    expect(dg.items[0].name).toBe("強矢");
    expect(dg.items[0].strong).toBe(true);
  });
});

describe("new weird traps", () => {
  it("浮遊の罠で floatTurns が付く", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const dg = makeEmptyDg();
    const trap = { effect: "float_trap", name: "浮遊の罠", x: 5, y: 5, id: "f1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.floatTurns).toBe(30);
  });

  it("油まみれの罠で oilyTurns が30付く", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const dg = makeEmptyDg();
    const trap = { effect: "oil_trap", name: "油まみれの罠", x: 5, y: 5, id: "o1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.oilyTurns).toBe(30);
  });

  it("未識別の罠は識別済み1つだけ剥がす", () => {
    const pot = { name: "回復薬", type: "potion", effect: "heal", fullIdent: true, bcKnown: true };
    const scroll = { name: "テレポートの巻物", type: "scroll", effect: "teleport", fullIdent: true, bcKnown: true };
    const p = makePlayer({ x: 5, y: 5, inventory: [pot, scroll] });
    const ident = new Set(["p:heal", "s:teleport"]);
    const dg = makeEmptyDg();
    const trap = { effect: "unident_trap", name: "未識別の罠", x: 5, y: 5, id: "u1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml, null, null, { ident });
    expect(ident.size).toBe(1);
    const unidentCount = [pot, scroll].filter((i) => !i.fullIdent && !i.bcKnown).length;
    expect(unidentCount).toBe(1);
  });

  it("敵が油まみれの罠を踏むと oilyTurns が付く", () => {
    const p = makePlayer({ x: 1, y: 1 });
    const mon = { id: "m1", name: "敵", x: 5, y: 5, hp: 10 };
    const trap = { effect: "oil_trap", name: "油まみれの罠", x: 5, y: 5, id: "o2" };
    const dg = makeEmptyDg({ traps: [trap], monsters: [mon] });
    const ml = [];
    fireTrapItem(trap, { name: "石", type: "arrow" }, dg, 5, 5, ml, new Set(), p);
    expect(mon.oilyTurns).toBe(30);
  });

  it("敵が浮遊の罠を踏むとボスにも floatTurns が付く", () => {
    const p = makePlayer({ x: 1, y: 1 });
    const mon = { id: "m1", name: "敵", x: 5, y: 5, hp: 10 };
    const boss = { id: "b1", name: "ボス", x: 6, y: 6, hp: 100, isBoss: true };
    const trap = { effect: "float_trap", name: "浮遊の罠", x: 5, y: 5, id: "f2" };
    const trapB = { effect: "float_trap", name: "浮遊の罠", x: 6, y: 6, id: "f3" };
    const dg = makeEmptyDg({ traps: [trap, trapB], monsters: [mon, boss] });
    const ml = [];
    fireTrapItem(trap, { name: "石", type: "arrow" }, dg, 5, 5, ml, new Set(), p);
    fireTrapItem(trapB, { name: "石", type: "arrow" }, dg, 6, 6, ml, new Set(), p);
    expect(mon.floatTurns).toBe(30);
    expect(boss.floatTurns).toBe(30);
  });

  it("未識別の罠を敵が踏むと混乱する", () => {
    const p = makePlayer({ x: 1, y: 1 });
    const mon = { id: "m1", name: "敵", x: 5, y: 5, hp: 10 };
    const trap = { effect: "unident_trap", name: "未識別の罠", x: 5, y: 5, id: "u2" };
    const dg = makeEmptyDg({ traps: [trap], monsters: [mon] });
    const ml = [];
    fireTrapItem(trap, { name: "石", type: "arrow" }, dg, 5, 5, ml, new Set(), p);
    expect(mon.confusedTurns).toBe(20);
  });

  it("落ちたアイテムで未識別の罠が作動するとそのアイテムが未識別になる", () => {
    const p = makePlayer({ x: 1, y: 1 });
    const pot = { name: "回復薬", type: "potion", effect: "heal", fullIdent: true, bcKnown: true, tile: 16 };
    const trap = { effect: "unident_trap", name: "未識別の罠", x: 5, y: 5, id: "u3" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ident = new Set(["p:heal"]);
    const ml = [];
    fireTrapItem(trap, pot, dg, 5, 5, ml, new Set(), p, (it) => it.name, null, ident);
    expect(pot.fullIdent).toBe(false);
    expect(pot.bcKnown).toBe(false);
    expect(ident.has("p:heal")).toBe(false);
    expect(ml.some((m) => m.includes("未識別になった"))).toBe(true);
  });

  it("増殖の罠の破損率は50%", () => {
    expect(trapStepBreakChance({ effect: "multiply_trap" })).toBe(0.5);
    expect(trapStepBreakChance({ effect: "oil_trap" })).toBe(0.25);
  });

  it("鳴動の罠で敵が aware になる", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const m = { id: "m1", name: "敵", x: 8, y: 8, hp: 10, aware: false };
    const dg = makeEmptyDg({ monsters: [m] });
    const trap = { effect: "alarm_trap", name: "鳴動の罠", x: 5, y: 5, id: "a1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(m.aware).toBe(true);
    expect(m.lastPx).toBe(5);
  });

  it("増殖の罠で同部屋の敵が分裂しボスは増えない", () => {
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
    const rooms = [{ x: 0, y: 0, w: 15, h: 15 }];
    const p = makePlayer({ x: 2, y: 2 });
    const m1 = { id: "m1", name: "スライム", x: 4, y: 4, hp: 10, maxHp: 10, aware: false };
    const boss = { id: "b1", name: "ボス", x: 6, y: 6, hp: 100, maxHp: 100, isBoss: true };
    const sk = { id: "s1", name: "店主", x: 7, y: 7, hp: 200, type: "shopkeeper" };
    const dg = makeEmptyDg({ map, rooms, monsters: [m1, boss, sk] });
    const trap = { effect: "multiply_trap", name: "増殖の罠", x: 2, y: 2, id: "mul1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(dg.monsters.filter((m) => m.name === "スライム").length).toBe(2);
    expect(dg.monsters.filter((m) => m.isBoss).length).toBe(1);
    expect(dg.monsters.filter((m) => m.type === "shopkeeper").length).toBe(1);
  });

  it("TRAPS に新種が定義されている", () => {
    const effects = TRAPS.map((t) => t.effect);
    for (const e of ["float_trap", "oil_trap", "unident_trap", "alarm_trap", "multiply_trap", "confuse_trap"]) {
      expect(effects).toContain(e);
    }
  });

  it("混乱の罠でプレイヤーが混乱する", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const dg = makeEmptyDg();
    const trap = { effect: "confuse_trap", name: "混乱の罠", x: 5, y: 5, id: "c1" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.confusedTurns).toBe(10);
  });

  it("混乱の罠は耐混乱で防げる", () => {
    const armor = { name: "鎧", type: "armor", ability: "confuse_proof" };
    const p = makePlayer({ x: 5, y: 5, armor });
    const dg = makeEmptyDg();
    const trap = { effect: "confuse_trap", name: "混乱の罠", x: 5, y: 5, id: "c2" };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.confusedTurns || 0).toBe(0);
    expect(ml.some((m) => m.includes("耐混乱"))).toBe(true);
  });

  it("混乱の罠を敵が踏むと20T混乱", () => {
    const p = makePlayer({ x: 1, y: 1 });
    const mon = { id: "m1", name: "敵", x: 5, y: 5, hp: 10 };
    const trap = { effect: "confuse_trap", name: "混乱の罠", x: 5, y: 5, id: "c3" };
    const dg = makeEmptyDg({ traps: [trap], monsters: [mon] });
    const ml = [];
    fireTrapItem(trap, { name: "石", type: "arrow" }, dg, 5, 5, ml, new Set(), p);
    expect(mon.confusedTurns).toBe(20);
  });
});

describe("removeTrap break loot", () => {
  it("踏む以外で壊れた矢の罠から矢が散らばる", () => {
    const trap = { effect: "arrow_trap", name: "矢の罠", x: 5, y: 5, id: "t1" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ml = [];
    removeTrap(dg, trap, ml, { message: "壊れた" });
    expect(dg.traps).toHaveLength(0);
    expect(dg.items).toHaveLength(1);
    expect(dg.items[0].name).toBe("矢");
    expect(dg.items[0].count).toBeGreaterThanOrEqual(2);
  });

  it("踏んだ後の破壊ではアイテムを出さない", () => {
    const trap = { effect: "poison_arrow", name: "毒矢の罠", x: 3, y: 3, id: "t2" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ml = [];
    removeTrap(dg, trap, ml, { fromStep: true });
    expect(dg.items).toHaveLength(0);
  });

  it("skipLoot では罠師の置き換え相当でアイテムを出さない", () => {
    const trap = { effect: "rockfall", name: "落石の罠", x: 4, y: 4, id: "t3" };
    const dg = makeEmptyDg({ traps: [trap] });
    const ml = [];
    removeTrap(dg, trap, ml, { skipLoot: true });
    expect(dg.traps).toHaveLength(0);
    expect(dg.items).toHaveLength(0);
  });
});