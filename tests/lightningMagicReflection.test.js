import { afterEach, expect, it, vi } from "vitest";
import { applySpellEffect } from "../items.js";
import { drainAnims } from "../animEvents.js";
import { MW, MH } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => { vi.restoreAllMocks(); drainAnims(); });

it("視界内の反射敵で術者への雷演出を出し、その後の敵にも処理を続ける", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  drainAnims();
  const player = makePlayer();
  const reflector = { name: "反射敵", x: 6, y: 5, hp: 100, maxHp: 100, subtype: "magicreflect" };
  const other = { name: "通常敵", x: 7, y: 5, hp: 100, maxHp: 100 };
  const dungeon = makeEmptyDg({ monsters: [reflector, other], visible: Array.from({ length: MH }, () => Array(MW).fill(true)) });
  const messages = [];
  expect(() => applySpellEffect("lightning_magic", "self", null, 0, 0, dungeon, player, messages, () => {})).not.toThrow();
  expect(player.hp).toBe(78);
  expect(reflector.hp).toBe(100);
  expect(other.hp).toBe(78);
  expect(drainAnims()).toContainEqual({ type: "lightning", x: player.x, y: player.y });
  expect(messages.some(m => m.includes("通常敵に命中"))).toBe(true);
});
