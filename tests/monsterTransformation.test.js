import { describe, it, expect, vi, afterEach } from "vitest";
import { MONS, makeMonsterFromBase } from "../monsters.js";
import { applyWandEffect } from "../wands.js";
import { applySpellEffect } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
afterEach(() => vi.restoreAllMocks());
describe("変化後のモンスター特性", () => {
  it.each(["wand", "spell"])("%sで元の浮遊を消し、個体ID・位置・状態異常・時計は保つ", mode => {
    const target = makeMonsterFromBase(MONS.find(base => base.baseKind === "gargoyle"), 1, 6, 5);
    const id = target.id;
    target.actionTime = 120;
    target.sleepTurns = 3;
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = makePlayer({ depth: 1 });
    if (mode === "wand") applyWandEffect("transform", "monster", target, 1, 0, makeEmptyDg(), player, [], () => {});
    else applySpellEffect("transform_magic", "monster", target, 1, 0, makeEmptyDg(), player, [], () => {});
    expect(target.name).toBe("ネズミ");
    expect(target.float).toBeFalsy();
    expect(target.baseSpeed).toBe(target.speed);
    expect(target).toMatchObject({ id, x: 6, y: 5, actionTime: 120, sleepTurns: 3 });
  });
  it("水中限定と3回攻撃、旧弾薬も変化先へ持ち越さない", () => {
    const target = makeMonsterFromBase(MONS.find(base => base.baseKind === "seaDevil"), 1, 6, 5);
    target.projectileAmmo = { count: 99 };
    vi.spyOn(Math, "random").mockReturnValue(0);
    applyWandEffect("transform", "monster", target, 1, 0, makeEmptyDg(), makePlayer({ depth: 1 }), [], () => {});
    expect(target.name).toBe("ネズミ");
    expect(target.waterOnly).toBeFalsy();
    expect(target.maxAttacks ?? 1).toBe(1);
    expect(target.projectileAmmo).toBeUndefined();
  });
});
