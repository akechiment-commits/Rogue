import { afterEach, describe, expect, it, vi } from "vitest";
import { applyWandEffect } from "../wands.js";
import { BB_TYPES, clearPitfallBag, setPitfallBag, placeItemAt } from "../items.js";
import { placeFallenEntities } from "../pitfallPlacement.js";
import { processPitfallBag } from "../render.js";
import { T, TI } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => { vi.restoreAllMocks(); clearPitfallBag(); });
function makeBox(kind = "synthesis", x = 7, y = 5) {
  return { id: "box", kind, name: BB_TYPES.find(b => b.kind === kind).name, tile: TI.BIGBOX,
    capacity: 3, contents: [{ id: "stored", type: "potion", name: "炎の薬", effect: "fire", value: 30 }], x, y };
}
function makeTrap(effect, x = 17, y = 5) {
  return { id: `trap-${x}-${y}`, name: `${effect}の罠`, effect, x, y, permanent: true, revealed: false };
}
function blow(box, dg, player, logs = [], { blessed = false, enemy = false } = {}) {
  const caster = enemy ? { id: "caster", name: "風術師", x: 5, y: 5, hp: 100, maxHp: 100 } : null;
  if (caster) dg.monsters.push(caster);
  applyWandEffect("knockback", "bigbox", box, 1, 0, dg, player, logs, () => {}, null,
    blessed ? 2 : 1, null, 0, caster, null, !enemy);
}

