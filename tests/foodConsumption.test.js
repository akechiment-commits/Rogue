import { describe, expect, it, vi } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { MW, MH } from "../utils.js";

vi.mock("react", () => ({
  useCallback: fn => fn,
  useEffect: () => {},
  useRef: initial => ({ current: initial }),
}));
import { useItemActions } from "../useItemActions.js";

describe("腐敗状態の食料を食べる", () => {
  it.each([
    ["通常", {}, 20],
    ["腐った", { rotten: true }, 10],
    ["ヤバイ", { rotten: true, yabai: true }, 5],
  ])("%sの満腹度回復を通常・半分・さらに半分にする", (_name, flags, expected) => {
    const food = { type: "food", name: "パン", value: 20, cooked: true, ...flags };
    const player = makePlayer({ hunger: 0, atk: 12, inventory: [food] });
    const dungeon = makeEmptyDg({
      visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
      explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const endTurn = vi.fn();
    const actions = useItemActions({
      sr, endTurn, dnameRef: item => item.name,
      setGs: vi.fn(), setMsgs: vi.fn(), setShowInv: vi.fn(),
      setSelIdx: vi.fn(), setShowDesc: vi.fn(),
    });
    actions.doUseItem(0);
    expect(player.hunger).toBe(expected);
    expect(player.inventory).toEqual([]);
    expect(endTurn).toHaveBeenCalledOnce();
    if (flags.rotten) {
      expect(player.hp).toBeLessThan(100);
      expect(player.poisoned).toBe(true);
    }
    if (flags.yabai) {
      expect(player.confusedTurns).toBeGreaterThan(0);
      expect(player.bewitchedTurns).toBeGreaterThan(0);
      expect(player.slowTurns).toBeGreaterThan(0);
    }
  });

  it.each([
    ["腐った", { rotten: true, value: 35 }, 48],
    ["焦げた", { burnt: true, value: 21 }, 53],
  ])("%s食料でも固有効果の1割が残る", (_name, state, expectedHp) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const food = {
      type: "food", name: `${_name}癒しのパン`, effect: "heal_food", _foodEfLabel: "癒しの",
      _foodOriginalName: "癒しのパン", _foodOriginalValue: 35, ...state,
    };
    const player = makePlayer({ hp: 50, maxHp: 100, hunger: 0, atk: 12, inventory: [food] });
    const dungeon = makeEmptyDg({
      visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
      explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const messages = [];
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: item => item.name,
      setGs: vi.fn(), setMsgs: updater => { messages.push(...updater([])); }, setShowInv: vi.fn(),
      setSelIdx: vi.fn(), setShowDesc: vi.fn(),
    });

    actions.doUseItem(0);

    expect(player.hp).toBe(expectedHp);
    expect(messages.some(message => message.includes("HP+3"))).toBe(true);
  });
});
