import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { BB_TYPES } from "../items.js";
import { GOAL_ITEMS } from "../dungeon.js";
import { applyWandEffect } from "../wands.js";
import { installPlayerHpMessageHook } from "../utils.js";
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
  { kind: "greed", trapAhead: false, expectedX: 7 },
  { kind: "nitro", trapAhead: false, expectedX: 7 },
  { kind: "trash", trapAhead: true, expectedX: 6 },
])("吹き飛ばされたキーアイテムは$kindの箱に入らず床に残る", ({ kind, trapAhead, expectedX }) => {
  const goal = { ...GOAL_ITEMS.legend, id: "goal", x: 6, y: 5 };
  const box = { kind, x: 8, y: 5, capacity: 1, contents: [] };
  const trap = { id: "pitfall", name: "落とし穴", effect: "pitfall", x: 7, y: 5 };
  const player = makePlayer({ x: 5, y: 5 });
  const dungeon = makeEmptyDg({ items: [goal], bigboxes: [box], traps: trapAhead ? [trap] : [] });
  const addItem = vi.fn();
  const messages = [];

  applyWandEffect("knockback", "item", goal, 1, 0, dungeon, player, messages, vi.fn(), addItem);

  expect(addItem).not.toHaveBeenCalled();
  expect(dungeon.bigboxes).toEqual([box]);
  expect(box).toMatchObject({ capacity: 1, contents: [] });
  expect(dungeon.items).toEqual([goal]);
  expect(goal).toMatchObject({ x: expectedX, y: 5 });
  expect(trap.revealed).toBeUndefined();
});
