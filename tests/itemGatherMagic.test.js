import { afterEach, describe, expect, it, vi } from "vitest";
import { applySpellEffect } from "../items.js";
import { MH, MW, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());
const cast = (dungeon, player = makePlayer()) => {
  const messages = [];
  applySpellEffect("item_gather_magic", "self", null, 0, 0, dungeon, player, messages, () => {});
  return messages;
};

describe("道具寄せの置き場", () => {
  it("周囲25マスを超えた分はランダムな空き床へ飛び、1個も消えない", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `item-${i}`, name: `道具${i}`, type: "weapon", tile: 10, x: 20 + i % 10, y: 15 + Math.floor(i / 10),
    }));
    const shop = { name: "商品", type: "weapon", shopPrice: 1000, x: 15, y: 15 };
    const dungeon = makeEmptyDg({ items: [...items, shop] });
    const messages = cast(dungeon);
    expect(dungeon.items).toHaveLength(31);
    expect(new Set(dungeon.items)).toEqual(new Set([...items, shop]));
    expect(new Set(dungeon.items.map(i => `${i.x},${i.y}`)).size).toBe(31);
    expect(items.filter(i => Math.max(Math.abs(i.x - 5), Math.abs(i.y - 5)) <= 2)).toHaveLength(25);
    expect(messages.filter(m => m.includes("空きマスへ飛んだ"))).toHaveLength(5);
    expect(messages).toContain("25個のアイテムを引き寄せた！");
    expect(shop).toMatchObject({ x: 15, y: 15, shopPrice: 1000 });
  });

  it.each([[0, 15], [0.999, 20]])("周囲が壁なら乱数%sでフロアの空き床を選ぶ", (random, expectedX) => {
    vi.spyOn(Math, "random").mockReturnValue(random);
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
    map[15][15] = map[20][20] = T.FLOOR;
    map[12][12] = T.FLOOR;
    const item = { name: "壁内の道具", type: "weapon", x: 10, y: 10, wallEmbedded: true };
    const dungeon = makeEmptyDg({ map, items: [item], traps: [{ x: 12, y: 12, effect: "explode" }] });
    cast(dungeon);
    expect(item).toMatchObject({ x: expectedX, y: expectedX });
    expect(item.wallEmbedded).toBeUndefined();
    expect(dungeon.items).toEqual([item]);
  });

  it("フロア全体に空きがない場合も元の個体と壁埋まり状態を失わない", () => {
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
    const item = { name: "壁内の道具", type: "weapon", x: 10, y: 10, wallEmbedded: true };
    const dungeon = makeEmptyDg({ map, items: [item] });
    const messages = cast(dungeon);
    expect(dungeon.items).toEqual([item]);
    expect(item).toMatchObject({ x: 10, y: 10, wallEmbedded: true });
    expect(messages).toEqual(["壁内の道具はフロアに空きがなく、元の場所に残った。"]);
  });
});
