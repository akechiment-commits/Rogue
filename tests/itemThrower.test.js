import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { killMonster } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("拾い投げ", () => {
  it("隣接していない間は床アイテムへ向かい、アイテムの上で拾う", () => {
    const base = MONS.find((m) => m.baseKind === "itemThrower");
    const thrower = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const item = { id: "floor-item", name: "短剣", type: "weapon", atk: 3, x: 5, y: 6 };
    const dg = makeEmptyDg({ rooms: [], items: [item], monsters: [thrower] });
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
});
