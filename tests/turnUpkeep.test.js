import { describe, expect, it, vi } from "vitest";
import { advanceConsumableBuffTimers, advanceCoreStatusTimers, advanceEarlyStatusTimers, advancePlayerUpkeep, applyArmorAura, advancePentacleWear, advanceForcedTurn, hasForcedTurn, advancePlayerSpeedPhase } from "../turnUpkeep.js";
import { applyPlayerPoison } from "../statusDuration.js";

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

  it("酩酊中は5%で嘔吐し、満腹度を10減らす", () => {
    const player = makePlayer({ drunkenTurns: 5, hunger: 40 });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      advance(player, messages);
    } finally {
      random.mockRestore();
    }
    expect(player.hunger).toBe(29); // 通常の空腹減少1 + 嘔吐10
    expect(messages).toEqual(["酩酊して嘔吐した！満腹度が10減った！"]);
  });

  it("再生防具と回復の指輪は自然回復量をそれぞれ+1する", () => {
    /* base floor(100/100)=1 + 再生防具+1 + 回復指輪+1 = 3 */
    const player = makePlayer({ hp: 70, armor: { ability: "regen" }, rings: [{ effect: "regen_ring" }] });
    advance(player);
    expect(player.hp).toBe(73);
  });

  it("回復の指輪だけなら自然回復が+1", () => {
    /* base 1 + 指輪+1 = 2 */
    const player = makePlayer({ hp: 70, rings: [{ effect: "regen_ring" }] });
    advance(player);
    expect(player.hp).toBe(72);
  });

  it("回復の指輪2個なら自然回復が+2", () => {
    /* base 1 + 指輪×2 = 3 */
    const player = makePlayer({
      hp: 70,
      rings: [{ effect: "regen_ring" }, { effect: "regen_ring" }],
    });
    advance(player);
    expect(player.hp).toBe(73);
  });

  it("再生防具と回復の指輪2個はすべて加算される", () => {
    /* base 1 + 再生+1 + 指輪×2 = 4 */
    const player = makePlayer({
      hp: 70,
      armor: { ability: "regen" },
      rings: [{ effect: "regen_ring" }, { effect: "regen_ring" }],
    });
    advance(player);
    expect(player.hp).toBe(74);
  });

  it("大食い武器は5ターン目に追加で空腹度を減らす", () => {
    const player = makePlayer({ turns: 4, hunger: 20, weapon: { ability: "gluttony" } });
    advance(player);
    expect(player.hunger).toBe(18);
  });
});

