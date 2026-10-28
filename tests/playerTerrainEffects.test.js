import { afterEach, describe, expect, it, vi } from "vitest";
import { MH, MW, T } from "../utils.js";
import { advancePlayerTerrainEffects } from "../playerTerrainEffects.js";
import { fireTrapPlayer } from "../traps.js";
import { resolveTurnHazards } from "../turnHazards.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

function makeMap() {
  return Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
}

function makeDungeon(map, overrides = {}) {
  return { map, monsters: [], springs: [], ...overrides };
}

describe("advancePlayerTerrainEffects", () => {
  it.each([T.WALL, T.WATER])("地形%sからの押し出し先で既知の落とし穴が発動する", tile => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player = makePlayer({ wallWalkTurns: tile === T.WALL ? 1 : 0 });
    const trap = { id: "pit", x: 4, y: 5, name: "落とし穴", effect: "pitfall", revealed: true };
    const dungeon = makeEmptyDg({ traps: [trap] });
    dungeon.map[5][5] = tile;
    const messages = [];
    const fireTrapFn = vi.fn((...args) => fireTrapPlayer(...args));
    const result = advancePlayerTerrainEffects(player, dungeon, messages, { fireTrapFn });
    expect(result).toBe("pitfall");
    expect(player).toMatchObject({ x: 4, y: 5, hp: 95 });
    expect(fireTrapFn).toHaveBeenCalledTimes(1);
    expect(messages.some(message => message.includes("穴に落ちた"))).toBe(true);
  });

  it("押し出し先の地雷を同じターンの発火処理へ渡す", () => {
    const player = makePlayer({ wallWalkTurns: 1 });
    const trap = { id: "mine", x: 4, y: 5, name: "地雷", effect: "explode" };
    const dungeon = makeEmptyDg({ traps: [trap] });
    dungeon.map[5][5] = T.WALL;
    const messages = [];
    expect(advancePlayerTerrainEffects(player, dungeon, messages, { fireTrapFn: fireTrapPlayer }))
      .toBe("deferred_explosion");
    const runMineExplosion = vi.fn();
    resolveTurnHazards({ dungeon }, player, messages, {
      hasRingEffect: () => false, runMineExplosion, tickTimedEffects: false,
    });
    expect(runMineExplosion).toHaveBeenCalledTimes(1);
    expect(dungeon._pendingMineExplosion).toBeUndefined();
  });

  it.each([{ floatTurns: 5 }, { timeStopped: true }])("浮遊・時間停止%sでは押し出し先の罠を発動しない", condition => {
    const player = makePlayer({ wallWalkTurns: 1, floatTurns: condition.floatTurns || 0 });
    const dungeon = makeEmptyDg({
      timeStopTurns: condition.timeStopped ? 5 : 0,
      traps: [{ id: "pit", x: 4, y: 5, effect: "pitfall" }],
    });
    dungeon.map[5][5] = T.WALL;
    const fireTrapFn = vi.fn();
    advancePlayerTerrainEffects(player, dungeon, [], { fireTrapFn });
    expect(player.x).toBe(4);
    expect(fireTrapFn).not.toHaveBeenCalled();
    expect(dungeon.traps[0].revealed).toBeUndefined();
  });

  it("移動していなければ足元の罠を再起動しない", () => {
    const player = makePlayer();
    const dungeon = makeEmptyDg({ traps: [{ x: 5, y: 5, effect: "pitfall" }] });
    const fireTrapFn = vi.fn();
    advancePlayerTerrainEffects(player, dungeon, [], { fireTrapFn });
    expect(fireTrapFn).not.toHaveBeenCalled();
  });

  it("壁から水へ、さらに陸へ押し出されても最終着地点だけで1回発動する", () => {
    const player = makePlayer({ wallWalkTurns: 1 });
    const dungeon = makeEmptyDg({ traps: [{ x: 3, y: 5, effect: "pitfall" }] });
    dungeon.map[5][5] = T.WALL;
    dungeon.map[5][4] = T.WATER;
    const fireTrapFn = vi.fn();
    advancePlayerTerrainEffects(player, dungeon, [], { fireTrapFn });
    expect(player).toMatchObject({ x: 3, y: 5 });
    expect(fireTrapFn).toHaveBeenCalledTimes(1);
  });

  it("壁抜けが壁内で切れると、最初の空きマスへ押し出す", () => {
    const map = makeMap();
    map[5][5] = T.WALL;
    const player = { x: 5, y: 5, hp: 30, wallWalkTurns: 1, rings: [] };
    const messages = [];

    advancePlayerTerrainEffects(player, makeDungeon(map), messages);

    expect(player).toMatchObject({ x: 4, y: 5, hp: 30, wallWalkTurns: 0 });
    expect(messages).toEqual(["壁抜けが解けた！", "壁の外に押し出された！"]);
    expect(player._wallSuffocationDamage).toBe(false);
  });

  it("壁抜け中は窒息ダメージも窒息立ち絵フラグも発生しない", () => {
    const map = makeMap();
    map[5][5] = T.WALL;
    const player = { x: 5, y: 5, hp: 30, wallWalkTurns: 2, rings: [] };
    const messages = [];

    advancePlayerTerrainEffects(player, makeDungeon(map), messages);

    expect(player).toMatchObject({ hp: 30, wallWalkTurns: 1, _wallSuffocationDamage: false });
    expect(messages).toEqual([]);
  });

  it("壁の中で壁ダメージを受けたターンだけ窒息立ち絵フラグを立てる", () => {
    const map = makeMap();
    map[5][5] = T.WALL;
    const player = { x: 5, y: 5, hp: 30, wallWalkTurns: 0, rings: [] };
    const messages = [];

    advancePlayerTerrainEffects(player, makeDungeon(map), messages);

    expect(player).toMatchObject({ hp: 15, _wallSuffocationDamage: true });
    expect(messages).toEqual(["壁に挟まれて苦しい！15ダメージ！"]);
  });

  it("壺の中で深水にいる場合は移動せず、溺水ダメージを受ける", () => {
    const map = makeMap();
    map[5][5] = T.WATER;
    const player = { x: 5, y: 5, hp: 10, potConfinedTurns: 2, rings: [] };
    const messages = [];

    advancePlayerTerrainEffects(player, makeDungeon(map), messages);

    expect(player).toMatchObject({ x: 5, y: 5, hp: -5, deathCause: "水没により", _waterSuffocationDamage: true });
    expect(messages).toEqual(["水中の壺の中で息ができない！15ダメージ！"]);
  });
});
