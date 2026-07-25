import { describe, expect, it } from "vitest";
import { MH, MW } from "../utils.js";
import { applyVisibilityOverrides } from "../visibilityOverrides.js";

function dungeon(overrides = {}) {
  const room = { x: 2, y: 2, w: 4, h: 4 };
  return {
    rooms: [room], pentacles: [], monsters: [],
    visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    ...overrides,
  };
}
const deps = { findRoom: (rooms) => rooms[0], inMagicSealRoom: () => false };

describe("applyVisibilityOverrides", () => {
  it("祝福された明かりはフロア全体を可視化する", () => {
    const dg = dungeon({ pentacles: [{ kind: "light", blessed: true, x: 3, y: 3 }] });
    applyVisibilityOverrides(dg, { x: 3, y: 3, hp: 10 }, deps);
    expect(dg.visible[0][0]).toBe(true);
    expect(dg.explored[MH - 1][MW - 1]).toBe(true);
  });

  it("暗闇モンスターは同じ部屋で最後に視界を隣接1マスへ制限する", () => {
    const dg = dungeon({ monsters: [{ baseKind: "starlight", hp: 10, x: 3, y: 3 }, { baseKind: "darkness", hp: 10, x: 4, y: 3 }] });
    applyVisibilityOverrides(dg, { x: 3, y: 3, hp: 10 }, deps);
    expect(dg.visible[3][3]).toBe(true);
    expect(dg.visible[2][2]).toBe(true);
    expect(dg.visible[2][5]).toBe(false);
  });
});
