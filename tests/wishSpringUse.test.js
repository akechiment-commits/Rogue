import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useRef: current => ({ current }), useEffect: () => {} }));
import { useItemActions } from "../useItemActions.js";
import { installPlayerHpMessageHook } from "../utils.js";
import { consumeSpringCapacity, crumbleYabaiFood, freezeWaterTile, placeItemAt, releaseConfinedMonstersFromPot, soakItemIntoSpring } from "../items.js";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeSpringWishMode } from "../springRules.js";
import { grantWish, rollWishChance } from "../wish.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());
const source = readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start) + 1));
const bind = (deps, code) => new Function(...Object.keys(deps), code)(...Object.values(deps));
const noop = () => {};
const wish = { kind: "preset", id: "full_restore" };

function openSpringWish(action, { hasOtherSpring = true, capacity = 5 } = {}) {
  vi.spyOn(Math, "random").mockReturnValue(0.0001);
  const coin = { id: "coin", type: "gold", name: "金貨", value: 100 };
  const scroll = { id: "scroll", type: "scroll", name: "識別の巻物", effect: "identify" };
  const yabaiFood = { id: "yabai", type: "food", name: "ヤバイパン", yabai: true, rotten: true };
  const submergedItem = { id: "food", type: "food", name: "リンゴ" };
  const onPlayer = action === "drop" || action === "swap";
  const thrown = action === "throw" || action === "knockback";
  const spring = { x: thrown ? 8 : onPlayer ? 5 : 6, y: 5, capacity, contents: [submergedItem] };
  const otherSpring = { x: onPlayer ? 4 : 5, y: 5, capacity: 5, contents: [] };
  const wand = { id: "wand", type: "wand", name: "吹き飛ばしの杖", effect: "knockback", charges: 2 };
  const player = makePlayer({ hp: 10, inventory: [action === "soak" ? scroll : action === "soakYabai" ? yabaiFood : action === "knockback" ? wand : coin] });
  const items = action === "knockback" ? [{ ...coin, x: 7, y: 5 }]
    : action === "swap" ? [{ id: "floor-item", name: "短剣", type: "weapon", x: 5, y: 5 }] : [];
  const dungeon = makeEmptyDg({ springs: hasOtherSpring ? [otherSpring, spring] : [spring], items });
  const sr = { current: { player, dungeon, ident: new Set() } };
  const wishModeRef = { current: null };
  const springTargetRef = { current: action !== "throw" ? spring : hasOtherSpring ? otherSpring : null };
  let throwMode = null;
  const deps = {
    sr, wishModeRef, springTargetRef, useCallback: fn => fn, endTurn: vi.fn(), setMsgs: vi.fn(), setGs: noop,
    setShowInv: noop, setShowDesc: noop, setSelIdx: noop, setSpringMode: noop, setPutMode: noop, lu: noop,
    dropModeRef: { current: null },
    dnameRef: item => item.name, setWishMode: mode => { wishModeRef.current = mode; },
    setThrowMode: mode => { throwMode = mode; }, grantWish, rollWishChance, withPitfallBag: fn => fn,
    installPlayerHpMessageHook, soakItemIntoSpring, placeItemAt, releaseConfinedMonstersFromPot, crumbleYabaiFood,
    makeSpringWishMode, consumeSpringCapacity,
    consumeActiveSpring: vi.fn(),
  };
  const { confirmWish, cancelWish, springDrink, springDoSoak } = bind(deps,
    section("  const resolveActiveSpring =", "  const consumeActiveSpring =") +
    section("  const drySpringAlways =", "  const bigboxPutItem =") +
    ";return { confirmWish, cancelWish, springDrink, springDoSoak };");
  if (action === "throw") {
    useItemActions(deps).doThrow(0);
    useItemActions({ ...deps, throwMode }).execDirection(1, 0);
  } else if (action === "drink") {
    springDrink();
  } else if (action === "drop") {
    useItemActions(deps).doDropItem(0);
  } else if (action === "swap") {
    useItemActions(deps).doSwapItem(0);
  } else if (action === "knockback") {
    useItemActions({ ...deps, throwMode: { mode: "wand_wave", idx: 0 } }).execDirection(1, 0);
  } else {
    springDoSoak(0);
  }
  expect(wishModeRef.current?.source).toBe("spring");
  expect(deps.endTurn).not.toHaveBeenCalled();
  return { confirmWish, cancelWish, player, dungeon, spring, otherSpring, submergedItem, sr, endTurn: deps.endTurn, wand };
}

