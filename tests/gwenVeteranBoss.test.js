import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import { genDungeon } from "../dungeon.js";
import { GWEN_VETERAN_BOSS, makeMonsterFromBase, MONS, monsterAI, resolveMonsterWandEffect } from "../monsters.js";
import { legendMonsterAllowed } from "../legendMonsterRules.js";
import { TILE_NAMES, TILE_RENDER, customTileImages, drawTile } from "../render.js";
import { DAWNLIKE_FALLBACKS, MONSTER_SHEET_MAP } from "../tilesetMap.js";
import { MH, MW, T } from "../utils.js";
import { BOSS_UNIQUE_DROP_RULES } from "../bossDropRules.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const WAND_EFFECTS = ["slow_wand", "confuse_wand", "sleep_wand", "darkness_wand"];

function makeGwenScene({ x = 5, y = 5, playerX = 10, playerY = 5, visible = true } = {}) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
  const visibleMap = Array.from({ length: MH }, () => Array(MW).fill(visible));
  const gwen = makeMonsterFromBase(GWEN_VETERAN_BOSS, 1, x, y, { aware: true });
  const player = makePlayer({ x: playerX, y: playerY });
  const dungeon = makeEmptyDg({ map, visible: visibleMap, monsters: [gwen], dungeonType: "legend" });
  return { dungeon, gwen, player };
}

function actInTwoPhases(gwen, dungeon, player, messages, monsterWandFn) {
  gwen.turnAttacks = 0;
  monsterAI(gwen, dungeon, player, messages, { moveOnly: true, monsterWandFn });
  monsterAI(gwen, dungeon, player, messages, { attackOnly: true, monsterWandFn });
}

