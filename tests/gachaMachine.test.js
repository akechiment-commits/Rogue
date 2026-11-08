import { describe, expect, it } from "vitest";
import { MH, MW, T } from "../utils.js";
import { GACHA_BOX_SLOTS, GACHA_BOX_TOTAL, GACHA_RARITY_RATES, createGachaBox, drawFromGachaBox, getGachaBoxRemaining, isInsideGachaShop, pickGachaTemplate, rollGachaRarity } from "../gachaRules.js";
import { placeGachaMachine } from "../dungeon.js";
import { breakGachaMachine, makeGachaPrize } from "../items.js";

function emptyDungeon() {
  return {
    map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
    monsters: [], items: [], traps: [], springs: [], bigboxes: [], pentacles: [], statues: [], vents: [],
    stairUp: null, stairDown: null, gachaMachines: [], shops: [], shop: null,
  };
}

describe("ガチャマシーン", () => {
  it("レア度別の抽選率と境界を正しく判定する", () => {
    expect(GACHA_RARITY_RATES).toEqual({ A: 0.02, B: 0.05, C: 0.10 });
    expect(rollGachaRarity(() => 0.019)).toBe("A");
    expect(rollGachaRarity(() => 0.02)).toBe("B");
    expect(rollGachaRarity(() => 0.069)).toBe("B");
    expect(rollGachaRarity(() => 0.07)).toBe("C");
    expect(rollGachaRarity(() => 0.169)).toBe("C");
    expect(rollGachaRarity(() => 0.17)).toBeNull();
  });

  it("重み付き景品候補を抽選できる", () => {
    const pool = [{ name: "安価", weight: 9 }, { name: "当たり", weight: 1 }];
    expect(pickGachaTemplate(pool, () => 0.95).name).toBe("当たり");
  });

  it("フロア生成後に最大1台だけ配置する", () => {
    const dg = emptyDungeon();
    const machine = placeGachaMachine(dg, () => 0);
    expect(machine?.type).toBe("gacha");
    expect(dg.gachaMachines).toHaveLength(1);
    expect(placeGachaMachine(dg, () => 0)).toBeNull();
  });

  it("店内判定は登録された店の部屋だけを対象にする", () => {
    const dg = emptyDungeon();
    dg.shops = [{ id: "shop-1", room: { x: 2, y: 2, w: 4, h: 4 } }];
    const machine = { type: "gacha", shopId: "shop-1", x: 3, y: 3 };
    expect(isInsideGachaShop(machine, dg)).toBe(true);
    expect(isInsideGachaShop(machine, dg, 8, 8)).toBe(false);
  });

  it("壊れると通常の床配置で景品を1個だけ落とす", () => {
    const dg = emptyDungeon();
    const machine = { type: "gacha", kind: "gacha_machine", name: "ガチャマシーン", x: 5, y: 5 };
    dg.gachaMachines.push(machine);
    const ml = [];
    expect(breakGachaMachine(machine, dg, ml)).toBe(true);
    expect(dg.gachaMachines).toHaveLength(0);
    expect(dg.items).toHaveLength(1);
    expect(ml.join("\n")).toContain("ガチャマシーンが壊れた");
  });

  it("指定レア度の景品だけを選ぶ", () => {
    for (const rarity of ["A", "B", "C", "D", "E"]) {
      expect(makeGachaPrize(rarity).rarity).toBe(rarity);
    }
  });
  it("各マシーンに100個のBox（A:2, B:5, C:15, D:30, E:48）が設定され、1回引くごとに減る", () => {
    expect(GACHA_BOX_TOTAL).toBe(100);
    expect(GACHA_BOX_SLOTS).toEqual({ A: 2, B: 5, C: 15, D: 30, E: 48 });

    const box = createGachaBox();
    expect(box).toHaveLength(100);
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const r of box) counts[r]++;
    expect(counts).toEqual({ A: 2, B: 5, C: 15, D: 30, E: 48 });

    const machine = { type: "gacha", box };
    expect(getGachaBoxRemaining(machine)).toBe(100);

    const first = drawFromGachaBox(machine);
    expect(["A", "B", "C", "D", "E"]).toContain(first);
    expect(getGachaBoxRemaining(machine)).toBe(99);

    // 残り99回引いて全て取り出せること
    const drawn = [first];
    for (let i = 0; i < 99; i++) {
      drawn.push(drawFromGachaBox(machine));
    }
    expect(getGachaBoxRemaining(machine)).toBe(0);
    expect(drawFromGachaBox(machine)).toBeNull();

    const drawnCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const r of drawn) drawnCounts[r]++;
    expect(drawnCounts).toEqual({ A: 2, B: 5, C: 15, D: 30, E: 48 });
  });

  it("フロア生成時に配置されたガチャマシーンは100個のBoxを所持している", () => {
    const dg = emptyDungeon();
    const machine = placeGachaMachine(dg, () => 0);
    expect(machine.box).toBeDefined();
    expect(machine.box).toHaveLength(100);
    expect(getGachaBoxRemaining(machine)).toBe(100);
  });
});
