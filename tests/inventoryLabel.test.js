import { describe, expect, it } from "vitest";
import { formatInventoryItem } from "../inventoryLabel.js";

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
  it("装備中の武器、祝福、強化値、能力を表示する", () => {
    const sword = { type: "weapon", name: "短剣", atk: 3, plus: 2, blessed: true, bcKnown: true, abilities: ["flame"] };
    expect(label(sword, { player: { weapon: sword } })).toBe("【武器】【祝】短剣+2 (攻+5) [炎]");
  });

  it("未識別の回復薬は効果量を表示しない", () => {
    const potion = { type: "potion", name: "赤い液体", effect: "heal", value: 20, identKey: "p:heal" };
    expect(label(potion)).toBe("赤い液体");
    expect(label(potion, { identified: new Set(["p:heal"]) })).toBe("赤い液体 (HP+20)");
  });

  it("食料、壺、未払い品の補足を表示する", () => {
    expect(label({ type: "food", name: "パン", value: 20, cooked: false, potionEffects: ["heal"] })).toBe("パン(満+20)(生★)");
    expect(label({ type: "pot", name: "壺", identKey: "pot", capacity: 3, contents: [{}], shopPrice: 400 }, { identified: new Set(["pot"]) })).toBe("壺 [1/3] 〔未払:400G〕");
  });
});
