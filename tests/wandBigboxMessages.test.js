import { describe, expect, it } from "vitest";
import { applyWandEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function setup(contents) {
  const box = { id: "bb", kind: "wooden", name: "木の大箱", x: 6, y: 5, capacity: 3, contents, revealed: false };
  const dg = makeEmptyDg({ bigboxes: [box] });
  return { box, dg, p: makePlayer({ x: 3, y: 5 }), ml: [] };
}

describe("杖と大箱のメッセージ", () => {
  it("軟化で中身がある大箱は『中身が飛び出した』と表示し、未識別名を漏らさない", () => {
    const { box, dg, p, ml } = setup([{ id: "i1", name: "薬草", type: "herb" }]);
    applyWandEffect("soften", "bigbox", box, 1, 0, dg, p, ml, () => {}, name => "謎の大箱");
    expect(ml.join("")).toContain("中身が飛び出した");
  });
  it("破壊系効果でも未識別の大箱は本名を出さない", () => {
    const { box, dg, p, ml } = setup([]);
    applyWandEffect("dig", "bigbox", box, 1, 0, dg, p, ml, () => {}, null, 1, null, 0, null, () => "謎の大箱");
    expect(ml.join("")).not.toContain("木の大箱");
  });
});
