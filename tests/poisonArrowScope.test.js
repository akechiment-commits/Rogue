import { describe, it, expect, vi } from "vitest";
import { monsterFireLightning, applyWandEffect } from "../wands.js";
import { monScaleOutgoingDamage } from "../monTraits.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { MONS, makeMonsterFromBase, _resolveBolt, monsterDragonFire, monsterIceBreath } from "../monsters.js";
import { reflectMagicStoneToPlayer, applyThrownItemToMonster, makeStone } from "../items.js";

const noop = () => {};

describe("毒矢の半減は防御依存ダメージだけに効く", () => {
  it("半減の仕組み自体はスタック数で累積する（ボスは残りターンがある時だけ）", () => {
    expect(monScaleOutgoingDamage({ poisonArrowDamageHalves: 0 }, 20)).toBe(20);
    expect(monScaleOutgoingDamage({ poisonArrowDamageHalves: 1 }, 20)).toBe(10);
    expect(monScaleOutgoingDamage({ poisonArrowDamageHalves: 2 }, 20)).toBe(5);
    expect(monScaleOutgoingDamage({ isBoss: true, poisonArrowDamageHalves: 1, poisonArrowDamageTurns: 0 }, 20)).toBe(20);
    expect(monScaleOutgoingDamage({ isBoss: true, poisonArrowDamageHalves: 1, poisonArrowDamageTurns: 5 }, 20)).toBe(10);
  });

  it("敵の雷の杖（固定ダメージ）は射手が毒矢で弱体化していても半減しない", () => {
    const run = (stacks) => {
      const wizard = makeMonsterFromBase(MONS.find((m) => m.baseKind === "wizard"), 1, 5, 5);
      if (stacks) wizard.poisonArrowDamageHalves = stacks;
      const dg = makeEmptyDg({ monsters: [wizard] });
      const p = makePlayer({ x: 6, y: 5, hp: 100, maxHp: 100 });
      const ml = [];
      vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        monsterFireLightning(5, 5, dg, p, 1, 0, ml, noop, null, wizard.name, null, wizard, false);
      } finally {
        vi.restoreAllMocks();
      }
      return 100 - p.hp;
    };
    const clean = run(0);
    expect(clean).toBeGreaterThan(0);
    expect(run(2)).toBe(clean);
  });

  it("雷の杖の壁反射（固定ダメージ）も射手の毒矢スタックで半減しない", () => {
    const wizard = makeMonsterFromBase(MONS.find((m) => m.baseKind === "wizard"), 1, 3, 5);
    wizard.hp = 10;
    wizard.poisonArrowDamageHalves = 2;
    const dg = makeEmptyDg({ monsters: [wizard] });
    dg.map[5][2] = T.WALL;
    const p = makePlayer({ x: 10, y: 5, exp: 0 });
    const ml = [];
    vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      monsterFireLightning(3, 5, dg, p, -1, 0, ml, noop, null, wizard.name, null, wizard, false);
    } finally {
      vi.restoreAllMocks();
    }
    expect(dg.monsters).not.toContain(wizard);
    expect(ml.some((msg) => msg.includes("自滅"))).toBe(true);
  });
});

