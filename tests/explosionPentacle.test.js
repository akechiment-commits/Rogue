import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase } from "../monsters.js";
import { killMonster } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("爆発の魔方陣", () => {
  it("敵撃破を起点にした爆発でも範囲内の魔方陣を消滅させる", () => {
    const base = MONS.find((m) => m.baseKind === "slime") || MONS[0];
    const monster = makeMonsterFromBase(base, 1, 5, 5);
    monster.hp = 0;
    const dg = makeEmptyDg({
      monsters: [monster],
      pentacles: [
        { name: "爆発の魔方陣", kind: "explosion", x: 5, y: 5, cursed: false },
        { name: "回復の魔方陣", kind: "healing", x: 6, y: 5, cursed: false },
        { name: "遠くの魔方陣", kind: "healing", x: 8, y: 5, cursed: false },
      ],
      rooms: [],
    });
    const messages = [];

    killMonster(monster, dg, makePlayer({ x: 20, y: 20 }), messages, null, true);

    expect(dg.pentacles).toEqual([
      { name: "遠くの魔方陣", kind: "healing", x: 8, y: 5, cursed: false },
    ]);
    expect(messages).toEqual(expect.arrayContaining([
      "爆発で爆発の魔方陣が消えた！",
      "爆発で回復の魔方陣が消えた！",
    ]));
  });
});
