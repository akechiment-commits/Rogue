/* Boss-specific guaranteed bonus drops. Keys are stable monster baseKind values. */
const itemDrop = (type, field, value, label) => Object.freeze({ type, field, value, label });

export const BOSS_UNIQUE_DROP_RULES = Object.freeze({
  boss_blaze: itemDrop("potion", "effect", "superheal", "超回復薬"),
  boss_darkbullet: itemDrop("arrow", "name", "貫きの矢", "貫きの矢"),
  boss_guardian: itemDrop("ring", "effect", "regen_ring", "回復の指輪"),
  boss_demonking: itemDrop("spellbook", "spell", "clone_magic", "分身の魔法書"),
  boss_warlord: itemDrop("weapon", "name", "戦神の斧", "戦神の斧"),
  boss_skullking: itemDrop("spellbook", "spell", "heal_magic", "回復の魔法書"),
  boss_flamedragon: itemDrop("armor", "name", "ドラゴンメイル", "ドラゴンメイル"),
  boss_voidmonk: itemDrop("spellbook", "spell", "purify_magic", "浄化の魔法書"),
  boss_infernoking: itemDrop("wand", "effect", "ice_wand", "氷の杖"),
  boss_abyssgod: itemDrop("wand", "effect", "wish", "願いの杖"),

  boss_gwen: Object.freeze({ type: "food", label: "ランダム食料" }),
  boss_batteringram: itemDrop("potion", "effect", "heal_big", "大回復薬"),
  boss_taisaijin: itemDrop("potion", "effect", "power", "力の薬"),
  boss_chiranikuttsunnoku: itemDrop("potion", "effect", "panacea", "万能薬"),
  boss_kingbehinmos: itemDrop("ring", "effect", "float_ring", "浮遊の指輪"),
  boss_ohplenty: itemDrop("scroll", "effect", "duplicate", "複製の巻物"),
  boss_mireu: itemDrop("weapon", "name", "ドラゴンキラー", "ドラゴンキラー"),

  im_boss_salamander: itemDrop("weapon", "name", "氷の剣", "氷の剣"),
  im_boss_titan: itemDrop("ring", "effect", "core_ring", "体幹の指輪"),
  im_boss_kraken: itemDrop("ring", "effect", "water_breath_ring", "水中呼吸の指輪"),
  im_boss_twohead: itemDrop("spellbook", "spell", "reflect_magic", "反射の魔法書"),
});

export const BOSS_RANDOM_DROP_COUNT = Object.freeze({ min: 2, max: 6 });
