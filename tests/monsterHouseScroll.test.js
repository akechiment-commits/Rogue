import { describe, it, expect } from "vitest";
import { T } from "../utils.js";
import { applyMonsterScroll, applyMonsterHouseToRoom } from "../dungeon.js";
import { ITEMS } from "../items.js";

function makeRoomDg() {
  const map = Array.from({ length: 20 }, () => Array(30).fill(T.WALL));
  // room A 2,2 8x6
  for (let y = 2; y < 8; y++) for (let x = 2; x < 10; x++) map[y][x] = T.FLOOR;
  // room B 15,2 8x6
  for (let y = 2; y < 8; y++) for (let x = 15; x < 23; x++) map[y][x] = T.FLOOR;
  // corridor
  for (let x = 10; x < 15; x++) map[5][x] = T.FLOOR;
  const rooms = [
    { x: 2, y: 2, w: 8, h: 6, cx: 6, cy: 5 },
    { x: 15, y: 2, w: 8, h: 6, cx: 19, cy: 5 },
  ];
  return {
    map,
    rooms,
    monsters: [],
    items: [],
    traps: [],
    springs: [],
    bigboxes: [],
    stairUp: { x: 3, y: 3 },
    stairDown: { x: 8, y: 6 },
    dungeonType: "beginner",
    pentacles: [],
  };
}

describe("モンスターの巻物", () => {
  it("アイテム定義がある", () => {
    const sc = ITEMS.find((i) => i.effect === "monster_house");
    expect(sc).toBeTruthy();
    expect(sc.name).toBe("モンスターの巻物");
    expect(sc.type).toBe("scroll");
  });

  it("部屋内で読むとモンスターとアイテム・罠が増える", () => {
    const dg = makeRoomDg();
    const p = { x: 5, y: 5, depth: 5, immobileTurns: 0 };
    const ml = [];
    applyMonsterScroll(dg, p, ml, { blessed: false, cursed: false });
    expect(dg.monsters.length).toBeGreaterThanOrEqual(8);
    expect(ml.some((m) => m.includes("モンスターハウス"))).toBe(true);
    expect(dg.monsters.every((m) => m.aware === true)).toBe(true);
  });

  it("祝福は強モンスターハウスメッセージになる", () => {
    const dg = makeRoomDg();
    const p = { x: 5, y: 5, depth: 5, immobileTurns: 0 };
    const ml = [];
    applyMonsterScroll(dg, p, ml, { blessed: true, cursed: false });
    expect(ml.some((m) => m.includes("強モンスターハウス"))).toBe(true);
    expect(dg.monsters.length).toBeGreaterThanOrEqual(8);
  });

  it("廊下で読むとテレポートしてからハウス化する", () => {
    const dg = makeRoomDg();
    const p = { x: 12, y: 5, depth: 5, immobileTurns: 0 }; // corridor
    const ml = [];
    applyMonsterScroll(dg, p, ml, {});
    const inRoom =
      (p.x >= 2 && p.x < 10 && p.y >= 2 && p.y < 8) ||
      (p.x >= 15 && p.x < 23 && p.y >= 2 && p.y < 8);
    expect(inRoom).toBe(true);
    expect(ml.some((m) => m.includes("テレポート"))).toBe(true);
    expect(dg.monsters.length).toBeGreaterThanOrEqual(8);
  });

  it("テレポート封じ時は自分は動かず別部屋がハウス化", () => {
    const dg = makeRoomDg();
    dg.pentacles = [{ kind: "teleport_trap", cursed: true, x: 1, y: 1 }];
    const p = { x: 12, y: 5, depth: 5, immobileTurns: 0 };
    const ml = [];
    applyMonsterScroll(dg, p, ml, {});
    expect(p.x).toBe(12);
    expect(p.y).toBe(5);
    expect(ml.some((m) => m.includes("テレポートできない") || m.includes("気配"))).toBe(true);
    expect(dg.monsterHouseRoom).toBeTruthy();
    expect(dg.monsters.some((m) => m.dormantHouse)).toBe(true);
  });

  it("呪いは同部屋の敵を別部屋へ飛ばす", () => {
    const dg = makeRoomDg();
    dg.monsters = [
      { id: "a", name: "ラット", x: 4, y: 4, type: "mon", magicImmune: false },
      { id: "b", name: "コボルト", x: 6, y: 5, type: "mon", magicImmune: false },
    ];
    const p = { x: 5, y: 5, depth: 5 };
    const ml = [];
    applyMonsterScroll(dg, p, ml, { cursed: true });
    const stillInA = dg.monsters.filter(
      (m) => m.x >= 2 && m.x < 10 && m.y >= 2 && m.y < 8,
    );
    expect(stillInA.length).toBe(0);
    expect(ml.some((m) => m.includes("別の部屋") || m.includes("飛ば"))).toBe(true);
  });

  it("applyMonsterHouseToRoom はプレイヤー足元に敵を置かない", () => {
    const dg = makeRoomDg();
    const p = { x: 5, y: 5, depth: 5 };
    const ml = [];
    applyMonsterHouseToRoom(dg, dg.rooms[0], p, ml, { playerInRoom: true });
    expect(dg.monsters.some((m) => m.x === p.x && m.y === p.y)).toBe(false);
  });
});
