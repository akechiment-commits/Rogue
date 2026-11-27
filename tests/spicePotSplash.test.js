import { describe, expect, it } from "vitest";
import { scatterPotContents } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("スパイスの壺の飛沫", () => {
  it("バリアでプレイヤーと敵の暗闇を防ぎ、大型敵には1回だけ適用する", () => {
    const pot = { id: "sp1", type: "pot", name: "唐辛子の壺", potEffect: "spicy", capacity: 3, contents: [] };
    const p = makePlayer({ x: 5, y: 5, barrier: 1 });
    const barMon = { id: "m1", name: "バリア敵", x: 6, y: 5, hp: 50, maxHp: 50, barrier: 1 };
    const boss = { id: "b1", name: "大型ボス", x: 4, y: 6, hp: 200, maxHp: 200, isBoss: true, bodySize: 2, dormant: true };
    const dg = makeEmptyDg({ monsters: [barMon, boss] });
    const ml = [];

    scatterPotContents(pot, dg, 5, 5, p, ml, null);

    expect(p.barrier).toBe(0);
    expect(p.darknessTurns || 0).toBe(0);
    expect(barMon.barrier).toBe(0);
    expect(barMon.darknessTurns || 0).toBe(0);
    expect(boss.dormant).toBe(false);
    expect(boss.darknessTurns).toBe(10);
    expect(ml.filter((m) => m.includes(`${boss.name}は暗闇になった`)).length).toBe(1);
  });
});
