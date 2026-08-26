import { describe, expect, it } from "vitest";
import { hasScrollTargetCandidate, isScrollTargetCandidate } from "../scrollTargetRules.js";

const scroll = { type: "scroll", effect: "forge_item" };
const sword = { type: "weapon", name: "短剣" };
const armor = { type: "armor", name: "革の鎧" };
const potion = { type: "potion", name: "回復薬", effect: "heal" };
const pot = { type: "pot", name: "保存の壺", potEffect: "save" };
const gold = { type: "gold", name: "100G" };

describe("scroll target rules", () => {
  it("未識別の錬成の巻物は装備品以外も候補にするが、巻物自身と金貨は除外する", () => {
    const mode = { mode: "forge_item", scrollIdx: 0, wasUnknown: true };
    expect(isScrollTargetCandidate(mode, scroll, 0)).toBe(false);
    expect(isScrollTargetCandidate(mode, potion, 1)).toBe(true);
    expect(isScrollTargetCandidate(mode, gold, 2)).toBe(false);
    expect(hasScrollTargetCandidate(mode, [scroll, potion])).toBe(true);
  });

  it("識別済みの錬成の巻物は武器・防具だけを候補にする", () => {
    const mode = { mode: "forge_item", scrollIdx: 0, wasUnknown: false };
    expect(isScrollTargetCandidate(mode, sword, 1)).toBe(true);
    expect(isScrollTargetCandidate(mode, armor, 2)).toBe(true);
    expect(isScrollTargetCandidate(mode, potion, 3)).toBe(false);
  });

  it("未識別の吸い出しの巻物も全アイテムを候補にする", () => {
    const mode = { mode: "pot_extract", scrollIdx: 0, wasUnknown: true };
    expect(isScrollTargetCandidate(mode, sword, 1)).toBe(true);
    expect(isScrollTargetCandidate(mode, pot, 2)).toBe(true);
  });

  it("祝呪不明の識別の巻物は呪いの可能性があっても全アイテムを候補にする", () => {
    const mode = { mode: "unidentify", scrollIdx: 0, wasUnknown: true };
    expect(isScrollTargetCandidate(mode, sword, 1)).toBe(true);
    expect(isScrollTargetCandidate(mode, armor, 2)).toBe(true);
    expect(isScrollTargetCandidate(mode, potion, 3)).toBe(true);
    expect(isScrollTargetCandidate(mode, gold, 4)).toBe(false);
  });

  it("識別済みの吸い出しの巻物は壺だけを候補にする", () => {
    const mode = { mode: "pot_extract", scrollIdx: 0, wasUnknown: false };
    expect(isScrollTargetCandidate(mode, pot, 1)).toBe(true);
    expect(isScrollTargetCandidate(mode, potion, 2)).toBe(false);
  });
});
