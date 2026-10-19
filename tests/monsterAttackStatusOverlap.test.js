import { afterEach, describe, expect, it, vi } from "vitest";
import { makePlayerClone } from "../items.js";
import { monsterAI } from "../monsters.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

function setup(clone, status) {
  const player = makePlayer({ x: 2, y: 2, atk: 20 });
  const attacker = { ...makePlayerClone(player, 6, 5), ...status };
  if (!clone) delete attacker.isPlayerClone;
  const victim = { name: "隣の敵", x: 7, y: 5, hp: 100, maxHp: 100, def: 0 };
  const dungeon = makeEmptyDg({ monsters: [attacker, victim] });
  return { player, attacker, victim, dungeon };
}

function turn({ attacker, dungeon, player }) {
  attacker.turnAttacks = 0;
  monsterAI(attacker, dungeon, player, [], { moveOnly: true });
  if (!attacker._movedThisTurn) monsterAI(attacker, dungeon, player, [], { attackOnly: true });
  delete attacker._movedThisTurn;
}

describe.each([false, true])("状態が重なった近接攻撃（分身=%s）", clone => {
  it.each(["confusedTurns", "darknessTurns"])("攻撃封印中は%sでも他の敵を殴らない", key => {
    // 混乱の乱数方向も暗闇の直進方向も、右隣の敵へ向ける。
    vi.spyOn(Math, "random").mockReturnValue(0.13);
    const state = setup(clone, { [key]: 3, darkDir: [1, 0], attackSealTurns: 3 });
    turn(state);
    expect(state.victim.hp).toBe(100);
    expect(state.attacker.attackSealTurns).toBe(2);
  });

  it.each(["confusedTurns", "darknessTurns"])("封印がなければ%sの隣接攻撃が当たり、回数上限も守る", key => {
    vi.spyOn(Math, "random").mockReturnValue(0.13);
    const state = setup(clone, { [key]: 3, darkDir: [1, 0] });
    turn(state);
    const hp = state.victim.hp;
    expect(hp).toBeLessThan(100);
    expect(state.attacker.turnAttacks).toBe(1);
    monsterAI(state.attacker, state.dungeon, state.player, [], { attackOnly: true });
    expect(state.victim.hp).toBe(hp);
  });

  it("平和主義中は周囲が塞がっても攻撃しない", () => {
    const state = setup(clone, { pacifistTurns: 3 });
    for (let y = 4; y <= 6; y++) {
      for (let x = 5; x <= 7; x++) state.dungeon.map[y][x] = T.WALL;
    }
    state.dungeon.map[5][6] = T.FLOOR;
    state.dungeon.map[5][7] = T.FLOOR;
    state.player.x = 5;
    state.player.y = 5;
    state.dungeon.map[5][5] = T.FLOOR;
    turn(state);
    expect(state.victim.hp).toBe(100);
    expect(state.player.hp).toBe(100);
    expect(state.attacker).toMatchObject({ x: 6, y: 5, pacifistTurns: 2 });
  });
});
