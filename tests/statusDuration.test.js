import { describe, it, expect } from "vitest";
import {
  statusTurns, STATUS_BASE, PERMANENT_TURNS, isPermanentTurns, applyMonsterParalyze,
} from "../statusDuration.js";

describe("statusTurns", () => {
  it("同じ状態は原因によらず同じ基準ターン", () => {
    expect(statusTurns("sleep", { kind: "player" })).toBe(STATUS_BASE.sleep.player);
    expect(statusTurns("paralyze", { kind: "monster" })).toBe(100);
    expect(statusTurns("bewitch", { kind: "player" })).toBe(20);
    expect(statusTurns("oily", { kind: "player" })).toBe(50);
    expect(statusTurns("oily", { kind: "monster" })).toBe(100);
  });

  it("祝福は2倍、または敵は永続（暗闇・幻惑・金縛り）", () => {
    expect(statusTurns("sleep", { kind: "player", blessed: true })).toBe(12);
    expect(statusTurns("paralyze", { kind: "player", blessed: true })).toBe(20);
    expect(statusTurns("paralyze", { kind: "monster", blessed: true })).toBe(PERMANENT_TURNS);
    expect(statusTurns("bewitch", { kind: "player", blessed: true })).toBe(40);
    expect(statusTurns("darkness", { kind: "monster", blessed: true })).toBe(PERMANENT_TURNS);
    expect(statusTurns("bewitch", { kind: "monster", blessed: true })).toBe(PERMANENT_TURNS);
    expect(isPermanentTurns(PERMANENT_TURNS)).toBe(true);
  });

  it("ボスへの永続封印だけ有限20T（他の永続はボスでも9999）", () => {
    expect(statusTurns("seal", { kind: "monster", target: { isBoss: true } })).toBe(20);
    expect(statusTurns("seal", { kind: "monster", target: { isBoss: false } })).toBe(PERMANENT_TURNS);
    expect(statusTurns("paralyze", { kind: "monster", blessed: true, target: { isBoss: true } })).toBe(PERMANENT_TURNS);
    expect(statusTurns("darkness", { kind: "monster", blessed: true, target: { isBoss: true } })).toBe(PERMANENT_TURNS);
  });

  it("applyMonsterParalyze は全敵にターンを付与", () => {
    const mon = { name: "ネズミ", hp: 10 };
    const t = applyMonsterParalyze(mon);
    expect(t).toBe(100);
    expect(mon.paralyzed).toBe(true);
    expect(mon.paralyzeTurns).toBe(100);
    const boss = { name: "ボス", hp: 100, isBoss: true };
    applyMonsterParalyze(boss, { blessed: true });
    expect(boss.paralyzeTurns).toBe(PERMANENT_TURNS);
  });
});
