import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
}));
import { useItemActions } from "../useItemActions.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { MW, MH } from "../utils.js";

afterEach(() => vi.restoreAllMocks());

describe("ヤバイ食料の投擲", () => {
  it("大型敵には各状態異常のクールダウンが効き、ボスの速度を二重半減しない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const f1 = { id: "y1", name: "ヤバイ食料", type: "food", yabai: true };
    const f2 = { id: "y2", name: "ヤバイ食料", type: "food", yabai: true };
    const boss = {
      id: "boss1", name: "大型ボス", x: 5, y: 5,
      hp: 500, maxHp: 500, atk: 40, def: 5, speed: 2,
      isBoss: true, bodySize: 2,
    };
    const player = makePlayer({ x: 3, y: 5, inventory: [f1, f2] });
    const dg = makeEmptyDg({
      monsters: [boss],
      visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
      explored: Array.from({ length: MH }, () => Array(MW).fill(true)),
    });
    const sr = { current: { player, dungeon: dg, ident: new Set(), allBcKnown: true } };
    const throwItem = (item) => {
      const a = useItemActions({
        sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
        throwMode: { idx: player.inventory.indexOf(item), mode: "throw" },
        withPitfallBag: (fn) => fn(),
        bigboxAddItem: () => {},
        setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
        setThrowMode: () => {},
        pushAnim: () => {},
      });
      a.execDirection(1, 0);
    };

    throwItem(f1);
    expect(boss.speed).toBe(1);
    expect(boss._preSlowSpeed).toBe(2);
    const firstSlow = boss.bossSlowTurns;
    expect(firstSlow).toBeGreaterThan(0);

    throwItem(f2);
    expect(boss.speed).toBe(1);
    expect(boss.bossSlowTurns).toBe(firstSlow);
  });
});
