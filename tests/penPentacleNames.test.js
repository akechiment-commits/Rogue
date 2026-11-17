import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ITEMS } from "../items.js";

const src = fs.readFileSync(new URL("../useItemActions.js", import.meta.url), "utf8");

describe("ペンで描く魔方陣の名前", () => {
  it("全ペンのeffectに専用の魔方陣名が対応している（汎用の「魔方陣」に落ちない）", () => {
    const pens = ITEMS.filter((item) => item.type === "pen");
    expect(pens.length).toBeGreaterThan(0);
    for (const pen of pens) {
      const pattern = new RegExp(`it\\.effect === "${pen.effect}"\\s*\\?\\s*"[^"]+の魔方陣"`);
      expect(pattern.test(src), `${pen.name} (effect: ${pen.effect})`).toBe(true);
    }
  });

  it("黄金のペンは黄金の魔方陣になる", () => {
    expect(/it\.effect === "gold"\s*\?\s*"黄金の魔方陣"/.test(src)).toBe(true);
  });
});
