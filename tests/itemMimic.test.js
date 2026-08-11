import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI, revealItemMimicAt } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { monsterAt } from "../utils.js";

describe("アイテムモドキ", () => {
  it("床アイテムの上で姿を隠し、占有判定から外れる", () => {
    const base = MONS.find((m) => m.baseKind === "itemMimic");
    const mimic = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    mimic.turnAttacks = 0;
    const item = { id: "floor-item", name: "薬", type: "potion", x: 5, y: 5 };
    const dg = makeEmptyDg({ rooms: [], items: [item], monsters: [mimic] });

    monsterAI(mimic, dg, makePlayer({ x: 20, y: 20 }), [], { moveOnly: true });

    expect(mimic.disguisedAsItem).toBe(true);
    expect(mimic.disguiseItemId).toBe(item.id);
    expect(monsterAt(dg, 5, 5)).toBeUndefined();
  });

  it("拾おうとすると正体を現し、アイテムを残したまま攻撃する", () => {
    const base = MONS.find((m) => m.baseKind === "itemMimic");
    const mimic = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    mimic.disguisedAsItem = true;
    mimic.disguiseItemId = "floor-item";
    const item = { id: "floor-item", name: "薬", type: "potion", x: 5, y: 5 };
    const player = makePlayer({ x: 5, y: 5, def: 0 });
    const dg = makeEmptyDg({ rooms: [], items: [item], monsters: [mimic] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);

    try {
      expect(revealItemMimicAt(dg, 5, 5, player, messages)).toBe(true);
    } finally {
      random.mockRestore();
    }

    expect(mimic.disguisedAsItem).toBe(false);
    expect(dg.items).toContain(item);
    expect(player.hp).toBeLessThan(100);
    expect(messages.join(" ")).toContain("正体を現した");
  });
});
