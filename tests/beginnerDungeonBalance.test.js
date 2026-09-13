import { describe, expect, it } from "vitest";
import {
  trapAllowedInDungeon,
  bbAllowedInDungeon,
  lootAllowedInDungeon,
  trapPoolForDungeon,
  bbPoolForDungeon,
} from "../dungeonContent.js";
import { TRAPS, BB_TYPES, ITEMS, SPELLBOOKS } from "../items.js";
import { MONS, pickMonsterDef } from "../monsters.js";

const BEGINNER_TRAP_BAN = [
  "explode", "time_bomb", "unident_trap", "multiply_trap",
  "trap_trap", "item_monster_trap", "level_down_trap",
];
const BEGINNER_TRAP_EARLY = [
  "arrow_trap", "sleep", "hunger_trap", "confuse_trap",
  "shadow_stitch", "poison_arrow", "trip_trap", "spin",
];
const BEGINNER_BB_BAN = ["identify", "trash", "curse", "reverse", "greed", "nitro", "monster"];
const BEGINNER_BB_ALLOW = ["synthesis", "change", "enhance", "satiety", "refill", "scatter", "split", "bless"];
const BEGINNER_MONSTER_BAN = [
  "thief", "rustbug", "itemMimic", "charger", "itemblaster",
  "stealthrower", "wolf", "wateri", "tattoobird",
];

function beginnerMonsterNames(floor) {
  return MONS.filter((m) => {
    if (m.penaltyOnly) return false;
    if (m.dungeons && !m.dungeons.includes("beginner")) return false;
    const df = m.dungeonFloors?.beginner;
    if (df === null) return false;
    const minF = df?.min ?? m.minFloor;
    const maxF = df?.max ?? m.maxFloor;
    return minF <= floor && floor <= maxF;
  }).map((m) => m.name);
}

