import { afterEach, describe, expect, it, vi } from "vitest";
import { applyWandEffect } from "../wands.js";
import { clearPitfallBag, setPitfallBag, splashPotion, throwItemAlongLine } from "../items.js";
import { placeFallenEntities } from "../pitfallPlacement.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { useItemActions } from "../useItemActions.js";
import { T } from "../utils.js";

vi.mock("react", () => ({
  useCallback: fn => fn, useRef: value => ({ current: value }), useEffect: () => {},
}));

afterEach(() => { clearPitfallBag(); vi.restoreAllMocks(); });

it.each(["fire", "sleep", "poison", "water", "heal"])("薬液(%s)を対象ごとに1回分のバリアで防ぐ", effect => {
  const player = makePlayer({ x: 5, y: 5, hp: 75, barrier: 2, oilyTurns: 3 });
  const target = { id: "large", name: "巨大敵", x: 6, y: 5, bodySize: 2, hp: 75, maxHp: 100, barrier: 2, oilyTurns: 3 };
  const dungeon = makeEmptyDg({ monsters: [target], oilyTiles: [{ x: 5, y: 5 }] });

  splashPotion(dungeon, 5, 5, effect, 20, player, [], () => {});

  for (const unit of [player, target]) {
    expect(unit).toMatchObject({ hp: 75, barrier: 1, oilyTurns: 3 });
    expect(unit.sleepTurns || 0).toBe(0);
    expect(unit.poisonedTurns || 0).toBe(0);
    expect(unit.soakedTurns || 0).toBe(0);
  }
  if (effect === "water") expect(dungeon.oilyTiles).toEqual([]);
});

function setup(effect, route) {
  const potion = { id: "potion", type: "potion", name: "回復薬", effect: "heal", value: 30, x: 5, y: 5 };
  const path = { id: "path", name: "途中の落とし穴", effect: "pitfall", x: 5, y: 8, permanent: true, revealed: false };
  const landing = { id: "landing", name: `${effect}の罠`, effect, x: 5, y: 15, permanent: true, revealed: false };
  const player = makePlayer({ x: 6, y: 15, hp: 60, maxHp: 100 });
  const dg = makeEmptyDg({ rooms: [], items: route === "wand" ? [potion] : [], traps: [path, landing] });
  const logs = [];
  const run = () => route === "wand"
    ? applyWandEffect("knockback", "item", potion, 0, 1, dg, player, logs, () => {})
    : throwItemAlongLine({ x: 5, y: 5, name: "投げる敵", hp: 100 }, dg, potion, 0, 1, 10, logs, player, () => {});
  return { potion, path, landing, player, dg, logs, run };
}

describe("薬瓶の着地罠を薬液より先に処理する", () => {
  it.each(['pitfall', 'explode'])('瓶が外れた着地点の%sで消費された薬は飛沫を出さない', effect => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const potion = { id: 'missed-potion', name: '回復薬', type: 'potion', effect: 'heal', value: 30 };
    const player = makePlayer({ x: 5, y: 8, hp: 60, maxHp: 100 });
    const trap = { id: 'landing-trap', name: '着地罠', x: 5, y: 8, effect, permanent: true };
    const dg = makeEmptyDg({ traps: [trap] });
    const bag = [];
    setPitfallBag(bag);
    const logs = [];
    const result = throwItemAlongLine({ x: 5, y: 5, hp: 50, name: '投げる敵' }, dg, potion, 0, 1, 3, logs, player, () => {}, { hitChance: 0.75 });
    expect(result.missedPlayer).toBe(true);
    expect(trap.revealed).toBe(true);
    expect(dg.items).toEqual([]);
    expect(logs.join(' ')).not.toContain('瓶が割れて');
    expect(player.hp).toBeLessThanOrEqual(60);
    if (effect === 'pitfall') expect(bag).toContainEqual({ kind: 'item', entity: potion });
  });

  for (const route of ["throw", "wand"]) {
    it(`${route}: 落とし穴への落下は薬効を出さず、下階で簡素に消滅する`, () => {
      const s = setup("pitfall", route);
      const bag = [];
      setPitfallBag(bag);
      s.run();
      expect(s.path.revealed).toBe(false);
      expect(s.landing.revealed).toBe(true);
      expect(s.player.hp).toBe(60);
      expect(s.dg.items).toEqual([]);
      expect(bag).toEqual([{ kind: "item", entity: s.potion }]);
      const below = makeEmptyDg();
      placeFallenEntities(below, bag, { player: s.player, random: () => 0 });
      expect(below.items).toEqual([]);
      expect(s.player.hp).toBe(60);
      expect(s.logs.join(" ")).not.toContain("瓶が割れて");
    });

    it(`${route}: 地雷で消費された薬は回復効果を出さない`, () => {
      const s = setup("explode", route);
      s.run();
      expect(s.path.revealed).toBe(false);
      expect(s.player.hp).toBe(30);
      expect(s.dg.items).toEqual([]);
      expect(s.logs.filter(m => m.includes("が発動！"))).toHaveLength(1);
      expect(s.logs.join(" ")).not.toContain("瓶が割れて");
    });

    it.each(["rust", "time_bomb", "watergun_trap"])(`${route}: %sは先に起動し、消費されない薬の効果は継続する`, effect => {
      const s = setup(effect, route);
      s.run();
      expect(s.player.hp).toBe(90);
      expect(s.dg.items).toEqual([]);
      expect(s.logs.filter(m => m.includes("が発動！"))).toHaveLength(1);
      expect(s.logs.join(" ")).toContain("瓶が割れて");
      if (effect === "time_bomb") {
        // 起動した後、既存の薬液処理で消火される。
        expect(s.dg.pendingBombs).toEqual([]);
        expect(s.logs.join(" ")).toContain("薬液で消火された");
      }
    });
  }
});

