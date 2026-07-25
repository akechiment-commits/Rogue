import { describe, expect, it } from "vitest";
import { advancePlayerUpkeep } from "../turnUpkeep.js";

function makePlayer(overrides = {}) {
  return { hp: 50, maxHp: 100, hunger: 40, turns: 0, weapon: null, armor: null, rings: [], ...overrides };
}

function advance(player, messages = [], overrides = {}) {
  advancePlayerUpkeep(player, messages, {
    hasAbility: (item, id) => item?.ability === id,
    hasRingEffect: (entry, effect) => entry.rings.some((ring) => ring.effect === effect),
    calcHungerDrainRate: () => 10,
    ...overrides,
  });
  return messages;
}

describe("advancePlayerUpkeep", () => {
  it("ターンを進め、空腹度を規定量だけ減らして自然回復する", () => {
    const player = makePlayer();
    advance(player);
    expect(player.turns).toBe(1);
    expect(player.hunger).toBe(39);
    expect(player.hp).toBe(51);
  });

  it("空腹時は最初のダメージを通知し、以後もHPを減らす", () => {
    const player = makePlayer({ hunger: 0, hp: 10 });
    let warnings = 0;
    const messages = advance(player, [], { onHungerDamageStarted: () => { warnings++; } });
    expect(player.hp).toBe(9);
    expect(player.deathCause).toBe("空腹により");
    expect(messages).toEqual(["空腹でHPが減り始めた！"]);
    expect(warnings).toBe(1);

    advance(player, messages, { onHungerDamageStarted: () => { warnings++; } });
    expect(player.hp).toBe(8);
    expect(warnings).toBe(1);
  });

  it("再生防具と回復の指輪は自然回復量を加算・倍化する", () => {
    const player = makePlayer({ hp: 70, armor: { ability: "regen" }, rings: [{ effect: "regen_ring" }] });
    advance(player);
    expect(player.hp).toBe(74);
  });

  it("大食い武器は5ターン目に追加で空腹度を減らす", () => {
    const player = makePlayer({ turns: 4, hunger: 20, weapon: { ability: "gluttony" } });
    advance(player);
    expect(player.hunger).toBe(18);
  });
});
