import { describe, it, expect } from "vitest";
import {
  msgToActionKey,
  findItemActionKey,
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
  isMpReviveMsg,
  pickMpRevivePortrait,
  pickDamagePortrait,
  pickDeathPortrait,
  isDrownDeath,
  resolvePortraitEvent,
  hpKey,
  idleStandKey,
  isLightArmorStand,
  resolvePortraitSetKey,
  pickPortraitForPlayer,
  PORTRAIT_SETS,
} from "../portraits.js";

describe("portraits", () => {
  it("msgToMeleeAttackKey がプレイヤー近接攻撃のみを判定する", () => {
    expect(msgToMeleeAttackKey("スライムに12ダメージ！会心！")).toBe("attack");
    expect(msgToMeleeAttackKey("スライムへの攻撃は外れた！")).toBe("attack");
    expect(msgToMeleeAttackKey("ゴブリンの攻撃！5ダメージ！")).toBeNull();
    expect(msgToMeleeAttackKey("回復薬を飲んだ！")).toBeNull();
    expect(msgToMeleeAttackKey("スライムに8ダメージ！", { weapon: null })).toBe("attack_unarmed");
    expect(msgToMeleeAttackKey("スライムに8ダメージ！", { weapon: { id: 1 } })).toBe("attack");
  });

  it("resolvePortraitEvent が近接攻撃時のみ attack 立ち絵を返す", () => {
    const player = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
      weapon: { id: "sword-1", type: "weapon" },
    };
    const prev = { ...player, weaponId: "sword-1", armorId: null, ringIds: [] };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "スライムに8ダメージ！",
    });
    expect(event.src).toMatch(/battle_melee/);
  });

  it("同ターンに倒した／敵反撃があっても近接立ち絵を優先する", () => {
    const player = {
      hp: 75, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
      weapon: { id: "sword-1", type: "weapon" },
    };
    const prev = { ...player, hp: 80, weaponId: "sword-1", armorId: null, ringIds: [] };
    /* lastMsg は敵反撃。攻撃ログは newMsgs の途中 */
    const newMsgs = [
      "スライムに12ダメージ！",
      "スライムを倒した！(+5exp)",
      "ゴブリンの攻撃！5ダメージ！",
    ];
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: newMsgs[newMsgs.length - 1],
      newMsgs,
      recentMsgs: newMsgs,
    });
    expect(event.src).toMatch(/battle_melee/);
  });

  it("倒したメッセージだけが lastMsg でも newMsgs の攻撃で近接になる", () => {
    const player = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      weapon: { id: "sword-1", type: "weapon" },
    };
    const prev = { ...player, weaponId: "sword-1", armorId: null, ringIds: [] };
    const newMsgs = ["スライムに20ダメージ！", "スライムを倒した！(+5exp)"];
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "スライムを倒した！(+5exp)",
      newMsgs,
    });
    expect(event.src).toMatch(/battle_melee/);
  });

  it("resolvePortraitEvent は武器未装備の攻撃で素手立ち絵を返す", () => {
    const player = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      weapon: null,
    };
    const prev = { ...player, weaponId: null, armorId: null, ringIds: [] };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "スライムに8ダメージ！",
    });
    expect(event.src).toMatch(/battle_unarmed/);
  });

  it("resolvePortraitEvent はダッシュ移動で dash 立ち絵を返す", () => {
    const prev = { hp: 80, maxHp: 100, x: 5, y: 5, level: 3, weaponId: null };
    const player = { ...prev, x: 8, y: 5, weapon: null };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "",
      dashed: true,
    });
    expect(event.src).toMatch(/battle_dash/);
  });

  it("msgToActionKey がアイテム使用を判定する", () => {
    expect(msgToActionKey("回復薬を飲んだ！")).toBe("act_potion");
    expect(msgToActionKey("おにぎりを食べた。")).toBe("act_food");
    expect(msgToActionKey("炎の魔法書を読んだ！")).toBe("act_spellbook");
    expect(msgToActionKey("回復の巻物を読んだ！")).toBe("act_scroll");
    expect(msgToActionKey("保存の壺におにぎりを入れた！")).toBe("act_pot");
    expect(msgToActionKey("チョコの壺を割った！")).toBe("act_pot");
    /* 爆発の副次で壺が割れただけでは壺使用にしない */
    expect(msgToActionKey("壺「弱化の壺」が爆発で割れた！")).toBeNull();
    expect(msgToActionKey("壺「カレーの壺」が爆発で割れ、中身が飛び出した！")).toBeNull();
    expect(msgToActionKey("足元に重力の魔方陣を描いた！(残り1回)")).toBe("act_pen");
    expect(msgToActionKey("魔方陣を描いた瞬間、テレポートした！")).toBe("act_pen");
    expect(msgToActionKey("炎の魔法書を拾った！")).toBeNull();
    expect(msgToActionKey("回復の巻物の上に乗った！")).toBeNull();
    expect(msgToActionKey("保存の壺を拾った！")).toBeNull();
    expect(msgToActionKey("何もない")).toBeNull();
    /* かすれ・消滅・他者描画は描画立ち絵にしない */
    expect(msgToActionKey("重力の魔方陣がかすれてきた…(残り5ターン)")).toBeNull();
    expect(msgToActionKey("重力の魔方陣が消えた！")).toBeNull();
    expect(msgToActionKey("みかわしの魔方陣の加護でかわした！")).toBeNull();
    expect(msgToActionKey("ラクガキ魔が足元に回復の魔方陣を描いた！")).toBeNull();
  });

  it("アイテム使用立ち絵は今回追加されたログだけを参照する", () => {
    expect(findItemActionKey([
      "回復の巻物を読んだ！",
      "何も起きなかった。",
    ])).toBe("act_scroll");
    expect(findItemActionKey([])).toBeNull();
    expect(findItemActionKey(["回復の巻物を拾った！"])).toBeNull();

    const player = { hp: 80, maxHp: 100, x: 6, y: 5, level: 3 };
    const prev = { ...player, x: 5, y: 5 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "回復の巻物を読んだ！",
      recentMsgs: ["回復の巻物を読んだ！"],
      newMsgs: [],
    });
    expect(event.src).toBeUndefined();
    expect(event.moved).toBe(true);
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
    expect(isPlayerDamageMsg("跳ね返された矢がしろがねに命中！8ダメージ！", "しろがね")).toBe(true);
    expect(isMonsterDamageMsg("跳ね返された矢がしろがねに命中！8ダメージ！", "しろがね")).toBe(false);
    expect(isPlayerDamageMsg("岩が命中！19ダメージ！")).toBe(true);
    expect(isPlayerDamageMsg("19ダメージ！")).toBe(false); /* 落石の旧メッセージ：被ダメ判定に乗らない */
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

  it("痛恨の一撃は強打立ち絵。回復魔方陣の敵ダメージを被ダメと誤認しない", () => {
    expect(isMonsterDamageMsg("回復の魔方陣の回復力がゾンビを傷つけた！5ダメージ！（アンデッド）")).toBe(true);
    expect(isPlayerDamageMsg("回復の魔方陣の回復力がゾンビを傷つけた！5ダメージ！（アンデッド）")).toBe(false);
    expect(isMonsterDamageMsg("石飛ばしの魔方陣の魔法の石がゾンビに当たった！5ダメージ！")).toBe(true);
    /* 痛恨はダメージ数値の前：〜の攻撃！痛恨の一撃！Nダメージ！ */
    const critHit = "タトゥーバードの攻撃！痛恨の一撃！8ダメージ！";
    expect(isPlayerDamageMsg(critHit)).toBe(true);
    expect(msgToDamageKey(critHit)).toBe("damage_heavy");
    expect(msgToDamageKey("痛恨の一撃！")).toBe("damage_heavy");

    const batch = [
      critHit,
      "回復の魔方陣の回復力がゾンビを傷つけた！5ダメージ！（アンデッド）",
      "石飛ばしの魔方陣の魔法の石がゾンビに当たった！5ダメージ！",
    ];
    expect(findPlayerDamageMsg(batch, batch[batch.length - 1])).toBe(critHit);

    const prev = { hp: 59, maxHp: 282, x: 5, y: 5, level: 17 };
    const player = { ...prev, hp: 51 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: batch[batch.length - 1],
      recentMsgs: batch,
      newMsgs: batch,
    });
    expect(event.src).toMatch(/damage_heavy/);
    expect(event.force).toBe(false);
    expect(event.lowPriority).toBe(true);
  });

  it("msgToDamageKey が属性別ダメージを判定する", () => {
    expect(msgToDamageKey("スライムが炎ブレスを吐いた！20ダメージ！")).toBe("damage_fire");
    expect(msgToDamageKey("ドラゴンが氷ブレスを吐いた！15ダメージ！")).toBe("damage_ice");
    expect(msgToDamageKey("ゴブリンの石が命中！8ダメージ！")).toBe("damage_rock");
    expect(msgToDamageKey("岩が命中！19ダメージ！")).toBe("damage_rock");
    expect(msgToDamageKey("落石の罠が作動！岩が降ってきた！")).toBe("damage_rock");
    expect(msgToDamageKey("シオン・ザ・ダークブレットの銃弾が命中！15ダメージ！")).toBe("damage_gun");
    expect(msgToDamageKey("わてりの水鉄砲が命中！10ダメージ！")).toBe("damage_watergun");
    expect(msgToDamageKey("ゴブリンの攻撃！5ダメージ！")).toBe("damage_heavy");
    expect(msgToDamageKey("地雷！50ダメージ！")).toBe("damage_explosion");
    expect(msgToDamageKey("毒矢が命中！8ダメージ！毒を受けた！")).toBe("damage_poison");
    expect(msgToDamageKey("雷の魔法が跳ね返ってきた！25ダメージ！")).toBe("damage_lightning");
    /* 風穴メッセージを落とし穴と誤認しない */
    expect(msgToDamageKey("風穴の風が飛び道具を曲げた！")).not.toBe("damage_falling");
    expect(msgToDamageKey("風に煽られた短剣 (攻+3)が自分に当たった！")).toBe("damage_heavy");
    expect(msgToDamageKey("落とし穴が発動！穴に落ちた！")).toBe("damage_falling");
  });

  it("汎用ダメージ立ち絵に落下絵が混ざらない", () => {
    const src = pickDamagePortrait("風に煽られた短剣が自分に当たった！");
    expect(src).not.toMatch(/damage_falling/);
    expect(src).toMatch(/damage_heavy|hp_hurt/);
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
    expect(hpKey({ hp: 100, maxHp: 100 })).toBe("hp_full");
    expect(hpKey({ hp: 90, maxHp: 100 })).toBe("hp_high");
    expect(hpKey({ hp: 75, maxHp: 100 })).toBe("hp_mid");
    expect(hpKey({ hp: 50, maxHp: 100 })).toBe("hp_low_stand");
    expect(hpKey({ hp: 30, maxHp: 100 })).toBe("hp_low_kneel");
    expect(hpKey({ hp: 15, maxHp: 100 })).toBe("hp_critical");
  });

  it("idleStandKey が防具で待機立ち絵を分岐する", () => {
    expect(isLightArmorStand({ name: "みかわしの服" })).toBe(true);
    expect(isLightArmorStand({ name: "腹持ちの胴" })).toBe(true);
    expect(isLightArmorStand({ name: "革の鎧" })).toBe(false);
    expect(isLightArmorStand({ name: "プレートメイル" })).toBe(false);
    expect(idleStandKey({ hp: 100, maxHp: 100, armor: null })).toBe("stand_unarmored");
    expect(idleStandKey({ hp: 100, maxHp: 100, armor: { name: "みかわしの服" } })).toBe("stand_light_armor");
    expect(idleStandKey({ hp: 100, maxHp: 100, armor: { name: "腹持ちの胴" } })).toBe("stand_light_armor");
    expect(idleStandKey({ hp: 90, maxHp: 100, armor: null })).toBe("hp_high");
    expect(idleStandKey({ hp: 90, maxHp: 100, armor: { name: "みかわしの服" } })).toBe("hp_high");
    expect(idleStandKey({ hp: 90, maxHp: 100, armor: { name: "革の鎧" } })).toBe("hp_high");
    expect(idleStandKey({ hp: 90, maxHp: 100, armor: { name: "プレートメイル" } })).toBe("hp_high");
    expect(idleStandKey({ hp: 30, maxHp: 100, armor: null })).toBe("hp_low_kneel");
    expect(idleStandKey({ hp: 15, maxHp: 100, armor: null })).toBe("hp_critical");
  });

  it("未装備時は歩行・素手攻撃を下着姿グループに差し替える", () => {
    expect(resolvePortraitSetKey("walk", { armor: null })).toBe("walk_unarmored");
    expect(resolvePortraitSetKey("attack_unarmed", { armor: null })).toBe("attack_unarmed_bare");
    expect(resolvePortraitSetKey("walk", { armor: { name: "革の鎧" } })).toBe("walk");
    expect(resolvePortraitSetKey("attack_unarmed", { armor: { name: "プレートメイル" } })).toBe("attack_unarmed");
    expect(PORTRAIT_SETS.walk_unarmored).toEqual(
      expect.arrayContaining(["stand_unarmored_walk", "stand_unarmored_advance"]),
    );
    expect(PORTRAIT_SETS.attack_unarmed_bare).toEqual(
      expect.arrayContaining(["battle_unarmed_unarmored", "battle_unarmed_unarmored_2"]),
    );
  });

  it("全状況を防具なしグループへ分岐し、空欄時は元グループへ戻せる", () => {
    expect(resolvePortraitSetKey("damage_fire", { armor: null })).toBe("damage_fire_unarmored");
    expect(resolvePortraitSetKey("act_potion", { armor: null })).toBe("act_potion_unarmored");
    expect(resolvePortraitSetKey("status_poison", { armor: null })).toBe("status_poison_unarmored");
    expect(resolvePortraitSetKey("damage_fire", { armor: { name: "革の鎧" } })).toBe("damage_fire");

    const baseOnly = { damage_fire: ["damage_fire"] };
    expect(pickPortraitForPlayer("damage_fire", { armor: null }, baseOnly)).toBe(
      "/tiles/Character/damage_fire.png",
    );

    const withBranch = {
      damage_fire: ["damage_fire"],
      damage_fire_unarmored: ["damage_fire_unarmored"],
    };
    expect(pickPortraitForPlayer("damage_fire", { armor: null }, withBranch)).toMatch(
      /^\/tiles\/Character\/damage_fire_unarmored\.png\?portraitFallback=/,
    );
  });

  it("防具を外すと未装備立ち絵になる", () => {
    const player = {
      hp: 90, maxHp: 100, x: 5, y: 5, level: 3, armor: null,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = {
      ...player,
      armorId: "leather-1",
      weaponId: null,
      ringIds: [],
    };
    const event = resolvePortraitEvent({ player, prev, lastMsg: "革の鎧を外した。" });
    expect(event.src).toMatch(/stand_unarmored/);
  });

  it("MP復活は大回復立ち絵にせずピンチ専用へ", () => {
    const msg = "HPがゼロになった！残りMP182でHP182として復活！MPは1000ターン回復しない。";
    expect(isMpReviveMsg(msg)).toBe(true);
    expect(PORTRAIT_SETS.hp_mp_revive).toContain("hp_mp_revive");
    const prev = { hp: 16, maxHp: 282, x: 5, y: 5, level: 17, mpSealTurns: 0 };
    const player = { ...prev, hp: 182, mp: 0, mpSealTurns: 1000 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: msg,
      newMsgs: ["ぼっちもべの攻撃！16ダメージ！", msg],
    });
    expect(event.force).toBe(true);
    expect(event.src).not.toMatch(/hp_healed|reaction_joy|reaction_motivated/);
    /* 画像未設定時はピンチ系、設定後は hp_mp_revive */
    expect(event.src).toMatch(/hp_mp_revive|hp_low|hp_critical/);
    expect(pickMpRevivePortrait()).toMatch(/hp_mp_revive|hp_low|hp_critical/);
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

  it("毒などの状態異常中は被ダメで上書きせず状態を維持する", () => {
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      poisoned: true, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0, soakedTurns: 0,
    };
    const player = { ...prev, hp: 70 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "ゴブリンの攻撃！10ダメージ！",
      newMsgs: ["ゴブリンの攻撃！10ダメージ！"],
    });
    expect(event.src).toMatch(/status_poison/);
    expect(event.holdKey).toBe("status_poison");
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

  it("拘束中は攻撃など他行動より拘束立ち絵を優先する", () => {
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      capturedBy: "mon-grabber-1",
      weaponId: "sword-1",
    };
    const player = {
      ...prev,
      weapon: { id: "sword-1", type: "weapon" },
      capturedBy: "mon-grabber-1",
    };
    const attack = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "からめ鬼に8ダメージ！",
    });
    expect(attack.src).toMatch(/status_bound/);
    expect(attack.force).toBe(true);

    const potion = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "回復薬を飲んだ！",
    });
    expect(potion.src).toMatch(/status_bound/);
  });

  it("拘束中は被ダメより拘束を維持し、死亡だけ優先する", () => {
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      capturedBy: "mon-grabber-1",
    };
    const hurt = resolvePortraitEvent({
      player: { ...prev, hp: 60, weapon: null },
      prev,
      lastMsg: "からめ鬼の攻撃！20ダメージ！",
      newMsgs: ["からめ鬼の攻撃！20ダメージ！"],
    });
    expect(hurt.src).toMatch(/status_bound/);
    expect(hurt.holdKey).toBe("status_bound");

    const dead = resolvePortraitEvent({
      player: { ...prev, hp: 0, deathCause: "からめ鬼の攻撃で", weapon: null },
      prev,
      lastMsg: "",
    });
    expect(dead.src).toMatch(/gameover_dead/);
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

  it("壁ダメージ中だけ壁埋まり・窒息立ち絵を維持する", () => {
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      _wallSuffocationDamage: false, wallWalkTurns: 0,
    };
    const event = resolvePortraitEvent({
      player: { ...prev, hp: 65, _wallSuffocationDamage: true },
      prev,
      lastMsg: "壁に挟まれて苦しい！15ダメージ！",
      newMsgs: ["壁に挟まれて苦しい！15ダメージ！"],
    });
    expect(event.src).toMatch(/status_wall_suffocation/);
    expect(event.holdKey).toBe("status_wall_suffocation");
    expect(event.force).toBe(true);
  });

  it("壁抜け中は窒息フラグがあっても壁埋まり立ち絵を出さない", () => {
    const prev = {
      hp: 80, maxHp: 100, x: 5, y: 5, level: 3,
      _wallSuffocationDamage: false, wallWalkTurns: 2,
    };
    const event = resolvePortraitEvent({
      player: { ...prev, hp: 65, _wallSuffocationDamage: true },
      prev,
      lastMsg: "壁に挟まれて苦しい！15ダメージ！",
      newMsgs: ["壁に挟まれて苦しい！15ダメージ！"],
    });
    expect(event.src).toBeUndefined();
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
    expect(event.force).toBe(false);
    expect(event.lowPriority).toBe(true);
    expect(event.src).toMatch(/damage_watergun/);
  });

  it("resolvePortraitEvent が落石の岩命中で damage_rock を出す", () => {
    const player = {
      hp: 250, maxHp: 267, x: 5, y: 5, level: 14,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = { ...player, hp: 269 };
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: "岩が命中！19ダメージ！",
      newMsgs: ["落石の罠が作動！岩が降ってきた！", "岩が命中！19ダメージ！"],
    });
    expect(event.force).toBe(false);
    expect(event.lowPriority).toBe(true);
    expect(event.src).toMatch(/damage_rock/);
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

  it("自爆の巻物後に壺が割れても爆発立ち絵を優先する", () => {
    const player = {
      hp: 1, maxHp: 210, hunger: 41, maxHunger: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const prev = { ...player, hp: 206 };
    const newMsgs = [
      "自爆！中心から2マス（5×5）に大爆発！",
      "爆発が自分を直撃！HPが1になった！",
      "壺「弱化の壺」が爆発で割れた！",
      "壺「カレーの壺」が爆発で割れた！",
      "壺「味噌の壺」が爆発で割れた！",
      "壺「燻製の壺」が爆発で割れた！",
    ];
    const event = resolvePortraitEvent({
      player,
      prev,
      lastMsg: newMsgs[newMsgs.length - 1],
      newMsgs,
      recentMsgs: newMsgs,
    });
    expect(event.src).toMatch(/damage_explosion/);
    expect(event.force).toBe(true);
  });

  it("雷撃・雷の魔方陣・炎の杖/薬の自分被ダメを属性立ち絵にする", () => {
    expect(isPlayerDamageMsg("雷撃が自分に命中！25ダメージ！")).toBe(true);
    expect(msgToDamageKey("雷撃が自分に命中！25ダメージ！")).toBe("damage_lightning");
    expect(isPlayerDamageMsg("雷の魔方陣に打たれた！25ダメージ！")).toBe(true);
    expect(msgToDamageKey("雷の魔方陣に打たれた！25ダメージ！")).toBe("damage_lightning");
    expect(isPlayerDamageMsg("炎の弾が自分に命中！20ダメージ！")).toBe(true);
    expect(msgToDamageKey("炎の弾が自分に命中！20ダメージ！")).toBe("damage_fire");
    expect(isPlayerDamageMsg("炎の薬を飲んだ。体が燃えるように熱い！15ダメージ！")).toBe(true);
    expect(msgToDamageKey("炎の薬を飲んだ。体が燃えるように熱い！15ダメージ！")).toBe("damage_fire");

    const base = {
      maxHp: 100, hunger: 50, maxHunger: 100, x: 5, y: 5, level: 3,
      poisoned: false, sleepTurns: 0, confusedTurns: 0,
      darknessTurns: 0, oilyTurns: 0,
    };
    const thunder = resolvePortraitEvent({
      player: { ...base, hp: 70 },
      prev: { ...base, hp: 95 },
      lastMsg: "雷の魔方陣に打たれた！25ダメージ！",
      newMsgs: ["足元に雷の魔方陣を描いた！(残り1回)", "雷の魔方陣に打たれた！25ダメージ！"],
    });
    expect(thunder.src).toMatch(/damage_lightning/);

    const fireWand = resolvePortraitEvent({
      player: { ...base, hp: 70 },
      prev: { ...base, hp: 90 },
      lastMsg: "炎の弾が自分に命中！20ダメージ！",
      newMsgs: ["炎の杖を振った！(残り3)", "炎の弾が自分に命中！20ダメージ！"],
    });
    expect(fireWand.src).toMatch(/damage_fire/);

    const firePot = resolvePortraitEvent({
      player: { ...base, hp: 80 },
      prev: { ...base, hp: 95 },
      lastMsg: "炎の薬を飲んだ。体が燃えるように熱い！15ダメージ！",
      newMsgs: ["炎の薬を飲んだ。体が燃えるように熱い！15ダメージ！"],
    });
    expect(firePot.src).toMatch(/damage_fire/);
  });
});
