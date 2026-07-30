import { describe, it, expect } from "vitest";
import { statusTurns, STATUS_BASE, PERMANENT_TURNS, isPermanentTurns } from "../statusDuration.js";

describe("statusTurns", () => {
  it("同じ状態は原因によらず同じ基準ターン", () => {
    expect(statusTurns("sleep", { kind: "player" })).toBe(STATUS_BASE.sleep.player);
    expect(statusTurns("sleep", { kind: "monster" })).toBe(STATUS_BASE.sleep.monster);
    expect(statusTurns("confuse", { kind: "player" })).toBe(5);
    expect(statusTurns("confuse", { kind: "monster" })).toBe(20);
  });

  it("祝福は2倍（敵の暗闇・幻惑は永続）", () => {
    expect(statusTurns("sleep", { kind: "player", blessed: true })).toBe(12);
    expect(statusTurns("paralyze", { kind: "player", blessed: true })).toBe(20);
    expect(statusTurns("darkness", { kind: "player", blessed: true })).toBe(40);
    expect(statusTurns("darkness", { kind: "monster", blessed: true })).toBe(PERMANENT_TURNS);
    expect(statusTurns("bewitch", { kind: "monster", blessed: true })).toBe(PERMANENT_TURNS);
    expect(isPermanentTurns(PERMANENT_TURNS)).toBe(true);
  });

  it("ボスへの永続封印は有限20T", () => {
    expect(statusTurns("seal", { kind: "monster", target: { isBoss: true } })).toBe(20);
    expect(statusTurns("seal", { kind: "monster", target: { isBoss: false } })).toBe(PERMANENT_TURNS);
  });
});
