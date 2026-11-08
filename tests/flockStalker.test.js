import { describe, expect, it, vi } from "vitest";
import {
  FLOCK_STALKER_BOSS,
  FLOCK_STALKER_SPAWN_LINES,
  FLOCK_STALKER_PURSUIT_LINES,
  FLOCK_STALKER_CHASE_LINES,
  FLOCK_STALKER_ANTI_STEAL_LINES,
  FLOCK_STALKER_STEAL_SUCCESS_LINES,
  FLOCK_STALKER_PICKUP_FLOOR_LINES,
  FLOCK_STALKER_HURT_LINES,
  FLOCK_STALKER_CRITICAL_LINES,
  FLOCK_STALKER_DEATH_LINES,
  makeMonsterFromBase,
  monsterAI,
} from "../monsters.js";
import { killMonster } from "../items.js";
import { purgeFlockBosses } from "../dungeon.js";
import { MH, MW, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeStalkerScene({ flockX = 5, flockY = 5, playerX = 6, playerY = 5 } = {}) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  const stalker = makeMonsterFromBase(FLOCK_STALKER_BOSS, 1, flockX, flockY, { aware: true, dormant: false });
  const player = makePlayer({ x: playerX, y: playerY });
  const dungeon = makeEmptyDg({ map, visible, monsters: [stalker], dungeonType: "legend" });
  return { dungeon, stalker, player };
}

