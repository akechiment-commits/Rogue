import { describe, it, expect } from "vitest";
import { installPlayerHpReverseHook, reduceFinalPlayerDamage, hasAbility } from "../utils.js";
import { MITHRIL_ARMOR_T } from "../items.js";
import { makePlayer } from "./helpers.js";

describe("dmg_reduce (ミスリル被ダメ軽減)", () => {
  it("reduceFinalPlayerDamage は1割軽減し最低1", () => {
    const p = makePlayer({ armor: { ...MITHRIL_ARMOR_T } });
    expect(hasAbility(p.armor, "dmg_reduce")).toBe(true);
    expect(reduceFinalPlayerDamage(p, 10)).toBe(9);
    expect(reduceFinalPlayerDamage(p, 1)).toBe(1);
    expect(reduceFinalPlayerDamage(p, 20)).toBe(18);
  });

  it("能力なしでは軽減しない", () => {
    const p = makePlayer({ armor: { name: "革の鎧", def: 2 } });
    expect(reduceFinalPlayerDamage(p, 10)).toBe(10);
  });

  it("HP代入フックで p.hp -= dmg が1割軽減される", () => {
    const p = makePlayer({ hp: 100, maxHp: 100, armor: { ...MITHRIL_ARMOR_T } });
    installPlayerHpReverseHook(p);
    p.hp -= 10;
    expect(p.hp).toBe(91); /* 10 → 9 軽減 */
  });

  it("p.hp = 0 / p.hp = 1 の絶対指定は軽減しない", () => {
    const p = makePlayer({ hp: 50, maxHp: 100, armor: { ...MITHRIL_ARMOR_T } });
    installPlayerHpReverseHook(p);
    p.hp = 1;
    expect(p.hp).toBe(1);
    p.hp = 50;
    p.hp = 0;
    expect(p.hp).toBe(0);
  });
});
