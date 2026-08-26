import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeVisible() {
  return Array.from({ length: 30 }, () => Array(60).fill(true));
}

describe("オーク系・トロル系の痛恨", () => {
  it("オークは力を溜め、次の1ターンだけ防御無視で攻撃する", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const base = MONS.find((monster) => monster.name === "オーク");
      const orc = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
      orc.turnAttacks = 0;
      const player = makePlayer({ x: 6, y: 5, def: 100 });
      const dg = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
        monsters: [orc],
        visible: makeVisible(),
      });
      const messages = [];

      monsterAI(orc, dg, player, messages, { attackOnly: true });
      expect(orc.powerChargeReady).toBe(true);
      expect(player.hp).toBe(100);
      expect(messages.at(-1)).toContain("力を溜めた");

      orc.turnAttacks = 0;
      monsterAI(orc, dg, player, messages, { attackOnly: true });
      expect(orc.powerChargeReady).toBeUndefined();
      expect(player.hp).toBe(80);
      expect(messages.at(-1)).toContain("痛恨の一撃");
    } finally {
      random.mockRestore();
    }
  });

  it("オークの溜めは次のターンに隣接していなければ失効する", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const base = MONS.find((monster) => monster.name === "オーク");
      const orc = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
      orc.turnAttacks = 0;
      const player = makePlayer({ x: 6, y: 5 });
      const dg = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
        monsters: [orc],
        visible: makeVisible(),
      });
      const messages = [];

      monsterAI(orc, dg, player, messages, { attackOnly: true });
      player.x = 10;
      orc.turnAttacks = 0;
      monsterAI(orc, dg, player, messages, { moveOnly: true });
      expect(orc.powerChargeReady).toBeUndefined();
    } finally {
      random.mockRestore();
    }
  });

  it("トロルは通常攻撃時に1.5倍の痛恨を出す", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const base = MONS.find((monster) => monster.name === "トロル");
      const troll = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
      troll.turnAttacks = 0;
      const player = makePlayer({ x: 6, y: 5, def: 0 });
      const dg = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
        monsters: [troll],
        visible: makeVisible(),
      });
      const messages = [];

      monsterAI(troll, dg, player, messages, { attackOnly: true });

      expect(player.hp).toBe(60);
      expect(messages.at(-1)).toContain("痛恨の一撃");
    } finally {
      random.mockRestore();
    }
  });
});
