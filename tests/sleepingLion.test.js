import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { advancedMonsterSpawnLevel } from "../advancedMonsterRules.js";
import { legendMonsterSpawnLevel } from "../legendMonsterRules.js";
import { MONSTER_SHEET_MAP } from "../tilesetMap.js";
import { MW, MH, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const lionBase = MONS.find(monster => monster.baseKind === "sleepingLion");
const visibleMap = () => Array.from({ length: MH }, () => Array(MW).fill(true));

describe("眠れる獅子系", () => {
  it("2×2の3形態を持ち、生成時は指定に関係なく必ず眠る", () => {
    expect(lionBase.bodySize).toBe(2);
    expect(lionBase.levels.map(level => level.name)).toEqual(["眠れる大獅子", "眠れる赤獅子"]);
    expect(MONSTER_SHEET_MAP[231]).toEqual([6, 6]);
    for (const level of [1, 2, 3]) {
      const lion = makeMonsterFromBase(lionBase, level, 10, 10, { dormant: false });
      expect(lion.dormant).toBe(true);
      expect(lion._dormantHp).toBe(lion.hp);
      expect(lion.bodySize).toBe(2);
    }
  });

  it("視界に入っても起きず、2×2の体へ隣接すると起床してその場に留まる", () => {
    const lion = makeMonsterFromBase(lionBase, 1, 10, 10);
    const dungeon = makeEmptyDg({ monsters: [lion], visible: visibleMap(), rooms: [] });
    const player = makePlayer({ x: 20, y: 20 });
    const messages = [];

    monsterAI(lion, dungeon, player, messages, { moveOnly: true });
    expect(lion.dormant).toBe(true);
    expect([lion.x, lion.y]).toEqual([10, 10]);

    player.x = 9;
    player.y = 10;
    monsterAI(lion, dungeon, player, messages, { moveOnly: true });
    expect(lion.dormant).toBe(false);
    expect(lion.aware).toBe(true);
    expect([lion.x, lion.y]).toEqual([10, 10]);
    expect(messages.join(" ")).toContain("目を覚ました");
  });

  it("被ダメージでも覚醒する", () => {
    const lion = makeMonsterFromBase(lionBase, 1, 10, 10);
    const dungeon = makeEmptyDg({ monsters: [lion], visible: visibleMap(), rooms: [] });
    lion.hp -= 1;
    monsterAI(lion, dungeon, makePlayer({ x: 20, y: 20 }), [], { moveOnly: true });
    expect(lion.dormant).toBe(false);
    expect(lion.aware).toBe(true);
  });

  it("夢喰いが眠れる獅子を起こせる", () => {
    const eaterBase = MONS.find(monster => monster.baseKind === "dreamEater");
    const eater = makeMonsterFromBase(eaterBase, 1, 5, 8, { aware: true });
    const lion = makeMonsterFromBase(lionBase, 1, 8, 8);
    eater.hp = 10;
    const dungeon = makeEmptyDg({ monsters: [eater, lion], rooms: [] });

    monsterAI(eater, dungeon, makePlayer({ x: 20, y: 20 }), [], { attackOnly: true });
    expect(lion.dormant).toBe(false);
    expect(lion.aware).toBe(true);
    expect(lion._justWoke).toBeUndefined();
  });

  it("覚醒後はキングベヒんもスと同じメテオを詠唱する", () => {
    const lion = makeMonsterFromBase(lionBase, 1, 12, 10, { aware: true });
    lion.dormant = false;
    const dungeon = makeEmptyDg({ monsters: [lion], visible: visibleMap(), rooms: [] });
    const player = makePlayer({ x: 4, y: 10 });
    const messages = [];

    monsterAI(lion, dungeon, player, messages, { attackOnly: true });
    expect(dungeon.pendingMeteors).toHaveLength(1);
    expect(dungeon.pendingMeteors[0]).toMatchObject({ x: 4, y: 10, turnsLeft: 2, damage: 100 });
    expect(lion.meteorImmune).toBe(true);
  });

  it("同室で壁に隣接していても認識を保ち、壁越しにはメテオを詠唱しない", () => {
    const lion = makeMonsterFromBase(lionBase, 1, 12, 10, { aware: true });
    lion.dormant = false;
    const rooms = [{ x: 4, y: 5, w: 14, h: 10 }];
    const dungeon = makeEmptyDg({ monsters: [lion], visible: visibleMap(), rooms });
    dungeon.map[11][12] = T.WALL;
    dungeon.map[11][13] = T.WALL;
    const player = makePlayer({ x: 12, y: 12 });

    monsterAI(lion, dungeon, player, [], { attackOnly: true });
    expect(lion.aware).toBe(true);
    expect(dungeon.pendingMeteors || []).toHaveLength(0);
    expect(player.hp).toBe(player.maxHp);
  });

  it("中級・上級・超上級で形態の出現帯を分ける", () => {
    expect(lionBase.dungeonFloors.intermediate).toEqual({ min: 18, max: 20 });
    expect(advancedMonsterSpawnLevel(lionBase, 24)).toBe(1);
    expect(advancedMonsterSpawnLevel(lionBase, 25)).toBe(2);
    expect(advancedMonsterSpawnLevel(lionBase, 28)).toBe(2);
    expect(legendMonsterSpawnLevel(lionBase, 30)).toBe(1);
    expect(legendMonsterSpawnLevel(lionBase, 37)).toBe(2);
    expect(legendMonsterSpawnLevel(lionBase, 46)).toBe(3);
  });
});
