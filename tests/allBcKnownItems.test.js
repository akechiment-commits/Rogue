import { describe, expect, it } from "vitest";
import { markItemIdentifiedForDungeon, placeItemAt, setDungeonAllBcKnown } from "../items.js";
import { MW, MH, T } from "../utils.js";

function makeDungeon(allBcKnown = false) {
  return {
    allBcKnown,
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

describe("全識別ダンジョンの新規アイテム識別", () => {
  it("床に新しく置かれた杖を回数まで識別済みにする", () => {
    const dg = makeDungeon(true);
    const wand = { id: "w1", name: "場所替えの杖", type: "wand", charges: 4, tile: 24 };

    expect(placeItemAt(dg, 5, 5, wand, [], new Set())).toBe(true);
    expect(wand.fullIdent).toBe(true);
    expect(wand.bcKnown).toBe(true);
  });

  it("通常ダンジョンの新規アイテムは未識別のままにする", () => {
    const dg = makeDungeon(false);
    const wand = { id: "w2", name: "場所替えの杖", type: "wand", charges: 4, tile: 24 };

    placeItemAt(dg, 5, 5, wand, [], new Set());
    expect(wand.fullIdent).toBeUndefined();
    expect(wand.bcKnown).toBeUndefined();
  });

  it("既存の床・水没アイテムと新規アイテムをまとめて識別する", () => {
    const floorItem = { type: "wand", charges: 2 };
    const sunkItem = { type: "wand", charges: 3 };
    const newItem = { type: "wand", charges: 1 };
    const dg = makeDungeon(false);
    dg.items.push(floorItem);
    dg.waterItems.push({ x: 2, y: 2, item: sunkItem });

    setDungeonAllBcKnown(dg, true);
    markItemIdentifiedForDungeon(newItem, dg);

    for (const item of [floorItem, sunkItem, newItem]) {
      expect(item.fullIdent).toBe(true);
      expect(item.bcKnown).toBe(true);
    }
  });
});
