import { describe, expect, it } from "vitest";
import { getItemCategoryEntries, ITEM_CATEGORY_DEFS } from "../encyclopediaData.js";
import { getMonsterDescription, getMonsterNumber } from "../monsterEncyclopedia.js";

describe("encyclopedia data", () => {
  it("アイテムカテゴリを固定順で提供する", () => {
    expect(ITEM_CATEGORY_DEFS.map((category) => category.id)).toEqual([
      "food", "potion", "scroll", "wand", "pen", "marker", "spellbook",
      "weapon", "armor", "arrow", "pot", "ring", "gem", "bottle", "other",
    ]);
    const entries = getItemCategoryEntries({
      weapon_バトルアクス: { name: "バトルアクス", type: "weapon", count: 1 },
      weapon_短剣: { name: "短剣", type: "weapon", count: 1 },
    }, "weapon");
    expect(entries.map((entry) => entry.name)).toEqual(["短剣", "バトルアクス"]);
  });

  it("モンスターに定義順の番号と解説を持たせる", () => {
    expect(getMonsterNumber("ネズミ")).toBe(1);
    expect(getMonsterNumber("殺人ネズミ")).toBe(2);
    expect(getMonsterNumber("かわしモグラ")).toBeGreaterThan(getMonsterNumber("カラペン"));
    expect(getMonsterDescription("かわしモグラ")).toContain("罠は発動させず消滅");
    expect(getMonsterDescription("サラマンダー")).toContain("ボス");
  });
});
