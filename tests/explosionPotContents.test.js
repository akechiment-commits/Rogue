import { afterEach, describe, expect, it, vi } from "vitest";
import { doExplosion, doGunpowderExplosion, doTimeBombExplosion } from "../items.js";
import "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

function breakPotBesideMine(route, playerOverrides = {}, withSibling = false) {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  const contents = [
    { id: "sword", name: "短剣", type: "weapon", atk: 3 },
    { id: "shield", name: "革の盾", type: "armor", def: 2 },
    { id: "ring", name: "命の指輪", type: "ring", effect: "life", plus: 1 },
  ];
  const pot = { id: "pot", name: "保存の壺", type: "pot", potEffect: "none", capacity: 3, contents, x: 5, y: 5 };
  const mine = { id: "mine", name: "地雷", effect: "explode", x: 4, y: 5, permanent: true };
  const player = makePlayer({ x: 3, y: 5, depth: 1, ...playerOverrides });
  const dungeon = makeEmptyDg({ items: [pot], traps: [mine] });
  const sibling = { id: "sibling-pot", name: "保存の壺B", type: "pot", potEffect: "none", capacity: 1,
    contents: [{ id: "sibling-ring", name: "守りの指輪", type: "ring", effect: "defense_ring", plus: 1 }], x: 5, y: 6 };
  if (withSibling) dungeon.items.push(sibling);
  const messages = [], levelUp = vi.fn();
  if (route === "explosion") doExplosion(5, 5, dungeon, player, messages, null, "爆発", null, levelUp);
  else if (route === "gunpowder") doGunpowderExplosion(6, 5, dungeon, player, messages, levelUp);
  else doTimeBombExplosion(6, 5, dungeon, player, messages, levelUp);
  return { pot, sibling, player, dungeon, messages };
}

describe("爆風で割れた壺の中身と地雷", () => {
  it.each(["explosion", "gunpowder", "timebomb"])("%sから散らばった道具が起動した地雷はプレイヤーにも当たる", route => {
    const { player, messages } = breakPotBesideMine(route);
    expect(messages.filter(message => message.startsWith("地雷が発動！"))).toHaveLength(1);
    expect(player.hp).toBe(50);
  });

  it.each(["explosion", "gunpowder", "timebomb"])("%sから中身が起動した地雷で同じ壺を再び割らず、中身を増殖させない", route => {
    const { pot, dungeon, messages } = breakPotBesideMine(route);
    expect.soft(messages.filter(message => message.startsWith('壺「保存の壺」が爆発で割れ'))).toHaveLength(1);
    expect.soft(dungeon.items.filter(item => item.id === "ring")).toHaveLength(1);
    expect.soft(new Set(dungeon.items.map(item => item.id)).size).toBe(dungeon.items.length);
    expect(dungeon.items).not.toContain(pot);
    expect.soft(pot.contents).toEqual([]);
  });

  it.each(["explosion", "gunpowder", "timebomb"])("%sから中身が起動した地雷でも耐火を考慮する", route => {
    const { player } = breakPotBesideMine(route, { armor: { abilities: ["fire_resist"] } });
    expect(player.hp).toBe(67);
  });

  it.each(["explosion", "gunpowder", "timebomb"])("%sから中身が起動した地雷の範囲外ならダメージを受けない", route => {
    const { player } = breakPotBesideMine(route, { x: 20, y: 20 });
    expect(player.hp).toBe(100);
  });

  it.each(["explosion", "gunpowder", "timebomb"])("%sで別の壺も地雷の連鎖に巻き込まれても、各壺の中身は一度だけ放出する", route => {
    const { pot, sibling, dungeon, messages } = breakPotBesideMine(route, { x: 20, y: 20 }, true);
    expect(messages.filter(message => message.startsWith('壺「保存の壺B」が爆発で割れ'))).toHaveLength(1);
    expect(dungeon.items.filter(item => item.id === "sibling-ring")).toHaveLength(1);
    expect(new Set(dungeon.items.map(item => item.id)).size).toBe(dungeon.items.length);
    expect(pot.contents).toEqual([]);
    expect(sibling.contents).toEqual([]);
    expect(dungeon.items).not.toContain(pot);
    expect(dungeon.items).not.toContain(sibling);
  });

  it.each([false, true])("中身で起動した地雷の所持品への炎も耐火に従う（耐火:%s）", protectedByArmor => {
    const scroll = { id: "carried-scroll", type: "scroll", name: "地図の巻物", effect: "map" };
    const { player } = breakPotBesideMine("gunpowder", { inventory: [scroll],
      armor: protectedByArmor ? { abilities: ["fire_resist"] } : null });
    expect(player.inventory.includes(scroll)).toBe(protectedByArmor);
  });
});
