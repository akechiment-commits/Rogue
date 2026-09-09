import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import {
  advanceSpecialProjectiles,
  makeHomingShot,
  shootArrow,
  throwItemAlongLine,
} from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function makeWaterFlowerDungeon() {
  return makeEmptyDg({
    rooms: [{ x: 1, y: 1, w: 20, h: 12 }],
  });
}

describe("水中花系", () => {
  it("3段階の定義を持ち、水中限定・静止型である", () => {
    const base = MONS.find((monster) => monster.baseKind === "waterFlower");
    expect(base).toMatchObject({
      name: "水中花",
      waterOnly: true,
      stationary: true,
      subtype: "waterFlower",
    });
    expect(base.levels.map((level) => level.name)).toEqual(["水中サボテン", "水中巾着"]);
  });

  it("同じ部屋で誘導弾を1マスずつ射ち、本人は移動しない", () => {
    const base = MONS.find((monster) => monster.baseKind === "waterFlower");
    const flower = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    flower.alwaysUseSpecial = true;
    flower.turnAttacks = 0;
    const player = makePlayer({ x: 9, y: 7 });
    const dg = makeWaterFlowerDungeon();
    dg.map[5][5] = T.WATER;
    dg.monsters = [flower];
    const ml = [];
    const original = { x: flower.x, y: flower.y };

    monsterAI(flower, dg, player, ml, { moveOnly: true });
    expect({ x: flower.x, y: flower.y }).toEqual(original);
    expect(flower._rangedAttackThisTurn).toBe(true);

    monsterAI(flower, dg, player, ml, { attackOnly: true });
    expect({ x: flower.x, y: flower.y }).toEqual(original);
    expect(dg.specialProjectiles).toHaveLength(1);
    expect(dg.specialProjectiles[0]).toMatchObject({
      kind: "homing",
      owner: "monster",
      sourceId: flower.id,
      x: 5,
      y: 5,
    });
    expect(player.hp).toBe(player.maxHp);

    advanceSpecialProjectiles(dg, player, ml, () => {});
    expect(dg.specialProjectiles[0]).toMatchObject({ x: 6, y: 6 });
    expect(player.hp).toBe(player.maxHp);

    for (let i = 0; i < 4 && dg.specialProjectiles.length > 0; i++) {
      advanceSpecialProjectiles(dg, player, ml, () => {});
    }
    expect(player.hp).toBeLessThan(player.maxHp);
    expect(dg.specialProjectiles).toHaveLength(0);
    expect(ml.some((message) => message.includes("誘導弾が命中"))).toBe(true);
  });

  it("同じ部屋にいなければ誘導弾を射たず、静止したまま", () => {
    const base = MONS.find((monster) => monster.baseKind === "waterFlower");
    const flower = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    flower.alwaysUseSpecial = true;
    flower.turnAttacks = 0;
    const player = makePlayer({ x: 25, y: 15 });
    const dg = makeEmptyDg({
      rooms: [
        { x: 1, y: 1, w: 10, h: 10 },
        { x: 20, y: 12, w: 10, h: 10 },
      ],
      monsters: [flower],
    });
    dg.map[5][5] = T.WATER;

    monsterAI(flower, dg, player, [], { moveOnly: true });

    expect([flower.x, flower.y]).toEqual([5, 5]);
    expect(dg.specialProjectiles || []).toHaveLength(0);
  });

  it("壁に直進でぶつからず、毎ターン経路を探してプレイヤーを追尾する", () => {
    const dg = makeEmptyDg({
      specialProjectiles: [{
        id: "enemy-shot",
        kind: "homing",
        owner: "monster",
        name: "誘導弾",
        sourceName: "水中花",
        x: 3,
        y: 3,
        dx: 1,
        dy: 0,
        turnsLeft: 30,
        hasMoved: false,
      }],
    });
    const player = makePlayer({ x: 8, y: 3 });
    for (let y = 2; y <= 4; y++) dg.map[y][5] = T.WALL;
    const ml = [];

    for (let i = 0; i < 8 && dg.specialProjectiles.length > 0; i++) {
      advanceSpecialProjectiles(dg, player, ml, () => {});
    }

    expect(player.hp).toBeLessThan(player.maxHp);
    expect(dg.specialProjectiles).toHaveLength(0);
  });

  it("敵の誘導弾が別の敵に当たる", () => {
    const source = { id: "flower", name: "水中花", x: 3, y: 3, hp: 40, maxHp: 40, atk: 10, def: 1 };
    const target = { id: "target", name: "標的", x: 4, y: 4, hp: 100, maxHp: 100, atk: 1, def: 0, exp: 1 };
    const dg = makeEmptyDg({
      monsters: [source, target],
      specialProjectiles: [{
        id: "enemy-shot",
        kind: "homing",
        owner: "monster",
        name: "誘導弾",
        sourceId: source.id,
        sourceName: source.name,
        atk: 30,
        x: source.x,
        y: source.y,
        dx: 1,
        dy: 1,
        turnsLeft: 10,
        hasMoved: false,
      }],
    });
    const player = makePlayer({ x: 8, y: 8 });
    const ml = [];

    advanceSpecialProjectiles(dg, player, ml, () => {});

    expect(target.hp).toBeLessThan(100);
    expect(dg.specialProjectiles).toHaveLength(0);
    expect(ml.some((message) => message.includes("水中花の誘導弾が標的に命中"))).toBe(true);
  });

  it("誘導弾同士は同じマスに重ならない", () => {
    const dg = makeEmptyDg({
      specialProjectiles: [
        { id: "shot-a", kind: "homing", owner: "monster", x: 2, y: 2, dx: 1, dy: 1, turnsLeft: 10, hasMoved: false },
        { id: "shot-b", kind: "homing", owner: "monster", x: 4, y: 2, dx: -1, dy: 1, turnsLeft: 10, hasMoved: false },
      ],
    });
    const player = makePlayer({ x: 3, y: 6 });

    advanceSpecialProjectiles(dg, player, [], () => {});

    const cells = dg.specialProjectiles.map((sp) => `${sp.x},${sp.y}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("敵味方の誘導弾が重なると双方とも消滅する", () => {
    const dg = makeEmptyDg({
      specialProjectiles: [
        { id: "enemy-shot", kind: "homing", owner: "monster", name: "敵の誘導弾", x: 2, y: 2, dx: 1, dy: 1, turnsLeft: 10, hasMoved: false },
        { id: "player-shot", kind: "homing", owner: "player", name: "味方の誘導弾", x: 4, y: 2, dx: -1, dy: 1, turnsLeft: 10, hasMoved: false },
      ],
    });
    const player = makePlayer({ x: 8, y: 8 });
    const ml = [];

    advanceSpecialProjectiles(dg, player, ml, () => {});

    expect(dg.specialProjectiles).toHaveLength(0);
    expect(ml.some((message) => message.includes("ぶつかって消滅した"))).toBe(true);
  });

  it("プレイヤーが発射した誘導弾は味方弾として記録される", () => {
    const player = makePlayer({ inventory: [makeHomingShot(1)] });
    const dg = makeEmptyDg();

    shootArrow(player, dg, 0, 1, 0, [], () => {});

    expect(dg.specialProjectiles[0]).toMatchObject({ kind: "homing", owner: "player" });
  });
});

describe("敵の誘導弾への対抗", () => {
  it("プレイヤーの矢が敵の誘導弾に当たると両方とも消える", () => {
    const dg = makeEmptyDg({
      specialProjectiles: [{
        id: "enemy-shot",
        kind: "homing",
        owner: "monster",
        name: "誘導弾",
        sourceName: "水中花",
        x: 4,
        y: 2,
        dx: 1,
        dy: 0,
        turnsLeft: 10,
        hasMoved: true,
      }],
    });
    const arrow = { name: "矢", type: "arrow", atk: 3, count: 1 };
    const player = makePlayer({ x: 2, y: 2, inventory: [arrow] });
    const ml = [];

    shootArrow(player, dg, 0, 1, 0, ml, () => {});

    expect(dg.specialProjectiles).toHaveLength(0);
    expect(player.inventory).toHaveLength(0);
    expect(ml.some((message) => message.includes("矢が誘導弾に命中"))).toBe(true);
  });

  it("プレイヤーの投擲物が敵の誘導弾に当たると投擲物も消える", () => {
    const dg = makeEmptyDg({
      specialProjectiles: [{
        id: "enemy-shot",
        kind: "homing",
        owner: "monster",
        name: "誘導弾",
        sourceName: "水中花",
        x: 4,
        y: 2,
        dx: 1,
        dy: 0,
        turnsLeft: 10,
        hasMoved: true,
      }],
    });
    const player = makePlayer({ x: 2, y: 2 });
    const thrown = { name: "石", type: "arrow", atk: 3, stone: true };
    const ml = [];

    const result = throwItemAlongLine(player, dg, thrown, 1, 0, 10, ml, player, () => {});

    expect(result.hitEnemyProjectile).toBeTruthy();
    expect(result.consumed).toBe(true);
    expect(dg.specialProjectiles).toHaveLength(0);
    expect(dg.items).toHaveLength(0);
  });
});
