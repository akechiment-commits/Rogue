import { describe, expect, it } from "vitest";
import { formatSoldItemMessage, generateFakeNames, getIdentKey, ITEMS, WANDS, POTS, SPELLBOOKS, RINGS } from "../items.js";
import { itemDisplayName } from "../render.js";

describe("アイテム表示名の識別保護", () => {
  const potion = { type: "potion", effect: "heal", name: "回復薬" };
  const fakeNames = { "p:heal": "青い薬" };
  const ident = new Set();

  const display = (item, nicknames = {}) =>
    itemDisplayName(item, fakeNames, ident, nicknames);

  it("売却の巻物の結果は未識別名を表示する", () => {
    const message = formatSoldItemMessage(potion, 100, false, false, display);
    expect(message).toContain("青い薬");
    expect(message).not.toContain("回復薬");
  });

  it("売却の巻物の結果は登録済みニックネームを優先する", () => {
    const message = formatSoldItemMessage(potion, 200, true, false, (item) =>
      display(item, { "p:heal": "おいしい薬" }),
    );
    expect(message).toContain("薬:おいしい薬");
    expect(message).not.toContain("回復薬");
  });

  it("同じカテゴリの未識別名は重複しない", () => {
    const allItems = [...ITEMS, ...WANDS];
    const fakeNames = generateFakeNames(allItems, POTS, SPELLBOOKS, RINGS);
    const groups = [
      allItems.filter((it) => it.type === "potion" && it.effect !== "water"),
      allItems.filter((it) => it.type === "scroll" && it.effect !== "blank"),
      allItems.filter((it) => it.type === "wand"),
      allItems.filter((it) => it.type === "pen"),
      POTS,
      SPELLBOOKS.filter((it) => it.spell),
      RINGS.filter((it) => it.type === "ring"),
    ];

    for (const group of groups) {
      const names = [...new Set(group.map(getIdentKey).filter(Boolean))].map((key) => fakeNames[key]);
      expect(names.every(Boolean)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
