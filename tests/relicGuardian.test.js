import { describe, expect, it } from "vitest";
import { makeRelicGuardian, relicGuardianStage, relicGuardianStats } from "../relicGuardian.js";
import { monsterDrop } from "../items.js";
import { MW, MH, T } from "../utils.js";

describe("遺物の番人", () => {
  it("地上に近づくほど段階とステータスが上がる", () => {
    expect(relicGuardianStage(50, 50)).toBe(1);
    expect(relicGuardianStage(50, 1)).toBe(50);

    const deep = relicGuardianStats(50, 50);
    const surface = relicGuardianStats(50, 1);
    expect(surface.hp).toBeGreaterThan(deep.hp);
    expect(surface.atk).toBeGreaterThan(deep.atk);
    expect(surface.def).toBeGreaterThan(deep.def);
    expect(surface.speed).toBe(2);
  });

  it("ボスフラグを持たず、専用の番人として生成される", () => {
    const guardian = makeRelicGuardian({ id: "guardian-test", x: 4, y: 5, maxDepth: 20, currentDepth: 10 });
    expect(guardian.isBoss).toBe(false);
    expect(guardian.relicGuardian).toBe(true);
    expect(guardian.baseKind).toBe("pursuer");
    expect(guardian.guardianStage).toBe(11);
  });

  it("撃破時は金貨と通常枠のランダムアイテムだけを落とす", () => {
    const dg = {
      map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
      items: [], traps: [], springs: [], bigboxes: [], pentacles: [], statues: [],
    };
    const messages = [];
    monsterDrop({ name: "遺物の番人", relicGuardian: true, guardianStage: 3, x: 10, y: 10 }, dg, messages, null);

    const drops = dg.items;
    expect(drops).toHaveLength(2);
    expect(drops.filter(item => item.type === "gold")).toHaveLength(1);
    expect(drops.filter(item => item.type !== "gold")).toHaveLength(1);
    expect(drops.some(item => item.name === "ボスの財宝")).toBe(false);
    expect(messages.at(-1)).toContain("金貨とアイテム");
  });
});
