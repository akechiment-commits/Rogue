import { describe, expect, it } from "vitest";
import { SPELLS } from "../items.js";
import { DEBUG_ITEM_GET_EFFECTS, isDebugItemGetEffect, prepareDebugItem } from "../debugSpellRules.js";

describe("デバッグの状態付きアイテム取得", () => {
  it("通常・祝福・呪いの取得魔法を持つ", () => {
    expect(SPELLS.filter((spell) => isDebugItemGetEffect(spell.effect)).map((spell) => spell.id)).toEqual([
      DEBUG_ITEM_GET_EFFECTS.normal,
      DEBUG_ITEM_GET_EFFECTS.blessed,
      DEBUG_ITEM_GET_EFFECTS.cursed,
    ]);
    expect(SPELLS.find((spell) => spell.id === DEBUG_ITEM_GET_EFFECTS.blessed)).toMatchObject({ debug: true, mpCost: 0 });
    expect(SPELLS.find((spell) => spell.id === DEBUG_ITEM_GET_EFFECTS.cursed)).toMatchObject({ debug: true, mpCost: 0 });
  });

  it("取得した個体だけに祝福・呪いを付け、完全識別する", () => {
    const template = { name: "回復薬", type: "potion" };
    expect(prepareDebugItem(template, DEBUG_ITEM_GET_EFFECTS.normal, "normal")).toMatchObject({
      id: "normal", fullIdent: true, bcKnown: true,
    });
    expect(prepareDebugItem(template, DEBUG_ITEM_GET_EFFECTS.blessed, "blessed")).toMatchObject({
      id: "blessed", fullIdent: true, bcKnown: true, blessed: true, cursed: false,
    });
    expect(prepareDebugItem(template, DEBUG_ITEM_GET_EFFECTS.cursed, "cursed")).toMatchObject({
      id: "cursed", fullIdent: true, bcKnown: true, blessed: false, cursed: true,
    });
    expect(template).toEqual({ name: "回復薬", type: "potion" });
  });
});
