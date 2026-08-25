import { describe, expect, it } from "vitest";
import { formatInventoryItem, formatPlusSuffix, formatRefillMessage } from "../inventoryLabel.js";

function label(item, overrides = {}) {
  return formatInventoryItem(item, {
    player: null,
    identified: new Set(),
    displayName: (entry) => entry.name,
    getIdentKey: (entry) => entry.identKey,
    weaponAbilities: [{ id: "flame", name: "炎" }],
    armorAbilities: [{ id: "dodge", name: "回避" }],
    potOccupancyCount: (pot) => pot.contents?.length || 0,
    getShopItemCharge: (entry) => entry.shopPrice,
    ...overrides,
  });
}

describe("formatInventoryItem", () => {
  it("強化値の符号を正しく表示する", () => {
    expect(formatPlusSuffix(2)).toBe("+2");
    expect(formatPlusSuffix(-1)).toBe("-1");
    expect(formatPlusSuffix(0)).toBe("");
  });

  it("装備中の武器、祝福、強化値、能力を表示する", () => {
    const sword = { type: "weapon", name: "短剣", atk: 3, plus: 2, blessed: true, bcKnown: true, abilities: ["flame"] };
    expect(label(sword, { player: { weapon: sword } })).toBe("【武器】【祝】短剣+2 (攻+5) [炎]");
  });

  it("防具の負の強化値を正しく表示する", () => {
    const armor = { type: "armor", name: "プレートメイル", def: 10, plus: -1, bcKnown: true };
    expect(label(armor, { player: { armor } })).toBe("【防具】プレートメイル-1 (防+9)");
  });

  it("未識別の回復薬は効果量を表示しない", () => {
    const potion = { type: "potion", name: "赤い液体", effect: "heal", value: 20, identKey: "p:heal" };
    expect(label(potion)).toBe("赤い液体");
    expect(label(potion, { identified: new Set(["p:heal"]) })).toBe("赤い液体 (HP+20)");
  });

  it("未識別の力・守り・命の指輪は強化値を表示しない", () => {
    for (const effect of ["power_ring", "defense_ring", "life_ring"]) {
      const ring = { type: "ring", name: "謎の指輪", effect, plus: 2, identKey: `r:${effect}` };
      expect(label(ring)).toBe("謎の指輪");
      expect(label(ring, { identified: new Set([`r:${effect}`]) })).toBe("謎の指輪+2");
    }
  });

  it("食料、壺、未払い品の補足を表示する", () => {
    expect(label({ type: "food", name: "パン", value: 20, cooked: false, potionEffects: ["heal"] })).toBe("パン(満+20)(生★)");
    expect(label({ type: "pot", name: "壺", identKey: "pot", capacity: 3, contents: [{}], shopPrice: 400 }, { identified: new Set(["pot"]) })).toBe("壺 [1/3] 〔未払:400G〕");
  });
});

describe("formatRefillMessage", () => {
  it("未識別の杖は追加量と残り回数を表示しない", () => {
    expect(formatRefillMessage("かなりの杖", "wand", 2, 7, false)).toBe("かなりの杖の回数が増えた！");
    expect(formatRefillMessage("かなりの杖", "wand", 2, 7, true)).toBe("かなりの杖の回数が2増えた！(7回)");
  });

  it("未識別のペンもインクの追加量と残り回数を表示しない", () => {
    expect(formatRefillMessage("青いペン", "pen", 1, 3, false)).toBe("青いペンのインクが補充された！");
    expect(formatRefillMessage("青いペン", "pen", 1, 3, true)).toBe("青いペンのインクが1回分補充された！(3回)");
  });
});
