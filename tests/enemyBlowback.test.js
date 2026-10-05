import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monsterAI, MONS, makeMonsterFromBase, findRoom, resolveMonsterWandEffect, _resolveMonsterWandBolt } from "../monsters.js";
import { fireTrapPlayer } from "../traps.js";
import { takeDueActions } from "../actionClock.js";
import { inMagicSealRoom, runMineExplosion, killMonster, setPitfallBag, clearPitfallBag } from "../items.js";
import { itemDisplayName } from "../render.js";
import { hasGravityPentacle, T } from "../utils.js";
import { interruptPlayerSleep } from "../turnUpkeep.js";
import { trackTrap } from "../DiscoveryTracker.js";
import { applyWandEffect, fireWandBolt } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => { vi.restoreAllMocks(); clearPitfallBag(); });

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

describe("敵の吹き飛ばしによる衝突撃破", () => {
  it.each([["player", 5], ["monster", 5], ["player", 25], ["monster", 25]])("吹き飛んだ%sとの衝突でHP%sの敵を正しく処理する", (kind, hp) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const player = makePlayer({ x: kind === "player" ? 8 : 10, y: 5, depth: 1, exp: 0 });
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "stealthrower"), 1,
      kind === "player" ? 10 : 8, 5);
    const stolen = { id: "stolen", name: "命の指輪", type: "ring", effect: "life", plus: 1 };
    Object.assign(victim, { hp, _phaseActionCount: 0, _stealthrowerHeldItem: stolen, heldItems: [stolen] });
    const dungeon = makeEmptyDg({ monsters: [mage, victim], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    if (kind === "monster") {
      const pushed = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 7, 5);
      Object.assign(pushed, { hp: 100, maxHp: 100, _phaseActionCount: 0 });
      dungeon.monsters.push(pushed);
    }
    const messages = [];
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, messages, "attackOnly");
    expect(messages.some(message => message.includes("激突"))).toBe(true);
    if (hp === 5) {
      expect(dungeon.monsters).not.toContain(victim);
      expect(dungeon.items.filter(item => item.id === "stolen")).toHaveLength(1);
      expect(mage.monLevel).toBe(2);
    } else {
      expect(dungeon.monsters).toContain(victim);
      expect(victim.hp).toBe(5);
      expect(victim._stealthrowerHeldItem).toBe(stolen);
      expect(dungeon.items).toEqual([]);
      expect(mage.monLevel).toBe(1);
    }
    expect(player.exp).toBe(0);
  });

  it("敵が水へ吹き飛ばして倒した場合も、敵に撃破を帰属させる", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 7, 5);
    Object.assign(victim, { hp: 100, maxHp: 100, _phaseActionCount: 0 });
    const player = makePlayer({ x: 13, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [mage, victim], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    dungeon.map[5][10] = T.WATER;
    dungeon.map[5][11] = T.WALL;
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, [], "attackOnly");
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(0);
    expect(mage.monLevel).toBe(2);
  });
});

describe("敵の吹き飛ばしの杖が床の道具に当たる場合", () => {
  it.each([
    ["wand", "explode"], ["pot", "explode"], ["wand", "pitfall"], ["pot", "pitfall"],
  ])("%sが%sで消費された後、元の階へ再配置しない", (type, effect) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const moved = type === "wand"
      ? { id: "moved", type, name: "眠りの杖", effect: "sleep", charges: 3, x: 7, y: 5 }
      : { id: "moved", type, name: "保存の壺", potEffect: "none", capacity: 3, x: 7, y: 5,
        contents: [{ id: "stored", type: "ring", name: "命の指輪", effect: "life", plus: 1 }] };
    const trap = { id: "landing-trap", name: effect === "explode" ? "地雷" : "落とし穴",
      effect, x: 8, y: 5, permanent: true };
    const player = makePlayer({ x: 10, y: 5, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [mage], traps: [trap], items: [moved],
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    const bag = [];
    setPitfallBag(bag);
    try {
      moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, [], "attackOnly");
    } finally { clearPitfallBag(); }
    expect(dungeon.items).toEqual([]);
    expect(player.hp).toBe(100);
    expect(bag).toHaveLength(effect === "pitfall" ? 1 : 0);
    if (effect === "pitfall") expect(bag[0].entity).toBe(moved);
  });
});

