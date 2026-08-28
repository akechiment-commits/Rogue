import { describe, expect, it, vi } from "vitest";
import { killMonster } from "../items.js";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function makePetal(level, x, y) {
  const base = MONS.find((monster) => monster.baseKind === "dangerousPetal");
  return makeMonsterFromBase(base, level, x, y, { aware: true });
}

function makeRoomBattlefield(monster, player) {
  return makeEmptyDg({
    map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
    rooms: [{ x: 1, y: 1, w: 30, h: 20 }],
    monsters: [monster],
    visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    player,
  });
}

describe("危険な花びら", () => {
  it("自分からは移動せず、Lv1は隣接時に眠りの花粉を使う", () => {
    const player = makePlayer({ x: 6, y: 5 });
    const petal = makePetal(1, 5, 5);
    const dungeon = makeRoomBattlefield(petal, player);
    const messages = [];
    petal.turnAttacks = 0;
    petal.alwaysUseSpecial = true;

    monsterAI(petal, dungeon, player, messages, { attackOnly: true });

    expect(petal.x).toBe(5);
    expect(petal.y).toBe(5);
    expect(player.sleepTurns).toBe(6);
    expect(messages.some((message) => message.includes("眠りの花粉"))).toBe(true);
  });

  it("Lv2は直線10マス、Lv3は同じ部屋まで届く", () => {
    const player = makePlayer({ x: 10, y: 5 });
    const petal2 = makePetal(2, 5, 5);
    const dungeon2 = makeRoomBattlefield(petal2, player);
    petal2.turnAttacks = 0;
    petal2.alwaysUseSpecial = true;
    monsterAI(petal2, dungeon2, player, [], { attackOnly: true });
    expect(player.sleepTurns).toBe(6);

    player.sleepTurns = 0;
    const petal3 = makePetal(3, 5, 5);
    const dungeon3 = makeRoomBattlefield(petal3, player);
    petal3.turnAttacks = 0;
    petal3.alwaysUseSpecial = true;
    monsterAI(petal3, dungeon3, player, [], { attackOnly: true });
    expect(player.sleepTurns).toBe(6);
  });

  it("倒されると25%で隣接するプレイヤーを眠らせる", () => {
    const player = makePlayer({ x: 6, y: 5 });
    const petal = makePetal(1, 5, 5);
    const dungeon = makeEmptyDg({ monsters: [petal] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      killMonster(petal, dungeon, player, messages, null, true);
      expect(dungeon.monsters).not.toContain(petal);
      expect(player.sleepTurns).toBe(6);
      expect(messages.some((message) => message.includes("散り際") && message.includes("眠り"))).toBe(true);
    } finally {
      random.mockRestore();
    }
  });
});
