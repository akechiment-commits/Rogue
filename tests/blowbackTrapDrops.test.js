import { afterEach, describe, expect, it, vi } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import { fireTrapItem } from "../items.js";
import { MONS, makeMonsterFromBase } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("吹き飛ばしの罠の衝突で倒れた敵の所持品", () => {
  it.each(["item", "player"].flatMap(route => ["stealthrower", "leprechaun", "gelcube", "synthmonster"].map(baseKind => [route, baseKind])))("%sで罠を起動して%sへ衝突しても、持っていた品を失わない", (route, baseKind) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const held = { id: "held", name: "命の指輪", type: "ring", effect: "life_ring", plus: -1 };
    const victim = makeMonsterFromBase(MONS.find(monster => monster.baseKind === baseKind), 1, 4, 5);
    victim.hp = 5;
    if (baseKind === "stealthrower") victim._stealthrowerHeldItem = held;
    if (baseKind === "leprechaun") victim.heldGold = 500;
    if (baseKind === "gelcube") victim.heldItems = [held];
    if (baseKind === "synthmonster") victim.synthBox = { contents: [held] };
    const player = makePlayer({ facing: { dx: 1, dy: 0 }, exp: 0 });
    const trap = { id: "blowback", name: "吹き飛ばしの罠", effect: "blowback_trap", x: 5, y: 5, permanent: true };
    const dungeon = makeEmptyDg({ monsters: [victim], traps: [trap] });
    const messages = [];
    if (route === "player") fireTrapPlayer(trap, player, dungeon, messages);
    else fireTrapItem(trap, { name: "石", type: "arrow" }, dungeon, 5, 5, messages, new Set(), player);
    expect(player.hp).toBe(90);
    expect(player.exp).toBe(0);
    expect(dungeon.monsters).not.toContain(victim);
    if (baseKind === "leprechaun") {
      expect(dungeon.items.filter(item => item.type === "gold" && item.value === 500)).toHaveLength(1);
      expect(victim.heldGold).toBe(0);
    } else {
      expect(dungeon.items.filter(item => item.id === held.id)).toHaveLength(1);
      expect(held.plus).toBe(-1);
    }
  });

  it.each(["player", "item"])("%sで起動しても、生き残った敵は所持品を保持する", route => {
    const held = { id: "held", name: "命の指輪", type: "ring" };
    const victim = makeMonsterFromBase(MONS.find(monster => monster.baseKind === "stealthrower"), 1, 4, 5);
    victim.hp = 20;
    victim._stealthrowerHeldItem = held;
    const player = makePlayer({ facing: { dx: 1, dy: 0 } });
    const trap = { id: "blowback", name: "吹き飛ばしの罠", effect: "blowback_trap", x: 5, y: 5, permanent: true };
    const dungeon = makeEmptyDg({ monsters: [victim], traps: [trap] });
    if (route === "player") fireTrapPlayer(trap, player, dungeon, []);
    else fireTrapItem(trap, { name: "石", type: "arrow" }, dungeon, 5, 5, [], new Set(), player);
    expect(victim.hp).toBe(10);
    expect(dungeon.monsters).toContain(victim);
    expect(victim._stealthrowerHeldItem).toBe(held);
    expect(dungeon.items).not.toContain(held);
  });
});
