import { describe, it, expect } from "vitest";
import {
  msgToActionKey,
  msgToDamageKey,
  msgToMeleeAttackKey,
  isPlayerDamageMsg,
  isMonsterDamageMsg,
  findPlayerDamageMsg,
  isHungerMsg,
  findHungerMsg,
  isStarving,
  isStairsMsg,
  isShopMsg,
  isCursedAcquireMsg,
  detectEquipChange,
  isSatiatedGain,
  isMajorHeal,
  pickDamagePortrait,
  pickDeathPortrait,
  isDrownDeath,
  resolvePortraitEvent,
  hpKey,
  PORTRAIT_SETS,
} from "../portraits.js";

describe("portraits", () => {
  it("msgToMeleeAttackKey がプレイヤー近接攻撃のみを判定する", () => {
    expect(msgToMeleeAttackKey("スライムに12ダメージ！会心！")).toBe("attack");
    expect(msgToMeleeAttackKey("スライムへの攻撃は外れた！")).toBe("attack");
    expect(msgToMeleeAttackKey("ゴブリンの攻撃！5ダメージ！")).toBeNull();
    expect(msgToMeleeAttackKey("回復薬を飲んだ！")).toBeNull();
  });

  it("resolvePortraitEvent が近接攻撃時のみ attack 立ち絵を返す", () => {
    const player = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const event = resolvePortraitEvent({
      player,
      prev: { ...player },
      lastMsg: "スライムに8ダメージ！",
    });
    expect(event.src).toMatch(/battle_melee/);
  });

  it("msgToActionKey がアイテム使用を判定する", () => {
    expect(msgToActionKey("回復薬を飲んだ！")).toBe("act_potion");
    expect(msgToActionKey("おにぎりを食べた。")).toBe("act_food");
    expect(msgToActionKey("炎の魔法書を読んだ！")).toBe("act_spellbook");
    expect(msgToActionKey("回復の巻物を読んだ！")).toBe("act_scroll");
    expect(msgToActionKey("保存の壺におにぎりを入れた！")).toBe("act_pot");
    expect(msgToActionKey("炎の魔法書を拾った！")).toBeNull();
    expect(msgToActionKey("回復の巻物の上に乗った！")).toBeNull();
    expect(msgToActionKey("保存の壺を拾った！")).toBeNull();
    expect(msgToActionKey("何もない")).toBeNull();
  });

  it("msgToActionKey が腐った・ヤバイ食料を直近ログから判定する", () => {
    const rottenLog = [
      "腐ったおにぎりを食べた。(満腹度+3)",
      "腐っていた！8ダメージを受けた！",
      "食中毒になった！毒状態になった！攻撃力が徐々に下がっていく…",
    ];
    expect(msgToActionKey("食中毒になった！", rottenLog)).toBe("act_food_rotten");

    const yabaiLog = [
      "ヤバイおにぎりを食べた。(満腹度+1)",
      "ヤバすぎる！20ダメージ！",
      "体が重くなった…(鈍足10ターン)",
    ];
    expect(msgToActionKey("体が重くなった…", yabaiLog)).toBe("act_food_yabai");
  });

  it("resolvePortraitEvent が腐った食料のHP減少時に act_food_rotten を優先する", () => {
    const player = {
      hp: 72, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: true, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const recentMsgs = [
      "腐ったおにぎりを食べた。(満腹度+3)",
      "腐っていた！8ダメージを受けた！",
    ];
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: recentMsgs[1],
      recentMsgs,
    });
    expect(event.src).toMatch(/action_eat_rotten/);
  });

  it("isPlayerDamageMsg / isMonsterDamageMsg が被ダメ主体を区別する", () => {
    expect(isPlayerDamageMsg("ゴブリンの攻撃！5ダメージ！")).toBe(true);
    expect(isPlayerDamageMsg("スライムが炎ブレスを吐いた！20ダメージ！")).toBe(true);
    expect(isPlayerDamageMsg("地雷！50ダメージ！")).toBe(true);
    expect(isPlayerDamageMsg("跳ね返された矢がプレイヤーに命中！8ダメージ！")).toBe(true);
    expect(isPlayerDamageMsg("スライムに12ダメージ！会心！")).toBe(false);
    expect(isPlayerDamageMsg("爆風でスライムに10ダメージ！")).toBe(false);
    expect(isPlayerDamageMsg("空腹でHPが減っている...")).toBe(false);
    expect(isMonsterDamageMsg("スライムに12ダメージ！会心！")).toBe(true);
    expect(isMonsterDamageMsg("炎の弾がスライムに命中！20ダメージ！")).toBe(true);
    expect(isMonsterDamageMsg("ゴブリンの攻撃！5ダメージ！")).toBe(false);
  });

  it("findPlayerDamageMsg が新規ログから被ダメを拾う", () => {
    const newMsgs = ["スライムを倒した！", "ゴブリンの攻撃！7ダメージ！"];
    expect(findPlayerDamageMsg(newMsgs, "ゴブリンの攻撃！7ダメージ！")).toBe("ゴブリンの攻撃！7ダメージ！");
    expect(findPlayerDamageMsg(["スライムに10ダメージ！"], "スライムに10ダメージ！")).toBeNull();
  });

  it("msgToDamageKey が属性別ダメージを判定する", () => {
    expect(msgToDamageKey("スライムが炎ブレスを吐いた！20ダメージ！")).toBe("damage_fire");
    expect(msgToDamageKey("ドラゴンが氷ブレスを吐いた！15ダメージ！")).toBe("damage_ice");
    expect(msgToDamageKey("ゴブリンの石が命中！8ダメージ！")).toBe("damage_rock");
    expect(msgToDamageKey("シオン・ザ・ダークブレットの銃弾が命中！15ダメージ！")).toBe("damage_gun");
    expect(msgToDamageKey("わてりの水鉄砲が命中！10ダメージ！")).toBe("damage_watergun");
    expect(msgToDamageKey("ゴブリンの攻撃！5ダメージ！")).toBe("damage_heavy");
    expect(msgToDamageKey("地雷！50ダメージ！")).toBe("damage_explosion");
    expect(msgToDamageKey("毒矢が命中！8ダメージ！毒を受けた！")).toBe("damage_poison");
    expect(msgToDamageKey("雷の魔法が跳ね返ってきた！25ダメージ！")).toBe("damage_lightning");
  });

  it("pickDamagePortrait がグループからパスを返す", () => {
    const src = pickDamagePortrait("炎ブレスを吐いた！");
    expect(src).toMatch(/^\/tiles\/Character\/damage_fire/);
    expect(PORTRAIT_SETS.damage_fire).toContain("damage_fire");
  });

  it("追加スロットがあれば抽選グループに含まれる", async () => {
    const { mergePortraitCategories, buildPortraitSets } = await import("../portraitCatalog.js");
    const sets = buildPortraitSets(mergePortraitCategories([
      {
        file: "damage_arrow_2",
        label: "矢 2",
        group: "damage_arrow",
        categoryId: "damage",
        afterFile: "damage_arrow",
      },
    ]));
    expect(sets.damage_arrow).toContain("damage_arrow_2");
  });

  it("hpKey が HP 帯を返す", () => {
    expect(hpKey({ hp: 10, maxHp: 100 })).toBe("hp_low");
    expect(hpKey({ hp: 50, maxHp: 100 })).toBe("hp_mid");
    expect(hpKey({ hp: 90, maxHp: 100 })).toBe("hp_full");
  });

  it("自然回復では回復立ち絵を出さず、大回復だけを表示する", () => {
    const prev = { hp: 50, maxHp: 100, x: 5, y: 5, level: 3 };
    expect(isMajorHeal({ ...prev, hp: 51 }, prev)).toBe(false);
    expect(isMajorHeal({ ...prev, hp: 70 }, prev)).toBe(true);
    expect(resolvePortraitEvent({ player: { ...prev, hp: 51 }, prev, lastMsg: "自然回復した" }).src).toBeUndefined();
    const event = resolvePortraitEvent({ player: { ...prev, hp: 70 }, prev, lastMsg: "大回復した" });
    expect(event.src).toMatch(/hp_healed/);
    expect(event.bypassCooldown).toBe(false);
  });

  it("能動アクションはクールダウンを迂回する", () => {
    const player = { hp: 80, maxHp: 100, x: 5, y: 5, level: 3 };
    const event = resolvePortraitEvent({ player, prev: { ...player }, lastMsg: "回復薬を飲んだ！" });
    expect(event.src).toMatch(/action_drink_potion/);
    expect(event.bypassCooldown).toBe(true);
  });

  it("resolvePortraitEvent が状態異常を正しく参照する", () => {
    const player = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: true, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0, soakedTurns: 0,
    };
    const event = resolvePortraitEvent({ player, prev, lastMsg: "" });
    expect(event.src).toMatch(/status_poison/);
  });

  it("resolvePortraitEvent がずぶ濡れを反映する", () => {
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0, soakedTurns: 0,
    };
    const player = { ...prev, soakedTurns: 10 };
    const event = resolvePortraitEvent({ player, prev, lastMsg: "ずぶ濡れ" });
    expect(event.src).toMatch(/status_soaked/);
  });

  it("resolvePortraitEvent が拘束状態（からめ鬼捕獲）を反映する", () => {
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      capturedBy: null,
    };
    const player = { ...prev, capturedBy: "mon-grabber-1" };
    const event = resolvePortraitEvent({ player, prev, lastMsg: "からめ鬼に絡め取られた！" });
    expect(event.src).toMatch(/status_bound/);
    expect(event.force).toBe(true);
  });

  it("resolvePortraitEvent が閉じ込め状態（とじこめの壺）を反映する", () => {
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      potConfinedTurns: 0,
    };
    const player = { ...prev, potConfinedTurns: 20 };
    const event = resolvePortraitEvent({ player, prev, lastMsg: "壺に入った！" });
    expect(event.src).toMatch(/status_confined/);
    expect(event.force).toBe(true);
  });

  it("resolvePortraitEvent がダメージ種別をメッセージから選ぶ", () => {
    const player = {
      hp: 70, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = { ...player, hp: 80 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "わてりの水鉄砲が命中！12ダメージ！",
      newMsgs: ["わてりの水鉄砲が命中！12ダメージ！"],
    });
    expect(event.force).toBe(true);
    expect(event.src).toMatch(/damage_watergun/);
  });

  it("resolvePortraitEvent は飢餓中のHP減少で hp_hunger を出す", () => {
    const player = {
      hp: 79, maxHp: 100, hunger: 0, maxHunger: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = { ...player, hp: 80 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "",
      newMsgs: [],
    });
    expect(event.force).toBe(true);
    expect(event.src).toMatch(/hp_hunger/);
  });

  it("resolvePortraitEvent は空腹罠で hp_hunger を出す", () => {
    const player = {
      hp: 80, maxHp: 100, hunger: 70, maxHunger: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = { ...player, hunger: 80 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "急に空腹を感じた！満腹度が10%下がった。",
      newMsgs: ["急に空腹を感じた！満腹度が10%下がった。"],
    });
    expect(event.src).toMatch(/hp_hunger/);
  });

  it("isHungerMsg が空腹ログを判定する", () => {
    expect(isHungerMsg("空腹でHPが減り始めた！")).toBe(true);
    expect(isHungerMsg("急に空腹を感じた！満腹度が10%下がった。")).toBe(true);
    expect(isHungerMsg("ゴブリンの攻撃！5ダメージ！")).toBe(false);
    expect(isStarving({ hunger: 0 })).toBe(true);
    expect(findHungerMsg(["スライムを倒した", "空腹でHPが減り始めた！"])).toBe("空腹でHPが減り始めた！");
  });

  it("detectEquipChange が武器・防具・指輪を区別する", () => {
    const prev = { weaponId: "w1", armorId: "a1", ringIds: ["r1"] };
    expect(detectEquipChange({ weapon: { id: "w2" }, armor: { id: "a1" }, rings: [{ id: "r1" }] }, prev))
      .toBe("act_equip_weapon");
    expect(detectEquipChange({ weapon: { id: "w1" }, armor: { id: "a2" }, rings: [{ id: "r1" }] }, prev))
      .toBe("act_equip_armor");
    expect(detectEquipChange({ weapon: { id: "w1" }, armor: { id: "a1" }, rings: [{ id: "r1" }, { id: "r2" }] }, prev))
      .toBe("act_equip_ring");
  });

  it("resolvePortraitEvent が状態異常・階段・店・装備を反映する", () => {
    const base = {
      hp: 80, maxHp: 100, hunger: 50, maxHunger: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0, darknessTurns: 0, oilyTurns: 0,
      paralyzeTurns: 0, slowTurns: 0, bewitchedTurns: 0, immobileTurns: 0,
      mpCooldownTurns: 0, sealedTurns: 0,
      weaponId: null, armorId: null, ringIds: [], floating: false,
    };
    expect(resolvePortraitEvent({
      player: { ...base, paralyzeTurns: 10 },
      prev: base,
      lastMsg: "金縛りになった！(5ターン)",
      newMsgs: ["金縛りになった！(5ターン)"],
    }).src).toMatch(/status_paralyze/);

    expect(resolvePortraitEvent({
      player: base,
      prev: base,
      lastMsg: "地下3階に降りた。",
      newMsgs: ["地下3階に降りた。"],
    }).src).toMatch(/reaction_stairs/);

    expect(resolvePortraitEvent({
      player: base,
      prev: base,
      lastMsg: "代金を支払った。ありがとうございます！",
      newMsgs: ["代金を支払った。ありがとうございます！"],
    }).src).toMatch(/reaction_shop/);

    expect(resolvePortraitEvent({
      player: { ...base, weapon: { id: "w9", name: "短剣" }, weaponId: "w9" },
      prev: base,
      lastMsg: "短剣を装備した。",
      newMsgs: ["短剣を装備した。"],
    }).src).toMatch(/action_equip_weapon/);
  });

  it("resolvePortraitEvent が満腹回復と呪い装備を反映する", () => {
    const prev = {
      hp: 80, maxHp: 100, hunger: 20, maxHunger: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0, darknessTurns: 0, oilyTurns: 0,
      paralyzeTurns: 0, slowTurns: 0, bewitchedTurns: 0, immobileTurns: 0,
      mpCooldownTurns: 0, sealedTurns: 0, weaponId: null, armorId: null, ringIds: [], floating: false,
    };
    const player = { ...prev, hunger: 95 };
    expect(resolvePortraitEvent({
      player,
      prev,
      lastMsg: "おにぎりを食べた。(満腹度+40)",
      newMsgs: ["おにぎりを食べた。(満腹度+40)"],
    }).src).toMatch(/hp_satiated/);
    expect(isSatiatedGain(player, prev)).toBe(true);

    expect(resolvePortraitEvent({
      player: prev,
      prev,
      lastMsg: "呪われた鎧を装備した。【呪】呪われている！外せなくなった！",
      newMsgs: ["呪われた鎧を装備した。【呪】呪われている！外せなくなった！"],
    }).src).toMatch(/status_cursed/);
    expect(isCursedAcquireMsg("【呪】呪われている！外せなくなった！")).toBe(true);
    expect(isStairsMsg("地下5階に落ちた！")).toBe(true);
    expect(isShopMsg("代金を支払った。ありがとうございます！")).toBe(true);
  });

  it("pickDeathPortrait が溺死死因で gameover_drown を返す", () => {
    expect(isDrownDeath("水没により")).toBe(true);
    expect(pickDeathPortrait("水没により")).toMatch(/gameover_drown/);
    expect(pickDeathPortrait("ゴブリンの攻撃により")).toMatch(/gameover_dead/);
  });

  it("resolvePortraitEvent が溺死時に gameover_drown を返す", () => {
    const event = resolvePortraitEvent({
      player: { hp: 0, maxHp: 100, deathCause: "水没により", x: 5, y: 5 },
      prev: { hp: 10, maxHp: 100, x: 5, y: 5 },
      lastMsg: "周囲に逃げ場がなく溺れた！",
      newMsgs: ["周囲に逃げ場がなく溺れた！"],
    });
    expect(event.src).toMatch(/gameover_drown/);
    expect(event.force).toBe(true);
  });

  it("resolvePortraitEvent は古い被ダメログだけでは立ち絵を変えない", () => {
    const player = {
      hp: 79, maxHp: 100, hunger: 50, maxHunger: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = { ...player, hp: 80 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "ターンが経過した。",
      recentMsgs: ["ゴブリンの攻撃！10ダメージ！", "ターンが経過した。"],
      newMsgs: ["ターンが経過した。"],
    });
    expect(event.src).toBeUndefined();
  });
});
