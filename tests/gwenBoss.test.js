import { describe, expect, it } from "vitest";
import fs from "fs";
import { genDungeon } from "../dungeon.js";
import { GWEN_BOSS, makeMonsterFromBase, MONS, monsterAI } from "../monsters.js";
import { legendMonsterAllowed, legendMonsterSpawnLevel } from "../legendMonsterRules.js";
import { TILE_NAMES, TILE_RENDER } from "../render.js";
import { DAWNLIKE_FALLBACKS, MONSTER_SHEET_MAP } from "../tilesetMap.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeGwenScene({ x = 10, y = 10, playerX = 5, playerY = 5, visible = true } = {}) {
  const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));
  const visibleMap = Array.from({ length: 20 }, () => Array(30).fill(visible));
  const gwen = makeMonsterFromBase(GWEN_BOSS, 1, x, y, { aware: true });
  const player = makePlayer({ x: playerX, y: playerY });
  const dungeon = makeEmptyDg({ map, visible: visibleMap, monsters: [gwen], dungeonType: "legend" });
  return { dungeon, gwen, player };
}

describe("超上級B5Fボス：グウェン", () => {
  it("legendの5階だけグウェンへ差し替え、初期取り巻きを置かない", () => {
    const legend = genDungeon(4, "legend");
    const gwen = legend.monsters.find(monster => monster.isBoss);
    expect(gwen.baseKind).toBe("boss_gwen");
    expect(gwen.dormant).toBe(true);
    expect(legend.monsters.filter(monster => monster.isBoss)).toHaveLength(1);
    expect(legend.monsters.filter(monster => monster !== gwen && monster.dormant)).toHaveLength(0);

    expect(genDungeon(4, "beginner").monsters.find(monster => monster.isBoss).baseKind).toBe("boss_blaze");
    expect(genDungeon(4, "advanced").monsters.find(monster => monster.isBoss).baseKind).toBe("boss_batteringram");
  });

  it("プレイヤーへ近づくが、隣接しても攻撃しない", () => {
    const { dungeon, gwen, player } = makeGwenScene({ x: 6, y: 5, playerX: 5, playerY: 5 });
    const messages = [];
    const start = { x: gwen.x, y: gwen.y };

    monsterAI(gwen, dungeon, player, messages, {});
    expect(Math.max(Math.abs(gwen.x - player.x), Math.abs(gwen.y - player.y))).toBeLessThanOrEqual(
      Math.max(Math.abs(start.x - player.x), Math.abs(start.y - player.y)),
    );
    monsterAI(gwen, dungeon, player, messages, { attackOnly: true });

    expect(player.hp).toBe(100);
    expect(messages.some(message => message.includes("グウェンの攻撃"))).toBe(false);
  });

  it("倒された後は召喚しない", () => {
    const { dungeon, gwen, player } = makeGwenScene();
    gwen.hp = 0;
    for (let turn = 0; turn < 5; turn++) monsterAI(gwen, dungeon, player, [], { moveOnly: true });
    expect(dungeon.monsters).toHaveLength(1);
  });

  it("視界内4ターンごとにB5F候補を隣へ召喚し、視界外では時計を止める", () => {
    const { dungeon, gwen, player } = makeGwenScene({ visible: false });
    const messages = [];
    for (let turn = 0; turn < 5; turn++) monsterAI(gwen, dungeon, player, messages, { moveOnly: true });
    expect(dungeon.monsters).toHaveLength(1);
    expect(gwen.gwenVisibleTurns || 0).toBe(0);

    dungeon.visible = Array.from({ length: 20 }, () => Array(30).fill(true));
    for (let turn = 0; turn < 3; turn++) monsterAI(gwen, dungeon, player, messages, { moveOnly: true });
    expect(dungeon.monsters).toHaveLength(1);
    monsterAI(gwen, dungeon, player, messages, { moveOnly: true });

    expect(dungeon.monsters).toHaveLength(2);
    const summoned = dungeon.monsters.find(monster => monster !== gwen);
    expect(legendMonsterAllowed(summoned.baseKind, 5)).toBe(true);
    const base = MONS.find(monster => monster.baseKind === summoned.baseKind);
    expect(summoned.monLevel).toBe(legendMonsterSpawnLevel(base, 5));
    expect(Math.max(Math.abs(summoned.x - gwen.x), Math.abs(summoned.y - gwen.y))).toBe(1);
    expect(messages.some(message => message.includes(`グウェンの隣に${summoned.name}が現れた`))).toBe(true);
  });

  it("スタイル1・2・3のグラフィック登録がある", () => {
    expect(TILE_NAMES[255]).toBe("gwen");
    expect(TILE_RENDER[255]).toMatchObject({ ch: "G" });
    expect(MONSTER_SHEET_MAP[255]).toEqual([10, 6]);
    expect(DAWNLIKE_FALLBACKS[255]).toBeDefined();

    const spritePath = "tiles/sprites/mon1/tile_255.png";
    expect(fs.existsSync(spritePath)).toBe(true);
    expect(fs.statSync(spritePath).size).toBeGreaterThan(1000);
  });
});
