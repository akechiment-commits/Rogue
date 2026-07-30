import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveGameState,
  loadGameState,
  clearGameSave,
  hasGameSave,
} from "../GameSave.js";

function makeSession() {
  const sword = { id: "w1", name: "短剣", type: "weapon", atk: 3 };
  const armor = { id: "a1", name: "皮の服", type: "armor", def: 2 };
  const inventory = [sword, armor];
  return {
    player: {
      hp: 80,
      maxHp: 100,
      x: 5,
      y: 5,
      inventory,
      weapon: sword,
      armor,
      arrow: null,
      rings: [],
    },
    dungeon: { depth: 3, monsters: [], items: [] },
    floors: { 3: { depth: 3 } },
    ident: new Set(["p:heal", "s:teleport"]),
    fakeNames: { "p:heal": "赤い液体" },
    bbFakeNames: {},
    nicknames: {},
    isDebugRun: false,
    dungeonType: "beginner",
    maxDepth: 10,
    allBcKnown: true,
    floorTurns: 42,
    penSpriteMap: { holy: 3 },
    potionSpriteMap: { heal: 7 },
  };
}

describe("GameSave", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = v; },
      removeItem(k) { delete this._data[k]; },
    });
    clearGameSave();
  });

  it("セッションを保存して復元できる", () => {
    const session = makeSession();
    const msgs = ["テストメッセージ"];
    expect(saveGameState(session, msgs, { type: "beginner" }, null)).toBe(true);
    expect(hasGameSave()).toBe(true);

    const loaded = loadGameState();
    expect(loaded.player.hp).toBe(80);
    expect(loaded.player.weapon).toBe(loaded.player.inventory[0]);
    expect(loaded.player.armor).toBe(loaded.player.inventory[1]);
    expect(loaded.ident).toEqual(new Set(["p:heal", "s:teleport"]));
    expect(loaded.floorTurns).toBe(42);
    expect(loaded.penSpriteMap).toEqual({ holy: 3 });
    expect(loaded.potionSpriteMap).toEqual({ heal: 7 });
    expect(loaded.msgs).toEqual(["テストメッセージ"]);
    expect(loaded.dungeonConfig).toEqual({ type: "beginner" });
    expect(JSON.parse(localStorage._data.roguelike_dungeon_save_v1).version).toBe(2);
  });

  it("v1 の途中セーブを v2 として読み込める", () => {
    saveGameState(makeSession(), ["以前のメッセージ"], null, null);
    const legacy = JSON.parse(localStorage._data.roguelike_dungeon_save_v1);
    legacy.version = 1;
    delete legacy.nicknames;
    delete legacy.penSpriteMap;
    delete legacy.potionSpriteMap;
    localStorage._data.roguelike_dungeon_save_v1 = JSON.stringify(legacy);

    const loaded = loadGameState();
    expect(loaded.player.weapon).toBe(loaded.player.inventory[0]);
    expect(loaded.nicknames).toEqual({});
    expect(loaded.penSpriteMap).toEqual({});
    expect(loaded.potionSpriteMap).toEqual({});
  });

  it("内部用の重力の力を途中セーブから除去する", () => {
    const session = makeSession();
    const gravityTrigger = { name: "重力の力", type: "misc" };
    const ring = { id: "r1", name: "力の指輪", type: "ring" };
    session.player.inventory = [gravityTrigger, ...session.player.inventory, ring];
    session.player.weapon = session.player.inventory[1];
    session.player.armor = session.player.inventory[2];
    session.player.rings = [ring];
    session.dungeon.items = [{ ...gravityTrigger, x: 5, y: 5 }];
    session.floors[2] = { depth: 2, items: [{ ...gravityTrigger, x: 3, y: 3 }] };

    expect(saveGameState(session, [], null, null)).toBe(true);
    const loaded = loadGameState();

    expect(loaded.player.inventory.some(item => item.name === "重力の力")).toBe(false);
    expect(loaded.player.weapon?.name).toBe("短剣");
    expect(loaded.player.armor?.name).toBe("皮の服");
    expect(loaded.player.rings).toEqual([loaded.player.inventory[2]]);
    expect(loaded.dungeon.items).toEqual([]);
    expect(loaded.floors[2].items).toEqual([]);
  });

  it("未知の版または壊れた途中セーブは読み込まない", () => {
    localStorage.setItem("roguelike_dungeon_save_v1", JSON.stringify({ version: 99 }));
    expect(loadGameState()).toBeNull();

    localStorage.setItem("roguelike_dungeon_save_v1", JSON.stringify({ version: 2, player: {} }));
    expect(loadGameState()).toBeNull();
  });

  it("clearGameSave で削除される", () => {
    saveGameState(makeSession(), [], null, null);
    clearGameSave();
    expect(hasGameSave()).toBe(false);
    expect(loadGameState()).toBeNull();
  });
});
