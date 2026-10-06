import { afterEach, describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { clearPitfallBag, setPitfallBag, throwItemAlongLine } from "../items.js";
import "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { createGameBigboxHandlers } from "./gameBigboxHarness.js";

afterEach(() => { vi.restoreAllMocks(); clearPitfallBag(); });
const weapon = { id: "held", name: "短剣", type: "weapon", atk: 3 };
const pot = { id: "held", name: "保存の壺", type: "pot", potEffect: "preserve", capacity: 3,
  contents: [{ id: "inside", name: "パン", type: "food" }] };
const potion = { id: "held", name: "毒薬", type: "potion", effect: "poison", value: 3 };
const wand = { id: "held", name: "眠りの杖", type: "wand", effect: "sleep", charges: 0 };

function makeTrap(effect, x = 5, y = 6) {
  return { id: "path-trap", name: `経路の${effect}`, effect, x, y, permanent: true, revealed: false };
}
function setupEnemy(kind, item, effect) {
  const enemy = makeMonsterFromBase(MONS.find(m => m.baseKind === kind), 1, 5, 5, { aware: true });
  enemy.turnAttacks = 0;
  const held = structuredClone(item);
  if (kind === "itemThrower") enemy.carriedItem = held;
  else { enemy._stealthrowerHeldItem = held; enemy.heldItems = [held]; }
  const player = makePlayer({ x: 5, y: 8, atk: 10 });
  const trap = makeTrap(effect);
  const dungeon = makeEmptyDg({ rooms: [], monsters: [enemy], traps: [trap],
    visible: Array.from({ length: 30 }, () => Array(60).fill(true)) });
  return { enemy, held, player, trap, dungeon, messages: [] };
}

describe("空中を飛ぶ道具と床の罠", () => {
  for (const kind of ["itemThrower", "stealthrower"]) {
    for (const item of [weapon, pot, potion, wand]) {
      it.each(["pitfall", "explode", "rust"])(`${kind}の${item.name}は途中の%sを踏まずプレイヤーへ届く`, effect => {
        const s = setupEnemy(kind, item, effect);
        const bag = [];
        setPitfallBag(bag);
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        monsterAI(s.enemy, s.dungeon, s.player, s.messages, { attackOnly: true });

        expect(s.messages.join(" ")).toMatch(/投げ(?:つけ)?てきた/);
        expect(s.trap.revealed).toBe(false);
        expect(s.dungeon.traps).toContain(s.trap);
        expect(s.messages.join(" ")).not.toContain(s.trap.name);
        expect(bag).toEqual([]);
        if (item.type === "wand") expect(s.player.sleepTurns).toBeGreaterThan(0);
        else if (item.type === "potion") expect(s.player.poisonedTurns).toBeGreaterThan(0);
        else expect(s.player.hp).toBeLessThan(100);
      });
    }
  }

  it.each(["pitfall", "explode", "rust"])("弾き飛ばされた装備も途中の%sを通過して後方の敵へ届く", effect => {
    const enemy = makeMonsterFromBase(MONS.find(m => m.baseKind === "itemblaster"), 1, 5, 5, { aware: true });
    enemy.turnAttacks = 0;
    enemy.alwaysUseSpecial = true;
    const target = { id: "target", name: "標的", x: 9, y: 5, hp: 100, maxHp: 100, def: 0 };
    const player = makePlayer({ x: 6, y: 5, atk: 10, inventory: [{ ...weapon }] });
    const trap = makeTrap(effect, 7, 5);
    const dungeon = makeEmptyDg({ rooms: [], monsters: [enemy, target], traps: [trap] });
    const messages = [];
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    monsterAI(enemy, dungeon, player, messages, { attackOnly: true });
    expect(player.inventory).toEqual([]);
    expect(target.hp).toBeLessThan(100);
    expect(trap.revealed).toBe(false);
    expect(messages.join(" ")).not.toContain(trap.name);
  });

  it.each(["pitfall", "explode", "rust"])("プレイヤーの共通投擲も途中の%sを通過する", effect => {
    const player = makePlayer({ x: 5, y: 5, atk: 10 });
    const target = { id: "target", name: "標的", x: 5, y: 8, hp: 100, maxHp: 100, def: 0 };
    const trap = makeTrap(effect);
    const dungeon = makeEmptyDg({ rooms: [], monsters: [target], traps: [trap] });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const result = throwItemAlongLine(player, dungeon, { ...weapon }, 0, 1, 5, [], player, null);
    expect(result.hitMonster).toBe(target);
    expect(target.hp).toBeLessThan(100);
    expect(trap.revealed).toBe(false);
  });

  it.each([weapon, pot, wand])("$name は途中の落とし穴を通過し、着地点の落とし穴で落下する", item => {
    const shooter = { x: 5, y: 5, name: "投げる敵", hp: 30, atk: 10 };
    const player = makePlayer({ x: 12, y: 12, atk: 10 });
    const pathTrap = makeTrap("pitfall");
    const landingTrap = { ...makeTrap("pitfall", 5, 10), id: "landing-trap" };
    const dungeon = makeEmptyDg({ rooms: [], traps: [pathTrap, landingTrap], monsters: [shooter] });
    const held = structuredClone(item);
    const bag = [];
    setPitfallBag(bag);
    const messages = [];
    throwItemAlongLine(shooter, dungeon, held, 0, 1, 5, messages, player, null, { killerMon: shooter });
    expect(pathTrap.revealed).toBe(false);
    expect(landingTrap.revealed).toBe(true);
    expect(bag).toEqual([{ kind: "item", entity: held }]);
    expect(dungeon.items).toEqual([]);
    expect(messages.join(" ")).not.toContain("壺が割れた");
  });

  it("着地した短剣が地雷を起動すると、爆風内のプレイヤーにも影響する", () => {
    const shooter = { x: 5, y: 5, name: "投げる敵", hp: 30, atk: 10 };
    const player = makePlayer({ x: 6, y: 10, atk: 10 });
    const dungeon = makeEmptyDg({ rooms: [], traps: [makeTrap("explode", 5, 10)] });
    const messages = [];
    throwItemAlongLine(shooter, dungeon, { ...weapon }, 0, 1, 5, messages, player, null, { killerMon: shooter });
    expect(player.hp).toBe(50);
    expect(dungeon.items).toEqual([]);
    expect(messages.filter(m => m.includes("が発動！"))).toHaveLength(1);
  });

  it.each(["itemThrower", "stealthrower"])("%sが投げた壺は罠の先の大箱へ収納される", kind => {
    const s = setupEnemy(kind, pot, "pitfall");
    const box = { id: "box", name: "大箱", kind: "normal", x: 5, y: 7, capacity: 3, contents: [] };
    s.dungeon.bigboxes = [box];
    const state = { player: s.player, dungeon: s.dungeon, ident: new Set(), identifiedBigboxes: new Set() };
    const handlers = createGameBigboxHandlers(state);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    monsterAI(s.enemy, s.dungeon, s.player, s.messages, { attackOnly: true, bbFn: handlers.bigboxAddItem });
    expect(box.contents).toEqual([s.held]);
    expect(box.contents[0].contents[0].id).toBe("inside");
    expect(s.trap.revealed).toBe(false);
    expect(s.player.hp).toBe(100);
  });

  it("壁の手前へ落ちる壺は、その着地点の落とし穴で落ちる", () => {
    const shooter = { x: 5, y: 5, name: "投げる敵", hp: 30, atk: 10 };
    const player = makePlayer({ x: 12, y: 12, atk: 10 });
    const trap = makeTrap("pitfall", 5, 10);
    const dungeon = makeEmptyDg({ rooms: [], traps: [trap] });
    dungeon.map[11][5] = "#";
    const held = structuredClone(pot);
    const bag = [];
    setPitfallBag(bag);
    throwItemAlongLine(shooter, dungeon, held, 0, 1, 10, [], player, null);
    expect(bag).toEqual([{ kind: "item", entity: held }]);
    expect(dungeon.items).toEqual([]);
  });

  it.each([weapon, pot, wand])("時間停止中に着地する$nameは罠を起動・発見しない", item => {
    const shooter = { x: 5, y: 5, name: "投げる敵", hp: 30, atk: 10 };
    const player = makePlayer({ x: 12, y: 12, atk: 10 });
    const trap = makeTrap("explode", 5, 10);
    const dungeon = makeEmptyDg({ rooms: [], timeStopTurns: 3, traps: [trap] });
    const messages = [];
    throwItemAlongLine(shooter, dungeon, structuredClone(item), 0, 1, 5, messages, player, null);
    expect(trap.revealed).toBe(false);
    expect(messages.join(" ")).not.toContain("が発動！");
    expect(dungeon.traps).toContain(trap);
  });

  it("着地時の錆罠は1回だけ発動する", () => {
    const shooter = { x: 5, y: 5, name: "投げる敵", hp: 30, atk: 10 };
    const player = makePlayer({ x: 12, y: 12, atk: 10 });
    const dungeon = makeEmptyDg({ rooms: [], traps: [makeTrap("rust", 5, 10)] });
    const messages = [];
    throwItemAlongLine(shooter, dungeon, { ...weapon, plus: 2 }, 0, 1, 5, messages, player, null);
    expect(dungeon.items).toHaveLength(1);
    expect(dungeon.items[0].plus).toBe(1);
    expect(messages.filter(m => m.includes("が発動！"))).toHaveLength(1);
  });
});
