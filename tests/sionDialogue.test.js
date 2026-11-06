import { describe, expect, it, vi } from "vitest";
import {
  BOSSES,
  makeMonsterFromBase,
  monsterAI,
  SION_IDLE_LINES,
  SION_FIRE_LINES,
  SION_GOAL_THEFT_LINES,
  SION_GOAL_THEFT_FIRE_LINES,
  SION_HURT_LINES,
  SION_CRITICAL_LINES,
  SION_DEATH_LINES,
  isIgnoringBossForGoalItem,
} from "../monsters.js";
import { killMonster } from "../items.js";
import { MH, MW, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeSionScene({ sionX = 5, sionY = 5, playerX = 5, playerY = 9 } = {}) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  const sionBase = BOSSES.find(b => b.baseKind === "boss_darkbullet");
  const sion = makeMonsterFromBase(sionBase, 1, sionX, sionY, { aware: true });
  const player = makePlayer({ x: playerX, y: playerY });
  const dungeon = makeEmptyDg({ map, visible, monsters: [sion], dungeonType: "beginner" });
  return { dungeon, sion, player };
}

describe("シオン・ザ・ダークブレットのセリフ仕様", () => {
  it("通常行動時に厨二病的なセリフを話す", () => {
    const { dungeon, sion, player } = makeSionScene({ sionX: 5, sionY: 5, playerX: 7, playerY: 6 });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);
    try {
      monsterAI(sion, dungeon, player, messages, {});
      const idleLine = messages.find(m => SION_IDLE_LINES.some(quote => m.includes(quote)));
      expect(idleLine).toBeDefined();
      expect(idleLine).toContain(`${sion.name}「`);
    } finally {
      random.mockRestore();
    }
  });

  it("銃撃時に専用の厨二病セリフを話す", () => {
    // 距離4の一直線上
    const { dungeon, sion, player } = makeSionScene({ sionX: 5, sionY: 5, playerX: 5, playerY: 9 });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);
    try {
      monsterAI(sion, dungeon, player, messages, {});
      const fireLine = messages.find(m => SION_FIRE_LINES.some(quote => m.includes(quote)));
      expect(fireLine).toBeDefined();
      expect(fireLine).toContain(`${sion.name}「`);
    } finally {
      random.mockRestore();
    }
  });

  it("プレイヤーがキーアイテムを所持していると、持ち去りを咎めるセリフに変化する", () => {
    const { dungeon, sion, player } = makeSionScene({ sionX: 5, sionY: 5, playerX: 7, playerY: 6 });
    player.inventory = [{ id: "goal_gem", name: "輝く宝玉", type: "goal" }];
    expect(isIgnoringBossForGoalItem(dungeon, player)).toBe(true);

    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);
    try {
      monsterAI(sion, dungeon, player, messages, {});
      const theftLine = messages.find(m => SION_GOAL_THEFT_LINES.some(quote => m.includes(quote)));
      expect(theftLine).toBeDefined();
      expect(theftLine).toContain(`${sion.name}「`);
      // 通常の厨二病セリフは流れない
      expect(messages.some(m => SION_IDLE_LINES.some(quote => m.includes(quote)))).toBe(false);
    } finally {
      random.mockRestore();
    }
  });

  it("床のキーアイテムの近くにプレイヤーがいる時も咎めるセリフに変化する", () => {
    // 射線が通らない（一直線上にない）位置
    const { dungeon, sion, player } = makeSionScene({ sionX: 5, sionY: 5, playerX: 8, playerY: 7 });
    dungeon.items = [{ id: "floor_goal", name: "輝く宝玉", type: "goal", x: 8, y: 7 }];
    expect(isIgnoringBossForGoalItem(dungeon, player)).toBe(true);

    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);
    try {
      monsterAI(sion, dungeon, player, messages, {});
      const theftLine = messages.find(m => SION_GOAL_THEFT_LINES.some(quote => m.includes(quote)));
      expect(theftLine).toBeDefined();
      expect(theftLine).toContain(`${sion.name}「`);
    } finally {
      random.mockRestore();
    }
  });

  it("キーアイテム持ち去り中の銃撃では咎める銃撃セリフを放つ", () => {
    const { dungeon, sion, player } = makeSionScene({ sionX: 5, sionY: 5, playerX: 5, playerY: 9 });
    player.inventory = [{ id: "goal_gem", name: "輝く宝玉", type: "goal" }];

    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);
    try {
      monsterAI(sion, dungeon, player, messages, {});
      const theftFireLine = messages.find(m => SION_GOAL_THEFT_FIRE_LINES.some(quote => m.includes(quote)));
      expect(theftFireLine).toBeDefined();
      expect(theftFireLine).toContain(`${sion.name}「`);
    } finally {
      random.mockRestore();
    }
  });

  it("被弾時および瀕死時に専用セリフを話す", () => {
    const { dungeon, sion, player } = makeSionScene({ sionX: 5, sionY: 5, playerX: 7, playerY: 7 });
    sion._sionHpDialogueSnapshot = 300;
    sion.hp = 250;
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);
    try {
      monsterAI(sion, dungeon, player, messages, {});
      const hurtLine = messages.find(m => SION_HURT_LINES.some(quote => m.includes(quote)));
      expect(hurtLine).toBeDefined();
    } finally {
      random.mockRestore();
    }

    // 瀕死時 (HP <= 75)
    sion._sionHpDialogueSnapshot = 100;
    sion.hp = 50;
    const critMessages = [];
    const randomCrit = vi.spyOn(Math, "random").mockReturnValue(0.01);
    try {
      monsterAI(sion, dungeon, player, critMessages, {});
      const critLine = critMessages.find(m => SION_CRITICAL_LINES.some(quote => m.includes(quote)));
      expect(critLine).toBeDefined();
    } finally {
      randomCrit.mockRestore();
    }
  });

  it("撃破時に通常セリフ形式で死亡時セリフを話す", () => {
    const { dungeon, sion, player } = makeSionScene();
    sion.hp = 0;
    const messages = [];
    killMonster(sion, dungeon, player, messages, () => {}, true);
    const deathLine = messages.find(m => SION_DEATH_LINES.some(quote => m.includes(quote)));
    expect(deathLine).toBeDefined();
    expect(deathLine).toContain(`${sion.name}「`);
    expect(messages.some(m => m.includes("と言い残した！"))).toBe(false);
  });
});
