import { describe, it, expect } from "vitest";
import { MONS, makeMonsterFromBase, useManaEaterDrain } from "../monsters.js";

describe("マナイーター系（マナイーター・マナドレイナー・マナヴォイド）のテスト", () => {
  const base = MONS.find((m) => m.baseKind === "manaEater");

  it("基本定義が正しく設定されている（undead、炎弱点、subtype: manaEater、Lv1〜3名称・タイル）", () => {
    expect(base).toBeDefined();
    expect(base.name).toBe("マナイーター");
    expect(base.kind).toBe("undead");
    expect(base.elemWeak).toBe("fire");
    expect(base.subtype).toBe("manaEater");
    expect(base.tile).toBe(244);

    expect(base.levels).toHaveLength(2);
    expect(base.levels[0].name).toBe("マナドレイナー");
    expect(base.levels[0].tile).toBe(245);
    expect(base.levels[1].name).toBe("マナヴォイド");
    expect(base.levels[1].tile).toBe(246);
  });

  it("makeMonsterFromBase で各レベルが正しく生成される", () => {
    const lv1 = makeMonsterFromBase(base, 1, 0, 0);
    expect(lv1.name).toBe("マナイーター");
    expect(lv1.kind).toBe("undead");
    expect(lv1.elemWeak).toBe("fire");
    expect(lv1.subtype).toBe("manaEater");
    expect(lv1.hp).toBe(34);
    expect(lv1.atk).toBe(15);
    expect(lv1.def).toBe(5);
    expect(lv1.tile).toBe(244);

    const lv2 = makeMonsterFromBase(base, 2, 0, 0);
    expect(lv2.name).toBe("マナドレイナー");
    expect(lv2.kind).toBe("undead");
    expect(lv2.elemWeak).toBe("fire");
    expect(lv2.subtype).toBe("manaEater");
    expect(lv2.hp).toBe(70);
    expect(lv2.atk).toBe(30);
    expect(lv2.def).toBe(10);
    expect(lv2.tile).toBe(245);

    const lv3 = makeMonsterFromBase(base, 3, 0, 0);
    expect(lv3.name).toBe("マナヴォイド");
    expect(lv3.kind).toBe("undead");
    expect(lv3.elemWeak).toBe("fire");
    expect(lv3.subtype).toBe("manaEater");
    expect(lv3.hp).toBe(120);
    expect(lv3.atk).toBe(48);
    expect(lv3.def).toBe(16);
    expect(lv3.tile).toBe(246);
  });

  describe("useManaEaterDrain 特技の挙動", () => {
    it("Lv1（マナイーター）: プレイヤーのMPを3吸い取り、自身のHPを最大15回復する", () => {
      const mon = makeMonsterFromBase(base, 1, 1, 1);
      mon.hp = 10; // maxHp 32
      const pl = { mp: 10, maxMp: 20 };
      const ml = [];

      const res = useManaEaterDrain(mon, pl, ml);
      expect(res).toBe(true);
      expect(pl.mp).toBe(7); // 10 - 3
      expect(mon.hp).toBe(25); // 10 + 15
      expect(ml[0]).toContain("マナイーターがマナを吸い取った！MPが3減少し、マナイーターのHPが15回復した！");
    });

    it("Lv2（マナドレイナー）: プレイヤーのMPを5吸い取り、自身のHPを最大25回復する", () => {
      const mon = makeMonsterFromBase(base, 2, 1, 1);
      mon.hp = 30; // maxHp 68
      const pl = { mp: 10, maxMp: 20 };
      const ml = [];

      const res = useManaEaterDrain(mon, pl, ml);
      expect(res).toBe(true);
      expect(pl.mp).toBe(5); // 10 - 5
      expect(mon.hp).toBe(55); // 30 + 25
      expect(ml[0]).toContain("マナドレイナーがマナを吸い取った！MPが5減少し、マナドレイナーのHPが25回復した！");
    });

    it("Lv3（マナヴォイド）: プレイヤーのMPを10吸い取り、自身のHPを最大50回復する", () => {
      const mon = makeMonsterFromBase(base, 3, 1, 1);
      mon.hp = 50; // maxHp 115
      const pl = { mp: 15, maxMp: 20 };
      const ml = [];

      const res = useManaEaterDrain(mon, pl, ml);
      expect(res).toBe(true);
      expect(pl.mp).toBe(5); // 15 - 10
      expect(mon.hp).toBe(100); // 50 + 50
      expect(ml[0]).toContain("マナヴォイドがマナを吸い取った！MPが10減少し、マナヴォイドのHPが50回復した！");
    });

    it("モンスターのHPは maxHp を超えて回復しない", () => {
      const mon = makeMonsterFromBase(base, 1, 1, 1);
      mon.hp = 30; // maxHp 32, 空きは 2
      const pl = { mp: 10, maxMp: 20 };
      const ml = [];

      useManaEaterDrain(mon, pl, ml);
      expect(pl.mp).toBe(7);
      expect(mon.hp).toBe(34); // 30 + 4
      expect(ml[0]).toContain("HPが4回復した！");
    });

    it("プレイヤーのMPが吸収量未満の場合、残っている分だけ吸い取る", () => {
      const mon = makeMonsterFromBase(base, 1, 1, 1);
      mon.hp = 10;
      const pl = { mp: 2, maxMp: 20 };
      const ml = [];

      useManaEaterDrain(mon, pl, ml);
      expect(pl.mp).toBe(0);
      expect(mon.hp).toBe(25);
      expect(ml[0]).toContain("MPが2減少し");
    });

    it("プレイヤーのMPが0の場合、マナを吸えずHPも回復しない", () => {
      const mon = makeMonsterFromBase(base, 1, 1, 1);
      mon.hp = 10;
      const pl = { mp: 0, maxMp: 20 };
      const ml = [];

      useManaEaterDrain(mon, pl, ml);
      expect(pl.mp).toBe(0);
      expect(mon.hp).toBe(10);
      expect(ml[0]).toContain("吸い取れるマナがなかった！");
    });
  });
});
