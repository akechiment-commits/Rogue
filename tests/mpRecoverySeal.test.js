import { describe, expect, it } from "vitest";
import { applyPotionEffect } from "../items.js";
import { grantWish } from "../wish.js";
import { MP_REVIVAL_SEAL_TURNS, isMpRecoveryBlocked } from "../mpRules.js";
import { advanceEarlyStatusTimers } from "../turnUpkeep.js";
import { makeEmptyDg } from "./helpers.js";

function makePlayer(overrides = {}) {
  return {
    hp: 10,
    maxHp: 30,
    mp: 0,
    maxMp: 20,
    turns: 100,
    inventory: [],
    rings: [],
    ...overrides,
  };
}

describe("HP0からのMP復活後の回復禁止", () => {
  it("1000ターンの回復禁止は自然回復を止め、期限後に解除される", () => {
    const player = makePlayer({ mpSealTurns: MP_REVIVAL_SEAL_TURNS });

    advanceEarlyStatusTimers(player, []);
    expect(player.mp).toBe(0);
    expect(player.mpSealTurns).toBe(999);

    player.turns = 1000;
    player.mpSealTurns = 1;
    advanceEarlyStatusTimers(player, []);
    expect(player.mpSealTurns).toBe(0);
    expect(player.mp).toBe(1);
  });

  it("マナ回復薬と全回復の願いでもMPを回復しない", () => {
    const player = makePlayer({ mpSealTurns: MP_REVIVAL_SEAL_TURNS });
    const dungeon = makeEmptyDg();
    const messages = [];

    applyPotionEffect("mana", 20, "player", null, dungeon, player, messages, () => {});
    expect(player.mp).toBe(0);
    expect(isMpRecoveryBlocked(player)).toBe(true);

    const result = grantWish(
      { kind: "preset", id: "full_restore" },
      { player, dungeon, ml: messages },
    );
    expect(result.ok).toBe(true);
    expect(player.mp).toBe(0);
  });

  it("呪われた封印の薬だけが通常封印と復活後の回復禁止を解除する", () => {
    const player = makePlayer({ mpCooldownTurns: 12, mpSealTurns: MP_REVIVAL_SEAL_TURNS });
    applyPotionEffect("seal", 0, "player", null, makeEmptyDg(), player, [], () => {}, false, true);
    expect(player.mpCooldownTurns).toBe(0);
    expect(player.mpSealTurns).toBe(0);
    expect(isMpRecoveryBlocked(player)).toBe(false);
  });
});
