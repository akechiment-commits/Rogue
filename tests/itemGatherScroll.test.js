import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useEffect: () => {}, useRef: initial => ({ current: initial }) }));
import { useItemActions } from "../useItemActions.js";
import { ITEMS, applySpellEffect } from "../items.js";
import { MH, MW, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
afterEach(() => vi.restoreAllMocks());
function items(count = 30) {
 return Array.from({ length: count }, (_, i) => ({ ...ITEMS.find(item => item.name === "ロングソード"), id: `gather-${i}`, x: 20 + i % 10, y: 15 + Math.floor(i / 10) }));
}
function use(dungeon, flags = {}, overrides = {}) {
 const scroll = { ...ITEMS.find(item => item.effect === "item_gather"), id: "scroll", ...flags };
 const player = makePlayer({ inventory: [scroll], maxInventory: 1, gold: 0, ...overrides });
 if (overrides.fullInventory) player.inventory.push({ id: "kept", type: "weapon", name: "短剣" });
 dungeon.visible = Array.from({ length: MH }, () => Array(MW).fill(false));
 dungeon.explored = Array.from({ length: MH }, () => Array(MW).fill(false));
 const sr = { current: { player, dungeon, ident: new Set() } }, setMsgs = vi.fn(), endTurn = vi.fn();
 useItemActions({ sr, endTurn, dnameRef: item => item.name, lu: () => {}, setGs: vi.fn(), setMsgs,
  setShowInv: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn() }).doUseItem(0);
 expect(endTurn).toHaveBeenCalledOnce();
 expect(player.inventory).not.toContain(scroll);
 return { player, messages: setMsgs.mock.calls.flatMap(([f]) => typeof f === "function" ? f([]) : f) };
}
describe("道具寄せ巻物の消失防止", () => {
 it("通常巻物で周囲に収まらない分も、元の全個体をフロアに残す", () => {
  const originals = items(); const dungeon = makeEmptyDg({ items: [...originals] });
  const { messages } = use(dungeon);
  expect(new Set(dungeon.items)).toEqual(new Set(originals));
  expect(new Set(dungeon.items.map(item => `${item.x},${item.y}`)).size).toBe(originals.length);
  expect(messages.some(message => message.includes("空きマスへ飛んだ"))).toBe(true);
 });
 it.each([{}, { blessed: true }, { cursed: true }])("%j: 置き場がなくても消さず、壁埋まりと壺の中身を維持する", flags => {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const pot = { id: "pot", name: "保存の壺", type: "pot", potEffect: "preserve", capacity: 5, x: 15, y: 15, wallEmbedded: true, contents: [{ id: "inside", type: "potion", effect: "heal" }] };
  const dungeon = makeEmptyDg({ map, items: [pot] });
  use(dungeon, flags, { fullInventory: true });
  expect(dungeon.items).toContain(pot);
  expect(pot).toMatchObject({ x: 15, y: 15, wallEmbedded: true, contents: [{ id: "inside" }] });
 });
 it("祝福巻物で所持品満杯の分も、周囲に収まらなければフロアの空きへ飛ばす", () => {
  const originals = items(35), dungeon = makeEmptyDg({ items: [...originals] });
  const { player } = use(dungeon, { blessed: true });
  expect(new Set([...dungeon.items, ...player.inventory])).toEqual(new Set(originals));
  expect(new Set(dungeon.items.map(item => `${item.x},${item.y}`)).size).toBe(dungeon.items.length);
 });
 it("呪い巻物でも複数の道具を同じ場所へ重ねない", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const originals = items(5), dungeon = makeEmptyDg({ items: [...originals] });
  use(dungeon, { cursed: true });
  expect(new Set(dungeon.items)).toEqual(new Set(originals));
  expect(new Set(dungeon.items.map(item => `${item.x},${item.y}`)).size).toBe(5);
 });
});

describe("巻物と魔法の安全な転送先の共通判定", () => {
 it.each(["normal", "blessed", "cursed", "magic"])("%s: 設備・敵・罠を避け、元の全個体と商品を保つ", mode => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const originals = items(35);
  const shop = { id: "shop", name: "商品", type: "potion", shopPrice: 500, x: 17, y: 18 };
  const dungeon = makeEmptyDg({ items: [...originals, shop],
   monsters: [{ name: "大型敵", x: 4, y: 4, bodySize: 3, hp: 100 }],
   statues: [{ x: 6, y: 5 }], traps: [{ x: 5, y: 6, effect: "explode" }],
   springs: [{ x: 6, y: 6 }], bigboxes: [{ x: 4, y: 6, contents: [] }],
   pentacles: [{ x: 6, y: 4 }], altars: [{ x: 7, y: 5 }], gachaMachines: [{ x: 5, y: 7 }],
   vents: [{ x: 4, y: 7 }], dimensionalVaults: [{ x: 7, y: 7 }], oilyTiles: [{ x: 7, y: 4 }],
  });
  const map = dungeon.map;
  map[3][3] = T.WATER; map[3][4] = T.SD; map[3][5] = T.SU;
  let player;
  if (mode === "magic") {
   player = makePlayer();
   applySpellEffect("item_gather_magic", "self", null, 0, 0, dungeon, player, [], () => {});
  } else player = use(dungeon, { blessed: mode === "blessed", cursed: mode === "cursed" }).player;
  expect(new Set([...dungeon.items, ...player.inventory])).toEqual(new Set([...originals, shop]));
  expect(shop).toMatchObject({ x: 17, y: 18, shopPrice: 500 });
  const positions = dungeon.items.map(item => `${item.x},${item.y}`);
  expect(new Set(positions).size).toBe(positions.length);
  const blocked = ["6,5", "5,6", "6,6", "4,6", "6,4", "7,5", "5,7", "4,7", "7,7", "7,4", "3,3", "4,3", "5,3"];
  for (const item of originals.filter(item => dungeon.items.includes(item))) {
   expect(blocked).not.toContain(`${item.x},${item.y}`);
   expect(item.x < 3 || item.x > 5 || item.y < 3 || item.y > 5).toBe(true);
  }
  expect(dungeon.bigboxes[0].contents).toEqual([]);
  expect(dungeon.traps[0].effect).toBe("explode");
 });
 it("祝福巻物は金貨だけ所持金にし、壺の中身と他の道具は失わない", () => {
  const pot = { id: "pot", name: "保存の壺", type: "pot", potEffect: "preserve", capacity: 5, x: 20, y: 20, contents: [{ id: "inside", type: "potion", effect: "heal" }] };
  const gold = { id: "gold", name: "金貨", type: "gold", value: 150, x: 21, y: 20 };
  const dungeon = makeEmptyDg({ items: [pot, gold] });
  const { player } = use(dungeon, { blessed: true });
  expect(player.gold).toBe(150);
  expect(player.inventory).toContain(pot);
  expect(pot.contents).toEqual([{ id: "inside", type: "potion", effect: "heal" }]);
  expect(dungeon.items).toEqual([]);
 });
});
