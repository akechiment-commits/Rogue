import { describe, it, expect } from "vitest";
import { isRevivalSuppressedAt } from "../revivalRules.js";

function room(x, y, w, h) {
  return { x, y, w, h };
}

describe("isRevivalSuppressedAt", () => {
  it("呪われた復活が無いと false", () => {
    const dg = {
      rooms: [room(0, 0, 5, 5)],
      pentacles: [{ kind: "revival", cursed: false, x: 1, y: 1 }],
    };
    expect(isRevivalSuppressedAt(dg, 2, 2)).toBe(false);
  });

  it("同じ部屋なら true", () => {
    const dg = {
      rooms: [room(0, 0, 5, 5)],
      pentacles: [{ kind: "revival", cursed: true, x: 1, y: 1 }],
    };
    expect(isRevivalSuppressedAt(dg, 3, 3)).toBe(true);
  });

  it("別部屋なら false", () => {
    const dg = {
      rooms: [room(0, 0, 3, 3), room(10, 10, 3, 3)],
      pentacles: [{ kind: "revival", cursed: true, x: 1, y: 1 }],
    };
    expect(isRevivalSuppressedAt(dg, 11, 11)).toBe(false);
  });

  it("同マス（部屋外）でも true", () => {
    const dg = {
      rooms: [],
      pentacles: [{ kind: "revival", cursed: true, x: 4, y: 4 }],
    };
    expect(isRevivalSuppressedAt(dg, 4, 4)).toBe(true);
    expect(isRevivalSuppressedAt(dg, 5, 4)).toBe(false);
  });
});
