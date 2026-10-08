import { afterEach, describe, expect, it, vi } from "vitest";
import { applyWandEffect } from "../wands.js";
import { clearPitfallBag, setPitfallBag, throwItemAlongLine } from "../items.js";
import { placeFallenEntities } from "../pitfallPlacement.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => { clearPitfallBag(); vi.restoreAllMocks(); });
function setup(effect, route) {
  const potion = { id: "potion", type: "potion", name: "回復薬", effect: "heal", value: 30, x: 5, y: 5 };
  const path = { id: "path", name: "途中の落とし穴", effect: "pitfall", x: 5, y: 8, permanent: true, revealed: false };
  const landing = { id: "landing", name: `${effect}の罠`, effect, x: 5, y: 15, permanent: true, revealed: false };
  const player = makePlayer({ x: 6, y: 15, hp: 60, maxHp: 100 });
  const dg = makeEmptyDg({ rooms: [], items: route === "wand" ? [potion] : [], traps: [path, landing] });
  const logs = [];
  const run = () => route === "wand"
    ? applyWandEffect("knockback", "item", potion, 0, 1, dg, player, logs, () => {})
    : throwItemAlongLine({ x: 5, y: 5, name: "投げる敵", hp: 100 }, dg, potion, 0, 1, 10, logs, player, () => {});
  return { potion, path, landing, player, dg, logs, run };
}

describe("薬瓶の着地罠を薬液より先に処理する", () => {
  it.each(['pitfall', 'explode', 'watergun_trap'])('瓶が外れた着地点の%sで消費された薬は飛沫を出さない', effect => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const potion = { id: 'missed-potion', name: '回復薬', type: 'potion', effect: 'heal', value: 30 };
    const player = makePlayer({ x: 5, y: 8, hp: 60, maxHp: 100 });
    const trap = { id: 'landing-trap', name: '着地罠', x: 5, y: 8, effect, permanent: true };
    const dg = makeEmptyDg({ traps: [trap] });
    const bag = [];
    setPitfallBag(bag);
    const logs = [];
    const result = throwItemAlongLine({ x: 5, y: 5, hp: 50, name: '投げる敵' }, dg, potion, 0, 1, 3, logs, player, () => {}, { hitChance: 0.75 });
    expect(result.missedPlayer).toBe(true);
    expect(trap.revealed).toBe(true);
    expect(dg.items).toEqual([]);
    expect(logs.join(' ')).not.toContain('瓶が割れて');
    expect(player.hp).toBeLessThanOrEqual(60);
    if (effect === 'pitfall') expect(bag).toContainEqual({ kind: 'item', entity: potion });
  });

  for (const route of ["throw", "wand"]) {
    it(`${route}: 落とし穴への落下は薬効を出さず、下階で簡素に消滅する`, () => {
      const s = setup("pitfall", route);
      const bag = [];
      setPitfallBag(bag);
      s.run();
      expect(s.path.revealed).toBe(false);
      expect(s.landing.revealed).toBe(true);
      expect(s.player.hp).toBe(60);
      expect(s.dg.items).toEqual([]);
      expect(bag).toEqual([{ kind: "item", entity: s.potion }]);
      const below = makeEmptyDg();
      placeFallenEntities(below, bag, { player: s.player, random: () => 0 });
      expect(below.items).toEqual([]);
      expect(s.player.hp).toBe(60);
      expect(s.logs.join(" ")).not.toContain("瓶が割れて");
    });

    it(`${route}: 地雷で消費された薬は回復効果を出さない`, () => {
      const s = setup("explode", route);
      s.run();
      expect(s.path.revealed).toBe(false);
      expect(s.player.hp).toBe(30);
      expect(s.dg.items).toEqual([]);
      expect(s.logs.filter(m => m.includes("が発動！"))).toHaveLength(1);
      expect(s.logs.join(" ")).not.toContain("瓶が割れて");
    });

    it(`${route}: 水鉄砲で消費された薬も薬効を出さない`, () => {
      const s = setup("watergun_trap", route);
      s.run();
      expect(s.player.hp).toBe(60);
      expect(s.dg.items).toEqual([]);
      expect(s.logs.join(" ")).toContain("水鉄砲で消えた");
      expect(s.logs.join(" ")).not.toContain("瓶が割れて");
    });

    it.each(["rust", "time_bomb"])(`${route}: %sは先に起動し、消費されない薬の効果は継続する`, effect => {
      const s = setup(effect, route);
      s.run();
      expect(s.player.hp).toBe(90);
      expect(s.dg.items).toEqual([]);
      expect(s.logs.filter(m => m.includes("が発動！"))).toHaveLength(1);
      expect(s.logs.join(" ")).toContain("瓶が割れて");
      if (effect === "time_bomb") {
        // 起動した後、既存の薬液処理で消火される。
        expect(s.dg.pendingBombs).toEqual([]);
        expect(s.logs.join(" ")).toContain("薬液で消火された");
      }
    });
  }
});
