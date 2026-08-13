import { describe, expect, it } from "vitest";
import { describeLookCell } from "../lookDescription.js";
import { T } from "../utils.js";

function makeDungeon() {
  return {
    map: [[T.FLOOR, T.SD], [T.FLOOR, T.FLOOR]],
    explored: [[true, true], [true, true]],
    visible: [[true, true], [true, true]],
    monsters: [{ x: 0, y: 0, name: "ゴブリン", hp: 3, maxHp: 5 }],
    items: [{ x: 0, y: 0, name: "回復薬" }],
    traps: [{ x: 0, y: 0, name: "眠りの罠", revealed: true }],
    springs: [{ x: 0, y: 0, name: "泉" }],
    bigboxes: [{ x: 0, y: 0, name: "大箱" }],
    pentacles: [{ x: 0, y: 0, name: "爆発の魔方陣" }],
    vents: [],
    statues: [],
  };
}

const displayArgs = {
  x: 0,
  y: 0,
  dungeon: makeDungeon(),
  itemDisplayName: (item) => item.name,
  bigboxDisplayName: (bigbox) => bigbox.name,
};

describe("惑わし中の見渡し", () => {
  it("敵・アイテム・罠・箱などの正確な情報を隠す", () => {
    const result = describeLookCell({
      ...displayArgs,
      session: { player: { bewitchedTurns: 5 } },
    });

    expect(result).toContain("何かの影");
    expect(result).toContain("何かが落ちている");
    expect(result).toContain("床に何かある");
    expect(result).toContain("何かの水たまり");
    expect(result).toContain("何か大きな箱のようなもの");
    expect(result).toContain("床の模様");
    expect(result).not.toContain("ゴブリン");
    expect(result).not.toContain("回復薬");
    expect(result).not.toContain("眠りの罠");
    expect(result).not.toContain("大箱");
    expect(result).not.toContain("爆発の魔方陣");
  });

  it("惑わしが切れると正確な情報へ戻る", () => {
    const result = describeLookCell({
      ...displayArgs,
      session: { player: { bewitchedTurns: 0 } },
    });

    expect(result).toContain("ゴブリン HP:3/5");
    expect(result).toContain("回復薬");
    expect(result).toContain("眠りの罠");
    expect(result).toContain("大箱");
    expect(result).toContain("爆発の魔方陣");
  });

  it("惑わし中は本物の階段を階段として表示しない", () => {
    const result = describeLookCell({
      ...displayArgs,
      x: 1,
      y: 0,
      session: { player: { bewitchedTurns: 5 } },
    });

    expect(result).toBe("何もない");
  });
});
