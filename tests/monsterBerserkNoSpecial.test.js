import { describe, it, expect, vi } from "vitest";
import { makeMonsterFromBase, monsterAI, triggerMushroomCounterSpore } from "../monsters.js";
import { monReflectsProjectiles, isMonsterBerserk } from "../monTraits.js";
import { T } from "../utils.js";

function makeEmptyDg(width = 20, height = 20) {
  const map = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push(x === 0 || x === width - 1 || y === 0 || y === height - 1 ? T.WALL : T.FLOOR);
    }
    map.push(row);
  }
  return {
    map,
    monsters: [],
    items: [],
    traps: [],
    pentacles: [],
    rooms: [{ x: 1, y: 1, w: width - 2, h: height - 2 }],
  };
}

function makePlayer(opts = {}) {
  return {
    x: 5,
    y: 5,
    hp: 100,
    maxHp: 100,
    def: 5,
    inventory: [{ id: "item1", name: "薬草", type: "potion" }],
    ...opts,
  };
}

describe("Monster berserk state: specials disabled, passive traits preserved", () => {
  it("dragon in berserk state does not breathe fire and instead approaches/attacks directly", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 5 });
    const ml = [];

    const dragon = {
      id: "drag1",
      name: "ドラゴン",
      baseKind: "dragon",
      monLevel: 1,
      x: 5,
      y: 5, // line to player at (10, 5), distance 5
      hp: 100,
      maxHp: 100,
      atk: 30,
      def: 10,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      berserkerTurns: 10,
    };
    dg.monsters = [dragon];

    expect(isMonsterBerserk(dragon)).toBe(true);

    // moveOnly phase
    monsterAI(dragon, dg, p, ml, { moveOnly: true });
    // Should NOT have reserved ranged attack; should have moved towards player
    expect(dragon._rangedAttackThisTurn).toBeFalsy();
    expect(dragon.x).toBeGreaterThan(5); // moved closer to player (x=6)

    // Reset turn and place adjacent
    dragon.x = 9;
    dragon.y = 5;
    dragon.turnAttacks = 0;
    const ml2 = [];

    // attackOnly phase when adjacent
    monsterAI(dragon, dg, p, ml2, { attackOnly: true });
    // Should have performed standard melee attack, NOT dragon fire breath
    expect(ml2.some(m => m.includes("炎を吐いた"))).toBe(false);
    expect(ml2.some(m => m.includes("ドラゴンの攻撃！") || m.includes("外れた"))).toBe(true);
  });

  it("archer in berserk state does not shoot arrows and approaches instead", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 5 });
    const ml = [];

    const archer = {
      id: "arch1",
      name: "リリパット",
      subtype: "archer",
      monLevel: 1,
      x: 5,
      y: 5,
      hp: 50,
      maxHp: 50,
      atk: 20,
      def: 5,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      hasBow: true,
      arrowStock: 10,
      berserkerTurns: 10,
    };
    dg.monsters = [archer];

    monsterAI(archer, dg, p, ml, { moveOnly: true });
    expect(archer._rangedAttackThisTurn).toBeFalsy();
    expect(archer.x).toBe(6); // moved towards player

    // Place adjacent and test attack
    archer.x = 9;
    archer.y = 5;
    archer.turnAttacks = 0;
    const ml2 = [];
    monsterAI(archer, dg, p, ml2, { attackOnly: true });
    expect(ml2.some(m => m.includes("矢を放った"))).toBe(false);
    expect(ml2.some(m => m.includes("リリパットの攻撃！") || m.includes("外れた"))).toBe(true);
  });

  it("thief in berserk state does not steal items and performs normal melee attack", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5, inventory: [{ id: "valuable", name: "天使の巻物", type: "scroll" }] });
    const ml = [];

    const thief = {
      id: "thief1",
      name: "コソドロ",
      subtype: "thief",
      monLevel: 1,
      x: 6,
      y: 5, // adjacent to player
      hp: 40,
      maxHp: 40,
      atk: 15,
      def: 5,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      berserkerTurns: 10,
    };
    dg.monsters = [thief];

    monsterAI(thief, dg, p, ml, { attackOnly: true });
    expect(ml.some(m => m.includes("盗み"))).toBe(false);
    expect(p.inventory.length).toBe(1); // item not stolen
    expect(ml.some(m => m.includes("コソドロの攻撃！") || m.includes("外れた"))).toBe(true);
  });

  it("potion healer in berserk state does not heal injured allies and attacks nearest target", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 15, y: 15 });
    const ml = [];

    const healer = {
      id: "heal1",
      name: "ロキソ忍",
      subtype: "potionhealer",
      monLevel: 1,
      x: 5,
      y: 5,
      hp: 50,
      maxHp: 50,
      atk: 20,
      def: 5,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      potionStock: 5,
      berserkerTurns: 10,
    };
    const injuredAlly = {
      id: "ally1",
      name: "オーク",
      monLevel: 1,
      x: 5,
      y: 6, // adjacent to healer
      hp: 10,
      maxHp: 50, // heavily injured
      def: 2,
    };
    dg.monsters = [healer, injuredAlly];

    monsterAI(healer, dg, p, ml, { attackOnly: true });
    // Should NOT throw healing potion; should attack adjacent ally (or player if adjacent)
    expect(ml.some(m => m.includes("回復薬"))).toBe(false);
    expect(ml.some(m => m.includes("ロキソ忍がオークに攻撃！") || m.includes("外れた") || m.includes("ロキソ忍の攻撃！"))).toBe(true);
  });

  it("hypnotist in berserk state does not use hypnosis", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 6, y: 5 });
    const ml = [];

    const hypno = {
      id: "hyp1",
      name: "催眠魔道士",
      subtype: "hypnotist",
      monLevel: 1,
      x: 5,
      y: 5,
      hp: 40,
      maxHp: 40,
      atk: 15,
      def: 5,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      alwaysUseSpecial: true,
      berserkerTurns: 10,
    };
    dg.monsters = [hypno];

    monsterAI(hypno, dg, p, ml, { attackOnly: true });
    expect(p.hypnosisPending).toBeFalsy();
    expect(ml.some(m => m.includes("催眠術"))).toBe(false);
    expect(ml.some(m => m.includes("催眠魔道士の攻撃！") || m.includes("外れた"))).toBe(true);
  });

  it("preserves passive traits: mushroom counter spore triggers when berserk mushroom is hit", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    const ml = [];

    const berserkMushroom = {
      id: "mush1",
      name: "ドクキノコ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 6,
      y: 5, // adjacent to player
      hp: 40,
      maxHp: 40,
      def: 0,
      berserkerTurns: 10,
    };
    dg.monsters = [berserkMushroom];

    // mushroom's passive counter spore
    triggerMushroomCounterSpore(berserkMushroom, dg, p, ml);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
    expect(p.poisonedTurns).toBeGreaterThan(0);
  });

  it("preserves passive traits: projectile reflector reflects when berserk", () => {
    const berserkReflector = {
      id: "ref1",
      name: "ほっちもぺ",
      subtype: "reflector",
      berserkerTurns: 10,
    };
    expect(monReflectsProjectiles(berserkReflector)).toBe(true);

    // But if sealed, reflector is disabled
    const sealedReflector = {
      id: "ref2",
      name: "ほっちもぺ",
      subtype: "reflector",
      berserkerTurns: 10,
      sealed: true,
    };
    expect(monReflectsProjectiles(sealedReflector)).toBe(false);
  });

  it("when both attack sealed and berserk, cannot perform attacks", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 6, y: 5 });
    const ml = [];

    const berserker = {
      id: "ber1",
      name: "バーサーカー",
      subtype: "berserker",
      x: 5,
      y: 5,
      hp: 50,
      atk: 30,
      def: 5,
      speed: 1,
      turnAttacks: 0,
      attackSealTurns: 5,
    };
    dg.monsters = [berserker];

    monsterAI(berserker, dg, p, ml, { attackOnly: true });
    expect(ml.some(m => m.includes("攻撃が封印されていて攻撃できない"))).toBe(true);
    expect(p.hp).toBe(100); // undamaged
  });

  it("when sealed, berserker effect is disabled and monster reverts to standard sealed AI", () => {
    const sealedBerserker = {
      id: "ber2",
      name: "バーサーカー",
      subtype: "berserker",
      sealed: true,
      berserkerTurns: 10,
    };
    expect(isMonsterBerserk(sealedBerserker)).toBe(false);
  });

  it("pyrobolos boss in berserk state does not self-destruct or fire beam, attacks melee instead", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 6, y: 5 });
    const ml = [];

    const pyro = {
      id: "pyro1",
      name: "ピュロボロス",
      baseKind: "boss_pyrobolos",
      monLevel: 1,
      x: 5,
      y: 5, // adjacent to player
      hp: 100,
      maxHp: 100,
      atk: 40,
      def: 10,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      berserkerTurns: 10,
    };
    dg.monsters = [pyro];

    monsterAI(pyro, dg, p, ml, { attackOnly: true });
    expect(ml.some(m => m.includes("自爆") || m.includes("歩数光線"))).toBe(false);
    expect(ml.some(m => m.includes("ピュロボロスの攻撃！") || m.includes("外れた"))).toBe(true);
    expect(pyro.hp).toBe(100); // Did not explode!
  });

  it("flock revenge boss in berserk state does not cast purify magic to clear berserk", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    const ml = [];

    const flock = {
      id: "flock1",
      name: "逆襲のフロック",
      baseKind: "boss_flock_revenge",
      monLevel: 1,
      x: 10,
      y: 5,
      hp: 200,
      maxHp: 200,
      mp: 100,
      atk: 30,
      def: 15,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      poisonedTurns: 5, // has purgeable status
      berserkerTurns: 10,
    };
    dg.monsters = [flock];

    monsterAI(flock, dg, p, ml, { moveOnly: true });
    // Should NOT have pending purify spell; should approach player
    expect(flock._flockEarlySpellPending).toBeFalsy();
    expect(flock.x).toBeLessThan(10); // moved closer towards player
  });

  it("mimic can mimic skills from adjacent sealed or berserk monsters, but cannot mimic if mimic itself is sealed or berserk", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 5, y: 5 });
    const ml = [];

    const berserkDragon = {
      id: "drag_src",
      name: "ドラゴン",
      baseKind: "dragon",
      monLevel: 1,
      x: 8,
      y: 5,
      hp: 100,
      maxHp: 100,
      atk: 30,
      def: 10,
      berserkerTurns: 10,
    };
    const sealedArcher = {
      id: "arch_src",
      name: "リリパット",
      subtype: "archer",
      monLevel: 1,
      x: 6,
      y: 6,
      hp: 50,
      maxHp: 50,
      atk: 20,
      def: 5,
      hasBow: true,
      arrowStock: 10,
      sealed: true,
    };
    const mimic = {
      id: "mimic1",
      name: "ものまね師",
      subtype: "mimic",
      x: 7,
      y: 5,
      hp: 50,
      maxHp: 50,
      atk: 15,
      def: 5,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      alwaysUseSpecial: true,
    };
    dg.monsters = [mimic, berserkDragon, sealedArcher];

    // Mimic can copy from adjacent berserk or sealed enemy
    monsterAI(mimic, dg, p, ml, { moveOnly: true });
    expect(mimic._mimicReady).toBe(true);

    // But if mimic itself is berserk, it cannot mimic
    const berserkMimic = {
      id: "mimic2",
      name: "ものまね師",
      subtype: "mimic",
      x: 7,
      y: 5,
      hp: 50,
      maxHp: 50,
      atk: 15,
      def: 5,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      alwaysUseSpecial: true,
      berserkerTurns: 10,
    };
    dg.monsters = [berserkMimic, berserkDragon];
    const ml2 = [];
    monsterAI(berserkMimic, dg, p, ml2, { moveOnly: true });
    expect(berserkMimic._mimicReady).toBeFalsy();

    // If mimic itself is sealed, it cannot mimic
    const sealedMimic = {
      id: "mimic3",
      name: "ものまね師",
      subtype: "mimic",
      x: 7,
      y: 5,
      hp: 50,
      maxHp: 50,
      atk: 15,
      def: 5,
      speed: 1,
      turnAttacks: 0,
      aware: true,
      alwaysUseSpecial: true,
      sealed: true,
    };
    dg.monsters = [sealedMimic, berserkDragon];
    const ml3 = [];
    monsterAI(sealedMimic, dg, p, ml3, { moveOnly: true });
    expect(sealedMimic._mimicReady).toBeFalsy();
  });
});
