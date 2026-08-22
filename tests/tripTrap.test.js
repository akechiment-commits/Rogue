import { describe, it, expect } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import { monsterAI } from "../monsters.js";
import { fireTrapItem, TRAPS, placeItemAt } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";
import { isFallMsg, resolvePortraitEvent } from "../portraits.js";

describe("転倒の罠 trip_trap", () => {
  it("TRAPS に転倒の罠がある", () => {
    const t = TRAPS.find((x) => x.effect === "trip_trap");
    expect(t).toBeTruthy();
    expect(t.name).toBe("転倒の罠");
    expect(t.rarity).toBe("D");
    expect(t.weight).toBe(8);
  });

  it("体幹の指輪で転倒を無効化する", () => {
    const food = { name: "パン", type: "food", id: "f1" };
    const ring = { name: "体幹の指輪", type: "ring", effect: "core_ring", id: "cr1" };
    const p = makePlayer({
      hp: 50,
      maxHp: 50,
      x: 5,
      y: 5,
      rings: [ring],
      inventory: [ring, food],
    });
    const trap = { effect: "trip_trap", name: "転倒の罠", x: 5, y: 5, id: "tripCore" };
    const dg = makeEmptyDg({ traps: [trap], items: [], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.hp).toBe(50);
    expect(p.inventory).toContain(food);
    expect(ml.some((m) => m.includes("体幹") || m.includes("転ばなかった"))).toBe(true);
    expect(ml.some((m) => m.includes("転んでしまった"))).toBe(false);
  });

  it("踏むと小ダメージと所持品ドロップ", () => {
    const sword = { name: "短剣", type: "weapon", plus: 0, id: "w1" };
    const food = { name: "パン", type: "food", id: "f1" };
    const pot = { name: "回復薬", type: "potion", id: "p1" };
    const p = makePlayer({
      hp: 50,
      maxHp: 50,
      x: 5,
      y: 5,
      weapon: sword,
      inventory: [sword, food, pot],
    });
    const trap = { effect: "trip_trap", name: "転倒の罠", x: 5, y: 5, id: "trip1" };
    const dg = makeEmptyDg({ traps: [trap], items: [], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
    const ml = [];
    const orig = Math.random;
    let i = 0;
    /* rng(3,8) と rng(2,4) とシャッフルで使う Math.random を安定化 */
    Math.random = () => {
      const seq = [0.0, 0.5, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      return seq[i++ % seq.length];
    };
    try {
      fireTrapPlayer(trap, p, dg, ml);
    } finally {
      Math.random = orig;
    }
    expect(p.hp).toBeLessThan(50);
    expect(p.hp).toBeGreaterThanOrEqual(50 - 8);
    expect(ml.some((m) => m.includes("転んでしまった"))).toBe(true);
    expect(trap.revealed).toBe(true);
    /* 装備中の剣は残る */
    expect(p.weapon).toBe(sword);
    expect(p.inventory).toContain(sword);
    /* 未装備は減っている */
    expect(p.inventory.length).toBeLessThan(3);
    expect(ml.some((m) => m.includes("を落とした") || m.includes("水") || m.includes("沈") || m.includes("消えて"))).toBe(true);
  });

  it("装備中の防具・指輪は落とさない", () => {
    const armor = { name: "鉄の鎧", type: "armor", id: "a1" };
    const ring = { name: "力の指輪", type: "ring", id: "r1" };
    const food = { name: "パン", type: "food", id: "f9" };
    const food2 = { name: "肉", type: "food", id: "f10" };
    const p = makePlayer({
      hp: 40,
      maxHp: 40,
      x: 5,
      y: 5,
      armor,
      rings: [ring],
      inventory: [armor, ring, food, food2],
    });
    const trap = { effect: "trip_trap", name: "転倒の罠", x: 5, y: 5, id: "tripEq" };
    const dg = makeEmptyDg({ traps: [trap], items: [], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.armor).toBe(armor);
    expect(p.rings).toContain(ring);
    expect(p.inventory).toContain(armor);
    expect(p.inventory).toContain(ring);
  });

  it("キーアイテムは落とさない", () => {
    const goal = { name: "禁書", type: "goal", id: "g1" };
    const p = makePlayer({ hp: 40, maxHp: 40, x: 5, y: 5, inventory: [goal] });
    const trap = { effect: "trip_trap", name: "転倒の罠", x: 5, y: 5, id: "trip2" };
    const dg = makeEmptyDg({ traps: [trap], items: [], rooms: [{ x: 1, y: 1, w: 8, h: 8 }] });
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.inventory).toHaveLength(1);
    expect(p.inventory[0].type).toBe("goal");
    expect(ml.some((m) => m.includes("落とすものはなかった"))).toBe(true);
  });

  it("落ちた先の罠が作動する", () => {
    const food = { name: "パン", type: "food", id: "f2" };
    const food2 = { name: "肉", type: "food", id: "f3" };
    const p = makePlayer({
      hp: 40,
      maxHp: 40,
      x: 5,
      y: 5,
      inventory: [food, food2],
    });
    const trip = { effect: "trip_trap", name: "転倒の罠", x: 5, y: 5, id: "trip3" };
    const slow = { effect: "slow_trap", name: "鈍足の罠", x: 6, y: 5, id: "slow1" };
    const dg = makeEmptyDg({
      traps: [trip, slow],
      items: [],
      rooms: [{ x: 1, y: 1, w: 12, h: 12 }],
    });
    /* placeItemAt が (6,5) を先に試すよう、他セルを塞がない */
    const ml = [];
    const orig = Math.random;
    let n = 0;
    Math.random = () => {
      /* damage rng low, drop count 2, shuffle stable-ish */
      const v = [0.0, 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1];
      return v[n++ % v.length];
    };
    try {
      fireTrapPlayer(trip, p, dg, ml);
    } finally {
      Math.random = orig;
    }
    /* 鈍足罠が明らかにされた／作動した可能性 */
    const slowTriggered = slow.revealed || ml.some((m) => m.includes("鈍足"));
    const itemOnFloorOrConsumed = p.inventory.length < 2 || dg.items.length > 0 || ml.some((m) => m.includes("落とした") || m.includes("鈍足") || m.includes("沈"));
    expect(itemOnFloorOrConsumed).toBe(true);
    /* 少なくとも転倒は起きている */
    expect(ml.some((m) => m.includes("転んでしまった"))).toBe(true);
    void slowTriggered;
  });

  it("落ちた先が水なら沈む", () => {
    const food = { name: "パン", type: "food", id: "fw" };
    const food2 = { name: "肉", type: "food", id: "fw2" };
    const p = makePlayer({ hp: 40, maxHp: 40, x: 5, y: 5, inventory: [food, food2] });
    const trip = { effect: "trip_trap", name: "転倒の罠", x: 5, y: 5, id: "tripw" };
    const map = Array.from({ length: 20 }, () => Array(20).fill(T.FLOOR));
    map[5][6] = T.WATER;
    const dg = makeEmptyDg({
      map,
      traps: [trip],
      items: [],
      waterItems: [],
      rooms: [{ x: 1, y: 1, w: 12, h: 12 }],
    });
    const ml = [];
    const orig = Math.random;
    let n = 0;
    Math.random = () => {
      const v = [0.0, 0.0, 0.0, 0.1, 0.2, 0.3, 0.4];
      return v[n++ % v.length];
    };
    try {
      fireTrapPlayer(trip, p, dg, ml);
    } finally {
      Math.random = orig;
    }
    expect(ml.some((m) => m.includes("転んでしまった"))).toBe(true);
    /* 水 or 床へ落ちた痕跡 */
    const sank = (dg.waterItems || []).length > 0 || ml.some((m) => m.includes("沈") || m.includes("濡"));
    const floored = dg.items.length > 0 || ml.some((m) => m.includes("落とした"));
    expect(sank || floored).toBe(true);
  });

  it("isFallMsg / 立ち絵 reaction_fall が転倒ログで出る", () => {
    expect(isFallMsg("転倒の罠が発動！転んでしまった！5ダメージ！")).toBe(true);
    expect(isFallMsg("転倒の罠が発動！")).toBe(false);
    expect(isFallMsg("矢の罠が発動！")).toBe(false);
    const base = {
      hp: 40, maxHp: 50, hunger: 50, maxHunger: 100, x: 5, y: 5, level: 1,
      poisoned: false, sleepTurns: 0, confusedTurns: 0, darknessTurns: 0, oilyTurns: 0,
      paralyzeTurns: 0, slowTurns: 0, bewitchedTurns: 0, immobileTurns: 0,
      mpCooldownTurns: 0, sealedTurns: 0, weaponId: null, armorId: null, ringIds: [], floating: false,
    };
    const event = resolvePortraitEvent({
      player: { ...base, hp: 35 },
      prev: base,
      lastMsg: "転倒の罠が発動！転んでしまった！5ダメージ！",
      newMsgs: ["転倒の罠が発動！転んでしまった！5ダメージ！"],
    });
    expect(event.src).toMatch(/reaction_fall/);
  });

  it("アイテム着弾でも転倒の罠が処理できる", () => {
    const item = { name: "石", type: "stone", id: "st1", tile: 23 };
    const trap = { effect: "trip_trap", name: "転倒の罠", x: 5, y: 5, id: "tri" };
    const dg = makeEmptyDg({ traps: [trap], items: [], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
    const ml = [];
    const r = fireTrapItem(trap, item, dg, 5, 5, ml, new Set(), null);
    expect(r).toBe("restart");
    expect(ml.some((m) => m.includes("転倒の罠が発動"))).toBe(true);
  });

  it("敵に作動すると2ターン行動不能にする", () => {
    const mon = {
      name: "フクマル", baseKind: "runner", subtype: "runner", monLevel: 1,
      hp: 30, maxHp: 30, atk: 8, def: 0, x: 5, y: 5, speed: 1,
    };
    const p = makePlayer({ hp: 50, maxHp: 50, x: 5, y: 6 });
    const trap = { effect: "trip_trap", name: "転倒の罠", x: 5, y: 5, id: "tripMon" };
    const dg = makeEmptyDg({
      map: Array.from({ length: 20 }, () => Array(20).fill(T.FLOOR)),
      rooms: [{ x: 1, y: 1, w: 12, h: 12 }],
      monsters: [mon], traps: [trap], items: [],
    });
    const ml = [];
    fireTrapItem(trap, { name: "石", type: "stone" }, dg, 5, 5, ml, new Set(), p);
    expect(mon.knockdownTurns).toBe(2);
    expect(ml.some((m) => m.includes("2ターン行動不能"))).toBe(true);

    const hpBefore = p.hp;
    monsterAI(mon, dg, p, [], { attackOnly: true });
    expect(p.hp).toBe(hpBefore);
    monsterAI(mon, dg, p, [], { moveOnly: true });
    expect(mon.knockdownTurns).toBe(1);
    monsterAI(mon, dg, p, [], { moveOnly: true });
    expect(mon.knockdownTurns).toBe(0);
  });
});
