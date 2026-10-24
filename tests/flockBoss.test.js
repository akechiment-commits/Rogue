import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import { genDungeon } from "../dungeon.js";
import { FLOCK_BOSS, makeMonsterFromBase, monsterAI, _resolveMonsterWandBolt } from "../monsters.js";
import { BOSS_UNIQUE_DROP_RULES } from "../bossDropRules.js";
import { TILE_NAMES, TILE_RENDER, customTileImages, drawTile } from "../render.js";
import { DAWNLIKE_FALLBACKS, MONSTER_SHEET_MAP } from "../tilesetMap.js";
import { drainAnims } from "../animEvents.js";
import { MH, MW, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const FLOCK_SPELLS = ["fire_bolt", "ice_wand", "poison_bolt", "curse_wand"];

function makeFlockScene({ flockX = 8, flockY = 8, playerX = 11, playerY = 8 } = {}) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  const flock = makeMonsterFromBase(FLOCK_BOSS, 1, flockX, flockY, { aware: true });
  const player = makePlayer({ x: playerX, y: playerY });
  const dungeon = makeEmptyDg({ map, visible, monsters: [flock], dungeonType: "legend" });
  return { dungeon, flock, player };
}

describe("超上級B10Fボス：フロック", () => {
  it("超上級B10Fだけに登場し、他ダンジョンのB10Fボスを維持する", () => {
    const legendFloor = genDungeon(9, "legend");
    const flock = legendFloor.monsters.find(monster => monster.isBoss);
    expect(flock.baseKind).toBe("boss_flock");
    expect(flock.dormant).toBe(true);
    expect(flock.float).toBe(true);
    expect(legendFloor.monsters.filter(monster => monster !== flock && monster.dormant)).toHaveLength(0);

    expect(genDungeon(9, "advanced").monsters.find(monster => monster.isBoss).baseKind).toBe("boss_taisaijin");
  });

  it.each(FLOCK_SPELLS.map((spell, index) => [spell, (index + 0.1) / FLOCK_SPELLS.length]))(
    "直線上3マスの距離では厨二病の詠唱で%sを選ぶ",
    (expectedSpell, randomValue) => {
      const { dungeon, flock, player } = makeFlockScene();
      const effects = [];
      const messages = [];
      const monsterWandFn = vi.fn(monster => effects.push(monster.wandEffect));
      const random = vi.spyOn(Math, "random").mockReturnValue(randomValue);
      try {
        monsterAI(flock, dungeon, player, messages, { moveOnly: true, monsterWandFn });
        expect(effects).toHaveLength(0);
        monsterAI(flock, dungeon, player, messages, { attackOnly: true, monsterWandFn });

        expect(effects).toEqual([expectedSpell]);
        expect(flock.turnAttacks).toBe(1);
        expect(messages.some(message => message.includes("フロックは「") && message.includes("と唱えた！"))).toBe(true);
        expect(flockDistance(flock, player)).toBe(3);
      } finally {
        random.mockRestore();
      }
    },
  );

  it("4マス離れた直線上でも唱え、プレイヤーに近づかない", () => {
    const { dungeon, flock, player } = makeFlockScene({ playerX: 12 });
    const effects = [];
    const monsterWandFn = vi.fn(monster => effects.push(monster.wandEffect));
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      monsterAI(flock, dungeon, player, [], { moveOnly: true, monsterWandFn });
      monsterAI(flock, dungeon, player, [], { attackOnly: true, monsterWandFn });
      expect(flockDistance(flock, player)).toBe(4);
      expect(flock.x).toBe(8);
      expect(effects).toHaveLength(1);
    } finally {
      random.mockRestore();
    }
  });

  it("3マスより近づかず、近接されたらテレポートで4マス以上離れる", () => {
    const retreat = makeFlockScene({ playerX: 10 });
    monsterAI(retreat.flock, retreat.dungeon, retreat.player, [], {
      moveOnly: true, monsterWandFn: vi.fn(),
    });
    expect(flockDistance(retreat.flock, retreat.player)).toBe(3);

    const escape = makeFlockScene({ playerX: 9 });
    const messages = [];
    const monsterWandFn = vi.fn();
    const before = { x: escape.flock.x, y: escape.flock.y };
    monsterAI(escape.flock, escape.dungeon, escape.player, messages, { moveOnly: true, monsterWandFn });
    expect(flockDistance(escape.flock, escape.player)).toBeGreaterThanOrEqual(4);
    expect(escape.flock.x !== before.x || escape.flock.y !== before.y).toBe(true);
    monsterAI(escape.flock, escape.dungeon, escape.player, messages, { attackOnly: true, monsterWandFn });
    expect(monsterWandFn).not.toHaveBeenCalled();
    expect(messages.some(message => message.includes("近い近い") && message.includes("紫電転移"))).toBe(true);
  });

  it("距離調整の経路探索では壁を通らず、魔法外の台詞もランダムに話す", () => {
    const chatter = makeFlockScene({ playerX: 10, playerY: 9 });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      monsterAI(chatter.flock, chatter.dungeon, chatter.player, chatter.dungeon.messages ||= [], {
        moveOnly: true, monsterWandFn: vi.fn(),
      });
      expect(chatter.dungeon.monsters[0].hp).toBe(FLOCK_BOSS.hp);
      expect(chatter.dungeon.messages.some(message => message.startsWith("フロック「"))).toBe(true);
    } finally {
      random.mockRestore();
    }

    const boxed = makeFlockScene({ flockX: 8, flockY: 10, playerX: 10, playerY: 10 });
    boxed.dungeon.map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
    for (const [x, y] of [[8, 10], [9, 10], [10, 10], [10, 9], [10, 8], [10, 7]]) {
      boxed.dungeon.map[y][x] = T.FLOOR;
    }
    monsterAI(boxed.flock, boxed.dungeon, boxed.player, [], { moveOnly: true, monsterWandFn: vi.fn() });
    expect(boxed.dungeon.map[boxed.flock.y]?.[boxed.flock.x]).toBe(T.FLOOR);
    expect({ x: boxed.flock.x, y: boxed.flock.y }).toEqual({ x: 8, y: 10 });
  });

  it("炎の魔法弾は命中した位置を着弾点として返す", () => {
    const { dungeon, flock, player } = makeFlockScene();
    const impacts = [];
    drainAnims();
    try {
      _resolveMonsterWandBolt(flock, dungeon, player, [], {
        dx: 1, dy: 0, range: 10, wandLabel: "炎の魔法", ignoreStatusProtection: true,
        onImpact: (kind, target, x, y) => impacts.push({ kind, target, x, y }),
      });
      expect(impacts).toEqual([{ kind: "player", target: player, x: player.x, y: player.y }]);
    } finally {
      drainAnims();
    }
  });

  it("眼帯スプライトと3スタイル、杖カテゴリの報酬を登録する", () => {
    expect(TILE_NAMES[257]).toBe("flock");
    expect(TILE_RENDER[257]).toMatchObject({ ch: "F" });
    expect(MONSTER_SHEET_MAP[257]).toEqual([10, 6]);
    expect(DAWNLIKE_FALLBACKS[257]).toBeDefined();
    expect(BOSS_UNIQUE_DROP_RULES.boss_flock).toMatchObject({ type: "wand" });

    const sprite = fs.readFileSync("tiles/sprites/mon1/tile_257.png");
    expect(sprite.toString("ascii", 1, 4)).toBe("PNG");
    expect(sprite.readUInt32BE(16)).toBe(128);
    expect(sprite.readUInt32BE(20)).toBe(128);
  });

  it("眼帯画像は輪郭をぼかさずタイルに描画する", () => {
    const previous = customTileImages[257];
    const drawArgs = [];
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (...args) => {
        expect(ctx.imageSmoothingEnabled).toBe(false);
        drawArgs.push(args);
      },
    };
    customTileImages[257] = { id: 257 };
    try {
      drawTile(ctx, null, 257, 4, 5, 32);
      expect(drawArgs[0].slice(1)).toEqual([4, 5, 32, 32]);
      expect(ctx.imageSmoothingEnabled).toBe(true);
    } finally {
      if (previous) customTileImages[257] = previous;
      else delete customTileImages[257];
    }
  });
});

function flockDistance(flock, player) {
  return Math.max(Math.abs(flock.x - player.x), Math.abs(flock.y - player.y));
}