describe("初心者ダンジョンの出現制限", () => {
  it("罠は1〜5階が基本、6階からちょっと危険、即死級は出さない", () => {
    for (const effect of BEGINNER_TRAP_BAN) {
      const trap = TRAPS.find((t) => t.effect === effect);
      expect(trapAllowedInDungeon(trap, "beginner", 1)).toBe(false);
      expect(trapAllowedInDungeon(trap, "beginner", 10)).toBe(false);
    }
    for (const trap of TRAPS) {
      if (BEGINNER_TRAP_BAN.includes(trap.effect)) continue;
      if (BEGINNER_TRAP_EARLY.includes(trap.effect)) {
        expect(trapAllowedInDungeon(trap, "beginner", 5)).toBe(true);
      } else {
        expect(trapAllowedInDungeon(trap, "beginner", 5)).toBe(false);
        expect(trapAllowedInDungeon(trap, "beginner", 6)).toBe(true);
      }
    }
    const early = trapPoolForDungeon("beginner", 3).map((t) => t.effect).sort();
    expect(early).toEqual([...BEGINNER_TRAP_EARLY].sort());
    const late = trapPoolForDungeon("beginner", 6).map((t) => t.effect);
    expect(late).toContain("rust");
    expect(late).toContain("summon_trap");
    expect(late).not.toContain("explode");
  });

  it("大箱は階で分けず、合成は1階から。ゴミ箱・ニトロなどマイナスは出さない", () => {
    for (const kind of BEGINNER_BB_BAN) {
      const box = BB_TYPES.find((b) => b.kind === kind);
      expect(bbAllowedInDungeon(box, "beginner", 1)).toBe(false);
      expect(bbAllowedInDungeon(box, "beginner", 10)).toBe(false);
    }
    const floor1 = bbPoolForDungeon("beginner", 1).map((b) => b.kind).sort();
    const floor6 = bbPoolForDungeon("beginner", 6).map((b) => b.kind).sort();
    expect(floor1).toEqual([...BEGINNER_BB_ALLOW].sort());
    expect(floor6).toEqual(floor1);
    expect(floor1).toContain("synthesis");
    expect(floor1).not.toContain("trash");
    expect(floor1).not.toContain("nitro");
  });

  it("アイテムは基本道具だけ。複雑な系統は出さず、1〜5階はE/D、6階からC/B", () => {
    const identify = ITEMS.find((i) => i.effect === "identify");
    const heal = ITEMS.find((i) => i.name === "回復薬");
    const bigHeal = ITEMS.find((i) => i.name === "大回復薬");
    const superHeal = ITEMS.find((i) => i.name === "超回復薬");
    const doping = ITEMS.find((i) => i.effect === "doping");
    const dagger = ITEMS.find((i) => i.name === "短剣");
    const fireSword = ITEMS.find((i) => i.name === "炎の剣");
    const plate = ITEMS.find((i) => i.name === "プレートメイル");
    const bombArrow = ITEMS.find((i) => i.name === "爆弾矢");
    const sanctuary = ITEMS.find((i) => i.effect === "sanctuary");
    expect(lootAllowedInDungeon(identify, "beginner", 10)).toBe(false);
    expect(lootAllowedInDungeon(heal, "beginner", 1)).toBe(true);
    expect(lootAllowedInDungeon(bigHeal, "beginner", 5)).toBe(false);
    expect(lootAllowedInDungeon(bigHeal, "beginner", 6)).toBe(true);
    expect(lootAllowedInDungeon(superHeal, "beginner", 10)).toBe(false);
    expect(lootAllowedInDungeon(doping, "beginner", 10)).toBe(false);
    expect(lootAllowedInDungeon(dagger, "beginner", 1)).toBe(true);
    expect(lootAllowedInDungeon(fireSword, "beginner", 10)).toBe(false);
    expect(lootAllowedInDungeon(plate, "beginner", 5)).toBe(false);
    expect(lootAllowedInDungeon(plate, "beginner", 6)).toBe(true);
    expect(lootAllowedInDungeon(bombArrow, "beginner", 10)).toBe(false);
    expect(lootAllowedInDungeon(sanctuary, "beginner", 10)).toBe(false);
    const idBook = SPELLBOOKS.find((s) => s.spell === "identify_magic");
    if (idBook) expect(lootAllowedInDungeon(idBook, "beginner", 10)).toBe(false);
    const fireBook = SPELLBOOKS.find((s) => s.spell === "fire_bolt");
    if (fireBook) expect(lootAllowedInDungeon(fireBook, "beginner", 10)).toBe(false);
  });

  it("他ダンジョンは制限しない", () => {
    expect(trapAllowedInDungeon(TRAPS.find((t) => t.effect === "explode"), "intermediate", 1)).toBe(true);
    expect(bbAllowedInDungeon(BB_TYPES.find((b) => b.kind === "nitro"), "advanced", 1)).toBe(true);
    expect(lootAllowedInDungeon(ITEMS.find((i) => i.effect === "doping"), "legend", 1)).toBe(true);
  });
});

describe("初心者ダンジョンの敵", () => {
  it("能力持ちを浅い階に出し、除外種は出さない", () => {
    const f5 = beginnerMonsterNames(5);
    const f6 = beginnerMonsterNames(6);
    const f7 = beginnerMonsterNames(7);
    const f10 = beginnerMonsterNames(10);
    expect(f5).toContain("足払い鬼");
    expect(f6).toEqual(expect.arrayContaining(["薬師", "ラクガキ魔", "足払い鬼"]));
    expect(f7).toEqual(expect.arrayContaining(["からめ鬼", "ゾンビ"]));
    expect(f10).toEqual(expect.arrayContaining(["からめ鬼", "ゾンビ", "ガーディアン"]));
    for (let floor = 1; floor <= 10; floor++) {
      const names = beginnerMonsterNames(floor);
      const kinds = MONS.filter((m) => names.includes(m.name)).map((m) => m.baseKind);
      for (const banned of BEGINNER_MONSTER_BAN) {
        expect(kinds).not.toContain(banned);
      }
    }
  });

  it("pickMonsterDef も同じ出現表に従う", () => {
    for (let i = 0; i < 30; i++) {
      expect(pickMonsterDef(0, "beginner").base.name).toMatch(/ネズミ|バット/);
      expect(BEGINNER_MONSTER_BAN).not.toContain(pickMonsterDef(4, "beginner").base.baseKind);
      expect(BEGINNER_MONSTER_BAN).not.toContain(pickMonsterDef(9, "beginner").base.baseKind);
    }
  });
});
