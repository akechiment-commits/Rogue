import { describe, expect, it } from "vitest";
import { BB_TYPES, breakBigboxContents, detonateNitroBox } from "../items.js";
import "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("追加大箱", () => {
  it("追加した4種の大箱を通常枠として登録する", () => {
    const added = BB_TYPES.filter(({ kind }) => ["reverse", "greed", "nitro", "monster"].includes(kind));
    expect(added).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "reverse", name: "反転の大箱" }),
      expect.objectContaining({ kind: "greed", name: "強欲の大箱" }),
      expect.objectContaining({ kind: "nitro", name: "ニトロ箱" }),
      expect.objectContaining({ kind: "monster", name: "魔物の大箱" }),
    ]));
    expect(added).toHaveLength(4);
    expect(added.every(({ rare }) => !rare)).toBe(true);
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
