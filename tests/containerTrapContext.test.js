import { afterEach, describe, expect, it, vi } from "vitest";
import { breakBigboxContents, extractPotContents, scatterPotContents } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("壺・大箱から出た道具の罠判定", () => {
  it.each([false, true])("吸い出し中に壺が地雷の熱で壊れても、同じ中身を二度出さない（呪い: %s）", cursed => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const player = makePlayer({ hp: 100, maxHp: 100, depth: 1 });
    const sword = { id: "sword", name: "短剣", type: "weapon", atk: 3 };
    const ring = { id: "ring", name: "命の指輪", type: "ring", effect: "life_ring", plus: 1 };
    const pot = { id: "storage", name: "保存の壺", type: "pot", potEffect: "none", capacity: 3, contents: [sword, ring] };
    player.inventory.push(pot);
    const dungeon = makeEmptyDg({ traps: [{ id: "mine", name: "地雷", effect: "explode", x: 5, y: 5 }] });
    const messages = [];
    extractPotContents(pot, dungeon, 5, 5, player, messages, vi.fn(), false, cursed);
    expect(messages.filter(message => message.includes("地雷が発動"))).toHaveLength(1);
    expect(player.hp).toBe(50);
    expect(player.inventory).not.toContain(pot);
    expect(pot.contents).toHaveLength(0);
    expect(dungeon.items.filter(item => item.id === sword.id)).toHaveLength(0);
    expect(dungeon.items.filter(item => item.id === ring.id)).toHaveLength(1);
  });
  it.each([1, 2])("油壺の吸い出しは、取り出す前の中身の数で残り油を判定する（容量: %s）", capacity => {
    const player = makePlayer();
    const ring = { id: "ring", name: "命の指輪", type: "ring", effect: "life_ring", plus: 1 };
    const pot = { name: "オリーブオイルの壺", type: "pot", potEffect: "olive", capacity, contents: [ring] };
    const dungeon = makeEmptyDg();
    extractPotContents(pot, dungeon, 5, 5, player, [], vi.fn(), false);
    expect((dungeon.oilyTiles || []).length > 0).toBe(capacity === 2);
    expect(pot.contents).toHaveLength(0);
    expect(dungeon.items).toContain(ring);
  });
  it("散乱中の地雷で元の大箱を繰り返し破壊せず、中身を複製しない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const player = makePlayer({ hp: 100, maxHp: 100, x: 4, y: 6, depth: 1 });
    const sword = { id: "sword", name: "短剣", type: "weapon", atk: 3 };
    const ring = { id: "ring", name: "命の指輪", type: "ring", effect: "life_ring", plus: 1 };
    const box = { id: "box", name: "大箱", kind: "normal", x: 5, y: 5, contents: [sword, ring] };
    const dungeon = makeEmptyDg({ bigboxes: [box], traps: [{ id: "mine", name: "地雷", effect: "explode", x: 4, y: 5 }] });
    const messages = [];
    breakBigboxContents(box, dungeon, messages, null, null, null, { player });
    expect(messages.filter(message => message.includes("地雷が発動"))).toHaveLength(1);
    expect(player.hp).toBe(50);
    expect(dungeon.bigboxes).toHaveLength(0);
    expect(box.contents).toHaveLength(0);
    expect(dungeon.items.filter(item => item.id === sword.id)).toHaveLength(1);
    expect(dungeon.items.filter(item => item.id === ring.id)).toHaveLength(0);
    expect(new Set(dungeon.items.map(item => item.id)).size).toBe(dungeon.items.length);
  });
  it.each(["break-pot", "extract-pot", "break-box"])("%sの中身で地雷が発動するとプレイヤーにも爆風が届く", route => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const player = makePlayer({ hp: 100, maxHp: 100, depth: 1 });
    const content = { id: "stored-sword", name: "短剣", type: "weapon", atk: 3 };
    const dungeon = makeEmptyDg({ traps: [{ id: "mine", name: "地雷", effect: "explode", x: 5, y: 5, revealed: true }] });
    const messages = [];
    const pot = { id: "pot", name: "保存の壺", type: "pot", potEffect: "none", capacity: 3, contents: [content] };
    if (route === "break-pot") scatterPotContents(pot, dungeon, 5, 5, player, messages, vi.fn());
    if (route === "extract-pot") extractPotContents(pot, dungeon, 5, 5, player, messages, vi.fn(), false);
    if (route === "break-box") {
      const box = { id: "box", name: "大箱", kind: "normal", x: 8, y: 5, contents: [content] };
      dungeon.bigboxes.push(box);
      breakBigboxContents(box, dungeon, messages, null, 5, 5, { player });
    }
    expect(messages.some(message => message.includes("地雷が発動"))).toBe(true);
    expect(player.hp).toBe(50);
    expect(dungeon.items).not.toContain(content);
  });
  it.each([false, true])("散乱で起動した地雷も距離と耐火を考慮する（耐火: %s）", protectedByArmor => {
    const player = makePlayer({ hp: 100, maxHp: 100,
      ...(protectedByArmor ? { armor: { abilities: ["fire_resist"] } } : { x: 20, y: 20 }) });
    const dungeon = makeEmptyDg({ traps: [{ id: "mine", name: "地雷", effect: "explode", x: 5, y: 5 }] });
    const pot = { name: "保存の壺", potEffect: "none", contents: [{ id: "sword", name: "短剣", type: "weapon", atk: 3 }] };
    scatterPotContents(pot, dungeon, 5, 5, player, [], vi.fn());
    expect(player.hp).toBe(protectedByArmor ? 67 : 100);
  });
});
