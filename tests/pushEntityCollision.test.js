import { describe, expect, it } from "vitest";
import { pushEntity, fireTrapItem } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import "../monsters.js"; // registers monster runtime hooks

describe("pushEntity collision fixes", () => {
  it("固定ダメージのみ有効（fixedDamageOnly）なモンスターは壁激突で1ダメージに制限される", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    // x: 1, y: 2 is next to x: 0, which is T.WALL
    const metalMon = { id: "metal1", name: "アイアン", x: 1, y: 2, hp: 5, maxHp: 5, fixedDamageOnly: true, def: 0 };
    dg.monsters = [metalMon];
    const ml = [];

    pushEntity(dg, metalMon.x, metalMon.y, -1, 0, 5, ml, "monster", metalMon, p, null, 0);

    // 5ダメージではなく1ダメージ
    expect(metalMon.hp).toBe(4);
    expect(ml.some(m => m.includes("1ダメージ"))).toBe(true);
  });

  it("壁激突ダメージでキノコモンスターのカウンター胞子が発動する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 1, y: 1 });
    const mushroom = {
      id: "shroom1",
      name: "毒キノコ",
      baseKind: "mushroom",
      x: 1,
      y: 2,
      hp: 20,
      maxHp: 20,
      monLevel: 1,
      def: 0,
    };
    dg.monsters = [mushroom];
    const ml = [];

    pushEntity(dg, mushroom.x, mushroom.y, -1, 0, 5, ml, "monster", mushroom, p, null, 0);

    expect(mushroom.hp).toBe(15);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("プレイヤーに吹き飛ばされて壁に激突した店主はプレイヤーに敵対する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 3, y: 2 });
    const shopkeeper = {
      id: "shopkeeper1",
      type: "shopkeeper",
      name: "店主",
      x: 1,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 0,
      state: "neutral",
    };
    dg.monsters = [shopkeeper];
    const ml = [];

    pushEntity(dg, shopkeeper.x, shopkeeper.y, -1, 0, 5, ml, "monster", shopkeeper, p, null, 0, null);

    expect(shopkeeper.hp).toBe(95);
    expect(shopkeeper.state).toBe("hostile");
    expect(ml.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("敵に吹き飛ばされて壁に激突した店主はその敵に対して報復を開始する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    const enemy = { id: "mage1", name: "風魔道士", x: 3, y: 2, hp: 50, maxHp: 50 };
    const shopkeeper = {
      id: "shopkeeper2",
      type: "shopkeeper",
      name: "店主",
      x: 1,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 0,
      state: "neutral",
    };
    dg.monsters = [enemy, shopkeeper];
    const ml = [];

    pushEntity(dg, shopkeeper.x, shopkeeper.y, -1, 0, 5, ml, "monster", shopkeeper, p, null, 0, enemy);

    expect(shopkeeper.hp).toBe(95);
    expect(shopkeeper._npcRetaliationTargetId).toBe(enemy.id);
  });

  it("吹き飛ばしの罠の壁激突でもキノコ胞子が発動する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    const mushroom = {
      id: "shroom2",
      name: "睡眠キノコ",
      baseKind: "mushroom",
      monLevel: 2,
      x: 1,
      y: 2,
      hp: 30,
      maxHp: 30,
      dir: { x: 1, y: 0 }, // Blowback direction will be -dx: -1, 0 -> hits wall at x=0
      def: 0,
    };
    const trap = { id: "trap1", name: "吹き飛ばしの罠", effect: "blowback_trap", x: 1, y: 2 };
    dg.monsters = [mushroom];
    dg.traps = [trap];
    const ml = [];

    fireTrapItem(trap, null, dg, mushroom.x, mushroom.y, ml, new Set(), p);

    expect(mushroom.hp).toBe(20);
    expect(ml.some(m => m.includes("睡眠胞子を撒き散らした"))).toBe(true);
  });
});
