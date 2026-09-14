import { describe, expect, it } from "vitest";
import {
  bbAllowedInDungeon,
  bbPoolForDungeon,
  lootAllowedInDungeon,
  trapAllowedInDungeon,
  trapPoolForDungeon,
} from "../dungeonContent.js";
import { ADVANCED_MONSTER_FLOOR_POOLS, advancedMonsterAllowed } from "../advancedMonsterRules.js";
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
  it("階ごとの候補を3〜9種類程度に抑えて順番に入れ替える", () => {
    expect(ADVANCED_MONSTER_FLOOR_POOLS[1]).toEqual(["rat", "bat", "centipede"]);
    for (let floor = 1; floor <= 30; floor++) {
      expect(ADVANCED_MONSTER_FLOOR_POOLS[floor].length).toBeGreaterThanOrEqual(3);
      expect(ADVANCED_MONSTER_FLOOR_POOLS[floor].length).toBeLessThanOrEqual(9);
    }
    expect(ADVANCED_MONSTER_FLOOR_POOLS[30]).toEqual(expect.arrayContaining([
      "dragon", "icedragon", "gargoyle", "vampire", "golem", "daemon", "darkness",
    ]));
  });

  it("上級で通常出現する全72種は最低3階に候補になる", () => {
    const counts = new Map();
    for (const kinds of ADVANCED_MONSTER_FLOOR_POOLS) {
      for (const kind of kinds) counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    const advancedKinds = MONS
      .filter((monster) => !monster.penaltyOnly && !(monster.dungeons && !monster.dungeons.includes("advanced")))
      .map((monster) => monster.baseKind);
    expect(new Set(advancedKinds).size).toBe(72);
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
});
