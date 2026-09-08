import { describe, it, expect } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import {
  TRAPS, SPELLS, SPELLBOOKS, fireTrapItem, applyPlayerLevelDown,
} from "../items.js";
import { MONS, makeMonsterFromBase } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const levelDownTrap = TRAPS.find((trap) => trap.effect === "level_down_trap");

describe("レベルダウンの罠", () => {
  it("プレイヤーのレベルと、対応するレベルアップ分の能力値を1段階戻す", () => {
    const p = makePlayer({
      level: 3, hp: 44, maxHp: 45, atk: 7, def: 1, mp: 21, maxMp: 22,
      exp: 4, nextExp: 22,
    });
    const dg = makeEmptyDg();
    const ml = [];

    fireTrapPlayer({ ...levelDownTrap, x: p.x, y: p.y, id: "ld-player" }, p, dg, ml);

    expect(p.level).toBe(2);
    expect(p.maxHp).toBe(40);
    expect(p.hp).toBe(40);
    expect(p.atk).toBe(6);
    expect(p.def).toBe(0);
    expect(p.maxMp).toBe(21);
    expect(p.mp).toBe(21);
    expect(p.nextExp).toBe(14);
    expect(p.exp).toBe(4);
    expect(ml.some((message) => message.includes("レベルが1下がった"))).toBe(true);
  });

  it("レベル1のプレイヤーには何も起こらない", () => {
    const p = makePlayer({ level: 1, maxHp: 30, hp: 30, atk: 5, exp: 9, nextExp: 10 });
    const before = { ...p };
    const ml = [];

    expect(applyPlayerLevelDown(p, ml)).toBe(false);
    expect(p.level).toBe(before.level);
    expect(p.maxHp).toBe(before.maxHp);
    expect(p.atk).toBe(before.atk);
    expect(p.exp).toBe(before.exp);
    expect(ml.some((message) => message.includes("レベル1なので"))).toBe(true);
  });

  it("敵が踏むと前の形態へ戻り、レベル1の敵は変化しない", () => {
    const mon = makeMonsterFromBase(MONS[0], 2, 5, 5);
    const p = makePlayer({ x: 1, y: 1 });
    const dg = makeEmptyDg({ monsters: [mon] });
    const ml = [];

    fireTrapItem(levelDownTrap, { name: "石", type: "misc" }, dg, 5, 5, ml, new Set(), p);
    expect(mon.monLevel).toBe(1);
    expect(mon.name).toBe(MONS[0].name);
    expect(ml.some((message) => message.includes("レベルダウンして"))).toBe(true);

    const levelOne = makeMonsterFromBase(MONS[0], 1, 6, 5);
    dg.monsters = [levelOne];
    const ml2 = [];
    fireTrapItem(levelDownTrap, { name: "石", type: "misc" }, dg, 6, 5, ml2, new Set(), p);
    expect(levelOne.monLevel).toBe(1);
    expect(ml2.some((message) => message.includes("最弱形態"))).toBe(true);
  });
});

describe("識別・呪いの魔法の消費MP", () => {
  it("魔法本体と魔法書の説明が同じ消費量を示す", () => {
    expect(SPELLS.find((spell) => spell.id === "identify_magic")).toMatchObject({ mpCost: 12, desc: expect.stringContaining("MP:12") });
    expect(SPELLS.find((spell) => spell.id === "curse_magic")).toMatchObject({ mpCost: 15, desc: expect.stringContaining("MP:15") });
    expect(SPELLBOOKS.find((book) => book.spell === "identify_magic").desc).toContain("MP:12");
    expect(SPELLBOOKS.find((book) => book.spell === "curse_magic").desc).toContain("MP:15");
  });
});
