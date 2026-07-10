import { describe, it, expect } from "vitest";
import {
  msgToActionKey,
  msgToDamageKey,
  msgToMeleeAttackKey,
  isPlayerDamageMsg,
  isMonsterDamageMsg,
  findPlayerDamageMsg,
  pickDamagePortrait,
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

  it("resolvePortraitEvent が状態異常を正しく参照する", () => {
    const player = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: true, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const event = resolvePortraitEvent({ player, prev, lastMsg: "" });
    expect(event.src).toMatch(/status_poison/);
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

  it("resolvePortraitEvent は空腹など被ダメ以外のHP減少で立ち絵を変えない", () => {
    const player = {
      hp: 79, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = { ...player, hp: 80 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "空腹でHPが減っている...",
      newMsgs: ["空腹でHPが減っている..."],
    });
    expect(event.src).toBeUndefined();
    expect(event.isLow).toBe(false);
  });

  it("resolvePortraitEvent は古い被ダメログだけでは立ち絵を変えない", () => {
    const player = {
      hp: 79, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = { ...player, hp: 80 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "空腹でHPが減っている...",
      recentMsgs: ["ゴブリンの攻撃！10ダメージ！", "空腹でHPが減っている..."],
      newMsgs: ["空腹でHPが減っている..."],
    });
    expect(event.src).toBeUndefined();
  });
});