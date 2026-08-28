import { describe, expect, it } from "vitest";
import { PORTRAIT_CATEGORIES, mergePortraitCategories } from "../portraitCatalog.js";
import extraSlots from "../portrait-extra-slots.json";

describe("防具装備立ち絵スロット", () => {
  it("画像がない防具装備の追加欄を持たない", () => {
    const action = PORTRAIT_CATEGORIES.find((category) => category.id === "action");
    expect(action.slots.filter((slot) => slot.group === "act_equip_armor").map((slot) => slot.file))
      .toEqual(["action_equip_armor"]);
    expect(extraSlots.slots.some((slot) => slot.file.startsWith("action_equip_armor_"))).toBe(false);
    expect(mergePortraitCategories(extraSlots.slots)
      .find((category) => category.id === "action")
      .slots.some((slot) => slot.file.startsWith("action_equip_armor_"))).toBe(false);
  });
});
