import { describe, expect, it, vi } from "vitest";
import {
  BB_TYPES,
  BB_FAKE_NAMES,
  POTS,
  ITEMS,
  TRAPS,
  SPELLBOOKS,
  EMPTY_BOTTLE,
  WATER_BOTTLE,
  ARROW_T,
  STONE_T,
  RIGHT_STONE_T,
  MAGIC_STONE_T,
  ICE_CHUNK_T,
  applyItemProtect,
  isItemProtected,
  applyLightningToInventory,
  applyWaterGunToInventory,
  applyWaterSplash,
  applyPotionToItem,
  burnInventorySpellbooks,
  convertRoomFloorItemsToMonsters,
  doExplosion,
  doGunpowderExplosion,
  doTimeBombExplosion,
  fireTrapItem,
  makeFreshDuplicate,
  throwItemAlongLine,
  potOccupancyCount,
  getIdentKey,
} from "../items.js";
import { formatInventoryItem } from "../inventoryLabel.js";
import { itemDisplayName, _itemPickupSuffix } from "../render.js";
import { applyWandEffect } from "../wands.js";
import { fireTrapPlayer } from "../traps.js";
import { bbPoolForDungeon } from "../dungeonContent.js";
import "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("加護の大箱と加護状態", () => {
  it("BB_TYPESに登録され、各ダンジョンに適切に出現し、偽名プールも十分にある", () => {
    const box = BB_TYPES.find((bb) => bb.kind === "protect");
    expect(box).toEqual(expect.objectContaining({
      kind: "protect",
      name: "加護の大箱",
      rarity: "C",
    }));
    const cap = box.cap();
    expect(cap).toBeGreaterThanOrEqual(2);
    expect(cap).toBeLessThanOrEqual(4);
    expect(BB_FAKE_NAMES.length).toBeGreaterThan(BB_TYPES.length * 3);

    expect(bbPoolForDungeon("beginner", 1).some((b) => b.kind === "protect")).toBe(true);
    expect(bbPoolForDungeon("intermediate", 1).some((b) => b.kind === "protect")).toBe(true);
    expect(bbPoolForDungeon("advanced", 5).some((b) => b.kind === "protect")).toBe(false);
    expect(bbPoolForDungeon("advanced", 6).some((b) => b.kind === "protect")).toBe(true);
    expect(bbPoolForDungeon("legend", 1).some((b) => b.kind === "protect")).toBe(true);
  });

  it("applyItemProtectで加護を付与でき、goal/gold/gold_nuggetや付与済みには効かない", () => {
    const pot = { ...POTS.find((p) => p.potEffect === "none"), id: "pot-1", contents: [] };
    expect(isItemProtected(pot)).toBe(false);
    expect(applyItemProtect(pot)).toBe(true);
    expect(isItemProtected(pot)).toBe(true);
    expect(applyItemProtect(pot)).toBe(false);

    expect(applyItemProtect({ id: "g1", type: "gold", name: "100枚の金貨", value: 100 })).toBe(false);
    expect(applyItemProtect({ id: "gn1", type: "gold_nugget", name: "金塊" })).toBe(false);
    expect(applyItemProtect({ id: "goal1", type: "goal", name: "イェンダーの魔除け" })).toBe(false);
  });

  it.each([ARROW_T, STONE_T, RIGHT_STONE_T, MAGIC_STONE_T, ICE_CHUNK_T, ...ITEMS.filter(item => item.type === "arrow")])(
    "$name は1個でも束でも加護が付かない",
    (template) => {
      for (const count of [1, 20]) {
        const item = { ...template, count };
        expect(applyItemProtect(item)).toBe(false);
        expect(isItemProtected(item)).toBe(false);
      }
    },
  );

  it("【加護】ラベルが表示され、複製の巻物では引き継がない", () => {
    const pot = { ...POTS.find((p) => p.potEffect === "none"), id: "pot-lbl", contents: [], protected: true };
    const ident = new Set([getIdentKey(pot)]);
    const label = formatInventoryItem(pot, {
      player: makePlayer(),
      identified: ident,
      displayName: (it) => itemDisplayName(it, {}, ident, {}),
      getIdentKey,
      weaponAbilities: [],
      armorAbilities: [],
      potOccupancyCount,
      getShopItemCharge: () => 0,
    });
    expect(label).toContain("【加護】保存の壺");
    expect(_itemPickupSuffix(pot, ident)).toContain("【加護】");

    const dup = makeFreshDuplicate(pot);
    expect(isItemProtected(dup)).toBe(false);
  });

  it("炎・雷の所持品攻撃でも加護状態の壺・巻物・魔法書・薬・食料は守られる", () => {
    const dg = makeEmptyDg();
    const ml = [];
    const pot = { ...POTS.find((p) => p.potEffect === "none"), id: "pot-safe", contents: [{ id: "inside", name: "回復薬", type: "potion" }], protected: true };
    const scroll = { ...ITEMS.find((i) => i.type === "scroll" && i.effect === "teleport"), id: "scr-safe", protected: true };
    const p = makePlayer({ x: 5, y: 5, inventory: [pot] });

    applyLightningToInventory(p, dg, ml, () => {}, null, false);
    expect(p.inventory).toContain(pot);
    expect(ml.some((m) => m.includes("加護の力で雷から守られた"))).toBe(true);

    ml.length = 0;
    p.inventory = [scroll];
    applyLightningToInventory(p, dg, ml, () => {}, null, true);
    expect(p.inventory).toContain(scroll);
    expect(ml.some((m) => m.includes("加護の力で炎から守られた"))).toBe(true);

    const book = { ...SPELLBOOKS.find((b) => b.spell), id: "bk-safe", protected: true };
    p.inventory = [book];
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      burnInventorySpellbooks(p, []);
      expect(p.inventory).toContain(book);
    } finally {
      randSpy.mockRestore();
    }
  });

  it("爆発（doExplosion・doGunpowderExplosion・doTimeBombExplosion）でも加護状態の床アイテムは壊れず、火薬壺も誘爆しない", () => {
    const dg = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 12, h: 12 }] });
    const p = makePlayer({ x: 1, y: 1, hp: 100, maxHp: 100 });
    const scroll = { ...ITEMS.find((i) => i.type === "scroll" && i.effect === "teleport"), id: "floor-scr", x: 5, y: 5, protected: true };
    const gpPot = { ...POTS.find((pt) => pt.potEffect === "gunpowder"), id: "floor-gp", contents: [], x: 6, y: 5, protected: true };
    const potion = { ...ITEMS.find((i) => i.type === "potion" && i.effect === "heal"), id: "floor-pot", x: 5, y: 6, protected: true };
    dg.items.push(scroll, gpPot, potion);
    const ml = [];

    doExplosion(5, 5, dg, p, ml, () => {});
    expect(dg.items).toContain(scroll);
    expect(dg.items).toContain(gpPot);
    expect(dg.items).toContain(potion);

    doGunpowderExplosion(5, 5, dg, p, ml, () => {});
    expect(dg.items).toContain(gpPot);
    expect(dg.items).toContain(scroll);

    doTimeBombExplosion(5, 5, dg, p, ml, () => {});
    expect(dg.items).toContain(gpPot);
    expect(dg.items).toContain(potion);
  });

  it("水鉄砲・水飛び散り・祝福/呪い水・炎/水の薬・腐敗罠・道具魔物化罠から加護アイテムは守られる", () => {
    const dg = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 12, h: 12 }] });
    const ml = [];
    const scroll = { ...ITEMS.find((i) => i.type === "scroll" && i.effect === "teleport"), id: "w-scr", protected: true };
    const p = makePlayer({ x: 5, y: 5, inventory: [scroll] });

    const hit = applyWaterGunToInventory(p, ml);
    expect(hit).toBe(false);
    expect(scroll.effect).toBe("teleport");

    const floorPot = { ...POTS.find((pt) => pt.potEffect === "none"), id: "w-pot", capacity: 4, contents: [], x: 5, y: 5, protected: true };
    dg.items.push(floorPot);
    applyWaterSplash(dg, 5, 5, false, true, ml, p, () => {});
    expect(floorPot.capacity).toBe(4);
    expect(floorPot.cursed).toBeFalsy();

    const floorScroll = { ...ITEMS.find((i) => i.type === "scroll" && i.effect === "teleport"), id: "pot-scr", x: 6, y: 5, protected: true };
    const resFire = applyPotionToItem("fire", 0, floorScroll, dg, ml);
    expect(resFire).toBeUndefined();
    expect(floorScroll.effect).toBe("teleport");
    const resWater = applyPotionToItem("water", 0, floorScroll, dg, ml);
    expect(resWater).toBeUndefined();
    expect(floorScroll.effect).toBe("teleport");

    const rice = { id: "food-safe", name: "おにぎり", type: "food", value: 35, cooked: true, protected: true, x: 5, y: 5 };
    const rotTrap = TRAPS.find((t) => t.effect === "rot_trap");
    p.inventory = [rice];
    fireTrapPlayer({ ...rotTrap, id: "rt1", x: 5, y: 5 }, p, dg, ml, () => {});
    expect(rice.rotten).toBeFalsy();
    dg.items.push(rice);
    fireTrapItem({ ...rotTrap, id: "rt2", x: 5, y: 5 }, rice, dg, 5, 5, ml, new Set(), p);
    expect(rice.rotten).toBeFalsy();

    convertRoomFloorItemsToMonsters(dg, 5, 5, p, ml);
    expect(dg.items).toContain(floorPot);
    expect(dg.items).toContain(rice);
  });

  it("杖の魔法弾（炎・雷・ゴッドスパーク・氷・穴掘り・軟化・呪い）でも加護状態の床・所持品は守られる", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 2, y: 2 });
    const ml = [];
    const pot = { ...POTS.find((pt) => pt.potEffect === "none"), id: "w-pot-1", capacity: 4, contents: [], x: 5, y: 5, protected: true };
    const potion = { ...ITEMS.find((i) => i.type === "potion" && i.effect === "heal"), id: "w-potion-1", x: 5, y: 5, protected: true };
    dg.items.push(pot, potion);

    for (const eff of ["lightning", "fire_wand", "godsparkwand", "dig", "soften", "curse_wand"]) {
      applyWandEffect(eff, "item", pot, 1, 0, dg, p, ml, () => {}, () => {});
      expect(dg.items).toContain(pot);
      expect(pot.capacity).toBe(4);
      expect(pot.cursed).toBeFalsy();
    }
    applyWandEffect("ice_wand", "item", potion, 1, 0, dg, p, ml, () => {}, () => {});
    expect(dg.items).toContain(potion);

    p.inventory = [pot];
    applyWandEffect("curse_wand", "player", p, 1, 0, dg, p, ml, () => {}, () => {});
    expect(pot.capacity).toBe(4);
  });

  it("例外：装備の錆と、投げた時の壺割れは通常どおり発生する", () => {
    const dg = makeEmptyDg();
    const sword = { id: "sw1", name: "鉄の剣", type: "weapon", atk: 8, plus: 2, tile: 10, protected: true };
    const p = makePlayer({ x: 5, y: 5, weapon: sword, inventory: [sword] });
    const ml = [];
    const rustTrap = TRAPS.find((t) => t.effect === "rust");
    fireTrapPlayer({ ...rustTrap, id: "rust1", x: 5, y: 5 }, p, dg, ml, () => {});
    expect(sword.plus).toBe(1);

    const pot = {
      ...POTS.find((pt) => pt.potEffect === "none"),
      id: "throw-pot",
      contents: [{ id: "in1", name: "回復薬", type: "potion" }],
      protected: true,
    };
    const res = throwItemAlongLine(p, dg, pot, 1, 0, 5, ml, p, () => {});
    expect(res.consumed).toBe(true);
    expect(dg.items.some((i) => i.id === "in1")).toBe(true);
    expect(dg.items).not.toContain(pot);

    const potionThrown = { ...ITEMS.find((i) => i.type === "potion" && i.effect === "heal"), id: "throw-potion", protected: true };
    const resPotion = throwItemAlongLine(p, dg, potionThrown, 1, 0, 5, ml, p, () => {});
    expect(resPotion.consumed).toBe(true);
    expect(EMPTY_BOTTLE.type).toBe("bottle");
    expect(WATER_BOTTLE.type).toBe("potion");
  });
});
