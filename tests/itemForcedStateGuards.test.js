import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useEffect: () => {}, useRef: value => ({ current: value }) }));
import { useItemActions } from "../useItemActions.js";
import { getIdentKey } from "../items.js";
import { hasForcedTurn } from "../turnUpkeep.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
import { MW, MH } from "../utils.js";

const heal = () => ({ id: "heal", name: "回復薬", type: "potion", effect: "heal", value: 30 });
function fixture(inventory, status, extra = {}) {
  const player = makePlayer({ hp: 50, mp: 50, inventory, ...status });
  const dungeon = makeEmptyDg({
    visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
  });
  const sr = { current: { player, dungeon, ident: new Set(inventory.map(getIdentKey).filter(Boolean)) } };
  const endTurn = vi.fn(), setThrowMode = vi.fn(), setPutMode = vi.fn(), setMarkerMode = vi.fn();
  const actions = useItemActions({ sr, endTurn, setThrowMode, setPutMode, setMarkerMode,
    dnameRef: item => item.name, setGs: vi.fn(), setMsgs: vi.fn(), setShowInv: vi.fn(),
    setSelIdx: vi.fn(), setShowDesc: vi.fn(), ...extra });
  return { player, dungeon, sr, actions, endTurn, setThrowMode, setPutMode, setMarkerMode };
}

const operations = [
  ["doUseItem", () => [heal()], [0]],
  ["doDropItem", () => [heal()], [0]],
  ["doThrow", () => [heal()], [0]],
  ["doShoot", () => [{ type: "arrow", name: "矢", count: 3 }], [0]],
  ["doWaveWand", () => [{ type: "wand", name: "杖", charges: 2 }], [0]],
  ["doBreakWand", () => [{ type: "wand", name: "杖", charges: 2 }], [0]],
  ["doUseMarker", () => [{ type: "marker", name: "マーカー", charges: 10 }], [0]],
  ["doReadSpellbook", () => [{ type: "spellbook", name: "回復の魔法書", spell: "heal_magic" }], [0]],
  ["doMarkerWrite", () => [{ type: "marker", charges: 10 }, { type: "scroll", effect: "blank" }],
    [1, { type: "scroll", name: "識別の巻物", effect: "identify" }, { markerIdx: 0 }]],
  ["doPutItem", () => [heal(), { type: "pot", name: "保存の壺", capacity: 3, contents: [] }], [0, { potIdx: 1 }]],
  ["doBreakPot", () => [{ type: "pot", name: "保存の壺", capacity: 3, contents: [] }], [0]],
  ["execDirection", () => [heal()], [1, 0]],
];

describe.each(operations)("行動不能中の%s", (method, inventory, args) => {
  it.each([{ frozenTurns: 5 }, { potConfinedTurns: 3 }, { sleepInterruptedTurns: 1 }])("%jでは道具・HP・MP・ターンを消費しない", status => {
    const f = fixture(inventory(), status, { throwMode: { idx: 0, mode: "throw" } });
    const before = structuredClone(f.player.inventory);
    f.actions[method](...args);
    expect(f.player.inventory).toEqual(before);
    expect(f.player.hp).toBe(50);
    expect(f.player.mp).toBe(50);
    expect(f.player).toMatchObject(status);
    expect(f.endTurn).not.toHaveBeenCalled();
    for (const setter of [f.setThrowMode, f.setPutMode, f.setMarkerMode]) expect(setter).not.toHaveBeenCalled();
  });
});

it.each([{ sleepTurns: 3 }, { paralyzeTurns: 3 }, { petrifiedTurns: 3 }, { slowSkip: true }, { hp: 0 }])("通常の道具使用も%jでは停止する", status => {
  const f = fixture([heal()], status);
  f.actions.doUseItem(0);
  expect(f.player.inventory).toHaveLength(1);
  expect(f.endTurn).not.toHaveBeenCalled();
});

it("凍結解除後には道具を使え、捕獲だけなら使用を妨げない", () => {
  const f = fixture([heal()], { frozenTurns: 5 });
  f.actions.doUseItem(0);
  expect(f.player.hp).toBe(50);
  f.player.frozenTurns = 0;
  f.player.capturedBy = "captor";
  f.actions.doUseItem(0);
  expect(f.player.hp).toBe(80);
  expect(f.player.capturedBy).toBe("captor");
  expect(f.endTurn).toHaveBeenCalledOnce();
});

it("行動不能中の床道具使用は、所持品への仮移動や商品の請求より前に止める", () => {
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const _doFloorItemAction =");
  const end = source.indexOf("  const _doFloorWaveWand =", start);
  if (start < 0 || end < 0) throw new Error("Floor item action not found");
  const f = fixture([], { frozenTurns: 5 }), item = { ...heal(), x: 5, y: 5, shopPrice: 100 };
  f.dungeon.items.push(item);
  const charge = vi.fn(), use = vi.fn();
  const action = new Function("sr", "hasForcedTurn", "_chargeShopFloorItem", `${source.slice(start, end)};return _doFloorItemAction;`)(f.sr, hasForcedTurn, charge);
  action(item, use);
  expect(f.dungeon.items).toContain(item);
  expect(f.player.inventory).toEqual([]);
  expect(charge).not.toHaveBeenCalled();
  expect(use).not.toHaveBeenCalled();
});
