import { describe, expect, it } from "vitest";
import { MH, MW, T } from "../utils.js";
import { advancePlayerTerrainEffects } from "../playerTerrainEffects.js";

function makeMap() {
  return Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
}

function makeDungeon(map, overrides = {}) {
  return { map, monsters: [], springs: [], ...overrides };
}

describe("advancePlayerTerrainEffects", () => {
  it("壁抜けが壁内で切れると、最初の空きマスへ押し出す", () => {
    const map = makeMap();
    map[5][5] = T.WALL;
    const player = { x: 5, y: 5, hp: 30, wallWalkTurns: 1, rings: [] };
    const messages = [];

    advancePlayerTerrainEffects(player, makeDungeon(map), messages);

    expect(player).toMatchObject({ x: 4, y: 5, hp: 30, wallWalkTurns: 0 });
    expect(messages).toEqual(["壁抜けが解けた！", "壁の外に押し出された！"]);
  });

  it("壺の中で深水にいる場合は移動せず、溺水ダメージを受ける", () => {
    const map = makeMap();
    map[5][5] = T.WATER;
    const player = { x: 5, y: 5, hp: 10, potConfinedTurns: 2, rings: [] };
    const messages = [];

    advancePlayerTerrainEffects(player, makeDungeon(map), messages);

    expect(player).toMatchObject({ x: 5, y: 5, hp: -5, deathCause: "水没により" });
    expect(messages).toEqual(["水中の壺の中で息ができない！15ダメージ！"]);
  });
});
