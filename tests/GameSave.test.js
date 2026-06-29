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
  });

  it("clearGameSave で削除される", () => {
    saveGameState(makeSession(), [], null, null);
    clearGameSave();
    expect(hasGameSave()).toBe(false);
    expect(loadGameState()).toBeNull();
  });
});