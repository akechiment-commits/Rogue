import { afterEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => []);
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
    useEffect: (fn) => effects.push(fn),
    useLayoutEffect: (fn) => effects.push(fn),
  };
});

import { useItemActions } from "../useItemActions.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
import { soakItemIntoSpring, makeSpringEjectedItem, SPRING_EJECT_CHANCE } from "../items.js";
import {
  rollWishChance,
  WISH_CHANCE_DRINK,
  WISH_CHANCE_GOLD_COIN,
  WISH_CHANCE_GOLD_NUGGET,
  goldCoinWishChance,
  goldCoinEjectChance,
  SPRING_EJECT_CANDIDATES,
} from "../wish.js";

afterEach(() => {
  effects.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(inventory, overrides = {}, actionOptions = {}) {
  const player = makePlayer({
    x: 5,
    y: 5,
    hp: 30,
    maxHp: 100,
    atk: 8,
    def: 2,
    depth: 1,
    gold: 0,
    inventory,
    ...overrides,
  });
  const dungeon = makeEmptyDg({
    rooms: [{ x: 1, y: 1, w: 12, h: 12 }],
  });
  const sr = {
    current: {
      player,
      dungeon,
      ident: new Set(),
      fakeNames: {},
      nicknames: {},
      floors: {},
    },
  };
  const props = {
    sr,
    endTurn: vi.fn(),
    dnameRef: (it) => it.name,
    setGs: vi.fn(),
    setMsgs: vi.fn(),
    setShowInv: vi.fn(),
    setSelIdx: vi.fn(),
    setShowDesc: vi.fn(),
    setWishMode: vi.fn(),
    setThrowMode: vi.fn(),
    throwMode: null,
    withPitfallBag: (fn) => fn(),
    lu: vi.fn(),
    ...actionOptions,
  };
  const actions = useItemActions(props);
  return { player, dungeon, sr, props, actions };
}

describe("泉への金貨・金塊投入ギミックと願い率調整", () => {
  it("願い率の定数が仕様どおり調整されている", () => {
    expect(WISH_CHANCE_DRINK).toBe(0.001); // 飲水: 0.1% に低下
    expect(WISH_CHANCE_GOLD_COIN).toBe(0.015); // 金貨基準: 1.5%
    expect(WISH_CHANCE_GOLD_NUGGET).toBe(0.15); // 金塊: 15%
  });

  it("金貨の金額に応じて願い率とアイテム射出率が正しくスケーリングする", () => {
    // 0G〜100G: 願い約0.5%〜0.55%, 射出約15%〜15.5%
    expect(goldCoinWishChance(0)).toBeCloseTo(0.005, 4);
    expect(goldCoinWishChance(100)).toBeCloseTo(0.0055, 4);
    expect(goldCoinEjectChance(0)).toBeCloseTo(0.15, 4);
    expect(goldCoinEjectChance(100)).toBeCloseTo(0.155, 4);

    // 1000G: 願い1.0%, 射出20.0%
    expect(goldCoinWishChance(1000)).toBeCloseTo(0.010, 4);
    expect(goldCoinEjectChance(1000)).toBeCloseTo(0.20, 4);

    // 5000G: 願い3.0%, 射出40.0%
    expect(goldCoinWishChance(5000)).toBeCloseTo(0.030, 4);
    expect(goldCoinEjectChance(5000)).toBeCloseTo(0.40, 4);

    // 10000G: 願い5.5%, 射出上限50.0%
    expect(goldCoinWishChance(10000)).toBeCloseTo(0.055, 4);
    expect(goldCoinEjectChance(10000)).toBe(0.50);

    // 20000G以上: 願い上限8.0%, 射出上限50.0%
    expect(goldCoinWishChance(20000)).toBe(0.08);
    expect(goldCoinEjectChance(20000)).toBe(0.50);
  });

  it("射出アイテム候補の重みが仕様（巻物 > ペン > 杖 > 幸運の薬 > 魔法書）に従っている", () => {
    const scrollW = SPRING_EJECT_CANDIDATES.find((c) => c.name === "テレポートの巻物")?.weight;
    const penW = SPRING_EJECT_CANDIDATES.find((c) => c.name === "テレポートのペン")?.weight;
    const wandW = SPRING_EJECT_CANDIDATES.find((c) => c.name === "テレポートの杖")?.weight;
    const potionW = SPRING_EJECT_CANDIDATES.find((c) => c.name === "幸運の薬")?.weight;
    const bookW = SPRING_EJECT_CANDIDATES.find((c) => c.name === "テレポートの魔法書")?.weight;

    // テレポートは巻物がいちばん高確率でペン、杖、魔法書の順で低確率
    expect(scrollW).toBeGreaterThan(penW);
    expect(penW).toBeGreaterThan(wandW);
    expect(wandW).toBeGreaterThan(bookW);

    // 薬は杖と魔法書の間
    expect(wandW).toBeGreaterThan(potionW);
    expect(potionW).toBeGreaterThan(bookW);

    // 各重み値（40, 25, 18, 12, 5）の合計が100
    const totalW = SPRING_EJECT_CANDIDATES.reduce((s, c) => s + c.weight, 0);
    expect(totalW).toBe(100);
    expect(scrollW).toBe(40);
    expect(penW).toBe(25);
    expect(wandW).toBe(18);
    expect(potionW).toBe(12);
    expect(bookW).toBe(5);
  });

  it("makeSpringEjectedItem は乱数に応じた重み付けで5種のアイテムを生成する", () => {
    // 0〜39% -> テレポートの巻物
    expect(makeSpringEjectedItem(() => 0.0).name).toBe("テレポートの巻物");
    expect(makeSpringEjectedItem(() => 0.39).name).toBe("テレポートの巻物");

    // 40〜64% -> テレポートのペン
    expect(makeSpringEjectedItem(() => 0.40).name).toBe("テレポートのペン");
    expect(makeSpringEjectedItem(() => 0.64).name).toBe("テレポートのペン");

    // 65〜82% -> テレポートの杖
    expect(makeSpringEjectedItem(() => 0.65).name).toBe("テレポートの杖");
    expect(makeSpringEjectedItem(() => 0.82).name).toBe("テレポートの杖");

    // 83〜94% -> 幸運の薬
    expect(makeSpringEjectedItem(() => 0.83).name).toBe("幸運の薬");
    expect(makeSpringEjectedItem(() => 0.94).name).toBe("幸運の薬");

    // 95〜99% -> テレポートの魔法書
    expect(makeSpringEjectedItem(() => 0.95).name).toBe("テレポートの魔法書");
    expect(makeSpringEjectedItem(() => 0.99).name).toBe("テレポートの魔法書");
  });

  it("soakItemIntoSpring: 金貨投入で願いが発動した場合（高額金貨で確率上昇）", () => {
    const spr = { x: 5, y: 5, contents: [] };
    const highGold = { name: "10000枚の金貨", type: "gold", value: 10000 };
    const ml = [];
    // 10000Gの願い率は 5.5% (0.055)。0.04 で成功する
    const res = soakItemIntoSpring(spr, highGold, ml, null, null, null, { rngFn: () => 0.04 });

    expect(res.wish).toBe(true);
    expect(ml.some((m) => m.includes("願"))).toBe(true);
    expect(ml.some((m) => m.includes("吸い込まれると"))).toBe(true);
    expect(spr.contents).toHaveLength(0); // 泉には残らず消滅
  });

  it("soakItemIntoSpring: 少額金貨では低い願い率となり、不発時は消滅メッセージが出る", () => {
    const spr = { x: 5, y: 5, contents: [] };
    const lowGold = { name: "100枚の金貨", type: "gold", value: 100 };
    const ml = [];
    // 100Gの願い率は 0.55%。0.02 では不発。射出率 15.5% で 0.30 では不発
    const res = soakItemIntoSpring(spr, lowGold, ml, null, null, null, { rngFn: () => 0.30 });

    expect(res.wish).toBe(false);
    expect(res.itemEjected).toBeNull();
    expect(ml.some((m) => m.includes("吸い込まれて消えた…"))).toBe(true);
    expect(spr.contents).toHaveLength(0); // 泉には残らず消滅
  });

  it("soakItemIntoSpring: 金貨投入で願い不発かつアイテム飛び出しが発生する場合", () => {
    const dg = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 10, h: 10 }] });
    const spr = { x: 5, y: 5, contents: [] };
    dg.springs = [spr];
    const gold = { name: "3000枚の金貨", type: "gold", value: 3000 };
    const ml = [];

    let callCount = 0;
    const rngFn = () => {
      callCount++;
      if (callCount === 1) return 0.10; // 願い不発（3000Gの願い率は2.0%）
      if (callCount === 2) return 0.25; // 飛び出し判定（3000Gの射出率は30%なので0.25で成功）
      return 0; // 候補1
    };

    const res = soakItemIntoSpring(spr, gold, ml, dg, null, null, { rngFn });

    expect(res.wish).toBe(false);
    expect(res.itemEjected).toBeDefined();
    expect(ml.some((m) => m.includes("吸い込まれて消えた…"))).toBe(true);
    expect(ml.some((m) => m.includes("飛び出してきた"))).toBe(true);
    expect(dg.items).toHaveLength(1);
    expect(spr.contents).toHaveLength(0);
  });

  it("soakItemIntoSpring: 本物の金塊投入で高確率（15%）で願いが発動する", () => {
    const spr = { x: 5, y: 5, contents: [] };
    const goldNugget = { name: "金塊", type: "gold_nugget", isFake: false };
    const ml = [];

    const res = soakItemIntoSpring(spr, goldNugget, ml, null, null, null, { rngFn: () => 0.1 });

    expect(res.wish).toBe(true);
    expect(ml.some((m) => m.includes("眩い光"))).toBe(true);
    expect(spr.contents).toHaveLength(0);
  });

  it("soakItemIntoSpring: 偽物の金塊では願いが発生しない", () => {
    const spr = { x: 5, y: 5, contents: [] };
    const fakeNugget = { name: "金塊", type: "gold_nugget", isFake: true };
    const ml = [];

    const res = soakItemIntoSpring(spr, fakeNugget, ml, null, null, null, { rngFn: () => 0 });

    expect(res.wish).toBe(false);
    expect(ml.some((m) => m.includes("何も起こらなかった"))).toBe(true);
    expect(ml.some((m) => m.includes("吸い込まれて消えた…"))).toBe(true);
  });

  it("金貨を投げて泉に入った時に泉投入ギミックが処理される", () => {
    const goldItem = { id: "g1", name: "300枚の金貨", type: "gold", value: 300 };
    const f = fixture([goldItem], {}, { throwMode: { idx: 0, mode: "throw" } });
    const spr = { x: 7, y: 5, contents: [] };
    f.dungeon.springs.push(spr);

    // 右方向へ投げる（7, 5に泉がある）
    f.actions.execDirection(1, 0);

    // インベントリから金貨は消え、泉のcontentsには入らず底に沈む
    expect(f.player.inventory).toHaveLength(0);
    expect(spr.contents).toHaveLength(0);
  });
});
