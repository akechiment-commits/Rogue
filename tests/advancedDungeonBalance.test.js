import { describe, expect, it } from "vitest";
import {
  bbAllowedInDungeon,
  bbPoolForDungeon,
  lootAllowedInDungeon,
  trapAllowedInDungeon,
  trapPoolForDungeon,
} from "../dungeonContent.js";
import {
  ADVANCED_MONSTER_FLOOR_POOLS,
  advancedMonsterAllowed,
  advancedMonsterSpawnLevel,
  advancedMonsterAffinityMultiplier,
} from "../advancedMonsterRules.js";
import { BB_TYPES, TRAPS } from "../dungeonCatalog.js";
import { ITEMS, SPELLBOOKS } from "../items.js";
import { MONS, pickMonsterDef } from "../monsters.js";

const trap = (effect) => TRAPS.find((entry) => entry.effect === effect);
const box = (kind) => BB_TYPES.find((entry) => entry.kind === kind);

describe("上級ダンジョンの出現段階", () => {
  it("最序盤は大ダメージ罠を出さず、11階から全罠を解禁する", () => {
    for (const effect of ["explode", "time_bomb", "rockfall"]) {
      expect(trapAllowedInDungeon(trap(effect), "advanced", 1)).toBe(false);
      expect(trapAllowedInDungeon(trap(effect), "advanced", 5)).toBe(false);
      expect(trapPoolForDungeon("advanced", 1).map((entry) => entry.effect)).not.toContain(effect);
    }
    expect(trapAllowedInDungeon(trap("rockfall"), "advanced", 6)).toBe(true);
    expect(trapAllowedInDungeon(trap("explode"), "advanced", 10)).toBe(false);
    expect(trapAllowedInDungeon(trap("explode"), "advanced", 11)).toBe(true);
    expect(trapAllowedInDungeon(trap("time_bomb"), "advanced", 11)).toBe(true);
  });

  it("大箱は1〜5階・6〜14階・15階以降の3段階で増える", () => {
    expect(bbPoolForDungeon("advanced", 1).map((entry) => entry.kind)).toEqual([
      "synthesis", "satiety", "refill", "identify",
    ]);
    const middle = bbPoolForDungeon("advanced", 6).map((entry) => entry.kind);
    expect(middle).toEqual(expect.arrayContaining(["change", "enhance", "scatter", "split", "bless"]));
    expect(middle).not.toEqual(expect.arrayContaining(["trash", "nitro", "monster", "curse"]));
    expect(bbAllowedInDungeon(box("nitro"), "advanced", 14)).toBe(false);
    expect(bbAllowedInDungeon(box("nitro"), "advanced", 15)).toBe(true);
    expect(bbPoolForDungeon("advanced", 15).map((entry) => entry.kind)).toEqual(BB_TYPES.map((entry) => entry.kind));
  });

  it("道具は上級の階に関係なく全種類を許可する", () => {
    expect(lootAllowedInDungeon(ITEMS.find((item) => item.effect === "bigbox_summon"), "advanced", 1)).toBe(true);
    expect(lootAllowedInDungeon(SPELLBOOKS.find((book) => book.spell === "time_stop_magic"), "advanced", 30)).toBe(true);
  });
});

