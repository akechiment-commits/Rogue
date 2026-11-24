import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { BB_TYPES, clearPitfallBag, setPitfallBag } from "../items.js";
import { GOAL_ITEMS } from "../dungeon.js";
import { applyWandEffect } from "../wands.js";
import { installPlayerHpMessageHook, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const source = readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
const putStart = source.indexOf("  const bigboxPutItem =");
const putEnd = source.indexOf("  const sortInventory =", putStart);
if (putStart < 0 || putEnd < 0) throw new Error("Missing bigboxPutItem handler");

it.each(BB_TYPES)("手持ちのキーアイテムを$nameへ入れようとしても手持ちに残る", ({ kind, name }) => {
  const goal = { ...GOAL_ITEMS.legend, id: "goal" };
  const box = { kind, name, x: 8, y: 5, capacity: 1, contents: [] };
  const player = makePlayer({ inventory: [goal] });
  const dungeon = makeEmptyDg({ bigboxes: [box] });
  const messages = [];
  const deps = {
    useCallback: fn => fn,
    sr: { current: { player, dungeon } },
    bigboxRef: { current: box },
    installPlayerHpMessageHook,
    setMsgs: updater => messages.push(...updater([])),
    bigboxAddItem: vi.fn(),
    endTurn: vi.fn(),
    unequipPlayerItem: vi.fn(),
  };
  const putItem = new Function(...Object.keys(deps), source.slice(putStart, putEnd) + "return bigboxPutItem;")(...Object.values(deps));
  putItem(0);

  expect(player.inventory).toEqual([goal]);
  expect(box.contents).toEqual([]);
  expect(deps.bigboxAddItem).not.toHaveBeenCalled();
  expect(deps.endTurn).not.toHaveBeenCalled();
  expect(messages).toContain("大事なものは大箱に入れられない！");
});

it.each([
  { kind: "greed", itemAhead: false, landing: { x: 7, y: 5 } },
  { kind: "nitro", itemAhead: false, landing: { x: 7, y: 5 } },
  { kind: "trash", itemAhead: true, landing: { x: 8, y: 4 } },
])("吹き飛ばされたキーアイテムは$kindの箱に入らず床に残る", ({ kind, itemAhead, landing }) => {
  const goal = { ...GOAL_ITEMS.legend, id: "goal", x: 6, y: 5 };
  const box = { kind, x: 8, y: 5, capacity: 1, contents: [] };
  const stone = { id: "stone", name: "石", type: "arrow", x: 7, y: 5 };
  const player = makePlayer({ x: 5, y: 5 });
  const items = itemAhead ? [goal, stone] : [goal];
  const dungeon = makeEmptyDg({ items, bigboxes: [box] });
  const addItem = vi.fn();
  const messages = [];

  applyWandEffect("knockback", "item", goal, 1, 0, dungeon, player, messages, vi.fn(), addItem);

  expect(addItem).not.toHaveBeenCalled();
  expect(dungeon.bigboxes).toEqual([box]);
  expect(box).toMatchObject({ capacity: 1, contents: [] });
  expect(dungeon.items.filter(item => item.type === "goal")).toEqual([goal]);
  expect(goal).toMatchObject(landing);
});

it("箱の周囲に空き床がなければ飛んできた軌道上の一番近い空き床へ落ちる", () => {
  const goal = { ...GOAL_ITEMS.legend, id: "goal", x: 6, y: 5 };
  const box = { kind: "trash", x: 12, y: 5, capacity: 1, contents: [] };
  const items = [goal, ...[10, 11].map(x => ({ id: `stone-${x}`, name: "石", type: "arrow", x, y: 5 }))];
  const player = makePlayer({ x: 5, y: 5 });
  const dungeon = makeEmptyDg({ items, bigboxes: [box] });
  for (const row of dungeon.map) row.fill(T.WALL);
  dungeon.map[5].fill(T.FLOOR, 5, 13);
  const addItem = vi.fn();

  applyWandEffect("knockback", "item", goal, 1, 0, dungeon, player, [], vi.fn(), addItem);

  expect(addItem).not.toHaveBeenCalled();
  expect(dungeon.items.filter(item => item.type === "goal")).toEqual([goal]);
  expect(goal).toMatchObject({ x: 9, y: 5 });
});

it.each([
  { effect: "explode", name: "地雷", hp: 50, falls: false },
  { effect: "pitfall", name: "落とし穴", hp: 100, falls: true },
])("箱に弾かれたキーアイテムは$nameを起動し、通常どおり消費される", ({ effect, name, hp, falls }) => {
  const goal = { ...GOAL_ITEMS.legend, id: "goal", x: 6, y: 5 };
  const box = { kind: "protect", x: 8, y: 5, capacity: 1, contents: [] };
  const trap = { id: "trap", effect, name, x: 7, y: 5, permanent: true };
  const player = makePlayer({ x: 6, y: 6 });
  const dungeon = makeEmptyDg({ items: [goal], bigboxes: [box], traps: [trap] });
  const messages = [];
  const addItem = vi.fn();
  const bag = [];
  setPitfallBag(bag);
  try {
    applyWandEffect("knockback", "item", goal, 1, 0, dungeon, player, messages, vi.fn(), addItem);
  } finally {
    clearPitfallBag();
  }

  expect(addItem).not.toHaveBeenCalled();
  expect(trap.revealed).toBe(true);
  expect(messages.filter(message => message.startsWith(`${name}が発動！`))).toHaveLength(1);
  expect(player.hp).toBe(hp);
  expect(dungeon.items).not.toContain(goal);
  expect(bag).toEqual(falls ? [{ kind: "item", entity: goal }] : []);
});

it("箱に弾かれたキーアイテムは水鉄砲を起動しても床に残る", () => {
  const goal = { ...GOAL_ITEMS.legend, id: "goal", x: 6, y: 5 };
  const box = { kind: "protect", x: 8, y: 5, capacity: 1, contents: [] };
  const trap = { id: "trap", effect: "watergun_trap", name: "水鉄砲の罠", x: 7, y: 5, permanent: true };
  const player = makePlayer({ x: 5, y: 5 });
  const dungeon = makeEmptyDg({ items: [goal], bigboxes: [box], traps: [trap] });
  const messages = [];
  const addItem = vi.fn();

  applyWandEffect("knockback", "item", goal, 1, 0, dungeon, player, messages, vi.fn(), addItem);

  expect(addItem).not.toHaveBeenCalled();
  expect(trap.revealed).toBe(true);
  expect(messages.filter(message => message === "水鉄砲の罠が発動！")).toHaveLength(1);
  expect(dungeon.items).toEqual([goal]);
});

it("箱に弾かれたキーアイテムが道具魔物化の罠を起動する", () => {
  const goal = { ...GOAL_ITEMS.legend, id: "goal", x: 6, y: 5 };
  const bread = { id: "bread", name: "パン", type: "food", x: 10, y: 5 };
  const box = { kind: "protect", x: 8, y: 5, capacity: 1, contents: [] };
  const trap = { id: "trap", effect: "item_monster_trap", name: "道具魔物化の罠", x: 7, y: 5 };
  const player = makePlayer({ x: 5, y: 5, depth: 4 });
  const dungeon = makeEmptyDg({
    items: [goal, bread], bigboxes: [box], traps: [trap],
    rooms: [{ x: 3, y: 3, w: 10, h: 8 }], dungeonType: "beginner",
  });

  applyWandEffect("knockback", "item", goal, 1, 0, dungeon, player, [], vi.fn(), vi.fn());

  expect(trap.revealed).toBe(true);
  expect(dungeon.traps).not.toContain(trap);
  expect(dungeon.monsters).toMatchObject([{ x: 10, y: 5 }]);
  expect(dungeon.items).toEqual([goal]);
  expect(goal).toMatchObject({ x: 7, y: 5 });
});
