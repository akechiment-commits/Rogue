import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_SAVE, loadSave, mergeDiscoveries } from "../SaveData.js";

describe("mergeDiscoveries", () => {
  it("新規発見をマージする", () => {
    const save = DEFAULT_SAVE.discovered;
    const run = {
      items: { "p:heal": { name: "回復薬", tile: 16, type: "potion", count: 1 } },
      monsters: {},
      traps: {},
      bigboxes: {},
    };
    const merged = mergeDiscoveries(save, run);
    expect(merged.items["p:heal"].name).toBe("回復薬");
    expect(merged.items["p:heal"].count).toBe(1);
  });

  it("既存エントリの count を加算する", () => {
    const save = {
      items: { "p:heal": { name: "回復薬", count: 2 } },
      monsters: {},
      traps: {},
      bigboxes: {},
    };
    const run = {
      items: { "p:heal": { name: "回復薬", count: 1 } },
      monsters: {},
      traps: {},
      bigboxes: {},
    };
    const merged = mergeDiscoveries(save, run);
    expect(merged.items["p:heal"].count).toBe(3);
  });
});

describe("loadSave", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = v; },
      removeItem(k) { delete this._data[k]; },
    });
  });

  it("保存がなければ DEFAULT_SAVE を返す", () => {
    const save = loadSave();
    expect(save.hubGold).toBe(0);
    expect(save.warehouseMax).toBe(100);
    expect(save.discovered.items).toEqual({});
  });

  it("欠けたキーを DEFAULT_SAVE で補完する", () => {
    localStorage.setItem("roguelike_hub_v1", JSON.stringify({ hubGold: 500 }));
    const save = loadSave();
    expect(save.hubGold).toBe(500);
    expect(save.warehouseMax).toBe(100);
    expect(save.clearedDungeons).toEqual({});
  });
});