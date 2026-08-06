import { describe, it, expect } from "vitest";
import { ITEMS, STOMACH_ARMOR_T, MITHRIL_ARMOR_T } from "../items.js";

describe("腹持ちの胴 special synth", () => {
  it("通常ドロップ一覧（ITEMS）には含まれない", () => {
    expect(ITEMS.some((i) => i.name === "腹持ちの胴")).toBe(false);
  });

  it("特殊合成テンプレとして定義されている", () => {
    expect(STOMACH_ARMOR_T.name).toBe("腹持ちの胴");
    expect(STOMACH_ARMOR_T.type).toBe("armor");
    expect(STOMACH_ARMOR_T.ability).toBe("slow_hunger");
    expect(STOMACH_ARMOR_T.def).toBe(3);
  });

  it("革の鎧は通常アイテムとして存在する（合成素材）", () => {
    const leather = ITEMS.find((i) => i.name === "革の鎧");
    expect(leather).toBeTruthy();
    expect(leather.type).toBe("armor");
  });

  it("鎖帷子3合成のミスリルと同様にテンプレが独立している", () => {
    expect(MITHRIL_ARMOR_T.name).toBe("ミスリルの胴着");
    expect(ITEMS.some((i) => i.name === "ミスリルの胴着")).toBe(false);
  });
});
