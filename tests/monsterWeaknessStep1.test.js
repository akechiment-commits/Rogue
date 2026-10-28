import { describe, it, expect } from "vitest";
import { MONS } from "../monsters.js";

describe("ステップ1：属性弱点・種族見直しのテスト", () => {
  it("お化け柳系は炎弱点である", () => {
    const willow = MONS.find((m) => m.baseKind === "hauntedWillow");
    expect(willow).toBeDefined();
    expect(willow.elemWeak).toBe("fire");
  });

  it("危険な花びら系は炎弱点である", () => {
    const petal = MONS.find((m) => m.baseKind === "dangerousPetal");
    expect(petal).toBeDefined();
    expect(petal.elemWeak).toBe("fire");
  });

  it("水棲・甲殻類モンスターは雷弱点である", () => {
    const thunderWeakKinds = [
      "giantEel",
      "seaDevil",
      "waterFlower",
      "puller",
      "potRaider",
      "barriermage",
    ];
    for (const kind of thunderWeakKinds) {
      const mon = MONS.find((m) => m.baseKind === kind);
      expect(mon, `kind: ${kind} should exist`).toBeDefined();
      expect(mon.elemWeak, `kind: ${kind} should be weak to thunder`).toBe("thunder");
    }
  });

  it("バリア蟹は beast かつ雷弱点である", () => {
    const crab = MONS.find((m) => m.baseKind === "barriermage");
    expect(crab).toBeDefined();
    expect(crab.kind).toBe("beast");
    expect(crab.elemWeak).toBe("thunder");
  });

  it("デーモン系は undead かつ浮遊である", () => {
    const daemon = MONS.find((m) => m.baseKind === "daemon");
    expect(daemon).toBeDefined();
    expect(daemon.kind).toBe("undead");
    expect(daemon.float).toBe(true);
  });
});
