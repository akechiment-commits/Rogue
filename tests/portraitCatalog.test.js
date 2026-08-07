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
    /* 汎用 damage は hp_hurt のみ（属性を混ぜない） */
    expect(sets.damage).toEqual(["hp_hurt"]);
    expect(sets.damage_fire).toEqual(["damage_fire"]);
    expect(sets.damage).not.toContain("damage_falling");
    expect(sets.attack).toEqual(["battle_melee"]);
    expect(sets.attack_unarmed).toEqual(["battle_unarmed"]);
    expect(sets.dash).toEqual(["battle_dash"]);
    expect(sets.act_potion).toContain("action_drink_potion");
    expect(sets.act_scroll).toEqual(["action_read_scroll"]);
    expect(sets.damage_watergun).toEqual(["damage_watergun"]);
    expect(sets.damage_gun).toEqual(["damage_gun"]);
    expect(sets.hp_low.length).toBeGreaterThanOrEqual(2);
    expect(sets.death_drown).toEqual(["gameover_drown"]);
    expect(sets.status_soaked).toEqual(["status_soaked"]);
    expect(sets.status_bound).toEqual(["status_bound"]);
    expect(sets.status_confined).toEqual(["status_confined"]);
    expect(sets.stand_light_armor).toEqual(["stand_light_armor"]);
    expect(sets.stand_unarmored).toEqual(["stand_unarmored"]);
    expect(sets.hp_full).not.toContain("stand_light_armor");
    expect(sets.hp_full).not.toContain("stand_unarmored");
    expect(sets.walk_unarmored).toEqual(
      expect.arrayContaining(["stand_unarmored_walk", "stand_unarmored_advance"]),
    );
    expect(sets.attack_unarmed_bare).toEqual(
      expect.arrayContaining(["battle_unarmed_unarmored", "battle_unarmed_unarmored_2"]),
    );
  });

  it("状態異常に拘束・閉じ込めスロットがある", () => {
    const status = PORTRAIT_CATEGORIES.find((c) => c.id === "status");
    expect(status.slots.some((s) => s.file === "status_bound" && s.label === "拘束状態")).toBe(true);
    expect(status.slots.some((s) => s.file === "status_confined" && s.label === "閉じ込め状態")).toBe(true);
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
    expect(sets.damage).not.toContain("damage_arrow_2");
  });

  it("nextVariantFile が連番ファイル名を生成する", () => {
    const files = collectPortraitFiles(PORTRAIT_CATEGORIES);
    files.add("damage_arrow_2");
    expect(nextVariantFile("damage_arrow", files)).toBe("damage_arrow_3");
  });
});