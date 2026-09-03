import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeVisible() {
  return Array.from({ length: 30 }, () => Array(60).fill(true));
}

describe("大蛇の毒牙", () => {
  it("近接攻撃が命中すると毒薬と同じ毒を付与する", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const base = MONS.find((monster) => monster.baseKind === "serpent");
      const snake = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
      snake.turnAttacks = 0;
      const player = makePlayer({ x: 6, y: 5, atk: 8, hp: 100, maxHp: 100 });
      const dg = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
        monsters: [snake],
        visible: makeVisible(),
      });
      const messages = [];
      monsterAI(snake, dg, player, messages, { attackOnly: true });
      expect(player.poisoned).toBe(true);
      expect(player.poisonedTurns).toBeGreaterThan(0);
      expect(player.atk).toBe(7);
      expect(messages.some((msg) => msg.includes("牙に毒"))).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  it("封印中は毒を付与しない", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const base = MONS.find((monster) => monster.baseKind === "serpent");
      const snake = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
      snake.sealed = true;
      snake.turnAttacks = 0;
      const player = makePlayer({ x: 6, y: 5, atk: 8, hp: 100, maxHp: 100 });
      const dg = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
        monsters: [snake],
        visible: makeVisible(),
      });
      monsterAI(snake, dg, player, [], { attackOnly: true });
      expect(player.poisoned).toBeFalsy();
      expect(player.atk).toBe(8);
    } finally {
      random.mockRestore();
    }
  });
});
