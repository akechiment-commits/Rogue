import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { killMonster, throwItemAlongLine } from "../items.js";
import { makeStatue, makeVent } from "../fixtures.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("盗投士", () => {
  it("手持ち中は配列が再初期化されても追加で盗まず、最初のアイテムを保持する", () => {
    const base = MONS.find((m) => m.baseKind === "stealthrower");
    const first = { id: "first", name: "手投げの指輪", type: "ring", effect: "power_ring" };
    const second = { id: "second", name: "ただのペン", type: "pen", effect: "draw" };
    const thief = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const player = makePlayer({ x: 6, y: 5, inventory: [first, second], invisibleTurns: 0 });
    const dg = makeEmptyDg({ rooms: [], monsters: [thief] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);

    try {
      monsterAI(thief, dg, player, messages, { attackOnly: true });
      expect(thief._stealthrowerHeldItem).toMatchObject({ id: first.id });

      /* 状態更新で旧配列だけが空になっても、保持スロットを正として扱う。 */
      thief.heldItems = [];
      player.invisibleTurns = 3;
      monsterAI(thief, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(player.inventory).toEqual([second]);
    expect(thief.heldItems).toEqual([first]);
    expect(thief._stealthrowerHeldItem).toBe(first);
    expect(messages.filter((message) => message.includes("盗んだ！"))).toHaveLength(1);
  });

  it("手持ちアイテムは倒された時に落とす", () => {
    const base = MONS.find((m) => m.baseKind === "stealthrower");
    const held = { id: "held", name: "手投げの指輪", type: "ring", effect: "power_ring" };
    const thief = makeMonsterFromBase(base, 1, 5, 5);
    thief._stealthrowerHeldItem = held;
    thief.heldItems = [];
    const dg = makeEmptyDg({ rooms: [], monsters: [thief] });
    const messages = [];

    killMonster(thief, dg, makePlayer(), messages, null, true);

    expect(dg.items.some((item) => item.id === held.id)).toBe(true);
    expect(thief._stealthrowerHeldItem).toBeUndefined();
  });

  it("射線上に壁があっても投擲し、壁の手前にアイテムを落とす", () => {
    const base = MONS.find((m) => m.baseKind === "stealthrower");
    const held = { id: "blocked", name: "手投げの指輪", type: "ring", effect: "power_ring", tile: 1 };
    const thief = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    thief._stealthrowerHeldItem = held;
    thief.heldItems = [held];
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [thief],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    dg.map[6][5] = "#";
    const player = makePlayer({ x: 5, y: 8 });
    const messages = [];

    monsterAI(thief, dg, player, messages, { attackOnly: true });

    expect(thief._stealthrowerHeldItem).toBeUndefined();
    expect(dg.items.some((item) => item.id === held.id)).toBe(true);
    expect(messages.join(" ")).toContain("地面に落ちた");
  });

  it("風で盗投士自身に戻った投擲物は地面に落ちず消滅する", () => {
    const base = MONS.find((m) => m.baseKind === "stealthrower");
    const thief = makeMonsterFromBase(base, 1, 4, 4, { aware: true });
    const player = makePlayer({ x: 1, y: 1 });
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [thief],
      vents: [makeVent(0, 0, 1, 1)],
    });
    const held = { id: "wind-hit", name: "風に飛ばされた指輪", type: "ring", effect: "power_ring" };
    const messages = [];

    const result = throwItemAlongLine(thief, dg, held, -1, -1, 10, messages, player, null, {});

    expect(messages.join(" ")).toContain("自身に当たった");
    expect(result.consumed).toBe(true);
    expect(dg.items.some((item) => item.id === held.id)).toBe(false);
  });

  it("石像に当たった投擲物は石像を壊して消滅する", () => {
    const base = MONS.find((m) => m.baseKind === "stealthrower");
    const thief = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const player = makePlayer({ x: 5, y: 8 });
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [thief],
      statues: [makeStatue(5, 6)],
    });
    const held = { id: "statue-hit", name: "石像に当たる指輪", type: "ring", effect: "power_ring" };
    const messages = [];

    const result = throwItemAlongLine(thief, dg, held, 0, 1, 10, messages, player, null, {});

    expect(result.consumed).toBe(true);
    expect(dg.statues).toHaveLength(0);
    expect(dg.items.some((item) => item.id === held.id)).toBe(false);
  });
});
