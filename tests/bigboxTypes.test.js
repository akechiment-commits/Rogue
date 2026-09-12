import { describe, expect, it } from "vitest";
import { BB_TYPES, detonateNitroBox } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("追加大箱", () => {
  it("反転・強欲・ニトロ箱を登録する", () => {
    expect(BB_TYPES).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "reverse", name: "反転の大箱", rare: true }),
      expect.objectContaining({ kind: "greed", name: "強欲の大箱", rare: true }),
      expect.objectContaining({ kind: "nitro", name: "ニトロ箱", rare: true }),
    ]));
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
    expect(p.hp).toBeLessThan(100);
    expect(messages.some((message) => message.includes("ニトロ箱が爆発した"))).toBe(true);
  });
});
