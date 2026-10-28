import { afterEach, describe, expect, it, vi } from "vitest";
import { applyWandEffect } from "../wands.js";
import { applyPlayerLevelDown, MITHRIL_ARMOR_T } from "../items.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
afterEach(() => vi.restoreAllMocks());
for (const armor of [null, MITHRIL_ARMOR_T]) for (const reverseTurns of [0, 5]) for (const hp of [100, 80]) {
 describe(`最大HPの減少: ミスリル=${!!armor} 逆転=${reverseTurns} 現HP=${hp}`, () => {
  it("変化の杖では上限超過分だけを調整し、ダメージ軽減・逆転を通さない", () => {
   vi.spyOn(Math, "random").mockReturnValue(0);
   const player = makePlayer({ hp, maxHp: 100, armor, reverseTurns, sleepTurns: 2 });
   applyWandEffect("transform", "player", player, 1, 0, makeEmptyDg(), player, [], () => {});
   expect(player.maxHp).toBe(90);
   expect(player.hp).toBe(Math.min(hp, 90));
   expect(player.sleepTurns).toBe(2);
   expect(player._lastHpEffectForMessage).toBeUndefined();
  });
  it("レベル低下でも現在HPが最大HPを超えず、逆転回復や軽減が発生しない", () => {
   const player = makePlayer({ hp, maxHp: 100, armor, reverseTurns, level: 2, atk: 10, sleepTurns: 2 });
   applyPlayerLevelDown(player, []);
   expect(player.maxHp).toBe(95);
   expect(player.hp).toBe(Math.min(hp, 95));
   expect(player.sleepTurns).toBe(2);
   expect(player._lastHpEffectForMessage).toBeUndefined();
  });
 });
}