describe("敵が飛ばした道具・大箱の撃破者", () => {
  it.each([
    ["weapon", 1], ["potion", 1], ["bigbox", 1],
    ["weapon", 100], ["potion", 100], ["bigbox", 100],
  ])("%sでHP%sの敵を攻撃した時、撃破と成長を正しく処理する", (type, hp) => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "stealthrower"), 1, 9, 5);
    const stolen = { id: "stolen", type: "ring", name: "命の指輪", effect: "life", plus: 1 };
    Object.assign(victim, { hp, maxHp: 100, _phaseActionCount: 0, _stealthrowerHeldItem: stolen, heldItems: [stolen] });
    const moved = type === "weapon"
      ? { id: "moved", type, name: "短剣", atk: 3, x: 7, y: 5 }
      : type === "potion"
        ? { id: "moved", type, name: "毒薬", effect: "poison", value: 0, x: 7, y: 5 }
        : { id: "moved", name: "合成の大箱", kind: "synthesis", capacity: 2, contents: [], x: 7, y: 5 };
    const player = makePlayer({ x: 12, y: 5, depth: 1, exp: 0, atk: 3 });
    const dungeon = makeEmptyDg({ monsters: [mage, victim], items: type === "bigbox" ? [] : [moved],
      bigboxes: type === "bigbox" ? [moved] : [], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    const messages = [];
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, messages, "attackOnly");
    expect(messages.some(message => message.includes("杖を振った"))).toBe(true);
    expect(player.exp).toBe(0);
    if (hp === 1) {
      expect(dungeon.monsters).not.toContain(victim);
      expect(mage.monLevel).toBe(2);
      expect(dungeon.items.filter(item => item.id === "stolen")).toHaveLength(1);
    } else {
      expect(dungeon.monsters).toContain(victim);
      expect(victim.hp).toBeLessThan(100);
      expect(victim.hp).toBeGreaterThan(0);
      expect(mage.monLevel).toBe(1);
      expect(victim._stealthrowerHeldItem).toBe(stolen);
      expect(dungeon.items.filter(item => item.id === "stolen")).toHaveLength(0);
    }
  });

  it.each(["weapon", "potion", "bigbox"])("プレイヤー自身が%sを飛ばして倒した場合は従来どおり経験値が入る", type => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "stealthrower"), 1, 9, 5);
    victim.hp = 1;
    const moved = type === "weapon"
      ? { id: "moved", type, name: "短剣", atk: 3, x: 7, y: 5 }
      : type === "potion"
        ? { id: "moved", type, name: "毒薬", effect: "poison", value: 0, x: 7, y: 5 }
        : { id: "moved", name: "合成の大箱", kind: "synthesis", capacity: 2, contents: [], x: 7, y: 5 };
    const player = makePlayer({ x: 5, y: 5, depth: 1, exp: 0, atk: 3 });
    const dungeon = makeEmptyDg({ monsters: [victim], items: type === "bigbox" ? [] : [moved],
      bigboxes: type === "bigbox" ? [moved] : [] });
    applyWandEffect("knockback", type === "bigbox" ? "bigbox" : "item", moved, 1, 0,
      dungeon, player, [], () => {});
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(45);
  });
});

