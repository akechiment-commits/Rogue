import { describe, expect, it } from "vitest";
import { FIRST_ENCOUNTER_TIPS, getFirstEncounterTip, isUnidentifiedEncounterItem } from "../firstEncounterTips.js";

describe("first encounter tips", () => {
  it("本編で未読の解説だけ返す", () => {
    expect(getFirstEncounterTip("trap", "beginner", [])).toMatchObject({ key: "trap", title: "隠れた罠" });
    expect(getFirstEncounterTip("trap", "beginner", ["trap"])).toBeNull();
    expect(getFirstEncounterTip("trap", "tutorial", [])).toBeNull();
    expect(getFirstEncounterTip("trap", "debug", [])).toBeNull();
  });

  it("初期解説は攻略上重要な7事象を持つ", () => {
    expect(Object.keys(FIRST_ENCOUNTER_TIPS)).toEqual([
      "unidentified_item", "trap", "shop", "spring", "bigbox", "monster_house", "goal_item",
    ]);
  });

  it("未識別道具だけを判定する", () => {
    const potion = { type: "potion", effect: "heal" };
    expect(isUnidentifiedEncounterItem(potion, new Set())).toBe(true);
    expect(isUnidentifiedEncounterItem(potion, new Set(["p:heal"]))).toBe(false);
    expect(isUnidentifiedEncounterItem({ ...potion, fullIdent: true }, new Set())).toBe(false);
    expect(isUnidentifiedEncounterItem({ type: "weapon", name: "短剣" }, new Set())).toBe(false);
  });
});