describe("反射と投擲は攻撃の持ち主と受けた側を参照する", () => {
  it("魔法の石の反射は反射者の毒で半減せず、受けたプレイヤーの防御で軽減される", () => {
    const run = (playerDef, reflectorStacks) => {
      const reflector = makeMonsterFromBase(MONS.find((m) => m.baseKind === "reflector"), 1, 3, 5);
      if (reflectorStacks) reflector.poisonArrowDamageHalves = reflectorStacks;
      const p = makePlayer({ x: 6, y: 5, hp: 500, maxHp: 500, atk: 30, def: playerDef });
      const ml = [];
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      try {
        return reflectMagicStoneToPlayer(p, reflector, "魔法の石", 10, ml);
      } finally {
        vi.restoreAllMocks();
      }
    };
    const noDef = run(0, 0);
    expect(noDef).toBeGreaterThan(0);
    expect(run(0, 2)).toBe(noDef);
    expect(run(40, 0)).toBeLessThan(noDef);
  });

  it("投擲の毒半減は反射者でなく投げた側のスタックで決まる", () => {
    const run = (opts) => {
      const mon = { name: "スライム", hp: 500, maxHp: 500, x: 6, y: 5, atk: 3, def: 0 };
      const dg = makeEmptyDg({ monsters: [mon] });
      const p = makePlayer({ atk: 30 });
      const ml = [];
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      try {
        applyThrownItemToMonster(makeStone(), mon, dg, p, ml, noop, opts);
      } finally {
        vi.restoreAllMocks();
      }
      return 500 - mon.hp;
    };
    const clean = run({ killerMon: { name: "反射者", poisonArrowDamageHalves: 2 }, scaleSourceMon: null });
    expect(clean).toBeGreaterThan(0);
    const scaled = run({ killerMon: { name: "反射者" }, scaleSourceMon: { name: "投擲者", poisonArrowDamageHalves: 1 } });
    expect(scaled).toBeLessThan(clean);
  });

  it("ドラゴンの炎ブレスは防御無視の帯威力で、毒でも半減しない", () => {
    const dragon = makeMonsterFromBase(MONS.find((m) => m.baseKind === "dragon"), 1, 5, 5);
    dragon.poisonArrowDamageHalves = 2;
    const dg = makeEmptyDg({ monsters: [dragon] });
    const p = makePlayer({ x: 8, y: 5, hp: 500, maxHp: 500, armor: { name: "鉄壁の鎧", def: 100 } });
    const ml = [];
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      monsterDragonFire(dragon, dg, p, ml, noop);
    } finally {
      vi.restoreAllMocks();
    }
    expect(p.hp).toBe(500 - 33);
  });

  it("氷ブレスも防御無視の帯威力（Lv1は30）", () => {
    const ice = makeMonsterFromBase(MONS.find((m) => m.baseKind === "icedragon"), 1, 5, 5);
    const dg = makeEmptyDg({ monsters: [ice] });
    const p = makePlayer({ x: 8, y: 5, hp: 500, maxHp: 500, armor: { name: "鉄壁の鎧", def: 100 } });
    const ml = [];
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      monsterIceBreath(ice, dg, p, ml, noop);
    } finally {
      vi.restoreAllMocks();
    }
    expect(p.hp).toBe(500 - 30);
  });

  it("サラマンダーの炎ブレスは17が基準", () => {
    const sal = { name: "サラマンダー", baseKind: "im_boss_salamander", monLevel: 1, hp: 280, maxHp: 280, x: 5, y: 5, atk: 38, def: 20 };
    const dg = makeEmptyDg({ monsters: [sal] });
    const p = makePlayer({ x: 8, y: 5, hp: 500, maxHp: 500 });
    const ml = [];
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      monsterDragonFire(sal, dg, p, ml, noop);
    } finally {
      vi.restoreAllMocks();
    }
    expect(p.hp).toBe(500 - 17);
  });

  it("炎の杖は炎弱点の敵に2倍ダメージ", () => {
    const dg = makeEmptyDg();
    const normal = { name: "スライム", hp: 200, maxHp: 200, x: 6, y: 5, atk: 3 };
    const weak = { name: "つらら小僧", hp: 200, maxHp: 200, x: 7, y: 5, atk: 3, elemWeak: "fire" };
    dg.monsters.push(normal, weak);
    const p = makePlayer();
    const ml1 = [];
    const ml2 = [];
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      applyWandEffect("fire_wand", "monster", normal, 1, 0, dg, p, ml1, noop);
      applyWandEffect("fire_wand", "monster", weak, 1, 0, dg, p, ml2, noop);
    } finally {
      vi.restoreAllMocks();
    }
    expect(200 - normal.hp).toBe(25);
    expect(200 - weak.hp).toBe(50);
    expect(ml2.some((m) => m.includes("炎弱点特効"))).toBe(true);
  });

  it("歩数光線（ignorePoisonScale）は射手の毒スタックでも半減しない", () => {
    const run = (ignore) => {
      const shooter = { name: "ピュロボロス", hp: 500, maxHp: 500, x: 5, y: 5, atk: 30, def: 0, poisonArrowDamageHalves: 2 };
      const dg = makeEmptyDg({ monsters: [shooter] });
      const p = makePlayer({ x: 8, y: 5, hp: 100, maxHp: 100 });
      const ml = [];
      _resolveBolt(shooter, dg, p, ml, noop, {
        dx: 1, dy: 0, baseRange: 10, boltName: "歩数光線",
        calcPlDmg: () => 20, calcMonDmg: () => 20,
        ...(ignore ? { ignorePoisonScale: true } : {}),
      });
      return 100 - p.hp;
    };
    expect(run(true)).toBe(20);
    expect(run(false)).toBe(5);
  });
});