describe("applyArmorAura", () => {
  it("隣接する敵だけにダメージを与え、倒した敵を既存の撃破処理へ渡す", () => {
    const adjacent = { name: "コウモリ", x: 6, y: 5, hp: 2 };
    const distant = { name: "ゴブリン", x: 7, y: 5, hp: 5 };
    const dungeon = { monsters: [adjacent, distant] };
    const defeated = [];
    const messages = [];

    applyArmorAura(
      makePlayer({ x: 5, y: 5, armor: { ability: "aura" } }),
      dungeon,
      messages,
      {
        hasAbility: (item, id) => item?.ability === id,
        killMonster: (monster) => defeated.push(monster),
      },
    );

    expect(adjacent.hp).toBe(0);
    expect(distant.hp).toBe(5);
    expect(defeated).toEqual([adjacent]);
    expect(messages).toEqual(["闘気がコウモリに2ダメージ！"]);
  });
  it.each([
    { name: "分身", isPlayerClone: true },
    { name: "店主", type: "shopkeeper", state: "friendly" },
    { name: "会計待ちの店主", type: "shopkeeper", state: "blocking" },
    { name: "行商人", type: "shopkeeper", state: "friendly", isWanderingMerchant: true },
    { name: "冒険者", type: "shopkeeper", state: "friendly", isWanderingAdventurer: true },
    { name: "友好キャラ", state: "friendly" },
    { name: "道具に擬態した敵", disguisedAsItem: true },
  ])("$nameにはダメージを与えない", properties => {
    const monster = { ...properties, x: 6, y: 5, hp: 20 };
    const messages = [], killMonster = vi.fn();
    applyArmorAura(makePlayer({ x: 5, y: 5, armor: { ability: "aura" } }), { monsters: [monster] }, messages,
      { hasAbility: () => true, killMonster });
    expect(monster.hp).toBe(20);
    expect(messages).toEqual([]);
    expect(killMonster).not.toHaveBeenCalled();
  });
  it.each([
    [3, 7, 5, 6], [3, 3, 5, 6], [3, 5, 7, 6], [3, 5, 3, 6],
    [3, 7, 7, 2], [3, 8, 5, 0], [2, 6, 5, 4], [2, 3, 5, 4],
  ])("%sマス角の敵 (%s,%s) に隣接する体のマス数分で%sダメージ", (bodySize, x, y, damage) => {
    const monster = { name: "大型敵", bodySize, x, y, hp: 100 };
    const messages = [];
    applyArmorAura(makePlayer({ x: 5, y: 5, armor: { ability: "aura" } }), { monsters: [monster] }, messages,
      { hasAbility: () => true, killMonster: vi.fn() });
    expect(monster.hp).toBe(100 - damage);
    expect(messages).toEqual(damage ? [`闘気が大型敵に${damage}ダメージ！`] : []);
  });
  it("敵対済みの店主・冒険者は攻撃対象になる", () => {
    const monsters = [
      { name: "店主", type: "shopkeeper", state: "hostile", hp: 20, x: 6, y: 5 },
      { name: "冒険者", type: "shopkeeper", state: "hostile", isWanderingAdventurer: true, hp: 20, x: 5, y: 6 },
    ];
    applyArmorAura(makePlayer({ x: 5, y: 5, armor: { ability: "aura" } }), { monsters }, [],
      { hasAbility: () => true, killMonster: vi.fn() });
    expect(monsters.map(monster => monster.hp)).toEqual([18, 18]);
  });
  it("大型敵を倒したときの撃破処理は1回だけ行う", () => {
    const monster = { name: "大型敵", bodySize: 3, x: 7, y: 5, hp: 3 };
    const dungeon = { monsters: [monster] }, killMonster = vi.fn(monster => dungeon.monsters.splice(dungeon.monsters.indexOf(monster), 1));
    applyArmorAura(makePlayer({ x: 5, y: 5, armor: { ability: "aura" } }), dungeon, [],
      { hasAbility: () => true, killMonster });
    expect(killMonster).toHaveBeenCalledTimes(1);
    expect(dungeon.monsters).toEqual([]);
  });

});

