import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import { FLOCK_REVENGE_BOSS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { monsterDrop } from "../items.js";
import { applyWandEffect } from "../wands.js";
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
    for (let i = 0; i < 400; i++) {
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

  it("フロックの分身はボス扱い（状態異常有限・鈍足5T・bossTier継承）で生成され、ボス報酬を落とす", () => {
    const gameSource = fs.readFileSync("Game.jsx", "utf8");
    const cloneSnippetMatch = gameSource.match(/name:\s*"フロックの分身"[\s\S]{0,160}/);
    expect(cloneSnippetMatch?.[0]).toContain("isBoss: true");
    expect(cloneSnippetMatch?.[0]).not.toContain("bossTier: 0");

    const { dungeon, flock, player } = makeRevengeScene({ flockX: 8, flockY: 8, playerX: 11, playerY: 8 });
    const clone = {
      ...flock,
      id: "flock-clone-1",
      name: "フロックの分身",
      hp: 640,
      maxHp: 640,
      isBoss: true,
      _flockRevengeClone: true,
      _flockCloneSummoned: true,
    };
    dungeon.monsters.push(clone);
    const messages = [];
    applyWandEffect("slow", "monster", clone, 1, 0, dungeon, player, messages, () => {}, () => {});
    expect(clone.bossSlowTurns).toBe(5);
    expect(messages.some((msg) => msg.includes("(5ターン)"))).toBe(true);
    expect(messages.some((msg) => msg.includes("(永続)"))).toBe(false);

    const dropMessages = [];
    monsterDrop(clone, dungeon, dropMessages, player);
    expect(dungeon.items.some((it) => it.name === "ボスの財宝")).toBe(true);
  });

  it("フロック系の魔法は祝福された杖扱いにならず、杖を振ったログを出さず威力倍率だけ反映する", () => {
    const gameSource = fs.readFileSync("Game.jsx", "utf8");
    expect(gameSource).not.toContain("|| !!m.flockEmpowered");
    expect(gameSource).toContain("const _isFlockSpellCaster =");

    const { dungeon, flock, player } = makeRevengeScene({ flockX: 8, flockY: 8, playerX: 11, playerY: 8 });
    const ally = { id: "ally", name: "通常敵", x: 10, y: 8, hp: 200, maxHp: 200, def: 0 };
    dungeon.monsters.push(ally);
    const messages = [];
    const rand = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // blMult=1（非祝福）でも flockMagicPowerMultiplier=2 により基礎15の2倍=30ダメージになり、移動封じは通常5ターン（祝福10ターンではない）
      applyWandEffect("ice_wand", "monster", ally, 1, 0, dungeon, player, messages, () => {}, () => {}, 1, null, 0, flock, null, false);
      expect(ally.hp).toBe(170);
      expect(ally.immobileTurns).toBe(5);
      expect(messages.some((msg) => msg.includes("杖を振った"))).toBe(false);

      // 眠りも祝福扱い（12ターン／強眠）にならない
      applyWandEffect("sleep", "player", player, 1, 0, dungeon, player, messages, () => {}, () => {}, 1, null, 0, flock, null, false);
      expect(player.sleepTurns).toBe(6);

      // 反射時（killerMon=null）でも spellPowerMultiplier=2 が維持され、雷ダメージが半減しない（20*2=40）
      const flockHpBefore = flock.hp;
      applyWandEffect("lightning", "monster", flock, 0, 0, dungeon, player, messages, () => {}, () => {}, 1, null, 0, null, null, false, player, null, 2);
      expect(flock.hp).toBe(flockHpBefore - 40);
    } finally {
      rand.mockRestore();
    }
  });
});
