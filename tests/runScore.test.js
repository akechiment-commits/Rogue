import { describe, it, expect } from "vitest";
import { computeRunScore, formatElapsed, buildRunResultExtras } from "../runScore.js";

describe("computeRunScore", () => {
  it("所持金のみ", () => {
    const r = computeRunScore({ gold: 100, inventory: [], turns: 10, depth: 2, level: 3 });
    expect(r.gold).toBe(100);
    expect(r.itemsValue).toBe(0);
    expect(r.score).toBe(100);
    expect(r.turns).toBe(10);
  });

  it("アイテム価値を加算する", () => {
    const r = computeRunScore({
      gold: 50,
      inventory: [
        { name: "回復薬", type: "potion", effect: "heal", sellPrice: 100 },
        { name: "矢", type: "arrow", count: 3, sellPrice: 10 },
      ],
      turns: 0,
      depth: 1,
      level: 1,
    });
    expect(r.gold).toBe(50);
    expect(r.itemsValue).toBeGreaterThan(0);
    expect(r.score).toBe(r.gold + r.itemsValue);
  });
});

describe("formatElapsed", () => {
  it("分:秒", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(5_000)).toBe("0:05");
  });

  it("時:分:秒", () => {
    expect(formatElapsed(3_662_000)).toBe("1:01:02");
  });
});

describe("buildRunResultExtras", () => {
  it("タイマーから elapsedMs を取る", () => {
    const extras = buildRunResultExtras(
      { gold: 10, inventory: [], turns: 5, depth: 1, level: 1 },
      { getElapsedMs: () => 12345.6 },
    );
    expect(extras.score).toBe(10);
    expect(extras.elapsedMs).toBe(12345);
    expect(extras.turns).toBe(5);
  });
});