describe("吹き飛ばされた大箱のプレイヤー命中", () => {
  function hitPlayer({ level = 1, contents = false, hp = 100, sleepTurns = 0, blocked = false, diagonal = false, random = 0.1 } = {}) {
    vi.spyOn(Math, "random").mockReturnValue(random);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), level, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const stored = { id: "stored", type: "ring", name: "命の指輪", effect: "life", plus: 1 };
    const box = { id: "box", name: "合成の大箱", kind: "synthesis", capacity: 2,
      contents: contents ? [stored] : [], x: 7, y: diagonal ? 7 : 5 };
    const player = makePlayer({ x: 10, y: diagonal ? 10 : 5, depth: 1, exp: 0, hp, sleepTurns });
    const dungeon = makeEmptyDg({ monsters: [mage], bigboxes: [box],
      rooms: [{ x: 1, y: 1, w: 20, h: 20 }] });
    if (blocked) dungeon.traps.push({ id: "blocker", name: "落とし穴", effect: "pitfall", x: 8, y: 5, permanent: true });
    const messages = [];
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, messages, "attackOnly");
    expect(messages.some(message => message.includes("杖を振った"))).toBe(true);
    return { player, dungeon, box, stored, messages };
  }

  it.each([[1, false], [1, true], [3, false], [3, true]])("Lv%sが飛ばした箱に当たると22ダメージを受けて箱が壊れる（中身:%s）", (level, contents) => {
    const { player, dungeon, box, stored, messages } = hitPlayer({ level, contents });
    expect(player.hp).toBe(78);
    expect([player.x, player.y]).toEqual([10, 5]);
    expect(dungeon.bigboxes).not.toContain(box);
    expect(box.contents).toEqual([]);
    expect(dungeon.items.filter(item => item.id === stored.id)).toHaveLength(contents ? 1 : 0);
    if (contents) expect(dungeon.items.find(item => item.id === stored.id)).toMatchObject({ x: 9, y: 5 });
    expect(messages.filter(message => message.includes("激突！22ダメージ"))).toHaveLength(1);
  });
  it("斜めから飛んできた箱にも当たる", () => {
    const { player, dungeon, box, stored } = hitPlayer({ diagonal: true, contents: true });
    expect(player.hp).toBe(78);
    expect(dungeon.bigboxes).not.toContain(box);
    expect(dungeon.items.find(item => item.id === stored.id)).toMatchObject({ x: 9, y: 9 });
  });
  it("衝突でHP0以下になる場合は死因を箱の衝突として記録する", () => {
    const { player, dungeon, box } = hitPlayer({ hp: 10 });
    expect(player.hp).toBeLessThanOrEqual(0);
    expect(player.deathCause).toContain("合成の大箱");
    expect(dungeon.bigboxes).not.toContain(box);
  });
  it("眠っていても当たり、衝撃で目を覚ます", () => {
    const { player } = hitPlayer({ sleepTurns: 5 });
    expect(player.hp).toBe(78);
    expect(player.sleepTurns).toBe(0);
    expect(player.sleepInterruptedTurns).toBe(1);
  });
  it("プレイヤーより手前の罠で止まった場合は当たらず箱も壊れない", () => {
    const { player, dungeon, box, stored } = hitPlayer({ blocked: true, contents: true });
    expect(player.hp).toBe(100);
    expect(dungeon.bigboxes).toContain(box);
    expect([box.x, box.y]).toEqual([7, 5]);
    expect(box.contents).toEqual([stored]);
    expect(dungeon.items).toEqual([]);
  });
  it.each([[0, 20], [0.999, 40]])("衝突ダメージの下限・上限を適用する（乱数:%s、ダメージ:%s）", (random, damage) => {
    const { player, dungeon, box } = hitPlayer({ random });
    expect(player.hp).toBe(100 - damage);
    expect(dungeon.bigboxes).not.toContain(box);
  });
});

