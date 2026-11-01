import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { clearStatusEffectsOnHpZero } from "../statusDuration.js";
import { isRevivalSuppressedAt } from "../revivalRules.js";
import { findRoom } from "../monsters.js";
import { MP_REVIVAL_SEAL_TURNS } from "../mpRules.js";
import { applyReverseStatus, setPlayerHpForFixedEffect } from "../utils.js";

// endTurnの実際の状態解除・魔方陣復活・MP復活の分岐を実行する。
const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const start = source.indexOf("        clearStatusEffectsOnHpZero(p);");
const end = source.indexOf("        } else {\n          if (_reviveBlocked)", start);
if (start < 0 || end < 0) throw new Error("Player revival block not found");
const revive = new Function("st", "p", "ml", "clearStatusEffectsOnHpZero", "isRevivalSuppressedAt", "findRoom", "MP_REVIVAL_SEAL_TURNS",
  `${source.slice(start, end)}\n}`);
function recover(state, player, messages) {
  revive(state, player, messages, clearStatusEffectsOnHpZero, isRevivalSuppressedAt, findRoom, MP_REVIVAL_SEAL_TURNS);
}

describe("逆転中の死亡と復活", () => {
  it("逆転中の回復で死亡しても、逆転を解除してMP分のHPで復活する", () => {
    const player = makePlayer({ hp: 20, maxHp: 100, mp: 40 });
    applyReverseStatus(player, 10);
    player.hp += 30;
    expect(player.hp).toBe(-10);
    expect(player.reverseTurns).toBe(0);
    expect(player.deathCause).toBe("逆転状態での回復により");
    const messages = [];
    recover({ dungeon: makeEmptyDg() }, player, messages);
    expect(player.hp).toBe(40);
    expect(player.mp).toBe(0);
    expect(player.mpSealTurns).toBe(MP_REVIVAL_SEAL_TURNS);
    expect(messages).toHaveLength(1);
  });

  it.each([false, true])("祝福%sの復活魔方陣はHPを全回復し、発動後も繰り返し使える", blessed => {
    const player = makePlayer({ hp: 20, maxHp: 100, mp: 40 });
    const pentacle = { kind: "revival", x: blessed ? 8 : 5, y: 5, blessed };
    const state = { dungeon: makeEmptyDg({ pentacles: [pentacle], rooms: [{ x: 1, y: 1, w: 10, h: 10 }] }) };
    applyReverseStatus(player, 10);
    player.hp += 30;
    const messages = [];
    recover(state, player, messages);
    expect(player.hp).toBe(100);
    expect(player.reverseTurns).toBe(0);
    expect(player.mp).toBe(40);
    expect(state.dungeon.pentacles).toContain(pentacle);
    setPlayerHpForFixedEffect(player, 0);
    recover(state, player, messages);
    expect(player.hp).toBe(100);
    expect(state.dungeon.pentacles).toContain(pentacle);
    expect(messages).toHaveLength(2);
  });

  it("生存中の状態治療だけでは逆転を解除せず、致死でない反転は維持する", () => {
    const player = makePlayer({ hp: 50, maxHp: 100 });
    applyReverseStatus(player, 10);
    clearStatusEffectsOnHpZero(player);
    expect(player.reverseTurns).toBe(10);
    player.hp += 10;
    expect(player.hp).toBe(40);
    expect(player.reverseTurns).toBe(10);
  });
});
