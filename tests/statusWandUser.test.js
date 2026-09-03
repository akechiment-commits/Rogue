import { describe, expect, it, vi } from "vitest";
import {
  MONS,
  STATUS_WAND_EFFECTS,
  isStatusWandUser,
  resolveMonsterWandEffect,
} from "../monsters.js";

describe("状態異常術師", () => {
  it("呪術師・混乱術師・眠り術師は術師1種にまとまっている", () => {
    const statusMages = MONS.filter((m) => m.randomStatusWands);
    expect(statusMages.map((m) => m.name)).toEqual(["術師"]);
    expect(MONS.some((m) => m.baseKind === "confusemage" || m.baseKind === "sleepmage")).toBe(false);
    expect(statusMages[0].levels.map((lv) => lv.name)).toEqual(["強術師", "大術師"]);
  });

  it("ウィザードと転移術師は固定の杖のまま", () => {
    const wizard = MONS.find((m) => m.baseKind === "wizard");
    const warpmage = MONS.find((m) => m.baseKind === "warpmage");
    expect(wizard.wandEffect).toBe("lightning");
    expect(wizard.randomStatusWands).toBeFalsy();
    expect(warpmage.wandEffect).toBe("teleport_wand");
    expect(warpmage.randomStatusWands).toBeFalsy();
  });

  it("振る杖は呪い・混乱・眠りのどれか", () => {
    const mage = { randomStatusWands: true, subtype: "wanduser" };
    expect(isStatusWandUser(mage)).toBe(true);
    expect(isStatusWandUser({ subtype: "wanduser", wandEffect: "lightning" })).toBe(false);
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(STATUS_WAND_EFFECTS).toContain(resolveMonsterWandEffect(mage));
    vi.restoreAllMocks();
  });
});
