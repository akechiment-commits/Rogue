import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOLD_NUGGET_T,
  FAKE_GOLD_NUGGET_T,
  ITEMS,
  itemPrice,
  makeGoldNugget,
  makeStone,
  sellInventoryItemsToShop,
  thrownItemAttack,
  applyThrownItemToMonster,
  wallBreakDrop,
} from "../items.js";
import { itemDisplayName } from "../render.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("金塊", () => {
  it("通常抽選には混ざらず、実物と偽物のテンプレートを持つ", () => {
    expect(ITEMS).toContainEqual(GOLD_NUGGET_T);
    expect(GOLD_NUGGET_T.weight).toBe(0.05);
    expect(GOLD_NUGGET_T.wallDropOnly).toBe(true);
    expect(FAKE_GOLD_NUGGET_T.isFake).toBe(true);
    expect(makeGoldNugget(false)).toEqual(expect.objectContaining({ type: "gold_nugget" }));
    const real = makeGoldNugget(false);
    expect(real).not.toHaveProperty("isFake");
    expect(makeGoldNugget(true)).toEqual(expect.objectContaining({ type: "gold_nugget", isFake: true }));
  });

  it("鑑定前は本物も偽物も金塊として表示され、売却額は5Gになる", () => {
    const real = makeGoldNugget(false);
    const fake = makeGoldNugget(true);
    expect(itemDisplayName(real, {}, new Set(), {})).toBe("金塊");
    expect(itemDisplayName(fake, {}, new Set(), {})).toBe("金塊");
    expect(sellInventoryItemsToShop([real], { gold: 0, depth: 1, rings: [] }, { id: "s1", unpaidTotal: 0 })).toBe(5);
    expect(sellInventoryItemsToShop([fake], { gold: 0, depth: 1, rings: [] }, { id: "s2", unpaidTotal: 0 })).toBe(5);
  });

  it("本物は鑑定後だけ3000G、偽物は鑑定後も5Gで売れる", () => {
    const real = makeGoldNugget(false);
    const fake = makeGoldNugget(true);
    real.fullIdent = true;
    fake.fullIdent = true;
    expect(itemDisplayName(real, {}, new Set(), {})).toBe("金塊");
    expect(itemDisplayName(fake, {}, new Set(), {})).toBe("偽物の金塊");
    expect(sellInventoryItemsToShop([real], { gold: 0, depth: 1, rings: [] }, { id: "s1", unpaidTotal: 0 })).toBe(3000);
    expect(sellInventoryItemsToShop([fake], { gold: 0, depth: 1, rings: [] }, { id: "s2", unpaidTotal: 0 })).toBe(5);
  });

  it("壁掘りで本物・偽物を追加抽選し、既存の石系抽選も維持する", () => {
    const realDg = makeEmptyDg();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.001);
    wallBreakDrop(realDg, 3, 4);
    expect(realDg.items[0]).toEqual(expect.objectContaining({ type: "gold_nugget", x: 3, y: 4 }));
    expect(realDg.items[0]).not.toHaveProperty("isFake");

    const fakeDg = makeEmptyDg();
    randomSpy.mockReturnValue(0.007);
    wallBreakDrop(fakeDg, 5, 6);
    expect(fakeDg.items[0]).toEqual(expect.objectContaining({ type: "gold_nugget", isFake: true, x: 5, y: 6 }));

    const magicDg = makeEmptyDg();
    randomSpy.mockReturnValue(0.015);
    wallBreakDrop(magicDg, 1, 1);
    expect(magicDg.items[0]).toEqual(expect.objectContaining({ magicStone: true }));

    const stoneDg = makeEmptyDg();
    randomSpy.mockReturnValue(0.05);
    wallBreakDrop(stoneDg, 1, 1);
    expect(stoneDg.items[0]).toEqual(expect.objectContaining({ stone: true }));
  });

  it("投げると石と同じ通常投擲ダメージになる", () => {
    const real = makeGoldNugget(false);
    const stone = makeStone(1);
    expect(thrownItemAttack(real)).toBe(thrownItemAttack(stone));

    const monster = { name: "敵", hp: 20, maxHp: 20, def: 0, x: 2, y: 2 };
    const player = makePlayer({ x: 1, y: 2 });
    const messages = [];
    applyThrownItemToMonster(real, monster, makeEmptyDg(), player, messages, () => {});
    expect(monster.hp).toBeLessThan(20);
    expect(messages[0]).toContain("金塊");
  });
});
