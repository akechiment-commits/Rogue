import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDiscoveries,
  trackItem,
  trackMonster,
  trackTrap,
  stageBigbox,
  commitPendingBigboxes,
  restoreDiscoveries,
  getDiscoveries,
} from "../DiscoveryTracker.js";

describe("DiscoveryTracker", () => {
  beforeEach(() => resetDiscoveries());

  it("同じアイテムを再発見すると count が増える", () => {
    const item = { name: "回復薬", type: "potion", effect: "heal", tile: 16 };
    trackItem(item);
    trackItem(item);
    expect(getDiscoveries().items["heal"].count).toBe(2);
  });

  it("食品は効果ではなくベース名ごとに記録する", () => {
    trackItem({ name: "癒しのりんご", type: "food", effect: "heal_food", _foodBase: "りんご", tile: 19 });
    trackItem({ name: "力のりんご", type: "food", effect: "power_food", _foodBase: "りんご", tile: 19 });
    trackItem({ name: "癒しのうな重", type: "food", effect: "heal_food", _foodBase: "うな重", tile: 66 });
    const foods = getDiscoveries().items;
    expect(foods["food_りんご"].count).toBe(2);
    expect(foods["food_うな重"].effect).toBe("heal_food");
  });

  it("モンスターと罠も count を加算する", () => {
    trackMonster({ name: "スライム", tile: 1 });
    trackMonster({ name: "スライム", tile: 1 });
    trackTrap({ name: "鈍足の罠", effect: "slow_trap", tile: 47 });
    trackTrap({ name: "鈍足の罠", effect: "slow_trap", tile: 47 });
    const d = getDiscoveries();
    expect(d.monsters["スライム"].count).toBe(2);
    expect(d.traps["slow_trap"].count).toBe(2);
  });

  it("大箱は帰還時に確定する", () => {
    stageBigbox({ kind: "identify", name: "識別の大箱" });
    expect(getDiscoveries().bigboxes.identify).toBeUndefined();
    commitPendingBigboxes();
    expect(getDiscoveries().bigboxes.identify.name).toBe("識別の大箱");
  });

  it("旧名のモンスター図鑑を現行名へ合算する", () => {
    restoreDiscoveries({
      monsters: {
        "盗投士": { name: "盗投士", tile: 153, count: 2 },
        "ひったくり": { name: "ひったくり", tile: 153, count: 3 },
        "ラプラス": { name: "ラプラス", tile: 160, count: 4 },
        "キラープラスター": { name: "キラープラスター", tile: 160, count: 5 },
      },
    });
    const monsters = getDiscoveries().monsters;
    expect(monsters["ひったくり"].count).toBe(5);
    expect(monsters["ナンチュウ"].count).toBe(4);
    expect(monsters["ラプラス"].count).toBe(5);
    expect(monsters["盗投士"]).toBeUndefined();
    expect(getDiscoveries().monsterNameMigrationVersion).toBe(2);
  });

  it("中間名のモチチモチも最終名へ移行する", () => {
    restoreDiscoveries({
      monsterNameMigrationVersion: 1,
      monsters: {
        "モチチモチ": { name: "モチチモチ", tile: 169, count: 2 },
      },
    });
    expect(getDiscoveries().monsters["モチチモチ？"].count).toBe(2);
  });
});
