import { describe, it, expect, vi } from "vitest";
import { KATANA_T, MURAMASA_T, SOBURO_T, maybeKatanaToSoboro, soakItemIntoSpring, ITEMS, WEAPON_ABILITIES } from "../items.js";
import { reduceFinalPlayerDamage, hasAbility, installPlayerHpReverseHook } from "../utils.js";
import { makePlayer } from "./helpers.js";

describe("カタナと妖刀村正の実装", () => {
  it("カタナと妖刀村正が正しく定義されている", () => {
    expect(KATANA_T.name).toBe("カタナ");
    expect(KATANA_T.atk).toBe(6);
    expect(KATANA_T.rarity).toBe("D");
    expect(KATANA_T.weight).toBe(8);
    expect(KATANA_T.sellPrice).toBe(300);
    expect(KATANA_T.tile).toBe(20);

    expect(MURAMASA_T.name).toBe("妖刀村正");
    expect(MURAMASA_T.atk).toBe(12);
    expect(MURAMASA_T.ability).toBe("muramasa");
    expect(MURAMASA_T.sellPrice).toBe(5000);
    expect(MURAMASA_T.tile).toBe(20);

    const katanaInItems = ITEMS.find((i) => i.name === "カタナ");
    expect(katanaInItems).toBeDefined();
    expect(katanaInItems.atk).toBe(6);

    const muramasaAb = WEAPON_ABILITIES.find((a) => a.id === "muramasa");
    expect(muramasaAb).toBeDefined();
    expect(muramasaAb.name).toBe("妖刀");
  });

  it("盗み系でカタナはソボロ助広に変化し、ロングソードは変化しない", () => {
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.05);
    try {
      const k = { name: "カタナ", type: "weapon", plus: 3, id: "k1" };
      const outK = maybeKatanaToSoboro(k);
      expect(outK.name).toBe(SOBURO_T.name);
      expect(outK.plus).toBe(3);

      const ls = { name: "ロングソード", type: "weapon", plus: 2, id: "ls1" };
      const outLs = maybeKatanaToSoboro(ls);
      expect(outLs.name).toBe("ロングソード");
      expect(outLs.plus).toBe(2);
    } finally {
      rnd.mockRestore();
    }
  });

  it("泉にカタナを落とすと5%の確率で妖刀村正に変化する", () => {
    const spr = { x: 5, y: 5, contents: [] };
    const item = { name: "カタナ", type: "weapon", atk: 6, plus: 2, id: "k_spring" };
    const ml = [];

    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.02); // < 0.05
    try {
      soakItemIntoSpring(spr, item, ml);
      expect(item.name).toBe(MURAMASA_T.name);
      expect(item.ability).toBe("muramasa");
      expect(item.plus).toBe(2);
      expect(ml.some((m) => m.includes("妖刀村正に変化した"))).toBe(true);
    } finally {
      rnd.mockRestore();
    }
  });

  it("妖刀村正を装備していると受ける全ダメージが1.5倍になる", () => {
    const p = makePlayer({
      hp: 100,
      maxHp: 100,
      weapon: { ...MURAMASA_T },
    });
    expect(hasAbility(p.weapon, "muramasa")).toBe(true);

    // 10ダメージ → 15ダメージ
    expect(reduceFinalPlayerDamage(p, 10)).toBe(15);
    // 20ダメージ → 30ダメージ
    expect(reduceFinalPlayerDamage(p, 20)).toBe(30);
    // 1ダメージ → 1ダメージ (Math.floor(1 * 1.5) = 1)
    expect(reduceFinalPlayerDamage(p, 1)).toBe(1);
    // 5ダメージ → 7ダメージ (Math.floor(5 * 1.5) = 7)
    expect(reduceFinalPlayerDamage(p, 5)).toBe(7);
  });

  it("HP代入フックで村正装備中の被ダメージが1.5倍適用される", () => {
    const p = makePlayer({
      hp: 100,
      maxHp: 100,
      weapon: { ...MURAMASA_T },
    });
    installPlayerHpReverseHook(p);

    // 10ダメージ受けるとHPが15減る
    p.hp -= 10;
    expect(p.hp).toBe(85);
  });
});
