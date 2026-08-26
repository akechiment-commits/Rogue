import { describe, expect, it } from "vitest";
import { getHypnosisItemCandidates } from "../useItemActions.js";

describe("催眠の所持品抽選", () => {
  it("使用操作のある所持品を全種別から候補にし、投擲専用・大事なものは除外する", () => {
    const inventory = [
      { type: "food" }, { type: "potion" }, { type: "scroll" }, { type: "spellbook" },
      { type: "weapon" }, { type: "armor" }, { type: "arrow" }, { type: "ring" },
      { type: "wand" }, { type: "marker" }, { type: "pen" }, { type: "pot" },
      { type: "bottle" }, { type: "gold" }, { type: "goal" },
    ];

    expect(getHypnosisItemCandidates(inventory).map(({ it }) => it.type)).toEqual([
      "food", "potion", "scroll", "spellbook", "weapon", "armor", "arrow", "ring",
      "wand", "marker", "pen", "pot",
    ]);
  });
});
