import { describe, expect, it } from "vitest";
import {
  bbDisplayName,
  clearBigboxKindIdentified,
  isBigboxKindIdentified,
  markBigboxKindIdentified,
} from "../GameHelpers.js";
import { listFloorInventoryEntries } from "../floorInventory.js";

describe("冒険中の大箱識別", () => {
  const makeState = () => ({
    bbFakeNames: { refill: "青い大箱" },
    identifiedBigboxes: new Set(),
  });

  it("一度識別した種類は別の個体にも反映される", () => {
    const state = makeState();
    const first = { kind: "refill", name: "充填の大箱", revealed: false };
    const later = { kind: "refill", name: "充填の大箱", revealed: false };

    expect(bbDisplayName(first, state)).toBe("青い大箱");
    markBigboxKindIdentified(state, first);

    expect(isBigboxKindIdentified(later, state)).toBe(true);
    expect(bbDisplayName(later, state)).toBe("充填の大箱");
  });

  it("名付け・未識別化は種類単位で識別状態を更新する", () => {
    const state = makeState();
    markBigboxKindIdentified(state, "refill");
    expect(bbDisplayName({ kind: "refill", name: "充填の大箱", revealed: false }, state)).toBe("充填の大箱");

    clearBigboxKindIdentified(state, "refill");
    expect(bbDisplayName({ kind: "refill", name: "充填の大箱", revealed: false }, state)).toBe("青い大箱");
  });

  it("足元一覧でも同じ冒険中の識別状態を使う", () => {
    const state = makeState();
    const dungeon = {
      map: [["."]],
      items: [], traps: [], vents: [], pentacles: [], springs: [],
      bigboxes: [{ id: "b1", x: 0, y: 0, kind: "refill", name: "充填の大箱", revealed: false }],
    };
    markBigboxKindIdentified(state, "refill");

    const floor = listFloorInventoryEntries(dungeon, 0, 0, state);
    expect(floor.all[0].name).toBe("充填の大箱");
  });
});
