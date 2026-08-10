import { describe, expect, it } from "vitest";
import { CHARGED_FUZZBALL_T } from "../items.js";
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
});