describe("超上級B20Fボス：勤勉で勇敢なグウェン", () => {
  it("legend B20Fだけに出現し、B5Fグウェンと他のダンジョンのボスを維持する", () => {
    const veteranFloor = genDungeon(19, "legend");
    const veteran = veteranFloor.monsters.find(monster => monster.isBoss);
    expect(veteran.baseKind).toBe("boss_gwen_veteran");
    expect(veteran.projectileAmmo).toMatchObject({ count: 12, pierce: true });
    expect(veteran.gwenWandCharges).toBe(6);
    expect(veteranFloor.monsters.filter(monster => monster.isBoss)).toHaveLength(1);
    expect(veteranFloor.monsters.filter(monster => monster !== veteran && monster.dormant)).toHaveLength(0);

    expect(genDungeon(4, "legend").monsters.find(monster => monster.isBoss).baseKind).toBe("boss_gwen");
    expect(genDungeon(19, "advanced").monsters.find(monster => monster.isBoss).baseKind).toBe("boss_kingbehinmos");
  });

  it("直線上では50%ずつ矢と杖を選び、使った在庫だけを1消費する", () => {
    const arrowScene = makeGwenScene();
    const arrowMessages = [];
    const arrowRandom = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      actInTwoPhases(arrowScene.gwen, arrowScene.dungeon, arrowScene.player, arrowMessages, vi.fn());
      expect(arrowScene.gwen.projectileAmmo.count).toBe(11);
      expect(arrowScene.gwen.gwenWandCharges).toBe(6);
      expect(arrowMessages.some(message => message.includes("貫きの矢を放った"))).toBe(true);
    } finally {
      arrowRandom.mockRestore();
    }

    const wandScene = makeGwenScene();
    const effects = [];
    const wandFn = vi.fn(monster => effects.push(resolveMonsterWandEffect(monster)));
    const wandRandom = vi.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      actInTwoPhases(wandScene.gwen, wandScene.dungeon, wandScene.player, [], wandFn);
      expect(wandScene.gwen.projectileAmmo.count).toBe(12);
      expect(wandScene.gwen.gwenWandCharges).toBe(5);
      expect(wandFn).toHaveBeenCalledTimes(1);
      expect(WAND_EFFECTS).toContain(effects[0]);
    } finally {
      wandRandom.mockRestore();
    }
  });

  it("片方の在庫が尽きたら残っている遠距離攻撃を使う", () => {
    const { dungeon, gwen, player } = makeGwenScene();
    gwen.projectileAmmo.count = 0;
    const wandFn = vi.fn();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      actInTwoPhases(gwen, dungeon, player, [], wandFn);
      expect(wandFn).toHaveBeenCalledTimes(1);
      expect(gwen.gwenWandCharges).toBe(5);
      expect(gwen.projectileAmmo.count).toBe(0);
    } finally {
      random.mockRestore();
    }
  });

  it("貫きの矢12本と状態杖6回を使い切る", () => {
    const arrowScene = makeGwenScene();
    arrowScene.gwen.gwenWandCharges = 0;
    const arrowMessages = [];
    const arrowRandom = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      for (let shot = 0; shot < 13; shot++) {
        actInTwoPhases(arrowScene.gwen, arrowScene.dungeon, arrowScene.player, arrowMessages, vi.fn());
      }
      expect(arrowScene.gwen.projectileAmmo.count).toBe(0);
      expect(arrowMessages.filter(message => message.includes("貫きの矢を放った"))).toHaveLength(12);
    } finally {
      arrowRandom.mockRestore();
    }

    const wandScene = makeGwenScene();
    wandScene.gwen.projectileAmmo.count = 0;
    const wandFn = vi.fn();
    const wandRandom = vi.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      for (let use = 0; use < 7; use++) {
        actInTwoPhases(wandScene.gwen, wandScene.dungeon, wandScene.player, [], wandFn);
      }
      expect(wandFn).toHaveBeenCalledTimes(6);
      expect(wandScene.gwen.gwenWandCharges).toBe(0);
      expect(wandScene.gwen.projectileAmmo.count).toBe(0);
    } finally {
      wandRandom.mockRestore();
    }
  });

  it("隣接時は20%で状態杖を使い、それ以外は通常攻撃する", () => {
    const wandScene = makeGwenScene({ playerX: 6 });
    const effects = [];
    const wandFn = vi.fn(monster => effects.push(resolveMonsterWandEffect(monster)));
    const wandRandom = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      actInTwoPhases(wandScene.gwen, wandScene.dungeon, wandScene.player, [], wandFn);
      expect(wandFn).toHaveBeenCalledTimes(1);
      expect(WAND_EFFECTS).toContain(effects[0]);
      expect(wandScene.gwen.gwenWandCharges).toBe(5);
    } finally {
      wandRandom.mockRestore();
    }

    const meleeScene = makeGwenScene({ playerX: 6 });
    const meleeWandFn = vi.fn();
    const meleeRandom = vi.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      actInTwoPhases(meleeScene.gwen, meleeScene.dungeon, meleeScene.player, [], meleeWandFn);
      expect(meleeWandFn).not.toHaveBeenCalled();
      expect(meleeScene.gwen.turnAttacks).toBe(1);
      expect(meleeScene.gwen.gwenWandCharges).toBe(6);
    } finally {
      meleeRandom.mockRestore();
    }
  });

  it("視界内4ターンごとにB20Fの通常候補を隣へ召喚する", () => {
    const { dungeon, gwen, player } = makeGwenScene({ x: 16, y: 10, playerX: 5, playerY: 5 });
    const messages = [];
    for (let turn = 0; turn < 4; turn++) {
      monsterAI(gwen, dungeon, player, messages, { moveOnly: true });
    }

    expect(dungeon.monsters).toHaveLength(2);
    const summoned = dungeon.monsters.find(monster => monster !== gwen);
    expect(legendMonsterAllowed(summoned.baseKind, 20)).toBe(true);
    expect(Math.max(Math.abs(summoned.x - gwen.x), Math.abs(summoned.y - gwen.y))).toBe(1);
    expect(messages.some(message => message.includes(`グウェンの隣に${summoned.name}が現れた`))).toBe(true);
  });

  it("全3スタイルとランダム食料ドロップを登録する", () => {
    expect(TILE_NAMES[256]).toBe("gwen_veteran");
    expect(TILE_RENDER[256]).toMatchObject({ ch: "G" });
    expect(MONSTER_SHEET_MAP[256]).toEqual([10, 4]);
    expect(DAWNLIKE_FALLBACKS[256]).toBeDefined();
    expect(BOSS_UNIQUE_DROP_RULES.boss_gwen_veteran).toMatchObject({ type: "food" });

    const sprite = fs.readFileSync("tiles/sprites/mon1/tile_256.png");
    expect(sprite.toString("ascii", 1, 4)).toBe("PNG");
    expect(sprite.readUInt32BE(16)).toBe(128);
    expect(sprite.readUInt32BE(20)).toBe(128);
    expect(MONS.some(monster => monster.baseKind === "boss_gwen_veteran")).toBe(false);
  });

  it("両方のスプライトを少し拡大し、輪郭をぼかさず描画する", () => {
    const previousImages = [customTileImages[255], customTileImages[256]];
    const drawCalls = [];
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (...args) => {
        expect(ctx.imageSmoothingEnabled).toBe(false);
        drawCalls.push(args);
      },
    };
    customTileImages[255] = { id: 255 };
    customTileImages[256] = { id: 256 };

    try {
      drawTile(ctx, null, 255, 10, 20, 32);
      drawTile(ctx, null, 256, 50, 20, 32);

      expect(drawCalls[0][1]).toBeCloseTo(6.8);
      expect(drawCalls[0][2]).toBeCloseTo(13.6);
      expect(drawCalls[0][3]).toBeCloseTo(38.4);
      expect(drawCalls[1][1]).toBeCloseTo(46.8);
      expect(drawCalls[1][2]).toBeCloseTo(13.6);
      expect(drawCalls[1][3]).toBeCloseTo(38.4);
      expect(ctx.imageSmoothingEnabled).toBe(true);
    } finally {
      if (previousImages[0]) customTileImages[255] = previousImages[0];
      else delete customTileImages[255];
      if (previousImages[1]) customTileImages[256] = previousImages[1];
      else delete customTileImages[256];
    }
  });
});
