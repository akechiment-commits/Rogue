import { afterEach, describe, expect, it, vi } from "vitest";
import { confineMonsterInImprisonPot, doExplosion, doGunpowderExplosion, doTimeBombExplosion, killMonster } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { MONS, makeMonsterFromBase } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

afterEach(() => vi.restoreAllMocks());

describe("床のとじこめ壺の破壊", () => {
  it.each(["explosion", "gunpowder", "timebomb", "pentacle", "dig", "soften", "lightning"])("%sで壺が消えても閉じ込め敵を消失させない", route => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const player = makePlayer({ x: 20, y: 20, actionTime: 1200, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 25, h: 25 }] });
    const pot = { id: "prison", name: "とじこめの壺", type: "pot", potEffect: "imprison", capacity: 3, contents: [], confinedMonsters: [], x: 10, y: 10 };
    const enemy = makeMonsterFromBase(MONS[0], 2, 10, 10);
    enemy.actionTime = 24;
    dungeon.monsters.push(enemy);
    confineMonsterInImprisonPot(pot, enemy, dungeon, []);
    dungeon.items.push(pot);
    const messages = [], levelUp = vi.fn();
    if (route === "explosion") doExplosion(10, 10, dungeon, player, messages);
    else if (route === "gunpowder") doGunpowderExplosion(10, 10, dungeon, player, messages, levelUp);
    else if (route === "timebomb") doTimeBombExplosion(10, 10, dungeon, player, messages, levelUp);
    else if (route === "pentacle") {
      dungeon.pentacles.push({ id: "explosion-pc", name: "爆発の魔方陣", kind: "explosion", x: 9, y: 10 });
      const victim = { id: "victim", name: "敵", hp: 0, maxHp: 7, x: 9, y: 10, exp: 0 };
      dungeon.monsters.push(victim);
      killMonster(victim, dungeon, player, messages, levelUp);
    } else {
      applyWandEffect(route, "item", pot, 1, 0, dungeon, player, messages, levelUp);
    }
    expect(dungeon.items).not.toContain(pot);
    const released = dungeon.monsters.find(mon => mon.name === enemy.name);
    expect(released).toBeDefined();
    expect(pot.confinedMonsters).toHaveLength(0);
    expect(released.hp).toBe(enemy.hp);
    expect(released.actionTime).toBe(player.actionTime);
    expect(messages).toContain(`${enemy.name}が現れた！`);
  });
  it("深い水上で壺が割れた場合は、放出された非水棲の敵が水没する", () => {
    const player = makePlayer({ x: 20, y: 20 });
    const dungeon = makeEmptyDg();
    const pot = { id: "wet-prison", name: "とじこめの壺", type: "pot", potEffect: "imprison", capacity: 1, contents: [], confinedMonsters: [], x: 10, y: 10 };
    const enemy = makeMonsterFromBase(MONS[0], 2, 10, 10);
    dungeon.monsters.push(enemy);
    confineMonsterInImprisonPot(pot, enemy, dungeon, []);
    dungeon.items.push(pot);
    dungeon.map[10][10] = T.WATER;
    const messages = [];
    doExplosion(10, 10, dungeon, player, messages);
    expect(dungeon.items).not.toContain(pot);
    expect(pot.confinedMonsters).toHaveLength(0);
    expect(dungeon.monsters).toHaveLength(0);
    expect(messages).toContain(`${enemy.name}は水没した！`);
  });
  it("爆発が無効なら壺も閉じ込めた敵も維持する", () => {
    const player = makePlayer({ x: 20, y: 20 });
    const dungeon = makeEmptyDg({ pentacles: [{ id: "suppress", kind: "explosion", cursed: true, x: 9, y: 10 }] });
    const pot = { id: "safe-prison", name: "とじこめの壺", type: "pot", potEffect: "imprison", capacity: 1, contents: [], confinedMonsters: [], x: 10, y: 10 };
    const enemy = makeMonsterFromBase(MONS[0], 2, 10, 10);
    dungeon.monsters.push(enemy);
    confineMonsterInImprisonPot(pot, enemy, dungeon, []);
    dungeon.items.push(pot);
    doGunpowderExplosion(10, 10, dungeon, player, [], vi.fn());
    expect(dungeon.items).toContain(pot);
    expect(pot.confinedMonsters).toHaveLength(1);
    expect(dungeon.monsters).toHaveLength(0);
  });
});
