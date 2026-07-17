import { describe, it, expect } from "vitest";
import { ITEMS, applyBubbleGoldScroll, tickBubbleGold } from "../items.js";

describe("あぶく銭の巻物", () => {
  it("アイテム定義がある", () => {
    const sc = ITEMS.find((i) => i.effect === "bubble_gold");
    expect(sc).toBeTruthy();
    expect(sc.name).toBe("あぶく銭の巻物");
    expect(sc.type).toBe("scroll");
  });

  it("通常は10000G増え、10ターン後に10000G減る", () => {
    const p = { gold: 500 };
    const ml = [];
    applyBubbleGoldScroll(p, ml, {});
    expect(p.gold).toBe(10500);
    expect(p.bubbleGoldQueue).toHaveLength(1);
    expect(p.bubbleGoldQueue[0].delta).toBe(-10000);
    expect(p.bubbleGoldQueue[0].turns).toBe(10);
    expect(ml.some((m) => m.includes("10000G"))).toBe(true);

    for (let i = 0; i < 9; i++) tickBubbleGold(p, []);
    expect(p.gold).toBe(10500);
    expect(p.bubbleGoldQueue).toHaveLength(1);
    expect(p.bubbleGoldQueue[0].turns).toBe(1);

    tickBubbleGold(p, ml);
    expect(p.gold).toBe(500);
    expect(p.bubbleGoldQueue).toHaveLength(0);
    expect(ml.some((m) => m.includes("失った"))).toBe(true);
  });

  it("祝福は20000G増え、10ターン後に20000G減る", () => {
    const p = { gold: 0 };
    applyBubbleGoldScroll(p, [], { blessed: true });
    expect(p.gold).toBe(20000);
    expect(p.bubbleGoldQueue[0].delta).toBe(-20000);
    for (let i = 0; i < 10; i++) tickBubbleGold(p, []);
    expect(p.gold).toBe(0);
  });

  it("呪いは即時10000G減り、10ターン後に10000G増える", () => {
    const p = { gold: 15000 };
    const ml = [];
    applyBubbleGoldScroll(p, ml, { cursed: true });
    expect(p.gold).toBe(5000);
    expect(p.bubbleGoldQueue).toHaveLength(1);
    expect(p.bubbleGoldQueue[0].delta).toBe(10000);
    expect(p.bubbleGoldQueue[0].turns).toBe(10);
    expect(ml.some((m) => m.includes("【呪】"))).toBe(true);

    for (let i = 0; i < 10; i++) tickBubbleGold(p, ml);
    expect(p.gold).toBe(15000);
    expect(p.bubbleGoldQueue).toHaveLength(0);
    expect(ml.some((m) => m.includes("戻ってきた") || m.includes("手に入れた"))).toBe(true);
  });

  it("呪いでも即時減少は0を下回らない", () => {
    const p = { gold: 3000 };
    applyBubbleGoldScroll(p, [], { cursed: true });
    expect(p.gold).toBe(0);
    for (let i = 0; i < 10; i++) tickBubbleGold(p, []);
    expect(p.gold).toBe(10000); // 後で増える分は満額
  });

  it("遅延減少時に0を下回らない", () => {
    const p = { gold: 0 };
    applyBubbleGoldScroll(p, [], {});
    p.gold = 3000; // 途中で使い切る
    for (let i = 0; i < 10; i++) tickBubbleGold(p, []);
    expect(p.gold).toBe(0);
  });

  it("複数回読むと個別にカウントされる", () => {
    const p = { gold: 0 };
    applyBubbleGoldScroll(p, [], {});
    tickBubbleGold(p, []); // 1ターン経過
    applyBubbleGoldScroll(p, [], {});
    expect(p.gold).toBe(20000);
    expect(p.bubbleGoldQueue).toHaveLength(2);
    expect(p.bubbleGoldQueue[0].turns).toBe(9);
    expect(p.bubbleGoldQueue[1].turns).toBe(10);
  });
});
