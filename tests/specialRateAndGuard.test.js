import { describe, expect, it, vi } from "vitest";
import { MONS, BOSSES, makeMonsterFromBase, makeGuard, monsterAI } from "../monsters.js";
import { applyPotionEffect, fireTrapItem } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeVisible() {
  return Array.from({ length: 30 }, () => Array(60).fill(true));
}

describe("特技発動率と警備員の暗闇耐性", () => {
  it("シオンは射程内の一直線上なら必ず銃撃する", () => {
    const sionBase = BOSSES.find((monster) => monster.baseKind === "boss_darkbullet");
    const sion = makeMonsterFromBase(sionBase, 1, 5, 5, { aware: true });
    sion.turnAttacks = 0;
    const player = makePlayer({ x: 8, y: 5 });
    const dg = makeEmptyDg({
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
      monsters: [sion],
      visible: makeVisible(),
    });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      monsterAI(sion, dg, player, messages, { moveOnly: true });
      expect(sion._rangedAttackThisTurn).toBe(true);
      monsterAI(sion, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }
    expect(player.hp).toBeLessThan(player.maxHp);
    expect(messages.some((message) => message.includes("銃撃した"))).toBe(true);
  });

  it("防御半減魔法は15%判定で発動する", () => {
    const defhalfBase = MONS.find((monster) => monster.subtype === "defhalf");
    const caster = makeMonsterFromBase(defhalfBase, 1, 5, 5, { aware: true });
    caster.turnAttacks = 0;
    const player = makePlayer({ x: 8, y: 5 });
    const dg = makeEmptyDg({
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
      monsters: [caster],
      visible: makeVisible(),
    });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.14);
    try {
      monsterAI(caster, dg, player, messages, { moveOnly: true });
    } finally {
      random.mockRestore();
    }
    expect(caster._defHalfMagicReady).toBe(true);
  });

  it.each([2, 3])("ボルガLv%dは50%で自爆する", (level) => {
    const bombBase = MONS.find((monster) => monster.baseKind === "bombgoblin");
    const bomb = makeMonsterFromBase(bombBase, level, 5, 5, { aware: true });
    bomb.turnAttacks = 0;
    const player = makePlayer({ x: 6, y: 5 });
    const dg = makeEmptyDg({ monsters: [bomb] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.49);
    try {
      monsterAI(bomb, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }
    expect(dg.monsters).not.toContain(bomb);
    expect(messages.some((message) => message.includes("自爆"))).toBe(true);
  });

  it("警備員は杖・薬・暗闇の罠の暗闇を受けない", () => {
    const p = makePlayer();
    const guard = makeGuard(5, 5, p.x, p.y);
    const dg = makeEmptyDg({ monsters: [guard] });
    const wandMessages = [];
    applyWandEffect("darkness", "monster", guard, 1, 0, dg, p, wandMessages, () => {});
    expect(guard.darknessTurns).toBeUndefined();

    const potionMessages = [];
    applyPotionEffect("darkness", 20, "monster", guard, dg, p, potionMessages, () => {});
    expect(guard.darknessTurns).toBeUndefined();

    const trap = { effect: "darkness_trap", name: "暗闇の罠", x: 5, y: 5 };
    const trapMessages = [];
    fireTrapItem(trap, { name: "石", type: "stone" }, dg, 5, 5, trapMessages, new Set(), p);
    expect(guard.darknessTurns).toBeUndefined();
    expect([...wandMessages, ...potionMessages, ...trapMessages].filter((message) => message.includes("暗闇が効かなかった"))).toHaveLength(3);
  });
});
