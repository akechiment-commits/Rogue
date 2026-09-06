import { describe, expect, it } from "vitest";
import { suspendFloor, resumeFloor, ABSENCE_PATROL_MAX_DISTANCE } from "../floorAbsence.js";
import { beginPlayerTurnClock, takeDueActions } from "../actionClock.js";
import { T, createSeededRng } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function setup(extra = {}) {
  const monster = { id: "patrol", x: 5, y: 5, hp: 30, speed: 1, actionTime: 120, ...extra };
  const dungeon = makeEmptyDg({ monsters: [monster], stairUp: { x: 2, y: 2 } });
  const player = makePlayer({ x: 2, y: 2, actionTime: 120 });
  return { monster, dungeon, player };
}

describe("不在フロアの巡回と復帰", () => {
  it("長期不在でも復帰直後に敵が行動をまとめて消化しない", () => {
    const { monster, dungeon, player } = setup({ aware: true });
    suspendFloor(dungeon, player, { stairs: true });
    player.actionTime = 12000;
    resumeFloor(dungeon, player);
    expect(monster).toMatchObject({ x: 5, y: 5, aware: true });
    expect(takeDueActions(monster, player.actionTime, 1)).toBe(0);
    for (let i = 0; i < 4; i++) {
      beginPlayerTurnClock(player);
      expect(takeDueActions(monster, player.actionTime, 1)).toBe(1);
    }
  });

  it("復帰後もプレイヤー倍速・敵鈍足の行動比率を守る", () => {
    const { monster, dungeon, player } = setup();
    suspendFloor(dungeon, player);
    Object.assign(player, { actionTime: 12000, hasteTurns: 10 });
    resumeFloor(dungeon, player);
    const actions = [];
    for (let i = 0; i < 4; i++) {
      beginPlayerTurnClock(player);
      actions.push(takeDueActions(monster, player.actionTime, 0.5));
    }
    expect(actions).toEqual([0, 0, 0, 1]);
  });

  it("即座に戻れば配置は変わらず、不在が長いほど到達範囲が広がる", () => {
    const distances = [1, 8, 40].map(beats => {
      const { monster, dungeon, player } = setup();
      suspendFloor(dungeon, player, { stairs: true });
      player.actionTime += beats * 12;
      resumeFloor(dungeon, player, { random: () => 0.99 });
      return Math.abs(monster.x - 5) + Math.abs(monster.y - 5);
    });
    expect(distances[0]).toBe(0);
    expect(distances[1]).toBeGreaterThan(0);
    expect(distances[1]).toBeLessThanOrEqual(2);
    expect(distances[2]).toBeGreaterThan(distances[1]);
    expect(distances[2]).toBeLessThanOrEqual(10);
  });

  it("何万ターン不在でも範囲と乱数呼び出し数が増え続けない", () => {
    const { monster, dungeon, player } = setup();
    suspendFloor(dungeon, player);
    player.actionTime += 1000000 * 12;
    let calls = 0;
    resumeFloor(dungeon, player, { random: () => { calls++; return 0.9; } });
    expect(calls).toBe(1);
    expect(Math.abs(monster.x - 5) + Math.abs(monster.y - 5)).toBeLessThanOrEqual(ABSENCE_PATROL_MAX_DISTANCE);
  });

  it("階段離脱時に追跡中・視認中の敵は待ち、未認識の敵だけ巡回する", () => {
    const { monster, dungeon, player } = setup({ aware: true });
    const seen = { id: "seen", x: 3, y: 2, hp: 30, speed: 1 };
    const roaming = { id: "roaming", x: 20, y: 20, hp: 30, speed: 1 };
    dungeon.monsters.push(seen, roaming);
    suspendFloor(dungeon, player, { stairs: true });
    player.actionTime += 480;
    resumeFloor(dungeon, player, { random: createSeededRng(12) });
    expect([monster.x, monster.y]).toEqual([5, 5]);
    expect([seen.x, seen.y]).toEqual([3, 2]);
    expect([roaming.x, roaming.y]).not.toEqual([20, 20]);
    expect(monster.waitDuringAbsence).toBeUndefined();
  });

  it("階段以外で離れた場合、追跡中だった敵も巡回できる", () => {
    const { monster, dungeon, player } = setup({ aware: true });
    suspendFloor(dungeon, player);
    player.actionTime += 480;
    resumeFloor(dungeon, player, { random: () => 0 });
    expect([monster.x, monster.y]).not.toEqual([5, 5]);
    expect(monster.aware).toBe(false);
  });

  it.each([
    { dormant: true }, { sleepTurns: 10 }, { paralyzed: true }, { immobileTurns: 10 },
    { stationary: true }, { subtype: "grabber" }, { waterOnly: true },
    { type: "shopkeeper" }, { subtype: "itemMimic" }, { hp: 0 },
  ])("行動不能・固定型の敵は動かない: %j", extra => {
    const { monster, dungeon, player } = setup(extra);
    suspendFloor(dungeon, player);
    player.actionTime += 480;
    resumeFloor(dungeon, player);
    expect([monster.x, monster.y]).toEqual([5, 5]);
    expect(monster).toMatchObject(extra);
  });

  it("壁・水・罠・石像・他の敵・到着マスを通り抜けない", () => {
    const { monster, dungeon, player } = setup();
    dungeon.map = dungeon.map.map(row => row.map(() => T.WALL));
    for (let x = 2; x <= 12; x++) dungeon.map[5][x] = T.FLOOR;
    dungeon.map[5][6] = T.WATER;
    dungeon.traps.push({ x: 4, y: 5 });
    suspendFloor(dungeon, player);
    player.actionTime += 12000;
    expect(resumeFloor(dungeon, player)).toBe(0);
    dungeon.traps = [];
    dungeon.statues = [{ x: 4, y: 5 }];
    suspendFloor(dungeon, player);
    player.actionTime += 12000;
    expect(resumeFloor(dungeon, player)).toBe(0);
    dungeon.statues = [];
    dungeon.monsters.push({ id: "blocker", x: 4, y: 5, hp: 10, stationary: true });
    suspendFloor(dungeon, player);
    player.actionTime += 12000;
    expect(resumeFloor(dungeon, player)).toBe(0);
    dungeon.monsters.pop();
    player.x = 4; player.y = 5;
    suspendFloor(dungeon, player);
    player.actionTime += 12000;
    expect(resumeFloor(dungeon, player)).toBe(0);
  });

  it("浮遊・水上移動・壁抜けは有効な地形を通れるが封印時は固有能力を失う", () => {
    for (const [extra, tile, moves] of [
      [{ float: true }, T.WATER, true], [{ float: true, sealed: true }, T.WATER, false],
      [{ waterWalker: true, sealed: true }, T.WATER, true],
      [{ wallWalker: true }, T.WALL, true], [{ wallWalker: true, sealed: true }, T.WALL, false],
    ]) {
      const { dungeon, player } = setup(extra);
      dungeon.map = dungeon.map.map(row => row.map(() => T.BWALL));
      dungeon.map[5][5] = T.FLOOR;
      dungeon.map[5][6] = tile;
      dungeon.map[5][7] = T.FLOOR;
      suspendFloor(dungeon, player);
      player.actionTime += 480;
      expect(resumeFloor(dungeon, player, { random: () => 0.99 }) > 0).toBe(moves);
    }
  });

  it("セーブ・ロード後も待ち伏せ情報と不在時間が残り、復帰は一度だけ", () => {
    const { dungeon, player } = setup({ aware: true });
    suspendFloor(dungeon, player, { stairs: true });
    const saved = JSON.parse(JSON.stringify(dungeon));
    player.actionTime += 1200;
    resumeFloor(saved, player);
    expect(saved.monsters[0]).toMatchObject({ x: 5, y: 5, actionTime: player.actionTime });
    expect(saved.absentSince).toBeUndefined();
    expect(resumeFloor(saved, player)).toBe(0);
  });

  it("旧セーブでも敵の時計を補正し、記録のない不在巡回は行わない", () => {
    const { monster, dungeon, player } = setup();
    player.actionTime = 12000;
    expect(resumeFloor(dungeon, player)).toBe(0);
    expect(monster).toMatchObject({ x: 5, y: 5, actionTime: 12000 });
  });
});
