import { describe, it, expect, vi } from "vitest";
import { monSubmergesProjectiles } from "../monTraits.js";
import { MONS, makeMonsterFromBase, monsterAI, _resolveBolt } from "../monsters.js";
import { castSpellBolt, fireTrapArrowFromFacing, shootArrow } from "../items.js";
import { fireWandBolt } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

const noop = () => {};

function makeTarget(name, x, y, hp = 50) {
  return { name, id: name, x, y, hp, maxHp: hp, atk: 1, def: 0 };
}

describe("かわしモグラ", () => {
  it("敵定義と3段階の名前を持つ", () => {
    const base = MONS.find((m) => m.baseKind === "dodgemole");
    expect(base?.name).toBe("かわしモグラ");
    expect(base?.levels?.map((level) => level.name)).toEqual(["ひょいひょいモグラ", "ディグダグダグダ"]);
    expect(base?.tile).toBe(181);
  });

  it("21階以降の水準へ強化された3段階のパラメータを持つ", () => {
    const base = MONS.find((m) => m.baseKind === "dodgemole");
    expect([base.hp, base.atk, base.def, base.exp]).toEqual([86, 30, 10, 100]);
    expect([base.levels[0].hp, base.levels[0].atk, base.levels[0].def, base.levels[0].exp]).toEqual([135, 42, 15, 165]);
    expect([base.levels[1].hp, base.levels[1].atk, base.levels[1].def, base.levels[1].exp]).toEqual([210, 58, 21, 260]);
  });

  it("通過した罠を発動させずに消滅させる", () => {
    const base = MONS.find((m) => m.baseKind === "dodgemole");
    const mole = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const player = makeTarget("プレイヤー", 9, 5, 100);
    const trap = { id: "trap-1", name: "召喚の罠", effect: "summon_trap", x: 6, y: 5 };
    const dg = makeEmptyDg({ monsters: [mole], traps: [trap], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    const ml = [];

    monsterAI(mole, dg, player, ml, { moveOnly: true });

    expect([mole.x, mole.y]).toEqual([6, 5]);
    expect(dg.traps).toEqual([]);
    expect(ml).toContain("かわしモグラが召喚の罠を潜って消した！");
  });

  it("封印されていないかわしモグラだけが潜ってかわす", () => {
    expect(monSubmergesProjectiles({ baseKind: "dodgemole" })).toBe(true);
    expect(monSubmergesProjectiles({ baseKind: "dodgemole", sealed: true })).toBe(false);
    expect(monSubmergesProjectiles({ baseKind: "runner" })).toBe(false);
  });

  it("通常の矢はモグラを通過して背後の敵に当たる", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const arrow = { name: "矢", type: "arrow", atk: 5, count: 1, id: "arrow-1" };
    p.inventory = [arrow];
    const mole = makeTarget("かわしモグラ", 6, 5, 40);
    mole.baseKind = "dodgemole";
    const target = makeTarget("背後の敵", 7, 5, 40);
    const dg = makeEmptyDg({ monsters: [mole, target] });
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, noop);

    expect(mole.hp).toBe(40);
    expect(target.hp).toBeLessThan(40);
    expect(ml.some((message) => message.includes("潜って") && message.includes("かわした"))).toBe(true);
  });

  it("石はかわしモグラに当たる", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const stone = { name: "石", type: "arrow", atk: 5, stone: true, count: 1, id: "stone-1" };
    p.inventory = [stone];
    const mole = makeTarget("かわしモグラ", 6, 5, 40);
    mole.baseKind = "dodgemole";
    const dg = makeEmptyDg({ monsters: [mole] });

    shootArrow(p, dg, 0, 1, 0, [], noop);

    expect(mole.hp).toBeLessThan(40);
  });

  it("杖の光弾と魔法弾はモグラを通過して背後へ進む", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const mole = makeTarget("かわしモグラ", 6, 5, 80);
    mole.baseKind = "dodgemole";
    const wandTarget = makeTarget("杖の背後", 7, 5, 80);
    const spellMole = makeTarget("かわしモグラ（魔法）", 6, 6, 80);
    spellMole.baseKind = "dodgemole";
    const spellTarget = makeTarget("魔法の背後", 7, 7, 80);
    const dg = makeEmptyDg({ monsters: [mole, wandTarget, spellMole, spellTarget] });
    const wandMessages = [];
    const spellMessages = [];

    fireWandBolt(p, dg, "fire_wand", 1, 0, wandMessages, noop, noop);
    castSpellBolt(p, dg, { name: "炎の魔法", effect: "fire_bolt", range: 10 }, 1, 1, spellMessages, noop);

    expect(mole.hp).toBe(80);
    expect(spellMole.hp).toBe(80);
    expect(wandTarget.hp).toBeLessThan(80);
    expect(spellTarget.hp).toBeLessThan(80);
    expect(wandMessages.some((message) => message.includes("杖の光弾"))).toBe(true);
    expect(spellMessages.some((message) => message.includes("魔法をかわした"))).toBe(true);
  });

  it("共通の物理弾経路でもモグラを通過する", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const mole = makeTarget("かわしモグラ", 6, 5, 80);
    mole.baseKind = "dodgemole";
    const target = makeTarget("背後の敵", 7, 5, 80);
    const dg = makeEmptyDg({ monsters: [mole, target] });
    const ml = [];

    _resolveBolt(p, dg, p, ml, null, {
      isPlayerShooter: true,
      dx: 1,
      dy: 0,
      baseRange: 5,
      boltName: "飛び道具",
      calcMonDmg: () => 10,
    });

    expect(mole.hp).toBe(80);
    expect(target.hp).toBe(70);
  });

  it("矢罠と水鉄砲はモグラを通過して後ろへ進む", () => {
    const trapMole = makeTarget("矢罠のかわしモグラ", 5, 4, 80);
    trapMole.baseKind = "dodgemole";
    const trapDg = makeEmptyDg({
      monsters: [trapMole],
      traps: [{ id: "arrow-trap", x: 5, y: 5, name: "矢の罠", effect: "arrow_trap" }],
    });
    const trapPlayer = makePlayer({ x: 10, y: 10, facing: { dx: 0, dy: 1 } });
    const trapMessages = [];

    fireTrapArrowFromFacing(trapDg.traps[0], trapPlayer, trapDg, trapMessages);

    expect(trapMole.hp).toBe(80);
    expect(trapMessages.some((message) => message.includes("矢罠のかわしモグラ") && message.includes("かわした"))).toBe(true);

    const wateri = makeMonsterFromBase(MONS.find((m) => m.baseKind === "wateri"), 1, 3, 5, { aware: true });
    wateri.alwaysUseSpecial = true;
    wateri.turnAttacks = 0;
    const waterMole = makeTarget("水鉄砲のかわしモグラ", 4, 5, 80);
    waterMole.baseKind = "dodgemole";
    const waterPlayer = makePlayer({ x: 7, y: 5 });
    const waterDg = makeEmptyDg({
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
      monsters: [wateri, waterMole],
    });
    waterDg.map[5][3] = T.WATER;
    const waterMessages = [];

    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      monsterAI(wateri, waterDg, waterPlayer, waterMessages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(waterMole.hp).toBe(80);
    expect(waterPlayer.hp).toBeLessThan(100);
    expect(waterMessages.some((message) => message.includes("水鉄砲のかわしモグラ") && message.includes("かわした"))).toBe(true);
  });

  it("Lv1の直線ブレスは通過し、Lv2のブレスはモグラに当たる", () => {
    const dragonBase = MONS.find((m) => m.baseKind === "dragon");
    const dragon = makeMonsterFromBase(dragonBase, 1, 3, 5, { aware: true });
    dragon.alwaysUseSpecial = true;
    dragon.turnAttacks = 0;
    const straightMole = makeTarget("直線ブレスのかわしモグラ", 4, 5, 120);
    straightMole.baseKind = "dodgemole";
    const straightPlayer = makePlayer({ x: 8, y: 5 });
    const straightDg = makeEmptyDg({
      monsters: [dragon, straightMole],
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
    });
    const straightMessages = [];

    monsterAI(dragon, straightDg, straightPlayer, straightMessages, { attackOnly: true });

    expect(straightMole.hp).toBe(120);
    expect(straightPlayer.hp).toBeLessThan(100);

    const dragonLv2 = makeMonsterFromBase(dragonBase, 2, 3, 5, { aware: true });
    dragonLv2.alwaysUseSpecial = true;
    dragonLv2.turnAttacks = 0;
    const homingMole = makeTarget("追尾ブレスのかわしモグラ", 4, 5, 120);
    homingMole.baseKind = "dodgemole";
    const homingPlayer = makePlayer({ x: 8, y: 5 });
    const homingDg = makeEmptyDg({
      monsters: [dragonLv2, homingMole],
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
    });
    const homingMessages = [];

    monsterAI(dragonLv2, homingDg, homingPlayer, homingMessages, { attackOnly: true });

    expect(homingMole.hp).toBeLessThan(120);
    expect(homingMessages.some((message) => message.includes("追尾ブレスのかわしモグラ") && message.includes("命中"))).toBe(true);
  });
});
