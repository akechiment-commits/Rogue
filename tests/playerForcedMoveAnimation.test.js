import { describe, expect, it, vi } from "vitest";
import { monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { drainAnims } from "../animEvents.js";

describe("敵によるプレイヤー強制移動演出", () => {
  it("ノッカーの吹き飛ばしはスライド演出を発行する", () => {
    drainAnims();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);
    const player = makePlayer({ x: 6, y: 5 });
    const knocker = {
      name: "ノッカー", subtype: "knocker", x: 5, y: 5,
      hp: 20, maxHp: 20, atk: 3, def: 0, speed: 1, monLevel: 1,
      turnAttacks: 0, aware: true,
    };
    const dg = makeEmptyDg({
      monsters: [knocker],
      rooms: [{ x: 1, y: 1, w: 50, h: 20 }],
    });
    try {
      monsterAI(knocker, dg, player, [], { attackOnly: true });
      const ev = drainAnims().find(e => e.type === "playerKnockback");
      expect(ev).toBeDefined();
      expect(ev).toMatchObject({ fromX: 6, fromY: 5, dx: 1, dy: 0 });
      expect(ev.toX).toBeGreaterThan(ev.fromX);
    } finally {
      random.mockRestore();
    }
  });
});
