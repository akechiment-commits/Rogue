import { describe, expect, it } from "vitest";
import { applyPotionEffect, applyFoodEffectsOnHit } from "../items.js";
import { advanceMonsterUpkeep } from "../monsterUpkeep.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function setup() {
  const monster = { id: "doped", name: "敵", hp: 100, maxHp: 100, atk: 10, def: 4, x: 5, y: 5 };
  const dungeon = makeEmptyDg({ monsters: [monster] }), player = makePlayer({ x: 20, y: 20 });
  const potion = (effect, { blessed = false, cursed = false } = {}) =>
    applyPotionEffect(effect, effect === "power" ? 2 : 50, "monster", monster, dungeon, player, [], () => {}, blessed, cursed);
  const tick = () => advanceMonsterUpkeep(dungeon, player, [], {
    hasCursedExplosionPentacle: () => false, inMagicSealRoom: () => false,
    inCursedMagicSealRoom: () => false, onMonsterDefeated: () => {},
  });
  const food = (effect, flags = {}) => applyFoodEffectsOnHit({ type: "food", name: "パン", effect, value: 100, ...flags },
    "monster", monster, dungeon, player, [], () => {});
  return { monster, potion, tick, food };
}

describe("敵ドーピング中の恒久能力変化", () => {
  it.each([
    ["通常", {}, 12], ["祝福", { blessed: true }, 14], ["呪い", { cursed: true }, 8],
  ])("%sの力の薬の増減を強化・副作用終了後も維持する", (_label, flags, baseAtk) => {
    const { monster, potion, tick } = setup();
    potion("doping");
    potion("power", flags);
    expect(monster.atk).toBe(baseAtk * 2);
    monster.dopingTurns = 1;
    tick();
    expect(monster.atk).toBe(Math.floor(baseAtk / 2));
    for (let i = 0; i < 50; i++) tick();
    expect(monster.atk).toBe(baseAtk);
    expect(monster._dopingBaseAtk).toBeUndefined();
  });

  it("祝福ドーピングは副作用なしで強化後の基礎値へ戻る", () => {
    const { monster, potion, tick } = setup();
    potion("doping", { blessed: true });
    potion("power");
    monster.dopingTurns = 1;
    tick();
    expect(monster.atk).toBe(12);
    expect(monster.dopingAftereffectTurns || 0).toBe(0);
  });

  it("副作用中に力の薬を使っても基礎値の増加を保持する", () => {
    const { monster, potion, tick } = setup();
    potion("doping", { cursed: true });
    potion("power");
    expect(monster.atk).toBe(6);
    for (let i = 0; i < 50; i++) tick();
    expect(monster.atk).toBe(12);
  });

  it("食料の攻撃・防御の強化と再ドーピングも重複や消失しない", () => {
    const { monster, potion, food, tick } = setup();
    potion("doping");
    food("power_food");
    food("def_food");
    expect(monster).toMatchObject({ atk: 24, def: 12 });
    potion("doping");
    expect(monster).toMatchObject({ atk: 24, def: 12 });
    monster.dopingTurns = 1;
    tick();
    for (let i = 0; i < 50; i++) tick();
    expect(monster).toMatchObject({ atk: 12, def: 6 });
  });

  it("傷んだ食料の小数強化も終了後に失わない", () => {
    const { monster, potion, food, tick } = setup();
    potion("doping", { blessed: true });
    food("power_food", { burnt: true, value: 60, _foodOriginalValue: 100 });
    monster.dopingTurns = 1;
    tick();
    expect(monster.atk).toBeCloseTo(10.2);
  });

  it("ドーピングしていない敵は従来の量だけ増減する", () => {
    const { monster, potion } = setup();
    potion("power");
    expect(monster.atk).toBe(12);
    expect(monster._dopingBaseAtk).toBeUndefined();
  });
});
