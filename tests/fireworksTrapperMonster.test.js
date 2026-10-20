import { describe, it, expect } from "vitest";
import { MONS, makeMonsterFromBase } from "../monsters.js";

describe("仕掛け花火師系（旧罠師系）のテスト", () => {
  const base = MONS.find((m) => m.baseKind === "trapmaster");

  it("基本定義が正しく設定されている（humanoid、氷弱点、Lv1〜3名称、subtype）", () => {
    expect(base).toBeDefined();
    expect(base.name).toBe("仕掛け花火師");
    expect(base.kind).toBe("humanoid");
    expect(base.elemWeak).toBe("ice");
    expect(base.subtype).toBe("trapmaster");
    expect(base.tile).toBe(150);

    expect(base.levels).toHaveLength(2);
    expect(base.levels[0].name).toBe("爆導師");
    expect(base.levels[1].name).toBe("煙火覇王");
  });

  it("makeMonsterFromBase で各レベルが正しく生成される", () => {
    const lv1 = makeMonsterFromBase(base, 1, 0, 0);
    expect(lv1.name).toBe("仕掛け花火師");
    expect(lv1.kind).toBe("humanoid");
    expect(lv1.elemWeak).toBe("ice");
    expect(lv1.hp).toBe(34);
    expect(lv1.atk).toBe(18);
    expect(lv1.def).toBe(3);

    const lv2 = makeMonsterFromBase(base, 2, 0, 0);
    expect(lv2.name).toBe("爆導師");
    expect(lv2.kind).toBe("humanoid");
    expect(lv2.elemWeak).toBe("ice");
    expect(lv2.hp).toBe(54);
    expect(lv2.atk).toBe(25);
    expect(lv2.def).toBe(7);

    const lv3 = makeMonsterFromBase(base, 3, 0, 0);
    expect(lv3.name).toBe("煙火覇王");
    expect(lv3.kind).toBe("humanoid");
    expect(lv3.elemWeak).toBe("ice");
    expect(lv3.hp).toBe(85);
    expect(lv3.atk).toBe(32);
    expect(lv3.def).toBe(12);
  });
});
