import { describe, expect, it } from "vitest";
import { SPELLS, SPELLBOOKS } from "../items.js";

describe("魔法書の説明", () => {
  it("全魔法書が火への弱点ではなく習得魔法の説明を持つ", () => {
    const spellById = new Map(SPELLS.map((spell) => [spell.id, spell]));
    expect(SPELLBOOKS.length).toBeGreaterThan(0);
    for (const book of SPELLBOOKS) {
      const spell = spellById.get(book.spell);
      expect(spell, book.name).toBeTruthy();
      expect(book.desc, book.name).not.toContain("火に弱い");
      expect(book.desc, book.name).toBe(spell.desc);
    }
  });
});
