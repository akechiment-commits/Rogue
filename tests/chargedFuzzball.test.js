import { describe, expect, it, vi } from "vitest";
import { CHARGED_FUZZBALL_T, breakBigboxContents, placeItemAt, scatterPotContents } from "../items.js";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("カラペン系と帯電毛玉", () => {
  it("3形態が同じ浮遊ペンギンタイルを使う", () => {
    const base = MONS.find((m) => m.name === "カラペン");
    expect(base).toBeTruthy();
    expect(base.tile).toBe(183);
    expect(base.float).toBe(true);
    expect(base.subtype).toBe("itempusher");

    const forms = [1, 2, 3].map((level) => makeMonsterFromBase(base, level, 5, 5));
    expect(forms.map((m) => m.name)).toEqual(["カラペン", "パタペン", "ゴゴペン"]);
    expect(forms.every((m) => m.tile === 183 && m.float && m.subtype === "itempusher")).toBe(true);
  });

  it("隣接して空き枠があると帯電毛玉を押し付ける", () => {
    const base = MONS.find((m) => m.name === "カラペン");
    const mon = makeMonsterFromBase(base, 1, 5, 5);
    mon.alwaysUseSpecial = true;
    mon.aware = true;
    mon.turnAttacks = 0;
    const player = makePlayer({ x: 6, y: 5, maxInventory: 2 });
    const dg = makeEmptyDg({ rooms: [], monsters: [mon] });
    const messages = [];

    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(player.inventory).toHaveLength(1);
    expect(player.inventory[0]).toMatchObject(CHARGED_FUZZBALL_T);
    expect(player.inventory[0]).not.toBe(CHARGED_FUZZBALL_T);
    expect(messages).toContain("カラペンが帯電毛玉を押し付けてきた！");
  });

  it("所持枠が満杯なら帯電毛玉を押し付けない", () => {
    const base = MONS.find((m) => m.name === "カラペン");
    const mon = makeMonsterFromBase(base, 1, 5, 5);
    mon.alwaysUseSpecial = true;
    mon.aware = true;
    mon.turnAttacks = 0;
    const player = makePlayer({ x: 6, y: 5, maxInventory: 1, inventory: [{ name: "既存品" }] });
    const dg = makeEmptyDg({ rooms: [], monsters: [mon] });
    const messages = [];

    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(player.inventory).toHaveLength(1);
    expect(messages.some((message) => message.includes("帯電毛玉"))).toBe(false);
  });

  it("帯電毛玉はインベントリから置く・投げる操作を禁止する", () => {
    expect(CHARGED_FUZZBALL_T.type).toBe("charged_fuzzball");
    expect(CHARGED_FUZZBALL_T.noDrop).toBe(true);
    expect(CHARGED_FUZZBALL_T.noThrow).toBe(true);
  });

  it("床へ出た帯電毛玉は消滅し、箱・壺の中身散乱でも床に残らない", () => {
    const makeFuzzball = (id) => ({ ...CHARGED_FUZZBALL_T, id });
    const dg = makeEmptyDg({
      bigboxes: [{ kind: "normal", name: "大箱", x: 5, y: 5, capacity: 1, contents: [makeFuzzball("bb-fuzz")] }],
    });
    const messages = [];

    expect(placeItemAt(dg, 5, 5, makeFuzzball("floor-fuzz"), messages, new Set())).toBe(false);
    breakBigboxContents(dg.bigboxes[0], dg, messages);
    scatterPotContents(
      { name: "保存の壺", potEffect: "none", capacity: 1, contents: [makeFuzzball("pot-fuzz")] },
      dg, 5, 5, null, messages, null,
    );

    expect(dg.items.some((item) => item.type === "charged_fuzzball")).toBe(false);
    expect(messages.filter((message) => message.includes("帯電毛玉は床に落ちると消えてしまった！"))).toHaveLength(3);
  });

  it("ゴゴペンは10マス以内の直線上へ帯電毛玉を投げ、命中時だけ押し付ける", () => {
    const base = MONS.find((m) => m.name === "カラペン");
    const mon = makeMonsterFromBase(base, 3, 5, 5);
    mon.alwaysUseSpecial = true;
    mon.aware = true;
    mon.turnAttacks = 0;
    const player = makePlayer({ x: 5, y: 15, maxInventory: 2 });
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [mon],
      visible: Array.from({ length: 30 }, () => Array(40).fill(true)),
    });
    const messages = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      monsterAI(mon, dg, player, messages, { attackOnly: true });
    } finally {
      randomSpy.mockRestore();
    }

    expect(player.inventory).toHaveLength(1);
    expect(player.inventory[0]).toMatchObject(CHARGED_FUZZBALL_T);
    expect(messages).toContain("ゴゴペンが帯電毛玉を投げつけてきた！");
    expect(messages).toContain("ゴゴペンの帯電毛玉が命中！アイテム欄に押し付けられた！");
  });

  it("ゴゴペンの投射は通常の飛び道具と同じく外れる", () => {
    const base = MONS.find((m) => m.name === "カラペン");
    const mon = makeMonsterFromBase(base, 3, 5, 5);
    mon.alwaysUseSpecial = true;
    mon.aware = true;
    mon.turnAttacks = 0;
    const player = makePlayer({ x: 5, y: 8, maxInventory: 2 });
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [mon],
      visible: Array.from({ length: 30 }, () => Array(40).fill(true)),
    });
    const messages = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      monsterAI(mon, dg, player, messages, { attackOnly: true });
    } finally {
      randomSpy.mockRestore();
    }

    expect(player.inventory).toHaveLength(0);
    expect(dg.items.some((item) => item.type === "charged_fuzzball")).toBe(false);
    expect(messages).toContain("ゴゴペンの帯電毛玉は外れた！");
  });
});
