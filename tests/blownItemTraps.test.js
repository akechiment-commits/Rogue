import { afterEach, describe, expect, it, vi } from "vitest";
import { applyWandEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());
const items = [
  { type: "weapon", name: "短剣", atk: 3 },
  { type: "pot", name: "保存の壺", potEffect: "preserve", capacity: 3, contents: [] },
  { type: "potion", name: "毒薬", effect: "poison", value: 3 },
  { type: "wand", name: "眠りの杖", effect: "sleep", charges: 0 },
];

describe("杖で吹き飛ばされた道具の罠通過", () => {
  for (const enemySource of [false, true]) {
    for (const item of items) {
      it.each(["pitfall", "explode", "rust"])(`${enemySource ? "敵" : "プレイヤー"}が飛ばした${item.name}は途中の%sを通過する`, effect => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        const moved = { id: "moved", ...structuredClone(item), x: 7, y: 5 };
        const trap = { id: "path-trap", name: "途中の罠", effect, x: 8, y: 5, permanent: true, revealed: false };
        const caster = { id: "caster", name: "敵", x: 5, y: 5, hp: 30, maxHp: 30 };
        const player = makePlayer({ x: 10, y: 5, atk: 10 });
        const dg = makeEmptyDg({ rooms: [], items: [moved], traps: [trap], monsters: enemySource ? [caster] : [] });
        const messages = [];
        applyWandEffect("knockback", "item", moved, 1, 0, dg, player, messages, () => {}, null, 1, null, 0, enemySource ? caster : null, null, !enemySource);
        expect(trap.revealed).toBe(false);
        expect(messages.join(" ")).not.toContain("途中の罠");
        if (item.type === "potion") expect(player.poisonedTurns).toBeGreaterThan(0);
        else if (item.type === "wand") expect(player.sleepTurns).toBeGreaterThan(0);
        else expect(player.hp).toBeLessThan(100);
      });
    }
  }
});
