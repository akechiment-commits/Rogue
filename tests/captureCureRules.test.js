import { describe, expect, it } from "vitest";
import { applyPotionEffect, applySpellEffect } from "../items.js";
import { clearStatusEffectsOnHpZero, hasClearableStatusAilments } from "../statusDuration.js";
import { releaseInvalidCapture } from "../captureRules.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("通常の状態異常治療と捕獲の区別", () => {
  it.each(["captor-id", 7])("捕獲ID%sだけでは治療対象にせず、通常の解除でも外れない", capturedBy => {
    const player = makePlayer({ capturedBy });
    expect(hasClearableStatusAilments(player)).toBe(false);
    expect(clearStatusEffectsOnHpZero(player)).toBe(false);
    expect(player.capturedBy).toBe(capturedBy);
  });

  it.each(["panacea", "purify_magic"])("%sは毒・混乱を治すが捕獲は維持する", effect => {
    const player = makePlayer({ atk: 8, poisoned: true, poisonAtkLoss: 2, confusedTurns: 5, capturedBy: "captor" });
    const dungeon = makeEmptyDg();
    if (effect === "panacea") applyPotionEffect(effect, 0, "player", player, dungeon, player, [], () => {});
    else applySpellEffect(effect, "self", player, 0, 0, dungeon, player, [], () => {});
    expect(player).toMatchObject({ atk: 10, poisoned: false, confusedTurns: 0, capturedBy: "captor" });
  });

  it("捕獲者を無力化すれば従来どおり捕獲を解除できる", () => {
    const captor = { id: "captor", name: "からめ鬼", x: 5, y: 5, hp: 100, paralyzed: true };
    const player = makePlayer({ x: 6, y: 5, capturedBy: captor.id });
    expect(releaseInvalidCapture(player, makeEmptyDg({ monsters: [captor] }), [])).toBe(true);
    expect(player.capturedBy).toBeNull();
  });

  it("死亡時の捕獲解除は維持する", () => {
    const player = makePlayer({ hp: 0, capturedBy: "captor" });
    clearStatusEffectsOnHpZero(player);
    expect(player.capturedBy).toBeNull();
  });
});
