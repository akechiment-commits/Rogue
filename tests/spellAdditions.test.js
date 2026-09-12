import { describe, expect, it } from "vitest";
import {
  SPELLS,
  SPELLBOOKS,
  applySpellEffect,
  castSpellBolt,
  hasPlayerMagicReflect,
} from "../items.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { advanceConsumableBuffTimers } from "../turnUpkeep.js";
import { monsterFireLightning } from "../wands.js";
import "../monsters.js";

const noop = () => {};

describe("追加魔法", () => {
  it("5種の魔法と対応する魔法書を登録する", () => {
    const ids = ["power_magic", "guard_magic", "reflect_magic", "dig_magic", "self_destruct_magic"];
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
    expect(near.hp).toBeLessThan(100);
    if (farX > 5 + radius) expect(far.hp).toBe(100);
  });
});
