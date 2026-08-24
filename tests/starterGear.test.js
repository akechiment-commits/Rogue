import { describe, it, expect } from "vitest";
import { grantDungeonStarterGear, ITEMS } from "../items.js";

describe("grantDungeonStarterGear", () => {
  it("短剣と革の鎧を追加して装備する", () => {
    const p = { inventory: [], maxInventory: 30, weapon: null, armor: null };
    const r = grantDungeonStarterGear(p);
    expect(r.dagger?.name).toBe("短剣");
    expect(r.armor?.name).toBe("革の鎧");
    expect(p.weapon).toBe(r.dagger);
    expect(p.armor).toBe(r.armor);
    expect(p.inventory).toHaveLength(2);
    expect(p.inventory).toContain(r.dagger);
    expect(p.inventory).toContain(r.armor);
  });

  it("満杯なら何も入らない", () => {
    const fillers = Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, name: "石" }));
    const p = { inventory: fillers, maxInventory: 30, weapon: null, armor: null };
    const r = grantDungeonStarterGear(p);
    expect(r.dagger).toBeNull();
    expect(r.armor).toBeNull();
    expect(p.weapon).toBeNull();
    expect(p.armor).toBeNull();
    expect(p.inventory).toHaveLength(30);
  });

  it("空き1なら短剣だけ入って装備する", () => {
    const fillers = Array.from({ length: 29 }, (_, i) => ({ id: `f${i}`, name: "石" }));
    const p = { inventory: fillers, maxInventory: 30, weapon: null, armor: null };
    const r = grantDungeonStarterGear(p);
    expect(r.dagger?.name).toBe("短剣");
    expect(r.armor).toBeNull();
    expect(p.weapon).toBe(r.dagger);
    expect(p.armor).toBeNull();
    expect(p.inventory).toHaveLength(30);
  });

  it("持ち込み装備があれば補給せず、数値最大の武器・防具と上から2個の指輪を装備する", () => {
    const lowWeapon = { id: "w1", type: "weapon", name: "弱い剣", atk: 10, plus: 0 };
    const highWeapon = { id: "w2", type: "weapon", name: "強い剣", atk: 8, plus: 3 };
    const lowArmor = { id: "a1", type: "armor", name: "弱い鎧", def: 4, plus: 0 };
    const highArmor = { id: "a2", type: "armor", name: "強い鎧", def: 5, plus: 2 };
    const ring1 = { id: "r1", type: "ring", name: "指輪1", effect: "ring1" };
    const ring2 = { id: "r2", type: "ring", name: "指輪2", effect: "ring2" };
    const ring3 = { id: "r3", type: "ring", name: "指輪3", effect: "ring3" };
    const p = {
      inventory: [lowWeapon, highWeapon, lowArmor, highArmor, ring1, ring2, ring3],
      maxInventory: 30, weapon: null, armor: null, rings: [],
    };

    const r = grantDungeonStarterGear(p);

    expect(r.dagger).toBeNull();
    expect(p.inventory).toHaveLength(7);
    expect(p.weapon).toBe(highWeapon);
    expect(p.armor).toBe(highArmor);
    expect(p.rings).toEqual([ring1, ring2]);
  });

  it("指輪だけの持ち込みでも補給装備を追加しない", () => {
    const ring = { id: "r1", type: "ring", name: "指輪", effect: "ring1" };
    const p = { inventory: [ring], maxInventory: 30, weapon: null, armor: null, rings: [] };

    const r = grantDungeonStarterGear(p);

    expect(r.dagger).toBeNull();
    expect(r.armor).toBeNull();
    expect(p.weapon).toBeNull();
    expect(p.armor).toBeNull();
    expect(p.rings).toEqual([ring]);
    expect(p.inventory).toHaveLength(1);
  });

  it("ITEMS に短剣・革の鎧が存在する", () => {
    expect(ITEMS.find((i) => i.name === "短剣")).toBeTruthy();
    expect(ITEMS.find((i) => i.name === "革の鎧")).toBeTruthy();
  });
});
