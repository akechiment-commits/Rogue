/* Boss-specific guaranteed drop categories. Each boss rolls one useful item in its category. */
const categoryDrop = (type, label) => Object.freeze({ type, label });

export const BOSS_UNIQUE_DROP_RULES = Object.freeze({
  boss_blaze: categoryDrop("potion", "ランダムな薬"),
  boss_darkbullet: categoryDrop("arrow", "ランダムな矢"),
  boss_guardian: categoryDrop("ring", "ランダムな指輪"),
  boss_demonking: categoryDrop("spellbook", "ランダムな魔法書"),
  boss_warlord: categoryDrop("weapon", "ランダムな武器"),
  boss_skullking: categoryDrop("spellbook", "ランダムな魔法書"),
  boss_flamedragon: categoryDrop("armor", "ランダムな防具"),
  boss_voidmonk: categoryDrop("spellbook", "ランダムな魔法書"),
  boss_infernoking: categoryDrop("wand", "ランダムな杖"),
  boss_abyssgod: categoryDrop("wand", "ランダムな杖"),

  boss_gwen: Object.freeze({ type: "food", label: "ランダム食料" }),
  boss_gwen_veteran: Object.freeze({ type: "food", label: "ランダム食料" }),
  boss_flock: categoryDrop("wand", "ランダムな杖"),
  boss_flock_revenge: categoryDrop("wand", "ランダムな杖"),
  boss_batteringram: categoryDrop("armor", "ランダムな防具"),
  boss_taisaijin: categoryDrop("spellbook", "ランダムな魔法書"),
  boss_chiranikuttsunnoku: categoryDrop("weapon", "ランダムな武器"),
  boss_kingbehinmos: categoryDrop("ring", "ランダムな指輪"),
  boss_ohplenty: categoryDrop("spellbook", "ランダムな魔法書"),
  boss_mireu: categoryDrop("weapon", "ランダムな武器"),
  boss_korgon: categoryDrop("ring", "ランダムな指輪"),

  im_boss_salamander: categoryDrop("weapon", "ランダムな武器"),
  im_boss_titan: categoryDrop("wand", "ランダムな杖"),
  im_boss_kraken: categoryDrop("pot", "ランダムな壺"),
  im_boss_twohead: categoryDrop("spellbook", "ランダムな魔法書"),
});

export const BOSS_RANDOM_DROP_COUNT = Object.freeze({ min: 2, max: 6 });
