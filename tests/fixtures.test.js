import { describe, it, expect, vi } from "vitest";
import {
  makeFakeStairTrap, materializeFakeStair, trapDisplayAsStair, scatterFloorGimmicks,
  makeVent, makeStatue, makeFixedPortalPair, findFixedPortalPair,
  breakStatue, applyWindDir, getWindAt, wandEffectBreaksStatue, wandEffectStatueLootOnly,
  throwItemBreaksStatue, hitStatueWithAction, displaceObjectsFromStatue, statueAt,
} from "../fixtures.js";
import { doExplosion, getFixtureItemDeps, placeItemAt } from "../items.js";
import { monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

describe("偽階段", () => {
  it("未看破時は階段に見える", () => {
    const t = makeFakeStairTrap(3, 4, "down");
    expect(trapDisplayAsStair(t)).toBe("stair_down");
    expect(t.effect).toBe("fake_stair");
    t.revealed = true;
    expect(trapDisplayAsStair(t)).toBeNull();
  });

  it("materialize で通常罠に変わる", () => {
    const t = makeFakeStairTrap(1, 1, "down");
    materializeFakeStair(t, getFixtureItemDeps());
    expect(t.effect).not.toBe("fake_stair");
    expect(t.revealed).toBe(true);
    expect(t.disguise).toBeUndefined();
  });

  it("ギミック配置は既存アイテムのマスを避ける", () => {
    /* 狭い部屋の全床にアイテムを置いた状態では偽階段等が乗らない */
    const map = Array.from({ length: 10 }, () => Array(10).fill(T.WALL));
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) map[y][x] = T.FLOOR;
    const rooms = [{ x: 2, y: 2, w: 3, h: 3 }];
    const items = [];
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) {
      items.push({ name: "石", type: "arrow", x, y });
    }
    let sawOverlap = false;
    for (let i = 0; i < 40; i++) {
      const g = scatterFloorGimmicks(map, rooms, 3, { items });
      for (const t of g.traps || []) {
        if (items.some((it) => it.x === t.x && it.y === t.y)) sawOverlap = true;
      }
      for (const v of g.vents || []) {
        if (items.some((it) => it.x === v.x && it.y === v.y)) sawOverlap = true;
      }
      for (const s of g.statues || []) {
        if (items.some((it) => it.x === s.x && it.y === s.y)) sawOverlap = true;
      }
    }
    expect(sawOverlap).toBe(false);
  });
});

describe("風穴", () => {
  it("5x5 内で方向を上書き", () => {
    const dg = makeEmptyDg({ vents: [makeVent(5, 5, 1, 0)] });
    expect(getWindAt(dg, 5, 5)).toBeTruthy();
    expect(getWindAt(dg, 7, 7)).toBeTruthy();
    expect(getWindAt(dg, 8, 5)).toBeNull();
    const bent = applyWindDir(dg, 6, 5, 0, 1);
    expect(bent.dx).toBe(1);
    expect(bent.dy).toBe(0);
    expect(bent.bent).toBe(true);
  });

  it("stepProjectile は風域に入ると曲がる", async () => {
    const { stepProjectile } = await import("../utils.js");
    const dg = makeEmptyDg({ vents: [makeVent(5, 5, 1, 0)] });
    /* (5,3) から上へ → 進入先 (5,4) や次で風域に入り東へ */
    let cx = 5, cy = 3, dx = 0, dy = 1;
    let bentOnce = false;
    for (let i = 0; i < 5; i++) {
      const s = stepProjectile(dg, cx, cy, dx, dy, { wind: true });
      if (s.bent) bentOnce = true;
      cx = s.x; cy = s.y; dx = s.dx; dy = s.dy;
    }
    expect(bentOnce).toBe(true);
    /* 風が東向きなら x が増えているはず */
    expect(cx).toBeGreaterThan(5);
  });

  it("stepProjectile wind:false は魔法弾として曲がらない", async () => {
    const { stepProjectile } = await import("../utils.js");
    const dg = makeEmptyDg({ vents: [makeVent(5, 5, 1, 0)] });
    let cx = 5, cy = 3, dx = 0, dy = 1;
    for (let i = 0; i < 5; i++) {
      const s = stepProjectile(dg, cx, cy, dx, dy, { wind: false });
      expect(s.bent).toBe(false);
      expect(s.dx).toBe(0);
      expect(s.dy).toBe(1);
      cx = s.x; cy = s.y; dx = s.dx; dy = s.dy;
    }
    /* 南へ一直線：x は変わらず y が増える */
    expect(cx).toBe(5);
    expect(cy).toBe(8);
  });
});