it("泉に手で浸したヤバイ食料は崩れ、願いをキャンセルしても所持品へ戻らない", () => {
  const { cancelWish, player, spring } = openSpringWish("soakYabai");

  expect(player.inventory).toEqual([]);
  cancelWish();

  expect(player.inventory).toEqual([]);
  expect(spring.contents.some(item => item.yabai)).toBe(false);
  expect(spring.capacity).toBe(4);
});

it.each([
  ["throw", false], ["throw", true], ["drink", true], ["soak", true], ["soakGold", true],
  ["drop", true], ["swap", true], ["knockback", true],
])("%sで願いが叶うと発生元の泉だけ干上がる（別の泉: %s）", (action, hasOtherSpring) => {
  const { confirmWish, player, dungeon, spring, otherSpring, submergedItem, endTurn, wand } = openSpringWish(action, { hasOtherSpring });
  expect(dungeon.springs).toContain(spring);
  confirmWish(wish);
  expect(player.hp).toBe(100);
  expect(dungeon.springs).toEqual(hasOtherSpring ? [otherSpring] : []);
  expect(dungeon.items).toContain(submergedItem);
  expect([submergedItem.x, submergedItem.y]).toEqual([spring.x, spring.y]);
  expect(endTurn).toHaveBeenCalledOnce();
  if (action === "knockback") expect(wand.charges).toBe(1);
});

it.each(["throw", "drop", "swap", "drink", "soak", "soakGold", "knockback"])("%sで願いをやめると1ターン消費する", action => {
  const { cancelWish, confirmWish, player, dungeon, spring, otherSpring, submergedItem, endTurn } = openSpringWish(action);
  cancelWish();
  confirmWish(wish);
  expect(player.hp).toBe(10);
  expect(dungeon.springs).toEqual([otherSpring, spring]);
  expect(spring.contents).toEqual([submergedItem]);
  expect(spring.capacity).toBe(4);
  expect(endTurn).toHaveBeenCalledOnce();
});

it("満杯の泉で願いをやめると通常の容量消費により中身を出す", () => {
  const { cancelWish, spring, dungeon, submergedItem, endTurn } = openSpringWish("throw", { capacity: 1 });
  expect(spring.capacity).toBe(1);
  cancelWish();
  expect(dungeon.springs).not.toContain(spring);
  expect(dungeon.items).toContain(submergedItem);
  expect(endTurn).toHaveBeenCalledOnce();
});

it.each(["frozen", "changed-floor"])("泉が使えなくなった場合は願いを適用しない (%s)", reason => {
  const { confirmWish, player, spring, dungeon, sr, endTurn } = openSpringWish("throw");
  if (reason === "frozen") {
    freezeWaterTile(dungeon, spring.x, spring.y, []);
  } else {
    sr.current.dungeon = makeEmptyDg();
    player.depth++;
  }
  confirmWish(wish);
  expect(player.hp).toBe(10);
  expect(endTurn).not.toHaveBeenCalled();
  if (reason === "changed-floor") expect(dungeon.springs).toContain(spring);
});

it("ひょい河童が金貨を泉に投げると容量を消費し、願いの声は出ない", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.0001);
  const base = MONS.find(monster => monster.baseKind === "itemThrower");
  const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
  monster.carriedItem = { type: "gold", name: "100枚の金貨", value: 100 };
  monster.turnAttacks = 0;
  const player = makePlayer({ x: 9, y: 5 });
  const spring = { x: 7, y: 5, capacity: 3, contents: [] };
  const dungeon = makeEmptyDg({ monsters: [monster], springs: [spring], rooms: [{ x: 1, y: 1, w: 15, h: 10 }] });
  const messages = [];
  monsterAI(monster, dungeon, player, messages, { attackOnly: true });
  expect(monster.carriedItem).toBeFalsy();
  expect(spring.capacity).toBe(2);
  expect(messages.join(" ")).not.toContain("何を願う");
  expect(messages.join(" ")).toContain("飛び出してきた");
});
