import { describe, it, expect, vi } from "vitest";
import { T } from "../utils.js";
import { BOSSES, INTERMEDIATE_BOSSES, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("canSee の宣言前参照（TDZ）回帰", () => {
  const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
  const rooms = [{ x: 1, y: 1, w: 20, h: 14 }];

  it("虚無の僧侶は初回の行動ターンで例外を出さない", () => {
    const base = BOSSES.find((b) => b.baseKind === "boss_voidmonk");
    const m = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const p = makePlayer({ x: 9, y: 5 });
    const dg = makeEmptyDg({ map, rooms, monsters: [m], items: [], pentacles: [] });
    expect(() => monsterAI(m, dg, p, [], {})).not.toThrow();
  });

  it("クラーケンは直線上のプレイヤーに対して墨の予約・実行で例外を出さない", () => {
    const base = INTERMEDIATE_BOSSES.find((b) => b.baseKind === "im_boss_kraken");
    const m = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    m.turnAttacks = 0;
    const p = makePlayer({ x: 9, y: 5 });
    const dg = makeEmptyDg({ map, rooms, monsters: [m], items: [], pentacles: [] });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      expect(() => monsterAI(m, dg, p, [], { moveOnly: true })).not.toThrow();
      expect(() => monsterAI(m, dg, p, [], { attackOnly: true })).not.toThrow();
    } finally {
      random.mockRestore();
    }
  });
});
