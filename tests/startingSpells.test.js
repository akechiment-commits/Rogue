import { describe, expect, it } from "vitest";
import {
  initialDungeonSpellLevels,
  initialDungeonSpells,
  STARTER_SPELL_ID,
} from "../startingSpells.js";

describe("ダンジョン入場時の初期魔法", () => {
  it("通常のダンジョンでは炎の魔法をLv1で習得する", () => {
    expect(initialDungeonSpells("beginner")).toEqual([STARTER_SPELL_ID]);
    expect(initialDungeonSpells("advanced")).toEqual([STARTER_SPELL_ID]);
    expect(initialDungeonSpells("legend")).toEqual([STARTER_SPELL_ID]);
    expect(initialDungeonSpellLevels()).toEqual({ [STARTER_SPELL_ID]: 1 });
  });

  it("デバッグダンジョンにも炎の魔法を追加する", () => {
    expect(initialDungeonSpells("debug")).toContain(STARTER_SPELL_ID);
    expect(initialDungeonSpells("debug")).toContain("debug_summon_mon");
  });
});
