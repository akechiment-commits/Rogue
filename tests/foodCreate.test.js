import { describe, expect, it } from "vitest";
import { applySpellEffect } from "../items.js";
import { MH, MW, T } from "../utils.js";

function makeDungeon() {
  return {
    map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
    items: [],
    waterItems: [],
    traps: [],
    springs: [],
    bigboxes: [],
    pentacles: [],
    monsters: [],
  };
}

describe("食料生成の魔法", () => {
  it("満杯時は足元のアイテムに重ねず通常の落下処理を使う", () => {
    const dg = makeDungeon();
    const p = { x: 5, y: 5, inventory: [{ type: "food" }], maxInventory: 1 };
    dg.items.push({ id: "existing", type: "food", name: "既存の食料", x: p.x, y: p.y, tile: 19 });
    const ml = [];

    applySpellEffect("food_create", "self", null, 0, 0, dg, p, ml, () => {});

    expect(dg.items).toHaveLength(2);
    const generated = dg.items.find(item => item.id !== "existing");
    expect(generated).toBeDefined();
    expect([generated.x, generated.y]).not.toEqual([p.x, p.y]);
  });
});
