import { afterEach, describe, expect, it, vi } from "vitest";
import { fireWandBolt } from "../wands.js";
import { setPitfallBag, clearPitfallBag } from "../items.js";
import { placeFallenEntities } from "../pitfallPlacement.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

afterEach(() => { vi.restoreAllMocks(); clearPitfallBag(); });

describe("吹き飛ばされた道具の罠による消費", () => {
  it.each([
    ["杖", { type: "wand", name: "眠りの杖", effect: "sleep", charges: 3 }],
    ["保存の壺", { type: "pot", name: "保存の壺", potEffect: "none", capacity: 3,
      contents: [{ id: "stored-ring", type: "ring", name: "命の指輪", effect: "life", plus: 1 }] }],
    ["火薬壺", { type: "pot", name: "火薬壺", potEffect: "gunpowder", capacity: 3, contents: [] }],
    ["武器", { type: "weapon", name: "剣", atk: 3 }],
  ])("%sを床へ戻したり中身を散らしたりしない", (_label, template) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const moved = { ...template, id: "moved-item", x: 6, y: 5 };
    const mine = { id: "mine", name: "地雷", effect: "explode", x: 7, y: 5,
      revealed: true, permanent: true };
    const dg = makeEmptyDg({ items: [moved], traps: [mine] });
    dg.map[5][8] = T.WALL; // 地雷は通過点ではなく壁の手前の着地点。
    const p = makePlayer({ x: 5, y: 5 });
    const ml = [];

    fireWandBolt(p, dg, "knockback", 1, 0, ml, () => {});

    expect(ml.some(message => message.includes("吹き飛んだ"))).toBe(true);
    expect(ml.some(message => message.includes("地雷が発動"))).toBe(true);
    expect(dg.items).toEqual([]);
    expect(p.sleepTurns || 0).toBe(0);
    expect(p.hp).toBe(100); // 地雷の半径1から外れており、消えた火薬壺も爆発しない
  });

  it.each([
    ["杖", { type: "wand", name: "眠りの杖", effect: "sleep", charges: 3 }, "moved-item"],
    ["壺", { type: "pot", name: "保存の壺", potEffect: "none", capacity: 3,
      contents: [{ id: "stored-ring", type: "ring", name: "命の指輪", effect: "life", plus: 1 }] }, "stored-ring"],
  ])("消滅させる罠がなければ%sの通常の着地処理を行う", (_label, template, remainingId) => {
    const moved = { ...template, id: "moved-item", x: 6, y: 5 };
    const dg = makeEmptyDg({ items: [moved] });
    fireWandBolt(makePlayer(), dg, "knockback", 1, 0, [], () => {});
    expect(dg.items.map(item => item.id)).toEqual([remainingId]);
  });

  it("薬瓶が罠のマスへ着地した時の薬液処理は続ける", () => {
    const potion = { id: "potion", type: "potion", name: "回復薬", effect: "heal", value: 30, x: 6, y: 5 };
    const mine = { id: "mine", name: "地雷", effect: "explode", x: 7, y: 5, permanent: true };
    const mon = { id: "patient", name: "スライム", hp: 10, maxHp: 100, x: 7, y: 4 };
    const dg = makeEmptyDg({ items: [potion], traps: [mine], monsters: [mon] });
    dg.map[5][8] = T.WALL;
    const ml = [];
    fireWandBolt(makePlayer(), dg, "knockback", 1, 0, ml, () => {});
    expect(mon.hp).toBe(40);
    expect(ml.some(message => message.includes("瓶が割れて"))).toBe(true);
    expect(dg.items).toEqual([]);
  });

  it.each([
    ["杖", { type: "wand", name: "眠りの杖", effect: "sleep", charges: 3 }, "moved-item"],
    ["壺", { type: "pot", name: "保存の壺", potEffect: "none", capacity: 3,
      contents: [{ id: "stored-ring", type: "ring", name: "命の指輪", effect: "life", plus: 1 }] }, "stored-ring"],
  ])("落とし穴へ飛んだ%sは元の階に残らず下階へ移る", (_label, template, remainingId) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const moved = { ...template, id: "moved-item", x: 6, y: 5 };
    const trap = { id: "pitfall", name: "落とし穴", effect: "pitfall", x: 7, y: 5, permanent: true };
    const dg = makeEmptyDg({ items: [moved], traps: [trap] });
    dg.map[5][8] = T.WALL;
    const bag = [];
    setPitfallBag(bag);
    try {
      fireWandBolt(makePlayer(), dg, "knockback", 1, 0, [], () => {});
    } finally {
      clearPitfallBag();
    }
    expect(dg.items).toEqual([]);
    expect(bag).toHaveLength(1);
    expect(bag[0]).toEqual({ kind: "item", entity: moved });
    const below = makeEmptyDg();
    placeFallenEntities(below, bag, { random: () => 0 });
    expect(below.items.map(item => item.id)).toEqual([remainingId]);
  });
});
