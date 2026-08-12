import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { killMonster } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("拾い投げ", () => {
  it("隣接していない間は床アイテムへ向かい、アイテムの上で拾う", () => {
    const base = MONS.find((m) => m.baseKind === "itemThrower");
    const thrower = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const item = { id: "floor-item", name: "短剣", type: "weapon", atk: 3, x: 5, y: 6 };
    const dg = makeEmptyDg({ rooms: [{ x: 2, y: 2, w: 7, h: 7 }], items: [item], monsters: [thrower] });
    const player = makePlayer({ x: 5, y: 12 });
    const messages = [];

    monsterAI(thrower, dg, player, messages, { moveOnly: true });
    monsterAI(thrower, dg, player, messages, { moveOnly: true });

    expect(thrower.carriedItem).toMatchObject({ id: item.id, name: item.name });
    expect(dg.items).not.toContain(item);
    expect(messages.join(" ")).toContain("拾った");
  });

  it("所持したアイテムが一直線上のプレイヤーに投げられる", () => {
    const base = MONS.find((m) => m.baseKind === "itemThrower");
    const thrower = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    thrower.turnAttacks = 0;
    thrower.carriedItem = { id: "held-item", name: "短剣", type: "weapon", atk: 3 };
    const player = makePlayer({ x: 5, y: 8, def: 0 });
    const dg = makeEmptyDg({ rooms: [], monsters: [thrower] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);

    try {
      monsterAI(thrower, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(thrower.carriedItem).toBeUndefined();
    expect(player.hp).toBeLessThan(100);
    expect(messages.join(" ")).toContain("投げつけてきた");
  });

  it("投げる前に倒されると所持アイテムを落とす", () => {
    const base = MONS.find((m) => m.baseKind === "itemThrower");
    const thrower = makeMonsterFromBase(base, 1, 5, 5);
    thrower.carriedItem = { id: "held-item", name: "短剣", type: "weapon", atk: 3 };
    const dg = makeEmptyDg({ rooms: [], monsters: [thrower] });
    const messages = [];

    killMonster(thrower, dg, makePlayer(), messages, null, true);

    expect(thrower.carriedItem).toBeUndefined();
    expect(dg.items.some((item) => item.id === "held-item")).toBe(true);
  });

  it("同じ部屋のアイテムだけを対象にし、別室へは向かわない", () => {
    const base = MONS.find((m) => m.baseKind === "itemThrower");
    const thrower = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const sameRoomItem = { id: "same-room", name: "同室の短剣", type: "weapon", atk: 3, x: 5, y: 6 };
    const otherRoomItem = { id: "other-room", name: "別室の短剣", type: "weapon", atk: 3, x: 22, y: 3 };
    const dg = makeEmptyDg({
      rooms: [
        { x: 2, y: 2, w: 7, h: 7 },
        { x: 20, y: 2, w: 7, h: 7 },
      ],
      items: [sameRoomItem, otherRoomItem],
      monsters: [thrower],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    const player = makePlayer({ x: 5, y: 12 });
    const messages = [];

    monsterAI(thrower, dg, player, messages, { moveOnly: true });
    monsterAI(thrower, dg, player, messages, { moveOnly: true });

    expect(thrower.carriedItem).toMatchObject({ id: sameRoomItem.id });
    expect(dg.items).toContain(otherRoomItem);
  });

  it("店の商品は拾わない", () => {
    const base = MONS.find((m) => m.baseKind === "itemThrower");
    const thrower = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const shopItem = { id: "shop-item", name: "店の商品", type: "weapon", atk: 3, x: 5, y: 6, shopPrice: 100, _shopId: "shop-1" };
    const dg = makeEmptyDg({
      rooms: [{ x: 2, y: 2, w: 7, h: 7 }],
      items: [shopItem],
      monsters: [thrower],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    const player = makePlayer({ x: 5, y: 12 });
    const messages = [];

    monsterAI(thrower, dg, player, messages, { moveOnly: true });
    monsterAI(thrower, dg, player, messages, { moveOnly: true });

    expect(thrower.carriedItem).toBeUndefined();
    expect(dg.items).toContain(shopItem);
  });

  it("大箱に当たった投擲物は大箱へ収納する", () => {
    const base = MONS.find((m) => m.baseKind === "itemThrower");
    const thrower = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    thrower.turnAttacks = 0;
    const held = { id: "held-box-item", name: "短剣", type: "weapon", atk: 3 };
    thrower.carriedItem = held;
    const bigbox = { id: "box-1", x: 5, y: 6, kind: "normal", name: "大箱", capacity: 2, contents: [] };
    const dg = makeEmptyDg({
      rooms: [{ x: 2, y: 2, w: 7, h: 7 }],
      monsters: [thrower],
      bigboxes: [bigbox],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    const player = makePlayer({ x: 5, y: 8 });
    const messages = [];

    monsterAI(thrower, dg, player, messages, {
      attackOnly: true,
      bbFn: (bb, item) => bb.contents.push(item),
    });

    expect(thrower.carriedItem).toBeUndefined();
    expect(bigbox.contents).toContain(held);
    expect(dg.items).not.toContain(held);
  });

  it("射線上の壁に遮られた投擲物だけは地面に落ちる", () => {
    const base = MONS.find((m) => m.baseKind === "itemThrower");
    const thrower = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const held = { id: "held-wall-item", name: "短剣", type: "weapon", atk: 3 };
    thrower.turnAttacks = 0;
    thrower.carriedItem = held;
    const dg = makeEmptyDg({
      rooms: [{ x: 2, y: 2, w: 7, h: 7 }],
      monsters: [thrower],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    dg.map[6][5] = "#";
    const player = makePlayer({ x: 5, y: 8 });
    const messages = [];

    monsterAI(thrower, dg, player, messages, { attackOnly: true });

    expect(thrower.carriedItem).toBeUndefined();
    expect(dg.items.some((item) => item.id === held.id)).toBe(true);
    expect(messages.join(" ")).toContain("遮られて地面に落ちた");
  });
});
