import { describe, expect, it } from "vitest";
import {
  getItemCategoryEntries,
  getKeyItemDescription,
  ITEM_CATEGORY_DEFS,
  NO_ENCYCLOPEDIA_INFO,
} from "../encyclopediaData.js";
import { getMonsterDescription, getMonsterNumber } from "../monsterEncyclopedia.js";

describe("encyclopedia data", () => {
  it("アイテムカテゴリを固定順で提供する", () => {
    expect(ITEM_CATEGORY_DEFS.map((category) => category.id)).toEqual([
      "food", "potion", "scroll", "wand", "pen", "marker", "spellbook",
      "weapon", "armor", "arrow", "pot", "ring", "gem", "bottle", "goal", "other",
    ]);
    const entries = getItemCategoryEntries({
      weapon_バトルアクス: { name: "バトルアクス", type: "weapon", count: 1 },
      weapon_短剣: { name: "短剣", type: "weapon", count: 1 },
    }, "weapon");
    expect(entries.map((entry) => entry.name)).toEqual(["短剣", "バトルアクス"]);

    const goals = getItemCategoryEntries({
      goal_深淵の禁書: { name: "深淵の禁書", type: "goal", count: 1 },
      goal_訓練の証: { name: "訓練の証", type: "goal", count: 1 },
    }, "goal");
    expect(goals.map((entry) => entry.name)).toEqual(["訓練の証", "深淵の禁書"]);
  });

  it("モンスターに定義順の番号と解説を持たせる", () => {
    expect(getMonsterNumber("ネズミ")).toBe(1);
    expect(getMonsterNumber("殺人ネズミ")).toBe(2);
    expect(getMonsterNumber("かわしモグラ")).toBeGreaterThan(getMonsterNumber("カラペン"));
    expect(getMonsterDescription("かわしモグラ")).toContain("罠は発動させず消滅");
    expect(getMonsterDescription("サラマンダー")).toContain("ボス");
    expect(getMonsterNumber("好まざる猫「フリージア」")).not.toBeNull();
    expect(getMonsterDescription("分裂スライム")).toContain("25%の確率");
    expect(getMonsterDescription("タトゥーバード")).toContain("フェザーガード");
    expect(getMonsterDescription("深淵神")).toContain("最終ボス");
  });

  it("キーアイテムの解説と未設定時の共通文を提供する", () => {
    expect(getKeyItemDescription("深紅の魔石")).toContain("中級者ダンジョン");
    expect(getKeyItemDescription("存在しないキーアイテム")).toBeNull();
    expect(NO_ENCYCLOPEDIA_INFO).toBe("特に情報はない。");
  });
});
