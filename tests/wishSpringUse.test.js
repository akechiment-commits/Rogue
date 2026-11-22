import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useRef: current => ({ current }), useEffect: () => {} }));
import { useItemActions } from "../useItemActions.js";
import { installPlayerHpMessageHook } from "../utils.js";
import { placeItemAt, releaseConfinedMonstersFromPot, soakItemIntoSpring } from "../items.js";
import { grantWish, rollWishChance } from "../wish.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());
const source = readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start) + 1));
const bind = (deps, code) => new Function(...Object.keys(deps), code)(...Object.values(deps));
const noop = () => {};
const wish = { kind: "preset", id: "full_restore" };

function openSpringWish(action, { hasOtherSpring = true } = {}) {
  vi.spyOn(Math, "random").mockReturnValue(0.0001);
  const coin = { id: "coin", type: "gold", name: "金貨", value: 100 };
  const scroll = { id: "scroll", type: "scroll", name: "識別の巻物", effect: "identify" };
  const submergedItem = { id: "food", type: "food", name: "リンゴ" };
  const spring = { x: action === "throw" ? 8 : 6, y: 5, capacity: 5, contents: [submergedItem] };
  const otherSpring = { x: 5, y: 5, capacity: 5, contents: [] };
  const player = makePlayer({ hp: 10, inventory: [action === "soak" ? scroll : coin] });
  const dungeon = makeEmptyDg({ springs: hasOtherSpring ? [otherSpring, spring] : [spring] });
  const sr = { current: { player, dungeon, ident: new Set() } };
  const wishModeRef = { current: null };
  const springTargetRef = { current: action !== "throw" ? spring : hasOtherSpring ? otherSpring : null };
  let throwMode = null;
  const deps = {
    sr, wishModeRef, springTargetRef, useCallback: fn => fn, endTurn: vi.fn(), setMsgs: vi.fn(), setGs: noop,
    setShowInv: noop, setShowDesc: noop, setSelIdx: noop, setSpringMode: noop, setPutMode: noop, lu: noop,
    dnameRef: item => item.name, setWishMode: mode => { wishModeRef.current = mode; },
    setThrowMode: mode => { throwMode = mode; }, grantWish, rollWishChance, withPitfallBag: fn => fn,
    installPlayerHpMessageHook, soakItemIntoSpring, placeItemAt, releaseConfinedMonstersFromPot,
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
  } else {
    springDoSoak(0);
  }
  expect(wishModeRef.current?.source).toBe("spring");
  return { confirmWish, cancelWish, player, dungeon, spring, otherSpring, submergedItem };
}

it.each([
  ["throw", false], ["throw", true], ["drink", true], ["soak", true], ["soakGold", true],
])("%sで願いが叶うと発生元の泉だけ干上がる（別の泉: %s）", (action, hasOtherSpring) => {
  const { confirmWish, player, dungeon, spring, otherSpring, submergedItem } = openSpringWish(action, { hasOtherSpring });
  expect(dungeon.springs).toContain(spring);
  confirmWish(wish);
  expect(player.hp).toBe(100);
  expect(dungeon.springs).toEqual(hasOtherSpring ? [otherSpring] : []);
  expect(dungeon.items).toContain(submergedItem);
  expect([submergedItem.x, submergedItem.y]).toEqual([spring.x, spring.y]);
});

it("離れた泉の願いをキャンセルしても泉は干上がらない", () => {
  const { cancelWish, confirmWish, player, dungeon, spring, otherSpring, submergedItem } = openSpringWish("throw");
  cancelWish();
  confirmWish(wish);
  expect(player.hp).toBe(10);
  expect(dungeon.springs).toEqual([otherSpring, spring]);
  expect(spring.contents).toEqual([submergedItem]);
});
