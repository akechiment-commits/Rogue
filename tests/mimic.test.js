import { describe, it, expect, vi } from "vitest";
import {
  MONS,
  isMimicableSkillSource,
  getAdjacentMimicSources,
  canMimicSourceSkill,
  tryMimicAdjacentSkill,
} from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function makeRoomMap() {
  const map = Array.from({ length: 15 }, () => Array(20).fill(T.FLOOR));
  const rooms = [{ x: 1, y: 1, w: 12, h: 12 }];
  return { map, rooms };
}

function makeMimic(x = 5, y = 5) {
  return {
    id: "mim", name: "ものまね師", subtype: "mimic", baseKind: "mimic",
    x, y, hp: 30, maxHp: 30, atk: 15, def: 3, exp: 50,
    speed: 1, baseSpeed: 1, monLevel: 1, turnAttacks: 0, aware: true,
    sealed: false,
  };
}

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
    expect(isMimicableSkillSource({ subtype: "pentaclePainter", hp: 10 })).toBe(true);
    expect(isMimicableSkillSource({ baseKind: "dragon", hp: 10 })).toBe(true);
    expect(isMimicableSkillSource({ subtype: "mimic", hp: 10 })).toBe(false);
    expect(isMimicableSkillSource({ subtype: "runner", hp: 10 })).toBe(false);
    expect(isMimicableSkillSource({ subtype: "reflector", hp: 10 })).toBe(false);
    expect(isMimicableSkillSource({ type: "shopkeeper", hp: 10 })).toBe(false);
    expect(isMimicableSkillSource({ subtype: "thief", hp: 0 })).toBe(false);
    expect(isMimicableSkillSource({ subtype: "archer", hp: 10, sealed: true })).toBe(false);
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

  it("canMimicSourceSkill: アーチャーは一直線上のみ", () => {
    const mimic = makeMimic(5, 5);
    const archer = { name: "アーチャー", subtype: "archer", monLevel: 1 };
    const { map, rooms } = makeRoomMap();
    const dg = makeEmptyDg({ map, rooms, monsters: [mimic] });
    const ctx = { canSee: true, sameRoom: true, plOnBlessedSanc: false };
    expect(canMimicSourceSkill(archer, mimic, dg, makePlayer({ x: 5, y: 8 }), {}, ctx)).toBe(true);
    expect(canMimicSourceSkill(archer, mimic, dg, makePlayer({ x: 7, y: 8 }), {}, ctx)).toBe(false);
  });

  it("canMimicSourceSkill: ラクガキ魔は認識していればどこでも", () => {
    const mimic = makeMimic(5, 5);
    const painter = { name: "ラクガキ魔", subtype: "pentaclePainter", monLevel: 1 };
    const { map, rooms } = makeRoomMap();
    const dg = makeEmptyDg({ map, rooms, monsters: [mimic] });
    expect(canMimicSourceSkill(painter, mimic, dg, makePlayer({ x: 9, y: 9 }), {}, { canSee: true })).toBe(true);
    expect(canMimicSourceSkill(painter, mimic, dg, makePlayer({ x: 9, y: 9 }), {}, { canSee: false })).toBe(false);
  });

  it("canMimicSourceSkill: ルカチュウは同部屋のみ", () => {
    const mimic = makeMimic(5, 5);
    const luk = { name: "ルカチュウ", subtype: "defhalf", monLevel: 1 };
    const { map, rooms } = makeRoomMap();
    const dg = makeEmptyDg({ map, rooms, monsters: [mimic] });
    expect(canMimicSourceSkill(luk, mimic, dg, makePlayer({ x: 8, y: 8 }), {}, { canSee: true, sameRoom: true })).toBe(true);
    expect(canMimicSourceSkill(luk, mimic, dg, makePlayer({ x: 8, y: 8 }), {}, { canSee: true, sameRoom: false })).toBe(false);
  });

  it("canMimicSourceSkill: ワッカは射程内のみ", () => {
    const mimic = makeMimic(5, 5);
    const wokka = { name: "ワッカ", subtype: "stonethrow", monLevel: 1 }; /* range 3 */
    const { map, rooms } = makeRoomMap();
    const dg = makeEmptyDg({ map, rooms, monsters: [mimic] });
    const ctx = { canSee: true, plOnBlessedSanc: false };
    expect(canMimicSourceSkill(wokka, mimic, dg, makePlayer({ x: 7, y: 6 }), {}, ctx)).toBe(true); /* dist 2 */
    expect(canMimicSourceSkill(wokka, mimic, dg, makePlayer({ x: 10, y: 5 }), {}, ctx)).toBe(false); /* dist 5 */
  });

  it("canMimicSourceSkill: 隣接限定特技は隣接時のみ", () => {
    const mimic = makeMimic(5, 5);
    const trip = { name: "足払い鬼", subtype: "tripper", monLevel: 1 };
    const { map, rooms } = makeRoomMap();
    const dg = makeEmptyDg({ map, rooms, monsters: [mimic] });
    expect(canMimicSourceSkill(trip, mimic, dg, makePlayer({ x: 6, y: 5 }), {}, { canSee: true })).toBe(true);
    expect(canMimicSourceSkill(trip, mimic, dg, makePlayer({ x: 8, y: 5 }), {}, { canSee: true })).toBe(false);
  });

  it("隣接アーチャーがいれば50%でものまねして矢を撃つ", () => {
    const { map, rooms } = makeRoomMap();
    const mimic = makeMimic(5, 5);
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
      expect(ml.some((m) => String(m).includes("攻撃！"))).toBe(false);
      expect(mimic.subtype).toBe("mimic"); /* 復元されている */
    } finally {
      rnd.mockRestore();
    }
  });

  it("ラクガキ魔の真似：空床なら魔方陣を描き、通常攻撃しない", () => {
    const { map, rooms } = makeRoomMap();
    const mimic = makeMimic(5, 5);
    const painter = {
      id: "p1", name: "ラクガキ魔", subtype: "pentaclePainter", baseKind: "rakugakima",
      x: 6, y: 5, hp: 20, monLevel: 1,
    };
    const pl = makePlayer({ x: 9, y: 9 }); /* 非一直線・非隣接でも可 */
    const dg = makeEmptyDg({
      map, rooms,
      monsters: [mimic, painter],
      traps: [], items: [], pentacles: [],
      visible: Array.from({ length: 15 }, () => Array(20).fill(true)),
    });
    const ml = [];
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      const used = tryMimicAdjacentSkill(mimic, dg, pl, ml, {}, {
        canSee: true, sameRoom: true, plOnBlessedSanc: false,
      });
      expect(used).toBe(true);
      expect(ml.some((m) => String(m).includes("ものまね"))).toBe(true);
      expect(ml.some((m) => String(m).includes("を描いた"))).toBe(true);
      expect(dg.pentacles.length).toBe(1);
      expect(ml.some((m) => String(m).includes("攻撃！"))).toBe(false);
      expect(mimic.turnAttacks).toBe(1);
    } finally {
      rnd.mockRestore();
    }
  });

  it("ラクガキ魔の真似：足元に物があれば失敗メッセージで行動消費（通常攻撃しない）", () => {
    const { map, rooms } = makeRoomMap();
    map[5][5] = T.SD; /* 階段上 */
    const mimic = makeMimic(5, 5);
    const painter = {
      id: "p1", name: "ラクガキ魔", subtype: "pentaclePainter", baseKind: "rakugakima",
      x: 6, y: 5, hp: 20, monLevel: 1,
    };
    const pl = makePlayer({ x: 6, y: 5 }); /* 隣接でも攻撃に落ちない */
    const dg = makeEmptyDg({
      map, rooms,
      monsters: [mimic, painter],
      traps: [], items: [], pentacles: [],
      visible: Array.from({ length: 15 }, () => Array(20).fill(true)),
    });
    const ml = [];
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      const used = tryMimicAdjacentSkill(mimic, dg, pl, ml, {}, {
        canSee: true, sameRoom: true, plOnBlessedSanc: false,
      });
      expect(used).toBe(true);
      expect(ml.some((m) => String(m).includes("ものまね"))).toBe(true);
      expect(ml.some((m) => String(m).includes("失敗"))).toBe(true);
      expect(dg.pentacles.length).toBe(0);
      expect(ml.some((m) => String(m).includes("攻撃！"))).toBe(false);
      expect(mimic.turnAttacks).toBe(1);
    } finally {
      rnd.mockRestore();
    }
  });

  it("条件外のアーチャーはものまねしない（宣言も出ない）", () => {
    const { map, rooms } = makeRoomMap();
    const mimic = makeMimic(5, 5);
    const archer = {
      id: "arc", name: "アーチャー", subtype: "archer", baseKind: "archer",
      x: 6, y: 5, hp: 20, monLevel: 1,
    };
    const pl = makePlayer({ x: 7, y: 9 }); /* 非一直線（縦横斜めいずれも不一致） */
    const dg = makeEmptyDg({
      map, rooms, monsters: [mimic, archer], traps: [], items: [], pentacles: [],
    });
    const ml = [];
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      expect(tryMimicAdjacentSkill(mimic, dg, pl, ml, {}, {
        canSee: true, sameRoom: true, plOnBlessedSanc: false,
      })).toBe(false);
      expect(ml.length).toBe(0);
    } finally {
      rnd.mockRestore();
    }
  });

  it("隣接特技持ちがいなければものまねしない", () => {
    const mimic = makeMimic(5, 5);
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
