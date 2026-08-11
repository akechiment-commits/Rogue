import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("夢喰い", () => {
  it("眠っている敵を起こして夢を喰らい、自身のHPを回復する", () => {
    const base = MONS.find((m) => m.baseKind === "dreamEater");
    const eater = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const sleeper = { id: "sleeper", name: "眠る敵", hp: 30, maxHp: 50, sleepTurns: 4, x: 7, y: 5 };
    eater.hp = 10;
    const dg = makeEmptyDg({ rooms: [], monsters: [eater, sleeper] });
    const messages = [];

    monsterAI(eater, dg, makePlayer({ x: 20, y: 20 }), messages, { attackOnly: true });

    expect(sleeper.sleepTurns).toBe(0);
    expect(sleeper._justWoke).toBe(true);
    expect(eater.hp).toBeGreaterThan(10);
    expect(messages.join(" ")).toContain("夢を喰らって");
  });

  it("睡眠中のプレイヤーには2倍打撃を行い、与えた分だけHPを吸収する", () => {
    const base = MONS.find((m) => m.baseKind === "dreamEater");
    const eater = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    eater.hp = 10;
    eater.turnAttacks = 0;
    const player = makePlayer({ x: 6, y: 5, def: 0, sleepTurns: 4 });
    const dg = makeEmptyDg({ rooms: [], monsters: [eater] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);

    try {
      monsterAI(eater, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(player.hp).toBeLessThan(100);
    expect(eater.hp).toBeGreaterThan(10);
    expect(player.sleepTurns).toBe(0);
    expect(messages.join(" ")).toContain("夢喰い攻撃");
    expect(messages.join(" ")).toContain("吸収した");
  });
});
