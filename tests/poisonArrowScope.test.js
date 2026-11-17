import { describe, it, expect, vi } from "vitest";
import { monsterFireLightning } from "../wands.js";
import { monScaleOutgoingDamage } from "../monTraits.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { MONS, makeMonsterFromBase } from "../monsters.js";

const noop = () => {};

describe("毒矢の半減は防御依存ダメージだけに効く", () => {
  it("半減の仕組み自体はスタック数で累積する（ボスは残りターンがある時だけ）", () => {
    expect(monScaleOutgoingDamage({ poisonArrowDamageHalves: 0 }, 20)).toBe(20);
    expect(monScaleOutgoingDamage({ poisonArrowDamageHalves: 1 }, 20)).toBe(10);
    expect(monScaleOutgoingDamage({ poisonArrowDamageHalves: 2 }, 20)).toBe(5);
    expect(monScaleOutgoingDamage({ isBoss: true, poisonArrowDamageHalves: 1, poisonArrowDamageTurns: 0 }, 20)).toBe(20);
    expect(monScaleOutgoingDamage({ isBoss: true, poisonArrowDamageHalves: 1, poisonArrowDamageTurns: 5 }, 20)).toBe(10);
  });

  it("敵の雷の杖（固定ダメージ）は射手が毒矢で弱体化していても半減しない", () => {
    const run = (stacks) => {
      const wizard = makeMonsterFromBase(MONS.find((m) => m.baseKind === "wizard"), 1, 5, 5);
      if (stacks) wizard.poisonArrowDamageHalves = stacks;
      const dg = makeEmptyDg({ monsters: [wizard] });
      const p = makePlayer({ x: 6, y: 5, hp: 100, maxHp: 100 });
      const ml = [];
      vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        monsterFireLightning(5, 5, dg, p, 1, 0, ml, noop, null, wizard.name, null, wizard, false);
      } finally {
        vi.restoreAllMocks();
      }
      return 100 - p.hp;
    };
    const clean = run(0);
    expect(clean).toBeGreaterThan(0);
    expect(run(2)).toBe(clean);
  });

  it("雷の杖の壁反射（固定ダメージ）も射手の毒矢スタックで半減しない", () => {
    const wizard = makeMonsterFromBase(MONS.find((m) => m.baseKind === "wizard"), 1, 3, 5);
    wizard.hp = 10;
    wizard.poisonArrowDamageHalves = 2;
    const dg = makeEmptyDg({ monsters: [wizard] });
    dg.map[5][2] = T.WALL;
    const p = makePlayer({ x: 10, y: 5, exp: 0 });
    const ml = [];
    vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      monsterFireLightning(3, 5, dg, p, -1, 0, ml, noop, null, wizard.name, null, wizard, false);
    } finally {
      vi.restoreAllMocks();
    }
    expect(dg.monsters).not.toContain(wizard);
    expect(ml.some((msg) => msg.includes("自滅"))).toBe(true);
  });
});
