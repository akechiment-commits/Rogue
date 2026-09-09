import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { advancePlayerTerrainEffects } from "../playerTerrainEffects.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

describe("巨大ウナギ", () => {
  it("水中限定で、Lv2・Lv3の仮名を持つ", () => {
    const base = MONS.find((monster) => monster.baseKind === "giantEel");
    expect(base).toMatchObject({
      name: "巨大ウナギ",
      waterOnly: true,
      subtype: "giantEel",
    });
    expect(base.levels.map((level) => level.name)).toEqual(["大王ウナギ", "深海大王ウナギ"]);
  });

  it("隣接するとプレイヤーを拘束する", () => {
    const base = MONS.find((monster) => monster.baseKind === "giantEel");
    const eel = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const player = makePlayer({ x: 6, y: 5 });
    const dg = makeEmptyDg({
      monsters: [eel],
      rooms: [{ x: 1, y: 1, w: 20, h: 12 }],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    dg.map[5][5] = T.WATER;
    const messages = [];

    monsterAI(eel, dg, player, messages, { moveOnly: true });

    expect(player.capturedBy).toBe(eel.id);
    expect(messages.some((message) => message.includes("締め付けられた"))).toBe(true);
    expect([eel.x, eel.y]).toEqual([5, 5]);
  });

  it("拘束中は水中呼吸の指輪がなければ毎ターン15ダメージ", () => {
    const eel = { id: "eel", name: "巨大ウナギ", subtype: "giantEel" };
    const dungeon = makeEmptyDg({ monsters: [eel] });
    const player = makePlayer({ hp: 100, capturedBy: eel.id, rings: [] });
    const messages = [];

    advancePlayerTerrainEffects(player, dungeon, messages);

    expect(player.hp).toBe(85);
    expect(player._waterSuffocationDamage).toBe(true);
    expect(messages).toEqual(["巨大ウナギに拘束されて溺れて苦しい！15ダメージ！"]);
  });

  it("水中呼吸の指輪を装備していれば拘束中もダメージを受けない", () => {
    const eel = { id: "eel", name: "巨大ウナギ", subtype: "giantEel" };
    const dungeon = makeEmptyDg({ monsters: [eel] });
    const player = makePlayer({ hp: 100, capturedBy: eel.id, rings: [{ effect: "water_breath_ring" }] });
    const messages = [];

    advancePlayerTerrainEffects(player, dungeon, messages);

    expect(player.hp).toBe(100);
    expect(player._waterSuffocationDamage).toBe(false);
    expect(messages).toHaveLength(0);
  });

  it("拘束者が離れるか状態異常になると拘束が解ける", () => {
    const eel = { id: "eel", name: "巨大ウナギ", subtype: "giantEel", x: 5, y: 5, hp: 80, maxHp: 80 };
    const player = makePlayer({ x: 6, y: 5, capturedBy: eel.id });
    const dg = makeEmptyDg({
      monsters: [eel],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    eel.paralyzed = true;
    const messages = [];

    monsterAI(eel, dg, player, messages, { moveOnly: true });

    expect(player.capturedBy).toBeNull();
    expect(messages.some((message) => message.includes("拘束が解けた"))).toBe(true);
  });
});
