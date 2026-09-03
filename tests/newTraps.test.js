import { existsSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import {
  TRAPS, fireTrapItem, trapStepBreakChance,
  raiseSpeedOneStage, applyUnequipTrapToMonster,
} from "../items.js";
import "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T, MW, MH } from "../utils.js";
import { TILE_NAMES } from "../render.js";

function bigRoomDg(extra = {}) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
  const rooms = [{ x: 1, y: 1, w: 20, h: 12 }];
  return makeEmptyDg({ map, rooms, ...extra });
}

describe("新罠の定義", () => {
  it("4種が TRAPS にあり、罠の罠と道具魔物化は必ず壊れる", () => {
    for (const effect of ["trap_trap", "item_monster_trap", "haste_trap", "unequip_trap"]) {
      const t = TRAPS.find((x) => x.effect === effect);
      expect(t, effect).toBeTruthy();
      expect(t.weight).toBeGreaterThan(0);
    }
    expect(trapStepBreakChance({ effect: "trap_trap" })).toBe(1);
    expect(trapStepBreakChance({ effect: "item_monster_trap" })).toBe(1);
    expect(trapStepBreakChance({ effect: "haste_trap" })).toBe(0.25);
  });

  it("4種に16x16マップタイルとTILE_NAMESがある", () => {
    const names = {
      trap_trap: 210,
      trap_item_monster: 211,
      trap_haste: 212,
      trap_unequip: 213,
    };
    for (const [name, id] of Object.entries(names)) {
      expect(TILE_NAMES[id]).toBe(name);
      expect(existsSync(`public/tiles/${name}.png`)).toBe(true);
      expect(TRAPS.find((x) => x.tile === id)?.effect).toBeTruthy();
    }
  });
});

describe("罠の罠", () => {
  it("同じフロアに新しい罠を置き、自分自身は出さず必ず壊れる", () => {
    const p = makePlayer({ x: 2, y: 2 });
    const trap = { effect: "trap_trap", name: "罠の罠", x: 2, y: 2, id: "tt1" };
    const dg = bigRoomDg({ traps: [trap], monsters: [], items: [] });
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(dg.traps.some((t) => t.id === "tt1")).toBe(false);
    expect(dg.traps.length).toBeGreaterThanOrEqual(12);
    expect(dg.traps.every((t) => t.effect !== "trap_trap")).toBe(true);
    expect(ml.some((m) => m.includes("大量"))).toBe(true);
  });
});

describe("道具魔物化の罠", () => {
  it("同じ部屋の床アイテムをモンスターに変え、店の商品は残す", () => {
    const p = makePlayer({ x: 2, y: 2, depth: 3 });
    const food = { id: "f1", name: "パン", type: "food", x: 4, y: 4 };
    const shopItem = { id: "s1", name: "回復薬", type: "potion", x: 5, y: 5, shopId: "shop" };
    const trap = { effect: "item_monster_trap", name: "道具魔物化の罠", x: 2, y: 2, id: "im1" };
    const dg = bigRoomDg({ traps: [trap], items: [food, shopItem], monsters: [] });
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(dg.items.some((i) => i.id === "f1")).toBe(false);
    expect(dg.items.some((i) => i.id === "s1")).toBe(true);
    expect(dg.monsters.length).toBeGreaterThanOrEqual(1);
    expect(dg.traps.some((t) => t.id === "im1")).toBe(false);
  });
});

