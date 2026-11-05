import { describe, it, expect, vi } from "vitest";
import { NIEBELUNG_RING_T, RINGS, soakItemIntoSpring } from "../items.js";
import { calcPlayerDefense } from "../utils.js";
import { ringHpBonus } from "../equipmentEffects.js";
import { applyEquipmentUpgradeScroll } from "../equipmentScrollEffects.js";
import { monsterAI } from "../monsters.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";

describe("ニーベルングの指輪の実装", () => {
  it("NIEBELUNG_RING_T が正しく定義されている", () => {
    expect(NIEBELUNG_RING_T.name).toBe("ニーベルングの指輪");
    expect(NIEBELUNG_RING_T.effect).toBe("niebelung_ring");
    expect(NIEBELUNG_RING_T.rarity).toBe("S");
    expect(NIEBELUNG_RING_T.sellPrice).toBe(15000);
    expect(NIEBELUNG_RING_T.tile).toBe(60);

    const rInRings = RINGS.find((r) => r.effect === "niebelung_ring");
    expect(rInRings).toBeDefined();
  });

  it("泉に呪われた指輪を落とすとニーベルングの指輪に変化し呪いが解ける", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); /* 変化抽選（5%）に当たった場合 */
    const spr = { x: 5, y: 5, contents: [] };
    const ring = { name: "毒消しの指輪", type: "ring", effect: "antidote_ring", cursed: true, plus: 2, id: "r1" };
    const ml = [];

    soakItemIntoSpring(spr, ring, ml);
    expect(ring.name).toBe(NIEBELUNG_RING_T.name);
    expect(ring.effect).toBe("niebelung_ring");
    expect(ring.cursed).toBe(false);
    expect(ring.plus).toBe(2);
    expect(ml.some((m) => m.includes("ニーベルングの指輪に変化した"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("変化抽選に外れた呪われた指輪は変化せず呪いも解けない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); /* 変化抽選（5%）に外れた場合 */
    const spr = { x: 5, y: 5, contents: [] };
    const ring = { name: "毒消しの指輪", type: "ring", effect: "antidote_ring", cursed: true, plus: 2, id: "r3" };
    const ml = [];

    soakItemIntoSpring(spr, ring, ml);
    expect(ring.name).toBe("毒消しの指輪");
    expect(ring.effect).toBe("antidote_ring");
    expect(ring.cursed).toBe(true);
    vi.restoreAllMocks();
  });

  it("呪われていない指輪は変化しない", () => {
    const spr = { x: 5, y: 5, contents: [] };
    const ring = { name: "毒消しの指輪", type: "ring", effect: "antidote_ring", cursed: false, plus: 0, id: "r2" };
    const ml = [];

    soakItemIntoSpring(spr, ring, ml);
    expect(ring.name).toBe("毒消しの指輪");
    expect(ring.effect).toBe("antidote_ring");
  });

  it("力・守り・命の+値効果（攻撃・防御・HP）が全て適用される", () => {
    const ring = { ...NIEBELUNG_RING_T, plus: 4 };
    const p = makePlayer({ rings: [ring], def: 5 });

    // 防御力ボーナス (+4) -> 5 + 4 = 9
    expect(calcPlayerDefense(p)).toBe(9);

    // HPボーナス (+4 * 5 = +20)
    expect(ringHpBonus(ring)).toBe(20);
  });

  it("強化の巻物で+値を強化できる", () => {
    const ring = { ...NIEBELUNG_RING_T, plus: 1, id: "n_ring" };
    const p = makePlayer({ rings: [ring] });
    const msg = applyEquipmentUpgradeScroll(p, ring, { mode: "weapon_up" }, ring.name);

    expect(ring.plus).toBe(2);
    expect(msg).toContain("輝いた");
  });

  it("ニーベルングの指輪装備中は遠くの敵も目覚めて aware になる", () => {
    const ring = { ...NIEBELUNG_RING_T, plus: 0 };
    const p = makePlayer({ x: 2, y: 2, rings: [ring] });
    const m = {
      id: "mon1",
      name: "ゴブリン",
      x: 15,
      y: 15,
      hp: 20,
      maxHp: 20,
      dormant: true,
      aware: false,
      speed: 1,
      turnAccum: 0,
      turnAttacks: 0,
      dir: { x: 0, y: 0 },
    };
    const dg = makeEmptyDg({ monsters: [m] });
    const ml = [];

    monsterAI(m, dg, p, ml);

    expect(m.dormant).toBe(false);
    expect(m.aware).toBe(true);
    expect(m.lastPx).toBe(p.x);
    expect(m.lastPy).toBe(p.y);
  });
});
