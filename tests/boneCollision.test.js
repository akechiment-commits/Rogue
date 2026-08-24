import { describe, expect, it } from "vitest";
import { fireTrapItem } from "../items.js";
import { MH, MW, T } from "../utils.js";

function makeDungeon() {
  return {
    map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
    monsters: [],
    items: [],
    traps: [],
    springs: [],
    bigboxes: [],
    pentacles: [],
  };
}

describe("骨に投擲物が当たった時の表示", () => {
  it("投擲物の消滅と骨の破壊を必ず表示する", () => {
    const dg = makeDungeon();
    const bone = { id: "bone-1", name: "骨", effect: "bone", x: 5, y: 5, reviveIn: 5 };
    const item = { id: "item-1", name: "短剣", type: "weapon", atk: 3 };
    dg.traps.push(bone);
    const messages = [];

    const result = fireTrapItem(bone, item, dg, bone.x, bone.y, messages, new Set());

    expect(result).toBe("destroyed");
    expect(messages).toContain("短剣は骨にぶつかって消えた。");
    expect(messages).toContain("骨が壊れた。");
    expect(dg.traps).not.toContain(bone);
  });
});
