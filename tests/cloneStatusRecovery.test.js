import { describe, expect, it } from "vitest";
import { applySpellEffect, makePlayerClone } from "../items.js";
import { monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function setup(status = {}) {
  const player = makePlayer({ atk: 20, def: 10 });
  const clone = Object.assign(makePlayerClone(player, 6, 5, 30), status);
  const enemy = { name: "敵", x: 7, y: 5, hp: 1000, maxHp: 1000, def: 0, exp: 0 };
  return { player, clone, enemy, dungeon: makeEmptyDg({ monsters: [clone, enemy] }), messages: [] };
}

// Game.jsxと同じ移動・攻撃フェーズ。起床した拍は攻撃をスキップする。
function turn({ clone, dungeon, player, messages }) {
  clone.turnAttacks = 0;
  monsterAI(clone, dungeon, player, messages, { moveOnly: true });
  if (!clone._movedThisTurn) monsterAI(clone, dungeon, player, messages, { attackOnly: true });
  delete clone._movedThisTurn;
}

describe("分身の状態異常解除", () => {
  it("魔法で眠った分身は指定時間後に起き、次の拍から戦闘を再開する", () => {
    const state = setup();
    applySpellEffect("sleep_bolt", "monster", state.clone, 1, 0, state.dungeon, state.player, state.messages, () => {});
    const duration = state.clone.sleepTurns;
    expect(duration).toBeGreaterThan(0);
    for (let i = duration; i > 0; i--) {
      turn(state);
      expect(state.clone.sleepTurns).toBe(i - 1);
      expect(state.enemy.hp).toBe(1000);
    }
    turn(state);
    expect(state.enemy.hp).toBeLessThan(1000);
    expect(state.messages.filter(m => m === "分身の睡眠が解けた！")).toHaveLength(1);
  });

  it("転倒も攻撃フェーズと二重に減らさず、起き上がってから再行動する", () => {
    const state = setup({ knockdownTurns: 2 });
    turn(state);
    expect(state.clone.knockdownTurns).toBe(1);
    turn(state);
    expect(state.clone.knockdownTurns).toBe(0);
    expect(state.enemy.hp).toBe(1000);
    turn(state);
    expect(state.enemy.hp).toBeLessThan(1000);
  });

  it("移動封じ中も隣接敵を攻撃でき、時間経過で移動を再開する", () => {
    const state = setup({ immobileTurns: 3 });
    turn(state);
    expect(state.clone).toMatchObject({ x: 6, y: 5, immobileTurns: 2 });
    expect(state.enemy.hp).toBeLessThan(1000);
    state.enemy.x = 10;
    turn(state);
    expect(state.clone).toMatchObject({ x: 6, y: 5, immobileTurns: 1 });
    turn(state);
    expect(state.clone).toMatchObject({ x: 6, y: 5, immobileTurns: 0 });
    turn(state);
    expect(state.clone.x).toBeGreaterThan(6);
  });

  it("金縛りは時間だけでは解除せず、被ダメージで解除する", () => {
    const state = setup({ paralyzed: true, _paralyzeHp: 50, paralyzeTurns: 6 });
    turn(state);
    expect(state.clone.paralyzed).toBe(true);
    expect(state.enemy.hp).toBe(1000);
    state.clone.hp--;
    turn(state);
    expect(state.clone.paralyzed).toBe(false);
    expect(state.enemy.hp).toBe(1000);
    turn(state);
    expect(state.enemy.hp).toBeLessThan(1000);
  });
});
