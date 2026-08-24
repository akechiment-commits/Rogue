import { describe, expect, it } from "vitest";
import { thrownItemAttack } from "../items.js";

describe("投擲アイテムの補正攻撃力", () => {
  it("種別ごとの補正値を使う", () => {
    expect(thrownItemAttack({ type: "weapon", atk: 8, plus: 4 })).toBe(12);
    expect(thrownItemAttack({ type: "armor", def: 10, plus: 3 })).toBe(13);
    expect(thrownItemAttack({ type: "ring" })).toBe(1);
    expect(thrownItemAttack({ type: "scroll" })).toBe(1);
    expect(thrownItemAttack({ type: "pot" })).toBe(5);
    expect(thrownItemAttack({ type: "bottle" })).toBe(3);
    expect(thrownItemAttack({ type: "food" })).toBe(3);
  });
});
