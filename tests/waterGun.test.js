import { describe, it, expect } from "vitest";
import {
  TRAPS,
  ARMOR_ABILITIES,
  ITEMS,
  hasWaterProof,
  applyWaterGunToInventory,
  applySoakedStatus,
  applySoakedFromWaterWalk,
  shrinkFoodOneStep,
  blankScrollOrSpellbook,
} from "../items.js";
import { fireTrapPlayer } from "../traps.js";
import { msgToActionKey } from "../portraits.js";
import { PORTRAIT_CATEGORIES } from "../portraitCatalog.js";
import { T } from "../utils.js";

describe("水鉄砲・耐水", () => {
  it("水鉄砲の罠が TRAPS にある", () => {
    const t = TRAPS.find((x) => x.effect === "watergun_trap");
    expect(t).toBeTruthy();
    expect(t.name).toBe("水鉄砲の罠");
    expect(t.rarity).toBe("C");
    expect(t.weight).toBe(4);
  });

  it("アーマーガッパに耐水がある", () => {
    const a = ITEMS.find((x) => x.name === "アーマーガッパ");
    expect(a).toBeTruthy();
    expect(a.ability).toBe("water_proof");
    expect(ARMOR_ABILITIES.some((ab) => ab.id === "water_proof")).toBe(true);
    expect(hasWaterProof({ armor: a })).toBe(true);
  });

  it("blankScrollOrSpellbook が白紙化する", () => {
    const scroll = { type: "scroll", effect: "teleport", name: "テレポートの巻物" };
    const ml = [];
    expect(blankScrollOrSpellbook(scroll, ml)).toBe(true);
    expect(scroll.effect).toBe("blank");
    expect(scroll.name).toBe("白紙の巻物");
    expect(ml.some((m) => m.includes("文字が消えた"))).toBe(true);
  });

  it("shrinkFoodOneStep がサイズを1段階下げる", () => {
    const food = {
      type: "food",
      name: "満腹の大きいリンゴ",
      value: 55,
      cooked: false,
      sizeLabel: "大きい",
      _foodBase: "リンゴ",
      _foodEfLabel: "満腹の",
    };
    const ml = [];
    expect(shrinkFoodOneStep(food, ml)).toBe(true);
    expect(food.sizeLabel).toBe("普通の");
    expect(food.value).toBeLessThan(55);
  });

  it("applyWaterGunToInventory は耐水で無効", () => {
    const armor = ITEMS.find((x) => x.name === "アーマーガッパ");
    const p = {
      armor,
      inventory: [{ type: "scroll", effect: "teleport", name: "テレポートの巻物" }],
    };
    const ml = [];
    expect(applyWaterGunToInventory(p, ml)).toBe(false);
    expect(p.inventory[0].effect).toBe("teleport");
    expect(ml.some((m) => m.includes("耐水"))).toBe(true);
  });

  it("applyWaterGunToInventory が巻物を白紙にする", () => {
    const p = {
      armor: null,
      inventory: [{ type: "scroll", effect: "confusion", name: "混乱の巻物" }],
    };
    const ml = [];
    expect(applyWaterGunToInventory(p, ml)).toBe(true);
    expect(p.inventory[0].effect).toBe("blank");
  });

  it("applyWaterGunToInventory がペンのインクを減らす", () => {
    const p = {
      armor: null,
      inventory: [{ type: "pen", effect: "plain", name: "ただのペン", charges: 2 }],
    };
    const ml = [];
    expect(applyWaterGunToInventory(p, ml)).toBe(true);
    expect(p.inventory[0].charges).toBe(1);
  });

  it("applySoakedStatus は耐水で付与しない", () => {
    const armor = ITEMS.find((x) => x.name === "アーマーガッパ");
    const p = { armor, soakedTurns: 0 };
    const ml = [];
    expect(applySoakedStatus(p, ml, 10)).toBe(false);
    expect(p.soakedTurns).toBe(0);
  });

  it("applySoakedFromWaterWalk は耐水でずぶ濡れにならない", () => {
    const armor = ITEMS.find((x) => x.name === "アーマーガッパ");
    const p = { armor, soakedTurns: 0, x: 1, y: 1, rings: [] };
    const dg = { map: [[T.WALL, T.WALL], [T.WALL, T.WATER]] };
    const ml = [];
    applySoakedFromWaterWalk(p, dg, ml);
    expect(p.soakedTurns).toBe(0);
  });

  it("watergun_trap がずぶ濡れと所持品影響を与える", () => {
    const trap = { ...TRAPS.find((t) => t.effect === "watergun_trap"), x: 2, y: 2, revealed: false };
    const p = {
      armor: null,
      soakedTurns: 0,
      inventory: [{ type: "scroll", effect: "teleport", name: "テレポートの巻物" }],
      x: 2,
      y: 2,
    };
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(T.FLOOR)), traps: [trap], monsters: [], rooms: [] };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.soakedTurns).toBe(10);
    expect(p.inventory[0].effect).toBe("blank");
  });

  it("watergun_trap は耐水で無効", () => {
    const armor = ITEMS.find((x) => x.name === "アーマーガッパ");
    const trap = { ...TRAPS.find((t) => t.effect === "watergun_trap"), x: 2, y: 2, revealed: false };
    const p = {
      armor,
      soakedTurns: 0,
      inventory: [{ type: "scroll", effect: "teleport", name: "テレポートの巻物" }],
      x: 2,
      y: 2,
    };
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(T.FLOOR)), traps: [trap], monsters: [], rooms: [] };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.soakedTurns).toBe(0);
    expect(p.inventory[0].effect).toBe("teleport");
    expect(ml.some((m) => m.includes("耐水"))).toBe(true);
  });
});

describe("泉の立ち絵", () => {
  it("立ち絵カテゴリに泉の飲む・浸すがある", () => {
    const action = PORTRAIT_CATEGORIES.find((c) => c.id === "action");
    const files = action.slots.map((s) => s.file);
    expect(files).toContain("action_drink_spring");
    expect(files).toContain("action_soak_spring");
  });

  it("msgToActionKey が泉を薬より優先する", () => {
    expect(msgToActionKey("泉の水を飲んだ。")).toBe("act_spring_drink");
    expect(msgToActionKey("清らかな水を飲んだ。")).toBe("act_spring_drink");
    expect(msgToActionKey("巻物「謎」を泉に浸した...文字が消えた！")).toBe("act_spring_soak");
    expect(msgToActionKey("回復薬を飲んだ。HP+30")).toBe("act_potion");
  });
});
