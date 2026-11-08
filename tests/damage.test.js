import { describe, it, expect } from "vitest";
import { calcAtkDefDmg, DEF_SOFT_K, DEF_SOFT_MAX_RED } from "../utils.js";

describe("calcAtkDefDmg", () => {
  const fixed = (n) => () => n; /* variance を固定する用ではない。variance:false を使う */

  it("防御0なら従来の atk に近い", () => {
    const d = calcAtkDefDmg(30, 0, { defWeight: 1.5, variance: false });
    expect(d).toBe(30); /* 900/(30+0)=30 */
  });

  it("同じ atk なら防御が高いほどダメージが下がる", () => {
    const naked = calcAtkDefDmg(30, 2, { defWeight: 1.5, variance: false });
    const armored = calcAtkDefDmg(30, 15, { defWeight: 1.5, variance: false });
    expect(armored).toBeLessThan(naked);
  });

  it("高 atk でもミスリル級の防御で明確に減る（2ヘッド相当）", () => {
    const naked = calcAtkDefDmg(999, 2, { defWeight: 1.5, variance: false });
    const mithril = calcAtkDefDmg(999, 15, { defWeight: 1.5, variance: false });
    /* トルネコ3式: 防御15で (35/36)^15 ≒ 0.66 倍まで減る */
    expect(naked - mithril).toBeGreaterThan(100);
    expect(mithril).toBeGreaterThan(600);
    expect(mithril).toBeLessThan(700);
  });

  it("高防御でも指数で減り続け、最低1は残る", () => {
    const d80 = calcAtkDefDmg(100, 80, { defWeight: 1, variance: false, softK: DEF_SOFT_K, maxRed: DEF_SOFT_MAX_RED });
    const d200 = calcAtkDefDmg(100, 200, { defWeight: 1, variance: false, softK: DEF_SOFT_K, maxRed: DEF_SOFT_MAX_RED });
    /* 指数軽減に上限はないので d200 <= d80 */
    expect(d200).toBeLessThanOrEqual(d80);
    /* ただし 0 にはならない */
    expect(d200).toBeGreaterThanOrEqual(1);
  });

  it("最低1ダメージ", () => {
    expect(calcAtkDefDmg(1, 999, { variance: false })).toBeGreaterThanOrEqual(1);
  });
});
