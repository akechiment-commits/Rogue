import { describe, expect, it } from "vitest";
import {
  FIRST_ENCOUNTER_TIPS,
  getFirstEncounterMessageTipKeys,
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

  it("図鑑用に表示済みTipsだけを定義順で返す", () => {
    expect(getSeenFirstEncounterTips(["trap", "hunger", "unknown"])).toEqual([
      expect.objectContaining({ key: "trap", name: "隠れた罠" }),
      expect.objectContaining({ key: "hunger", name: "空腹" }),
    ]);
    expect(getSeenFirstEncounterTips([])).toEqual([]);
  });
});
