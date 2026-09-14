const DEBUG_STARTER_SPELLS = [
  "debug_summon_mon",
  "debug_get_item",
  "debug_get_blessed_item",
  "debug_get_cursed_item",
  "debug_create_trap",
  "debug_summon_bb",
  "debug_summon_object",
  "bless_magic",
  "curse_magic",
];

export const STARTER_SPELL_ID = "fire_bolt";

export function initialDungeonSpells(dungeonType) {
  if (dungeonType === "debug") return [...DEBUG_STARTER_SPELLS, STARTER_SPELL_ID];
  return [STARTER_SPELL_ID];
}

export function initialDungeonSpellLevels() {
  return { [STARTER_SPELL_ID]: 1 };
}
