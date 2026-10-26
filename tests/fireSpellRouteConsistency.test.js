import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async importOriginal => ({
  ...await importOriginal(), useCallback: fn => fn, useRef: current => ({ current }),
  useEffect: () => {}, useLayoutEffect: () => {},
}));
import { useItemActions } from "../useItemActions.js";
import { drainAnims } from "../animEvents.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => { vi.restoreAllMocks(); drainAnims(); });
function cast(route, size, near = false, barrier = 0, level = 1) {
  drainAnims();
  const book = { id: "book", name: "炎の魔法書", type: "spellbook", spell: "fire_bolt" };
  const player = makePlayer({ hp: 1000, maxHp: 1000, mp: 100, depth: 1,
    facing: { dx: 1, dy: 0 }, inventory: route === "book" ? [book] : [],
    spells: route === "book" && level === 1 ? [] : ["fire_bolt"],
    spellLevels: { fire_bolt: route === "book" ? Math.max(1, level - 1) : level } });
  const monster = { name: "敵", id: "enemy", x: (near ? 6 : 7) + (size === 3 ? 1 : 0), y: 5,
    bodySize: size, hp: 1000, maxHp: 1000, def: 0, barrier };
  const dungeon = makeEmptyDg({ monsters: [monster], rooms: [] });
  const sr = { current: { player, dungeon, ident: new Set(["b:fire_bolt"]), fakeNames: {}, nicknames: {} } };
  const setters = Object.fromEntries(["setGs", "setMsgs", "setShowInv", "setSelIdx", "setShowDesc", "setThrowMode", "setRevealMode"].map(k => [k, vi.fn()]));
  const props = { sr, ...setters, throwMode: { mode: "cast_spell", idx: "fire_bolt" }, endTurn: vi.fn(),
    lu: vi.fn(), dnameRef: it => it.name, withPitfallBag: fn => fn() };
  const actions = useItemActions(props);
  if (route === "book") actions.doReadSpellbook(0);
  else actions.execDirection(1, 0);
  return { playerHp: player.hp, monsterHp: monster.hp, barrier: monster.barrier,
    mp: player.mp, animations: drainAnims(), endTurn: props.endTurn };
}

describe("炎の魔法の通常詠唱と魔法書発動", () => {
  it.each([1, 2, 3].flatMap(size => [1, 3, 6].map(level => [size, level])))("%sマス角の敵にLv%s・同じ乱数なら同じダメージを与える", (size, level) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const manual = cast("manual", size, false, 0, level);
    const book = cast("book", size, false, 0, level);
    expect(book.monsterHp).toBe(manual.monsterHp);
    if (level === 1) expect(manual.monsterHp).toBe({ 1: 964, 2: 931, 3: 909 }[size]);
    expect(book.mp).toBe(manual.mp);
    expect(book.endTurn).toHaveBeenCalledTimes(1);
  });

  it("至近距離の自分への爆風も同じ威力になる", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const manual = cast("manual", 2, true);
    const book = cast("book", 2, true);
    expect(book.playerHp).toBe(manual.playerHp);
    expect(book.playerHp).toBeLessThan(1000);
    expect(book.monsterHp).toBe(manual.monsterHp);
  });

  it.each([2, 3])("%sマス角の敵のバリアも命中マスごとに同じ回数消費する", size => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const manual = cast("manual", size, false, 2);
    const book = cast("book", size, false, 2);
    expect(book.monsterHp).toBe(manual.monsterHp);
    expect(book.monsterHp).toBe(size === 2 ? 967 : 945);
    expect(book.barrier).toBe(0);
  });
});
