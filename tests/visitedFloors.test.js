import { describe, it, expect } from "vitest";
import { getVisitedFloors } from "../utils.js";

describe("getVisitedFloors", () => {
  it("現在階のみ", () => {
    expect(getVisitedFloors({ floors: {}, player: { depth: 3 } })).toEqual([3]);
    expect(getVisitedFloors({ floors: {} }, 1)).toEqual([1]);
  });

  it("キャッシュ階 + 現在階を昇順で返す", () => {
    expect(getVisitedFloors({
      floors: { 1: {}, 2: {}, 5: {} },
      player: { depth: 4 },
    })).toEqual([1, 2, 4, 5]);
  });

  it("現在階が floors に含まれていても重複しない", () => {
    expect(getVisitedFloors({
      floors: { 2: {} },
      player: { depth: 2 },
    })).toEqual([2]);
  });

  it("空セッションは空配列", () => {
    expect(getVisitedFloors(null)).toEqual([]);
    expect(getVisitedFloors({})).toEqual([]);
  });
});
