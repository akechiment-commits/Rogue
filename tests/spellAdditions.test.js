import { describe, expect, it } from "vitest";
import {
  SPELLS,
  SPELLBOOKS,
  applySpellEffect,
  castSpellBolt,
  hasPlayerMagicReflect,
  makePlayerClone,
} from "../items.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { advanceConsumableBuffTimers } from "../turnUpkeep.js";
import { advanceMonsterUpkeep } from "../monsterUpkeep.js";
import { monsterAI } from "../monsters.js";
import { monsterFireLightning } from "../wands.js";

const noop = () => {};

describe("追加魔法", () => {
  it("6種の魔法と対応する魔法書を登録する", () => {
    const ids = ["power_magic", "guard_magic", "reflect_magic", "dig_magic", "self_destruct_magic", "clone_magic"];
    expect(ids.every((id) => SPELLS.some((spell) => spell.id === id))).toBe(true);
    expect(ids.every((id) => SPELLBOOKS.some((book) => book.spell === id))).toBe(true);
  });

  it("剛力・守護・反射はレベルに応じて持続時間が伸びる", () => {
    const player = makePlayer({ atk: 5, def: 3 });
    const dungeon = makeEmptyDg();
    const messages = [];

    applySpellEffect("power_magic", "self", null, 0, 0, dungeon, player, messages, noop, 3);
    applySpellEffect("guard_magic", "self", null, 0, 0, dungeon, player, messages, noop, 5);
    applySpellEffect("reflect_magic", "self", null, 0, 0, dungeon, player, messages, noop, 6);

    expect(player).toMatchObject({
      atk: 15,
      def: 13,
      magicPowerAtkTurns: 60,
      magicGuardDefTurns: 70,
      magicReflectTurns: 75,
    });
    expect(hasPlayerMagicReflect(player)).toBe(true);
  });

  it("一時バフの終了時に攻撃力・防御力を元へ戻す", () => {
    const player = makePlayer({
      atk: 15,
      def: 13,
      magicPowerAtkTurns: 1,
      magicPowerAtkBonus: 10,
      magicGuardDefTurns: 1,
      magicGuardDefBonus: 10,
      magicReflectTurns: 1,
    });
    const messages = [];

    advanceConsumableBuffTimers(player, messages);

    expect(player).toMatchObject({
      atk: 5,
      def: 3,
      magicPowerAtkTurns: 0,
      magicGuardDefTurns: 0,
      magicReflectTurns: 0,
    });
    expect(messages).toEqual(expect.arrayContaining([
      "剛力の魔法が切れた！攻撃力が戻った！",
      "守護の魔法が切れた！防御力が戻った！",
      "魔法反射が切れた！",
    ]));
  });

  it("反射の魔法はモンスターの雷撃を発射源へ返す", () => {
    const source = { name: "魔法使い", x: 5, y: 5, hp: 50, maxHp: 50 };
    const dungeon = makeEmptyDg({ monsters: [source] });
    const player = makePlayer({ x: 6, y: 5, magicReflectTurns: 10 });
    const messages = [];

    monsterFireLightning(5, 5, dungeon, player, 1, 0, messages, noop, noop, source.name);

    expect(source.hp).toBeLessThan(50);
    expect(player.hp).toBe(100);
    expect(messages).toContain("魔法反射状態が雷撃を跳ね返した！");
  });

  it("穴掘りの魔法は最初の壁から10マス掘る", () => {
    const dungeon = makeEmptyDg();
    for (let x = 6; x <= 17; x++) dungeon.map[5][x] = T.WALL;
    const player = makePlayer({ x: 5, y: 5 });
    const messages = [];

    const result = castSpellBolt(player, dungeon, { effect: "dig_magic", range: 10 }, 1, 0, messages, noop, 1);

    expect(result.hitType).toBe("wall");
    for (let x = 6; x <= 15; x++) expect(dungeon.map[5][x]).toBe(T.FLOOR);
    expect(dungeon.map[5][16]).toBe(T.WALL);
    expect(messages).toContain("穴掘りの魔法が壁を10マス掘り進んだ！");
  });

  it.each([
    [1, 1, 6, 7],
    [3, 2, 6, 7],
    [5, 3, 6, 7],
  ])("自爆の魔法はLv%dで半径%dを巻き込みHPを1にする", (level, radius, nearX, farX) => {
    const near = { name: "近い敵", x: nearX, y: 5, hp: 100, maxHp: 100 };
    const far = { name: "遠い敵", x: farX, y: 5, hp: 100, maxHp: 100 };
    const dungeon = makeEmptyDg({ monsters: [near, far] });
    const player = makePlayer({ hp: 80, x: 5, y: 5 });

    applySpellEffect("self_destruct_magic", "self", null, 0, 0, dungeon, player, [], noop, level);

    expect(player.hp).toBe(1);
    expect(near.hp).toBe(0);
    expect(dungeon.monsters).not.toContain(near);
    if (farX > 5 + radius) expect(far.hp).toBe(100);
  });

  it("分身の魔法は隣接する空き床に1体だけ出し、再使用で時間を延長する", () => {
    const dungeon = makeEmptyDg();
    const player = makePlayer({ hp: 80, maxHp: 80, atk: 11, def: 7 });

    applySpellEffect("clone_magic", "self", null, 0, 0, dungeon, player, [], noop, 1);
    const clone = dungeon.monsters.find((monster) => monster.isPlayerClone);

    expect(clone).toMatchObject({
      name: "分身",
      hp: 40,
      maxHp: 40,
      atk: 7,
      def: 4,
      cloneTurns: 30,
      isPlayerClone: true,
    });
    expect(Math.max(Math.abs(clone.x - player.x), Math.abs(clone.y - player.y))).toBe(1);

    applySpellEffect("clone_magic", "self", null, 0, 0, dungeon, player, [], noop, 3);
    expect(dungeon.monsters.filter((monster) => monster.isPlayerClone)).toHaveLength(1);
    expect(clone.cloneTurns).toBe(70);
  });

  it("分身は敵を攻撃し、撃破してもプレイヤーに経験値を与えない", () => {
    const target = { name: "敵", hp: 100, maxHp: 100, atk: 5, def: 0, exp: 50, x: 7, y: 5 };
    const player = makePlayer({ x: 5, y: 5, exp: 0 });
    const clone = makePlayerClone(player, 6, 5, 30);
    const dungeon = makeEmptyDg({ monsters: [clone, target] });
    const messages = [];

    monsterAI(clone, dungeon, player, messages);

    expect(target.hp).toBeLessThan(100);
    expect(player.exp).toBe(0);
  });

  it("敵はプレイヤーより近い分身を優先して攻撃する", () => {
    const player = makePlayer({ x: 10, y: 5 });
    const clone = makePlayerClone(player, 7, 5, 30);
    const enemy = { name: "敵", hp: 100, maxHp: 100, atk: 20, def: 0, exp: 10, speed: 1, baseKind: "rat", x: 5, y: 5, turnAttacks: 0 };
    const dungeon = makeEmptyDg({
      monsters: [enemy, clone],
      rooms: [{ x: 1, y: 1, w: 58, h: 28 }],
    });
    const messages = [];

    monsterAI(enemy, dungeon, player, messages, { moveOnly: true });
    expect(enemy.x).toBe(6);
    expect(enemy.y).toBe(5);
    monsterAI(enemy, dungeon, player, messages, { attackOnly: true });

    expect(clone.hp).toBeLessThan(clone.maxHp);
    expect(player.hp).toBe(player.maxHp);
  });

  it("分身は時間切れで消滅し、通常の敵として復活しない", () => {
    const player = makePlayer();
    const clone = makePlayerClone(player, 6, 5, 1);
    const dungeon = makeEmptyDg({ monsters: [clone] });
    const messages = [];

    advanceMonsterUpkeep(dungeon, player, messages, {
      hasCursedExplosionPentacle: () => false,
      inMagicSealRoom: () => false,
      inCursedMagicSealRoom: () => false,
      onMonsterDefeated: () => {},
    });

    expect(dungeon.monsters).not.toContain(clone);
    expect(messages).toContain("分身の時間切れで消えた！");
  });
});
