import { describe, it, expect } from "vitest";
import { MONS, makeMonsterFromBase } from "../monsters.js";

describe("つらら小僧系（旧コボルド系）のテスト", () => {
  const base = MONS.find((m) => m.baseKind === "kobold");

  it("基本定義が正しく設定されている（beast、炎弱点、Lv1〜3名称）", () => {
    expect(base).toBeDefined();
    expect(base.name).toBe("つらら小僧");
    expect(base.kind).toBe("beast");
    expect(base.elemWeak).toBe("fire");
    expect(base.tile).toBe(7);

    expect(base.levels).toHaveLength(2);
    expect(base.levels[0].name).toBe("氷柱鬼");
    expect(base.levels[1].name).toBe("永久凍土鬼");
  });

  it("makeMonsterFromBase で各レベルが正しく生成される", () => {
    const lv1 = makeMonsterFromBase(base, 1, 0, 0);
    expect(lv1.name).toBe("つらら小僧");
    expect(lv1.kind).toBe("beast");
    expect(lv1.elemWeak).toBe("fire");
    expect(lv1.hp).toBe(16);
    expect(lv1.atk).toBe(8);
    expect(lv1.def).toBe(2);

    const lv2 = makeMonsterFromBase(base, 2, 0, 0);
    expect(lv2.name).toBe("氷柱鬼");
    expect(lv2.kind).toBe("beast");
    expect(lv2.elemWeak).toBe("fire");
    expect(lv2.hp).toBe(40);
    expect(lv2.atk).toBe(18);
    expect(lv2.def).toBe(8);

    const lv3 = makeMonsterFromBase(base, 3, 0, 0);
    expect(lv3.name).toBe("永久凍土鬼");
    expect(lv3.kind).toBe("beast");
    expect(lv3.elemWeak).toBe("fire");
    expect(lv3.hp).toBe(68);
    expect(lv3.atk).toBe(26);
    expect(lv3.def).toBe(13);
  });
});
