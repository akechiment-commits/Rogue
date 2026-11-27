import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
}));
import { useItemActions } from "../useItemActions.js";
import { BOSSES, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { MW, MH } from "../utils.js";

afterEach(() => vi.restoreAllMocks());

describe("効果解除・弱体化の巻物", () => {
  it("激昂した煉獄公の激昂・攻撃回数を解除して再激昂させず、祝福半減は状態防止を尊重する", () => {
    const base = BOSSES.find((b) => b.baseKind === "boss_infernoking");
    const boss = makeMonsterFromBase(base, 1, 5, 5);
    boss.hp = Math.floor(boss.maxHp * 0.4);
    boss._enraged = true;
    boss.speed = 3;
    boss.maxAttacks = 3;

    const immuneMon = {
      id: "im1", name: "耐性敵", x: 6, y: 5,
      hp: 100, maxHp: 100, atk: 40, def: 20, statusImmune: 5,
    };

    const scroll = { id: "sc1", name: "効果解除の巻物", type: "scroll", effect: "debuff", blessed: true };
    const player = makePlayer({ x: 3, y: 5, inventory: [scroll] });
    const dg = makeEmptyDg({
      monsters: [boss, immuneMon],
      visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
      explored: Array.from({ length: MH }, () => Array(MW).fill(true)),
    });
    const sr = { current: { player, dungeon: dg, ident: new Set(["scroll:debuff"]), allBcKnown: true } };

    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      withPitfallBag: (fn) => fn(),
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      pushAnim: () => {},
    });

    actions.doUseItem(0);

    expect(boss._enraged).toBe(false);
    expect(boss.maxAttacks).toBe(2);
    expect(boss.speed).toBe(1);
    expect(immuneMon.atk).toBe(40);
    expect(immuneMon.def).toBe(20);
    expect(immuneMon.debuffAtkHalfTurns || 0).toBe(0);

    // 解除後のターン処理で即座に再激昂しない
    monsterAI(boss, dg, player, [], { moveOnly: true });
    expect(boss._enraged).toBe(false);
    expect(boss.maxAttacks).toBe(2);
  });
});
