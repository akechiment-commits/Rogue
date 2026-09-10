import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function makeVisible() {
  return Array.from({ length: 30 }, () => Array(60).fill(true));
}

describe("うみのあくま", () => {
  it("水中限定で、Lv2・Lv3の名前と専用タイルを持つ", () => {
    const base = MONS.find((monster) => monster.baseKind === "seaDevil");
    expect(base).toMatchObject({
      name: "うみのあくま",
      waterOnly: true,
      maxAttacks: 3,
      tile: 222,
      subtype: "seaDevil",
    });
    expect(base.levels.map((level) => level.name)).toEqual(["ゲルショッカー", "アンキケン"]);
    expect([1, 2, 3].map((level) => makeMonsterFromBase(base, level, 5, 5).tile)).toEqual([222, 222, 222]);
  });

  it("水中を1マスずつ移動する", () => {
    const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
    for (let x = 4; x <= 9; x++) map[5][x] = T.WATER;
    const base = MONS.find((monster) => monster.baseKind === "seaDevil");
    const monster = makeMonsterFromBase(base, 1, 4, 5, { aware: true });
    const player = makePlayer({ x: 9, y: 5 });
    const dungeon = makeEmptyDg({
      map,
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
      monsters: [monster],
    });

    monsterAI(monster, dungeon, player, [], { moveOnly: true });

    expect({ x: monster.x, y: monster.y }).toEqual({ x: 5, y: 5 });
    expect(dungeon.map[monster.y][monster.x]).toBe(T.WATER);
  });

  it("1回の攻撃フェーズで通常攻撃を3回行う", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const base = MONS.find((monster) => monster.baseKind === "seaDevil");
      const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
      const player = makePlayer({ x: 6, y: 5, hp: 100, maxHp: 100 });
      const dungeon = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
        monsters: [monster],
        visible: makeVisible(),
      });
      dungeon.map[5][5] = T.WATER;
      const messages = [];

      monsterAI(monster, dungeon, player, messages, { attackOnly: true });

      expect(monster.turnAttacks).toBe(3);
      expect(messages.filter((message) => message.includes("うみのあくまの攻撃！")).length).toBe(3);
      expect(player.hp).toBeLessThan(100);
    } finally {
      random.mockRestore();
    }
  });

  it("封印中は攻撃が1回に制限される", () => {
    const base = MONS.find((monster) => monster.baseKind === "seaDevil");
    const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    monster.sealed = true;
    const player = makePlayer({ x: 6, y: 5 });
    const dungeon = makeEmptyDg({
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
      monsters: [monster],
      visible: makeVisible(),
    });
    dungeon.map[5][5] = T.WATER;
    const messages = [];

    monsterAI(monster, dungeon, player, messages, { attackOnly: true });

    expect(monster.turnAttacks).toBe(1);
    expect(messages.filter((message) => message.includes("うみのあくまの攻撃！")).length).toBe(1);
  });
});
