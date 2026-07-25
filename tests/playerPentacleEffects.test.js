import { describe, expect, it } from "vitest";
import { resolvePlayerPentacleEffects } from "../playerPentacleEffects.js";

function dependencies(overrides = {}) {
  return {
    inMagicSealRoom: () => false,
    inCursedMagicSealRoom: () => false,
    hasCursedExplosionPentacle: () => false,
    hasLightningResist: () => false,
    reduceLightningDamage: (damage) => damage,
    lightningResistDamageLabel: () => "",
    applyLightningToInventory: () => {},
    lu: {},
    getItemName: (item) => item.name,
    ...overrides,
  };
}

describe("resolvePlayerPentacleEffects", () => {
  it("呪われた聖域を踏むと雷より先に即死する", () => {
    const player = { x: 3, y: 3, hp: 40, maxHp: 40 };
    const dungeon = { pentacles: [
      { name: "呪われた聖域", kind: "sanctuary", cursed: true, x: 3, y: 3 },
      { name: "雷の魔方陣", kind: "thunder_trap", x: 3, y: 3 },
    ] };
    const messages = [];

    resolvePlayerPentacleEffects(player, dungeon, messages, dependencies());

    expect(player).toMatchObject({ hp: 0, deathCause: "呪われた聖域により" });
    expect(messages).toEqual(["呪われた聖域に触れた！呪いの力で即死した！"]);
  });

  it("呪われた雷は回復し、通常の雷はアイテムへの雷処理を呼ぶ", () => {
    const healed = { x: 3, y: 3, hp: 60, maxHp: 100 };
    const cursedDungeon = { pentacles: [{ name: "呪われた雷", kind: "thunder_trap", cursed: true, x: 3, y: 3 }] };
    const healMessages = [];
    resolvePlayerPentacleEffects(healed, cursedDungeon, healMessages, dependencies());
    expect(healed.hp).toBe(85);
    expect(healMessages).toEqual(["呪われた雷の力でHPが25回復した！"]);

    let inventoryHits = 0;
    const struck = { x: 3, y: 3, hp: 50, maxHp: 50 };
    const normalDungeon = { pentacles: [{ name: "雷の魔方陣", kind: "thunder_trap", x: 3, y: 3 }] };
    resolvePlayerPentacleEffects(struck, normalDungeon, [], dependencies({
      applyLightningToInventory: () => { inventoryHits++; },
    }));
    expect(struck.hp).toBe(25);
    expect(inventoryHits).toBe(1);
  });
});
