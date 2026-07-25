import { describe, expect, it } from "vitest";
import {
  findFixedPortalPair,
  statueAt,
  wandEffectBreaksStatue,
  wandEffectStatueLootOnly,
} from "../fixtureQueries.js";

describe("fixtureQueries", () => {
  it("座標上の石像を返す", () => {
    const statue = { id: "statue", x: 3, y: 4 };
    const dungeon = { statues: [statue] };
    expect(statueAt(dungeon, 3, 4)).toBe(statue);
    expect(statueAt(dungeon, 4, 3)).toBeNull();
  });

  it("同じpairIdを持つ別の固定転送陣を返す", () => {
    const source = { kind: "fixed_portal", pairId: "pair", x: 1, y: 1 };
    const destination = { kind: "fixed_portal", pairId: "pair", x: 8, y: 8 };
    const dungeon = { pentacles: [source, destination] };
    expect(findFixedPortalPair(dungeon, source)).toBe(destination);
  });

  it("石像を壊す杖効果と報酬だけ出す効果を判定する", () => {
    expect(wandEffectBreaksStatue("fire")).toBe(true);
    expect(wandEffectBreaksStatue("warp")).toBe(false);
    expect(wandEffectStatueLootOnly("dig")).toBe(true);
    expect(wandEffectStatueLootOnly("fire")).toBe(false);
  });
});
