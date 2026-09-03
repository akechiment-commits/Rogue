import { describe, expect, it, vi } from "vitest";
import {
  MONS,
  STATUS_WAND_EFFECTS,
  isStatusWandUser,
  resolveMonsterWandEffect,
} from "../monsters.js";

describe("状態異常術師", () => {
  it("呪術師・混乱術師・眠り術師・転移術師は術師1種にまとまっている", () => {
    const statusMages = MONS.filter((m) => m.randomStatusWands);
    expect(statusMages.map((m) => m.name)).toEqual(["術師"]);
    expect(MONS.some((m) => ["confusemage", "sleepmage", "warpmage"].includes(m.baseKind))).toBe(false);
    expect(statusMages[0].levels.map((lv) => lv.name)).toEqual(["強術師", "大術師"]);
    expect(STATUS_WAND_EFFECTS).toEqual(["curse_wand", "confuse_wand", "sleep_wand", "teleport_wand"]);
  });

  it("ウィザードは雷の杖のまま", () => {
    const wizard = MONS.find((m) => m.baseKind === "wizard");
    expect(wizard.wandEffect).toBe("lightning");
    expect(wizard.randomStatusWands).toBeFalsy();
  });

  it("振る杖は呪い・混乱・眠り・テレポートのどれか", () => {
    const mage = { randomStatusWands: true, subtype: "wanduser" };
    expect(isStatusWandUser(mage)).toBe(true);
    expect(isStatusWandUser({ subtype: "wanduser", wandEffect: "lightning" })).toBe(false);
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(STATUS_WAND_EFFECTS).toContain(resolveMonsterWandEffect(mage));
    vi.restoreAllMocks();
  });
});
