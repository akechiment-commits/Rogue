import { describe, it, expect, vi } from "vitest";
import { SILVER_AXE_T, GOLDEN_AXE_T, soakItemIntoSpring } from "../items.js";
import { hasAbility } from "../utils.js";

describe("シルバーアクスの実装と泉での斧変化", () => {
  it("シルバーアクスが正しく定義されている（アンデッド特効のみ、不錆なし）", () => {
    expect(SILVER_AXE_T.name).toBe("シルバーアクス");
    expect(SILVER_AXE_T.atk).toBe(10);
    expect(SILVER_AXE_T.ability).toBe("bane_undead");
    expect(SILVER_AXE_T.sellPrice).toBe(2000);
    expect(SILVER_AXE_T.tile).toBe(20);

    expect(hasAbility(SILVER_AXE_T, "bane_undead")).toBe(true);
    expect(hasAbility(SILVER_AXE_T, "no_degrade")).toBe(false);
  });

  it("泉にバトルアクスを落とすと20%でゴールデンアクス、30%でシルバーアクスに変化する", () => {
    const spr = { x: 5, y: 5, contents: [] };

    // 1. 乱数 0.10 (< 0.20) -> ゴールデンアクス
    {
      const item = { name: "バトルアクス", type: "weapon", atk: 10, plus: 1, id: "axe1" };
      const ml = [];
      const rnd = vi.spyOn(Math, "random").mockReturnValue(0.10);
      try {
        soakItemIntoSpring(spr, item, ml);
        expect(item.name).toBe(GOLDEN_AXE_T.name);
        expect(item.ability).toBe("no_degrade");
        expect(item.plus).toBe(1);
        expect(ml.some((m) => m.includes("ゴールデンアクスに変化した"))).toBe(true);
      } finally {
        rnd.mockRestore();
      }
    }

    // 2. 乱数 0.35 (0.20 <= r < 0.50) -> シルバーアクス
    {
      const item = { name: "バトルアクス", type: "weapon", atk: 10, plus: 2, id: "axe2" };
      const ml = [];
      const rnd = vi.spyOn(Math, "random").mockReturnValue(0.35);
      try {
        soakItemIntoSpring(spr, item, ml);
        expect(item.name).toBe(SILVER_AXE_T.name);
        expect(item.ability).toBe("bane_undead");
        expect(item.plus).toBe(2);
        expect(ml.some((m) => m.includes("シルバーアクスに変化した"))).toBe(true);
      } finally {
        rnd.mockRestore();
      }
    }

    // 3. 乱数 0.70 (>= 0.50) -> 錆びる
    {
      const item = { name: "バトルアクス", type: "weapon", atk: 10, plus: 2, id: "axe3" };
      const ml = [];
      const rnd = vi.spyOn(Math, "random").mockReturnValue(0.70);
      try {
        soakItemIntoSpring(spr, item, ml);
        expect(item.name).toBe("バトルアクス");
        expect(item.plus).toBe(1); // 錆びて+1下がる
        expect(ml.some((m) => m.includes("錆びてしまった"))).toBe(true);
      } finally {
        rnd.mockRestore();
      }
    }
  });

  it("泉に戦神の斧を落とした場合もシルバーアクスに変化し得る", () => {
    const spr = { x: 5, y: 5, contents: [] };
    const item = { name: "戦神の斧", type: "weapon", atk: 8, plus: 3, id: "axe_war" };
    const ml = [];
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.30);
    try {
      soakItemIntoSpring(spr, item, ml);
      expect(item.name).toBe(SILVER_AXE_T.name);
      expect(item.ability).toBe("bane_undead");
      expect(item.plus).toBe(3);
      expect(ml.some((m) => m.includes("シルバーアクスに変化した"))).toBe(true);
    } finally {
      rnd.mockRestore();
    }
  });
});
