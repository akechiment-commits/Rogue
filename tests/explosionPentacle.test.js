import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase } from "../monsters.js";
import { killMonster } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("爆発の魔方陣", () => {
  it("撃破連鎖の爆発で大箱を壊し、中身を床へ配置して処理を完了する", () => {
    const monster = makeMonsterFromBase(MONS[0], 1, 5, 5);
    monster.hp = 0;
    const sword = { id: "box-sword", name: "短剣", type: "weapon", atk: 4 };
    const box = { id: "box", kind: "storage", x: 6, y: 5, contents: [sword] };
    const dg = makeEmptyDg({
      monsters: [monster], bigboxes: [box], rooms: [],
      pentacles: [{ name: "爆発の魔方陣", kind: "explosion", x: 5, y: 5 }],
    });
    const messages = [];
    expect(() => killMonster(monster, dg, makePlayer({ x: 20, y: 20 }), messages, null, true)).not.toThrow();
    expect(dg.bigboxes).toEqual([]);
    expect(dg.items).toContain(sword);
    expect(Math.max(Math.abs(sword.x - box.x), Math.abs(sword.y - box.y))).toBeLessThanOrEqual(1);
    expect(dg.pentacles).toEqual([]);
    expect(messages).toContain("大箱が爆発で壊れた！");
  });

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
