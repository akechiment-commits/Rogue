import { describe, expect, it } from "vitest";
import { monsterAI } from "../monsters.js";
import { advanceSpecialProjectiles, doExplosion } from "../items.js";
import { advanceMeteors, castMeteor } from "../meteor.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeMerchant(x, y) {
  return {
    id: "merchant", name: "行商人", type: "shopkeeper", isWanderingMerchant: true,
    x, y, hp: 200, maxHp: 200, atk: 20, def: 0, speed: 0.5, baseSpeed: 0.5,
    state: "friendly", aware: false,
  };
}

describe("NPCの敵ダメージ帰属", () => {
  it("メテオで行商人にダメージが入ると詠唱者へ怒る", () => {
    const caster = { id: "caster", name: "眠れる獅子", x: 3, y: 3, hp: 300, meteorDamage: 30 };
    const merchant = makeMerchant(11, 10);
    const dungeon = makeEmptyDg({ monsters: [caster, merchant] });
    const player = makePlayer({ x: 10, y: 10 });
    const messages = [];

    castMeteor(caster, dungeon, { x: 10, y: 10 }, messages);
    advanceMeteors(dungeon, player, messages, () => {}, 2);

    expect(merchant.hp).toBeLessThan(merchant.maxHp);
    expect(merchant.state).toBe("hostile");
    expect(merchant.speed).toBe(1);
    expect(merchant._npcRetaliationTargetId).toBe(caster.id);
    expect(dungeon.shopTheft).toBeUndefined();
  });

  it("敵が原因の部分爆発ダメージでも爆発の持ち主を標的にする", () => {
    const source = { id: "bomb-thrower", name: "爆弾投げ", x: 3, y: 3, hp: 100 };
    const merchant = makeMerchant(6, 6);
    const dungeon = makeEmptyDg({ monsters: [source, merchant] });
    const player = makePlayer({ x: 20, y: 20 });
    const messages = [];

    doExplosion(6, 6, dungeon, player, messages, null, "爆弾", null, null,
      false, false, false, false,
      { killerMon: source, projectileAtk: 12, nonElemental: true });

    expect(merchant.hp).toBeLessThan(merchant.maxHp);
    expect(merchant._npcRetaliationTargetId).toBe(source.id);
  });

  it("敵の誘導弾で受けたダメージでも発射者へ怒る", () => {
    const source = { id: "projectile-shooter", name: "誘導弾使い", x: 3, y: 3, hp: 100 };
    const merchant = makeMerchant(6, 6);
    const projectile = {
      id: "enemy-homing-shot", kind: "homing", owner: "monster", sourceId: source.id,
      sourceName: source.name, atk: 25, x: merchant.x, y: merchant.y, turnsLeft: 10, hasMoved: true,
    };
    const dungeon = makeEmptyDg({ monsters: [source, merchant], specialProjectiles: [projectile] });
    const player = makePlayer({ x: 10, y: 10 });
    const messages = [];

    advanceSpecialProjectiles(dungeon, player, messages, () => {});

    expect(merchant.hp).toBeLessThan(merchant.maxHp);
    expect(merchant._npcRetaliationTargetId).toBe(source.id);
  });

  it("敵が発火させた罠のダメージでは報復しない", () => {
    const trapThrower = {
      id: "trap-thrower", name: "罠投げ", type: "monster", subtype: "trapthrower",
      x: 5, y: 5, hp: 100, maxHp: 100, atk: 10, def: 0, monLevel: 1,
      speed: 1, aware: true, lastPx: 6, lastPy: 5, alwaysUseSpecial: true, turnAttacks: 0,
    };
    const merchant = makeMerchant(8, 8);
    const dungeon = makeEmptyDg({
      monsters: [trapThrower, merchant],
      rooms: [{ x: 1, y: 1, w: 20, h: 20 }],
      traps: [{ id: "arrow-trap", name: "矢の罠", effect: "arrow_trap", x: 8, y: 7, revealed: true }],
    });
    const player = makePlayer({ x: 6, y: 5 });
    const messages = [];
    const fireTrapFn = (_trap, _player, _dungeon) => {
      merchant.hp -= 10;
      return "restart";
    };

    monsterAI(trapThrower, dungeon, player, messages, { moveOnly: true, fireTrapFn });
    monsterAI(trapThrower, dungeon, player, messages, { attackOnly: true, fireTrapFn });

    expect(merchant.hp).toBe(merchant.maxHp - 10);
    expect(merchant.state).toBe("friendly");
    expect(merchant._npcRetaliationTargetId).toBeUndefined();
  });
});
