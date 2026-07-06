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
      { file: "damage_wet", label: "水・水鉄砲", group: "damage_wet" },
      { file: "damage_heavy", label: "強打・重い一撃", group: "damage_heavy" },
      { file: "damage_knockback", label: "吹き飛ばし", group: "damage_knockback" },
      { file: "hp_hurt", label: "汎用・軽傷", group: "damage" },
    ],
  },
  {
    id: "attack",
    label: "攻撃・戦闘",
    desc: "近接攻撃・その場での行動時",
    group: "attack",
    slots: [
      { file: "battle_ready_a", label: "構え A" },
      { file: "battle_ready_b", label: "構え B" },
      { file: "battle_ready_c", label: "構え C" },
      { file: "battle_thrust", label: "突き" },
      { file: "battle_thrust_forward", label: "突き（前踏み）" },
      { file: "battle_upswing", label: "上斬り" },
      { file: "battle_overhead", label: "振りかぶり" },
      { file: "battle_light_slash", label: "軽い斬り" },
      { file: "battle_spin_slash", label: "回転斬り" },
      { file: "battle_jump_slash", label: "ジャンプ斬り" },
      { file: "battle_jump_attack", label: "ジャンプ攻撃" },
      { file: "battle_charge", label: "突進" },
      { file: "battle_dash", label: "ダッシュ攻撃" },
      { file: "battle_low_stance", label: "低い構え" },
      { file: "battle_highspeed", label: "高速攻撃" },
      { file: "battle_dual_wield", label: "二刀流" },
      { file: "battle_blade_dance", label: "剣舞" },
      { file: "battle_guard", label: "ガード" },
      { file: "battle_rage", label: "激怒" },
      { file: "battle_lightning", label: "雷属性" },
      { file: "battle_armor_break", label: "装備破壊" },
    ],
  },
  {
    id: "action",
    label: "アイテム使用",
    desc: "薬・食料・巻物・杖など使用時",
    group: null,
    slots: [
      { file: "action_drink_potion", label: "薬を飲む", group: "act_potion" },
      { file: "action_eat_food", label: "食べる", group: "act_food" },
      { file: "action_read_scroll", label: "巻物を読む", group: "act_scroll" },
      { file: "action_read_scroll2", label: "巻物を読む 2", group: "act_scroll" },
      { file: "action_read_spellbook", label: "魔法書", group: "act_spellbook" },
      { file: "action_use_wand", label: "杖を振る", group: "act_wand" },
      { file: "action_cast_wand", label: "杖を振る 2", group: "act_wand" },
      { file: "action_use_pen", label: "ペン・魔方陣", group: "act_pen" },
      { file: "action_cast_magic", label: "魔法", group: "act_magic" },
      { file: "action_cast_circle", label: "魔法陣", group: "act_magic" },
      { file: "action_shoot_bow", label: "弓を射る", group: "act_bow" },
      { file: "action_aim_bow", label: "弓を構える", group: "act_bow" },
      { file: "action_throw", label: "投げる", group: "act_throw" },
      { file: "action_throw_bomb", label: "爆弾投げ", group: "act_throw" },
      { file: "action_use_pot", label: "壺を使う", group: "act_pot" },
      { file: "action_hold_pot", label: "壺を持つ", group: "act_pot" },
      { file: "action_open_chest", label: "宝箱・大箱", group: "act_chest" },
      { file: "action_point", label: "指差し", group: "act_point" },
    ],
  },
  {
    id: "hp",
    label: "HP・体調",
    desc: "HP帯・瀕死・回復",
    group: null,
    slots: [
      { file: "hp_full", label: "満タン", group: "hp_full" },
      { file: "hp_high", label: "高め", group: "hp_full" },
      { file: "hp_mid", label: "中程度", group: "hp_mid" },
      { file: "hp_low_stand", label: "瀕死・立ち", group: "hp_low" },
      { file: "hp_low_kneel", label: "瀕死・膝", group: "hp_low" },
      { file: "hp_critical", label: "危険域", group: "hp_low" },
      { file: "hp_healed", label: "回復した", group: "hp_healed" },
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
      { file: "status_relaxed", label: "リラックス", group: "status_relaxed" },
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
      { file: "stand_light_armor", label: "軽装備", group: "hp_full" },
      { file: "stand_walk", label: "歩行", group: "walk" },
      { file: "stand_advance", label: "前進", group: "walk" },
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
    ],
  },
];

/** PORTRAIT_SETS 形式のグループ定義をカタログから生成 */
export function buildPortraitSets() {
  const sets = {};
  for (const cat of PORTRAIT_CATEGORIES) {
    for (const slot of cat.slots) {
      const g = slot.group ?? cat.group;
      if (!g) continue;
      const groups = [g];
      if (cat.id === "damage" && g !== "damage") groups.push("damage");
      for (const grp of groups) {
        if (!sets[grp]) sets[grp] = [];
        if (!sets[grp].includes(slot.file)) sets[grp].push(slot.file);
      }
    }
  }
  return sets;
}

export const ALL_PORTRAIT_FILES = PORTRAIT_CATEGORIES.flatMap((c) =>
  c.slots.map((s) => s.file),
);