import { describe, it, expect, vi, afterEach } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { MONS, makeMonsterFromBase, monsterAI, monsterDragonFire, monsterIceBreath } from "../monsters.js";
import { MW, MH, T } from "../utils.js";

describe("Dragon breath damage hooks: barrier, spore, dormant, paralysis, fixed damage", () => {
  it("炎ブレスは射線上のヤバイ食料を崩し、壁の向こうまでは届かない", () => {
    const dragon = { id: "dragon", name: "ドラゴン", x: 2, y: 2, atk: 40, monLevel: 1 };
    const food = { id: "food", name: "ヤバイパン", type: "food", yabai: true, x: 4, y: 2 };
    const behindWall = { ...food, id: "behind-wall", x: 7 };
    const dg = makeEmptyDg({ monsters: [dragon], items: [food, behindWall] });
    dg.map[2][6] = T.WALL;

    monsterDragonFire(dragon, dg, makePlayer({ x: 10, y: 2 }), []);

    expect(dg.items).toEqual([behindWall]);
  });

  it("dragon fire breath hitting mushroom triggers counter spore, wakes dormant, and clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 2 });
    const ml = [];

    const dragon = {
      id: "drag1",
      name: "ドラゴン",
      x: 2,
      y: 2,
      atk: 40,
      monLevel: 1,
    };
    const mushroom = {
      id: "mush1",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 4,
      y: 2,
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [dragon, mushroom];

    monsterDragonFire(dragon, dg, p, ml);

    expect(mushroom.hp).toBe(99); // clamped to 1 fixed damage
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("dragon fire breath respects monster barrier and player barrier", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 2, hp: 50, maxHp: 50, barrier: 1 });
    const ml = [];

    const dragon = {
      id: "drag2",
      name: "ドラゴン",
      x: 2,
      y: 2,
      atk: 40,
      monLevel: 1,
    };
    const barrierMon = {
      id: "bm1",
      name: "ゴーレム",
      x: 3,
      y: 2,
      hp: 100,
      maxHp: 100,
      barrier: 1,
    };
    dg.monsters = [dragon, barrierMon];

    // Hits barrierMon first
    monsterDragonFire(dragon, dg, p, ml);
    expect(barrierMon.hp).toBe(100);
    expect(barrierMon.barrier).toBe(0);

    // Now remove barrierMon, fire reaches player
    dg.monsters = [dragon];
    monsterDragonFire(dragon, dg, p, ml);
    expect(p.hp).toBe(50);
    expect(p.barrier).toBe(0);
  });

  it("ice dragon breath hitting mushroom triggers counter spore, wakes dormant, and clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 2 });
    const ml = [];

    const icedragon = {
      id: "icedrag1",
      name: "氷竜",
      x: 2,
      y: 2,
      atk: 40,
      monLevel: 1,
    };
    const mushroom = {
      id: "mush2",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 4,
      y: 2,
      hp: 50,
      maxHp: 50,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [icedragon, mushroom];

    monsterIceBreath(icedragon, dg, p, ml);

    expect(mushroom.hp).toBe(49); // clamped to 1 fixed damage
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("ice dragon breath hitting sleeping/paralyzed player wakes sleep, weakens paralysis, and consumes barrier", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 4, y: 2, hp: 50, maxHp: 50, sleepTurns: 3, paralyzeTurns: 2, barrier: 1 });
    const ml = [];

    const icedragon = {
      id: "icedrag2",
      name: "氷竜",
      x: 2,
      y: 2,
      atk: 40,
      monLevel: 1,
    };
    dg.monsters = [icedragon];

    // Player with barrier consumes barrier without losing HP
    monsterIceBreath(icedragon, dg, p, ml);
    expect(p.hp).toBe(50);
    expect(p.barrier).toBe(0);

    // Next hit without barrier wakes sleep and clears paralysis
    monsterIceBreath(icedragon, dg, p, ml);
    expect(p.hp).toBeLessThan(50);
    expect(p.sleepTurns).toBe(0);
    expect(p.paralyzeTurns).toBe(0);
    expect(ml.some(m => m.includes("寒さで目が覚めた！"))).toBe(true);
    expect(ml.some(m => m.includes("金縛りが解けた！"))).toBe(true);
  });

  it("氷ブレスで撃破した敵や状態防止中の敵には鈍足を付与しない", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 2 });
    const icedragon = { id: "icedrag3", name: "氷竜", x: 2, y: 2, atk: 40, monLevel: 1 };
    const dyingMon = { id: "d1", name: "ゴブリン", x: 3, y: 2, hp: 1, maxHp: 10, speed: 1, def: 0 };
    const immuneMon = { id: "im1", name: "耐性敵", x: 4, y: 2, hp: 200, maxHp: 200, speed: 1, def: 0, statusImmune: 10 };
    dg.monsters = [icedragon, dyingMon];
    const ml1 = [];
    monsterIceBreath(icedragon, dg, p, ml1);
    expect(dg.monsters).not.toContain(dyingMon);
    expect(dyingMon.speed).toBe(1);
    expect(ml1.some(m => m.includes("鈍足"))).toBe(false);

    dg.monsters = [icedragon, immuneMon];
    const ml2 = [];
    monsterIceBreath(icedragon, dg, p, ml2);
    expect(immuneMon.speed).toBe(1);
    expect(immuneMon.slowTurns || 0).toBe(0);
  });
});

