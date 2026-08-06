/**
 * 立ち絵スロット定義（ゲーム本体・エディタ共通）
 * file: tiles/Character/{file}.png として保存される
 * group: PORTRAIT_SETS のキー（ランダム抽選グループ）
 */
export const PORTRAIT_CATEGORIES = [
  {
    id: "damage",
    label: "被ダメージ",
    desc: "属性・種別ごとのダメージ立ち絵（ランダム候補）",
    group: "damage",
    slots: [
      { file: "damage_arrow", label: "矢・飛び道具", group: "damage_arrow" },
      { file: "damage_fire", label: "炎", group: "damage_fire" },
      { file: "damage_ice", label: "氷", group: "damage_ice" },
      { file: "damage_rock", label: "石・岩", group: "damage_rock" },
      { file: "damage_trap", label: "罠", group: "damage_trap" },
      { file: "damage_explosion", label: "爆発", group: "damage_explosion" },
      { file: "damage_explosion_fly", label: "爆発（吹き飛び）", group: "damage_explosion" },
      { file: "damage_falling", label: "落下・穴", group: "damage_falling" },
      { file: "damage_wet", label: "水", group: "damage_wet" },
      { file: "damage_watergun", label: "水鉄砲", group: "damage_watergun" },
      { file: "damage_gun", label: "銃撃", group: "damage_gun" },
      { file: "damage_heavy", label: "強打・重い一撃", group: "damage_heavy" },
      { file: "damage_knockback", label: "吹き飛ばし", group: "damage_knockback" },
      { file: "damage_poison", label: "毒", group: "damage_poison" },
      { file: "damage_lightning", label: "雷・電撃", group: "damage_lightning" },
      { file: "hp_hurt", label: "汎用・軽傷", group: "damage" },
    ],
  },
  {
    id: "attack",
    label: "近接攻撃",
    desc: "近接攻撃したとき（+ 欄でバリエーション追加）",
    group: "attack",
    slots: [
      { file: "battle_melee", label: "近接攻撃（武器）" },
      { file: "battle_unarmed", label: "素手攻撃", group: "attack_unarmed" },
    ],
  },
  {
    id: "action",
    label: "アイテム使用",
    desc: "薬・食料・巻物・杖など使用時（+ 欄でバリエーション追加）",
    group: null,
    slots: [
      { file: "action_drink_potion", label: "薬を飲む", group: "act_potion" },
      { file: "action_drink_spring", label: "泉の水を飲む", group: "act_spring_drink" },
      { file: "action_soak_spring", label: "泉に浸す", group: "act_spring_soak" },
      { file: "action_eat_food", label: "食べる", group: "act_food" },
      { file: "action_eat_rotten", label: "腐ったものを食べる", group: "act_food_rotten" },
      { file: "action_eat_yabai", label: "ヤバイものを食べる", group: "act_food_yabai" },
      { file: "action_read_scroll", label: "巻物を読む", group: "act_scroll" },
      { file: "action_read_spellbook", label: "魔法書", group: "act_spellbook" },
      { file: "action_use_wand", label: "杖を振る", group: "act_wand" },
      { file: "action_use_pen", label: "ペン・魔方陣", group: "act_pen" },
      { file: "action_cast_magic", label: "魔法", group: "act_magic" },
      { file: "action_shoot_bow", label: "弓を射る", group: "act_bow" },
      { file: "action_throw", label: "投げる", group: "act_throw" },
      { file: "action_use_pot", label: "壺を使う", group: "act_pot" },
      { file: "action_open_chest", label: "宝箱・大箱", group: "act_chest" },
      { file: "action_point", label: "指差し", group: "act_point" },
      { file: "action_equip_weapon", label: "武器を装備", group: "act_equip_weapon" },
      { file: "action_equip_armor", label: "防具を装備", group: "act_equip_armor" },
      { file: "action_equip_ring", label: "指輪を装備", group: "act_equip_ring" },
    ],
  },
  {
    id: "hp",
    label: "HP・体調",
    desc: "HP帯・瀕死・回復・空腹",
    group: null,
    slots: [
      { file: "hp_full", label: "満タン", group: "hp_full" },
      { file: "hp_high", label: "高め", group: "hp_full" },
      { file: "hp_mid", label: "中程度", group: "hp_mid" },
      { file: "hp_low_stand", label: "瀕死・立ち", group: "hp_low" },
      { file: "hp_low_kneel", label: "瀕死・膝", group: "hp_low" },
      { file: "hp_critical", label: "危険域", group: "hp_low" },
      { file: "hp_healed", label: "回復した", group: "hp_healed" },
      { file: "hp_mp_revive", label: "MPで復活（ピンチ）", group: "hp_mp_revive" },
      { file: "hp_hunger", label: "空腹・飢餓", group: "hp_hunger" },
      { file: "hp_satiated", label: "満腹・満たされた", group: "hp_satiated" },
    ],
  },
  {
    id: "status",
    label: "状態異常",
    desc: "毒・睡眠・呪いなど付与中",
    group: null,
    slots: [
      { file: "status_poison", label: "毒", group: "status_poison" },
      { file: "status_sleep", label: "睡眠", group: "status_sleep" },
      { file: "status_cursed", label: "呪い", group: "status_cursed" },

      { file: "status_blind", label: "暗闇・盲目", group: "status_blind" },
      { file: "status_drunk", label: "酔い", group: "status_drunk" },
      { file: "status_oiled", label: "油まみれ", group: "status_oiled" },
      { file: "status_submerged", label: "水没", group: "status_submerged" },
      { file: "status_soaked", label: "ずぶ濡れ", group: "status_soaked" },
      { file: "status_relaxed", label: "リラックス", group: "status_relaxed" },
      { file: "status_paralyze", label: "金縛り", group: "status_paralyze" },
      { file: "status_bound", label: "拘束状態", group: "status_bound" },
      { file: "status_confined", label: "閉じ込め状態", group: "status_confined" },
      { file: "status_slow", label: "鈍足", group: "status_slow" },
      { file: "status_sealed", label: "封印・MP封印", group: "status_sealed" },
      { file: "status_bewitched", label: "幻惑", group: "status_bewitched" },
      { file: "status_immobile", label: "移動不能・影ぬい", group: "status_immobile" },
      { file: "status_floating", label: "浮遊", group: "status_floating" },
    ],
  },
  {
    id: "reaction",
    label: "リアクション",
    desc: "レベルアップ・驚き・喜びなど",
    group: null,
    slots: [
      { file: "reaction_levelup", label: "レベルアップ", group: "levelup" },
      { file: "reaction_motivated", label: "やる気", group: "levelup" },
      { file: "reaction_joy", label: "喜び", group: "levelup" },
      { file: "reaction_surprised", label: "驚き", group: "reaction_surprised" },
      { file: "reaction_surprised_joy", label: "驚き（喜び）", group: "reaction_surprised" },
      { file: "reaction_confused", label: "困惑・混乱", group: "status_confused" },
      { file: "reaction_sad", label: "悲しみ", group: "reaction_sad" },
      { file: "reaction_fall_ground", label: "転倒", group: "reaction_fall" },
      { file: "reaction_stairs", label: "階段・フロア移動", group: "reaction_stairs" },
      { file: "reaction_shop", label: "店・買い物", group: "reaction_shop" },
    ],
  },
  {
    id: "stand",
    label: "平常・移動",
    desc: "待機・歩行・装備姿勢",
    group: null,
    slots: [
      { file: "stand_normal", label: "通常", group: "hp_full" },
      { file: "stand_equipped", label: "装備", group: "hp_full" },
      /* 革の鎧・腹持ちの胴装備時の待機のみ（idleStandKey） */
      { file: "stand_light_armor", label: "軽装備（革・腹持ち）", group: "stand_light_armor" },
      /* 防具未装備の待機のみ */
      { file: "stand_unarmored", label: "未装備（下着）", group: "stand_unarmored" },
      { file: "stand_walk", label: "歩行", group: "walk" },
      { file: "stand_advance", label: "前進", group: "walk" },
      { file: "battle_dash", label: "ダッシュ", group: "dash" },
      { file: "stand_back", label: "後ろ向き", group: "stand_back" },
    ],
  },
  {
    id: "special",
    label: "特殊",
    desc: "ゲームオーバーなど",
    group: null,
    slots: [
      { file: "gameover_dead", label: "死亡・ゲームオーバー" },
      { file: "gameover_drown", label: "溺死・ゲームオーバー", group: "death_drown" },
    ],
  },
];

