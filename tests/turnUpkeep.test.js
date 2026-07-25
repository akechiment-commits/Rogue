import { describe, expect, it } from "vitest";
import { advanceConsumableBuffTimers, advanceCoreStatusTimers, advanceEarlyStatusTimers, advancePlayerUpkeep } from "../turnUpkeep.js";

function makePlayer(overrides = {}) {
  return { hp: 50, maxHp: 100, hunger: 40, turns: 0, weapon: null, armor: null, rings: [], ...overrides };
}

function advance(player, messages = [], overrides = {}) {
  advancePlayerUpkeep(player, messages, {
    hasAbility: (item, id) => item?.ability === id,
    hasRingEffect: (entry, effect) => entry.rings.some((ring) => ring.effect === effect),
    calcHungerDrainRate: () => 10,
    ...overrides,
  });
  return messages;
}

describe("advancePlayerUpkeep", () => {
  it("ターンを進め、空腹度を規定量だけ減らして自然回復する", () => {
    const player = makePlayer();
    advance(player);
    expect(player.turns).toBe(1);
    expect(player.hunger).toBe(39);
    expect(player.hp).toBe(51);
  });

  it("空腹時は最初のダメージを通知し、以後もHPを減らす", () => {
    const player = makePlayer({ hunger: 0, hp: 10 });
    let warnings = 0;
    const messages = advance(player, [], { onHungerDamageStarted: () => { warnings++; } });
    expect(player.hp).toBe(9);
    expect(player.deathCause).toBe("空腹により");
    expect(messages).toEqual(["空腹でHPが減り始めた！"]);
    expect(warnings).toBe(1);

    advance(player, messages, { onHungerDamageStarted: () => { warnings++; } });
    expect(player.hp).toBe(8);
    expect(warnings).toBe(1);
  });

  it("再生防具と回復の指輪は自然回復量を加算・倍化する", () => {
    const player = makePlayer({ hp: 70, armor: { ability: "regen" }, rings: [{ effect: "regen_ring" }] });
    advance(player);
    expect(player.hp).toBe(74);
  });

  it("大食い武器は5ターン目に追加で空腹度を減らす", () => {
    const player = makePlayer({ turns: 4, hunger: 20, weapon: { ability: "gluttony" } });
    advance(player);
    expect(player.hunger).toBe(18);
  });
});

describe("advanceCoreStatusTimers", () => {
  it("鈍足中は行動スキップを予約し、終了時に通知する", () => {
    const player = makePlayer({ slowTurns: 2 });
    advanceCoreStatusTimers(player, [], { hasRingEffect: () => false });
    expect(player).toMatchObject({ slowTurns: 1, slowSkip: true });
    const messages = [];
    player.slowTurns = 1;
    delete player.slowSkip;
    advanceCoreStatusTimers(player, messages, { hasRingEffect: () => false });
    expect(player.slowSkip).toBeUndefined();
    expect(messages).toEqual(["鈍足が解けた！"]);
  });

  it("鈍足指輪と各状態の解除を処理する", () => {
    const player = makePlayer({ rings: [{ effect: "slow_ring" }], confusedTurns: 1, darknessTurns: 1, sureHitTurns: 1 });
    const messages = [];
    advanceCoreStatusTimers(player, messages, { hasRingEffect: (entry, effect) => entry.rings.some((ring) => ring.effect === effect) });
    expect(player.slowSkip).toBe(true);
    expect(messages).toEqual(["混乱が解けた！", "暗闇が晴れた！視界が戻った！", "必中状態が切れた！"]);
  });
});

describe("advanceConsumableBuffTimers", () => {
  it("食料由来の強化を減らし、蜂蜜は回復して終了を通知する", () => {
    const player = makePlayer({ hp: 90, spicyAtkTurns: 1, curryFireResTurns: 1, honeyRegenTurns: 1 });
    const messages = [];
    advanceConsumableBuffTimers(player, messages);
    expect(player.hp).toBe(92);
    expect(messages).toEqual(["辛さによるダメージブーストが切れた！", "カレーの炎耐性が切れた！", "蜂蜜の自然回復が切れた！"]);
  });
});

describe("advanceEarlyStatusTimers", () => {
  it("各状態を減らし、終了メッセージを順序どおり追加する", () => {
    const player = makePlayer({ turns: 1, sealedTurns: 1, fireExplosionNullTurns: 1, oilyTurns: 1, soakedTurns: 1, immobileTurns: 1, floatTurns: 1, invisibleTurns: 1 });
    const messages = [];
    advanceEarlyStatusTimers(player, messages);
    expect(player).toMatchObject({ sealedTurns: 0, fireExplosionNullTurns: 0, oilyTurns: 0, soakedTurns: 0, immobileTurns: 0, floatTurns: 0, invisibleTurns: 0 });
    expect(messages).toEqual(["封印が解けた！", "炎と爆発の不発効果が切れた！", "油が落ちた。炎への弱点が消えた。", "体が乾いた。ずぶ濡れが解けた。", "浮遊が解けた！", "透明が解けた！敵に見えるようになった。"]);
  });

  it("100ターン目はMPを自然回復し、クールダウン中は回復しない", () => {
    const player = makePlayer({ turns: 100, mp: 2, maxMp: 4 });
    advanceEarlyStatusTimers(player, []);
    expect(player.mp).toBe(3);
    player.mpCooldownTurns = 2;
    advanceEarlyStatusTimers(player, []);
    expect(player.mp).toBe(3);
    expect(player.mpCooldownTurns).toBe(1);
  });

  it("毒は3ターンごとに攻撃力を下げ、3回で解ける", () => {
    const player = makePlayer({ turns: 3, atk: 5, poisoned: true, poisonAtkLoss: 2 });
    const messages = [];
    advanceEarlyStatusTimers(player, messages);
    expect(player.atk).toBe(4);
    expect(player.poisoned).toBe(false);
    expect(messages).toEqual(["毒に冒されている！攻撃力が下がった...", "毒の効果が切れた。"]);
  });
});
