import { describe, expect, it } from "vitest";
import { BB_TYPES, ITEMS, RARITY_RANK, RARITY_WEIGHT, breakBigboxContents, convertGreedBoxItem, detonateNitroBox, pickBigboxType, itemPrice } from "../items.js";
import "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("追加大箱", () => {
  it("大箱ごとにアイテムと同じレア度と重みを登録する", () => {
    const expected = {
      synthesis: "D", change: "C", enhance: "C", satiety: "D", refill: "D", identify: "D",
      split: "B", bless: "B", curse: "B", scatter: "C", trash: "C", reverse: "C", greed: "C", nitro: "C", monster: "C",
    };
    expect(BB_TYPES).toHaveLength(Object.keys(expected).length);
    for (const [kind, rarity] of Object.entries(expected)) {
      const box = BB_TYPES.find((bb) => bb.kind === kind);
      expect(box).toEqual(expect.objectContaining({ kind, rarity }));
      expect(box.weight).toBe(RARITY_WEIGHT[rarity]);
    }
  });

  it("大箱の巻物は祝福・呪いで抽選するレア度帯が変わる", () => {
    const scroll = ITEMS.find((item) => item.effect === "bigbox_summon");
    expect(scroll).toEqual(expect.objectContaining({ name: "大箱の巻物", type: "scroll", rarity: "B" }));

    const blessed = pickBigboxType({ blessed: true, randomFn: () => 0 });
    const cursed = pickBigboxType({ cursed: true, randomFn: () => 0 });
    expect(RARITY_RANK[blessed.rarity]).toBeGreaterThanOrEqual(RARITY_RANK.C);
    expect(RARITY_RANK[cursed.rarity]).toBeLessThanOrEqual(RARITY_RANK.D);
  });

  it("ニトロ箱を破壊すると半径2マスで爆発する", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5, hp: 100, maxHp: 100 });
    const bb = {
      id: "nitro-1",
      kind: "nitro",
      name: "ニトロ箱",
      x: 6,
      y: 5,
      capacity: 1,
      contents: [{ id: "inside", name: "石", type: "arrow", count: 1, tile: 22 }],
    };
    dg.bigboxes.push(bb);
    const messages = [];

    detonateNitroBox(bb, dg, p, messages, () => {});

    expect(dg.bigboxes).not.toContain(bb);
    expect(dg.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "inside" }),
    ]));
    expect(p.hp).toBeLessThan(100);
    expect(messages.some((message) => message.includes("ニトロ箱が爆発した"))).toBe(true);
  });

  it("換金の大箱は入れた品を金貨に変え、壊すと床へ散らす", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5, gold: 100 });
    const stone = { id: "s1", name: "石", type: "arrow", count: 1, tile: 22 };
    const bb = {
      id: "greed-1",
      kind: "greed",
      name: "換金の大箱",
      x: 6,
      y: 5,
      capacity: 3,
      contents: [stone],
    };
    dg.bigboxes.push(bb);

    const result = convertGreedBoxItem(bb, stone);
    expect(result.converted).toBe(true);
    expect(p.gold).toBe(100);
    expect(bb.contents).toHaveLength(1);
    expect(bb.contents[0]).toMatchObject({ type: "gold", value: itemPrice(stone) });
    expect(bb.capacity).toBe(3);

    const messages = [];
    breakBigboxContents(bb, dg, messages, null, null, null, { player: p });
    expect(dg.bigboxes).not.toContain(bb);
    expect(p.gold).toBe(100);
    expect(dg.items.some((it) => it.type === "gold" && it.value === itemPrice(stone))).toBe(true);
  });

  it("魔物の大箱を壊すと中身の個数だけ敵に変わる", () => {
    const dg = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
    const p = makePlayer({ x: 5, y: 5, depth: 1 });
    const bb = {
      id: "monster-1",
      kind: "monster",
      name: "魔物の大箱",
      x: 5,
      y: 5,
      capacity: 2,
      contents: [
        { id: "inside-1", name: "石", type: "arrow", count: 1, tile: 22 },
        { id: "inside-2", name: "薬草", type: "food", count: 1, tile: 22 },
      ],
    };
    dg.bigboxes.push(bb);
    const messages = [];

    breakBigboxContents(bb, dg, messages, null, null, null, { player: p });

    expect(dg.bigboxes).not.toContain(bb);
    expect(bb.contents).toEqual([]);
    expect(dg.monsters).toHaveLength(2);
    expect(messages.some((message) => message.includes("中身が2体の敵に変わった"))).toBe(true);
  });
});
