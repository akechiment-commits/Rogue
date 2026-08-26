import { describe, it, expect } from "vitest";
import {
  statusTurns, STATUS_BASE, PERMANENT_TURNS, BOSS_PARALYZE_TURNS,
  isPermanentTurns, applyMonsterParalyze,
} from "../statusDuration.js";

describe("statusTurns", () => {
  it("祝福は×2（永続にはしない）", () => {
    expect(statusTurns("sleep", { kind: "player", blessed: true })).toBe(12);
    expect(statusTurns("paralyze", { kind: "player", blessed: true })).toBe(20);
    expect(statusTurns("darkness", { kind: "player", blessed: true })).toBe(40);
    expect(statusTurns("darkness", { kind: "monster", blessed: true })).toBe(100);
    expect(statusTurns("bewitch", { kind: "player", blessed: true })).toBe(40);
    expect(statusTurns("bewitch", { kind: "monster", blessed: true })).toBe(100);
    expect(statusTurns("oily", { kind: "player" })).toBe(50);
  });

  it("ボスの有限状態は付与時に半分になり、その値を表示できる", () => {
    const target = { isBoss: true };
    expect(statusTurns("sleep", { kind: "monster", target })).toBe(3);
    expect(statusTurns("confuse", { kind: "monster", target })).toBe(10);
    expect(statusTurns("darkness", { kind: "monster", target })).toBe(25);
    expect(statusTurns("bewitch", { kind: "monster", target })).toBe(25);
    expect(statusTurns("oily", { kind: "monster", target })).toBe(50);
  });

  it("ボスへの永続封印は付与時に半分の10T", () => {
    expect(statusTurns("seal", { kind: "monster", target: { isBoss: true } })).toBe(10);
    expect(statusTurns("seal", { kind: "monster", target: { isBoss: false } })).toBe(PERMANENT_TURNS);
  });
});

describe("applyMonsterParalyze", () => {
  it("通常敵は時間制限なし。祝福は2回被ダメ", () => {
    const mon = { name: "ネズミ", hp: 10 };
    applyMonsterParalyze(mon);
    expect(mon.paralyzed).toBe(true);
    expect(mon.paralyzeTurns || 0).toBe(0);
    expect(mon.paralyzeHits || 0).toBe(0);

    const mon2 = { name: "ネズミ", hp: 10 };
    applyMonsterParalyze(mon2, { blessed: true });
    expect(mon2.paralyzed).toBe(true);
    expect(mon2.paralyzeHits).toBe(2);
    expect(mon2.paralyzeTurns || 0).toBe(0);
  });

  it("ボスは付与時に半分の25T、祝福は50T", () => {
    const boss = { name: "ボス", hp: 100, isBoss: true };
    expect(applyMonsterParalyze(boss)).toBe(BOSS_PARALYZE_TURNS / 2);
    expect(boss.paralyzeTurns).toBe(25);

    const boss2 = { name: "ボス", hp: 100, isBoss: true };
    expect(applyMonsterParalyze(boss2, { blessed: true })).toBe(BOSS_PARALYZE_TURNS);
    expect(boss2.paralyzeTurns).toBe(50);
  });
});
