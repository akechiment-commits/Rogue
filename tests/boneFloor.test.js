import { describe, it, expect } from "vitest";
import {
  isNonSteppableFloorTrap,
  floorTrapDesc,
  floorEntryActionCount,
} from "../floorInventory.js";

describe("bone floor inventory", () => {
  const bone = {
    name: "骨",
    effect: "bone",
    reviveIn: 3,
    monData: { name: "スケルトン" },
  };

  it("踏めない罠として扱う", () => {
    expect(isNonSteppableFloorTrap(bone)).toBe(true);
    expect(isNonSteppableFloorTrap({ effect: "sleep" })).toBe(false);
  });

  it("アクションは説明のみ", () => {
    expect(floorEntryActionCount(bone, [], [bone])).toBe(1);
  });

  it("説明に残りターンとモンスター名が入る", () => {
    const d = floorTrapDesc(bone);
    expect(d).toMatch(/スケルトン/);
    expect(d).toMatch(/あと3ターン/);
    expect(d).toMatch(/踏んでも何も起きない/);
  });
});
