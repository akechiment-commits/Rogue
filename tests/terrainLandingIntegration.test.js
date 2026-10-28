import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advancePlayerTerrainEffects } from "../playerTerrainEffects.js";
import { fireTrapPlayer } from "../traps.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

// endTurnの地形処理から階移動まで、実際の接続を実行する。
const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
const start = source.indexOf("        const _terrainTrap = advancePlayerTerrainEffects(");
const end = source.indexOf("        resolvePlayerPentacleEffects(", start);
if (start < 0 || end < 0) throw new Error("Terrain landing callback not found");
function runTerrainLanding(st, p, ml, chgFloor) {
  const deps = { st, p, ml, chgFloor, advancePlayerTerrainEffects, fireTrapPlayer,
    trackTrap: vi.fn(), showFirstEncounterTip: vi.fn(), itemDisplayName: item => item.name, lu: vi.fn() };
  new Function(...Object.keys(deps), source.slice(start, end))(...Object.values(deps));
}

describe("地形の押し出しとendTurnの接続", () => {
  it.each([T.WALL, T.WATER])("地形%sの押し出しから落とし穴で階移動する", tile => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player = makePlayer({ depth: 1, wallWalkTurns: tile === T.WALL ? 1 : 0 });
    const dungeon = makeEmptyDg({ traps: [{ id: "pit", x: 4, y: 5, effect: "pitfall", name: "落とし穴" }] });
    dungeon.map[5][5] = tile;
    const nextDungeon = makeEmptyDg();
    const chgFloor = vi.fn(p => { p.depth++; return nextDungeon; });
    const state = { dungeon, ident: new Set() }, messages = [];
    runTerrainLanding(state, player, messages, chgFloor);
    expect(chgFloor).toHaveBeenCalledExactlyOnceWith(player, 1, true);
    expect(state.dungeon).toBe(nextDungeon);
    expect(messages).toContain("地下2階に落ちた！");
  });

  it("落下ダメージが致死なら階移動しない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player = makePlayer({ hp: 1, depth: 1, wallWalkTurns: 1 });
    const dungeon = makeEmptyDg({ traps: [{ id: "pit", x: 4, y: 5, effect: "pitfall", name: "落とし穴" }] });
    dungeon.map[5][5] = T.WALL;
    const state = { dungeon, ident: new Set() }, chgFloor = vi.fn();
    runTerrainLanding(state, player, [], chgFloor);
    expect(player.hp).toBeLessThanOrEqual(0);
    expect(chgFloor).not.toHaveBeenCalled();
    expect(state.dungeon).toBe(dungeon);
  });
});
