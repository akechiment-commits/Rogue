import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monsterAI, MONS, makeMonsterFromBase, findRoom, resolveMonsterWandEffect, _resolveMonsterWandBolt } from "../monsters.js";
import { fireTrapPlayer } from "../traps.js";
import { takeDueActions } from "../actionClock.js";
import { inMagicSealRoom, runMineExplosion, itemDisplayName, killMonster } from "../items.js";
import { hasGravityPentacle } from "../utils.js";
import { interruptPlayerSleep } from "../turnUpkeep.js";
import { trackTrap } from "../DiscoveryTracker.js";
import { applyWandEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

// Game の敵行動コールバックと実際の敵AI・杖・罠処理を実行する。
// React・描画は省略し、階移動先だけを固定する。
function moveEnemiesFor(state) {
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const moveMons = useCallback(");
  const end = source.indexOf("  /* ポータルの魔方陣のプレイヤー転送ヘルパー", start);
  const destination = makeEmptyDg();
  const chgFloor = vi.fn(player => { player.depth++; player.x = 2; player.y = 2; return destination; });
  const deps = { sr: { current: state }, useCallback: fn => fn, monsterAI, fireTrapPlayer,
    runMineExplosion, takeDueActions, findRoom, inMagicSealRoom, applyWandEffect,
    resolveMonsterWandEffect, _resolveMonsterWandBolt, hasGravityPentacle,
    interruptPlayerSleep, itemDisplayName, killMonster, chgFloor, trackTrap,
    bbDisplayName: box => box.name, bigboxAddItem: () => {}, lu: () => {} };
  const moveMons = new Function(...Object.keys(deps), `${source.slice(start, end)}; return moveMons;`)(...Object.values(deps));
  return { moveMons, chgFloor, destination };
}

function scenario(effect, movingTrap = false) {
  vi.spyOn(Math, "random").mockReturnValue(0.1);
  const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
  Object.assign(mage, { aware: true, actionTime: 0, _phaseActionCount: 1,
    _movesMadeThisPhase: 0, turnAttacks: 0, alwaysUseSpecial: true });
  const player = makePlayer({ x: movingTrap ? 9 : 8, y: 5, depth: 1, exp: 0, actionTime: 12 });
  const trap = { id: "trap", name: effect === "explode" ? "地雷" : "落とし穴", effect,
    x: movingTrap ? 7 : 11, y: 5, revealed: true, permanent: !movingTrap };
  const dungeon = makeEmptyDg({ monsters: [mage], traps: [trap], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
  dungeon.map[5][12] = "#";
  const state = { player, dungeon, ident: new Set() };
  const messages = [];
  const callbacks = moveEnemiesFor(state);
  callbacks.moveMons(dungeon, player, messages, "attackOnly");
  expect(messages.some(message => message.includes("杖を振った"))).toBe(true);
  return { state, player, dungeon, messages, ...callbacks };
}

describe("敵が使う吹き飛ばしの杖と罠", () => {
  it.each([false, true])("落とし穴で階移動する（罠を飛ばす:%s）", movingTrap => {
    const { state, player, chgFloor, destination } = scenario("pitfall", movingTrap);
    expect(chgFloor).toHaveBeenCalledOnce();
    expect(player.depth).toBe(2);
    expect(state.dungeon).toBe(destination);
  });
  it.each([false, true])("地雷はその敵行動中に爆発する（罠を飛ばす:%s）", movingTrap => {
    const { player, dungeon, messages } = scenario("explode", movingTrap);
    expect(dungeon._pendingMineExplosion).toBeUndefined();
    expect(player.hp).toBe(movingTrap ? 50 : 45);
    expect(messages.filter(message => message === "地雷が発動！")).toHaveLength(1);
  });
});
