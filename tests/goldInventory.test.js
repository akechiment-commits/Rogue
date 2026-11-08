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
import { canUseInventoryItem, getInventoryUseLabel } from "../inventoryRules.js";
import { itemDisplayName } from "../render.js";
import { thrownItemAttack } from "../items.js";
import { makeMonsterFromBase, MONS } from "../monsters.js";

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
    dnameRef: (it) => itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames),
    setGs: vi.fn(),
    setMsgs: vi.fn(),
    setShowInv: vi.fn(),
    setSelIdx: vi.fn(),
    setShowDesc: vi.fn(),
    setThrowMode: vi.fn(),
    throwMode: null,
    withPitfallBag: (fn) => fn(),
    lu: vi.fn(),
    ...actionOptions,
  };
  const actions = useItemActions(props);
  return { player, dungeon, sr, props, actions };
}

describe("金貨のインベントリ機能と所持品化", () => {
  it("canUseInventoryItem で gold は利用可能であり、ラベルは『使う』になる", () => {
    const goldItem = { name: "金貨", type: "gold", value: 300 };
    expect(canUseInventoryItem(goldItem)).toBe(true);
    expect(getInventoryUseLabel(goldItem)).toBe("使う");
  });

  it("itemDisplayName で gold は 『○○枚の金貨』 と表示される", () => {
    const goldItem = { name: "金貨", type: "gold", value: 450 };
    expect(itemDisplayName(goldItem)).toBe("450枚の金貨");
  });

  it("thrownItemAttack で gold は金額の1/10の攻撃力を持つ", () => {
    const goldItem = { name: "金貨", type: "gold", value: 500 };
    expect(thrownItemAttack(goldItem)).toBe(50);
  });

  it("doSwapItem: 足元の金貨と手持ちのアイテムを交換できる", () => {
    const potion = { id: "p1", name: "薬草", type: "potion", effect: "heal", value: 25 };
    const floorGold = { id: "g1", name: "金貨", type: "gold", value: 300, x: 5, y: 5 };
    const f = fixture([potion]);
    f.dungeon.items.push(floorGold);

    f.actions.doSwapItem(0);

    // インベントリの0番スロットが金貨になり、名前が整えられる
    expect(f.player.inventory[0].type).toBe("gold");
    expect(f.player.inventory[0].value).toBe(300);
    expect(f.player.inventory[0].name).toBe("300枚の金貨");

    // 床には薬草が置かれる
    expect(f.dungeon.items.some((i) => i.id === "p1" && i.x === 5 && i.y === 5)).toBe(true);
    expect(f.dungeon.items.some((i) => i.id === "g1")).toBe(false);
  });

  it("doSwapItem: 足元の店の商品を手持ちと交換すると未払い代金が計上され店主が入り口を塞ぐ", () => {
    const shopkeeper = { id: "sk1", name: "店主", type: "shopkeeper", state: "friendly", x: 2, y: 2, hp: 100 };
    const shop = {
      id: "shop_1",
      shopkeeperId: "sk1",
      room: { x: 1, y: 1, w: 10, h: 10 },
      unpaidTotal: 0,
    };
    const myPotion = { id: "p1", name: "薬草", type: "potion", effect: "heal", value: 25 };
    const shopSword = { id: "w1", name: "銅の剣", type: "weapon", atk: 4, value: 200, shopPrice: 200, _shopId: "shop_1", x: 5, y: 5 };

    const f = fixture([myPotion]);
    f.dungeon.shops = [shop];
    f.dungeon.monsters = [shopkeeper];
    f.dungeon.items.push(shopSword);

    f.actions.doSwapItem(0);

    // インベントリに入った店の商品に対して未払い代金が加算される
    expect(f.player.inventory[0].id).toBe("w1");
    expect(shop.unpaidTotal).toBe(200);
    expect(shopkeeper.state).toBe("blocking");

    // 床にはプレイヤーのアイテムが置かれる
    expect(f.dungeon.items.some((i) => i.id === "p1" && i.x === 5 && i.y === 5)).toBe(true);
    expect(f.props.endTurn).toHaveBeenCalled();
  });

  it("doSwapItem: 手持ちの未払い商品を店内の床アイテムと交換して置くと未払い請求が精算される", () => {
    const shopkeeper = { id: "sk1", name: "店主", type: "shopkeeper", state: "blocking", x: 2, y: 2, homePos: { x: 2, y: 2 }, hp: 100 };
    const shop = {
      id: "shop_1",
      shopkeeperId: "sk1",
      room: { x: 1, y: 1, w: 10, h: 10 },
      unpaidTotal: 200,
    };
    const unpaidSword = { id: "w1", name: "銅の剣", type: "weapon", atk: 4, value: 200, shopPrice: 200, _shopId: "shop_1", _shopCharge: 200 };
    const floorHerb = { id: "h1", name: "薬草", type: "potion", effect: "heal", value: 25, x: 5, y: 5 };

    const f = fixture([unpaidSword]);
    f.dungeon.shops = [shop];
    f.dungeon.monsters = [shopkeeper];
    f.dungeon.items.push(floorHerb);

    f.actions.doSwapItem(0);

    // インベントリには床の薬草が入る
    expect(f.player.inventory[0].id).toBe("h1");
    // 床に置かれた銅の剣の未払い額が返却精算され、残高が0になり店主が開ける
    expect(shop.unpaidTotal).toBe(0);
    expect(f.dungeon.items.some((i) => i.id === "w1" && i.x === 5 && i.y === 5)).toBe(true);
  });

  it("doSwapItem: 足元のアイテムが擬態モンスターの場合は交換が不成立で正体を現す", () => {
    const myPotion = { id: "p1", name: "薬草", type: "potion", effect: "heal", value: 25 };
    const f = fixture([myPotion]);

    const mimicDef = MONS.find(m => m.subtype === "itemMimic") || {
      name: "アイテムモドキ",
      hp: 20,
      atk: 5,
      def: 2,
      exp: 10,
      subtype: "itemMimic",
      symbol: "m",
      color: "#f00",
    };
    const mimic = makeMonsterFromBase(mimicDef, 1, 5, 5, { aware: false });
    mimic.disguisedAsItem = true;
    const fakeItem = {
      id: "fake_1",
      itemMimicId: mimic.id,
      name: "鉄の剣",
      type: "weapon",
      x: 5,
      y: 5,
    };
    f.dungeon.monsters.push(mimic);
    f.dungeon.items.push(fakeItem);

    f.actions.doSwapItem(0);

    // 手持ちアイテムは交換されずそのまま
    expect(f.player.inventory[0].id).toBe("p1");
    // 擬態モンスターが正体を現す
    expect(mimic.disguisedAsItem).toBe(false);
    expect(f.props.endTurn).toHaveBeenCalled();
  });

  it("doUseItem: インベントリ内の金貨を使うと財布（p.gold）に入りインベントリから消える", () => {
    const goldItem = { id: "g1", name: "300枚の金貨", type: "gold", value: 300 };
    const f = fixture([goldItem], { gold: 50 });

    f.actions.doUseItem(0);

    expect(f.player.gold).toBe(350);
    expect(f.player.inventory).toHaveLength(0);
    expect(f.props.endTurn).toHaveBeenCalled();
  });

  it("doThrow: 金貨を敵に投げると金額/10の固定ダメージを与えて消滅する", () => {
    const goldItem = { id: "g1", name: "500枚の金貨", type: "gold", value: 500 };
    const f = fixture([goldItem], {}, { throwMode: { idx: 0, mode: "throw" } });
    const enemy = { id: "m1", name: "テスト敵", x: 6, y: 5, hp: 100, def: 50 };
    f.dungeon.monsters.push(enemy);

    // 右方向 (dx=1, dy=0) に投げる
    f.actions.execDirection(1, 0);

    // 防御力50に関わらず金額/10 = 50ダメージ
    expect(enemy.hp).toBe(50);
    // インベントリから金貨は消え、床にも残らない（消滅）
    expect(f.player.inventory).toHaveLength(0);
    expect(f.dungeon.items.filter((i) => i.type === "gold")).toHaveLength(0);
  });

  it("doThrow: 敵のいない方向に金貨を投げると床に金貨として落ちる", () => {
    const goldItem = { id: "g1", name: "200枚の金貨", type: "gold", value: 200 };
    const f = fixture([goldItem], {}, { throwMode: { idx: 0, mode: "throw" } });

    // 右方向 (dx=1, dy=0) に投げる（敵はいない）
    f.actions.execDirection(1, 0);

    // インベントリからは消費され、床に金貨が配置される
    expect(f.player.inventory).toHaveLength(0);
    const placed = f.dungeon.items.find((i) => i.type === "gold");
    expect(placed).toBeDefined();
    expect(placed.value).toBe(200);
  });
});
