import { afterEach, describe, expect, it, vi } from "vitest";
import { breakBigboxContents, extractPotContents, scatterPotContents } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("壺・大箱から出た道具の罠判定", () => {
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
