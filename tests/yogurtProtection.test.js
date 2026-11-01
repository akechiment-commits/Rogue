import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useEffect: () => {}, useRef: value => ({ current: value }) }));
import { useItemActions } from "../useItemActions.js";
import { applyPotionEffect, applyFoodEffectsOnHit, applyIceCreamEffect, fireTrapItem } from "../items.js";
import { applyPlayerPoison, applyPlayerConfusion, statusResultMessage } from "../statusDuration.js";
import { fireTrapPlayer } from "../traps.js";
import { applyWandEffect } from "../wands.js";
import { MONS, makeMonsterFromBase, triggerMushroomCounterSpore } from "../monsters.js";
import { advanceConsumableBuffTimers } from "../turnUpkeep.js";
import { MW, MH, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());
function dungeon(overrides = {}) {
  return makeEmptyDg({
    rooms: [], visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)), ...overrides,
  });
}
function consume(item, player, dg = dungeon(), messages = []) {
  player.inventory = [item];
  const endTurn = vi.fn();
  useItemActions({
    sr: { current: { player, dungeon: dg, ident: new Set() } }, endTurn,
    dnameRef: food => food.name, lu: vi.fn(), setGs: vi.fn(), setMsgs: fn => messages.push(...fn([])),
    setShowInv: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn(),
  }).doUseItem(0);
  return { messages, endTurn };
}
function expectProtected(player) {
  expect(player.poisoned || false).toBe(false);
  expect(player.poisonedTurns || 0).toBe(0);
  expect(player.poisonAtkLoss || 0).toBe(0);
  expect(player.confusedTurns || 0).toBe(0);
  expect(player.atk).toBe(10);
}

