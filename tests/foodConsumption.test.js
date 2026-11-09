import { afterEach, describe, expect, it, vi } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { MW, MH } from "../utils.js";

vi.mock("react", () => ({
  useCallback: fn => fn,
  useEffect: () => {},
  useRef: initial => ({ current: initial }),
}));
import { useItemActions } from "../useItemActions.js";
import { burnFoodItem, rotFood } from "../items.js";

afterEach(() => vi.restoreAllMocks());

describe.each([
  ["darkness", "darknessTurns", "darkness_proof"],
  ["bewitch", "bewitchedTurns", "bewitch_proof"],
])("食料の%sと状態防止", (effect, field, proofAbility) => {
  it.each([
    ["状態防止中", { statusImmune: 100 }, 5, 5],
    ["耐性防具あり", { armor: { ability: proofAbility } }, 0, 0],
    ["防止なし", {}, 0, 20],
  ])("%sでは既存状態を維持しつつ付与可否を判定する", (_label, protection, before, expected) => {
    const food = { type: "food", name: "薬効付きパン", value: 20, cooked: true, potionEffects: [effect] };
    const player = makePlayer({ hunger: 0, inventory: [food], [field]: before, ...protection });
    const dungeon = makeEmptyDg({
      visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
      explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    });
    const endTurn = vi.fn();
    useItemActions({
      sr: { current: { player, dungeon, ident: new Set() } }, endTurn,
      dnameRef: item => item.name, setGs: vi.fn(), setMsgs: vi.fn(), setShowInv: vi.fn(),
      setSelIdx: vi.fn(), setShowDesc: vi.fn(),
    }).doUseItem(0);
    expect(player[field] || 0).toBe(expected);
    expect(player.hunger).toBe(20);
    expect(player.inventory).toEqual([]);
    expect(endTurn).toHaveBeenCalledOnce();
  });
});

describe("腐敗状態の食料を食べる", () => {
  it.each([
    ["power_food", "atk", "通常", 2], ["power_food", "atk", "焦げ", 0.2], ["power_food", "atk", "腐敗", 0.2],
    ["def_food", "def", "通常", 2], ["def_food", "def", "焦げ", 0.2], ["def_food", "def", "腐敗", 0.2],
  ])("大サイズの%sを%sとして%sで食べても元のサイズから効果を弱める", (effect, field, state, gain) => {
    const food = { type: "food", name: "大きなパン", value: 100, cooked: true, effect };
    if (state === "焦げ") burnFoodItem(food, []);
    if (state === "腐敗") rotFood(food);
    const player = makePlayer({ hunger: 0, atk: 10, def: 10, inventory: [food], rings: [{ effect: "antidote_ring" }] });
    const dungeon = makeEmptyDg({
      visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
      explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    });
    useItemActions({
      sr: { current: { player, dungeon, ident: new Set() } }, endTurn: vi.fn(),
      dnameRef: item => item.name, setGs: vi.fn(), setMsgs: vi.fn(), setShowInv: vi.fn(),
      setSelIdx: vi.fn(), setShowDesc: vi.fn(),
    }).doUseItem(0);
    expect(player[field]).toBeCloseTo(10 + gain);
  });

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

describe("満腹度限界超過時の薬の飲用制限と満腹度計算", () => {
  it.each([
    ["牛乳", { type: "potion", name: "牛乳", effect: "milk", value: 15 }],
    ["回復薬", { type: "potion", name: "薬草", effect: "heal", value: 20 }],
  ])("満腹度が最大値（100）を超えている時は%sを自分から飲めない", (_label, potion) => {
    const player = makePlayer({ hunger: 150, maxHunger: 100, inventory: [potion] });
    const dungeon = makeEmptyDg();
    const endTurn = vi.fn();
    const messages = [];
    const actions = useItemActions({
      sr: { current: { player, dungeon, ident: new Set() } }, endTurn,
      dnameRef: item => item.name, setGs: vi.fn(), setMsgs: fn => messages.push(...fn([])),
      setShowInv: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn(),
    });

    actions.doUseItem(0);

    expect(messages.some(msg => msg.includes("満腹度が限界を超えていて、飲めない！"))).toBe(true);
    expect(player.inventory).toHaveLength(1);
    expect(player.hunger).toBe(150);
    expect(endTurn).not.toHaveBeenCalled();
  });

  it("上限（100）未満から牛乳を飲んだ時は上限突破し、100に切り捨てられない", () => {
    const milk = { type: "potion", name: "牛乳", effect: "milk", value: 15, blessed: true };
    const player = makePlayer({ hunger: 90, maxHunger: 100, inventory: [milk] });
    const dungeon = makeEmptyDg({
      visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
      explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    });
    const actions = useItemActions({
      sr: { current: { player, dungeon, ident: new Set(["p:milk"]) } }, endTurn: vi.fn(),
      dnameRef: item => item.name, setGs: vi.fn(), setMsgs: vi.fn(),
      setShowInv: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn(), setRevealMode: vi.fn(),
    });

    actions.doUseItem(0);

    // 90 + 30 = 120 -> 100 + (120-100)/2 = 110
    expect(player.hunger).toBe(110);
    expect(player.inventory[0]?.name).toBe("空き瓶");
  });
});