describe("ワッカの指輪で投げた薬瓶・壺がかわされた時の着地", () => {
  it.each([
    ["potion", null], ["pot", null],
    ["potion", "rust"], ["pot", "rust"],
    ["potion", "pitfall"], ["pot", "pitfall"],
  ])("%s: 着地点の罠が %s の場合", (type, effect) => {
    const content = { id: "scroll", name: "地図の巻物", type: "scroll" };
    const item = type === "potion"
      ? { id: "potion", name: "回復薬", type, effect: "heal", value: 30 }
      : { id: "pot", name: "保存の壺", type, potEffect: "none", contents: [content] };
    const trap = effect && { id: "landing", name: "着地罠", x: 8, y: 5, effect, permanent: true };
    const monster = { id: "target", name: "ゴブリン", x: 8, y: 5, hp: 60, maxHp: 100 };
    const dungeon = makeEmptyDg({ monsters: [monster], traps: trap ? [trap] : [],
      pentacles: [{ kind: "dodge", name: "みかわしの魔方陣", x: 8, y: 7 }], rooms: [{ x: 1, y: 1, w: 13, h: 10 }] });
    const player = makePlayer({ x: 5, y: 5, rings: [{ effect: "wakka_ring" }], inventory: [item] });
    const messages = [];
    const bag = [];
    const noop = () => {};
    setPitfallBag(bag);
    useItemActions({
      sr: { current: { player, dungeon, ident: new Set() } },
      throwMode: { mode: "throw", idx: 0 },
      endTurn: (_state, _p, logs) => { messages.push(...logs); },
      dnameRef: it => it.name, lu: noop, setGs: noop, setMsgs: noop, setThrowMode: noop,
      pushAnim: noop, withPitfallBag: fn => fn(),
    }).execDirection(1, 0);

    expect(messages.find(message => message.includes("当たらなかった"))).toBeTruthy();
    expect(dungeon.items).not.toContain(item);
    const breakIndex = messages.findIndex(message => /瓶が割れ|壺が割れ/.test(message));
    if (effect === "pitfall") {
      expect(bag).toContainEqual({ kind: "item", entity: item });
      expect(dungeon.items).toEqual([]);
      expect(breakIndex).toBe(-1);
    } else {
      const activationIndex = messages.findIndex(message => message.includes("着地罠が発動"));
      if (effect) expect(activationIndex).toBeGreaterThanOrEqual(0);
      expect(breakIndex).toBeGreaterThan(activationIndex);
      if (type === "potion") expect(monster.hp).toBe(90);
      else expect(dungeon.items).toContain(content);
    }
  });
});