describe("ヨーグルトによる毒・混乱免疫", () => {
  it.each(["poison", "confuse"])("%sの薬液・通常と祝福を防ぐ", effect => {
    for (const blessed of [false, true]) {
      const player = makePlayer({ yogurtImmuneTurns: 100, atk: 10 }), dg = dungeon();
      applyPotionEffect(effect, 15, "player", player, dg, player, [], () => {}, blessed);
      expectProtected(player);
    }
  });

  it.each(["poison", "confuse"])("%sの飲用・食料への薬効でも防ぐ", effect => {
    for (const type of ["potion", "food"]) {
      const player = makePlayer({ yogurtImmuneTurns: 100, atk: 10, hunger: 0 });
      const item = type === "potion"
        ? { type, name: "薬", effect, value: 15 }
        : { type, name: "薬効付きパン", cooked: true, value: 20, potionEffects: [effect] };
      const { messages, endTurn } = consume(item, player);
      expectProtected(player);
      expect(player.inventory.every(entry => entry !== item)).toBe(true);
      expect(messages.some(message => message.includes("乳酸菌"))).toBe(true);
      expect(endTurn).toHaveBeenCalledOnce();
      if (type === "food") expect(player.hunger).toBe(20);
    }
  });

  it("食料の投擲命中でも毒・混乱を防ぎ、満腹度回復は行う", () => {
    const player = makePlayer({ yogurtImmuneTurns: 100, atk: 10, hunger: 0 });
    applyFoodEffectsOnHit({ type: "food", name: "薬効付きパン", value: 20, potionEffects: ["poison", "confuse"] },
      "player", player, dungeon(), player, [], () => {});
    expectProtected(player);
    expect(player.hunger).toBe(20);
  });

  it.each(["confuse_trap", "poison_arrow"])("%sでも免疫を使い、毒矢のダメージは受ける", effect => {
    const player = makePlayer({ yogurtImmuneTurns: 100, atk: 10, facing: { dx: 0, dy: -1 } });
    const trap = { id: "trap", name: "罠", x: 5, y: 5, effect };
    const dg = dungeon({ traps: [trap] });
    for (let x = 0; x < MW; x++) dg.map[0][x] = T.WALL;
    fireTrapPlayer(trap, player, dg, []);
    expectProtected(player);
    if (effect === "poison_arrow") expect(player.hp).toBeLessThan(100);
  });

  it("道具で起動された混乱罠にも効く", () => {
    const player = makePlayer({ yogurtImmuneTurns: 100, atk: 10 });
    const trap = { id: "item-trap", name: "混乱の罠", x: 5, y: 5, effect: "confuse_trap" };
    const dg = dungeon({ traps: [trap] });
    fireTrapItem(trap, { name: "石", type: "misc" }, dg, 5, 5, [], new Set(), player);
    expectProtected(player);
  });

  it("混乱の杖の通常・祝福に効く", () => {
    for (const multiplier of [1, 2]) {
      const player = makePlayer({ yogurtImmuneTurns: 100, atk: 10 });
      applyWandEffect("confuse", "player", player, 1, 0, dungeon(), player, [], () => {}, null, multiplier);
      expectProtected(player);
    }
  });

  it.each([1, 3])("Lv%sキノコの毒・混乱胞子にも効く", level => {
    const shroom = makeMonsterFromBase(MONS.find(monster => monster.baseKind === "mushroom"), level, 5, 5);
    const player = makePlayer({ x: 6, y: 5, yogurtImmuneTurns: 100, atk: 10 });
    triggerMushroomCounterSpore(shroom, dungeon({ monsters: [shroom] }), player, []);
    expectProtected(player);
  });

  it("アイス重ね食いの混乱を防いでもHP・満腹度は回復する", () => {
    const player = makePlayer({ hp: 50, hunger: 0, yogurtImmuneTurns: 100, iceCreamFireResTurns: 10 });
    applyIceCreamEffect(player, "player", []);
    expect(player.confusedTurns || 0).toBe(0);
    expect(player.hp).toBe(65);
    expect(player.hunger).toBe(15);
  });

  it("呪い万能薬の毒・混乱だけを防ぎ、他の異常は付く", () => {
    const player = makePlayer({ yogurtImmuneTurns: 100, atk: 10 }), messages = [];
    applyPotionEffect("panacea", 0, "player", player, dungeon(), player, messages, () => {}, false, true);
    expectProtected(player);
    for (const field of ["sleepTurns", "slowTurns", "darknessTurns", "bewitchedTurns", "sealedTurns"]) {
      expect(player[field]).toBeGreaterThan(0);
    }
    expect(messages).toContain("万能薬の呪い！眠り・鈍足・暗闇・幻惑・封印になった！毒・混乱は乳酸菌が防いだ！【呪】");
  });

  it("既存の毒・混乱を延長せず、免疫が切れれば通常どおり付く", () => {
    const player = makePlayer({ yogurtImmuneTurns: 1, atk: 10, poisoned: true, poisonedTurns: 3, confusedTurns: 3 });
    const poison = applyPlayerPoison(player);
    expect(poison.blockedBy).toBe("yogurt");
    expect(statusResultMessage(poison, "毒状態になった！")).toBe("乳酸菌が毒を防いだ！");
    expect(applyPlayerConfusion(player, 5)).toBe(0);
    expect(player.poisonedTurns).toBe(3);
    expect(player.confusedTurns).toBe(3);
    advanceConsumableBuffTimers(player, []);
    expect(applyPlayerPoison(player).blocked).not.toBe(true);
    expect(applyPlayerConfusion(player, 5)).toBe(5);
    expect(player.poisonedTurns).toBe(8);
    expect(player.confusedTurns).toBe(8);
  });

  it.each([{}, { rotten: true }, { burnt: true }])("ヨーグルト食料%sは通常なら両方、傷んだ時は1状態だけ治す", flags => {
    const player = makePlayer({ hunger: 0, atk: 8, poisoned: true, poisonedTurns: 3, poisonAtkLoss: 2, confusedTurns: 5 });
    consume({ type: "food", name: "ヨーグルトパン", cooked: true, value: 20, potFlavors: ["yogurt"], ...flags }, player);
    expect(player.poisoned).toBe(false);
    expect(player.poisonAtkLoss).toBe(0);
    expect(player.atk).toBe(10);
    const damaged = flags.rotten || flags.burnt;
    expect(player.confusedTurns).toBe(damaged ? 5 : 0);
    expect(player.yogurtImmuneTurns).toBe(damaged ? 10 : 100);
  });

  it("毒切れ後の攻撃力低下も通常ヨーグルトで回復する", () => {
    const player = makePlayer({ hunger: 0, atk: 8, poisonAtkLoss: 2, confusedTurns: 5 });
    consume({ type: "food", name: "ヨーグルトパン", cooked: true, value: 20, potFlavors: ["yogurt"] }, player);
    expect(player.atk).toBe(10);
    expect(player.poisonAtkLoss).toBe(0);
    expect(player.confusedTurns).toBe(0);
  });
});
