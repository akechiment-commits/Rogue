import { afterEach, describe, expect, it, vi } from "vitest";
import { doExplosion, doGunpowderExplosion, doTimeBombExplosion, killMonster, runMineExplosion } from "../items.js";
import "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

it.each(["mine", "gunpowder", "timebomb", "pentacle"])(
  "%sは誘爆を終えてから撃破した敵の杖・薬・壺・火薬壺を落とす", route => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const loot = [
      { id: "wand", name: "封印の杖", type: "wand", effect: "seal", charges: 2 },
      { id: "potion", name: "回復薬", type: "potion", effect: "heal", value: 10 },
      { id: "pot", name: "保存の壺", type: "pot", potEffect: "none", capacity: 1,
        contents: [{ id: "food", type: "food", name: "パン" }] },
      { id: "gunpowder", name: "戦利品の火薬壺", type: "pot", potEffect: "gunpowder", capacity: 1, contents: [] },
    ];
    const monsters = loot.map((item, index) => ({
      id: `monster-${index}`, name: `敵${index}`, hp: 5, maxHp: 5, exp: 1,
      x: 5 + [0, 1, 0, -1][index], y: 5 + [0, 0, 1, 0][index],
      ...(index === 1 ? { baseKind: "gelcube", heldItems: [item] } : { carriedItem: item }),
    }));
    const floorScroll = { id: "floor-scroll", name: "地図の巻物", type: "scroll", x: 5, y: 4 };
    const floorPowder = { id: "floor-powder", name: "床の火薬壺", type: "pot", potEffect: "gunpowder", x: 4, y: 4 };
    const chainBomb = { id: "chain", name: "時限爆弾の罠", effect: "time_bomb", x: 6, y: 6 };
    const dungeon = makeEmptyDg({ monsters: [...monsters], items: [floorScroll, floorPowder], traps: [chainBomb] });
    const player = makePlayer({ x: 20, y: 20, depth: 1, exp: 0 });
    const messages = [];

    if (route === "mine") runMineExplosion(dungeon, { x: 5, y: 5, name: "地雷" }, player, messages, null);
    else if (route === "gunpowder") doGunpowderExplosion(5, 5, dungeon, player, messages, null);
    else if (route === "timebomb") doTimeBombExplosion(5, 5, dungeon, player, messages, null);
    else {
      dungeon.pentacles.push({ name: "爆発の魔方陣", kind: "explosion", x: 5, y: 5 });
      killMonster(monsters[0], dungeon, player, messages, null);
    }

    expect(dungeon.monsters).toEqual([]);
    expect(dungeon.items).toHaveLength(loot.length);
    expect(dungeon.items).toEqual(expect.arrayContaining(loot));
    expect(loot[2].contents).toMatchObject([{ id: "food" }]);
    expect(messages).toContain("床の火薬壺が爆発した！5×5マスに爆風！");
    expect(messages).toContain("時限爆弾の罠が誘爆した！");
    expect(messages.some(message => message.includes("戦利品の火薬壺が爆発した"))).toBe(false);
    expect(messages.indexOf("時限爆弾の罠が誘爆した！")).toBeLessThan(
      messages.findIndex(message => message.includes("封印の杖を落とした！")),
    );
  },
);

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