describe("advancePentacleWear", () => {
  it.each([
    [2, 5, 5], [2, 6, 6], [3, 4, 4], [3, 6, 6], [3, 4, 6], [3, 6, 4],
  ])("%sマス角の敵の体(%s,%s)が乗っていても30ターンで消耗する", (bodySize, x, y) => {
    const pentacle = { name: "雷の魔方陣", kind: "thunder_trap", x, y };
    const dungeon = { pentacles: [pentacle], monsters: [{ x: 5, y: 5, bodySize, hp: 100 }] };
    const player = makePlayer({ x: 20, y: 20 }), messages = [];
    for (let turn = 0; turn < 30; turn++) advancePentacleWear(player, dungeon, messages);
    expect(pentacle.standTurns).toBe(30);
    expect(dungeon.pentacles).toEqual([]);
    expect(messages).toEqual(["雷の魔方陣がかすれてきた…(残り5ターン)", "雷の魔方陣が消えた！"]);
  });

  it("大型敵の体が複数の魔方陣に乗れば各魔方陣が1拍に1回ずつ消耗する", () => {
    const pentacles = [{ x: 4, y: 5 }, { x: 6, y: 6 }];
    const dungeon = { pentacles, monsters: [{ x: 5, y: 5, bodySize: 3, hp: 100 }] };
    advancePentacleWear(makePlayer({ x: 20, y: 20 }), dungeon, []);
    expect(pentacles.map(pc => pc.standTurns)).toEqual([1, 1]);
  });

  it.each([{ hp: 0, x: 5, y: 5 }, { hp: 100, x: 8, y: 5 }])("死亡・範囲外の大型敵%sでは消耗しない", monster => {
    const pentacle = { x: 6, y: 5 };
    advancePentacleWear(makePlayer({ x: 20, y: 20 }),
      { pentacles: [pentacle], monsters: [{ bodySize: 3, ...monster }] }, []);
    expect(pentacle.standTurns).toBeUndefined();
  });

  it("大型敵の体の端でも固定転送陣は消耗しない", () => {
    const portal = { x: 6, y: 5, kind: "fixed_portal" }, fixed = { x: 4, y: 5, fixed: true };
    advancePentacleWear(makePlayer({ x: 20, y: 20 }),
      { pentacles: [portal, fixed], monsters: [{ x: 5, y: 5, bodySize: 3, hp: 100 }] }, []);
    expect(portal.standTurns).toBeUndefined();
    expect(fixed.standTurns).toBeUndefined();
  });

  it("25ターン目に警告し、30ターン目に非固定の魔方陣だけを消す", () => {
    const fading = { name: "火炎の魔方陣", x: 5, y: 5, standTurns: 24 };
    const portal = { name: "固定転送", kind: "fixed_portal", x: 5, y: 5, standTurns: 29 };
    const dungeon = { pentacles: [fading, portal], monsters: [] };
    const messages = [];

    advancePentacleWear(makePlayer({ x: 5, y: 5 }), dungeon, messages);
    expect(fading.standTurns).toBe(25);
    expect(portal.standTurns).toBe(29);
    expect(messages).toEqual(["火炎の魔方陣がかすれてきた…(残り5ターン)"]);

    fading.standTurns = 29;
    advancePentacleWear(makePlayer({ x: 5, y: 5 }), dungeon, messages);
    expect(dungeon.pentacles).toEqual([portal]);
    expect(messages.at(-1)).toBe("火炎の魔方陣が消えた！");
  });
});

describe("advanceForcedTurn", () => {
  it("眠り・金縛り・凍結を優先順に1ターンずつ進め、解除を通知する", () => {
    const player = makePlayer({ sleepTurns: 1, paralyzeTurns: 1, frozenTurns: 1 });
    const messages = [];
    expect(hasForcedTurn(player)).toBe(true);
    expect(advanceForcedTurn(player, messages)).toEqual({ advanced: true, exitPotAfterTurn: false });
    expect(player.sleepTurns).toBe(0);
    expect(messages).toEqual(["目が覚めた！"]);
  });

  it("昏睡で眠っている間も酩酊タイマーと嘔吐判定が進む", () => {
    const player = makePlayer({ sleepTurns: 20, drunkenTurns: 20, hunger: 30 });
    const messages = [];
    vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      advance(player, messages);
      advanceCoreStatusTimers(player, messages, { hasRingEffect: () => false });
      advanceForcedTurn(player, messages);
    } finally {
      vi.restoreAllMocks();
    }
    expect(player).toMatchObject({ sleepTurns: 19, drunkenTurns: 19, hunger: 19 });
    expect(messages.some((message) => message.includes("酩酊して嘔吐した"))).toBe(true);
  });

  it("壺の最終ターンは敵行動後の脱出を要求し、鈍足の種類を引き継ぐ", () => {
    const confined = makePlayer({ potConfinedTurns: 1 });
    const potMessages = [];
    expect(advanceForcedTurn(confined, potMessages)).toEqual({ advanced: true, exitPotAfterTurn: true });
    expect(confined.potConfinedTurns).toBe(1);
    expect(potMessages).toEqual(["壺から出られない！"]);

    const slowed = makePlayer({ slowSkip: true, _eqSpeedSlowPending: true });
    const slowMessages = [];
    advanceForcedTurn(slowed, slowMessages);
    expect(slowed).toMatchObject({ slowSkip: false, _eqSpeedAutoAdv: true });
    expect(slowed._eqSpeedSlowPending).toBeUndefined();
    expect(slowMessages).toEqual(["等速の魔方陣によりターンがスキップされた..."]);
  });

});

