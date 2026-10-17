import { describe, it, expect } from "vitest";
import { MONS } from "../monsters.js";

describe("敵弱点・種族見直し（オーク、料理人、ヘビ、ウィンドメイジ、ラクガキ魔）のテスト", () => {
  it("オーク系は氷弱点である", () => {
    const orc = MONS.find((m) => m.baseKind === "orc");
    expect(orc).toBeDefined();
    expect(orc.elemWeak).toBe("ice");
  });

  it("炎の料理人系は氷弱点である", () => {
    const cook = MONS.find((m) => m.baseKind === "fireCook");
    expect(cook).toBeDefined();
    expect(cook.elemWeak).toBe("ice");
  });

  it("にじりヘビ系は氷弱点である", () => {
    const serpent = MONS.find((m) => m.baseKind === "serpent");
    expect(serpent).toBeDefined();
    expect(serpent.elemWeak).toBe("ice");
  });

  it("ウィンドメイジ系は undead かつ浮遊である", () => {
    const windmage = MONS.find((m) => m.baseKind === "windmage");
    expect(windmage).toBeDefined();
    expect(windmage.kind).toBe("undead");
    expect(windmage.float).toBe(true);
  });

  it("ラクガキ魔系は undead である", () => {
    const rakugaki = MONS.find((m) => m.baseKind === "rakugakima");
    expect(rakugaki).toBeDefined();
    expect(rakugaki.kind).toBe("undead");
  });
});
