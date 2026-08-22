import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monLevelUp, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("スネークマン系", () => {
  it("3形態の名前・タイル・水中歩行を持つ", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    expect(base).toBeTruthy();
    expect(base.waterWalker).toBe(true);
    expect(base.subtype).toBe("armorbreath");

    const forms = [1, 2, 3].map((level) => makeMonsterFromBase(base, level, 5, 5));
    expect(forms.map((m) => m.name)).toEqual(["スネークマン", "リザードマン", "とかげせんし"]);
    expect(forms.map((m) => m.tile)).toEqual([202, 203, 204]);
    expect(new Set(forms.map((m) => m.tile)).size).toBe(3);
  });

  it("レベルアップ時にスタイル3のタイルも上位形態へ切り替わる", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    const mon = makeMonsterFromBase(base, 1, 5, 5);
    const messages = [];

    expect(monLevelUp(mon, makeEmptyDg(), messages)).toBe(true);
    expect(mon.name).toBe("リザードマン");
    expect(mon.tile).toBe(203);
  });

  it("視界内でアーマーブレスを予約し、自分または隣接敵の防御を5上げる", () => {
    const base = MONS.find((m) => m.baseKind === "lizardman");
    const snake = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    snake.alwaysUseSpecial = true;
    snake.turnAttacks = 0;
    const ally = { id: "ally", name: "隣の敵", hp: 20, maxHp: 20, atk: 5, def: 3, x: 6, y: 5 };
    const player = makePlayer({ x: 5, y: 10 });
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [snake, ally],
      visible: Array.from({ length: 30 }, () => Array(40).fill(true)),
    });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      monsterAI(snake, dg, player, messages, { moveOnly: true });
      expect(snake._rangedAttackThisTurn).toBe(true);
      monsterAI(snake, dg, player, messages, { attackOnly: true });
      snake.turnAttacks = 0;
      snake._rangedAttackThisTurn = true;
      monsterAI(snake, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(ally.def).toBe(13);
    expect(snake.def).toBe(4);
    expect(messages).toContain("スネークマンがアーマーブレスを唱えた！隣の敵の防御力が5上がった！");
  });
});
