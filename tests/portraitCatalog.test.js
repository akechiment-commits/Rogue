import { describe, it, expect } from "vitest";
import {
  PORTRAIT_CATEGORIES,
  ALL_PORTRAIT_FILES,
  buildPortraitSets,
} from "../portraitCatalog.js";

describe("portraitCatalog", () => {
  it("スロット名に重複がない", () => {
    expect(ALL_PORTRAIT_FILES.length).toBe(new Set(ALL_PORTRAIT_FILES).size);
  });

  it("ファイル名は英小文字とアンダースコアのみ", () => {
    for (const f of ALL_PORTRAIT_FILES) {
      expect(f).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("buildPortraitSets が主要グループを生成する", () => {
    const sets = buildPortraitSets();
    expect(sets.damage).toContain("damage_fire");
    expect(sets.attack).toContain("battle_ready_a");
    expect(sets.act_potion).toContain("action_drink_potion");
    expect(sets.hp_low.length).toBeGreaterThanOrEqual(2);
  });

  it("全カテゴリにスロットがある", () => {
    for (const cat of PORTRAIT_CATEGORIES) {
      expect(cat.slots.length).toBeGreaterThan(0);
    }
  });
});