describe("超上級帰り道の追跡ボス：執念のフロック", () => {
  it("40階ボス相当の能力値と2倍速1回行動を持つ", () => {
    expect(FLOCK_STALKER_BOSS.baseKind).toBe("boss_flock_stalker");
    expect(FLOCK_STALKER_BOSS.hp).toBe(2000);
    expect(FLOCK_STALKER_BOSS.atk).toBe(145);
    expect(FLOCK_STALKER_BOSS.def).toBe(29);
    expect(FLOCK_STALKER_BOSS.exp).toBe(52000);
    expect(FLOCK_STALKER_BOSS.speed).toBe(2);
    expect(FLOCK_STALKER_BOSS.maxAttacks).toBe(1);
    expect(FLOCK_STALKER_BOSS.tile).toBe(258);
  });

  it("隣接時に深淵の禁書を盗み、テレポートで逃走する", () => {
    const { dungeon, stalker, player } = makeStalkerScene({ flockX: 5, flockY: 5, playerX: 6, playerY: 5 });
    const book = { id: "abyss_tome_1", name: "深淵の禁書", type: "goal" };
    player.inventory = [book];

    const messages = [];
    const monsterWandFn = vi.fn();
    monsterAI(stalker, dungeon, player, messages, { monsterWandFn });

    expect(player.inventory.some(i => i.name === "深淵の禁書")).toBe(false);
    expect(stalker.stolenGoalItem).toEqual(book);
    expect(stalker._hasStolenBook).toBe(true);
    expect(messages.some(m => m.includes("深淵の禁書") && m.includes("奪い去った"))).toBe(true);
    expect(messages.some(m => FLOCK_STALKER_STEAL_SUCCESS_LINES.some(l => m.includes(l)))).toBe(true);
    // テレポートして隣接マスから移動している
    expect(Math.max(Math.abs(stalker.x - player.x), Math.abs(stalker.y - player.y))).toBeGreaterThan(1);
  });

  it("護盗の鎧を装備している場合は盗みを防げる", () => {
    const { dungeon, stalker, player } = makeStalkerScene({ flockX: 5, flockY: 5, playerX: 6, playerY: 5 });
    const book = { id: "abyss_tome_1", name: "深淵の禁書", type: "goal" };
    player.inventory = [book];
    player.armor = { name: "護盗の鎧", ability: "anti_steal" };

    const messages = [];
    const monsterWandFn = vi.fn();
    monsterAI(stalker, dungeon, player, messages, { monsterWandFn });

    expect(player.inventory.some(i => i.name === "深淵の禁書")).toBe(true);
    expect(stalker._hasStolenBook).toBeFalsy();
    expect(messages.some(m => m.includes("護盗の鎧が執念のフロックの盗みを防いだ！"))).toBe(true);
    expect(messages.some(m => FLOCK_STALKER_ANTI_STEAL_LINES.some(l => m.includes(l)))).toBe(true);
  });

  it("床に深淵の禁書がある場合は拾ってテレポート逃走する", () => {
    const { dungeon, stalker, player } = makeStalkerScene({ flockX: 5, flockY: 5, playerX: 20, playerY: 20 });
    const book = { id: "floor_tome", name: "深淵の禁書", type: "goal", x: 6, y: 5 };
    dungeon.items = [book];

    const messages = [];
    const monsterWandFn = vi.fn();
    monsterAI(stalker, dungeon, player, messages, { monsterWandFn });

    expect(dungeon.items.some(i => i.name === "深淵の禁書")).toBe(false);
    expect(stalker.stolenGoalItem).toEqual(book);
    expect(stalker._hasStolenBook).toBe(true);
    expect(messages.some(m => m.includes("深淵の禁書") && m.includes("素早く拾い上げた"))).toBe(true);
    expect(messages.some(m => FLOCK_STALKER_PICKUP_FLOOR_LINES.some(l => m.includes(l)))).toBe(true);
  });

  it("盗んだ後は3マス開けて隣接時テレポートするAIに戻る", () => {
    const { dungeon, stalker, player } = makeStalkerScene({ flockX: 5, flockY: 5, playerX: 6, playerY: 5 });
    stalker._hasStolenBook = true;
    stalker.stolenGoalItem = { name: "深淵の禁書", type: "goal" };

    const messages = [];
    const monsterWandFn = vi.fn();
    // 隣接時はテレポートして距離をとる
    monsterAI(stalker, dungeon, player, messages, { monsterWandFn });

    expect(Math.max(Math.abs(stalker.x - player.x), Math.abs(stalker.y - player.y))).toBeGreaterThan(1);
    expect(messages.some(m => m.includes("紫の閃光とともに消えた"))).toBe(true);
  });

  it("撃破時に盗まれた深淵の禁書を取り落とし、討伐フラグが記録される", () => {
    const { dungeon, stalker, player } = makeStalkerScene({ flockX: 5, flockY: 5, playerX: 6, playerY: 5 });
    const book = { id: "abyss_tome_1", name: "深淵の禁書", type: "goal" };
    stalker.stolenGoalItem = book;
    stalker._hasStolenBook = true;

    const messages = [];
    killMonster(stalker, dungeon, player, messages, () => {});

    expect(dungeon.items.some(i => i.name === "深淵の禁書" && i.x === 5 && i.y === 5)).toBe(true);
    expect(player.flockStalkerKilled).toBe(true);
    expect(messages.some(m => m.includes("執念のフロックは奪った【深淵の禁書】を取り落とした！"))).toBe(true);
    expect(messages.some(m => FLOCK_STALKER_DEATH_LINES.some(l => m.includes(l)))).toBe(true);
  });

  it("プレイヤーが深淵の禁書を取得した時点で10Fおよび25Fのフロックが消滅する", () => {
    const floor10 = {
      monsters: [
        { id: "m1", name: "通常敵", baseKind: "zombie" },
        { id: "flock10", name: "フロック", baseKind: "boss_flock" },
      ],
    };
    const floor25 = {
      monsters: [
        { id: "m2", name: "通常敵", baseKind: "skeleton" },
        { id: "flock25", name: "逆襲のフロック", baseKind: "boss_flock_revenge" },
      ],
    };
    const state = {
      floors: {
        10: floor10,
        25: floor25,
      },
      dungeon: {
        monsters: [{ id: "m3", baseKind: "goblin" }],
      },
    };

    purgeFlockBosses(state);

    expect(state._abyssTomeAcquired).toBe(true);
    expect(floor10.monsters.some(m => m.baseKind === "boss_flock")).toBe(false);
    expect(floor10.monsters.some(m => m.baseKind === "zombie")).toBe(true);
    expect(floor25.monsters.some(m => m.baseKind === "boss_flock_revenge")).toBe(false);
    expect(floor25.monsters.some(m => m.baseKind === "skeleton")).toBe(true);
  });

  it("セリフに直接的な階層数（40階など）が含まれず、死亡時は精魂尽き果てたセリフになる", () => {
    const allStalkerLines = [
      ...FLOCK_STALKER_SPAWN_LINES,
      ...FLOCK_STALKER_PURSUIT_LINES,
      ...FLOCK_STALKER_CHASE_LINES,
      ...FLOCK_STALKER_ANTI_STEAL_LINES,
      ...FLOCK_STALKER_STEAL_SUCCESS_LINES,
      ...FLOCK_STALKER_PICKUP_FLOOR_LINES,
      ...FLOCK_STALKER_HURT_LINES,
      ...FLOCK_STALKER_CRITICAL_LINES,
      ...FLOCK_STALKER_DEATH_LINES,
    ];
    for (const line of allStalkerLines) {
      expect(line).not.toContain("40階");
    }
    // 死亡時は精魂尽き果てたセリフであること
    for (const line of FLOCK_STALKER_DEATH_LINES) {
      expect(
        line.includes("燃え尽き") ||
        line.includes("指一本") ||
        line.includes("もう無理") ||
        line.includes("精魂尽き果て") ||
        line.includes("おしまい")
      ).toBe(true);
    }
  });
});
