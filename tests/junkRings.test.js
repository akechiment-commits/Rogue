import { describe, it, expect } from "vitest";
import { calcShopBuyPrice, shopPriceNote, hasRingEffect, RINGS } from "../items.js";
import { computeFOV, refreshFOV, corridorRange, MW, MH } from "../utils.js";

describe("junk rings helpers", () => {
  it("RINGS に鈍足・空腹・足音・観光客・自慢・暗闇・平和・体幹が含まれる", () => {
    const effects = new Set(RINGS.map(r => r.effect));
    for (const e of ["slow_ring", "hunger_ring", "footstep_ring", "markup_ring", "vanity_ring", "darkness_ring", "peace_ring", "core_ring"]) {
      expect(effects.has(e)).toBe(true);
    }
  });

  it("店用リングの表示名が効果に対応している", () => {
    expect(RINGS.find(r => r.effect === "bargain_ring").name).toBe("買い物上手の指輪");
    expect(RINGS.find(r => r.effect === "markup_ring").name).toBe("観光客の指輪");
  });

  it("calcShopBuyPrice: 買い物上手×0.7 / 観光客×1.5 / 両方", () => {
    expect(calcShopBuyPrice({ rings: [] }, 100)).toBe(100);
    expect(calcShopBuyPrice({ rings: [{ effect: "bargain_ring" }] }, 100)).toBe(70);
    expect(calcShopBuyPrice({ rings: [{ effect: "markup_ring" }] }, 100)).toBe(150);
    expect(calcShopBuyPrice({ rings: [{ effect: "markup_ring" }, { effect: "bargain_ring" }] }, 100)).toBe(105);
  });

  it("shopPriceNote", () => {
    expect(shopPriceNote({ rings: [] })).toBe("");
    expect(shopPriceNote({ rings: [{ effect: "bargain_ring" }] })).toContain("3割引");
    expect(shopPriceNote({ rings: [{ effect: "markup_ring" }] })).toContain("5割増");
  });

  it("hasRingEffect vanity is detectable but has no combat helpers", () => {
    expect(hasRingEffect({ rings: [{ effect: "vanity_ring" }] }, "vanity_ring")).toBe(true);
  });
});

describe("darkness_ring FOV", () => {
  function blankMaps() {
    const map = Array.from({ length: MH }, () => Array(MW).fill("."));
    const vis = Array.from({ length: MH }, () => Array(MW).fill(false));
    const exp = Array.from({ length: MH }, () => Array(MW).fill(false));
    return { map, vis, exp };
  }

  it("暗闇の指輪は廊下半径を1減らし部屋視界は維持", () => {
    const rooms = [{ x: 10, y: 10, w: 6, h: 5 }];
    const { map, vis, exp } = blankMaps();
    /* depth>=2 なら corridorRange=2、指輪で1。部屋は full */
    const p = { x: 12, y: 12, depth: 5, visionBonus: 0, darknessTurns: 0, rings: [{ effect: "darkness_ring" }] };
    const dg = { map, visible: vis, explored: exp, rooms, hiddenRooms: [], items: [] };
    refreshFOV(dg, p);
    /* 部屋内タイルは見える */
    expect(vis[12][12]).toBe(true);
    expect(vis[11][11]).toBe(true);
    /* 廊下（部屋外）は rad=1 なのでプレイヤー隣接程度 */
    /* 部屋の外で遠いマスは見えない */
    expect(vis[12][0]).toBe(false);
  });

  it("computeFOV roomVision=false なら部屋全体を出さない", () => {
    const rooms = [{ x: 10, y: 10, w: 6, h: 5 }];
    const { map, vis, exp } = blankMaps();
    computeFOV(map, 12, 12, 1, vis, exp, rooms, { roomVision: false });
    expect(vis[12][12]).toBe(true);
    /* 部屋の端（プレイヤーから遠い）はレイキャスト1では届かない場合あり */
    expect(vis[10][10]).toBe(false);
  });

  it("廊下の斜め2マス先も見えるが、3マス先までは広がらない", () => {
    const { map, vis, exp } = blankMaps();
    computeFOV(map, 12, 12, 2, vis, exp, [], { roomVision: false });
    expect(vis[14][14]).toBe(true);
    expect(vis[12][15]).toBe(false);

    const farther = blankMaps();
    computeFOV(farther.map, 12, 12, 6, farther.vis, farther.exp, [], { roomVision: false });
    expect(farther.vis[18][18]).toBe(true);
    expect(farther.vis[12][19]).toBe(false);
  });

  it("corridorRange baseline", () => {
    expect(corridorRange(1)).toBe(6);
    expect(corridorRange(2)).toBe(2);
  });
});