describe("フリージア", () => {
  it("封印中は近接攻撃の混乱効果を発動しない", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const attacker = {
        id: "freesia",
        name: "好まざる猫「フリージア」",
        baseKind: "boss_blaze",
        isBoss: true,
        sealed: true,
        sealedTurns: 10,
        x: 4, y: 5,
        hp: 150, maxHp: 150, atk: 24, def: 16, exp: 500,
        speed: 1, baseSpeed: 1, turnAccum: 0,
        turnAttacks: 0, maxAttacks: 1, monLevel: 1,
        aware: true, dormant: false,
        dir: { x: 1, y: 0 },
      };
      const dg = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 10, h: 10 }],
        monsters: [attacker],
      });
      const p = makePlayer({ x: 5, y: 5 });
      const ml = [];

      monsterAI(attacker, dg, p, ml, { attackOnly: true });

      expect(p.hp).toBeLessThan(100);
      expect(p.confusedTurns || 0).toBe(0);
      expect(ml.some(msg => msg.includes("混乱した"))).toBe(false);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("封印が解けたターンから行動する", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const attacker = {
        id: "freesia",
        name: "好まざる猫「フリージア」",
        baseKind: "boss_blaze",
        isBoss: true,
        sealed: true,
        sealedTurns: 1,
        x: 4, y: 5,
        hp: 150, maxHp: 150, atk: 24, def: 16, exp: 500,
        speed: 1, baseSpeed: 1, turnAccum: 0,
        turnAttacks: 0, maxAttacks: 1, monLevel: 1,
        aware: true, dormant: false,
        dir: { x: 1, y: 0 },
      };
      const dg = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 10, h: 10 }],
        monsters: [attacker],
      });
      const p = makePlayer({ x: 5, y: 5 });
      const ml = [];

      /* 実ゲームと同じく、移動フェーズ後に解除済みフラグを見て攻撃フェーズへ進む。 */
      monsterAI(attacker, dg, p, ml, { moveOnly: true });
      if (attacker._movedThisTurn) delete attacker._movedThisTurn;
      else monsterAI(attacker, dg, p, ml, { attackOnly: true });

      expect(attacker.sealed).toBe(false);
      expect(p.hp).toBeLessThan(100);
      expect(ml).toContain("好まざる猫「フリージア」の封印が解けた！");
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("固定転送", () => {
  it("ペア同士だけ繋がる", () => {
    const [a, b] = makeFixedPortalPair(1, 1, 8, 8, 3);
    expect(a.pairId).toBe(b.pairId);
    const dg = makeEmptyDg({ pentacles: [a, b] });
    expect(findFixedPortalPair(dg, a)).toBe(b);
    expect(findFixedPortalPair(dg, b)).toBe(a);
  });
});

