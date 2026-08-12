import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase, pickMonsterDef, pickTransformMonsterDef } from "../monsters.js";

describe("長居ペナルティ専用モンスター", () => {
  const mirage = MONS.find((m) => m.baseKind === "rockspirit");
  const mirageLv3 = mirage.levels[1];
  const penalty = MONS.find((m) => m.penaltyOnly);

  it("刻限の巨像はミラージュより強く、経験値が少ない等速・無特技敵", () => {
    expect(penalty).toBeDefined();
    expect(penalty.name).toBe("刻限の巨像");
    expect(penalty.speed).toBe(1);
    expect(penalty.subtype).toBeUndefined();
    expect(penalty.wallWalker).toBe(true);
    expect(penalty.float).toBe(true);
    expect(penalty.hp).toBeGreaterThan(mirageLv3.hp);
    expect(penalty.atk).toBeGreaterThan(mirageLv3.atk);
    expect(penalty.def).toBeGreaterThan(mirageLv3.def);
    expect(penalty.exp).toBeLessThan(mirageLv3.exp);

    const spawned = makeMonsterFromBase(penalty, 1, 4, 4, { aware: true });
    expect(spawned.speed).toBe(1);
    expect(spawned.baseSpeed).toBe(1);
    expect(spawned.penaltyOnly).toBe(true);

    const mirageSpawned = makeMonsterFromBase(mirage, 3, 4, 4, { aware: true });
    expect(mirageSpawned.name).toBe("ミラージュ");
    expect(mirageSpawned.speed).toBe(3);
  });

  it("通常生成と変化の対象には含まれない", () => {
    for (let floor = 1; floor <= 50; floor++) {
      expect(pickMonsterDef(floor - 1).base.penaltyOnly).not.toBe(true);
      expect(pickTransformMonsterDef(floor - 1).penaltyOnly).not.toBe(true);
    }
  });
});
