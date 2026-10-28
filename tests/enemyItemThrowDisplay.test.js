import { afterEach, describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { runMonsterAttackPhase } from "../monsterAttackPhase.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("敵の道具投擲のダメージ表示", () => {
  for (const kind of ["itemThrower", "stealthrower"]) {
    it.each([
      { name: "短剣", type: "weapon", atk: 3 },
      { name: "保存の壺", type: "pot", potEffect: "preserve", contents: [], capacity: 3 },
      { name: "ヤバイパン", type: "food", yabai: true },
    ].filter(item => kind !== "stealthrower" || item.type !== "pot"))(`${kind}: $name の命中通知は数値と敵を渡す`, (item) => {
      const enemy = makeMonsterFromBase(MONS.find(m => m.baseKind === kind), 1, 5, 5, { aware: true });
      const held = { id: "throw-display", ...item };
      enemy.turnAttacks = 0;
      if (kind === "itemThrower") enemy.carriedItem = held;
      else { enemy._stealthrowerHeldItem = held; enemy.heldItems = [held]; }
      const player = makePlayer({ x: 5, y: 8, atk: 10 });
      const dungeon = makeEmptyDg({ monsters: [enemy], rooms: [], visible: Array.from({ length: 30 }, () => Array(60).fill(true)) });
      const messages = [];
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const beforeHp = player.hp;
      const result = runMonsterAttackPhase(dungeon, player, messages, {
        moveMons: (dg, p, logs, phase, callbacks) => monsterAI(enemy, dg, p, logs, { ...callbacks, [phase]: true }),
      });

      expect(player.hp).toBeLessThan(beforeHp);
      expect(result.hitEvents).toHaveLength(1);
      expect(result.hitEvents[0].value).toBe(beforeHp - player.hp);
      expect(Number.isFinite(result.hitEvents[0].value)).toBe(true);
      expect(String(result.hitEvents[0].value)).not.toContain("Object");
      expect(result.lunges).toHaveLength(1);
      expect(result.lunges[0].id).toBe(enemy.id);
    });
  }
});