describe("加速の罠", () => {
  it("プレイヤーが踏むと部屋の敵が1段階加速する", () => {
    const p = makePlayer({ x: 2, y: 2 });
    const mon = { id: "m1", name: "ネズミ", x: 4, y: 4, hp: 10, speed: 1 };
    const trap = { effect: "haste_trap", name: "加速の罠", x: 2, y: 2, id: "h1" };
    const dg = bigRoomDg({ traps: [trap], monsters: [mon] });
    fireTrapPlayer(trap, p, dg, []);
    expect(mon.speed).toBe(2);
    expect(p.hasteTurns || 0).toBe(0);
  });

  it("敵が踏むと、同じ部屋のプレイヤーが加速する", () => {
    const p = makePlayer({ x: 3, y: 3 });
    const mon = { id: "m1", name: "ネズミ", x: 5, y: 5, hp: 10, atk: 5, speed: 1 };
    const trap = { effect: "haste_trap", name: "加速の罠", x: 5, y: 5, id: "h2" };
    const dg = bigRoomDg({ traps: [trap], monsters: [mon] });
    fireTrapItem(trap, { name: "重力の力", type: "misc", _ephemeralTrapTrigger: true }, dg, 5, 5, [], new Set(), p);
    expect(p.hasteTurns).toBeGreaterThan(0);
    expect(mon.speed).toBe(1);
  });

  it("第三者の発動では部屋の全員が加速する", () => {
    const p = makePlayer({ x: 3, y: 3 });
    const mon = { id: "m1", name: "ネズミ", x: 6, y: 6, hp: 10, speed: 1 };
    const trap = { effect: "haste_trap", name: "加速の罠", x: 8, y: 8, id: "h3" };
    const dg = bigRoomDg({ traps: [trap], monsters: [mon] });
    fireTrapItem(trap, { name: "石", type: "misc" }, dg, 8, 8, [], new Set(), p);
    expect(mon.speed).toBe(2);
    expect(p.hasteTurns).toBeGreaterThan(0);
  });

  it("速度段階は 0.5→1→2→3", () => {
    const m = { speed: 0.5 };
    expect(raiseSpeedOneStage(m)).toBe(true);
    expect(m.speed).toBe(1);
    raiseSpeedOneStage(m);
    expect(m.speed).toBe(2);
    raiseSpeedOneStage(m);
    expect(m.speed).toBe(3);
    expect(raiseSpeedOneStage(m)).toBe(false);
  });
});

describe("装備外しの罠", () => {
  it("プレイヤーの装備を1つ外し、インベントリには残る", () => {
    const sword = { id: "w1", name: "短剣", type: "weapon", plus: 0 };
    const p = makePlayer({ x: 5, y: 5, weapon: sword, inventory: [sword] });
    const trap = { effect: "unequip_trap", name: "装備外しの罠", x: 5, y: 5, id: "u1" };
    const dg = bigRoomDg({ traps: [trap] });
    const ml = [];
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      fireTrapPlayer(trap, p, dg, ml);
    } finally {
      rnd.mockRestore();
    }
    expect(p.weapon).toBeNull();
    expect(p.inventory).toContain(sword);
    expect(ml.some((m) => m.includes("装備が外れた"))).toBe(true);
  });

  it("護盗の鎧で防げる", () => {
    const sword = { id: "w1", name: "短剣", type: "weapon" };
    const armor = { id: "a1", name: "護盗の鎧", type: "armor", ability: "anti_steal" };
    const p = makePlayer({ x: 5, y: 5, weapon: sword, armor, inventory: [sword, armor] });
    const trap = { effect: "unequip_trap", name: "装備外しの罠", x: 5, y: 5, id: "u2" };
    const dg = bigRoomDg({ traps: [trap] });
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.weapon).toBe(sword);
    expect(p.armor).toBe(armor);
    expect(ml.some((m) => m.includes("護盗"))).toBe(true);
  });

  it("敵が踏むと攻撃力と防御力が下がり、重ねがけできる", () => {
    const mon = { id: "m1", name: "ネズミ", x: 5, y: 5, hp: 10, atk: 10, def: 6 };
    applyUnequipTrapToMonster(mon, []);
    expect(mon.atk).toBe(8);
    expect(mon.def).toBe(4);
    applyUnequipTrapToMonster(mon, []);
    expect(mon.atk).toBe(6);
    expect(mon.def).toBe(2);
    const trap = { effect: "unequip_trap", name: "装備外しの罠", x: 5, y: 5, id: "u3" };
    const dg = bigRoomDg({ traps: [trap], monsters: [mon] });
    fireTrapItem(trap, { name: "石", type: "misc" }, dg, 5, 5, [], new Set(), makePlayer({ x: 1, y: 1 }));
    expect(mon.atk).toBe(4);
    expect(mon.def).toBe(0);
  });
});
