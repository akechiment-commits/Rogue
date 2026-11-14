import { describe, it, expect } from "vitest";
import { ITEMS, WEAPON_ABILITIES, applyWeaponStatusInflictions } from "../items.js";
import { PERMANENT_TURNS } from "../statusDuration.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeTarget(overrides = {}) {
  return {
    name: "テスト敵",
    type: "normal",
    hp: 100,
    maxHp: 100,
    speed: 1,
    isBoss: false,
    ...overrides,
  };
}

const ALL_INFLICT_ABILITIES = [
  "inflict_slow",
  "inflict_paralyze",
  "inflict_sleep",
  "inflict_darkness",
  "inflict_confuse",
  "inflict_bewitch",
  "inflict_seal",
  "inflict_immobile",
];

describe("武器の攻撃時状態異常付与 (applyWeaponStatusInflictions)", () => {
  it("影縫いの刃・inflict_immobile の説明文が 3ターン固定になっている", () => {
    const shadowBlade = ITEMS.find((it) => it.name === "影縫いの刃");
    expect(shadowBlade).toBeDefined();
    expect(shadowBlade.desc).toContain("3ターン");
    expect(shadowBlade.desc).not.toContain("2〜3ターン");

    const ab = WEAPON_ABILITIES.find((a) => a.id === "inflict_immobile");
    expect(ab).toBeDefined();
    expect(ab.desc).toContain("3ターン");
    expect(ab.desc).not.toContain("2〜3ターン");
  });

  it("通常敵に対して全8種の状態異常が期待どおりに付与される", () => {
    const dg = makeEmptyDg();
    const p = makePlayer();
    const ml = [];
    const mon = makeTarget();

    applyWeaponStatusInflictions(mon, {
      hasAbility: (id) => ALL_INFLICT_ABILITIES.includes(id),
      dungeon: dg,
      player: p,
      messages: ml,
      randomFn: () => 0,
    });

    expect(mon.speed).toBe(0.5);
    expect(mon.paralyzed).toBe(true);
    expect(mon.sleepTurns).toBe(6);
    expect(mon.darknessTurns).toBe(50);
    expect(mon.blind).toBeUndefined();
    expect(mon.blindTurns).toBeUndefined();
    expect(mon.confusedTurns).toBe(20);
    expect(mon.fleeingTurns).toBe(50);
    expect(mon.sealedTurns).toBe(PERMANENT_TURNS);
    expect(mon.immobileTurns).toBe(3);
  });

  it("ボスに対して全8種の状態異常が半減ルールどおりに付与される", () => {
    const dg = makeEmptyDg();
    const p = makePlayer();
    const ml = [];
    const boss = makeTarget({ name: "テストボス", isBoss: true });

    applyWeaponStatusInflictions(boss, {
      hasAbility: (id) => ALL_INFLICT_ABILITIES.includes(id),
      dungeon: dg,
      player: p,
      messages: ml,
      randomFn: () => 0,
    });

    expect(boss.speed).toBe(0.5);
    expect(boss.bossSlowTurns).toBe(5);
    expect(boss.paralyzeTurns).toBe(25);
    expect(boss.sleepTurns).toBe(3);
    expect(boss.darknessTurns).toBe(25);
    expect(boss.blind).toBeUndefined();
    expect(boss.confusedTurns).toBe(10);
    expect(boss.fleeingTurns).toBe(25);
    expect(boss.sealedTurns).toBe(10);
    expect(boss.immobileTurns).toBe(2);
  });

  it("状態異常防止 (statusImmune) 中は全8種を無効化し、店主・ガードには暗闇が無効", () => {
    const dg = makeEmptyDg();
    const p = makePlayer();
    const ml = [];
    const immuneMon = makeTarget({ statusImmune: 5 });

    applyWeaponStatusInflictions(immuneMon, {
      hasAbility: (id) => ALL_INFLICT_ABILITIES.includes(id),
      dungeon: dg,
      player: p,
      messages: ml,
      randomFn: () => 0,
    });

    expect(immuneMon.speed).toBe(1);
    expect(immuneMon.paralyzed).toBeUndefined();
    expect(immuneMon.sleepTurns).toBeUndefined();
    expect(immuneMon.darknessTurns).toBeUndefined();
    expect(immuneMon.confusedTurns).toBeUndefined();
    expect(immuneMon.fleeingTurns).toBeUndefined();
    expect(immuneMon.sealedTurns).toBeUndefined();
    expect(immuneMon.immobileTurns).toBeUndefined();
    expect(ml.filter((m) => m.includes("には効かなかった！(状態防止中)")).length).toBeGreaterThanOrEqual(8);

    const guardMl = [];
    const guard = makeTarget({ name: "衛兵", type: "guard" });
    applyWeaponStatusInflictions(guard, {
      hasAbility: (id) => id === "inflict_darkness",
      dungeon: dg,
      player: p,
      messages: guardMl,
      randomFn: () => 0,
    });
    expect(guard.darknessTurns).toBeUndefined();
    expect(guardMl).toContain("衛兵には暗闇が効かなかった！");
  });
});