describe("上級ダンジョンの敵分布", () => {
  it("章立てブロックで階ごとの地上候補を絞り、水棲敵を複数混在させる", () => {
    expect(ADVANCED_MONSTER_FLOOR_POOLS[1]).toEqual(["rat", "bat", "centipede"]);
    const waterKinds = new Set(["badFish", "wateri", "waterFlower", "giantEel", "seaDevil"]);
    const giantKinds = new Set(["hauntedWillow", "sleepingLion"]);
    for (let floor = 1; floor <= 30; floor++) {
      const pool = ADVANCED_MONSTER_FLOOR_POOLS[floor];
      expect(pool.length).toBeGreaterThanOrEqual(3);
      const landCount = pool.filter(kind => !waterKinds.has(kind) && !giantKinds.has(kind)).length;
      expect(landCount).toBeLessThanOrEqual(13);
    }
    expect(ADVANCED_MONSTER_FLOOR_POOLS[30]).toEqual(expect.arrayContaining([
      "dragon", "icedragon", "gargoyle", "vampire", "golem", "daemon", "darkness",
    ]));
    const midWater = [...waterKinds].filter(kind => ADVANCED_MONSTER_FLOOR_POOLS[18].includes(kind));
    expect(midWater.length).toBeGreaterThanOrEqual(4);
  });

  it("再登場種・水棲種・後半種を階層のステータス帯に合うレベルで出現させる", () => {
    for (const [kind, floor, expectedLv, stats] of [
      ["rat", 10, 2, [28, 30, 1, 28]],
      ["bat", 10, 2, [34, 18, 8, 25]],
      ["centipede", 10, 2, [32, 18, 24, 35]],
      ["kobold", 13, 2, [38, 22, 12, 35]],
      ["goblin", 13, 2, [48, 26, 9, 45]],
      ["skeleton", 13, 2, [46, 38, 5, 60]],
      ["imp", 16, 2, [42, 22, 13, 55]],
      ["zombie", 16, 2, [98, 44, 1, 100]],
      ["wolf", 16, 2, [54, 36, 9, 75]],
      ["archer", 22, 3, [64, 74, 22, 170]],
      ["mushroom", 25, 3, [98, 42, 24, 175]],
    ]) {
      expect(advancedMonsterAllowed(kind, floor)).toBe(true);
      const base = MONS.find((monster) => monster.baseKind === kind);
      const lvDef = base.levels[expectedLv - 2];
      expect([lvDef.hp, lvDef.atk, lvDef.def, lvDef.exp]).toEqual(stats);
      expect(advancedMonsterSpawnLevel(base, floor)).toBe(expectedLv);
    }

    for (const [kind, floor, expectedLv] of [
      ["badFish", 2, 1],
      ["badFish", 8, 2],
      ["badFish", 14, 3],
      ["wateri", 6, 1],
      ["wateri", 14, 2],
      ["wateri", 25, 3],
      ["waterFlower", 8, 1],
      ["waterFlower", 16, 2],
      ["waterFlower", 25, 3],
      ["giantEel", 18, 1],
      ["giantEel", 26, 2],
      ["seaDevil", 18, 1],
      ["seaDevil", 26, 2],
      ["dangerousPetal", 25, 2],
      ["dreamEater", 25, 2],
      ["hypnotist", 25, 2],
    ]) {
      expect(advancedMonsterAllowed(kind, floor)).toBe(true);
      const base = MONS.find((monster) => monster.baseKind === kind);
      expect(advancedMonsterSpawnLevel(base, floor)).toBe(expectedLv);
    }

    const synthmonster = MONS.find(monster => monster.baseKind === "synthmonster");
    expect(advancedMonsterAllowed("synthmonster", 8)).toBe(true);
    expect(advancedMonsterSpawnLevel(synthmonster, 8)).toBe(1);
    expect(advancedMonsterAllowed("synthmonster", 18)).toBe(true);
    expect(advancedMonsterAllowed("synthmonster", 20)).toBe(true);
    expect(advancedMonsterSpawnLevel(synthmonster, 18)).toBe(2);
    expect(advancedMonsterAllowed("synthmonster", 21)).toBe(false);
    expect(advancedMonsterAllowed("synthmonster", 27)).toBe(true);
    expect(advancedMonsterSpawnLevel(synthmonster, 27)).toBe(3);
    const sleepingLion = MONS.find(monster => monster.baseKind === "sleepingLion");
    expect(advancedMonsterAllowed("sleepingLion", 21)).toBe(true);
    expect(advancedMonsterSpawnLevel(sleepingLion, 24)).toBe(1);
    expect(advancedMonsterSpawnLevel(sleepingLion, 28)).toBe(2);
    expect(advancedMonsterSpawnLevel(sleepingLion, 30)).toBe(2);
  });

  it("水棲5種・眠れる獅子を含む上級の全モンスターは最低3階に候補になる", () => {
    const counts = new Map();
    for (const kinds of ADVANCED_MONSTER_FLOOR_POOLS) {
      for (const kind of kinds) counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    const advancedKinds = MONS
      .filter((monster) => !monster.penaltyOnly && !(monster.dungeons && !monster.dungeons.includes("advanced")))
      .map((monster) => monster.baseKind);
    expect(new Set(advancedKinds).size).toBe(82);
    expect(advancedKinds).toContain("badFish");
    expect(advancedKinds).toContain("potionhealer");
    expect(advancedKinds).toContain("sylph");
    for (const kind of advancedKinds) expect(counts.get(kind)).toBeGreaterThanOrEqual(3);
  });

  it("pickMonsterDefも階別プール以外の敵を返さない", () => {
    for (let floor = 1; floor <= 30; floor++) {
      for (let i = 0; i < 40; i++) {
        const { base } = pickMonsterDef(floor - 1, "advanced");
        expect(advancedMonsterAllowed(base.baseKind, floor)).toBe(true);
      }
    }
  });

  it("搦め手の章立て：忍者は無法街へ、弓はシルフの相方として再登場する", () => {
    expect(advancedMonsterAllowed("stealthrower", 10)).toBe(true);
    expect(advancedMonsterAllowed("stealthrower", 13)).toBe(false);
    for (const floor of [13, 14, 15, 22, 23, 24]) {
      expect(advancedMonsterAllowed("archer", floor)).toBe(true);
    }
  });

  it("連携グループの片方が居ると相方が出やすくなる", () => {
    const rustbug = [{ baseKind: "rustbug", hp: 10 }];
    expect(advancedMonsterAffinityMultiplier("thief", 10, rustbug)).toBe(2);
    expect(advancedMonsterAffinityMultiplier("rustbug", 10, [{ baseKind: "thief", hp: 10 }])).toBe(2);
    expect(advancedMonsterAffinityMultiplier("thief", 10, [])).toBe(1);
    expect(advancedMonsterAffinityMultiplier("thief", 10, [{ baseKind: "rustbug", hp: 0 }])).toBe(1);
    expect(advancedMonsterAffinityMultiplier("archer", 22, [{ baseKind: "sylph", hp: 10 }])).toBe(2);
    expect(advancedMonsterAffinityMultiplier("potRaider", 25, [{ baseKind: "fireCook", hp: 10 }])).toBe(2);
    expect(advancedMonsterAffinityMultiplier("bombgoblin", 19, [{ baseKind: "trapmaster", hp: 10 }])).toBe(2);
    expect(advancedMonsterAffinityMultiplier("reflector", 19, [{ baseKind: "magicreflector", hp: 10 }])).toBe(2);
    expect(advancedMonsterAffinityMultiplier("puller", 22, [{ baseKind: "windmage", hp: 10 }])).toBe(2);
    expect(advancedMonsterAffinityMultiplier("dreamEater", 27, [{ baseKind: "hypnotist", hp: 10 }])).toBe(2);
    expect(advancedMonsterAffinityMultiplier("dragon", 28, rustbug)).toBe(1);
  });
});
