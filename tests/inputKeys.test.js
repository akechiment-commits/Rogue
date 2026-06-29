import { describe, it, expect } from "vitest";
import { isKeyUp, isKeyDown, isKeyLeft, isKeyRight } from "../inputKeys.js";

const ev = (key, code) => ({ key, code });

describe("inputKeys", () => {
  it("矢印キーとテンキーで上下左右を判定する", () => {
    expect(isKeyUp(ev("ArrowUp", "ArrowUp"))).toBe(true);
    expect(isKeyUp(ev("8", "Numpad8"))).toBe(true);
    expect(isKeyDown(ev("ArrowDown", "ArrowDown"))).toBe(true);
    expect(isKeyDown(ev("2", "Numpad2"))).toBe(true);
    expect(isKeyLeft(ev("ArrowLeft", "ArrowLeft"))).toBe(true);
    expect(isKeyLeft(ev("4", "Numpad4"))).toBe(true);
    expect(isKeyRight(ev("ArrowRight", "ArrowRight"))).toBe(true);
    expect(isKeyRight(ev("6", "Numpad6"))).toBe(true);
  });

  it("無関係なキーは false", () => {
    expect(isKeyUp(ev("a", "KeyA"))).toBe(false);
    expect(isKeyDown(ev("z", "KeyZ"))).toBe(false);
  });
});