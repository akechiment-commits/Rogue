import { describe, it, expect } from "vitest";
import {
  statusTurns, STATUS_BASE, PERMANENT_TURNS, BOSS_PARALYZE_TURNS,
  isPermanentTurns, applyMonsterParalyze, clearStatusEffectsOnHpZero,
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

describe("clearStatusEffectsOnHpZero", () => {
  it("HP0時に行動阻害・デバフ・毒を解除し、毒の攻撃力低下も戻す", () => {
    const player = {
      hp: 0,
      atk: 7,
      poisonAtkLoss: 2,
      sleepTurns: 4,
      sleepInterruptedTurns: 1,
      paralyzeTurns: 3,
      frozenTurns: 2,
      slowTurns: 5,
      slowSkip: true,
      confusedTurns: 6,
      poisoned: true,
      poisonedTurns: 4,
      sealedTurns: 7,
      darknessTurns: 8,
      immobileTurns: 2,
      oilyTurns: 9,
      soakedTurns: 3,
      defSoftenedTurns: 4,
      atkDebuffTurns: 5,
      defDebuffTurns: 6,
      potConfinedTurns: 2,
      hypnosisPending: 1,
      mpSealTurns: 1000,
    };

    expect(clearStatusEffectsOnHpZero(player)).toBe(true);
    expect(player).toMatchObject({
      atk: 9,
      sleepTurns: 0,
      sleepInterruptedTurns: 0,
      paralyzeTurns: 0,
      frozenTurns: 0,
      slowTurns: 0,
      slowSkip: false,
      confusedTurns: 0,
      poisoned: false,
      poisonedTurns: 0,
      poisonAtkLoss: 0,
      sealedTurns: 0,
      darknessTurns: 0,
      immobileTurns: 0,
      oilyTurns: 0,
      soakedTurns: 0,
      defSoftenedTurns: 0,
      atkDebuffTurns: 0,
      defDebuffTurns: 0,
      potConfinedTurns: 0,
      hypnosisPending: 0,
      mpSealTurns: 1000,
    });
  });

  it("モンスターのHP0時は毒の攻撃力半減と敵専用状態も解除する", () => {
    const monster = {
      hp: 0,
      atk: 10,
      poisonHalfAtk: true,
      poisonOrigAtk: 20,
      paralyzed: true,
      paralyzeHits: 2,
      blind: true,
      blindTurns: 5,
      fleeingTurns: 9999,
      sealed: true,
      sealedTurns: 10,
    };

    clearStatusEffectsOnHpZero(monster);
    expect(monster).toMatchObject({
      atk: 20,
      paralyzed: false,
      paralyzeHits: 0,
      blind: false,
      blindTurns: 0,
      fleeingTurns: 0,
      sealed: false,
      sealedTurns: 0,
    });
    expect(monster.poisonHalfAtk).toBeUndefined();
    expect(monster.poisonOrigAtk).toBeUndefined();
  });
});
