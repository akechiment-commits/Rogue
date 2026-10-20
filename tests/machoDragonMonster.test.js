import { describe, it, expect } from "vitest";
import { MONS, makeMonsterFromBase } from "../monsters.js";

describe("マッチョドラゴン系（マッチョドラゴン・筋肉竜・筋骨隆々竜）のテスト", () => {
  const base = MONS.find((m) => m.baseKind === "machodragon");

  it("基本定義が正しく設定されている（dragon、氷弱点、特技なし、Lv1〜3名称）", () => {
    expect(base).toBeDefined();
    expect(base.name).toBe("マッチョドラゴン");
    expect(base.kind).toBe("dragon");
    expect(base.elemWeak).toBe("ice");
    expect(base.subtype).toBeUndefined();
    expect(base.tile).toBe(241);

    expect(base.levels).toHaveLength(2);
    expect(base.levels[0].name).toBe("筋肉竜");
    expect(base.levels[0].tile).toBe(242);
    expect(base.levels[1].name).toBe("筋骨隆々竜");
    expect(base.levels[1].tile).toBe(243);
  });

  it("makeMonsterFromBase で各レベルが正しく生成される", () => {
    const lv1 = makeMonsterFromBase(base, 1, 0, 0);
    expect(lv1.name).toBe("マッチョドラゴン");
    expect(lv1.kind).toBe("dragon");
    expect(lv1.elemWeak).toBe("ice");
    expect(lv1.hp).toBe(80);
    expect(lv1.atk).toBe(34);
    expect(lv1.def).toBe(8);
    expect(lv1.tile).toBe(241);

    const lv2 = makeMonsterFromBase(base, 2, 0, 0);
    expect(lv2.name).toBe("筋肉竜");
    expect(lv2.kind).toBe("dragon");
    expect(lv2.elemWeak).toBe("ice");
    expect(lv2.hp).toBe(140);
    expect(lv2.atk).toBe(50);
    expect(lv2.def).toBe(14);
    expect(lv2.tile).toBe(242);

    const lv3 = makeMonsterFromBase(base, 3, 0, 0);
    expect(lv3.name).toBe("筋骨隆々竜");
    expect(lv3.kind).toBe("dragon");
    expect(lv3.elemWeak).toBe("ice");
    expect(lv3.hp).toBe(230);
    expect(lv3.atk).toBe(70);
    expect(lv3.def).toBe(20);
    expect(lv3.tile).toBe(243);
  });
});
