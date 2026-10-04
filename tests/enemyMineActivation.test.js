import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monsterAI, MONS, makeMonsterFromBase, findRoom } from "../monsters.js";
import { fireTrapPlayer } from "../traps.js";
import { takeDueActions } from "../actionClock.js";
import { inMagicSealRoom, runMineExplosion } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { resolveTurnHazards } from "../turnHazards.js";

afterEach(() => vi.restoreAllMocks());

// 本体の敵処理コールバックを実行する。React・描画・階移動は起動しない。
function moveEnemiesFor(state) {
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const moveMons = useCallback(");
  const end = source.indexOf("  /* ポータルの魔方陣のプレイヤー転送ヘルパー", start);
  const deps = { sr: { current: state }, useCallback: fn => fn, monsterAI, fireTrapPlayer,
    runMineExplosion, takeDueActions, findRoom, inMagicSealRoom, applyWandEffect,
    bigboxAddItem: () => {}, lu: () => {}, chgFloor: () => {} };
  return new Function(...Object.keys(deps), `${source.slice(start, end)}; return moveMons;`)(...Object.values(deps));
}

describe("敵の特技で地雷へ投げられた時の発動", () => {
  it.each(["attackOnly", "both"])("%sでも地雷はその場で爆発し、爆風内の別の敵が後から殴ることはない", phase => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const tiger = makeMonsterFromBase(MONS.find(mon => mon.name === "ゴールドタイガー"), 1, 5, 5);
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 8, 6);
    for (const monster of [tiger, victim]) {
      monster.aware = true;
      monster.actionTime = 0;
      monster._phaseActionCount = 1;
      monster._movesMadeThisPhase = 0;
      monster.turnAttacks = 0;
    }
    tiger.alwaysUseSpecial = true;
    const mine = { id: "mine", name: "地雷", effect: "explode", x: 8, y: 5, revealed: true, permanent: true };
    const dungeon = makeEmptyDg({ monsters: [tiger, victim], traps: [mine], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    const player = makePlayer({ x: 6, y: 5, depth: 1, exp: 0, actionTime: 12 });
    const state = { player, dungeon, ident: new Set() };
    const messages = [];
    const hazards = { hasRingEffect: () => false, runMineExplosion, fireTrapPlayer, tickTimedEffects: false };
    resolveTurnHazards(state, player, messages, hazards);
    moveEnemiesFor(state)(dungeon, player, messages, phase);
    expect(player.hp).toBe(50);
    expect(dungeon._pendingMineExplosion).toBeUndefined();
    expect(dungeon.monsters).not.toContain(victim);
    expect(messages.some(message => message.includes("コボルドの攻撃"))).toBe(false);
    expect(messages.filter(message => message === "地雷が発動！")).toHaveLength(1);
    resolveTurnHazards(state, player, messages, hazards);
    expect(player.hp).toBe(50);
    expect(messages.filter(message => message === "地雷が発動！")).toHaveLength(1);
  });
});
