import { describe, expect, it } from "vitest";
import { getPlayerStairBlockMessage } from "../stairRules.js";

describe("階段使用制限", () => {
  it("からめ鬼に捕まっている間は階段を使えない", () => {
    expect(getPlayerStairBlockMessage({ capturedBy: "grabber-1" })).toContain("捕まっている");
  });

  it("影ぬい状態の間は階段を使えない", () => {
    expect(getPlayerStairBlockMessage({ immobileTurns: 3 })).toContain("縫い付けられている");
  });

  it("通常状態と状態解除後は階段を使える", () => {
    expect(getPlayerStairBlockMessage({})).toBeNull();
    expect(getPlayerStairBlockMessage({ capturedBy: null, immobileTurns: 0 })).toBeNull();
  });
});
