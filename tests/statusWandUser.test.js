import { describe, expect, it, vi } from "vitest";
import {
  MONS,
  ELEMENTAL_WAND_EFFECTS,
  STATUS_WAND_EFFECTS,
  isStatusWandUser,
  makeMonsterFromBase,
  resolveMonsterWandEffect,
} from "../monsters.js";

describe("モンスターの杖使い", () => {
  it("呪術師・混乱術師・眠り術師・転移術師・鈍足術師は杖術師1種にまとまっている", () => {
    const statusMages = MONS.filter((m) => m.randomStatusWands);
    expect(statusMages.map((m) => m.name)).toEqual(["杖術師"]);
    expect(MONS.some((m) => ["confusemage", "sleepmage", "warpmage"].includes(m.baseKind))).toBe(false);
    expect(statusMages[0].levels.map((lv) => lv.name)).toEqual(["杖魔人", "杖ゴミ"]);
    expect(STATUS_WAND_EFFECTS).toEqual(["curse_wand", "confuse_wand", "sleep_wand", "teleport_wand", "slow_wand"]);
  });

  it("ウィザードは炎・雷・氷の杖からランダムに選ぶ", () => {
    const wizard = MONS.find((m) => m.baseKind === "wizard");
    expect(wizard.wandEffect).toBeUndefined();
    expect(wizard.randomStatusWands).toBeFalsy();
    expect(wizard.randomElementalWands).toBe(true);
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(ELEMENTAL_WAND_EFFECTS).toContain(resolveMonsterWandEffect(wizard));
    vi.restoreAllMocks();
  });

  it("振る杖は呪い・混乱・眠り・テレポート・鈍足のどれか", () => {
    const mage = { randomStatusWands: true, subtype: "wanduser" };
    expect(isStatusWandUser(mage)).toBe(true);
    expect(isStatusWandUser({ subtype: "wanduser", wandEffect: "lightning" })).toBe(false);
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(STATUS_WAND_EFFECTS).toContain(resolveMonsterWandEffect(mage));
    vi.restoreAllMocks();
  });

  it("指定された敵種族の水中歩行・浮遊特性をレベル違いでも引き継ぐ", () => {
    for (const baseKind of ["barriermage", "puller"]) {
      const base = MONS.find((m) => m.baseKind === baseKind);
      expect(makeMonsterFromBase(base, 3, 1, 1).waterWalker).toBe(true);
    }
    const hypnotist = MONS.find((m) => m.baseKind === "hypnotist");
    expect(makeMonsterFromBase(hypnotist, 3, 1, 1).float).toBe(true);
  });
});