describe("advancePlayerSpeedPhase", () => {
  function advanceSpeed(player, pentacle, messages = []) {
    const room = {};
    const dungeon = { rooms: [room], pentacles: pentacle ? [pentacle] : [] };
    advancePlayerSpeedPhase(player, dungeon, messages, {
      findRoom: () => room,
      inMagicSealRoom: () => false,
      hasRingEffect: () => false,
      tickBubbleGold: () => {},
    });
    return messages;
  }

  it("祝福された等速の魔方陣は倍速を毎ターン維持する", () => {
    const player = makePlayer({ x: 5, y: 5, hasteTurns: 0 });
    const messages = advanceSpeed(player, { kind: "equal_speed", blessed: true, x: 5, y: 5 });
    expect(player.hasteTurns).toBe(1);
    expect(messages).toEqual([]);
  });

  it("呪われた等速は自動スキップを予約し、通常の倍速終了は通知する", () => {
    const cursed = makePlayer({ x: 5, y: 5 });
    advanceSpeed(cursed, { kind: "equal_speed", cursed: true, x: 5, y: 5 });
    expect(cursed).toMatchObject({ slowSkip: true, _eqSpeedSlowPending: true });

    const hasted = makePlayer({ x: 5, y: 5, hasteTurns: 1, hasteUsed: true });
    const messages = advanceSpeed(hasted, null);
    expect(hasted).toMatchObject({ hasteTurns: 0, hasteUsed: false });
    expect(messages).toEqual(["2倍速が解けた！"]);

    const triple = makePlayer({ x: 5, y: 5, hasteTurns: 1, hasteSpeed: 3 });
    const tripleMessages = advanceSpeed(triple, null);
    expect(triple.hasteSpeed).toBeUndefined();
    expect(tripleMessages).toEqual(["3倍速が解けた！"]);
  });
});

describe("advanceCoreStatusTimers", () => {
  it("酔いと酩酊の残り時間を進めて終了を通知する", () => {
    const player = makePlayer({ drunkTurns: 1, drunkenTurns: 2 });
    const messages = [];
    advanceCoreStatusTimers(player, messages, { hasRingEffect: () => false });
    expect(player).toMatchObject({ drunkTurns: 0, drunkenTurns: 1 });
    expect(messages).toEqual(["酔いが覚めた！"]);
    advanceCoreStatusTimers(player, messages, { hasRingEffect: () => false });
    expect(player.drunkenTurns).toBe(0);
    expect(messages.at(-1)).toBe("酩酊が覚めた！");
  });

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

  it("鈍亀の指輪と各状態の解除を処理する", () => {
    const player = makePlayer({ rings: [{ effect: "slow_ring" }], confusedTurns: 1, darknessTurns: 1, sureHitTurns: 1 });
    const messages = [];
    advanceCoreStatusTimers(player, messages, { hasRingEffect: (entry, effect) => entry.rings.some((ring) => ring.effect === effect) });
    expect(player.slowSkip).toBe(true);
    expect(messages).toEqual(["混乱が解けた！", "暗闇が晴れた！視界が戻った！", "必中状態が切れた！"]);
  });
});

