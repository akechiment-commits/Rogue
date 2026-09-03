import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeVisible() {
  return Array.from({ length: 30 }, () => Array(60).fill(true));
}

describe("敵の特技と聖域", () => {
  it.each([
    ["thief", "コソドロの盗み"],
    ["goldthief", "レプラコーンの盗み"],
    ["itemblast", "弾き飛ばし"],
    ["stealthrower", "盗投士の盗み"],
  ])("%sの特技を護盗の鎧で防ぐと通常攻撃へ移らない", (subtype, messagePart) => {
    const base = MONS.find((monster) => monster.subtype === subtype);
    const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    monster.alwaysUseSpecial = true;
    monster.turnAttacks = 0;
    const player = makePlayer({
      x: 6,
      y: 5,
      armor: { name: "護盗の鎧", ability: "anti_steal" },
      inventory: [{ id: "item-1", name: "パン", type: "food" }],
      gold: 1000,
    });
    const dungeon = makeEmptyDg({ rooms: [], monsters: [monster] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      monsterAI(monster, dungeon, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(player.hp).toBe(player.maxHp);
    expect(monster.turnAttacks).toBe(1);
    expect(messages.some((message) => message.includes(messagePart))).toBe(true);
  });

  it("魔封じで防いだ杖特技も通常攻撃へ移らない", () => {
    const base = MONS.find((monster) => monster.baseKind === "wizard");
    const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    monster.alwaysUseSpecial = true;
    monster.turnAttacks = 0;
    const player = makePlayer({ x: 6, y: 5 });
    const dungeon = makeEmptyDg({
      rooms: [],
      monsters: [monster],
      pentacles: [{ kind: "magic_seal", blessed: true, x: 10, y: 10 }],
    });
    const messages = [];

    monsterAI(monster, dungeon, player, messages, {
      attackOnly: true,
      monsterWandFn: vi.fn(),
    });

    expect(player.hp).toBe(player.maxHp);
    expect(monster.turnAttacks).toBe(1);
    expect(messages.some((message) => message.includes("魔封じの魔方陣に封じられた"))).toBe(true);
  });

  it("通常の聖域では隣接特技を試行せず、通常攻撃もしない", () => {
    const base = MONS.find((monster) => monster.baseKind === "itempusher");
    const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    monster.alwaysUseSpecial = true;
    monster.turnAttacks = 0;
    const player = makePlayer({ x: 6, y: 5, maxInventory: 2 });
    const dungeon = makeEmptyDg({
      rooms: [],
      monsters: [monster],
      pentacles: [{ kind: "sanctuary", x: 6, y: 5, blessed: false }],
    });
    const messages = [];

    monsterAI(monster, dungeon, player, messages, { attackOnly: true });

    expect(player.hp).toBe(player.maxHp);
    expect(player.inventory).toHaveLength(0);
    expect(monster.turnAttacks).toBe(0);
    expect(messages).toEqual([]);
  });

  it.each([
    ["thief", "盗みを防いだ"],
    ["goldthief", "盗みを防いだ"],
    ["itemblast", "弾き飛ばしを防いだ"],
    ["stealthrower", "盗みを防いだ"],
  ])("聖域上では%sの隣接特技を試行せず防御メッセージも出ない", (subtype, messagePart) => {
    const base = MONS.find((monster) => monster.subtype === subtype);
    const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    monster.alwaysUseSpecial = true;
    monster.turnAttacks = 0;
    const player = makePlayer({
      x: 6,
      y: 5,
      armor: { name: "護盗の鎧", ability: "anti_steal" },
      inventory: [{ id: "item-1", name: "パン", type: "food" }],
      gold: 1000,
    });
    const dungeon = makeEmptyDg({
      rooms: [],
      monsters: [monster],
      pentacles: [{ kind: "sanctuary", x: 6, y: 5, blessed: false }],
    });
    const messages = [];

    monsterAI(monster, dungeon, player, messages, { attackOnly: true });

    expect(player.hp).toBe(player.maxHp);
    expect(player.inventory).toHaveLength(1);
    expect(player.gold).toBe(1000);
    expect(monster.turnAttacks).toBe(0);
    expect(messages.some((message) => message.includes(messagePart))).toBe(false);
  });

  it("通常の聖域は遠距離特技を防がない", () => {
    const base = MONS.find((monster) => monster.baseKind === "hypnotist");
    const monster = makeMonsterFromBase(base, 3, 5, 5, { aware: true });
    monster.alwaysUseSpecial = true;
    monster.turnAttacks = 0;
    const player = makePlayer({ x: 5, y: 8 });
    const dungeon = makeEmptyDg({
      rooms: [{ x: 1, y: 1, w: 12, h: 12 }],
      monsters: [monster],
      visible: makeVisible(),
      pentacles: [{ kind: "sanctuary", x: 5, y: 8, blessed: false }],
    });

    monsterAI(monster, dungeon, player, [], { attackOnly: true });

    expect(player.hypnosisPending).toBe(1);
  });

  it("護盗の鎧があっても弾き飛ばしの不発時は通常攻撃する", () => {
    const base = MONS.find((monster) => monster.subtype === "itemblast");
    const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    monster.turnAttacks = 0;
    const player = makePlayer({
      x: 6,
      y: 5,
      armor: { name: "護盗の鎧", ability: "anti_steal" },
      inventory: [{ id: "item-1", name: "パン", type: "food" }],
    });
    const dungeon = makeEmptyDg({ rooms: [], monsters: [monster] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      monsterAI(monster, dungeon, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(player.inventory).toHaveLength(1);
    expect(messages.some((message) => message.includes("弾き飛ばしを防いだ"))).toBe(false);
    expect(messages.some((message) => message.includes("攻撃"))).toBe(true);
  });

  it("護盗の鎧があっても盗投士の不発時は通常攻撃する", () => {
    const base = MONS.find((monster) => monster.subtype === "stealthrower");
    const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    monster.turnAttacks = 0;
    const player = makePlayer({
      x: 6,
      y: 5,
      armor: { name: "護盗の鎧", ability: "anti_steal" },
      inventory: [{ id: "item-1", name: "パン", type: "food" }],
    });
    const dungeon = makeEmptyDg({ rooms: [], monsters: [monster] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      monsterAI(monster, dungeon, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(player.inventory).toHaveLength(1);
    expect(messages.some((message) => message.includes("盗みを防いだ"))).toBe(false);
    expect(messages.some((message) => message.includes("攻撃"))).toBe(true);
  });
  it("祝福された聖域は遠距離特技も防ぐ", () => {
    const base = MONS.find((monster) => monster.baseKind === "hypnotist");
    const monster = makeMonsterFromBase(base, 3, 5, 5, { aware: true });
    monster.alwaysUseSpecial = true;
    monster.turnAttacks = 0;
    const player = makePlayer({ x: 5, y: 8 });
    const dungeon = makeEmptyDg({
      rooms: [{ x: 1, y: 1, w: 12, h: 12 }],
      monsters: [monster],
      visible: makeVisible(),
      pentacles: [{ kind: "sanctuary", x: 5, y: 8, blessed: true }],
    });

    monsterAI(monster, dungeon, player, [], { attackOnly: true });

    expect(player.hypnosisPending).toBeUndefined();
    expect(player.hp).toBe(player.maxHp);
  });
});
