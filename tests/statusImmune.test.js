import { describe, it, expect } from "vitest";
import { isStatusImmune, blockPlayerStatus } from "../items.js";
import { fireTrapPlayer } from "../traps.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
import { T, MW, MH } from "../utils.js";
import { monsterAI } from "../monsters.js";

describe("statusImmune (状態防止)", () => {
  it.each([1, 2, 3])("敵の状態防止は%s回行動でも移動・攻撃で二重に減らさない", (actions) => {
    const monster = { id: "immune", name: "敵", x: 6, y: 5, hp: 100, maxHp: 100,
      atk: 1, def: 0, speed: actions, aware: true, statusImmune: 10 };
    const player = makePlayer();
    const dungeon = makeEmptyDg({ monsters: [monster], rooms: [] });
    for (let i = 0; i < actions; i++) monsterAI(monster, dungeon, player, [], { moveOnly: true });
    expect(monster.statusImmune).toBe(10 - actions);
    for (let i = 0; i < actions; i++) monsterAI(monster, dungeon, player, [], { attackOnly: true });
    expect(monster.statusImmune).toBe(10 - actions);
  });

  it("状態防止の解除は移動フェーズで1回だけ通知する", () => {
    const monster = { id: "immune", name: "敵", x: 6, y: 5, hp: 100, maxHp: 100,
      atk: 1, def: 0, speed: 1, aware: true, statusImmune: 1 };
    const player = makePlayer();
    const dungeon = makeEmptyDg({ monsters: [monster], rooms: [] });
    const messages = [];
    monsterAI(monster, dungeon, player, messages, { moveOnly: true });
    monsterAI(monster, dungeon, player, messages, { attackOnly: true });
    expect(monster.statusImmune).toBe(0);
    expect(messages.filter(m => m === "敵の状態防止が切れた！")).toHaveLength(1);
  });

  it("isStatusImmune は statusImmune>0 で true", () => {
    const p = makePlayer({ statusImmune: 50 });
    const ml = [];
    expect(isStatusImmune(p, ml)).toBe(true);
    expect(ml.some((m) => /状態防止/.test(m))).toBe(true);
  });

  it("blockPlayerStatus は状態防止を優先する", () => {
    const p = makePlayer({ statusImmune: 10, armor: { ability: "confuse_proof" } });
    const ml = [];
    expect(blockPlayerStatus(p, ml, { proofAbility: "confuse_proof" })).toBe(true);
    expect(ml[0]).toMatch(/状態防止/);
  });

  it("睡眠の罠は状態防止中に睡眠を付与しない", () => {
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
    const dg = makeEmptyDg({ map, traps: [], monsters: [], items: [] });
    const p = makePlayer({ x: 5, y: 5, statusImmune: 100, sleepTurns: 0 });
    const trap = { x: 5, y: 5, effect: "sleep", name: "睡眠ガスの罠", revealed: false };
    dg.traps = [trap];
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.sleepTurns).toBe(0);
    expect(ml.some((m) => /状態防止|効かなかった/.test(m))).toBe(true);
  });

  it("混乱・鈍足の罠も状態防止中は無効", () => {
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
    const dg = makeEmptyDg({ map, traps: [], monsters: [], items: [] });
    const p = makePlayer({ x: 3, y: 3, statusImmune: 50, confusedTurns: 0, slowTurns: 0 });
    for (const effect of ["confuse_trap", "slow_trap"]) {
      p.confusedTurns = 0;
      p.slowTurns = 0;
      const trap = { x: 3, y: 3, effect, name: "罠", revealed: false };
      fireTrapPlayer(trap, p, dg, []);
      expect(p.confusedTurns).toBe(0);
      expect(p.slowTurns).toBe(0);
    }
  });
});
