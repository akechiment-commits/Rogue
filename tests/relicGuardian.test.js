import { describe, expect, it } from "vitest";
import { makeRelicGuardian, relicGuardianStage, relicGuardianStats, restoreRelicGuardianBossTraits } from "../relicGuardian.js";
import { monsterDrop } from "../items.js";
import { MW, MH, T } from "../utils.js";

describe("遺物の番人", () => {
  it("出現回数に応じて段階とステータスが上がる", () => {
    expect(relicGuardianStage(1)).toBe(1);
    expect(relicGuardianStage(20)).toBe(20);
    expect(relicGuardianStage(999)).toBe(50);

    const first = relicGuardianStats(1);
    const twentieth = relicGuardianStats(20);
    expect(twentieth.hp).toBeGreaterThan(first.hp);
    expect(twentieth.atk).toBeGreaterThan(first.atk);
    expect(twentieth.def).toBeGreaterThan(first.def);
    expect(twentieth.speed).toBe(2);
  });

  it("ボス特性を持つ専用の番人として生成される", () => {
    const guardian = makeRelicGuardian({ id: "guardian-test", x: 4, y: 5, spawnCount: 11 });
    expect(guardian.isBoss).toBe(true);
    expect(guardian.relicGuardian).toBe(true);
    expect(guardian.baseKind).toBe("pursuer");
    expect(guardian.guardianStage).toBe(11);
    expect(guardian.guardianSpawnCount).toBe(11);
  });

  it("旧セーブの番人にもボス特性を復元する", () => {
    const dungeon = { monsters: [{ relicGuardian: true, isBoss: false }, { relicGuardian: false, isBoss: false }] };
    restoreRelicGuardianBossTraits(dungeon);
    expect(dungeon.monsters[0].isBoss).toBe(true);
    expect(dungeon.monsters[1].isBoss).toBe(false);
  });

  it("撃破時は金貨と通常枠のランダムアイテムだけを落とす", () => {
    const dg = {
      map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
      items: [], traps: [], springs: [], bigboxes: [], pentacles: [], statues: [],
    };
    const messages = [];
    monsterDrop({ name: "遺物の番人", relicGuardian: true, isBoss: true, guardianStage: 3, x: 10, y: 10 }, dg, messages, null);

    const drops = dg.items;
    expect(drops).toHaveLength(2);
    expect(drops.filter(item => item.type === "gold")).toHaveLength(1);
    expect(drops.filter(item => item.type !== "gold")).toHaveLength(1);
    expect(drops.some(item => item.name === "ボスの財宝")).toBe(false);
    expect(messages.at(-1)).toContain("金貨とアイテム");
  });
});
