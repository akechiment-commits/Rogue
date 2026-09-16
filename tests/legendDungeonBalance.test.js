import { describe, expect, it } from "vitest";
import {
  bbAllowedInDungeon,
  bbPoolForDungeon,
  lootAllowedInDungeon,
  trapAllowedInDungeon,
  trapPoolForDungeon,
} from "../dungeonContent.js";
import {
  LEGEND_MONSTER_BANDS,
  LEGEND_MONSTER_FLOOR_POOLS,
  legendMonsterAllowed,
  legendMonsterSpawnLevel,
} from "../legendMonsterRules.js";
import { BB_TYPES, TRAPS } from "../dungeonCatalog.js";
import { ITEMS, SPELLBOOKS, WANDS } from "../items.js";
import { MONS, pickMonsterDef } from "../monsters.js";

const trap = (effect) => TRAPS.find((entry) => entry.effect === effect);
const box = (kind) => BB_TYPES.find((entry) => entry.kind === kind);

describe("超上級ダンジョンの出現段階", () => {
  it("1階は落石も地雷も出さない", () => {
    for (const effect of ["explode", "time_bomb", "rockfall"]) {
      expect(trapAllowedInDungeon(trap(effect), "legend", 1)).toBe(false);
      expect(trapAllowedInDungeon(trap(effect), "legend", 5)).toBe(false);
    }
    expect(trapAllowedInDungeon(trap("rockfall"), "legend", 6)).toBe(true);
    expect(trapAllowedInDungeon(trap("explode"), "legend", 11)).toBe(true);
  });

  it("大箱は1階から全種類を許可する", () => {
    expect(bbAllowedInDungeon(box("nitro"), "legend", 1)).toBe(true);
    expect(bbAllowedInDungeon(box("trash"), "legend", 1)).toBe(true);
    expect(bbAllowedInDungeon(box("curse"), "legend", 1)).toBe(true);
    expect(bbPoolForDungeon("legend", 1).map((entry) => entry.kind)).toEqual(BB_TYPES.map((entry) => entry.kind));
  });

  it("道具は超上級の階に関係なく全種類を許可する", () => {
    expect(lootAllowedInDungeon(ITEMS.find((item) => item.effect === "doping"), "legend", 1)).toBe(true);
    expect(lootAllowedInDungeon(WANDS.find((wand) => wand.effect === "wish"), "legend", 1)).toBe(true);
    expect(lootAllowedInDungeon(SPELLBOOKS.find((book) => book.spell === "time_stop_magic"), "legend", 50)).toBe(true);
  });
});

describe("超上級ダンジョンの敵分布", () => {
  it("1階はレベル1の雑魚からで、盗賊や錆は出さない", () => {
    expect(LEGEND_MONSTER_FLOOR_POOLS[1]).toEqual(["rat", "bat", "centipede"]);
    for (let floor = 1; floor <= 4; floor++) {
      for (const kind of LEGEND_MONSTER_FLOOR_POOLS[floor]) {
        const base = MONS.find((monster) => monster.baseKind === kind);
        expect(legendMonsterSpawnLevel(base, floor)).toBe(1);
      }
    }
    for (let floor = 1; floor <= 16; floor++) {
      expect(legendMonsterAllowed("thief", floor)).toBe(false);
      expect(legendMonsterAllowed("rustbug", floor)).toBe(false);
      expect(legendMonsterAllowed("dragon", floor)).toBe(false);
      expect(legendMonsterAllowed("daemon", floor)).toBe(false);
    }
  });

  it("各階の候補数を抑え、同じ種族のLv帯は空ける", () => {
    for (let floor = 1; floor <= 50; floor++) {
      expect(LEGEND_MONSTER_FLOOR_POOLS[floor].length).toBeGreaterThanOrEqual(floor <= 4 ? 3 : 6);
      expect(LEGEND_MONSTER_FLOOR_POOLS[floor].length).toBeLessThanOrEqual(12);
    }
    const byKind = new Map();
    for (const band of LEGEND_MONSTER_BANDS) {
      for (const kind of band.kinds) {
        if (!byKind.has(kind)) byKind.set(kind, []);
        byKind.get(kind).push({ min: band.min, max: band.max, level: band.level });
      }
    }
    for (const [, bands] of byKind) {
      bands.sort((a, b) => a.min - b.min);
      expect(bands[0].level).toBe(1);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].min - bands[i - 1].max).toBeGreaterThanOrEqual(4);
        expect(bands[i].level).toBeGreaterThan(bands[i - 1].level);
      }
    }
  });

  it("ドラゴンとデーモンの初登場はLv1", () => {
    const dragon = MONS.find((monster) => monster.baseKind === "dragon");
    const daemon = MONS.find((monster) => monster.baseKind === "daemon");
    expect(legendMonsterSpawnLevel(dragon, 28)).toBe(1);
    expect(legendMonsterSpawnLevel(dragon, 38)).toBe(2);
    expect(legendMonsterSpawnLevel(dragon, 48)).toBe(3);
    expect(legendMonsterSpawnLevel(daemon, 40)).toBe(1);
    expect(legendMonsterSpawnLevel(daemon, 48)).toBe(2);
  });

  it("睡眠コンボと催眠、火竜と氷竜、水中の脅威は同じ階に重ねない", () => {
    for (let floor = 1; floor <= 50; floor++) {
      const kinds = LEGEND_MONSTER_FLOOR_POOLS[floor];
      const hasSleep = kinds.includes("dangerousPetal") || kinds.includes("dreamEater");
      expect(hasSleep && kinds.includes("hypnotist")).toBe(false);
      expect(kinds.includes("dragon") && kinds.includes("icedragon")).toBe(false);
      const water = ["waterFlower", "giantEel", "seaDevil"].filter((kind) => kinds.includes(kind));
      expect(water.length).toBeLessThanOrEqual(1);
    }
  });

  it("出る種族は最低3階に候補になる", () => {
    const counts = new Map();
    for (const kinds of LEGEND_MONSTER_FLOOR_POOLS) {
      for (const kind of kinds) counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    for (const [, count] of counts) expect(count).toBeGreaterThanOrEqual(3);
  });

  it("pickMonsterDefも階別プールと指定レベル以外を返さない", () => {
    for (let floor = 1; floor <= 50; floor++) {
      for (let i = 0; i < 16; i++) {
        const { base, spawnLevel } = pickMonsterDef(floor - 1, "legend");
        expect(legendMonsterAllowed(base.baseKind, floor)).toBe(true);
        expect(spawnLevel).toBe(legendMonsterSpawnLevel(base, floor));
      }
    }
  });
});
