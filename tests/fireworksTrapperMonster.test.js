import { describe, it, expect, vi, afterEach } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI, TRAPMASTER_STOCK_MAX, trapmasterStockLeft } from "../monsters.js";
import { applySpellEffect, tickDamagedFoodReveals } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { MW, MH, T } from "../utils.js";

function makeRoomDg(overrides = {}) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const room = { x: 2, y: 2, w: 12, h: 10 };
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      map[y][x] = T.FLOOR;
    }
  }
  return {
    map,
    rooms: [room],
    visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    monsters: [],
    items: [],
    traps: [],
    springs: [],
    bigboxes: [],
    pentacles: [],
    oilyTiles: [],
    waterItems: [],
    pendingBombs: [],
    specialProjectiles: [],
    ...overrides,
  };
}

function makePlayer(overrides = {}) {
  return {
    name: "勇者",
    x: 3,
    y: 3,
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 5,
    depth: 10,
    inventory: [],
    rings: [],
    ...overrides,
  };
}

describe("仕掛け花火師系（旧罠師系）のテスト", () => {
  const base = MONS.find((m) => m.baseKind === "trapmaster");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("基本定義が正しく設定されている（humanoid、氷弱点、Lv1〜3名称、subtype）", () => {
    expect(base).toBeDefined();
    expect(base.name).toBe("仕掛け花火師");
    expect(base.kind).toBe("humanoid");
    expect(base.elemWeak).toBe("ice");
    expect(base.subtype).toBe("trapmaster");
    expect(base.tile).toBe(150);

    expect(base.levels).toHaveLength(2);
    expect(base.levels[0].name).toBe("爆導師");
    expect(base.levels[1].name).toBe("煙火覇王");
  });

  it("makeMonsterFromBase で各レベルが正しく生成され、初期罠在庫を持つ", () => {
    const lv1 = makeMonsterFromBase(base, 1, 0, 0);
    expect(lv1.name).toBe("仕掛け花火師");
    expect(lv1.kind).toBe("humanoid");
    expect(lv1.elemWeak).toBe("ice");
    expect(lv1.hp).toBe(32);
    expect(lv1.atk).toBe(16);
    expect(lv1.def).toBe(7);
    expect(lv1.trapmasterStock).toBe(TRAPMASTER_STOCK_MAX);
    expect(trapmasterStockLeft(lv1)).toBe(TRAPMASTER_STOCK_MAX);

    const lv2 = makeMonsterFromBase(base, 2, 0, 0);
    expect(lv2.name).toBe("爆導師");
    expect(lv2.kind).toBe("humanoid");
    expect(lv2.elemWeak).toBe("ice");
    expect(lv2.hp).toBe(54);
    expect(lv2.atk).toBe(34);
    expect(lv2.def).toBe(20);
    expect(lv2.trapmasterStock).toBe(TRAPMASTER_STOCK_MAX);

    const lv3 = makeMonsterFromBase(base, 3, 0, 0);
    expect(lv3.name).toBe("煙火覇王");
    expect(lv3.kind).toBe("humanoid");
    expect(lv3.elemWeak).toBe("ice");
    expect(lv3.hp).toBe(78);
    expect(lv3.atk).toBe(58);
    expect(lv3.def).toBe(32);
    expect(lv3.trapmasterStock).toBe(TRAPMASTER_STOCK_MAX);
  });

  it("通常時は未発見の罠（revealed: false）を作成する", () => {
    const mon = makeMonsterFromBase(base, 1, 8, 6);
    const dg = makeRoomDg({ monsters: [mon] });
    const pl = makePlayer();
    const ml = [];
    vi.spyOn(Math, "random").mockReturnValue(0);

    monsterAI(mon, dg, pl, ml, { moveOnly: true });

    expect(dg.traps).toHaveLength(1);
    expect(dg.traps[0].revealed).toBe(false);
    expect(mon.trapmasterStock).toBe(TRAPMASTER_STOCK_MAX - 1);
  });

  it("主人公が罠見え状態（罠探知の魔法・呪われた惑わしの杖・一時看破）のときは見える罠を作成する", () => {
    // 1) 罠探知の魔法
    const mon1 = makeMonsterFromBase(base, 1, 8, 6);
    const dg1 = makeRoomDg({ monsters: [mon1] });
    const pl1 = makePlayer();
    const ml1 = [];
    applySpellEffect("trap_detect_magic", "self", null, 0, 0, dg1, pl1, ml1, () => {}, 1);
    expect(dg1.trapsRevealed).toBe(true);
    vi.spyOn(Math, "random").mockReturnValue(0);
    monsterAI(mon1, dg1, pl1, ml1, { moveOnly: true });
    expect(dg1.traps).toHaveLength(1);
    expect(dg1.traps[0].revealed).toBe(true);

    // 2) 呪われた惑わしの杖を自分へ
    const mon2 = makeMonsterFromBase(base, 1, 9, 6);
    const dg2 = makeRoomDg({ monsters: [mon2] });
    const pl2 = makePlayer();
    applyWandEffect("bewitch", "player", pl2, 0, 0, dg2, pl2, [], () => {}, () => {}, 0.5);
    expect(dg2.trapsRevealed).toBe(true);
    monsterAI(mon2, dg2, pl2, [], { moveOnly: true });
    expect(dg2.traps).toHaveLength(1);
    expect(dg2.traps[0].revealed).toBe(true);

    // 3) 一時看破（foodTrapRevealTurns）中は一時的に見え、期限切れで隠れる
    const mon3 = makeMonsterFromBase(base, 1, 10, 6);
    const dg3 = makeRoomDg({ monsters: [mon3], foodTrapRevealTurns: 1 });
    const pl3 = makePlayer();
    monsterAI(mon3, dg3, pl3, [], { moveOnly: true });
    expect(dg3.traps).toHaveLength(1);
    expect(dg3.traps[0].revealed).toBe(true);
    expect(dg3.traps[0]._foodTemporaryReveal).toBe(true);
    tickDamagedFoodReveals(dg3);
    expect(dg3.traps[0].revealed).toBe(false);
  });

  it("罠づくりは在庫制で、失敗時は消費せず在庫0になると作成しない", () => {
    const mon = makeMonsterFromBase(base, 2, 8, 6);
    const dg = makeRoomDg({
      monsters: [mon],
      items: [{ id: "blocker", name: "石", type: "arrow", x: 8, y: 6 }],
    });
    const pl = makePlayer();
    const ml = [];
    vi.spyOn(Math, "random").mockReturnValue(0);

    // 足元が塞がっている失敗ターンは在庫を減らさない
    monsterAI(mon, dg, pl, ml, { moveOnly: true });
    expect(dg.traps).toHaveLength(0);
    expect(mon.trapmasterStock).toBe(TRAPMASTER_STOCK_MAX);
    expect(ml.some((m) => m.includes("失敗した"))).toBe(true);

    // 障害物を除いて別の空きマスへ移しながら在庫分（4回）まで作成し、5回目は作らない
    dg.items = [];
    for (let i = 0; i < TRAPMASTER_STOCK_MAX; i++) {
      mon.x = 6 + i;
      mon.y = 6;
      mon.turnAttacks = 0;
      monsterAI(mon, dg, pl, ml, { moveOnly: true });
    }
    expect(dg.traps).toHaveLength(TRAPMASTER_STOCK_MAX);
    expect(mon.trapmasterStock).toBe(0);

    mon.x = 11;
    mon.y = 6;
    mon.turnAttacks = 0;
    monsterAI(mon, dg, pl, ml, { moveOnly: true });
    expect(dg.traps).toHaveLength(TRAPMASTER_STOCK_MAX);
    expect(mon.trapmasterStock).toBe(0);
  });

  it("ものまね師が仕掛け花火師をコピーしたときも罠見え状態と在庫制に従う", () => {
    const mimicBase = MONS.find((m) => m.subtype === "mimic");
    const mimic = makeMonsterFromBase(mimicBase, 1, 6, 5);
    mimic.alwaysUseSpecial = true;
    mimic.trapmasterStock = 1;
    const trapper = makeMonsterFromBase(base, 1, 7, 5);
    const dg = makeRoomDg({ monsters: [mimic, trapper] });
    const pl = makePlayer({ x: 5, y: 5 });
    const ml = [];
    vi.spyOn(Math, "random").mockReturnValue(0);

    // 通常時は未発見の罠を作り在庫を1消費
    monsterAI(mimic, dg, pl, ml, { attackOnly: true });
    expect(dg.traps).toHaveLength(1);
    expect(dg.traps[0].revealed).toBe(false);
    expect(mimic.trapmasterStock).toBe(0);

    // 在庫0後は再度罠を作らない
    mimic.turnAttacks = 0;
    monsterAI(mimic, dg, pl, ml, { attackOnly: true });
    expect(dg.traps).toHaveLength(1);

    // 罠見え状態で在庫を回復してコピーすると発見済みの罠を作る
    dg.trapsRevealed = true;
    mimic.trapmasterStock = 1;
    mimic.turnAttacks = 0;
    monsterAI(mimic, dg, pl, ml, { attackOnly: true });
    expect(dg.traps).toHaveLength(2);
    expect(dg.traps[1].revealed).toBe(true);
    expect(mimic.trapmasterStock).toBe(0);
  });
});
