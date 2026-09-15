import { describe, expect, it } from "vitest";
import {
  LEGEND_MONSTER_FLOOR_POOLS,
  legendMonsterAllowed,
  legendMonsterSpawnLevel,
} from "../legendMonsterRules.js";
import { MONS, pickMonsterDef } from "../monsters.js";

describe("超上級ダンジョンの敵分布", () => {
  it("階ごとの候補を絞り、再登場帯を設ける", () => {
    expect(LEGEND_MONSTER_FLOOR_POOLS[1]).toEqual(["rat", "bat", "centipede"]);
    for (let floor = 1; floor <= 50; floor++) {
      expect(LEGEND_MONSTER_FLOOR_POOLS[floor].length).toBeGreaterThanOrEqual(3);
      expect(LEGEND_MONSTER_FLOOR_POOLS[floor].length).toBeLessThanOrEqual(16);
    }
    expect(LEGEND_MONSTER_FLOOR_POOLS[50]).toEqual(expect.arrayContaining([
      "dragon", "icedragon", "gargoyle", "vampire", "golem", "daemon", "darkness",
    ]));
  });

  it("序盤の単純敵を中盤にLv2、後半にLv3で再登場させる", () => {
    for (const [kind, lv2Floor, lv3Floor] of [
      ["rat", 16, 32],
      ["bat", 16, 32],
      ["centipede", 16, 32],
      ["kobold", 20, 36],
      ["goblin", 20, 36],
      ["skeleton", 20, 36],
      ["imp", 24, 40],
      ["zombie", 24, 40],
      ["wolf", 24, 40],
    ]) {
      expect(legendMonsterAllowed(kind, lv2Floor)).toBe(true);
      expect(legendMonsterAllowed(kind, lv3Floor)).toBe(true);
      const base = MONS.find((monster) => monster.baseKind === kind);
      expect(legendMonsterSpawnLevel(base, 1)).toBe(1);
      expect(legendMonsterSpawnLevel(base, lv2Floor)).toBe(2);
      expect(legendMonsterSpawnLevel(base, lv3Floor)).toBe(3);
    }
  });

  it("能力敵は終盤にLv2とLv3で戻し、Lv3を解禁する", () => {
    for (const floor of [43, 44, 45, 46]) {
      expect(legendMonsterAllowed("hypnotist", floor)).toBe(true);
    }
    for (const floor of [45, 46, 47, 48]) {
      expect(legendMonsterAllowed("giantEel", floor)).toBe(true);
    }
    for (const floor of [46, 47, 48, 49]) {
      expect(legendMonsterAllowed("seaDevil", floor)).toBe(true);
    }
    for (const kind of ["dangerousPetal", "dreamEater", "hypnotist"]) {
      expect(legendMonsterAllowed(kind, 42)).toBe(true);
      expect(legendMonsterAllowed(kind, 50)).toBe(true);
    }

    const petal = MONS.find((monster) => monster.baseKind === "dangerousPetal");
    expect(legendMonsterSpawnLevel(petal, 29)).toBe(1);
    expect(legendMonsterSpawnLevel(petal, 38)).toBe(2);
    expect(legendMonsterSpawnLevel(petal, 45)).toBe(3);

    const dragon = MONS.find((monster) => monster.baseKind === "dragon");
    expect(legendMonsterSpawnLevel(dragon, 47)).toBe(3);
    expect(legendMonsterSpawnLevel(dragon, 50)).toBe(3);
  });

  it("超上級で通常出現する全72種は最低3階に候補になる", () => {
    const counts = new Map();
    for (const kinds of LEGEND_MONSTER_FLOOR_POOLS) {
      for (const kind of kinds) counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    const legendKinds = MONS
      .filter((monster) => !monster.penaltyOnly && !(monster.dungeons && !monster.dungeons.includes("legend")))
      .map((monster) => monster.baseKind);
    expect(new Set(legendKinds).size).toBe(72);
    for (const kind of legendKinds) expect(counts.get(kind)).toBeGreaterThanOrEqual(3);
  });

  it("pickMonsterDefも階別プール以外の敵を返さない", () => {
    for (let floor = 1; floor <= 50; floor++) {
      for (let i = 0; i < 20; i++) {
        const { base, spawnLevel } = pickMonsterDef(floor - 1, "legend");
        expect(legendMonsterAllowed(base.baseKind, floor)).toBe(true);
        expect(spawnLevel).toBe(legendMonsterSpawnLevel(base, floor));
      }
    }
  });
});
