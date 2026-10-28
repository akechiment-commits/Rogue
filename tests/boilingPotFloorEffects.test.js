import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async importOriginal => ({
  ...await importOriginal(), useCallback: fn => fn, useRef: current => ({ current }),
  useEffect: () => {}, useLayoutEffect: () => {},
}));
import { useItemActions } from "../useItemActions.js";
import { drainAnims } from "../animEvents.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => { vi.restoreAllMocks(); drainAnims(); });
function setup(effect = "fire") {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  drainAnims();
  const pot = { id: "boil", name: "加熱の壺", type: "pot", potEffect: "boil", contents: [], capacity: 3 };
  const potion = { id: "potion", name: "薬", type: "potion", effect, value: 50 };
  const player = makePlayer({ hp: 1000, maxHp: 1000, inventory: [pot, potion], armor: { ability: "fire_resist" } });
  const dungeon = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 14, h: 12 }] });
  const sr = { current: { player, dungeon, ident: new Set(), fakeNames: {}, nicknames: {} } };
  const props = { sr, putMode: { potIdx: 0 }, dnameRef: item => item.name, lu: vi.fn(), endTurn: vi.fn(),
    setGs: vi.fn(), setMsgs: vi.fn(), setShowInv: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn(),
    setPutMode: vi.fn(), setPutMenuSel: vi.fn(), setPutPage: vi.fn() };
  return { player, pot, dungeon, props, put: () => useItemActions(props).doPutItem(1) };
}
const bomb = (x, id) => ({ id, name: "火薬壺", type: "pot", potEffect: "gunpowder", contents: [], capacity: 3, x, y: 5 });

describe("加熱の壺から床アイテムへ広がる薬効", () => {
  it("炎で火薬壺が誘爆し、爆風で近くの敵を倒す", () => {
    const s = setup();
    const powder = bomb(9, "powder");
    const enemy = { id: "enemy", name: "敵", x: 9, y: 5, hp: 1000, maxHp: 1000, exp: 0 };
    s.dungeon.items.push(powder);
    s.dungeon.monsters.push(enemy);
    s.put();
    expect(s.dungeon.items).not.toContain(powder);
    expect(s.dungeon.monsters).not.toContain(enemy);
    expect(drainAnims()).toContainEqual(expect.objectContaining({ type: "explosion", x: 9, y: 5 }));
    expect(s.pot.capacity).toBe(2);
    expect(s.props.endTurn).toHaveBeenCalledTimes(1);
  });

  it("誘爆で消費された次の火薬壺を、薬効のループで再爆発させない", () => {
    const s = setup();
    s.dungeon.items.push(bomb(9, "one"), bomb(10, "two"));
    s.put();
    expect(s.dungeon.items.some(i => i.potEffect === "gunpowder")).toBe(false);
    const blasts = drainAnims().filter(a => a.type === "explosion");
    expect(blasts.filter(a => a.x === 9 && a.y === 5)).toHaveLength(1);
    expect(blasts.filter(a => a.x === 10 && a.y === 5)).toHaveLength(1);
  });

  it.each(["fire", "water"])("%sで燃焼・白紙化した商品は代金を1回だけ計上する", effect => {
    const s = setup(effect);
    const item = { id: "sale", name: "識別の巻物", type: "scroll", effect: "identify", x: 9, y: 5, shopPrice: 100, _shopId: "shop" };
    const shop = { id: "shop", unpaidTotal: 0 };
    s.dungeon.shops = [shop];
    s.dungeon.items.push(item);
    s.put();
    expect(shop.unpaidTotal).toBe(100);
    expect(item.shopPrice).toBeUndefined();
    if (effect === "fire") expect(s.dungeon.items).not.toContain(item);
    else expect(item.effect).toBe("blank");
  });

  it("変化しない商品は代金を計上せず、そのまま残す", () => {
    const s = setup("heal");
    const item = { id: "sale", name: "短剣", type: "weapon", x: 9, y: 5, shopPrice: 100, _shopId: "shop" };
    const shop = { id: "shop", unpaidTotal: 0 };
    s.dungeon.shops = [shop]; s.dungeon.items.push(item);
    s.put();
    expect(shop.unpaidTotal).toBe(0);
    expect(s.dungeon.items).toContain(item);
    expect(item.shopPrice).toBe(100);
  });

  it("誘爆の途中で階が変わったら、元の部屋の残りの道具へ薬効をかけない", () => {
    const s = setup();
    const food = { id: "food", name: "パン", type: "food", value: 20, x: 2, y: 5 };
    s.dungeon.items.push(bomb(9, "powder"), food);
    s.dungeon.monsters.push({ id: "enemy", name: "敵", x: 9, y: 5, hp: 1000, maxHp: 1000, exp: 0 });
    const nextFloor = makeEmptyDg();
    s.props.lu.mockImplementation(() => {
      s.player.depth = 2;
      s.props.sr.current.dungeon = nextFloor;
    });
    s.put();
    expect(s.props.sr.current.dungeon).toBe(nextFloor);
    expect(food).toMatchObject({ name: "パン", value: 20 });
    expect(food.cooked).toBeFalsy();
  });
});
