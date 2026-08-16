import { describe, expect, it } from "vitest";
import { formatSoldItemMessage, generateFakeNames, generateBbFakeNames, getIdentKey, ITEMS, WANDS, POTS, SPELLBOOKS, RINGS, BB_TYPES, BB_FAKE_NAMES, UNIDENTIFIED_NAME_POOLS } from "../items.js";
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

  it("大箱の未識別名も重複せず、種類数に対して十分な候補がある", () => {
    const fakeNames = generateBbFakeNames();
    const names = BB_TYPES.map((bb) => fakeNames[bb.kind]);
    expect(BB_FAKE_NAMES.length).toBeGreaterThan(BB_TYPES.length * 3);
    expect(new Set(names).size).toBe(names.length);
  });

  it("固有アイテムを連想しやすい偽名を使わない", () => {
    const banned = new Set([
      "古代の壺", "旅人の壺", "魔法の大箱", "魔除けの壺", "王家の壺", "封印の壺",
      "古代の大箱", "旅人の大箱", "王家の大箱", "濡れた巻物", "白紙に見える巻物",
    ]);
    const allNames = [
      ...Object.values(UNIDENTIFIED_NAME_POOLS).flat(),
      ...BB_FAKE_NAMES,
    ];
    expect(allNames.filter((name) => banned.has(name))).toEqual([]);
  });
});
