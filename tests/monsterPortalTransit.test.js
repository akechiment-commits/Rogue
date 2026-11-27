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

  it("大型は体の一部が固定転送陣に触れても転送し、着地先では再転送しない", () => {
    const monster = { id: "m2", name: "大型ゴブリン", x: 2, y: 2, bodySize: 2 };
    const start = { kind: "fixed_portal", pairId: "p", x: 3, y: 3 };
    const end = { kind: "fixed_portal", pairId: "p", x: 8, y: 8 };
    const state = { dungeon: { monsters: [monster], pentacles: [start, end] } };
    const player = { x: 5, y: 5, inventory: [] };
    const messages = [];

    // 基準マス (2,2) の体 (2,2)(3,2)(2,3)(3,3) が (3,3) の陣に触れる。前ターン (1,2) の体は触れない
    transitMonstersThroughPortals(state, player, messages, snapshot(monster, 1, 2), { randomTeleportDest: () => null });
    expect(monster).toMatchObject({ x: 8, y: 8 });
    expect(messages).toHaveLength(1);

    // 着地先の陣に体が触れたままでは再転送しない（無限ワープ防止）
    transitMonstersThroughPortals(state, player, messages, snapshot(monster, 8, 8), { randomTeleportDest: () => null });
    expect(monster).toMatchObject({ x: 8, y: 8 });
    expect(messages).toHaveLength(1);
  });

  function twoFloors(monster) {
    const a = { kind: "portal", name: "ポータル", blessed: true, x: 2, y: 2, drawOrder: 1 };
    const b = { kind: "portal", name: "ポータル", blessed: true, x: 6, y: 6, drawOrder: 2 };
    const dungeon = { monsters: [monster], pentacles: [a] };
    const other = { monsters: [], pentacles: [b], map: undefined };
    return { state: { dungeon, floors: { 2: other } }, dungeon, other };
  }
  const noRand = { randomTeleportDest: () => null };

  it("同じ階のポータルへ抜ける分身は消滅しない", () => {
    const clone = { id: "c", name: "分身", isPlayerClone: true, x: 2, y: 2 };
    const a = { kind: "portal", name: "ポータル", x: 2, y: 2, drawOrder: 1 };
    const b = { kind: "portal", name: "ポータル", x: 6, y: 6, drawOrder: 2 };
    const state = { dungeon: { monsters: [clone], pentacles: [a, b] } };
    transitMonstersThroughPortals(state, { x: 5, y: 5, inventory: [] }, [], snapshot(clone, 1, 2), noRand);
    expect(state.dungeon.monsters).toContain(clone);
    expect(clone).toMatchObject({ x: 6, y: 6 });
  });

  it("分身は別階のポータルへ入ると消滅する", () => {
    const clone = { id: "c", name: "分身", isPlayerClone: true, x: 2, y: 2 };
    const { state, dungeon, other } = twoFloors(clone);
    transitMonstersThroughPortals(state, { x: 5, y: 5, inventory: [] }, [], snapshot(clone, 1, 2), noRand);
    expect(dungeon.monsters).not.toContain(clone);
    expect(other.monsters).not.toContain(clone);
  });

  it("ボスと非敵対の店主は別階へ転送されない", () => {
    for (const mon of [
      { id: "b", name: "ボス", isBoss: true, x: 2, y: 2 },
      { id: "s", name: "店主", type: "shopkeeper", state: "blocking", x: 2, y: 2 },
    ]) {
      const { state, dungeon, other } = twoFloors(mon);
      transitMonstersThroughPortals(state, { x: 5, y: 5, inventory: [] }, [], snapshot(mon, 1, 2), noRand);
      expect(dungeon.monsters).toContain(mon);
      expect(other.monsters).toHaveLength(0);
    }
  });
});
