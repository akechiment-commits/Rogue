import { describe, it, expect } from "vitest";
import {
  listFloorInventoryEntries,
  floorEntryRole,
  floorEntryLabel,
  floorEntryActionCount,
  VENT_FLOOR_DESC,
  FLOOR_INFO_ROLES,
} from "../floorInventory.js";

describe("listFloorInventoryEntries", () => {
  it("風穴・全魔方陣・泉・大箱を足元一覧に含める", () => {
    const dg = {
      items: [{ id: "i1", x: 1, y: 2, type: "potion", name: "薬" }],
      traps: [{ id: "t1", x: 1, y: 2, name: "眠りの罠", effect: "sleep" }],
      vents: [{ id: "v1", x: 1, y: 2, type: "vent", name: "風穴", tile: 128 }],
      pentacles: [
        { id: "p1", x: 1, y: 2, kind: "sanctuary", name: "聖域の魔方陣" },
        { id: "p2", x: 1, y: 2, kind: "fixed_portal", name: "転送の魔法陣" },
        { id: "p3", x: 3, y: 3, kind: "light", name: "明かりの魔方陣" },
      ],
      springs: [{ id: "s1", x: 1, y: 2, tile: 15, contents: [] }],
      bigboxes: [{ id: "b1", x: 1, y: 2, kind: "identify", name: "鑑定の大箱", revealed: true }],
    };
    const fl = listFloorInventoryEntries(dg, 1, 2, { allBcKnown: false });
    expect(fl.items).toHaveLength(1);
    expect(fl.traps).toHaveLength(1);
    expect(fl.fixtures.some((f) => f._floorRole === "vent")).toBe(true);
    expect(fl.fixtures.filter((f) => f._floorRole === "pentacle")).toHaveLength(2);
    expect(fl.fixtures.some((f) => f._floorRole === "spring")).toBe(true);
    expect(fl.fixtures.some((f) => f._floorRole === "bigbox")).toBe(true);
    const sanc = fl.fixtures.find((f) => f.kind === "sanctuary");
    expect(sanc.desc).toMatch(/聖域|モンスター/);
    const spring = fl.fixtures.find((f) => f._floorRole === "spring");
    expect(spring.desc).toMatch(/泉/);
    const bb = fl.fixtures.find((f) => f._floorRole === "bigbox");
    expect(bb.name).toBe("鑑定の大箱");
    expect(bb.desc).toMatch(/識別/);
  });

  it("未識別の大箱は偽名と不明説明", () => {
    const dg = {
      items: [], traps: [], vents: [], pentacles: [], springs: [],
      bigboxes: [{ id: "b1", x: 0, y: 0, kind: "identify", name: "鑑定の大箱", revealed: false }],
    };
    const fl = listFloorInventoryEntries(dg, 0, 0, {
      bbFakeNames: { identify: "木の箱" },
    });
    const bb = fl.all[0];
    expect(bb.name).toBe("木の箱");
    expect(bb.desc).toMatch(/正体不明/);
  });

  it("別マスのオブジェクトは含めない", () => {
    const dg = {
      items: [],
      traps: [],
      vents: [{ id: "v1", x: 0, y: 0, type: "vent" }],
      pentacles: [{ id: "p1", x: 5, y: 5, kind: "portal", name: "ポータル" }],
      springs: [],
      bigboxes: [],
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
  const pent = { _floorRole: "pentacle", name: "聖域の魔方陣" };
  const spring = { _floorRole: "spring", name: "泉" };
  const bigbox = { _floorRole: "bigbox", name: "鑑定の大箱" };

  it("役割判定", () => {
    expect(floorEntryRole(items[0], items, traps)).toBe("item");
    expect(floorEntryRole(traps[0], items, traps)).toBe("trap");
    expect(floorEntryRole(vent, items, traps)).toBe("vent");
    expect(floorEntryRole(pent, items, traps)).toBe("pentacle");
    expect(floorEntryRole(spring, items, traps)).toBe("spring");
    expect(floorEntryRole(bigbox, items, traps)).toBe("bigbox");
  });

  it("ラベル", () => {
    expect(floorEntryLabel(traps[0], items, traps)).toBe("【罠】罠A");
    expect(floorEntryLabel(vent, items, traps)).toBe("【風穴】風穴");
    expect(floorEntryLabel(pent, items, traps)).toBe("【魔方陣】聖域の魔方陣");
    expect(floorEntryLabel(spring, items, traps)).toBe("【泉】泉");
    expect(floorEntryLabel(bigbox, items, traps)).toBe("【大箱】鑑定の大箱");
  });

  it("アクション数", () => {
    expect(floorEntryActionCount(traps[0], items, traps)).toBe(2);
    for (const e of [vent, pent, spring, bigbox]) {
      expect(FLOOR_INFO_ROLES.has(e._floorRole)).toBe(true);
      expect(floorEntryActionCount(e, items, traps)).toBe(1);
    }
    const food = { type: "food" };
    expect(floorEntryActionCount(food, [food], traps, () => true)).toBe(4);
  });

  it("VENT_FLOOR_DESC が定義されている", () => {
    expect(VENT_FLOOR_DESC.length).toBeGreaterThan(10);
  });
});
