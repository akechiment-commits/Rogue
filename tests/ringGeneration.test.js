import { afterEach, describe, expect, it, vi } from "vitest";
import { applyGeneratedRingPlus, breakBigboxContents, extractPotContents, monsterDrop, placeItemAt, scatterPotContents } from "../items.js";
import { genDebugDungeon, genDebugDungeonFloor2 } from "../dungeon.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { makeWishedItem } from "../wish.js";

afterEach(() => vi.restoreAllMocks());

const PLUS_RING_EFFECTS = new Set(["power_ring", "defense_ring", "life_ring"]);

describe("力・守り・命の指輪の生成値", () => {
  it("生成時に＋1〜3を付け、他の指輪は変更しない", () => {
    expect(applyGeneratedRingPlus({ type: "ring", effect: "power_ring", plus: 0 }, () => 0).plus).toBe(1);
    expect(applyGeneratedRingPlus({ type: "ring", effect: "life_ring", plus: 0 }, () => 0.99).plus).toBe(3);
    expect(applyGeneratedRingPlus({ type: "ring", effect: "defense_ring", plus: 2 }, () => 0).plus).toBe(2);
    expect(applyGeneratedRingPlus({ type: "ring", effect: "float_ring" }, () => 0).plus).toBeUndefined();
  });

  it("デバッグ用に並ぶ指輪も＋値付きで生成する", () => {
    for (const floor of [genDebugDungeon(), genDebugDungeonFloor2()]) {
      const rings = floor.items.filter(item => PLUS_RING_EFFECTS.has(item.effect));
      expect(rings.length).toBeGreaterThan(0);
      expect(rings.every(item => item.plus >= 1 && item.plus <= 3)).toBe(true);
    }
  });
  it("願いで新しく作る命の指輪にも初期＋値を付ける", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const ring = makeWishedItem({ name: "命の指輪", type: "ring", effect: "life_ring", plus: 0 });
    expect(ring.plus).toBe(2);
    expect(ring.fullIdent).toBe(true);
  });
  it.each(["power_ring", "defense_ring", "life_ring"])("既存の%sは床へ置いても0・負の＋値を抽選し直さない", effect => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (const plus of [0, -1, -100]) {
      const ring = { id: `existing-${plus}`, name: "指輪", type: "ring", effect, plus };
      const dg = makeEmptyDg();
      placeItemAt(dg, 5, 5, ring, [], new Set());
      expect(dg.items).toContain(ring);
      expect(ring.plus).toBe(plus);
    }
  });
  it.each(["pot", "box", "extract", "monster"])("%sから出た既存の指輪にも負の＋値が残る", route => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const ring = { id: "stored-ring", name: "命の指輪", type: "ring", effect: "life_ring", plus: -2 };
    const player = makePlayer(), dg = makeEmptyDg();
    const pot = { name: "保存の壺", type: "pot", potEffect: "none", capacity: 3, contents: [ring] };
    if (route === "pot") scatterPotContents(pot, dg, 5, 5, player, [], vi.fn());
    if (route === "extract") extractPotContents(pot, dg, 5, 5, player, [], vi.fn(), false);
    if (route === "box") {
      const box = { id: "box", name: "大箱", kind: "normal", x: 5, y: 5, contents: [ring] };
      dg.bigboxes.push(box);
      breakBigboxContents(box, dg, [], null, null, null, { player });
    }
    if (route === "monster") monsterDrop({ name: "盗投士", baseKind: "stealthrower", x: 5, y: 5, _stealthrowerHeldItem: ring }, dg, [], player);
    expect(dg.items).toContain(ring);
    expect(ring.plus).toBe(-2);
  });
});
