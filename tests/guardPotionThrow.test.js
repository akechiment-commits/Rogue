import { describe, it, expect } from "vitest";
import { monsterAI } from "../monsters.js";
import { drainAnims } from "../animEvents.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function makeGuard() {
  return {
    id: "guard-potion-test",
    name: "警備員",
    type: "guard",
    x: 2,
    y: 5,
    hp: 200,
    maxHp: 200,
    atk: 20,
    def: 10,
    speed: 1,
    turnAttacks: 0,
    aware: true,
    alwaysUseSpecial: true,
  };
}

function throwGuardPotion(guard, dg, player, messages) {
  monsterAI(guard, dg, player, messages, { moveOnly: true });
  expect(guard._rangedAttackThisTurn).toBe(true);
  monsterAI(guard, dg, player, messages, { attackOnly: true });
}

describe("警備員の暗闇薬投げ", () => {
  it("壁で止まり、壁の向こうのプレイヤーには届かない", () => {
    const guard = makeGuard();
    const player = makePlayer({ x: 8, y: 5 });
    const dg = makeEmptyDg({ monsters: [guard], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    dg.map[5][5] = T.WALL;
    const messages = [];

    throwGuardPotion(guard, dg, player, messages);

    expect(player.darknessTurns || 0).toBe(0);
    expect(messages).toContain("警備員が暗闇の薬を投げた！");
  });

  it("かわしモグラは直撃を避け、薬瓶はプレイヤーまで飛び続ける", () => {
    drainAnims();
    const guard = makeGuard();
    const mole = { id: "dodgemole", name: "かわしモグラ", baseKind: "dodgemole", x: 4, y: 5, hp: 40, maxHp: 40, def: 0 };
    const player = makePlayer({ x: 8, y: 5 });
    const dg = makeEmptyDg({ monsters: [guard, mole], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    const messages = [];

    throwGuardPotion(guard, dg, player, messages);

    expect(player.darknessTurns).toBeGreaterThan(0);
    expect(mole.hp).toBe(40);
    expect(messages.some(message => message.includes("かわしモグラが潜って暗闇の薬をかわした"))).toBe(true);
    const projectile = drainAnims().find(event => event.type === "monProjectile");
    expect(projectile?.path.some(point => point.x === mole.x && point.y === mole.y)).toBe(true);
    expect(projectile?.path.some(point => point.x === player.x && point.y === player.y)).toBe(true);
  });
});
