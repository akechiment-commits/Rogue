import { afterEach, describe, expect, it, vi } from "vitest";
import { ABSOLUTE_VIRTUE_BOSS, monsterAI } from "../monsters.js";
import { genDungeon } from "../dungeon.js";
import {
  castAbsoluteVirtueAeroga, castAbsoluteVirtueGoddessBlessing,
  castAbsoluteVirtuePull, getAbsoluteVirtueLine,
} from "../absoluteVirtue.js";
import { castMeteor } from "../meteor.js";
import { monEffectiveAttack } from "../monTraits.js";
import { monsterDistance } from "../monsterGeometry.js";
import { TILE_NAMES, TILE_RENDER } from "../render.js";
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from "../tilesetMap.js";
import { checkMonsterEvasion, MH, MW } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import fs from "node:fs";

afterEach(() => vi.restoreAllMocks());

function makeAbsoluteVirtue(overrides = {}) {
  return {
    ...ABSOLUTE_VIRTUE_BOSS,
    id: "absolute-virtue",
    x: 15,
    y: 15,
    hp: ABSOLUTE_VIRTUE_BOSS.hp,
    maxHp: ABSOLUTE_VIRTUE_BOSS.hp,
    aware: true,
    dormant: false,
    turnAttacks: 0,
    dir: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeBossRoom(overrides = {}) {
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  const room = { x: 1, y: 1, w: 50, h: 24 };
  const boss = makeAbsoluteVirtue();
  const player = makePlayer({ x: 20, y: 15, ...overrides.player });
  const dungeon = makeEmptyDg({
    monsters: [boss, ...(overrides.monsters || [])],
    rooms: [room],
    visible,
    explored: visible.map(row => [...row]),
    ...overrides.dungeon,
  });
  return { boss, player, dungeon, messages: [] };
}

describe("超上級B50F Absolute Virtue", () => {
  it("B50Fの超上級ボスを差し替え、通常のB50Fボスは維持する", () => {
    const legend = genDungeon(49, "legend");
    const boss = legend.monsters.find(monster => monster.baseKind === "boss_absolute_virtue");
    expect(boss).toBeDefined();
    expect(boss).toMatchObject({ bodySize: 3, speed: 2, maxAttacks: 1, bossTier: 10, tile: 266 });
    expect(boss.maxHp).toBe(ABSOLUTE_VIRTUE_BOSS.hp);

    const advanced = genDungeon(49, "advanced");
    expect(advanced.monsters.find(monster => monster.isBoss)?.baseKind).toBe("boss_abyssgod");
  });

  it("tile 266を3スタイルで表示する", () => {
    expect(TILE_NAMES[266]).toBe("absolute_virtue");
    expect(TILE_RENDER[266]).toEqual({ bg: null, fg: "#ffe8a6", ch: "A" });
    expect(MONSTER_SHEET_MAP[266]).toEqual([9, 2]);
    expect(DAWNLIKE_FALLBACKS[266]).toBe(40);
    expect(fs.existsSync("tiles/sprites/mon1/tile_266.png")).toBe(true);
  });

  it("必中でない攻撃を絶対回避し、必中攻撃と回避不能状態では発動しない", () => {
    const boss = makeAbsoluteVirtue({ absoluteEvasionTurns: 5 });
    expect(checkMonsterEvasion(boss, { random: () => 0.99 })).toBe(true);
    expect(checkMonsterEvasion(boss, { sureHit: true, random: () => 0.01 })).toBe(false);
    boss.sleepTurns = 2;
    expect(checkMonsterEvasion(boss, { random: () => 0.01 })).toBe(false);
  });

  it("視界内5%の絶対回避・マイティストライクを10ターン付与する", () => {
    const first = makeBossRoom();
    vi.spyOn(Math, "random").mockReturnValue(0.02);
    monsterAI(first.boss, first.dungeon, first.player, first.messages, { attackOnly: true });
    expect(first.boss.absoluteEvasionTurns).toBe(10);

    vi.restoreAllMocks();
    const second = makeBossRoom();
    vi.spyOn(Math, "random").mockReturnValue(0.07);
    monsterAI(second.boss, second.dungeon, second.player, second.messages, { attackOnly: true });
    expect(second.boss.mightyStrikeTurns).toBe(10);
    expect(monEffectiveAttack(second.boss)).toBe(second.boss.atk * 2);
  });

  it("HP25%未満で2回行動へ移行し、自然回復がHP20", () => {
    const boss = makeAbsoluteVirtue({ hp: 599, maxHp: 2400 });
    const player = makePlayer({ x: 20, y: 15 });
    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const dungeon = makeEmptyDg({
      monsters: [boss], rooms: [{ x: 1, y: 1, w: 50, h: 24 }],
      visible, explored: visible.map(row => [...row]),
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    monsterAI(boss, dungeon, player, [], { moveOnly: true });

    expect(boss._absoluteVirtuePhaseTwo).toBe(true);
    expect(boss.maxAttacks).toBe(2);
    expect(boss.hp).toBe(619);
  });

  it("女神の祝福は同室のプレイヤーと敵をそれぞれ最大250回復する", () => {
    const ally = { name: "味方", x: 22, y: 15, hp: 100, maxHp: 500, bodySize: 1 };
    const { boss, player, dungeon, messages } = makeBossRoom({
      player: { x: 10, y: 10, hp: 100, maxHp: 500 },
      monsters: [ally],
    });
    boss.hp = 1000;

    expect(castAbsoluteVirtueGoddessBlessing(boss, dungeon, player, messages)).toBe(true);
    expect(player.hp).toBe(350);
    expect(ally.hp).toBe(350);
    expect(boss.hp).toBe(1250);
  });

  it("連続魔はメテオ着弾を1ターンへ短縮する", () => {
    const boss = makeAbsoluteVirtue({ chainspellTurns: 5 });
    const player = makePlayer({ x: 20, y: 15 });
    const dungeon = makeEmptyDg({ monsters: [boss], pendingMeteors: [] });

    expect(castMeteor(boss, dungeon, player, [], { turnsLeft: 1 })).toBe(true);
    expect(dungeon.pendingMeteors[0].turnsLeft).toBe(1);
  });

  it("エアロガは連続魔中に2回命中し、対象を吹き飛ばす", () => {
    const boss = makeAbsoluteVirtue({ chainspellTurns: 5 });
    const player = makePlayer({ x: 20, y: 15, hp: 500, maxHp: 500 });
    const dungeon = makeEmptyDg({ monsters: [boss] });
    const line = getAbsoluteVirtueLine(boss, dungeon, player);
    const messages = [];
    expect(line).toBeTruthy();

    castAbsoluteVirtueAeroga(boss, dungeon, player, line, messages);

    expect(player.hp).toBeLessThan(500);
    expect(player.x).toBeGreaterThan(20);
    expect(messages.some(message => message.includes("2/2"))).toBe(true);
  });

  it("引き寄せの魔法はプレイヤーを本体外周へ移す", () => {
    const boss = makeAbsoluteVirtue();
    const player = makePlayer({ x: 21, y: 15 });
    const dungeon = makeEmptyDg({ monsters: [boss] });
    const line = getAbsoluteVirtueLine(boss, dungeon, player);
    const messages = [];
    expect(line).toBeTruthy();

    expect(castAbsoluteVirtuePull(boss, dungeon, player, line, messages)).toBe(true);
    expect(monsterDistance(boss, player)).toBe(1);
  });
});
