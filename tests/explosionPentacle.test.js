import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase } from "../monsters.js";
import { killMonster } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

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
      "爆発の魔方陣の力で爆発した！",
      "爆発で回復の魔方陣が消えた！",
    ]));
  });

  it("爆発の魔方陣の爆発で床の食料を焼き、範囲内の地雷・時限爆弾を誘爆させる", () => {
    const base = MONS.find((m) => m.baseKind === "slime") || MONS[0];
    const monster = makeMonsterFromBase(base, 1, 5, 5);
    monster.hp = 0;
    const rawFood = { id: "food1", type: "food", name: "大きなパン", value: 50, x: 6, y: 5 };
    const mine = { id: "mine1", name: "地雷", effect: "explode", x: 4, y: 5 };
    const dg = makeEmptyDg({
      monsters: [monster],
      items: [rawFood],
      traps: [mine],
      pentacles: [{ name: "爆発の魔方陣", kind: "explosion", x: 5, y: 5, cursed: false }],
      rooms: [],
    });
    const messages = [];

    killMonster(monster, dg, makePlayer({ x: 20, y: 20 }), messages, null, true);

    expect(rawFood.cooked).toBe(true);
    expect(rawFood.name).toBe("焼いた大きなパン");
    expect(rawFood.value).toBe(100);
    expect(messages).toContain("地雷が誘爆した！");
  });

  it("爆発の魔方陣の爆発で祭壇を破壊し、固定転送陣は消去しない", () => {
    const base = MONS.find((m) => m.baseKind === "slime") || MONS[0];
    const monster = makeMonsterFromBase(base, 1, 5, 5);
    monster.hp = 0;
    const altar = { id: "altar1", name: "大地の祭壇", x: 6, y: 5 };
    const fixedPortal = { id: "fp1", name: "固定転送陣", kind: "fixed_portal", fixed: true, x: 4, y: 5 };
    const normalPentacle = { id: "np1", name: "回復の魔方陣", kind: "healing", x: 5, y: 6 };
    const dg = makeEmptyDg({
      monsters: [monster],
      altars: [altar],
      pentacles: [
        { name: "爆発の魔方陣", kind: "explosion", x: 5, y: 5, cursed: false },
        fixedPortal,
        normalPentacle,
      ],
      rooms: [],
    });
    const messages = [];

    killMonster(monster, dg, makePlayer({ x: 20, y: 20 }), messages, null, true);

    expect(dg.altars).toHaveLength(0);
    expect(messages).toContain("大地の祭壇が壊れた！");
    expect(dg.pentacles).toContain(fixedPortal);
    expect(dg.pentacles).not.toContain(normalPentacle);
  });

  it("爆発の魔方陣の爆発で火ダルマが水上以外へ分裂し、分裂個体にHPフックがつく", () => {
    const base = MONS.find((m) => m.baseKind === "slime") || MONS[0];
    const triggerMonster = makeMonsterFromBase(base, 1, 5, 5);
    triggerMonster.hp = 0;
    const fireDemon = {
      id: "fd1",
      name: "火ダルマ",
      baseKind: "firedemon",
      x: 6,
      y: 5,
      hp: 20,
      maxHp: 20,
    };
    const dg = makeEmptyDg({
      monsters: [triggerMonster, fireDemon],
      pentacles: [{ name: "爆発の魔方陣", kind: "explosion", x: 5, y: 5, cursed: false }],
      rooms: [],
    });
    // 周囲8マスのうち1箇所だけ床にし、他は水にする
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = fireDemon.x + dx, ny = fireDemon.y + dy;
        dg.map[ny][nx] = (dx === 1 && dy === 0) ? T.FLOOR : T.WATER;
      }
    }
    const messages = [];

    killMonster(triggerMonster, dg, makePlayer({ x: 20, y: 20 }), messages, null, true);

    expect(messages).toContain("火ダルマが爆発を受けて分裂した！");
    const splitMon = dg.monsters.find((m) => m.id !== "fd1" && m.baseKind === "firedemon");
    expect(splitMon).toBeDefined();
    expect(splitMon.x).toBe(7);
    expect(splitMon.y).toBe(5);
    splitMon.dormant = true;
    splitMon.hp -= 5;
    expect(splitMon.dormant).toBe(false);
  });

  it("炎まといを持つモンスターは爆発の魔方陣の爆風を吸収して即死しない", () => {
    const base = MONS.find((m) => m.baseKind === "slime") || MONS[0];
    const triggerMonster = makeMonsterFromBase(base, 1, 5, 5);
    triggerMonster.hp = 0;
    const flameMon = {
      id: "fm1",
      name: "フレイムナイト",
      x: 6,
      y: 5,
      hp: 30,
      maxHp: 30,
      flameMantleTurns: 10,
    };
    const dg = makeEmptyDg({
      monsters: [triggerMonster, flameMon],
      pentacles: [{ name: "爆発の魔方陣", kind: "explosion", x: 5, y: 5, cursed: false }],
      rooms: [],
    });
    const messages = [];

    killMonster(triggerMonster, dg, makePlayer({ x: 20, y: 20 }), messages, null, true);

    expect(flameMon.hp).toBe(30);
    expect(messages).toContain("フレイムナイトは爆風の炎を吸収した！");
  });
});