describe("吹き飛ばされた大箱の通過と着地", () => {
  it.each(["pitfall", "explode", "rust"])("途中の%sを通過し、射程端へ中身ごと着地する", effect => {
    const box = makeBox();
    const trap = makeTrap(effect, 8);
    const dg = makeEmptyDg({ rooms: [], bigboxes: [box], traps: [trap] });
    const player = makePlayer({ x: 5, y: 5 });
    blow(box, dg, player);
    expect(dg.bigboxes).toEqual([box]);
    expect([box.x, box.y]).toEqual([17, 5]);
    expect(box.contents[0].id).toBe("stored");
    expect(dg.items).toEqual([]);
    expect(trap.revealed).toBe(false);
  });

  it.each(BB_TYPES.map(b => b.kind))("%sは着地した落とし穴で下階へ移り、箱と中身を維持する", kind => {
    const box = makeBox(kind);
    const trap = makeTrap("pitfall");
    const dg = makeEmptyDg({ rooms: [], bigboxes: [box], traps: [trap] });
    const player = makePlayer({ x: 5, y: 5, depth: 1 });
    const bag = [];
    const logs = [];
    setPitfallBag(bag);
    blow(box, dg, player, logs);
    expect(trap.revealed).toBe(true);
    expect(dg.bigboxes).toEqual([]);
    expect(dg.items).toEqual([]);
    expect(bag).toEqual([{ kind: "bigbox", entity: box }]);
    const below = makeEmptyDg();
    const state = { player, dungeon: dg, floors: { 2: below } };
    processPitfallBag(bag, state.floors, 1, state);
    expect(below.bigboxes).toEqual([box]);
    expect(below.items).toEqual([]);
    expect(below.monsters).toEqual([]);
    expect(box.contents[0].id).toBe("stored");
    expect(logs.join(" ")).not.toMatch(/壊れた|爆発！/);
  });

  it.each(["synthesis", "nitro"])("%sが地雷へ着地すると箱ごと消費し、中身の散乱・追加爆発を起こさない", kind => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const box = makeBox(kind);
    const trap = makeTrap("explode");
    const dg = makeEmptyDg({ rooms: [], bigboxes: [box], traps: [trap] });
    const player = makePlayer({ x: 18, y: 5, hp: 100 });
    const logs = [];
    blow(box, dg, player, logs, { enemy: true });
    expect(dg.bigboxes).toEqual([]);
    expect(dg.items).toEqual([]);
    expect(player.hp).toBe(50);
    expect(logs.filter(m => m.includes("が発動！"))).toHaveLength(1);
    expect(logs.join(" ")).not.toContain("ニトロ箱が爆発");
  });

  it("着地時の錆罠は1回だけ起動し、その後は隣の空き床へ大箱として置く", () => {
    const box = makeBox();
    const trap = makeTrap("rust");
    const dg = makeEmptyDg({ rooms: [], bigboxes: [box], traps: [trap] });
    const logs = [];
    blow(box, dg, makePlayer({ x: 5, y: 5 }), logs);
    expect(trap.revealed).toBe(true);
    expect(logs.filter(m => m.includes("が発動！"))).toHaveLength(1);
    expect(dg.bigboxes).toEqual([box]);
    expect([box.x, box.y]).not.toEqual([17, 5]);
    expect(dg.items).toEqual([]);
  });

  it.each(["spin", "steal_trap"])("%sによる再配置も大箱のままで二重配置しない", effect => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const box = makeBox();
    const dg = makeEmptyDg({ rooms: [{ x: 20, y: 10, w: 4, h: 4 }], bigboxes: [box], traps: [makeTrap(effect)] });
    blow(box, dg, makePlayer({ x: 5, y: 5 }));
    expect(dg.bigboxes).toEqual([box]);
    expect(dg.items).toEqual([]);
    expect(box.x).toBeGreaterThanOrEqual(20);
    expect(box.y).toBeGreaterThanOrEqual(10);
    expect(box.contents[0].id).toBe("stored");
  });

  it("祝福された杖でも途中の罠を通過してプレイヤーへ衝突する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const box = makeBox();
    box.contents = [];
    const trap = makeTrap("pitfall", 8);
    const dg = makeEmptyDg({ rooms: [], bigboxes: [box], traps: [trap] });
    const player = makePlayer({ x: 20, y: 5 });
    blow(box, dg, player, [], { blessed: true, enemy: true });
    expect(player.hp).toBe(78);
    expect(trap.revealed).toBe(false);
    expect(dg.bigboxes).toEqual([]);
  });

  it("時間停止中は着地した罠を起動せず、重ならない空き床へ置く", () => {
    const box = makeBox();
    const trap = makeTrap("pitfall");
    const dg = makeEmptyDg({ rooms: [], timeStopTurns: 3, bigboxes: [box], traps: [trap] });
    const bag = [];
    setPitfallBag(bag);
    blow(box, dg, makePlayer({ x: 5, y: 5 }));
    expect(trap.revealed).toBe(false);
    expect(bag).toEqual([]);
    expect(dg.bigboxes).toEqual([box]);
    expect([box.x, box.y]).not.toEqual([trap.x, trap.y]);
  });

  it("再配置で敵・プレイヤー・他の大箱・泉・水と重ねず、道具一覧にも混ぜない", () => {
    const box = makeBox();
    const player = makePlayer({ x: 5, y: 5 });
    const dg = makeEmptyDg({ monsters: [{ x: 5, y: 4, hp: 10 }],
      bigboxes: [makeBox("nitro", 5, 6)], springs: [{ x: 4, y: 5, name: "泉", kind: "water" }] });
    dg.map[5][6] = T.WATER;
    placeItemAt(dg, 5, 5, box, [], new Set(), 0, player);
    expect(dg.bigboxes).toContain(box);
    expect(dg.items).toEqual([]);
    expect(dg.waterItems || []).toEqual([]);
    expect([box.x, box.y]).not.toEqual([5, 5]);
    expect(dg.map[box.y][box.x]).toBe(T.FLOOR);
  });

  it("下階に空きがなければ箱を待機保存し、セーブ後の再試行で中身ごと配置する", () => {
    const box = makeBox();
    const map = Array.from({ length: 4 }, () => Array(4).fill(T.WALL));
    map[1][1] = T.FLOOR;
    const blocker = { id: "blocker", x: 1, y: 1, name: "道具" };
    let dg = makeEmptyDg({ map, items: [blocker] });
    placeFallenEntities(dg, [{ kind: "bigbox", entity: box }]);
    expect(dg.pendingPitfalls).toHaveLength(1);
    expect(dg.bigboxes).toEqual([]);
    dg = JSON.parse(JSON.stringify(dg));
    dg.items = [];
    placeFallenEntities(dg);
    expect(dg.pendingPitfalls).toEqual([]);
    expect(dg.bigboxes).toHaveLength(1);
    expect(dg.bigboxes[0].contents[0].id).toBe("stored");
    expect(dg.items).toEqual([]);
  });
});