describe("Red Dragon & Blue Dragon two-phase room breath", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("レッドドラゴン（dragon Lv2）が moveOnly で同室ブレスを予約した後、attackOnly で確実に炎ブレスを吐く", () => {
    const base = MONS.find(m => m.baseKind === "dragon");
    const dragon = makeMonsterFromBase(base, 2, 4, 4, { aware: true });
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
    const room = { x: 2, y: 2, w: 10, h: 10 };
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) map[y][x] = T.FLOOR;
    }
    const dg = makeEmptyDg({
      map,
      rooms: [room],
      visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
      monsters: [dragon],
    });
    // 直線上ではない同室座標（追尾ブレス対象）
    const p = makePlayer({ x: 8, y: 6, hp: 300, maxHp: 300 });
    const ml = [];

    // 1回目の乱数(moveOnly予約時)は0.05で20%以内、2回目以降の乱数(attackOnly等)は0.99でブレス再抽選に頼らないことを検証
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValueOnce(0.05).mockReturnValue(0.99);

    monsterAI(dragon, dg, p, ml, { moveOnly: true });
    expect(dragon.x).toBe(4);
    expect(dragon.y).toBe(4);
    expect(dragon._rangedAttackThisTurn).toBe(true);

    dragon.turnAttacks = 0;
    monsterAI(dragon, dg, p, ml, { attackOnly: true });
    expect(ml.some(m => m.includes("レッドドラゴンが炎ブレスを吐いた！"))).toBe(true);
    expect(p.hp).toBeLessThan(300);
  });

  it("ブルードラゴン（icedragon Lv2）も moveOnly 予約後に attackOnly で確実に氷ブレスを吐く", () => {
    const base = MONS.find(m => m.baseKind === "icedragon");
    const dragon = makeMonsterFromBase(base, 2, 4, 4, { aware: true });
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
    const room = { x: 2, y: 2, w: 10, h: 10 };
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) map[y][x] = T.FLOOR;
    }
    const dg = makeEmptyDg({
      map,
      rooms: [room],
      visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
      monsters: [dragon],
    });
    const p = makePlayer({ x: 8, y: 6, hp: 300, maxHp: 300 });
    const ml = [];

    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValueOnce(0.05).mockReturnValue(0.99);

    monsterAI(dragon, dg, p, ml, { moveOnly: true });
    expect(dragon._rangedAttackThisTurn).toBe(true);

    dragon.turnAttacks = 0;
    monsterAI(dragon, dg, p, ml, { attackOnly: true });
    expect(ml.some(m => m.includes("ブルードラゴンが氷ブレスを吐いた！"))).toBe(true);
    expect(p.hp).toBeLessThan(300);
  });
});
