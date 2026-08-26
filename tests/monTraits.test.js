import { describe, it, expect } from "vitest";
import {
  monEffectiveFloat, monEffectiveMagicImmune, monReflectsProjectiles,
  monReflectsMagic, monEffectiveMaxAttacks, monEffectiveWallWalker,
  monEffectiveFixedDamageOnly, monEffectiveSpeed, monCanUseExplosiveAbility,
} from "../monTraits.js";
import { clampDmgFixed, consumeBarrier, T } from "../utils.js";
import { applyMonsterSeal, canMonsterSurviveOnWater, resolveSealedFloatOnWater } from "../items.js";
import { BOSSES, INTERMEDIATE_BOSSES } from "../monsters.js";
import { MONSTER_SHEET_MAP } from "../tilesetMap.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("中級までのボス用スタイル3画像", () => {
  it("8体すべてが衝突しない専用タイルIDと読み込みマップを持つ", () => {
    const bosses = [...BOSSES.slice(0, 4), ...INTERMEDIATE_BOSSES];
    const tileIds = bosses.map((boss) => boss.tile);

    expect(tileIds).toEqual([137, 138, 139, 140, 141, 142, 143, 144]);
    expect(new Set(tileIds).size).toBe(bosses.length);
    expect(tileIds.every((tileId) => MONSTER_SHEET_MAP[tileId])).toBe(true);
  });
});

describe("封印中の敵特性無効化", () => {
  it("爆発・誘爆系特技は封印で無効", () => {
    expect(monCanUseExplosiveAbility({ sealed: false })).toBe(true);
    expect(monCanUseExplosiveAbility({ sealed: true })).toBe(false);
  });

  it("浮遊：固有floatは封印で落ち、floatTurnsは残る", () => {
    expect(monEffectiveFloat({ float: true })).toBe(true);
    expect(monEffectiveFloat({ float: true, sealed: true })).toBe(false);
    expect(monEffectiveFloat({ float: true, sealed: true, floatTurns: 5 })).toBe(true);
  });

  it("魔法無効・壁抜け・固定ダメは封印で無効", () => {
    expect(monEffectiveMagicImmune({ magicImmune: true })).toBe(true);
    expect(monEffectiveMagicImmune({ magicImmune: true, sealed: true })).toBe(false);
    expect(monEffectiveWallWalker({ wallWalker: true, sealed: true })).toBe(false);
    expect(monEffectiveFixedDamageOnly({ fixedDamageOnly: true, sealed: true })).toBe(false);
  });

  it("反射系は封印で無効", () => {
    expect(monReflectsProjectiles({ subtype: "reflector" })).toBe(true);
    expect(monReflectsProjectiles({ subtype: "reflector", sealed: true })).toBe(false);
    expect(monReflectsMagic({ subtype: "magicreflect", sealed: true })).toBe(false);
  });

  it("フクマルはLv2で投擲物、Lv3で魔法も反射する", () => {
    expect(monReflectsProjectiles({ baseKind: "runner", monLevel: 1 })).toBe(false);
    expect(monReflectsProjectiles({ baseKind: "runner", monLevel: 2 })).toBe(true);
    expect(monReflectsMagic({ baseKind: "runner", monLevel: 2 })).toBe(false);
    expect(monReflectsMagic({ baseKind: "runner", monLevel: 3 })).toBe(true);
    expect(monReflectsMagic({ baseKind: "runner", monLevel: 3, sealed: true })).toBe(false);
  });

  it("速度と攻撃回数は封印で1", () => {
    expect(monEffectiveSpeed({ speed: 2, sealed: true })).toBe(1);
    expect(monEffectiveMaxAttacks({ maxAttacks: 3, sealed: true })).toBe(1);
    expect(monEffectiveMaxAttacks({ maxAttacks: 3 })).toBe(3);
  });

  it("clampDmgFixed / consumeBarrier も封印で無効", () => {
    expect(clampDmgFixed({ fixedDamageOnly: true }, 10, true)).toBe(1);
    expect(clampDmgFixed({ fixedDamageOnly: true, sealed: true }, 10, true)).toBe(10);
    const m = { name: "蟹", barrier: 2, sealed: true };
    expect(consumeBarrier(m, [])).toBe(false);
    expect(m.barrier).toBe(2);
  });

  it("水上の浮遊敵を封印すると陸へ弾き出す", () => {
    const map = Array.from({ length: 10 }, () => Array(10).fill(T.FLOOR));
    map[5][5] = T.WATER;
    const bat = { name: "バット", id: "b1", x: 5, y: 5, hp: 10, maxHp: 10, float: true, exp: 1, atk: 1, def: 0 };
    const p = makePlayer({ x: 1, y: 1 });
    const dg = makeEmptyDg({ map, monsters: [bat], items: [], traps: [] });
    const ml = [];
    const r = applyMonsterSeal(bat, dg, p, ml, null);
    expect(r).toBe("ejected");
    expect(bat.sealed).toBe(true);
    expect(dg.map[bat.y][bat.x]).not.toBe(T.WATER);
    expect(ml.some((m) => m.includes("弾き出された"))).toBe(true);
  });

  it("水上の浮遊敵は逃げ場がなければ封印で即死", () => {
    const map = Array.from({ length: 5 }, () => Array(5).fill(T.WATER));
    const bat = { name: "バット", id: "b2", x: 2, y: 2, hp: 10, maxHp: 10, float: true, exp: 1, atk: 1, def: 0 };
    const p = makePlayer({ x: 0, y: 0 });
    const dg = makeEmptyDg({ map, monsters: [bat], items: [], traps: [] });
    const ml = [];
    /* killMonster が map 操作するため最低限のフィールド */
    dg.rooms = [];
    dg.explored = Array.from({ length: 5 }, () => Array(5).fill(false));
    const r = resolveSealedFloatOnWater(
      Object.assign(bat, { sealed: true }),
      dg, p, ml,
      (m) => { dg.monsters = dg.monsters.filter((x) => x !== m); },
    );
    expect(r).toBe("killed");
    expect(ml.some((m) => m.includes("即死"))).toBe(true);
  });

  it("水生敵は封印しても水上で弾き出されない", () => {
    const map = Array.from({ length: 8 }, () => Array(8).fill(T.FLOOR));
    map[4][4] = T.WATER;
    const w = { name: "わてり", id: "w1", x: 4, y: 4, hp: 20, maxHp: 20, waterOnly: true, float: false };
    const p = makePlayer({ x: 1, y: 1 });
    const dg = makeEmptyDg({ map, monsters: [w], items: [] });
    const ml = [];
    const r = applyMonsterSeal(w, dg, p, ml, null);
    expect(r).toBe("ok");
    expect(w.x).toBe(4);
    expect(w.y).toBe(4);
  });

  it("ワッカ系の水中歩行は封印や重力で無効にならない", () => {
    const map = Array.from({ length: 8 }, () => Array(8).fill(T.FLOOR));
    map[4][4] = T.WATER;
    const w = { name: "ワッカ", id: "wokka-water", x: 4, y: 4, hp: 20, maxHp: 20, waterWalker: true, sealed: true };
    const p = makePlayer({ x: 1, y: 1 });
    const dg = makeEmptyDg({ map, monsters: [w], items: [] });
    const ml = [];

    expect(canMonsterSurviveOnWater(w, dg, 4, 4)).toBe(true);
    expect(resolveSealedFloatOnWater(w, dg, p, ml, null)).toBe("ok");
    expect({ x: w.x, y: w.y }).toEqual({ x: 4, y: 4 });
  });
});
