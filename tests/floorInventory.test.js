import { describe, it, expect } from "vitest";
import {
  listFloorInventoryEntries,
  floorEntryRole,
  floorEntryLabel,
  floorEntryActionCount,
  VENT_FLOOR_DESC,
  FIXED_PORTAL_FLOOR_DESC,
} from "../floorInventory.js";

describe("listFloorInventoryEntries", () => {
  it("風穴と転送魔法陣を足元一覧に含める", () => {
    const dg = {
      items: [{ id: "i1", x: 1, y: 2, type: "potion", name: "薬" }],
      traps: [{ id: "t1", x: 1, y: 2, name: "眠りの罠", effect: "sleep" }],
      vents: [{ id: "v1", x: 1, y: 2, type: "vent", name: "風穴", tile: 128 }],
      pentacles: [
        { id: "p1", x: 1, y: 2, kind: "fixed_portal", name: "転送の魔法陣" },
        { id: "p2", x: 3, y: 3, kind: "sanctuary", name: "聖域" },
      ],
    };
    const fl = listFloorInventoryEntries(dg, 1, 2);
    expect(fl.items).toHaveLength(1);
    expect(fl.traps).toHaveLength(1);
    expect(fl.fixtures).toHaveLength(2);
    expect(fl.all).toHaveLength(4);
    expect(fl.fixtures.some((f) => f._floorRole === "vent")).toBe(true);
    expect(fl.fixtures.some((f) => f._floorRole === "portal")).toBe(true);
    const vent = fl.fixtures.find((f) => f._floorRole === "vent");
    expect(vent.desc).toContain("物理飛び道具");
    const portal = fl.fixtures.find((f) => f._floorRole === "portal");
    expect(portal.desc).toBe(FIXED_PORTAL_FLOOR_DESC);
  });

  it("別マスのオブジェクトは含めない", () => {
    const dg = {
      items: [],
      traps: [],
      vents: [{ id: "v1", x: 0, y: 0, type: "vent" }],
      pentacles: [{ id: "p1", x: 5, y: 5, kind: "portal", name: "ポータル" }],
    };
    const fl = listFloorInventoryEntries(dg, 0, 0);
    expect(fl.all).toHaveLength(1);
    expect(fl.all[0]._floorRole).toBe("vent");
  });
});

describe("floorEntryRole / label / actionCount", () => {
  const items = [{ id: "i" }];
  const traps = [{ id: "t", name: "罠A" }];
  const vent = { _floorRole: "vent", name: "風穴" };
  const portal = { _floorRole: "portal", name: "転送の魔法陣" };

  it("役割判定", () => {
    expect(floorEntryRole(items[0], items, traps)).toBe("item");
    expect(floorEntryRole(traps[0], items, traps)).toBe("trap");
    expect(floorEntryRole(vent, items, traps)).toBe("vent");
    expect(floorEntryRole(portal, items, traps)).toBe("portal");
  });

  it("ラベル", () => {
    expect(floorEntryLabel(traps[0], items, traps)).toBe("【罠】罠A");
    expect(floorEntryLabel(vent, items, traps)).toBe("【風穴】風穴");
    expect(floorEntryLabel(portal, items, traps)).toBe("【魔方陣】転送の魔法陣");
  });

  it("アクション数", () => {
    expect(floorEntryActionCount(traps[0], items, traps)).toBe(2);
    expect(floorEntryActionCount(vent, items, traps)).toBe(1);
    expect(floorEntryActionCount(portal, items, traps)).toBe(1);
    const food = { type: "food" };
    expect(floorEntryActionCount(food, [food], traps, () => true)).toBe(4);
  });

  it("VENT_FLOOR_DESC が定義されている", () => {
    expect(VENT_FLOOR_DESC.length).toBeGreaterThan(10);
  });
});
