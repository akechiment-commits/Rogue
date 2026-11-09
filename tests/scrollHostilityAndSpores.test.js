import { describe, expect, it, vi } from "vitest";
vi.mock("react", async importOriginal => ({
  ...await importOriginal(),
  useCallback: fn => fn,
  useRef: current => ({ current }),
  useEffect: () => {},
  useLayoutEffect: () => {},
}));
import { useItemActions } from "../useItemActions.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
import { MW, MH } from "../utils.js";
import "../monsters.js";

function setup(inventory, monsters = []) {
  const player = makePlayer({ x: 5, y: 5, hp: 50, maxHp: 50, inventory });
  const dungeon = makeEmptyDg({
    monsters,
    visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
    explored: Array.from({ length: MH }, () => Array(MW).fill(true)),
  });
  const messages = [];
  const sr = { current: { player, dungeon, ident: new Set() } };
  const props = {
    sr,
    endTurn: vi.fn(),
    dnameRef: it => it.name,
    setGs: vi.fn(),
    setMsgs: fn => {
      if (typeof fn === "function") {
        const res = fn(messages);
        messages.length = 0;
        messages.push(...res);
      }
    },
    setShowInv: vi.fn(),
    setSelIdx: vi.fn(),
    setShowDesc: vi.fn(),
    withPitfallBag: fn => fn(),
    lu: vi.fn(),
  };
  const actions = useItemActions(props);
  return { player, dungeon, messages, actions };
}

describe("scroll NPC hostility and mushroom counter spore", () => {
  it("雷の巻物で店主が敵対化する", () => {
    const scroll = { id: "s1", name: "雷の巻物", type: "scroll", effect: "thunder" };
    const shopkeeper = {
      id: "shopkeeper1",
      type: "shopkeeper",
      name: "店主",
      x: 6,
      y: 5,
      hp: 100,
      maxHp: 100,
      def: 0,
      state: "neutral",
    };
    const { messages, actions } = setup([scroll], [shopkeeper]);

    actions.doUseItem(0);

    expect(shopkeeper.hp).toBeLessThan(100);
    expect(shopkeeper.state).toBe("hostile");
    expect(messages.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("炎の巻物でキノコモンスターのカウンター胞子が発動する", () => {
    const scroll = { id: "s2", name: "炎の巻物", type: "scroll", effect: "flame" };
    const mushroom = {
      id: "shroom1",
      name: "毒キノコ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 6,
      y: 5,
      hp: 100,
      maxHp: 100,
      def: 0,
    };
    const { messages, actions } = setup([scroll], [mushroom]);

    actions.doUseItem(0);

    expect(mushroom.hp).toBeLessThan(100);
    expect(messages.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("呪われた回復の巻物の自爆ダメージで店主が敵対化する", () => {
    const scroll = { id: "s3", name: "回復の巻物", type: "scroll", effect: "recovery", cursed: true };
    const shopkeeper = {
      id: "shopkeeper2",
      type: "shopkeeper",
      name: "店主",
      x: 6,
      y: 5,
      hp: 100,
      maxHp: 100,
      def: 0,
      state: "neutral",
    };
    const { messages, actions } = setup([scroll], [shopkeeper]);

    actions.doUseItem(0);

    expect(shopkeeper.hp).toBe(50);
    expect(shopkeeper.state).toBe("hostile");
    expect(messages.some(m => m.includes("店主が怒った！"))).toBe(true);
  });

  it("呪われた壁崩しの巻物の壁魔法で魔法無効が効き、キノコ胞子が発動する", () => {
    const scroll = { id: "s4", name: "壁崩しの巻物", type: "scroll", effect: "break_wall", cursed: true };
    const plaster = {
      id: "plaster1",
      name: "キラープラスター",
      baseKind: "killerplaster",
      magicImmune: true,
      x: 6,
      y: 5,
      hp: 50,
      maxHp: 50,
      def: 0,
    };
    const mushroom = {
      id: "shroom2",
      name: "毒キノコ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 4,
      y: 5,
      hp: 50,
      maxHp: 50,
      def: 0,
    };
    const { messages, actions } = setup([scroll], [plaster, mushroom]);

    actions.doUseItem(0);

    // キラープラスターは魔法無効
    expect(plaster.hp).toBe(50);
    expect(messages.some(m => m.includes("魔法はキラープラスターに効かない！"))).toBe(true);

    // キノコはダメージを受けて胞子散布
    expect(mushroom.hp).toBeLessThan(50);
    expect(messages.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });
});
