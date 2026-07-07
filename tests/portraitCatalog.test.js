import { describe, it, expect } from "vitest";
import {
  PORTRAIT_CATEGORIES,
  ALL_PORTRAIT_FILES,
  buildPortraitSets,
  mergePortraitCategories,
  nextVariantFile,
  collectPortraitFiles,
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
    expect(sets.damage_fire).toEqual(["damage_fire"]);
    expect(sets.attack).toEqual(["battle_melee"]);
    expect(sets.act_potion).toContain("action_drink_potion");
    expect(sets.hp_low.length).toBeGreaterThanOrEqual(2);
  });

  it("全カテゴリにスロットがある", () => {
    for (const cat of PORTRAIT_CATEGORIES) {
      expect(cat.slots.length).toBeGreaterThan(0);
    }
  });

  it("mergePortraitCategories が追加スロットを同グループにマージする", () => {
    const merged = mergePortraitCategories([
      {
        file: "damage_arrow_2",
        label: "矢・飛び道具 2",
        group: "damage_arrow",
        categoryId: "damage",
        afterFile: "damage_arrow",
      },
    ]);
    const damage = merged.find((c) => c.id === "damage");
    const idx = damage.slots.findIndex((s) => s.file === "damage_arrow");
    expect(damage.slots[idx + 1].file).toBe("damage_arrow_2");
    const sets = buildPortraitSets(merged);
    expect(sets.damage_arrow).toEqual(["damage_arrow", "damage_arrow_2"]);
    expect(sets.damage).toContain("damage_arrow_2");
  });

  it("nextVariantFile が連番ファイル名を生成する", () => {
    const files = collectPortraitFiles(PORTRAIT_CATEGORIES);
    files.add("damage_arrow_2");
    expect(nextVariantFile("damage_arrow", files)).toBe("damage_arrow_3");
  });
});