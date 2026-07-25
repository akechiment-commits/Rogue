import { describe, expect, it } from "vitest";
import { describeLookCell } from "../lookDescription.js";
import { T } from "../utils.js";

function makeDungeon() {
  return {
    map: [[T.FLOOR, T.WALL], [T.SD, T.FLOOR]],
    explored: [[true, true], [false, true]],
    visible: [[true, false], [false, true]],
    monsters: [{ x: 0, y: 0, name: "ゴブリン", hp: 3, maxHp: 5 }],
    items: [{ x: 0, y: 0, name: "回復薬", shopPrice: 80 }],
    traps: [{ x: 0, y: 0, name: "眠りの罠", revealed: true }],
    springs: [{ x: 0, y: 0 }],
    bigboxes: [{ x: 0, y: 0, name: "大箱", revealed: true }],
    pentacles: [{ x: 0, y: 0, name: "魔方陣" }],
    vents: [{ x: 0, y: 0 }],
    statues: [{ x: 0, y: 0 }],
  };
}

function describeCell(overrides = {}) {
  return describeLookCell({
    x: 0,
    y: 0,
    dungeon: makeDungeon(),
    session: {},
    itemDisplayName: (item) => `表示:${item.name}`,
    bigboxDisplayName: (bigbox, revealed) => `${bigbox.name}:${revealed}`,
    ...overrides,
  });
}

describe("describeLookCell", () => {
  it("未探索のマスは内容を表示しない", () => {
    expect(describeCell({ x: 0, y: 1 })).toBe("未探索");
  });

  it("可視のマスにある対象を表示順どおりまとめる", () => {
    expect(describeCell()).toBe(
      "ゴブリン HP:3/5 / 表示:回復薬(80G) / 罠:眠りの罠 / 泉 / 大箱:true / 魔方陣 / 風穴 / 石像",
    );
  });

  it("壁の中のアイテムは reveal 時だけ表示する", () => {
    const dungeon = makeDungeon();
    dungeon.itemsRevealed = true;
    dungeon.items.push({ x: 1, y: 0, name: "短剣", wallEmbedded: true });
    expect(describeCell({ x: 1, y: 0, dungeon })).toBe("壁の中: 表示:短剣");
  });
});
