import { describe, expect, it } from "vitest";
import { applyPotionEffect } from "../items.js";
import { drawMonsterOverlays } from "../useGameRenderer.js";

describe("鈍足の薬の敵アイコン", () => {
  it("baseSpeedがない保存済みの敵にも鈍足アイコンを表示する", () => {
    const monster = { id: "legacy-slow", name: "ゴブリン", x: 5, y: 5, speed: 1, hp: 20, maxHp: 20 };
    const messages = [];
    const dungeon = { rooms: [], monsters: [monster], pentacles: [] };
    applyPotionEffect("slow", 0, "monster", monster, dungeon, {}, messages, () => {});

    expect(monster.baseSpeed).toBe(1);
    expect(monster.speed).toBe(0.5);
    expect(messages.some((message) => message.includes("鈍足になった"))).toBe(true);

    const fills = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, closePath() {}, arc() {}, stroke() {}, fill() {},
      moveTo() {}, lineTo() {}, strokeRect() {}, fillText() {}, strokeText() {},
      fillRect() { fills.push(this.fillStyle); },
      fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, globalAlpha: 1,
    };
    drawMonsterOverlays(ctx, monster, 0, 0, 32);
    expect(fills).toContain("#20b8a0");
  });
});
