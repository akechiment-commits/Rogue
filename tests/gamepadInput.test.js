import { describe, it, expect } from "vitest";
import {
  axisToDir,
  edgeDown,
  edgeUp,
  buttonPressed,
  hasNearbyMonster,
  QUICK_MENU_ITEMS,
} from "../gamepadInput.js";

describe("axisToDir", () => {
  it("returns null inside deadzone", () => {
    expect(axisToDir(0.1, 0.1)).toBeNull();
    expect(axisToDir(0, 0)).toBeNull();
  });
  it("maps cardinals", () => {
    expect(axisToDir(0, -0.9)).toEqual({ dx: 0, dy: -1 });
    expect(axisToDir(0.9, 0)).toEqual({ dx: 1, dy: 0 });
  });
  it("maps diagonals", () => {
    expect(axisToDir(0.8, 0.8)).toEqual({ dx: 1, dy: 1 });
    expect(axisToDir(-0.8, -0.8)).toEqual({ dx: -1, dy: -1 });
  });
});

describe("edges", () => {
  it("detects down and up", () => {
    expect(edgeDown({ 0: false }, { 0: true }, 0)).toBe(true);
    expect(edgeDown({ 0: true }, { 0: true }, 0)).toBe(false);
    expect(edgeUp({ 0: true }, { 0: false }, 0)).toBe(true);
  });
});

describe("buttonPressed", () => {
  it("reads pressed / value", () => {
    const gp = {
      buttons: [
        { pressed: true, value: 1 },
        { pressed: false, value: 0.2 },
        { pressed: false, value: 0.8 },
      ],
    };
    expect(buttonPressed(gp, 0)).toBe(true);
    expect(buttonPressed(gp, 1)).toBe(false);
    expect(buttonPressed(gp, 2)).toBe(true);
  });
});

describe("hasNearbyMonster", () => {
  it("3マス以内の敵を足踏み停止対象にする", () => {
    expect(hasNearbyMonster({ x: 5, y: 5 }, { monsters: [{ x: 8, y: 7 }] })).toBe(true);
    expect(hasNearbyMonster({ x: 5, y: 5 }, { monsters: [{ x: 9, y: 5 }] })).toBe(false);
  });
});

describe("QUICK_MENU_ITEMS", () => {
  it("includes required commands", () => {
    const ids = QUICK_MENU_ITEMS.map((x) => x.id);
    for (const id of ["item", "map", "history", "look", "log", "underfoot", "magic", "settings", "scores", "traps", "interrupt"]) {
      expect(ids).toContain(id);
    }
  });
});
