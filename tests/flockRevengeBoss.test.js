import { describe, expect, it, vi } from "vitest";
import { FLOCK_REVENGE_BOSS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { MH, MW, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeRevengeScene({ flockX = 8, flockY = 8, playerX = 11, playerY = 8, room = { x: 1, y: 1, w: 25, h: 15 } } = {}) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rooms = [room];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      map[y][x] = T.FLOOR;
    }
  }
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  const flock = makeMonsterFromBase(FLOCK_REVENGE_BOSS, 1, flockX, flockY, { aware: true, dormant: false });
  const player = makePlayer({ x: playerX, y: playerY, depth: 25 });
  const dungeon = makeEmptyDg({ map, rooms, visible, monsters: [flock], dungeonType: "legend" });
  return { dungeon, flock, player };
}

describe("超上級B25Fボス：逆襲のフロック", () => {
  it("同室・直線上でも雷・召喚だけでなく直線魔法6種やバフ魔法をバランスよく使う", () => {
    const used = new Set();
    const { dungeon, flock, player } = makeRevengeScene({ flockX: 8, flockY: 8, playerX: 11, playerY: 8 });
    const monsterWandFn = vi.fn((m) => { used.add(m.wandEffect); });
    for (let i = 0; i < 120; i++) {
      flock.mp = flock.maxMp;
      flock.turnAttacks = 0;
      flock.flockReflectTurns = 0;
      flock.flockGuardTurns = 0;
      flock.flameMantleTurns = 0;
      const before = dungeon.monsters.length;
      monsterAI(flock, dungeon, player, [], { moveOnly: true, monsterWandFn });
      monsterAI(flock, dungeon, player, [], { attackOnly: true, monsterWandFn });
      if (dungeon.monsters.length > before) {
        used.add("summon_monster");
        dungeon.monsters = [flock];
      }
    }
    for (const expected of [
      "fire_bolt", "ice_wand", "poison_bolt", "curse_wand", "drain_hp", "sleep_bolt",
      "lightning_magic", "reflect_magic", "guard_magic", "flame_mantle", "summon_monster",
    ]) {
      expect(used.has(expected), `missing ${expected}`).toBe(true);
    }
  });

  it("距離3・一直線上を保つように移動し、射程外(距離11以上)の直線上や非ベスト位置でも近づく", () => {
    // 同室・直線上で距離12 → 魔法を使わない判定なら距離3へ向かって近づく
    const far = makeRevengeScene({ flockX: 3, flockY: 8, playerX: 15, playerY: 8 });
    const rand = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      monsterAI(far.flock, far.dungeon, far.player, [], { moveOnly: true, monsterWandFn: vi.fn() });
      expect(far.flock.x).toBe(4);
      expect(far.flock.y).toBe(8);
    } finally {
      rand.mockRestore();
    }

    // 距離2に詰められた時、魔法を使わない判定なら距離3へ下がる
    const close = makeRevengeScene({ flockX: 9, flockY: 8, playerX: 11, playerY: 8 });
    const rand2 = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      monsterAI(close.flock, close.dungeon, close.player, [], { moveOnly: true, monsterWandFn: vi.fn() });
      expect(Math.max(Math.abs(close.flock.x - close.player.x), Math.abs(close.flock.y - close.player.y))).toBe(3);
    } finally {
      rand2.mockRestore();
    }
  });

  it("プレイヤーを見失った（壁越し・別室等）ときは最後に見つけた位置や巡回で歩いて探す", () => {
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
    const roomA = { x: 2, y: 2, w: 6, h: 6 };
    const roomB = { x: 14, y: 2, w: 6, h: 6 };
    for (const r of [roomA, roomB]) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) map[y][x] = T.FLOOR;
    }
    for (let x = 8; x < 14; x++) map[5][x] = T.FLOOR;

    const visible = Array.from({ length: MH }, () => Array(MW).fill(false));
    const flock = makeMonsterFromBase(FLOCK_REVENGE_BOSS, 1, 5, 5, { aware: true, dormant: false, lastPx: 10, lastPy: 5 });
    const player = makePlayer({ x: 16, y: 5, depth: 25 });
    const dg = makeEmptyDg({ map, rooms: [roomA, roomB], visible, monsters: [flock], dungeonType: "legend" });

    monsterAI(flock, dg, player, [], { moveOnly: true, monsterWandFn: vi.fn() });
    expect(flock.x).toBe(6);
    expect(flock.y).toBe(5);
  });
});
