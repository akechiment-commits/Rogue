import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOAL_ITEMS } from "../dungeon.js";
import { castSpellBolt, consumeSpringCapacity, placeItemAt, soakItemIntoSpring, SPELLS } from "../items.js";
import { makeMonsterFromBase, MONS, monsterIceBreath } from "../monsters.js";
import {
  SPRING_CONFUSION_TURNS,
  SPRING_CAPACITY_MIN,
  SPRING_CAPACITY_MAX,
  createSpring,
  randSpringCapacity,
  springGoldRange,
} from "../springRules.js";
import { TI, T } from "../utils.js";
import { fireWandBolt, triggerWandBreakEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("泉の効果", () => {
  it("混乱は常に5ターン", () => {
    expect(SPRING_CONFUSION_TURNS).toBe(5);
  });

  it("泉の金貨は通常金貨の上限の約2倍まで", () => {
    expect(springGoldRange(0)).toEqual({ min: 100, max: 400 });
    expect(springGoldRange(5)).toEqual({ min: 100, max: 700 });
  });

  it.each(["氷の杖", "氷の魔法", "氷ブレス", "氷の杖の破壊"])("%sで凍った泉から道具と敵が無事に出る", (source) => {
    const potion = { id: "spring-potion", name: "水", type: "potion", effect: "water", tile: 16 };
    const goal = { ...GOAL_ITEMS.advanced, id: "spring-goal" };
    const raider = MONS.find((m) => m.baseKind === "potRaider");
    const held = makeMonsterFromBase(raider, 3, 0, 0);
    const spring = createSpring(5, 5, { capacity: 3 });
    spring.contents = [potion, goal];
    spring.confinedMonsters = [held];
    const target = makeMonsterFromBase(raider, 3, 6, 5);
    const dg = makeEmptyDg({ springs: [spring], monsters: [target] });
    const p = makePlayer({ x: source === "氷ブレス" ? 8 : 3, y: 5 });
    const ml = [];
    const noop = () => {};

    switch (source) {
      case "氷の杖":
        fireWandBolt(p, dg, "ice_wand", 1, 0, ml, noop);
        break;
      case "氷の魔法":
        castSpellBolt(p, dg, SPELLS.find((spell) => spell.id === "ice_bolt"), 1, 0, ml, noop);
        break;
      case "氷ブレス": {
        const dragon = { id: "ice-dragon", name: "氷竜", x: 3, y: 5, atk: 40, monLevel: 1 };
        dg.monsters.push(dragon);
        monsterIceBreath(dragon, dg, p, ml);
        break;
      }
      case "氷の杖の破壊":
        triggerWandBreakEffect({ type: "wand", effect: "ice_wand", charges: 4 }, spring.x, spring.y, dg, p, ml, noop);
        break;
    }

    expect(dg.springs).toHaveLength(0);
    expect(dg.items).toContain(potion);
    expect(potion).toMatchObject({ x: 5, y: 5, effect: "water" });
    expect(dg.items).toContain(goal);
    const ice = dg.items.filter((item) => item.iceChunk);
    expect(ice).toHaveLength(1);
    expect(ice[0].count).toBeGreaterThanOrEqual(5);
    expect(ice[0].count).toBeLessThanOrEqual(8);
    const released = dg.monsters.find((m) => m.baseKind === "potRaider" && m !== target);
    expect(released).toMatchObject({ x: 5, y: 5, hp: held.hp, monLevel: 3 });
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(ml).toContain(`${held.name}が現れた！`);
  });

  it("泉から飛び出すアイテムは泉の中心を避けて隣へ落とせる", () => {
    const dg = makeEmptyDg({ springs: [{ x: 5, y: 5 }] });
    const p = makePlayer({ x: 5, y: 5 });
    const item = { name: "水", type: "potion", tile: 16 };

    placeItemAt(dg, p.x, p.y, item, [], new Set(), 0, p, p.x, p.y, false, true);

    expect(dg.items).toHaveLength(1);
    expect(dg.items[0]).not.toMatchObject({ x: 5, y: 5 });
    expect(Math.max(Math.abs(dg.items[0].x - p.x), Math.abs(dg.items[0].y - p.y))).toBe(1);
    expect(dg.map[dg.items[0].y][dg.items[0].x]).toBe(T.FLOOR);
  });

  it("泉の初期容量は SPRING_CAPACITY_MIN〜SPRING_CAPACITY_MAX のランダム値になる", () => {
    expect(randSpringCapacity(() => 0)).toBe(SPRING_CAPACITY_MIN);
    expect(randSpringCapacity(() => 0.9999)).toBe(SPRING_CAPACITY_MAX);
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      const spr = createSpring(3, 4);
      expect(spr.tile).toBe(TI.SPRING);
      expect(spr.contents).toEqual([]);
      expect(spr.capacity).toBeGreaterThanOrEqual(SPRING_CAPACITY_MIN);
      expect(spr.capacity).toBeLessThanOrEqual(SPRING_CAPACITY_MAX);
      seen.add(spr.capacity);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("金貨・金塊・アイスが消滅した場合も泉の容量が減り、超過すると干上がる", () => {
    const spr = createSpring(5, 5, { capacity: 3 });
    const dg = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 10, h: 10 }], springs: [spr] });
    const p = makePlayer({ x: 3, y: 3 });
    const ml = [];

    // 1個目: 金貨（願い不発・射出なし） -> 消えて容量が 3 -> 2 に減る
    const goldRes = soakItemIntoSpring(
      spr,
      { id: "g1", name: "100枚の金貨", type: "gold", value: 100 },
      ml,
      dg,
      null,
      p,
      { rngFn: () => 0.99 },
    );
    expect(goldRes.dried).toBe(false);
    expect(spr.contents).toHaveLength(0);
    expect(spr.capacity).toBe(2);

    // 2個目: 偽金塊 -> 消えて容量が 2 -> 1 に減る
    const nuggetRes = soakItemIntoSpring(
      spr,
      { id: "n1", name: "金塊", type: "gold_nugget", isFake: true },
      ml,
      dg,
      null,
      p,
      { rngFn: () => 0.99 },
    );
    expect(nuggetRes.dried).toBe(false);
    expect(spr.capacity).toBe(1);

    // 3個目: アイス -> 溶けて消え、容量が 1 -> 0 に減る（まだ干上がらない）
    const iceRes = soakItemIntoSpring(
      spr,
      { id: "ic1", name: "バニラアイス", type: "food", iceCream: true },
      ml,
      dg,
      null,
      p,
    );
    expect(iceRes.dried).toBe(false);
    expect(spr.capacity).toBe(0);
    expect(dg.springs).toContain(spr);

    // 4個目: 金貨で容量超過 -> 干上がる（中身が空なので飛び出しメッセージは出さない）
    const overflowRes = soakItemIntoSpring(
      spr,
      { id: "g2", name: "100枚の金貨", type: "gold", value: 100 },
      ml,
      dg,
      null,
      p,
      { rngFn: () => 0.99 },
    );
    expect(overflowRes.dried).toBe(true);
    expect(dg.springs).toHaveLength(0);
    expect(ml.some((m) => m.includes("中のアイテムが飛び出した"))).toBe(false);
    expect(ml).toContain("泉は干上がってしまった...");
  });

  it("通常アイテムと消滅アイテムの混在でも合計が初期容量を超えると干上がって中身が出る", () => {
    const spr = createSpring(5, 5, { capacity: 3 });
    const dg = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 10, h: 10 }], springs: [spr] });
    const p = makePlayer({ x: 3, y: 3 });
    const ml = [];

    // 1個目: 通常アイテム（contents 1, capacity 3）
    soakItemIntoSpring(spr, { id: "s1", name: "石", type: "arrow", stone: true, count: 1 }, ml, dg, null, p);
    // 2個目: 金貨（contents 1, capacity 2）
    soakItemIntoSpring(spr, { id: "g1", name: "100枚の金貨", type: "gold", value: 100 }, ml, dg, null, p, { rngFn: () => 0.99 });
    // 3個目: 通常アイテム（contents 2, capacity 2 -> 満杯）
    const third = soakItemIntoSpring(spr, { id: "s2", name: "石", type: "arrow", stone: true, count: 1 }, ml, dg, null, p);
    expect(third.dried).toBe(false);
    expect(spr.contents).toHaveLength(2);
    expect(spr.capacity).toBe(2);

    // 4個目: 金貨（満杯状態で投入 -> 容量超過で干上がり、中の石2個が出る）
    const fourth = soakItemIntoSpring(spr, { id: "g2", name: "100枚の金貨", type: "gold", value: 100 }, ml, dg, null, p, { rngFn: () => 0.99 });
    expect(fourth.dried).toBe(true);
    expect(dg.springs).toHaveLength(0);
    expect(dg.items.length).toBeGreaterThanOrEqual(2);
    expect(ml).toContain("泉が干上がった！中のアイテムが飛び出した！");
  });

  it("飲む・浸す（consumeSpringCapacity）でも同じ容量を消費し、規定回数超過で干上がる", () => {
    const spr = createSpring(5, 5, { capacity: 3 });
    const dg = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 10, h: 10 }], springs: [spr] });
    const p = makePlayer({ x: 3, y: 3 });
    const ml = [];

    // 1回目: アイテムを入れて1枠使う（contents 1, capacity 3）
    soakItemIntoSpring(spr, { id: "s1", name: "石", type: "arrow", stone: true, count: 1 }, ml, dg, null, p);
    expect(dg.springs).toHaveLength(1);

    // 2回目: 飲む（または浸す）で残り容量が減る（contents 1, capacity 2）
    expect(consumeSpringCapacity(spr, dg, ml, p)).toBe(false);
    expect(spr.capacity).toBe(2);
    expect(dg.springs).toHaveLength(1);

    // 3回目: もう一度飲む（contents 1, capacity 1 -> 満杯）
    expect(consumeSpringCapacity(spr, dg, ml, p)).toBe(false);
    expect(spr.capacity).toBe(1);
    expect(dg.springs).toHaveLength(1);

    // 4回目: 満杯状態で飲むと干上がり、中に入っていた石が出る
    expect(consumeSpringCapacity(spr, dg, ml, p)).toBe(true);
    expect(dg.springs).toHaveLength(0);
    expect(dg.items.length).toBeGreaterThanOrEqual(1);
    expect(ml).toContain("泉が干上がった！中のアイテムが飛び出した！");
  });

  it("Game.jsx の泉飲用は満腹度限界超過時に飲めず、ランダム25%ではなく共通容量を消費する", () => {
    const gameSrc = readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
    const drinkBlockMatch = gameSrc.match(/const springDrink = useCallback\(\(\) => \{[\s\S]*?\}, \[endTurn, consumeActiveSpring, resolveActiveSpring\]\);/);
    expect(drinkBlockMatch).not.toBeNull();
    const drinkBlock = drinkBlockMatch[0];
    expect(drinkBlock).toContain("Number(p.hunger) || 0) > Number(p.maxHunger ?? 100)");
    expect(drinkBlock).toContain("満腹度が限界を超えていて、飲めない！");
    expect(drinkBlock).toContain("consumeActiveSpring(dg, p, ml)");
    expect(gameSrc).not.toContain("springTryDry");
  });
});
