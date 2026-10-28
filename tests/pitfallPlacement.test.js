import { afterEach, describe, it, expect } from "vitest";
import { placeFallenEntities } from "../pitfallPlacement.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { drainAnims, drainItemArcs, pushAnim, pushItemFlyAnim } from "../animEvents.js";

afterEach(() => { drainAnims(); drainItemArcs(); });

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
  it("壺は下階で割れ、中身を撒いたマスへ次の落下物を重ねない", () => {
    const dg = smallFloor();
    const first = { id: "first", name: "命の指輪", type: "ring", plus: -1 };
    const second = { id: "second", name: "短剣", type: "weapon", atk: 3 };
    const pot = { id: "pot", name: "保存の壺", type: "pot", potEffect: "none", contents: [first, second] };
    const stone = { id: "stone", type: "arrow", name: "石" };
    placeFallenEntities(dg, [{ kind: "item", entity: pot }, { kind: "item", entity: stone }], { random: () => 0 });
    expect(dg.items).not.toContain(pot);
    expect(dg.items).toEqual([first, second, stone]);
    expect(first.plus).toBe(-1);
    expect(new Set(dg.items.map(item => `${item.x},${item.y}`)).size).toBe(3);
    expect(pot.contents).toHaveLength(0);
  });
  it.each([false, true])("落下した薬は消滅し、下階の敵やプレイヤーへ薬効を出さない（呪い:%s）", cursed => {
    const dg = smallFloor();
    const player = makePlayer({ x: 3, y: 2, hp: 40 });
    const monster = { id: "target", name: "敵", kind: "humanoid", x: 3, y: 3, hp: 40, maxHp: 100 };
    dg.monsters.push(monster);
    const potion = { name: "回復薬", type: "potion", effect: "heal", value: 20, cursed };
    placeFallenEntities(dg, [{ kind: "item", entity: potion }], { player, random: () => 0 });
    expect(dg.items).not.toContain(potion);
    expect(player.hp).toBe(40);
    expect(monster.hp).toBe(40);
    expect(drainAnims()).toHaveLength(0);
  });
  it.each(["olive", "gunpowder", "heal_pot", "greed"])("落下した%s壺は中身だけを残し、特殊効果や別階の演出を出さない", potEffect => {
    const dg = smallFloor();
    const player = makePlayer({ x: 3, y: 2, hp: 40 });
    const ring = { name: "命の指輪", type: "ring" };
    const pot = { name: "壺", type: "pot", potEffect, capacity: 3, contents: [ring] };
    pushAnim({ type: "current-floor" });
    pushItemFlyAnim(2, 2, 3, 2, 9);
    placeFallenEntities(dg, [{ kind: "item", entity: pot }], { player, random: () => 0 });
    expect(dg.items).not.toContain(pot);
    expect(dg.items).toEqual([ring]);
    expect(dg.oilyTiles || []).toHaveLength(0);
    expect(player.hp).toBe(40);
    expect(drainAnims()).toEqual([{ type: "current-floor" }]);
    expect(drainItemArcs()).toHaveLength(1);
  });
  it("とじこめの壺は下階で敵を放出し、落下時刻へ時計を同期する", () => {
    const dg = smallFloor();
    const pot = { name: "とじこめの壺", type: "pot", potEffect: "imprison", confinedMonsters: [
      { id: "old", name: "閉じ込め敵", hp: 10, maxHp: 10, actionTime: 12, _phaseActionCount: 8, _movedThisTurn: true },
    ] };
    placeFallenEntities(dg, [{ kind: "item", entity: pot }], { actionTime: 120, random: () => 0 });
    expect(dg.items).not.toContain(pot);
    expect(dg.monsters).toHaveLength(1);
    expect(dg.monsters[0]).toMatchObject({ hp: 10, actionTime: 120, _phaseActionCount: 0 });
    expect(dg.monsters[0]._movedThisTurn).toBeUndefined();
    expect(pot.confinedMonsters).toHaveLength(0);
  });
  it("壺の中に入っていた薬は、そのまま残り、空き待ちと保存を挟んでも消さない", () => {
    const dg = smallFloor();
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) {
      if (x !== 2 || y !== 2) dg.monsters.push({ x, y, hp: 10 });
    }
    const ring = { name: "指輪", type: "ring" };
    const potion = { id: "potion", name: "回復薬", type: "potion", effect: "heal", value: 20 };
    const pot = { name: "保存の壺", type: "pot", potEffect: "none", contents: [ring, potion] };
    placeFallenEntities(dg, [{ kind: "item", entity: pot }], { random: () => 0 });
    expect(dg.items).toEqual([ring]);
    expect(dg.pendingPitfalls).toHaveLength(1);
    dg.pendingPitfalls = JSON.parse(JSON.stringify(dg.pendingPitfalls));
    dg.monsters.shift();
    placeFallenEntities(dg);
    expect(dg.pendingPitfalls).toHaveLength(0);
    expect(dg.items.some(item => item.id === "potion")).toBe(true);
    expect(pot.contents).toHaveLength(0);
  });
  it("待機中の壺はまだ割らず、着地できた時に一度だけ割る", () => {
    const dg = smallFloor();
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) dg.monsters.push({ x, y, hp: 10 });
    const ring = { id: "ring", name: "命の指輪", type: "ring" };
    const pot = { name: "保存の壺", type: "pot", potEffect: "none", contents: [ring] };
    placeFallenEntities(dg, [{ kind: "item", entity: pot }]);
    expect(pot.contents).toEqual([ring]);
    expect(dg.pendingPitfalls).toHaveLength(1);
    dg.monsters.shift();
    placeFallenEntities(dg);
    placeFallenEntities(dg);
    expect(dg.pendingPitfalls).toHaveLength(0);
    expect(dg.items).toEqual([ring]);
    expect(pot.contents).toHaveLength(0);
  });
});
