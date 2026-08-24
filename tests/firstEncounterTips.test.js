import { describe, expect, it } from "vitest";
import {
  FIRST_ENCOUNTER_TIPS,
  getFirstEncounterMessageTipKeys,
  getFirstEncounterPickupTipKeys,
  getFirstEncounterStateTipKeys,
  getFirstEncounterTip,
  getSeenFirstEncounterTips,
  isUnidentifiedEncounterItem,
} from "../firstEncounterTips.js";

describe("first encounter tips", () => {
  it("本編で未読の解説だけ返す", () => {
    expect(getFirstEncounterTip("trap", "beginner", [])).toMatchObject({ key: "trap", title: "隠れた罠" });
    expect(getFirstEncounterTip("trap", "beginner", ["trap"])).toBeNull();
    expect(getFirstEncounterTip("trap", "tutorial", [])).toBeNull();
    expect(getFirstEncounterTip("trap", "debug", [])).toBeNull();
  });

  it("敵の骨の解説に骨を壊す手段を含める", () => {
    const tip = getFirstEncounterTip("enemy_bone_revival", "beginner", []);
    expect(tip.text[1]).toContain("投擲物");
    expect(tip.text[1]).toContain("炎の杖");
  });

  it("復活の種類ごとに別のTipsを返す", () => {
    expect(getFirstEncounterTip("enemy_bone_revival", "beginner", [])).toBeTruthy();
    expect(getFirstEncounterTip("mp_revival", "beginner", [])).toBeTruthy();
    expect(getFirstEncounterTip("revival_pentacle", "beginner", [])).toBeTruthy();
  });

  it("ボスTipsに撃破報酬の説明を含める", () => {
    const tip = getFirstEncounterTip("boss", "beginner", []);
    expect(tip.text[1]).toContain("豪華な専用報酬");
  });

  it("持ち物いっぱいTipsはFキーではなく道具欄の足元ページを案内する", () => {
    const tip = getFirstEncounterTip("inventory_full", "beginner", []);
    expect(tip.text[1]).toContain("道具欄（Xキー）の「足元」ページ");
    expect(tip.text[1]).not.toContain("Fキー");
  });

  it("祝福・呪いと杖の壁反射を解説する", () => {
    expect(getFirstEncounterTip("blessing_curse", "beginner", [])).toMatchObject({ title: "祝福と呪い" });
    expect(getFirstEncounterTip("wand_wall_reflect", "beginner", [])).toMatchObject({ title: "杖の魔法弾の反射" });
    expect(FIRST_ENCOUNTER_TIPS.wand_wall_reflect.text[0]).toContain("自分へ戻ってくる");
  });

  it("攻略上重要な状況を幅広く網羅する", () => {
    expect(Object.keys(FIRST_ENCOUNTER_TIPS).length).toBeGreaterThanOrEqual(40);
    expect(Object.keys(FIRST_ENCOUNTER_TIPS)).toEqual(expect.arrayContaining([
      "unidentified_item", "trap", "shop", "monster_house", "low_hp", "hunger",
      "poison", "confusion", "magic_seal", "deep_water", "boss", "item_mimic",
      "reflection", "fake_stair", "long_stay", "elemental_combat",
    ]));
    for (const tip of Object.values(FIRST_ENCOUNTER_TIPS)) {
      expect(tip.trigger).toBeTruthy();
      expect(tip.text).toHaveLength(2);
    }
  });

  it("未識別道具だけを判定する", () => {
    const potion = { type: "potion", effect: "heal" };
    expect(isUnidentifiedEncounterItem(potion, new Set())).toBe(true);
    expect(isUnidentifiedEncounterItem(potion, new Set(["p:heal"]))).toBe(false);
    expect(isUnidentifiedEncounterItem({ ...potion, fullIdent: true }, new Set())).toBe(false);
    expect(isUnidentifiedEncounterItem({ type: "weapon", name: "短剣" }, new Set())).toBe(false);
  });

  it("祝呪と杖反射のTipsは拾ったアイテムから判定する", () => {
    expect(getFirstEncounterPickupTipKeys({ type: "potion", effect: "heal", blessed: true }, new Set())).toEqual(["unidentified_item", "item_potion", "blessing_curse"]);
    expect(getFirstEncounterPickupTipKeys({ type: "wand", effect: "sleep" }, new Set(["w:sleep"]))).toEqual(["item_wand", "wand_wall_reflect"]);
    expect(getFirstEncounterPickupTipKeys({ type: "food", cursed: true }, new Set())).toEqual(["item_food", "blessing_curse"]);
    expect(getFirstEncounterPickupTipKeys({ type: "potion", effect: "heal" }, new Set(["p:heal"]))).toEqual(["item_potion"]);
  });

  it("主要なアイテム種別ごとに初取得Tipsを返す", () => {
    const types = [
      "potion", "scroll", "weapon", "armor", "arrow", "wand", "pen", "marker",
      "ring", "spellbook", "pot", "food", "gem", "bottle", "gold",
    ];
    for (const type of types) {
      expect(getFirstEncounterPickupTipKeys({ type }, new Set(["p:known"]))).toContain(`item_${type}`);
      expect(FIRST_ENCOUNTER_TIPS[`item_${type}`]).toMatchObject({ text: expect.any(Array) });
    }
  });

  it("プレイヤー状態と周辺状況から該当する解説を列挙する", () => {
    const session = {
      allBcKnown: false,
      player: {
        hp: 5, maxHp: 30, hunger: 20, inventory: [{}, {}], maxInventory: 2,
        poisoned: true, confusedTurns: 3, soakedTurns: 8,
        weapon: { cursed: true, bcKnown: true }, armor: null, arrow: null, rings: [],
        x: 2, y: 3,
      },
      dungeon: {
        floorType: "corridorFloor",
        pentacles: [{ x: 2, y: 3 }],
        monsters: [{ isBoss: true, x: 4, y: 5 }],
        visible: Array.from({ length: 6 }, () => Array(6).fill(true)),
      },
    };
    expect(getFirstEncounterStateTipKeys(session, { isDeepWater: true })).toEqual(expect.arrayContaining([
      "low_hp", "hunger", "inventory_full", "cursed_equipment", "poison", "confusion",
      "soaked", "deep_water", "pentacle", "boss", "special_floor",
    ]));
  });

  it("新しいゲームメッセージから一過性の出来事を検出する", () => {
    const keys = getFirstEncounterMessageTipKeys([
      { text: "偽の階段が罠に化けた！（地雷）" },
      "アイテムモドキが正体を現した！",
      "跳ね返された矢があなたに命中！",
      "★ 隠し部屋を発見した！",
    ]);
    expect(keys).toEqual(["fake_stair", "hidden_room", "item_mimic", "reflection"]);
  });

  it("復活メッセージを骨・MP・魔方陣へ分けて検出する", () => {
    expect(getFirstEncounterMessageTipKeys(["スケルトンの骨が残った...5ターン後に復活するかもしれない。"])).toEqual(["enemy_bone_revival"]);
    expect(getFirstEncounterMessageTipKeys(["HPがゼロになった！残りMP5でHP5として復活！MPは1000ターン回復しない。"])).toEqual(["mp_revival"]);
    expect(getFirstEncounterMessageTipKeys(["復活の魔方陣の力でHP全回復！"])).toEqual(["revival_pentacle"]);
  });

  it("図鑑用に表示済みTipsだけを定義順で返す", () => {
    expect(getSeenFirstEncounterTips(["trap", "hunger", "unknown"])).toEqual([
      expect.objectContaining({ key: "trap", name: "隠れた罠" }),
      expect.objectContaining({ key: "hunger", name: "空腹" }),
    ]);
    expect(getSeenFirstEncounterTips([])).toEqual([]);
  });
});