describe("advanceConsumableBuffTimers", () => {
  it("食料由来の強化を減らし、蜂蜜は回復して終了を通知する", () => {
    const player = makePlayer({ hp: 90, spicyAtkTurns: 1, curryFireResTurns: 1, mayonnaiseWaterProofTurns: 1, honeyRegenTurns: 1 });
    const messages = [];
    advanceConsumableBuffTimers(player, messages);
    expect(player.hp).toBe(92);
    expect(messages).toEqual(["辛さによるダメージブーストが切れた！", "カレーの炎耐性が切れた！", "マヨネーズの耐水効果が切れた！", "蜂蜜の自然回復が切れた！"]);
  });

  it("毒中は蜂蜜の自然回復も停止する", () => {
    const player = makePlayer({ hp: 90, poisoned: true, honeyRegenTurns: 1 });
    advanceConsumableBuffTimers(player, []);
    expect(player.hp).toBe(90);
    expect(player.honeyRegenTurns).toBe(0);
  });

  it("幸運と不運の残りターンを減らし、終了を通知する", () => {
    const player = makePlayer({ luckTurns: 1, unluckTurns: 1 });
    const messages = [];

    advanceConsumableBuffTimers(player, messages);

    expect(player).toMatchObject({ luckTurns: 0, unluckTurns: 0 });
    expect(messages).toEqual(["幸運の効果が切れた！", "不運の効果が切れた！"]);
  });

  it("ドーピング終了後だけ副作用へ移行し、副作用も50ターンで切れる", () => {
    const player = makePlayer({ dopingTurns: 1, dopingAftereffectPending: true });
    const messages = [];

    advanceConsumableBuffTimers(player, messages);
    expect(player).toMatchObject({ dopingTurns: 0, dopingAftereffectTurns: 50, dopingAftereffectPending: false });
    expect(messages).toEqual(["ドーピングの効果が切れ、副作用で攻撃力と防御力が半減した！(50ターン)"]);

    for (let i = 0; i < 49; i++) advanceConsumableBuffTimers(player, messages);
    expect(player.dopingAftereffectTurns).toBe(1);
    advanceConsumableBuffTimers(player, messages);
    expect(player.dopingAftereffectTurns).toBe(0);
    expect(messages.at(-1)).toBe("ドーピングの副作用が切れた！攻撃力と防御力が戻った！");
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

  it("100ターン目はMPを自然回復し、復活後の回復禁止中は回復しない", () => {
    const player = makePlayer({ turns: 100, mp: 2, maxMp: 4 });
    advanceEarlyStatusTimers(player, []);
    expect(player.mp).toBe(3);
    player.mpSealTurns = 2;
    advanceEarlyStatusTimers(player, []);
    expect(player.mp).toBe(3);
    expect(player.mpSealTurns).toBe(1);
  });

  it("毒は付与時に攻撃力を下げ、効果中は毎ターンダメージを与える", () => {
    const player = makePlayer({ turns: 0, hp: 50, atk: 5 });
    const poison = applyPlayerPoison(player);
    expect(poison).toMatchObject({ newlyApplied: true, atkLoss: 1, turns: 5 });
    expect(player).toMatchObject({ poisoned: true, poisonedTurns: 5, atk: 4, poisonAtkLoss: 1 });

    const messages = [];
    advance(player, messages);
    advanceEarlyStatusTimers(player, messages);
    expect(player.hp).toBe(49);
    expect(player.poisonedTurns).toBe(4);
    expect(messages).toContain("毒に冒されている！1ダメージ！");
  });

  it("毒の効果中は自然回復せず、持続時間が切れる", () => {
    const player = makePlayer({ turns: 0, hp: 50, poisoned: true, poisonedTurns: 1, atk: 4, poisonAtkLoss: 1 });
    const messages = [];
    advance(player, messages);
    advanceEarlyStatusTimers(player, messages);
    expect(player.hp).toBe(49);
    expect(player.poisoned).toBe(false);
    expect(player.atk).toBe(4);
    expect(messages).toEqual(["毒に冒されている！1ダメージ！", "毒の効果が切れた。攻撃力の低下は残っている..."]);
  });
});
