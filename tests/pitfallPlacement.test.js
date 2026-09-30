import { describe, it, expect } from "vitest";
import { placeFallenEntities } from "../pitfallPlacement.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function smallFloor() {
  const map = Array.from({ length: 8 }, () => Array(8).fill(T.WALL));
  for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) map[y][x] = T.FLOOR;
  return makeEmptyDg({ map, rooms: [{ x: 2, y: 2, w: 4, h: 4 }] });
}
describe("落下物の配置", () => {
  it("敵・プレイヤー・石像・水・壁を避け、複数の落下物同士も重ねない", () => {
    const dg = smallFloor();
    const player = makePlayer({ x: 3, y: 2 });
    dg.monsters.push({ x: 2, y: 2, hp: 10 });
    dg.statues = [{ x: 4, y: 2 }];
    dg.map[2][5] = T.WATER;
    const monster = { hp: 10, actionTime: 12, _phaseActionCount: 5, _movedThisTurn: true };
    const item = { type: "arrow", name: "石" };
    placeFallenEntities(dg, [{ kind: "monster", entity: monster }, { kind: "item", entity: item }], { player, actionTime: 120, random: () => 0 });
    expect([monster.x, monster.y]).toEqual([2, 3]);
    expect([item.x, item.y]).toEqual([3, 3]);
    expect(monster.actionTime).toBe(120);
    expect(monster.absentSince).toBe(120);
    expect(monster._phaseActionCount).toBe(0);
    expect(monster._movedThisTurn).toBeUndefined();
  });
  it("部屋のない廊下フロアにも配置できる", () => {
    const dg = smallFloor(); dg.rooms = [];
    const monster = { hp: 10 };
    placeFallenEntities(dg, [{ kind: "monster", entity: monster }]);
    expect(dg.monsters).toContain(monster);
    expect(dg.map[monster.y][monster.x]).toBe(T.FLOOR);
  });
  it("満員時は消さず保存し、空きができた後の再試行で配置する", () => {
    const dg = smallFloor();
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) dg.monsters.push({ x, y, hp: 10 });
    const item = { type: "arrow", name: "石" };
    placeFallenEntities(dg, [{ kind: "item", entity: item }]);
    expect(dg.pendingPitfalls).toHaveLength(1);
    dg.monsters.pop();
    placeFallenEntities(dg);
    expect(dg.pendingPitfalls).toHaveLength(0);
    expect([item.x, item.y]).toEqual([5, 5]);
  });
});
