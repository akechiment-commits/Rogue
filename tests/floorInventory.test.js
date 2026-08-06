import { describe, it, expect } from "vitest";
import {
  listFloorInventoryEntries,
  floorEntryRole,
  floorEntryLabel,
  floorEntryActionCount,
  isPentacleIdentified,
  PENTACLE_UNKNOWN_DESC,
  PENTACLE_FLOOR_DESCS,
  FLOOR_INFO_ROLES,
} from "../floorInventory.js";

describe("pentacle identification / desc", () => {
  it("未識別ペンで描いた魔方陣は説明が不詳", () => {
    const dg = {
      items: [], traps: [], vents: [], springs: [], bigboxes: [],
      pentacles: [{
        id: "p1", x: 0, y: 0, kind: "explosion", name: "琥珀の魔方陣",
        penIK: "n:explosion",
      }],
    };
    const fl = listFloorInventoryEntries(dg, 0, 0, { ident: new Set() });
    expect(fl.all[0].desc).toBe(PENTACLE_UNKNOWN_DESC);
    expect(fl.all[0]._pentacleIdentified).toBe(false);
  });

  it("識別後は魔方陣用の書き下ろし説明", () => {
    const dg = {
      items: [], traps: [], vents: [], springs: [], bigboxes: [],
      pentacles: [{
        id: "p1", x: 0, y: 0, kind: "explosion", name: "琥珀の魔方陣",
        penIK: "n:explosion",
      }],
    };
    const fl = listFloorInventoryEntries(dg, 0, 0, { ident: new Set(["n:explosion"]) });
    expect(fl.all[0].desc).toBe(PENTACLE_FLOOR_DESCS.explosion);
    expect(fl.all[0].desc).not.toMatch(/足元に/);
    expect(fl.all[0]._pentacleIdentified).toBe(true);
  });

  it("描画時識別済み（penIKなし）は常に詳細説明", () => {
    const dg = {
      items: [], traps: [], vents: [], springs: [], bigboxes: [],
      pentacles: [{
        id: "p1", x: 0, y: 0, kind: "sanctuary", name: "聖域の魔方陣",
      }],
    };
    const fl = listFloorInventoryEntries(dg, 0, 0, { ident: new Set() });
    expect(fl.all[0].desc).toBe(PENTACLE_FLOOR_DESCS.sanctuary);
  });

  it("固定転送は常に識別済み", () => {
    expect(isPentacleIdentified({ kind: "fixed_portal" }, new Set())).toBe(true);
  });

  it("書き下ろしはペン説明の「描く」文面ではない", () => {
    for (const [k, d] of Object.entries(PENTACLE_FLOOR_DESCS)) {
      if (k === "fixed_portal") continue;
      expect(d).not.toMatch(/足元に.+を描く/);
    }
  });
});

describe("listFloorInventoryEntries fixtures", () => {
  it("風穴・泉・大箱・魔方陣・階段を含める", () => {
    const map = Array.from({ length: 5 }, () => Array(5).fill("."));
    map[2][1] = ">";
    const dg = {
      map,
      items: [], traps: [],
      vents: [{ id: "v1", x: 1, y: 2, type: "vent" }],
      pentacles: [{ id: "p1", x: 1, y: 2, kind: "light", name: "明かりの魔方陣" }],
      springs: [{ id: "s1", x: 1, y: 2, contents: [] }],
      bigboxes: [{ id: "b1", x: 1, y: 2, kind: "identify", name: "鑑定の大箱", revealed: true }],
    };
    const fl = listFloorInventoryEntries(dg, 1, 2, { ident: new Set(["n:light"]) });
    expect(fl.fixtures.some((f) => f._floorRole === "stair")).toBe(true);
    expect(fl.fixtures.length).toBeGreaterThanOrEqual(5);
  });
});

describe("labels and action counts", () => {
  it("ラベルと説明のみアクション", () => {
    const pent = { _floorRole: "pentacle", name: "聖域の魔方陣" };
    expect(floorEntryLabel(pent, [], [])).toBe("【魔方陣】聖域の魔方陣");
    expect(floorEntryActionCount(pent, [], [])).toBe(1);
    expect(FLOOR_INFO_ROLES.has("pentacle")).toBe(true);
    expect(floorEntryRole(pent, [], [])).toBe("pentacle");
  });
});
