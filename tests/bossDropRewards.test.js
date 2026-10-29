import { describe, expect, it } from "vitest";
import { BOSS_UNIQUE_DROP_RULES, BOSS_RANDOM_DROP_COUNT } from "../bossDropRules.js";
import { monsterDrop } from "../items.js";
import { BOSSES, INTERMEDIATE_BOSSES, SPECIAL_BOSSES } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const ALL_BOSSES = [...BOSSES, ...SPECIAL_BOSSES, ...INTERMEDIATE_BOSSES];

function dropFor(boss) {
  const dungeon = makeEmptyDg({ dungeonType: "legend" });
  const player = makePlayer({ depth: 5 });
  const monster = { ...boss, x: 10, y: 10, hp: boss.hp, maxHp: boss.hp };
  const messages = [];
  monsterDrop(monster, dungeon, messages, player);
  return { items: dungeon.items, messages };
}

function matchesUniqueDrop(item, rule) {
  return item.type === rule.type;
}

describe("ボス報酬", () => {
  it("定義済みの全ボスに固有ドロップがある", () => {
    const uniqueBosses = [...new Map(ALL_BOSSES.map(boss => [boss.baseKind, boss])).values()];
    expect(uniqueBosses.length).toBeGreaterThan(15);
    for (const boss of uniqueBosses) {
      expect(BOSS_UNIQUE_DROP_RULES[boss.baseKind], boss.baseKind).toBeDefined();
      const { items } = dropFor(boss);
      const rule = BOSS_UNIQUE_DROP_RULES[boss.baseKind];
      expect(items.some(item => matchesUniqueDrop(item, rule)), boss.baseKind).toBe(true);
      // 固有ドロップ単独の通知ログは仕様で表示しない（ガイド記載）ため、通知は検証しない
    }
  });

  it("グウェンは食料・収納上手・強化装備1つに加えて複数の抽選報酬を落とす", () => {
    const gwen = ALL_BOSSES.find(boss => boss.baseKind === "boss_gwen");
    const { items } = dropFor(gwen);
    const gold = items.find(item => item.type === "gold");
    const food = items.filter(item => item.type === "food");
    const expansion = items.filter(item => item.effect === "expand_inv");
    const upgradedEquipment = items.filter(item =>
      ["weapon", "armor"].includes(item.type) && Number(item.plus) > 0,
    );

    expect(gold?.name).toBe("ボスの財宝");
    expect(gold.value).toBeGreaterThanOrEqual(600);
    expect(gold.value).toBeLessThanOrEqual(700);
    expect(food).toHaveLength(1);
    expect(expansion).toHaveLength(1);
    expect(upgradedEquipment).toHaveLength(1);
    expect(upgradedEquipment[0].plus).toBe(upgradedEquipment[0].type === "weapon" ? 2 : 1);

    const randomBonuses = items.filter(item =>
      item !== gold && item.type !== "food" && item.effect !== "expand_inv" && item !== upgradedEquipment[0],
    );
    expect(randomBonuses.length).toBeGreaterThanOrEqual(BOSS_RANDOM_DROP_COUNT.min);
    expect(randomBonuses.length).toBeLessThanOrEqual(3);
  });

  it("高Tierでも強化装備は1つで、Tierに応じて強化値が上がる", () => {
    const mireu = ALL_BOSSES.find(boss => boss.baseKind === "boss_mireu");
    const { items } = dropFor(mireu);
    const upgradedEquipment = items.filter(item =>
      ["weapon", "armor"].includes(item.type) && Number(item.plus) > 0,
    );
    expect(upgradedEquipment).toHaveLength(1);
    expect(upgradedEquipment[0].plus).toBe(upgradedEquipment[0].type === "weapon" ? 7 : 6);
    expect(items.some(item => item.type === "weapon" && !Number(item.plus))).toBe(true);
  });
});
