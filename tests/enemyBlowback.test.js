import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monsterAI, MONS, makeMonsterFromBase, findRoom, resolveMonsterWandEffect, _resolveMonsterWandBolt } from "../monsters.js";
import { fireTrapPlayer } from "../traps.js";
import { takeDueActions } from "../actionClock.js";
import { inMagicSealRoom, runMineExplosion, itemDisplayName, killMonster } from "../items.js";
import { hasGravityPentacle, T } from "../utils.js";
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
  dungeon.map[5][12] = T.WALL;
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

describe("敵の吹き飛ばしの杖の撃破処理", () => {
  it("途中の敵を倒しても杖の使用者は1回だけレベルアップする", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 7, 5);
    victim.hp = 5;
    victim._phaseActionCount = 0;
    const player = makePlayer({ x: 10, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [mage, victim], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    const messages = [];
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, messages, "attackOnly");
    expect(dungeon.monsters).not.toContain(victim);
    expect(mage.monLevel).toBe(2);
    expect(messages.filter(message => message.includes("コボルドは") && message.includes("倒された"))).toHaveLength(1);
    expect(player.exp).toBe(0);
  });

  it.each(["wall", "player", "monster"])("%sの反射で射手が死んでも撃破処理を重ねない", reflection => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { hp: 5, aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const player = makePlayer({ x: 10, y: 5, depth: 1, exp: 0,
      magicReflectTurns: reflection === "player" ? 10 : 0 });
    const dungeon = makeEmptyDg({ monsters: [mage], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    dungeon.map[5][2] = T.WALL;
    if (reflection === "wall") dungeon.map[5][6] = T.WALL;
    if (reflection === "monster") dungeon.monsters.push({ id: "reflector", name: "反射役", hp: 100,
      maxHp: 100, x: 7, y: 5, subtype: "magicreflect", _phaseActionCount: 0 });
    const messages = [];
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, messages, "attackOnly");
    expect(dungeon.monsters).not.toContain(mage);
    expect(player.exp).toBe(65);
    expect(messages.filter(message => message.includes("ウィンドメイジを倒した"))).toHaveLength(1);
  });
});

describe("敵の吹き飛ばしの杖の防御と通常命中", () => {
  it.each([1, 3])("Lv%sの通常命中は壁まで移動して規定のダメージを受ける", level => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), level, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const player = makePlayer({ x: 8, y: 5, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [mage], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    dungeon.map[5][12] = T.WALL;
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, [], "attackOnly");
    expect([player.x, player.y]).toEqual([11, 5]);
    expect(player.hp).toBe(level === 3 ? 85 : 90);
  });

  it.each(["core", "gravity", "sanctuary", "seal", "barrier", "magicImmune"])("%sで防がれた時はプレイヤーを動かさない", defense => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1,
      _movesMadeThisPhase: 0, sealed: defense === "seal" });
    const player = makePlayer({ x: 8, y: 5, exp: 0,
      rings: defense === "core" ? [{ type: "ring", effect: "core_ring" }] : [] });
    const dungeon = makeEmptyDg({ monsters: [mage], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    if (defense === "gravity") dungeon.pentacles.push({ kind: "gravity", x: 8, y: 5 });
    if (defense === "sanctuary") dungeon.pentacles.push({ kind: "sanctuary", blessed: true, x: 8, y: 5 });
    const obstacle = { id: "obstacle", name: "防御役", hp: 100, maxHp: 100, x: 7, y: 5, _phaseActionCount: 0,
      barrier: defense === "barrier" ? 1 : 0, magicImmune: defense === "magicImmune" };
    if (["barrier", "magicImmune"].includes(defense)) dungeon.monsters.push(obstacle);
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, [], "attackOnly");
    expect([player.x, player.y]).toEqual([8, 5]);
    expect(player.hp).toBe(100);
    if (defense === "barrier") expect(obstacle.barrier).toBe(0);
  });
});
