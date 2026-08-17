import { describe, it, expect, vi } from "vitest";
import {
  makeTorpedo,
  makeCrawlingBomb,
  makeHomingShot,
  addArrowsInv,
  shootArrow,
  advanceSpecialProjectiles,
  calcProjectileDmg,
} from "../items.js";
import "../monsters.js";
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

  it("魚雷は水上を1マスずつ進み、水中の敵に当たる", () => {
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
    expect(dg.specialProjectiles || []).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("魚雷は水中に入ると近くの敵を追尾する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const dg = makeDungeon();
    dg.map[2][3] = T.WATER;
    dg.map[3][3] = T.WATER;
    dg.map[4][3] = T.WATER;
    const target = { id: "water-homing-target", name: "水中の標的", x: 3, y: 4, hp: 200, maxHp: 200, def: 0 };
    dg.monsters.push(target);
    const p = makePlayer([makeTorpedo(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(dg.specialProjectiles[0]).toMatchObject({ x: 3, y: 2 });
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(dg.specialProjectiles[0]).toMatchObject({ x: 3, y: 3 });
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(target.hp).toBeLessThan(200);
    expect(dg.specialProjectiles).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("魚雷は水の外へ出るとアイテムとして残る", () => {
    const dg = makeDungeon();
    dg.map[2][3] = T.WATER;
    const p = makePlayer([makeTorpedo(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(dg.specialProjectiles).toHaveLength(1);
    advanceSpecialProjectiles(dg, p, ml, () => {});

    expect(dg.specialProjectiles || []).toHaveLength(0);
    expect(dg.items).toContainEqual(expect.objectContaining({ name: "魚雷", count: 1, x: 4, y: 2 }));
  });

  it("魚雷を地上へ向けて撃っても最初の地上マスに残る", () => {
    const dg = makeDungeon();
    const p = makePlayer([makeTorpedo(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});

    expect(dg.specialProjectiles || []).toHaveLength(0);
    expect(dg.items).toContainEqual(expect.objectContaining({ name: "魚雷", count: 1, x: 3, y: 2 }));
  });

  it("束投げした魚雷が地上に残る時は束数も維持する", () => {
    const dg = makeDungeon();
    const p = makePlayer([makeTorpedo(4)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {}, null, null, null, { bundle: true });
    advanceSpecialProjectiles(dg, p, ml, () => {});

    expect(dg.items).toContainEqual(expect.objectContaining({ name: "魚雷", count: 4, x: 3, y: 2 }));
  });

  it("特殊弾は束から1個ずつ発射でき、魚雷の攻撃力は70", () => {
    const dg = makeDungeon();
    dg.map[2][3] = T.WATER;
    const torpedo = makeTorpedo(3);
    const p = makePlayer([torpedo]);
    const ml = [];

    expect(torpedo.atk).toBe(70);
    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    expect(p.inventory[0].count).toBe(1);
    expect(dg.specialProjectiles).toHaveLength(2);
  });

  it("特殊弾を投げると束全体を1発にまとめて消費する", () => {
    const dg = makeDungeon();
    dg.map[2][3] = T.WATER;
    const torpedo = makeTorpedo(4);
    const p = makePlayer([torpedo]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {}, null, null, null, { bundle: true });

    expect(p.inventory).toHaveLength(0);
    expect(dg.specialProjectiles).toHaveLength(1);
    expect(dg.specialProjectiles[0]).toMatchObject({ name: "魚雷(4個)", atk: 74 });
    expect(ml).toContain("魚雷(4個)を投げた！");
  });

  it("魚雷は着弾点で通常命中相当の爆発を1回だけ起こし、周囲1マスも巻き込む", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const dg = makeDungeon();
    const target = { id: "blast-center", name: "中心の敵", x: 3, y: 2, hp: 200, maxHp: 200, def: 0 };
    const nearby = { id: "blast-nearby", name: "隣の敵", x: 4, y: 2, hp: 200, maxHp: 200, def: 0 };
    dg.monsters.push(target, nearby);
    const p = makePlayer([makeTorpedo(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});

    const expectedDamage = calcProjectileDmg(p, 70, 0);
    expect(target.hp).toBe(200 - expectedDamage);
    expect(nearby.hp).toBe(200 - expectedDamage);
    expect(ml.some(message => message.includes("魚雷") && message.includes("爆発"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("魚雷の地上爆発は隣接する自分にも当たる", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const dg = makeDungeon();
    dg.monsters.push({ id: "ground-target", name: "地上の敵", x: 3, y: 2, hp: 200, maxHp: 200, def: 0 });
    const p = makePlayer([makeTorpedo(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});

    expect(p.hp).toBeLessThan(100);
    vi.restoreAllMocks();
  });

  it("魚雷の水中爆発は隣接していても自分には当たらない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const dg = makeDungeon();
    dg.map[2][3] = T.WATER;
    dg.monsters.push({ id: "water-target", name: "水中の敵", x: 3, y: 2, hp: 200, maxHp: 200, def: 0 });
    const p = makePlayer([makeTorpedo(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});

    expect(p.hp).toBe(100);
    vi.restoreAllMocks();
  });

  it("敵の移動経路と特殊弾の経路が交差しても命中する", () => {
    const dg = makeDungeon();
    dg.map[2][3] = T.WATER;
    const target = { id: "crossing-target", name: "倍速の敵", x: 1, y: 2, hp: 80, maxHp: 80, def: 0 };
    dg.monsters.push(target);
    const p = makePlayer([makeTorpedo(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    const snapshot = new Map([[target.id, { x: 5, y: 2 }]]);
    advanceSpecialProjectiles(dg, p, ml, () => {}, snapshot);
    expect(target.hp).toBeLessThan(80);
    expect(dg.specialProjectiles).toHaveLength(0);
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
    expect(p.hp).toBe(50);
    expect(ml.some(message => message.includes("這いずり爆弾") && message.includes("爆発"))).toBe(true);
  });

  it("這いずり爆弾は敵を消滅させ、自分には現在HPの半分を与える", () => {
    const dg = makeDungeon();
    const target = { id: "bomb-target", name: "敵", x: 3, y: 2, hp: 80, maxHp: 80, def: 0 };
    dg.monsters.push(target);
    const p = makePlayer([makeCrawlingBomb(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(p.hp).toBe(50);
    expect(dg.monsters).toHaveLength(0);
    expect(dg.specialProjectiles).toHaveLength(0);
  });

  it("這いずり爆弾は壁に向けて撃つとその場で即爆発する", () => {
    const dg = makeDungeon();
    dg.map[2][3] = T.WALL;
    const p = makePlayer([makeCrawlingBomb(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    expect(p.hp).toBe(50);
    expect(dg.specialProjectiles || []).toHaveLength(0);
    expect(ml.some(message => message.includes("壁に触れてその場で爆発"))).toBe(true);
  });

  it("這いずり爆弾は軌道上の罠を作動させて消費される", () => {
    const dg = makeDungeon();
    dg.traps.push({ id: "sleep-trap", name: "睡眠の罠", effect: "sleep", x: 3, y: 2, permanent: true });
    const p = makePlayer([makeCrawlingBomb(1)]);
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, () => {});
    advanceSpecialProjectiles(dg, p, ml, () => {});
    expect(dg.specialProjectiles).toHaveLength(0);
    expect(ml.some(message => message.includes("睡眠の罠が発動"))).toBe(true);
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
