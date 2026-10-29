import { describe, expect, it, vi } from "vitest";
import { BOSSES, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

/* ボスの定期召喚は「今いるフロア相当」の通常出現候補から選ばれる。
   深淵神（超上級B50F）の召喚深度がプール範囲外（51F参照）になり、
   常にLv1ネズミになる不具合の回帰テスト。 */
describe("ボス召喚は現在フロア相当", () => {
  it("深淵神（depth49）の召喚手下はLv1ネズミではない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const base = BOSSES.find((b) => b.baseKind === "boss_abyssgod");
      const boss = makeMonsterFromBase(base, 1, 10, 7, { aware: true });
      const player = makePlayer({ x: 13, y: 7, depth: 49 });
      const dg = makeEmptyDg({
        monsters: [boss],
        rooms: [{ x: 1, y: 1, w: 20, h: 14 }],
        dungeonType: "legend",
        visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
      });
      const ml = [];
      for (let i = 0; i < 6 && dg.monsters.length < 3; i++) {
        boss.turnAttacks = 0;
        monsterAI(boss, dg, player, ml, { attackOnly: true });
      }
      const summoned = dg.monsters.filter((m) => m !== boss);
      expect(summoned.length).toBeGreaterThanOrEqual(1);
      for (const m of summoned) {
        expect(m.name).not.toBe("ネズミ");
        expect(m.monLevel || 1).toBeGreaterThanOrEqual(2);
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});