function throwAtTrap(route, kind, effect, ending) {
  const landingY = ending === "wall" ? 6 : 15;
  const content = { id: "scroll", name: "地図の巻物", type: "scroll" };
  const item = kind === "potion"
    ? { id: "potion", name: "回復薬", type: "potion", effect: "heal", value: 30 }
    : { id: "pot", name: kind === "gunpowder" ? "火薬壺" : "保存の壺", type: "pot",
      potEffect: kind === "gunpowder" ? "gunpowder" : "preserve", capacity: 3,
      contents: kind === "gunpowder" ? [] : [content] };
  const trap = { id: "landing", name: effect === "pitfall" ? "落とし穴" : "地雷", effect,
    x: 5, y: landingY, permanent: true };
  const player = makePlayer({ x: route === "hand" ? 5 : 6, y: 5, depth: 1,
    inventory: route === "hand" ? [item] : [] });
  const target = { id: "target", name: "ゴブリン", x: 6, y: landingY, hp: 60, maxHp: 100 };
  const dungeon = makeEmptyDg({ monsters: [target], traps: [trap] });
  if (ending !== "open") dungeon.map[landingY + 1][5] = T.WALL;
  let messages = [];
  const bag = [];
  const noop = () => {};
  const withPitfallBag = fn => {
    setPitfallBag(bag);
    try { fn(); } finally { clearPitfallBag(); }
  };
  if (route === "hand") {
    useItemActions({
      sr: { current: { player, dungeon, ident: new Set() } },
      throwMode: { mode: "throw", idx: 0 },
      endTurn: (_state, _p, logs) => { messages = logs; },
      dnameRef: item => item.name, lu: noop, setGs: noop, setMsgs: noop, setThrowMode: noop,
      pushAnim: noop, withPitfallBag,
    }).execDirection(0, 1);
  } else if (route === "enemy") {
    const shooter = { x: 5, y: 5, name: "投げる敵", hp: 100 };
    withPitfallBag(() => throwItemAlongLine(shooter, dungeon, item, 0, 1, 10, messages, player, noop));
  } else {
    Object.assign(item, { x: 5, y: 5 });
    dungeon.items.push(item);
    withPitfallBag(() => applyWandEffect("knockback", "item", item, 0, 1, dungeon, player, messages, noop));
  }
  return { item, content, player, target, bag, messages };
}

describe.each(["hand", "enemy", "wand"])("%sで飛ばした薬瓶・壺の着地順", route => {
  it.each([
    ["potion", "open"], ["preserve", "open"],
    ["potion", "wallBeyondRange"], ["preserve", "wallBeyondRange"],
  ])("射程端で落ちた%sはその先の地形が%sでも丸ごと落とし穴に入る", (kind, ending) => {
    const { target, item, content, bag, messages } = throwAtTrap(route, kind, "pitfall", ending);
    expect(target.hp).toBe(60);
    expect(bag).toEqual([{ kind: "item", entity: item }]);
    if (kind === "preserve") expect(item.contents).toEqual([content]);
    expect(messages.some(message => /瓶が割れ|壺が割れ/.test(message))).toBe(false);
  });

  it("壁に当たった回復薬は壁の手前で割れ、落とし穴を起動せず飛沫が出る", () => {
    const { target, bag, messages } = throwAtTrap(route, "potion", "pitfall", "wall");
    expect(target.hp).toBe(90);
    expect(bag).toEqual([]);
    expect(messages.some(message => message.includes("落とし穴が発動！"))).toBe(false);
  });

  it("壁に当たった保存の壺は先に割れ、中身が落とし穴に入る", () => {
    const { content, bag } = throwAtTrap(route, "preserve", "pitfall", "wall");
    expect(bag).toEqual([{ kind: "item", entity: content }]);
  });

  it("射程端で地雷に着地した火薬壺は地雷だけが爆発する", () => {
    const { messages } = throwAtTrap(route, "gunpowder", "explode", "open");
    expect(messages.some(message => message.includes("地雷が発動！火薬壺は爆発で消し飛んだ"))).toBe(true);
    expect(messages.some(message => message.includes("火薬壺が爆発した"))).toBe(false);
  });

  it("壁に当たった火薬壺は先に爆発し、地雷を誘爆させる", () => {
    const { player, messages } = throwAtTrap(route, "gunpowder", "explode", "wall");
    expect(player.hp).toBe(13);
    const powderBlast = messages.findIndex(message => message.includes("火薬壺が爆発した"));
    const mineBlast = messages.findIndex(message => message.includes("地雷が誘爆した"));
    expect(powderBlast).toBeGreaterThanOrEqual(0);
    expect(mineBlast).toBeGreaterThan(powderBlast);
  });
});

it("反射された薬瓶も壁に当たった時は手前の落とし穴より先に割れる", () => {
  const potion = { id: "potion", name: "回復薬", type: "potion", effect: "heal", value: 30, x: 5, y: 5 };
  const reflector = { id: "reflector", name: "ミラーゴーレム", subtype: "reflector", x: 5, y: 7, hp: 100, maxHp: 100 };
  const trap = { id: "pitfall", name: "落とし穴", effect: "pitfall", x: 5, y: 5, permanent: true };
  const dungeon = makeEmptyDg({ monsters: [reflector], traps: [trap], items: [potion] });
  dungeon.map[4][5] = T.WALL;
  const player = makePlayer({ x: 6, y: 5, hp: 60 });
  const messages = [];
  const bag = [];
  setPitfallBag(bag);
  vi.spyOn(Math, "random").mockReturnValue(0.5);

  applyWandEffect("knockback", "item", potion, 0, 1, dungeon, player, messages, () => {});

  expect(player.hp).toBe(90);
  expect(bag).toEqual([]);
  expect(messages.some(message => message.includes("弾き返された"))).toBe(true);
  expect(messages.some(message => message.includes("落とし穴が発動！"))).toBe(false);
});