describe("大箱の激突と破壊の順番", () => {
  it("ニトロ箱で通常敵を倒しても経験値と撃破ログは1回だけ", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 9, 5);
    Object.assign(victim, { hp: 100, maxHp: 100 });
    const box = { id: "nitro", name: "ニトロ箱", kind: "nitro", capacity: 1, contents: [], x: 7, y: 5 };
    const player = makePlayer({ x: 5, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [victim], bigboxes: [box] });
    const messages = [];
    const levelUp = vi.fn();
    fireWandBolt(player, dungeon, "knockback", 1, 0, messages, levelUp);
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(victim.exp);
    expect(levelUp).toHaveBeenCalledOnce();
    expect(messages.filter(message => message.includes("コボルドを倒した"))).toHaveLength(1);
    const collision = messages.findIndex(message => message.includes("激突"));
    const explosion = messages.findIndex(message => message.includes("ニトロ箱が爆発"));
    expect(collision).toBeLessThan(explosion);
  });

  it("敵が飛ばしたニトロ箱の激突で倒れた敵を爆発後に再撃破しない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 9, 5);
    Object.assign(victim, { hp: 1, _phaseActionCount: 0 });
    const box = { id: "nitro", name: "ニトロ箱", kind: "nitro", capacity: 1, contents: [], x: 7, y: 5 };
    const player = makePlayer({ x: 12, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [mage, victim], bigboxes: [box], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    const messages = [];
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, messages, "attackOnly");
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(0);
    expect(mage.monLevel).toBe(2);
    expect(messages.filter(message => message.includes("コボルド") && message.includes("倒され"))).toHaveLength(1);
    expect(messages.filter(message => message.includes("コボルドを倒した"))).toHaveLength(0);
  });

  it("撃破時の盗品が地雷を起動しても衝突済みのニトロ箱を再び爆発させない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "stealthrower"), 1, 9, 5);
    const stolen = { id: "stolen", name: "命の指輪", type: "ring", effect: "life", plus: 1 };
    Object.assign(victim, { hp: 1, _phaseActionCount: 0, heldItems: [stolen], _stealthrowerHeldItem: stolen });
    const box = { id: "nitro", name: "ニトロ箱", kind: "nitro", capacity: 1, contents: [], x: 8, y: 5 };
    const mine = { id: "mine", name: "地雷", effect: "explode", x: 9, y: 5, permanent: true };
    const player = makePlayer({ x: 12, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [mage, victim], bigboxes: [box], traps: [mine],
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    const messages = [];
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, messages, "attackOnly");
    expect(messages.filter(message => message.startsWith("ニトロ箱が爆発した！"))).toHaveLength(1);
    expect(messages.filter(message => message.startsWith("地雷が発動！"))).toHaveLength(1);
    expect(dungeon.bigboxes).not.toContain(box);
    expect(mage.monLevel).toBe(2);
    expect(player.exp).toBe(0);
  });

  it("爆発で復活した敵へ、同じ箱の激突ダメージを後から追加しない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 9, 5);
    Object.assign(victim, { hp: 100, maxHp: 100 });
    const box = { id: "nitro", name: "ニトロ箱", kind: "nitro", capacity: 1, contents: [], x: 7, y: 5 };
    const player = makePlayer({ x: 5, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [victim], bigboxes: [box],
      pentacles: [{ id: "revival", kind: "revival", name: "復活の魔方陣", x: 9, y: 5 }] });
    const messages = [];
    fireWandBolt(player, dungeon, "knockback", 1, 0, messages, () => {});
    expect(dungeon.monsters).toContain(victim);
    expect(victim.hp).toBe(100);
    expect(player.exp).toBe(0);
    expect(messages.filter(message => message.includes("HP全回復"))).toHaveLength(1);
  });

  it("ボスは激突の後のHPを基準にニトロ箱の割合ダメージを受ける", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const victim = { id: "boss", name: "ボス", x: 9, y: 5, hp: 100, maxHp: 100, isBoss: true, exp: 100 };
    const box = { id: "nitro", name: "ニトロ箱", kind: "nitro", capacity: 1, contents: [], x: 7, y: 5 };
    const player = makePlayer({ x: 5, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [victim], bigboxes: [box] });
    fireWandBolt(player, dungeon, "knockback", 1, 0, [], () => {});
    expect(victim.hp).toBe(45); // 100→激突40で60→爆発15で45
    expect(player.exp).toBe(0);
    expect(dungeon.monsters).toContain(victim);
  });

  it("プレイヤーへ当てたニトロ箱も激突1回・爆発1回の順に処理する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mage = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    Object.assign(mage, { aware: true, alwaysUseSpecial: true, _phaseActionCount: 1, _movesMadeThisPhase: 0 });
    const box = { id: "nitro", name: "ニトロ箱", kind: "nitro", capacity: 1, contents: [], x: 7, y: 5 };
    const player = makePlayer({ x: 10, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [mage], bigboxes: [box], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    const messages = [];
    moveEnemiesFor({ player, dungeon, ident: new Set() }).moveMons(dungeon, player, messages, "attackOnly");
    expect(player.hp).toBe(15); // 100→激突40で60→爆発45で15
    expect(messages.filter(message => message.includes("激突！40ダメージ"))).toHaveLength(1);
    expect(messages.filter(message => message.startsWith("ニトロ箱が爆発した！"))).toHaveLength(1);
    expect(dungeon.bigboxes).not.toContain(box);
  });
});
