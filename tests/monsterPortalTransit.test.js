import { describe, expect, it } from "vitest";
import { transitMonstersThroughPortals } from "../monsterPortalTransit.js";

function snapshot(monster, x, y) {
  return new Map([[monster.id, { x, y }]]);
}

describe("transitMonstersThroughPortals", () => {
  it("移動して固定転送陣に乗った敵を対の陣へ送り、着地済みなら再転送しない", () => {
    const monster = { id: "m1", name: "ゴブリン", x: 2, y: 2 };
    const start = { kind: "fixed_portal", pairId: "p", x: 2, y: 2 };
    const end = { kind: "fixed_portal", pairId: "p", x: 8, y: 8 };
    const state = { dungeon: { monsters: [monster], pentacles: [start, end] } };
    const player = { x: 5, y: 5, inventory: [] };
    const messages = [];

    transitMonstersThroughPortals(state, player, messages, snapshot(monster, 1, 2), { randomTeleportDest: () => null });
    expect(monster).toMatchObject({ x: 8, y: 8 });
    expect(messages).toEqual(["ゴブリンが転送の魔法陣から対の陣へ抜けた！"]);

    transitMonstersThroughPortals(state, player, messages, snapshot(monster, 8, 8), { randomTeleportDest: () => null });
    expect(monster).toMatchObject({ x: 8, y: 8 });
    expect(messages).toHaveLength(1);
  });

  it("呪われたポータルは空いているランダムな行き先へ送る", () => {
    const monster = { id: "m1", name: "ゴブリン", x: 2, y: 2 };
    const portal = { name: "呪われたポータル", kind: "portal", cursed: true, x: 2, y: 2 };
    const state = { dungeon: { monsters: [monster], pentacles: [portal] } };
    const messages = [];

    transitMonstersThroughPortals(state, { x: 5, y: 5, inventory: [] }, messages, snapshot(monster, 1, 2), {
      randomTeleportDest: () => ({ x: 7, y: 7 }),
    });

    expect(monster).toMatchObject({ x: 7, y: 7 });
    expect(messages).toEqual(["ゴブリンが呪われたポータルに飲まれてランダムに飛んだ！【呪】"]);
  });
});