describe("石像破壊ルール", () => {
  it("杖：雷・吹飛ばしは壊し、場所替え・テレポ・飛びつきは壊さない。穴掘り・軟化は壊す", () => {
    expect(wandEffectBreaksStatue("lightning")).toBe(true);
    expect(wandEffectBreaksStatue("knockback")).toBe(true);
    expect(wandEffectBreaksStatue("swap")).toBe(false);
    expect(wandEffectBreaksStatue("warp")).toBe(false);
    expect(wandEffectBreaksStatue("leap")).toBe(false);
    expect(wandEffectBreaksStatue("dig")).toBe(true);
    expect(wandEffectBreaksStatue("soften")).toBe(true);
    expect(wandEffectStatueLootOnly("dig")).toBe(true);
    expect(wandEffectStatueLootOnly("soften")).toBe(true);
    expect(wandEffectStatueLootOnly("lightning")).toBe(false);
  });

  it("投擲：武器は壊し、場所替えの杖は壊さない", () => {
    expect(throwItemBreaksStatue({ type: "weapon", atk: 5 })).toBe(true);
    expect(throwItemBreaksStatue({ type: "wand", effect: "lightning" })).toBe(true);
    expect(throwItemBreaksStatue({ type: "wand", effect: "swap" })).toBe(false);
    expect(throwItemBreaksStatue({ type: "wand", effect: "dig" })).toBe(true);
  });

  it("hitStatueWithAction は breaks:false で壊さずメッセージのみ", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [], monsters: [], statues: [], dungeonType: "intermediate",
    });
    const st = makeStatue(3, 3);
    dg.statues.push(st);
    const p = makePlayer({ x: 1, y: 1, depth: 3 });
    const ml = [];
    hitStatueWithAction(dg, 3, 3, p, ml, null, 3, { breaks: false });
    expect(dg.statues.length).toBe(1);
    expect(ml.some(m => m.includes("効果がなかった"))).toBe(true);
  });

  it("hitStatueWithAction は spawnMonster:false で敵なし破壊", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [], monsters: [], statues: [], dungeonType: "intermediate",
    });
    const st = makeStatue(3, 3);
    dg.statues.push(st);
    const p = makePlayer({ x: 1, y: 1, depth: 3 });
    const ml = [];
    hitStatueWithAction(dg, 3, 3, p, ml, null, 3, {
      breaks: true,
      spawnMonster: false,
      itemDeps: getFixtureItemDeps(),
    });
    expect(dg.statues.length).toBe(0);
    expect(dg.monsters.length).toBe(0);
    expect(dg.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe("石像", () => {
  it("壊すとアイテムとフロア敵（レベル+1）が出る", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [],
      monsters: [],
      statues: [],
      dungeonType: "intermediate",
    });
    const st = makeStatue(5, 5);
    dg.statues.push(st);
    const p = makePlayer({ x: 1, y: 1, depth: 5 });
    const ml = [];
    breakStatue(st, dg, p, ml, null, 4, { itemDeps: getFixtureItemDeps() });
    expect(dg.statues.length).toBe(0);
    expect(dg.monsters.length).toBeGreaterThanOrEqual(1);
    const mon = dg.monsters[0];
    expect(mon.monLevel).toBeGreaterThanOrEqual(2); /* 通常1なら+1で2以上 */
    expect(ml.some(m => m.includes("砕け"))).toBe(true);
    expect(ml.some(m => m.includes("が現れた"))).toBe(true);
  });

  it("spawnMonster:false ではアイテムのみ", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [],
      monsters: [],
      statues: [],
      dungeonType: "intermediate",
    });
    const st = makeStatue(5, 5);
    dg.statues.push(st);
    const p = makePlayer({ x: 1, y: 1, depth: 5 });
    const ml = [];
    breakStatue(st, dg, p, ml, null, 4, {
      spawnMonster: false,
      itemDeps: getFixtureItemDeps(),
    });
    expect(dg.statues.length).toBe(0);
    expect(dg.monsters.length).toBe(0);
    expect(dg.items.length).toBeGreaterThanOrEqual(1);
    expect(ml.some(m => m.includes("が現れた"))).toBe(false);
  });

  it("爆発で壊れるとアイテムも敵も出さず粉々になる", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [],
      monsters: [],
      statues: [makeStatue(5, 5)],
      dungeonType: "intermediate",
    });
    const p = makePlayer({ x: 20, y: 20, depth: 5 });
    const ml = [];

    doExplosion(5, 5, dg, p, ml);

    expect(dg.statues).toEqual([]);
    expect(dg.items).toEqual([]);
    expect(dg.monsters).toEqual([]);
    expect(ml).toContain("石像が爆発で粉々になって消えた！");
    expect(ml.some(m => m.includes("飛び出した") || m.includes("が現れた"))).toBe(false);
  });

  it.each([
    ["dragon", "炎"],
    ["icedragon", "氷"],
  ])("敵の%sブレスが石像に当たると中身が出てそこで止まる", (baseKind, element) => {
    const attacker = {
      id: "breath-user",
      name: baseKind === "dragon" ? "ドラゴン" : "氷竜",
      baseKind,
      x: 2, y: 5,
      hp: 100, maxHp: 100, atk: 20, def: 5, exp: 1,
      speed: 1, baseSpeed: 1, turnAccum: 0,
      turnAttacks: 0, maxAttacks: 1,
      monLevel: 1, aware: true, dormant: false, sealed: false,
      alwaysUseSpecial: true,
      dir: { x: 1, y: 0 }, lastPx: 8, lastPy: 5,
    };
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      rooms: [{ x: 1, y: 1, w: 15, h: 10 }],
      items: [],
      monsters: [attacker],
      statues: [makeStatue(5, 5)],
      dungeonType: "intermediate",
    });
    const p = makePlayer({ x: 8, y: 5, depth: 5 });
    const ml = [];

    monsterAI(attacker, dg, p, ml, { attackOnly: true });

    expect(dg.statues).toEqual([]);
    expect(dg.items.length).toBeGreaterThanOrEqual(1);
    expect(dg.monsters.length).toBeGreaterThanOrEqual(2);
    expect(p.hp).toBe(100);
    expect(ml.some(m => m.includes(`${element}ブレスが石像に命中`))).toBe(true);
    expect(ml.some(m => m.includes("飛び出した"))).toBe(true);
    expect(ml.some(m => m.includes("が現れた"))).toBe(true);
  });

  it.each([
    ["potionthrow", "薬瓶"],
    ["watergunner", "水鉄砲"],
  ])("敵の%sが石像に当たると中身が出てそこで止まる", (subtype, attackName) => {
    const attacker = {
      id: "projectile-user",
      name: subtype === "potionthrow" ? "薬師" : "わてり",
      baseKind: subtype === "potionthrow" ? "potionthrower" : "wateri",
      subtype,
      x: 2, y: 5,
      hp: 100, maxHp: 100, atk: 20, def: 5, exp: 1,
      speed: 1, baseSpeed: 1, turnAccum: 0,
      turnAttacks: 0, maxAttacks: 1,
      monLevel: 1, aware: true, dormant: false, sealed: false,
      alwaysUseSpecial: true,
      dir: { x: 1, y: 0 }, lastPx: 7, lastPy: 5,
    };
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      rooms: [{ x: 1, y: 1, w: 15, h: 10 }],
      items: [],
      monsters: [attacker],
      statues: [makeStatue(4, 5)],
      dungeonType: "intermediate",
    });
    const p = makePlayer({ x: 7, y: 5, depth: 5 });
    const ml = [];

    monsterAI(attacker, dg, p, ml, { attackOnly: true });

    expect(dg.statues).toEqual([]);
    expect(dg.items.length).toBeGreaterThanOrEqual(1);
    expect(p.hp).toBe(100);
    expect(ml.some(m => m.includes(`${attackName}が石像に命中`))).toBe(true);
    expect(ml.some(m => m.includes("飛び出した"))).toBe(true);
    expect(ml.some(m => m.includes("が現れた"))).toBe(true);
  });

  it("クラーケンの墨が石像に当たると中身が出てそこで止まる", () => {
    const attacker = {
      id: "kraken",
      name: "クラーケン",
      baseKind: "im_boss_kraken",
      x: 2, y: 5,
      hp: 200, maxHp: 200, atk: 30, def: 10, exp: 1,
      speed: 1, baseSpeed: 1, turnAccum: 0,
      turnAttacks: 0, maxAttacks: 2,
      monLevel: 1, aware: true, dormant: false, sealed: false,
      _krakInkReady: true,
      dir: { x: 1, y: 0 }, lastPx: 7, lastPy: 5,
    };
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      rooms: [{ x: 1, y: 1, w: 15, h: 10 }],
      items: [],
      monsters: [attacker],
      statues: [makeStatue(4, 5)],
      dungeonType: "intermediate",
    });
    const p = makePlayer({ x: 7, y: 5, depth: 5 });
    const ml = [];

    monsterAI(attacker, dg, p, ml, { attackOnly: true });

    expect(dg.statues).toEqual([]);
    expect(dg.items.length).toBeGreaterThanOrEqual(1);
    expect(p.hp).toBe(100);
    expect(ml.some(m => m.includes("墨が石像に命中"))).toBe(true);
    expect(ml.some(m => m.includes("飛び出した"))).toBe(true);
    expect(ml.some(m => m.includes("が現れた"))).toBe(true);
  });

  it("飛び出しメッセージは itemNameFn で未識別名を使える", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [],
      monsters: [],
      statues: [],
      dungeonType: "intermediate",
    });
    const st = makeStatue(5, 5);
    dg.statues.push(st);
    const p = makePlayer({ x: 1, y: 1, depth: 5 });
    const ml = [];
    breakStatue(st, dg, p, ml, null, 4, {
      spawnMonster: false,
      itemNameFn: () => "謎の棒",
      itemDeps: getFixtureItemDeps(),
    });
    expect(ml.some((m) => m.includes("謎の棒が飛び出した"))).toBe(true);
    expect(ml.some((m) => m.includes("が飛び出した") && !m.includes("謎の棒"))).toBe(false);
  });

  it("placeItemAt は石像マスを避けて隣に置く", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [], monsters: [], statues: [], traps: [],
    });
    dg.statues.push(makeStatue(5, 5));
    const ml = [];
    const it = { name: "石", type: "arrow", id: "i1", tile: 23 };
    placeItemAt(dg, 5, 5, it, ml, new Set());
    expect(dg.items.length).toBe(1);
    expect(dg.items[0].x === 5 && dg.items[0].y === 5).toBe(false);
    expect(statueAt(dg, dg.items[0].x, dg.items[0].y)).toBeNull();
  });

  it("displaceObjectsFromStatue は石像上のアイテム・罠を隣へ移す", () => {
    const dg = makeEmptyDg({
      map: Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR)),
      items: [{ name: "矢", type: "arrow", id: "a1", x: 5, y: 5, tile: 21 }],
      traps: [{ name: "矢の罠", effect: "arrow", id: "t1", x: 5, y: 5, revealed: false }],
      monsters: [], statues: [],
    });
    dg.statues.push(makeStatue(5, 5));
    const ml = [];
    displaceObjectsFromStatue(dg, 5, 5, ml, getFixtureItemDeps());
    expect(dg.items[0].x === 5 && dg.items[0].y === 5).toBe(false);
    expect(dg.traps[0].x === 5 && dg.traps[0].y === 5).toBe(false);
  });
});
