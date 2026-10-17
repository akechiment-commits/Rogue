import { describe, it, expect } from "vitest";
import { MONS } from "../monsters.js";

describe("氷竜系の種族テスト", () => {
  it("氷竜系の kind は dragon である", () => {
    const iceDragon = MONS.find((m) => m.baseKind === "icedragon");
    expect(iceDragon).toBeDefined();
    expect(iceDragon.kind).toBe("dragon");
  });
});
