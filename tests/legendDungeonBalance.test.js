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
  it("最序盤は地雷と時限爆弾を出さず、落石は1階から出す", () => {
    expect(trapAllowedInDungeon(trap("explode"), "legend", 1)).toBe(false);
    expect(trapAllowedInDungeon(trap("time_bomb"), "legend", 5)).toBe(false);
    expect(trapAllowedInDungeon(trap("rockfall"), "legend", 1)).toBe(true);
    expect(trapPoolForDungeon("legend", 1).map((entry) => entry.effect)).not.toContain("explode");
    expect(trapAllowedInDungeon(trap("explode"), "legend", 6)).toBe(true);
    expect(trapAllowedInDungeon(trap("time_bomb"), "legend", 6)).toBe(true);
  });

  it("大箱は1〜8階でゴミ箱・ニトロ・呪いを出さず、9階から全種類", () => {
    expect(bbAllowedInDungeon(box("synthesis"), "legend", 1)).toBe(true);
    expect(bbAllowedInDungeon(box("monster"), "legend", 1)).toBe(true);
    expect(bbAllowedInDungeon(box("trash"), "legend", 8)).toBe(false);
    expect(bbAllowedInDungeon(box("nitro"), "legend", 8)).toBe(false);
    expect(bbAllowedInDungeon(box("curse"), "legend", 8)).toBe(false);
    expect(bbAllowedInDungeon(box("nitro"), "legend", 9)).toBe(true);
    expect(bbPoolForDungeon("legend", 9).map((entry) => entry.kind)).toEqual(BB_TYPES.map((entry) => entry.kind));
  });

  it("道具は超上級の階に関係なく全種類を許可する", () => {
    expect(lootAllowedInDungeon(ITEMS.find((item) => item.effect === "doping"), "legend", 1)).toBe(true);
    expect(lootAllowedInDungeon(ITEMS.find((item) => item.type === "gold_nugget"), "legend", 1)).toBe(true);
    expect(lootAllowedInDungeon(WANDS.find((wand) => wand.effect === "wish"), "legend", 1)).toBe(true);
    expect(lootAllowedInDungeon(SPELLBOOKS.find((book) => book.spell === "time_stop_magic"), "legend", 50)).toBe(true);
  });
});

describe("超上級ダンジョンの敵分布", () => {
  const skipped = [
    "rat", "bat", "centipede", "kobold", "goblin", "skeleton", "runner", "slime",
    "wokka", "archer", "imp", "zombie", "leprechaun", "tattoobird", "wizard",
    "itemblaster", "stealthrower", "itempusher", "bombslime", "crystalslime",
    "rockspirit", "gelcube", "walldigger", "knocker", "trapthrower", "shaman",
    "synthmonster", "barriermage", "windmage", "firedemon", "gargoyle", "starlight",
    "berserker", "lizardman", "dragonknight", "reflector", "tripper", "seaDevil",
    "icedragon",
  ];

  it("階ごとの候補は少なく、雑魚を全部は出さない", () => {
    expect(LEGEND_MONSTER_FLOOR_POOLS[1]).toEqual(["thief", "rustbug", "rakugakima"]);
    for (let floor = 1; floor <= 50; floor++) {
      expect(LEGEND_MONSTER_FLOOR_POOLS[floor].length).toBeGreaterThanOrEqual(3);
      expect(LEGEND_MONSTER_FLOOR_POOLS[floor].length).toBeLessThanOrEqual(6);
    }
    for (const kind of skipped) {
      for (let floor = 1; floor <= 50; floor++) {
        expect(legendMonsterAllowed(kind, floor)).toBe(false);
      }
    }
  });

  it("同じ種族のLv帯は最低6階空け、初登場はLv1", () => {
    const byKind = new Map();
    for (const band of LEGEND_MONSTER_BANDS) {
      for (const kind of band.kinds) {
        if (!byKind.has(kind)) byKind.set(kind, []);
        byKind.get(kind).push({ min: band.min, max: band.max, level: band.level });
      }
    }
    for (const [kind, bands] of byKind) {
      bands.sort((a, b) => a.min - b.min);
      expect(bands[0].level).toBe(1);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].min - bands[i - 1].max).toBeGreaterThanOrEqual(6);
        expect(bands[i].level).toBeGreaterThan(bands[i - 1].level);
      }
    }
  });

  it("ドラゴンとデーモンの初登場はLv1で、終盤だけLv3の種族を限る", () => {
    const dragon = MONS.find((monster) => monster.baseKind === "dragon");
    const daemon = MONS.find((monster) => monster.baseKind === "daemon");
    const vampire = MONS.find((monster) => monster.baseKind === "vampire");
    const golem = MONS.find((monster) => monster.baseKind === "golem");
    expect(legendMonsterSpawnLevel(dragon, 29)).toBe(1);
    expect(legendMonsterSpawnLevel(dragon, 40)).toBe(2);
    expect(legendMonsterSpawnLevel(dragon, 48)).toBe(3);
    expect(legendMonsterSpawnLevel(daemon, 41)).toBe(1);
    expect(legendMonsterAllowed("daemon", 48)).toBe(false);
    expect(legendMonsterSpawnLevel(vampire, 33)).toBe(1);
    expect(legendMonsterSpawnLevel(vampire, 45)).toBe(2);
    expect(legendMonsterSpawnLevel(golem, 37)).toBe(1);
    expect(legendMonsterSpawnLevel(golem, 45)).toBe(2);
    expect(legendMonsterAllowed("icedragon", 37)).toBe(false);
  });

  it("睡眠コンボと催眠、火竜と氷竜、水中の脅威は同じ階に重ねない", () => {
    for (let floor = 1; floor <= 50; floor++) {
      const kinds = LEGEND_MONSTER_FLOOR_POOLS[floor];
      const hasSleep = kinds.includes("dangerousPetal") || kinds.includes("dreamEater");
      expect(hasSleep && kinds.includes("hypnotist")).toBe(false);
      expect(kinds.includes("dragon") && kinds.includes("icedragon")).toBe(false);
      const water = ["waterFlower", "giantEel", "seaDevil"].filter((kind) => kinds.includes(kind));
      expect(water.length).toBeLessThanOrEqual(1);
      expect(kinds.includes("bombgoblin") && kinds.includes("bombslime")).toBe(false);
      expect(kinds.includes("thief") && kinds.includes("leprechaun")).toBe(false);
    }
  });

  it("出る種族は最低3階に候補になる", () => {
    const counts = new Map();
    for (const kinds of LEGEND_MONSTER_FLOOR_POOLS) {
      for (const kind of kinds) counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    expect(counts.size).toBeLessThanOrEqual(36);
    expect(counts.size).toBeGreaterThanOrEqual(24);
    for (const [kind, count] of counts) expect(count).toBeGreaterThanOrEqual(3);
  });

  it("pickMonsterDefも階別プールと指定レベル以外を返さない", () => {
    for (let floor = 1; floor <= 50; floor++) {
      for (let i = 0; i < 20; i++) {
        const { base, spawnLevel } = pickMonsterDef(floor - 1, "legend");
        expect(legendMonsterAllowed(base.baseKind, floor)).toBe(true);
        expect(spawnLevel).toBe(legendMonsterSpawnLevel(base, floor));
      }
    }
  });
});
