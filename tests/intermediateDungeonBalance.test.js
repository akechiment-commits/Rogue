import { describe, expect, it } from "vitest";
import {
  trapAllowedInDungeon,
  bbAllowedInDungeon,
  lootAllowedInDungeon,
  trapPoolForDungeon,
  bbPoolForDungeon,
} from "../dungeonContent.js";
import { TRAPS, BB_TYPES, ITEMS, SPELLBOOKS, WANDS, MAGIC_MARKER } from "../items.js";
import { MONS, pickMonsterDef } from "../monsters.js";

const INTERMEDIATE_TRAP_BAN = ["level_down_trap", "trap_trap"];
const INTERMEDIATE_TRAP_LATE = [
  "explode", "time_bomb", "unident_trap", "multiply_trap", "item_monster_trap",
];
const INTERMEDIATE_BB_BAN = ["trash", "nitro"];
const INTERMEDIATE_MONSTER_BAN = [
  "berserker", "killplaster", "icedragon", "starlight", "darkness",
  "dodgemole", "synthmonster", "gargoyle", "vampire", "dragon", "golem", "daemon",
];
const INTERMEDIATE_MONSTER_EXTRA = [
  "thief", "rustbug", "itemMimic", "charger", "itemblaster", "stealthrower", "wolf",
];

function intermediateMonsterKinds(floor) {
  return MONS.filter((m) => {
    if (m.penaltyOnly) return false;
    if (m.dungeons && !m.dungeons.includes("intermediate")) return false;
    const df = m.dungeonFloors?.intermediate;
    if (df === null) return false;
    const minF = df?.min ?? m.minFloor;
    const maxF = df?.max ?? m.maxFloor;
    return minF <= floor && floor <= maxF;
  }).map((m) => m.baseKind);
}

describe("中級ダンジョンの出現制限", () => {
  it("罠は1〜10階が初級後半相当、11階から地雷など。階層下げと罠の罠は出さない", () => {
    for (const effect of INTERMEDIATE_TRAP_BAN) {
      const trap = TRAPS.find((t) => t.effect === effect);
      expect(trapAllowedInDungeon(trap, "intermediate", 1)).toBe(false);
      expect(trapAllowedInDungeon(trap, "intermediate", 20)).toBe(false);
    }
    for (const effect of INTERMEDIATE_TRAP_LATE) {
      const trap = TRAPS.find((t) => t.effect === effect);
      expect(trapAllowedInDungeon(trap, "intermediate", 10)).toBe(false);
      expect(trapAllowedInDungeon(trap, "intermediate", 11)).toBe(true);
    }
    expect(trapAllowedInDungeon(TRAPS.find((t) => t.effect === "rust"), "intermediate", 1)).toBe(true);
    expect(trapAllowedInDungeon(TRAPS.find((t) => t.effect === "summon_trap"), "intermediate", 1)).toBe(true);
    const early = trapPoolForDungeon("intermediate", 5).map((t) => t.effect);
    expect(early).not.toContain("explode");
    expect(early).toContain("rust");
    const late = trapPoolForDungeon("intermediate", 11).map((t) => t.effect);
    expect(late).toContain("explode");
    expect(late).not.toContain("level_down_trap");
  });

  it("大箱はゴミ箱とニトロ以外を1階から出す", () => {
    for (const kind of INTERMEDIATE_BB_BAN) {
      const box = BB_TYPES.find((b) => b.kind === kind);
      expect(bbAllowedInDungeon(box, "intermediate", 1)).toBe(false);
      expect(bbAllowedInDungeon(box, "intermediate", 20)).toBe(false);
    }
    const floor1 = bbPoolForDungeon("intermediate", 1).map((b) => b.kind);
    expect(floor1).toEqual(expect.arrayContaining(["synthesis", "identify", "greed", "monster", "curse"]));
    expect(floor1).not.toContain("trash");
    expect(floor1).not.toContain("nitro");
  });

  it("道具は初級より広く、浅い階でもB/Aは出る。Sと願い・ドーピングなどは出さない", () => {
    const identify = ITEMS.find((i) => i.effect === "identify");
    const fireBook = SPELLBOOKS.find((s) => s.spell === "fire_bolt");
    const thunderPen = ITEMS.find((i) => i.effect === "thunder_trap" && i.type === "pen");
    const plate = ITEMS.find((i) => i.name === "プレートメイル");
    const asa = ITEMS.find((i) => i.name === "アサメ");
    const bombArrow = ITEMS.find((i) => i.name === "爆弾矢");
    const doping = ITEMS.find((i) => i.effect === "doping");
    const wish = WANDS.find((w) => w.effect === "wish");
    const timeStop = SPELLBOOKS.find((s) => s.spell === "time_stop_magic");
    expect(lootAllowedInDungeon(identify, "intermediate", 1)).toBe(true);
    expect(lootAllowedInDungeon(fireBook, "intermediate", 1)).toBe(true);
    expect(lootAllowedInDungeon(thunderPen, "intermediate", 1)).toBe(true);
    expect(lootAllowedInDungeon(MAGIC_MARKER, "intermediate", 1)).toBe(true);
    expect(lootAllowedInDungeon(plate, "intermediate", 1)).toBe(true);
    expect(lootAllowedInDungeon(bombArrow, "intermediate", 1)).toBe(true);
    expect(lootAllowedInDungeon(asa, "intermediate", 1)).toBe(true);
    expect(lootAllowedInDungeon(doping, "intermediate", 1)).toBe(false);
    expect(lootAllowedInDungeon(doping, "intermediate", 20)).toBe(false);
    expect(lootAllowedInDungeon(wish, "intermediate", 20)).toBe(false);
    expect(lootAllowedInDungeon(timeStop, "intermediate", 20)).toBe(false);
  });
});

describe("中級ダンジョンの敵", () => {
  it("初級で出さない能力敵を出し、上級専用種は出さない", () => {
    const f12 = intermediateMonsterKinds(12);
    const f20 = intermediateMonsterKinds(20);
    for (const kind of INTERMEDIATE_MONSTER_EXTRA) {
      expect(f12).toContain(kind);
    }
    for (let floor = 1; floor <= 20; floor++) {
      const kinds = intermediateMonsterKinds(floor);
      for (const banned of INTERMEDIATE_MONSTER_BAN) {
        expect(kinds).not.toContain(banned);
      }
    }
    expect(f20).toContain("hypnotist");
    expect(f20).not.toContain("berserker");
  });

  it("pickMonsterDef も同じ出現表に従う", () => {
    for (let i = 0; i < 40; i++) {
      expect(INTERMEDIATE_MONSTER_BAN).not.toContain(pickMonsterDef(11, "intermediate").base.baseKind);
      expect(INTERMEDIATE_MONSTER_BAN).not.toContain(pickMonsterDef(19, "intermediate").base.baseKind);
    }
  });
});
