import { describe, it, expect } from "vitest";
import { POTS, randPotCapacity } from "../items.js";
import { applyReverseStatus, installPlayerHpReverseHook } from "../utils.js";
import { makePlayer } from "./helpers.js";

describe("クラインの壺", () => {
  it("POTS に定義がある", () => {
    const k = POTS.find((p) => p.potEffect === "klein");
    expect(k).toBeTruthy();
    expect(k.name).toBe("クラインの壺");
    expect(k.type).toBe("pot");
  });

  it("テンプレからクラインの壺インスタンスを組める", () => {
    const t = POTS.find((p) => p.potEffect === "klein");
    const pot = { ...t, id: "k1", contents: [], capacity: randPotCapacity("klein") };
    expect(pot.potEffect).toBe("klein");
    expect(pot.contents).toEqual([]);
    expect(pot.capacity).toBeGreaterThanOrEqual(2);
    expect(pot.capacity).toBeLessThanOrEqual(4);
  });

  it("randPotCapacity(klein) は 2〜4", () => {
    for (let i = 0; i < 20; i++) {
      const c = randPotCapacity("klein");
      expect(c).toBeGreaterThanOrEqual(2);
      expect(c).toBeLessThanOrEqual(4);
    }
  });

  it("逆転状態でダメージが回復になる（maxHp クランプ）", () => {
    const p = makePlayer({ hp: 40, maxHp: 100 });
    applyReverseStatus(p, 20);
    expect(p.reverseTurns).toBe(20);
    p.hp -= 30; /* ダメージ意図 → 回復 */
    expect(p.hp).toBe(70);
    p.hp -= 100; /* 大ダメージ → 回復だが max 止め */
    expect(p.hp).toBe(100);
  });

  it("逆転状態で回復がダメージになる", () => {
    const p = makePlayer({ hp: 50, maxHp: 100 });
    applyReverseStatus(p, 20);
    p.hp = Math.min(p.maxHp, p.hp + 20); /* 回復意図 → ダメージ */
    expect(p.hp).toBe(30);
  });

  it("逆転が切れると通常の増減に戻る", () => {
    const p = makePlayer({ hp: 50, maxHp: 100 });
    applyReverseStatus(p, 1);
    p.reverseTurns = 0;
    p.hp -= 10;
    expect(p.hp).toBe(40);
    p.hp = Math.min(p.maxHp, p.hp + 15);
    expect(p.hp).toBe(55);
  });

  it("逆転ターンは加算される", () => {
    const p = makePlayer({ hp: 50, maxHp: 100 });
    applyReverseStatus(p, 20);
    applyReverseStatus(p, 20);
    expect(p.reverseTurns).toBe(40);
  });

  it("installPlayerHpReverseHook は二重でも安全", () => {
    const p = { hp: 10, maxHp: 20 };
    installPlayerHpReverseHook(p);
    installPlayerHpReverseHook(p);
    p.reverseTurns = 5;
    p.hp -= 5;
    expect(p.hp).toBe(15);
  });
});
