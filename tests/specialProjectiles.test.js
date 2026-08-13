import { describe, it, expect, vi } from "vitest";
import {
  makeTorpedo,
  makeCrawlingBomb,
  makeHomingShot,
  addArrowsInv,
  shootArrow,
  advanceSpecialProjectiles,
} from "../items.js";
import { MW, MH, T } from "../utils.js";

function makeDungeon(fill = T.FLOOR) {
  return {
    map: Array.from({ length: MH }, () => Array(MW).fill(fill)),
    monsters: [], items: [], traps: [], pentacles: [], rooms: [], hiddenRooms: [],
    springs: [], bigboxes: [], statues: [], visible: [], explored: [],
  };
}

function makePlayer(inventory) {
  return { x: 2, y: 2, hp: 100, maxHp: 100, atk: 12, rings: [], inventory };
}

describe("特殊飛び道具", () => {
  it("魚雷・這いずり爆弾・誘導弾は専用属性を持ち、同種だけ束ねられる", () => {
    const torpedo = makeTorpedo(2);
    const crawling = makeCrawlingBomb(3);
    const homing = makeHomingShot(4);
    expect(torpedo).toMatchObject({ type: "arrow", specialProjectile: "torpedo", count: 2 });
    expect(crawling).toMatchObject({ type: "arrow", specialProjectile: "crawling_bomb", count: 3 });
    expect(homing).toMatchObject({ type: "arrow", specialProjectile: "homing", count: 4 });

    const inventory = [makeTorpedo(2)];
    expect(addArrowsInv(inventory, 4, false, false, 30, false, false, "torpedo")).toBe(true);
    expect(inventory).toHaveLength(1);
    expect(inventory[0].count).toBe(6);
    expect(addArrowsInv(inventory, 1, false, false, 30, false, false, "homing")).toBe(true);
    expect(inventory).toHaveLength(2);
    expect(inventory[1].specialProjectile).toBe("homing");
  });

  it("魚雷は水上を1マスずつ進み、陸に出ると消える", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const dg = makeDungeon();
    dg.map[2][3] = T.WATER;
    dg.map[2][4] = T.WATER;
    const target = { id: "water-target", name: "水上の敵", x: 4, y: 2, hp: 80, maxHp: 80, def: 0 };
    dg.monsters.push(target);
    const projectile = makeTorpedo(1);
    const p = makePlayer([projectile]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    expect(dg.specialProjectiles).toHaveLength(1);
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(dg.specialProjectiles[0]).toMatchObject({ x: 3, y: 2 });
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(target.hp).toBeLessThan(80);
    expect(dg.specialProjectiles).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("這いずり爆弾は壁に触れると爆発する", () => {
    const dg = makeDungeon();
    dg.map[10][4] = T.WALL;
    const p = { ...makePlayer([makeCrawlingBomb(1)]), x: 2, y: 10 };
    const ml = [];
    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(dg.specialProjectiles).toHaveLength(1);
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(dg.specialProjectiles).toHaveLength(0);
    expect(ml.some(message => message.includes("這いずり爆弾") && message.includes("爆発"))).toBe(true);
  });

  it("誘導弾は10マス以内の敵へ1マスずつ近づいて命中する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const dg = makeDungeon();
    const target = { id: "homing-target", name: "標的", x: 6, y: 2, hp: 80, maxHp: 80, def: 0 };
    dg.monsters.push(target);
    const p = makePlayer([makeHomingShot(1)]);
    const ml = [];
    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(dg.specialProjectiles[0]).toMatchObject({ x: 3, y: 2 });
    advanceSpecialProjectiles(dg, p, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(target.hp).toBeLessThan(80);
    expect(dg.specialProjectiles).toHaveLength(0);
    vi.restoreAllMocks();
  });
});
