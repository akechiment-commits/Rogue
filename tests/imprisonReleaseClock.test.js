import { afterEach, describe, expect, it, vi } from "vitest";
import { confineMonsterInImprisonPot, releaseConfinedMonstersFromPot } from "../items.js";
import { takeDueActions } from "../actionClock.js";
import { saveGameState, loadGameState } from "../GameSave.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { MW, MH } from "../utils.js";

afterEach(() => vi.unstubAllGlobals());
describe("とじこめの壺から放出した敵の行動時計", () => {
  it.each([false, true])("長時間・別階へ持ち歩いても閉じ込め中の行動をまとめて実行しない（保存再開: %s）", reload => {
    const pot = { id: "prison", name: "とじこめの壺", type: "pot", potEffect: "imprison", capacity: 3, confinedMonsters: [], contents: [] };
    const enemy = { id: "enemy", name: "敵", hp: 30, maxHp: 30, atk: 8, speed: 1, x: 6, y: 5, actionTime: 24,
      _phaseActionCount: 8, _movesMadeThisPhase: 4, _movedThisTurn: true, _defHalfMagicReady: true };
    let player = makePlayer({ actionTime: 24, inventory: [pot], depth: 1 });
    let dungeon = makeEmptyDg({ monsters: [enemy], rooms: [{ x: 1, y: 1, w: 12, h: 12 }],
      visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
      explored: Array.from({ length: MH }, () => Array(MW).fill(false)) });
    confineMonsterInImprisonPot(pot, enemy, dungeon, []);
    player.actionTime = 1224; player.depth = 2;
    dungeon = { ...dungeon, monsters: [] };
    let carriedPot = pot;
    if (reload) {
      const store = new Map();
      vi.stubGlobal("localStorage", { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null });
      expect(saveGameState({ player, dungeon, floors: {}, ident: new Set() }, [], {}, {})).toBe(true);
      const loaded = loadGameState();
      player = loaded.player; dungeon = loaded.dungeon; carriedPot = player.inventory[0];
    }
    releaseConfinedMonstersFromPot(carriedPot, dungeon, player.x, player.y, player, []);
    const released = dungeon.monsters[0];
    expect(released).toBeDefined();
    expect(takeDueActions(released, player.actionTime, 1)).toBe(0);
    expect(takeDueActions(released, player.actionTime + 12, 1)).toBe(1);
    expect(released._phaseActionCount).toBe(0);
    expect(released._movesMadeThisPhase).toBe(0);
    for (const key of ["_movedThisTurn", "_defHalfMagicReady"]) expect(released[key]).toBeUndefined();
    expect(carriedPot.confinedMonsters).toHaveLength(0);
  });
});
