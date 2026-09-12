import { describe, expect, it } from "vitest";
import {
  BLANK_SCROLL,
  EMPTY_BOTTLE,
  GODSPARKWAND_T,
  ITEMS,
  MAGIC_MARKER,
  POTS,
  RINGS,
  SPELLBOOKS,
  WANDS,
  WATER_BOTTLE,
  genFood,
} from "../items.js";

const CURSE_DESCRIPTION_TYPES = new Set(["potion", "scroll", "wand", "pen", "spellbook", "bottle", "marker"]);

describe("アイテム説明の呪い欄", () => {
  it("呪いで効果が変わるアイテムにだけ欄がある", () => {
    const items = [...ITEMS, ...WANDS, ...SPELLBOOKS, GODSPARKWAND_T, EMPTY_BOTTLE, WATER_BOTTLE, BLANK_SCROLL, MAGIC_MARKER];
    const curseTargets = items.filter((item) => CURSE_DESCRIPTION_TYPES.has(item.type));
    const excluded = [...ITEMS, ...POTS, ...RINGS].filter((item) => !CURSE_DESCRIPTION_TYPES.has(item.type));

    expect(curseTargets.length).toBeGreaterThan(0);
    expect(curseTargets.every((item) => item.desc?.split("\n").some((line) => line.startsWith("呪い：")))).toBe(true);
    expect(excluded.every((item) => !item.desc?.includes("呪い："))).toBe(true);
  });

  it("生成食料には呪い欄を追加しない", () => {
    expect(genFood().desc).not.toContain("呪い：");
  });
});
