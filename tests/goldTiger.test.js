import { describe, expect, it } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeVisible() {
  return Array.from({ length: 30 }, () => Array(60).fill(true));
}

describe("ゴールドタイガー", () => {
  it("隣接時に発見済みの罠へプレイヤーを投げ、罠を即時発動する", () => {
    const base = MONS.find((monster) => monster.name === "ゴールドタイガー");
    const tiger = makeMonsterFromBase(base, 1, 5, 5);
    tiger.aware = true;
    tiger.turnAttacks = 0;
    tiger.alwaysUseSpecial = true;
    const trap = { id: "pit", name: "転倒の罠", effect: "trip_trap", x: 8, y: 5, revealed: true, permanent: true };
    const player = makePlayer({ x: 6, y: 5, depth: 8 });
    const dg = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 20, h: 10 }], monsters: [tiger], traps: [trap], visible: makeVisible() });
    const messages = [];
    const fireTrapFn = (target, p, dungeon, log) => fireTrapPlayer(target, p, dungeon, log);

    monsterAI(tiger, dg, player, messages, { moveOnly: true, fireTrapFn });
    monsterAI(tiger, dg, player, messages, { attackOnly: true, fireTrapFn });

    expect(player.x).toBe(trap.x);
    expect(player.y).toBe(trap.y);
    expect(trap.revealed).toBe(true);
    expect(messages.some((message) => message.includes("ゴールドタイガー") && message.includes("放り投げた"))).toBe(true);
    expect(messages.some((message) => message.includes("転倒の罠が発動"))).toBe(true);
  });

  it("発見していない罠は対象にしない", () => {
    const base = MONS.find((monster) => monster.name === "ゴールドタイガー");
    const tiger = makeMonsterFromBase(base, 1, 5, 5);
    tiger.aware = true;
    tiger.turnAttacks = 0;
    tiger.alwaysUseSpecial = true;
    const trap = { id: "hidden-pit", name: "転倒の罠", effect: "trip_trap", x: 8, y: 5, revealed: false, permanent: true };
    const player = makePlayer({ x: 6, y: 5, depth: 8 });
    const dg = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 20, h: 10 }], monsters: [tiger], traps: [trap], visible: makeVisible() });
    const messages = [];
    const fireTrapFn = (target, p, dungeon, log) => fireTrapPlayer(target, p, dungeon, log);

    monsterAI(tiger, dg, player, messages, { moveOnly: true, fireTrapFn });
    monsterAI(tiger, dg, player, messages, { attackOnly: true, fireTrapFn });

    expect(player.x).toBe(6);
    expect(player.y).toBe(5);
    expect(trap.revealed).toBe(false);
    expect(messages.some((message) => message.includes("放り投げた"))).toBe(false);
  });
});
