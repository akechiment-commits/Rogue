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
    /* 旧式は十数差しかなかった。割合込みで 100 前後は差が欲しい */
    expect(naked - mithril).toBeGreaterThan(100);
    expect(mithril).toBeGreaterThan(700); /* 無敵にしすぎない */
  });

  it("割合軽減は maxRed で頭打ち", () => {
    const d80 = calcAtkDefDmg(100, 80, { defWeight: 1, variance: false, softK: DEF_SOFT_K, maxRed: DEF_SOFT_MAX_RED });
    const d200 = calcAtkDefDmg(100, 200, { defWeight: 1, variance: false, softK: DEF_SOFT_K, maxRed: DEF_SOFT_MAX_RED });
    /* soft 上限は同じ40%だが、基本式側の def はまだ効くので d200 <= d80 */
    expect(d200).toBeLessThanOrEqual(d80);
    /* ただし 0 にはならない */
    expect(d200).toBeGreaterThanOrEqual(1);
  });

  it("最低1ダメージ", () => {
    expect(calcAtkDefDmg(1, 999, { variance: false })).toBeGreaterThanOrEqual(1);
  });
});
