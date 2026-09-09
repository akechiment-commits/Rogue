import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDiscoveries,
  trackItem,
  trackMonster,
  trackTrap,
  trackBigbox,
  stageBigbox,
  commitPendingBigboxes,
  restoreDiscoveries,
  getDiscoveries,
} from "../DiscoveryTracker.js";
import { addStonesInv, killMonster, makeStone } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("DiscoveryTracker", () => {
  beforeEach(() => resetDiscoveries());

  it("同じアイテム個体は再発見しても一度だけ数える", () => {
    const item = { id: "item-1", name: "回復薬", type: "potion", effect: "heal", tile: 16 };
    trackItem(item);
    trackItem(item);
    trackItem({ id: "item-2", name: "回復薬", type: "potion", effect: "heal", tile: 16 });
    expect(getDiscoveries().items["heal"].count).toBe(2);
  });

  it("矢・石の拾得失敗では所持数も図鑑回数も変えず、成功時は統合先へ印を引き継ぐ", () => {
    const fullInventory = [makeStone(90), ...Array.from({ length: 29 }, (_, i) => ({ type: "misc", id: `misc-${i}` }))];
    const rejected = makeStone(15);
    expect(addStonesInv(fullInventory, rejected.count, false, 30, rejected)).toBe(false);
    expect(fullInventory[0].count).toBe(90);
    expect(rejected._encyclopediaTracked).toBeUndefined();
    expect(getDiscoveries().items).toEqual({});

    const inventory = [makeStone(90)];
    const picked = makeStone(15);
    expect(addStonesInv(inventory, picked.count, false, 30, picked)).toBe(true);
    expect(inventory[0].count).toBe(99);
    expect(inventory[1].count).toBe(6);
    expect(picked._encyclopediaTracked).toBe(true);
    expect(inventory[0]._encyclopediaTracked).toBe(true);
    expect(getDiscoveries().items["arrow_石"].count).toBe(1);
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
    const monster = { id: "monster-1", name: "スライム", tile: 1 };
    const trap = { id: "trap-1", name: "鈍足の罠", effect: "slow_trap", tile: 47 };
    trackMonster(monster);
    trackMonster(monster);
    trackMonster({ id: "monster-2", name: "スライム", tile: 1 });
    trackTrap(trap);
    trackTrap(trap);
    trackTrap({ id: "trap-2", name: "鈍足の罠", effect: "slow_trap", tile: 47 });
    const d = getDiscoveries();
    expect(d.monsters["スライム"].count).toBe(2);
    expect(d.traps["slow_trap"].count).toBe(2);
  });

  it("復活しなかった敵の撃破だけを共通撃破処理で数える", () => {
    const monster = {
      id: "monster-1", name: "スライム", tile: 1, baseKind: "slime",
      hp: 0, maxHp: 10, exp: 0, x: 5, y: 5,
    };
    const dg = makeEmptyDg({
      monsters: [monster],
      pentacles: [{ kind: "revival", x: 5, y: 5, cursed: false }],
    });
    const player = makePlayer({ x: 10, y: 10 });
    killMonster(monster, dg, player, [], null, true);
    expect(getDiscoveries().monsters["スライム"]).toBeUndefined();

    dg.pentacles = [];
    monster.hp = 0;
    killMonster(monster, dg, player, [], null, true);
    expect(getDiscoveries().monsters["スライム"].count).toBe(1);
  });

  it("大箱も同じ個体は一度だけ、別個体は帰還時にそれぞれ確定する", () => {
    const first = { id: "bigbox-1", kind: "identify", name: "識別の大箱" };
    const second = { id: "bigbox-2", kind: "identify", name: "識別の大箱" };
    stageBigbox(first);
    stageBigbox(first);
    stageBigbox(second);
    expect(getDiscoveries().bigboxes.identify).toBeUndefined();
    commitPendingBigboxes();
    expect(getDiscoveries().bigboxes.identify).toMatchObject({ name: "識別の大箱", count: 2 });
  });

  it("直接発見した大箱も同じ個体は一度だけ数える", () => {
    const bigbox = { id: "bigbox-1", kind: "identify", name: "識別の大箱" };
    trackBigbox(bigbox);
    trackBigbox(bigbox);
    expect(getDiscoveries().bigboxes.identify.count).toBe(1);
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
