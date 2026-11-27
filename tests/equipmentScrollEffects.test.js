import { describe, expect, it } from "vitest";
import { applyEquipmentForgeScroll } from "../equipmentScrollEffects.js";
import { WEAPON_ABILITIES, ARMOR_ABILITIES } from "../items.js";

describe("applyEquipmentForgeScroll", () => {
  it("通常・祝福とも全有効能力を所持している場合に呪い専用能力や祝福専用能力へフォールバックしない", () => {
    const normalWeaponAbilities = WEAPON_ABILITIES
      .filter(a => !a.specialOnly && !a.curseOnly && !a.blessedOnly)
      .map(a => a.id);
    const weapon = { name: "鉄の剣", type: "weapon", abilities: [...normalWeaponAbilities] };

    const msgNormal = applyEquipmentForgeScroll(weapon, { blessed: false, cursed: false });
    expect(msgNormal).toBe("鉄の剣はもうこれ以上能力を宿せない。");
    expect(weapon.abilities.some(id => WEAPON_ABILITIES.find(a => a.id === id)?.curseOnly)).toBe(false);
    expect(weapon.abilities.some(id => WEAPON_ABILITIES.find(a => a.id === id)?.blessedOnly)).toBe(false);

    const allNonCurseArmorAbilities = ARMOR_ABILITIES
      .filter(a => !a.specialOnly && !a.curseOnly)
      .map(a => a.id);
    const armor = { name: "鉄の鎧", type: "armor", abilities: [...allNonCurseArmorAbilities] };

    const msgBlessed = applyEquipmentForgeScroll(armor, { blessed: true, cursed: false });
    expect(msgBlessed).toBe("鉄の鎧はもうこれ以上能力を宿せない。");
    expect(armor.abilities.some(id => ARMOR_ABILITIES.find(a => a.id === id)?.curseOnly)).toBe(false);
  });
});
