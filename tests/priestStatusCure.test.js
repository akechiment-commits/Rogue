import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { altarPriestServiceTargets, altarPriestServicePrice } from "../priestServiceRules.js";
import { clearStatusEffectsOnHpZero } from "../statusDuration.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";

const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
const start = source.indexOf("  const doPriestService = useCallback(");
const end = source.indexOf("  const doMerchantBuy = useCallback(", start);
if (start < 0 || end < 0) throw new Error("Priest callback not found");
function requestCure(player) {
  const priest = { id: "priest", isAltarPriest: true, hp: 200, state: "friendly" };
  const sr = { current: { player, dungeon: makeEmptyDg({ monsters: [priest] }) } };
  const messages = [];
  const deps = { sr, priestRef: { current: priest }, useCallback: fn => fn,
    altarPriestServiceTargets, altarPriestServicePrice, clearStatusEffectsOnHpZero,
    setMsgs: fn => messages.push(...fn([])), setPriestMenuSel: vi.fn(), setGs: vi.fn() };
  const service = new Function(...Object.keys(deps), `${source.slice(start, end)}; return doPriestService;`)(...Object.values(deps));
  service("cure_status", null);
  return { priest, messages };
}

describe("司祭による毒の後遺症の治療", () => {
  it("毒の攻撃力低下だけ残っていても選択でき、料金1回分で治す", () => {
    const player = makePlayer({ atk: 10, poisonAtkLoss: 2, poisoned: false, poisonedTurns: 0, gold: 10000 });
    expect(altarPriestServiceTargets([], "cure_status", player)).toHaveLength(1);
    const price = altarPriestServicePrice(null, "cure_status");
    const { priest, messages } = requestCure(player);
    expect(player.atk).toBe(12);
    expect(player.poisonAtkLoss).toBe(0);
    expect(player.gold).toBe(10000 - price);
    expect(priest.priestServiceCount).toBe(1);
    expect(messages.some(message => message.includes("全ての状態異常が治った"))).toBe(true);
    expect(altarPriestServiceTargets([], "cure_status", player)).toEqual([]);
  });

  it("後遺症も状態異常もない場合は料金と依頼数を消費しない", () => {
    const player = makePlayer({ atk: 12, poisonAtkLoss: 0, gold: 10000 });
    const { priest, messages } = requestCure(player);
    expect(player.gold).toBe(10000);
    expect(player.atk).toBe(12);
    expect(priest.priestServiceCount).toBeUndefined();
    expect(messages).toEqual([]);
  });
});
