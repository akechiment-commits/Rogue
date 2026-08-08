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

  it("ITEMS に短剣・革の鎧が存在する", () => {
    expect(ITEMS.find((i) => i.name === "短剣")).toBeTruthy();
    expect(ITEMS.find((i) => i.name === "革の鎧")).toBeTruthy();
  });
});
