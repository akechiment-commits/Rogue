import { describe, it, expect, vi } from "vitest";
import {
  MONS,
  isMimicableSkillSource,
  getAdjacentMimicSources,
  tryMimicAdjacentSkill,
  monsterAI,
} from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

describe("ものまね師", () => {
  it("MONS に subtype:mimic が登録されている", () => {
    const def = MONS.find((m) => m.baseKind === "mimic");
    expect(def).toBeTruthy();
    expect(def.name).toBe("ものまね師");
    expect(def.subtype).toBe("mimic");
    expect(def.levels?.length).toBe(2);
  });

  it("isMimicableSkillSource が特技持ちのみ true", () => {
    expect(isMimicableSkillSource({ subtype: "archer", hp: 10 })).toBe(true);
    expect(isMimicableSkillSource({ subtype: "wanduser", wandEffect: "lightning", hp: 10 })).toBe(true);
    expect(isMimicableSkillSource({ subtype: "mimic", hp: 10 })).toBe(false);
    expect(isMimicableSkillSource({ subtype: "runner", hp: 10 })).toBe(false);
    expect(isMimicableSkillSource({ subtype: "reflector", hp: 10 })).toBe(false);
    expect(isMimicableSkillSource({ type: "shopkeeper", hp: 10 })).toBe(false);
    expect(isMimicableSkillSource({ subtype: "thief", hp: 0 })).toBe(false);
  });

  it("getAdjacentMimicSources は隣接する特技持ちのみ返す", () => {
    const mimic = { id: "mim", name: "ものまね師", subtype: "mimic", x: 5, y: 5, hp: 20 };
    const archer = { id: "a1", name: "アーチャー", subtype: "archer", x: 6, y: 5, hp: 20 };
    const far = { id: "a2", name: "アーチャー", subtype: "archer", x: 8, y: 5, hp: 20 };
    const rat = { id: "r1", name: "ネズミ", x: 5, y: 6, hp: 5 };
    const dg = makeEmptyDg({
      monsters: [mimic, archer, far, rat],
    });
    const src = getAdjacentMimicSources(mimic, dg);
    expect(src.map((s) => s.id)).toEqual(["a1"]);
  });

  it("隣接アーチャーがいれば50%でものまねして矢を撃つ", () => {
    const map = Array.from({ length: 15 }, () => Array(20).fill(T.FLOOR));
    const rooms = [{ x: 1, y: 1, w: 12, h: 12 }];
    const mimic = {
      id: "mim", name: "ものまね師", subtype: "mimic", baseKind: "mimic",
      x: 5, y: 5, hp: 30, maxHp: 30, atk: 15, def: 3, exp: 50,
      speed: 1, baseSpeed: 1, monLevel: 1, turnAttacks: 0, aware: true,
      sealed: false,
    };
    const archer = {
      id: "arc", name: "アーチャー", subtype: "archer", baseKind: "archer",
      x: 6, y: 5, hp: 20, maxHp: 20, atk: 10, def: 2, monLevel: 1,
    };
    const pl = makePlayer({ x: 5, y: 8 }); /* 縦一直線・距離3 */
    const dg = makeEmptyDg({
      map, rooms,
      monsters: [mimic, archer],
      traps: [], items: [], pentacles: [],
      visible: Array.from({ length: 15 }, () => Array(20).fill(true)),
    });
    const ml = [];
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.1); /* < 0.5 → ものまね */
    try {
      const used = tryMimicAdjacentSkill(mimic, dg, pl, ml, {}, {
        canSee: true,
        plOnBlessedSanc: false,
        sameRoom: true,
      });
      expect(used).toBe(true);
      expect(ml.some((m) => String(m).includes("ものまね"))).toBe(true);
      expect(mimic.subtype).toBe("mimic"); /* 復元されている */
    } finally {
      rnd.mockRestore();
    }
  });

  it("隣接特技持ちがいなければものまねしない", () => {
    const mimic = {
      id: "mim", name: "ものまね師", subtype: "mimic", baseKind: "mimic",
      x: 5, y: 5, hp: 30, maxHp: 30, atk: 15, def: 3, turnAttacks: 0,
    };
    const rat = { id: "r1", name: "ネズミ", x: 6, y: 5, hp: 5 };
    const dg = makeEmptyDg({ monsters: [mimic, rat] });
    const pl = makePlayer({ x: 8, y: 8 });
    const ml = [];
    expect(tryMimicAdjacentSkill(mimic, dg, pl, ml, {}, { canSee: true })).toBe(false);
    expect(ml.length).toBe(0);
  });

  it("封印中はものまねしない", () => {
    const mimic = {
      id: "mim", name: "ものまね師", subtype: "mimic", sealed: true,
      x: 5, y: 5, hp: 30, turnAttacks: 0,
    };
    const archer = { id: "a", name: "アーチャー", subtype: "archer", x: 6, y: 5, hp: 10 };
    const dg = makeEmptyDg({ monsters: [mimic, archer] });
    expect(tryMimicAdjacentSkill(mimic, dg, makePlayer({ x: 5, y: 8 }), [], {}, { canSee: true })).toBe(false);
  });
});