/** 登録済みファイル名の集合 */
export function collectPortraitFiles(categories) {
  return new Set(categories.flatMap((c) => c.slots.map((s) => s.file)));
}

/** 同一ベースの次バリアント名（damage_arrow → damage_arrow_2） */
export function nextVariantFile(baseFile, allFiles) {
  let n = 2;
  while (allFiles.has(`${baseFile}_${n}`)) n++;
  return `${baseFile}_${n}`;
}

/**
 * エディタで追加したスロットをベースカタログにマージ
 * @param {Array<{file,label,group?,categoryId,afterFile}>} extraSlots
 */
export function mergePortraitCategories(extraSlots = []) {
  const cats = PORTRAIT_CATEGORIES.map((c) => ({
    ...c,
    slots: c.slots.map((s) => ({ ...s, base: true })),
  }));

  for (const extra of extraSlots) {
    const cat = cats.find((c) => c.id === extra.categoryId);
    if (!cat) continue;
    const slot = {
      file: extra.file,
      label: extra.label,
      group: extra.group ?? undefined,
      base: false,
    };
    if (extra.afterFile) {
      const idx = cat.slots.findIndex((s) => s.file === extra.afterFile);
      if (idx >= 0) cat.slots.splice(idx + 1, 0, slot);
      else cat.slots.push(slot);
    } else {
      cat.slots.push(slot);
    }
  }
  return cats;
}

/** PORTRAIT_SETS 形式のグループ定義をカタログから生成 */
export function buildPortraitSets(categories = PORTRAIT_CATEGORIES) {
  const sets = {};
  for (const cat of categories) {
    for (const slot of cat.slots) {
      const g = slot.group ?? cat.group;
      if (!g) continue;
      /* 属性ダメージを汎用 damage に混ぜない（落下絵が投擲ヒット等で出ないように） */
      if (!sets[g]) sets[g] = [];
      if (!sets[g].includes(slot.file)) sets[g].push(slot.file);
    }
  }
  return sets;
}

export const ALL_PORTRAIT_FILES = PORTRAIT_CATEGORIES.flatMap((c) =>
  c.slots.map((s) => s.file),
);

export const BASE_PORTRAIT_FILE_SET = new Set(ALL_PORTRAIT_FILES);