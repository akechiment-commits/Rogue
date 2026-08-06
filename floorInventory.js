/**
 * 道具欄「足元」ページに載せる床オブジェクト一覧。
 * アイテム・罠に加え、風穴・魔方陣・泉・大箱を含める。
 */

import { BB_TYPES } from "./items.js";
import { stairRefAt } from "./floorObjectPlacement.js";

export const VENT_FLOOR_DESC =
  "一定範囲の物理飛び道具（投擲・矢・石・ブレスなど）の向きを風向きに変える。杖や魔法弾は曲がらない。";

export const FIXED_PORTAL_FLOOR_DESC =
  "対になる転送陣と常に繋がっている。乗ると反対側へ転送される。プレイヤー・敵・投げた物も通る。ペンのポータルとは繋がらない。";

export const SPRING_FLOOR_DESC =
  "神秘の泉。水を飲んだりアイテムを浸したりできる。状態が変わったり、ごく稀に願いが叶うこともある。";

export const BIGBOX_UNKNOWN_DESC =
  "正体不明の大箱。開けると中にアイテムを入れたり取り出したりできる。";

/** 未識別の魔方陣（描いたペンの種類が未判明） */
export const PENTACLE_UNKNOWN_DESC =
  "正体不明の魔方陣。何の効果があるのか分からない。";

/**
 * 魔方陣そのものの効果説明（ペンの説明文のコピーではない書き下ろし）。
 * key = pentacle.kind / pen effect
 */
export const PENTACLE_FLOOR_DESCS = {
  sanctuary:
    "モンスターはこの魔方陣を通過できず、上にいる者への近接攻撃もできない。\n呪い：描いた直後に隣接へ弾き出され、乗ると即死しうる（魔封じ下では無効など例外あり）。",
  vulnerability:
    "同じ部屋にいる者全員が受けるダメージが2倍になる。",
  magic_seal:
    "同じ部屋では魔法が一切効かなくなる。外から飛んできた魔法弾も消える。",
  thunder_trap:
    "真上にいると毎ターン雷ダメージを受ける。\n呪い：逆に毎ターンHPが回復する。",
  farcast:
    "同じ部屋で投げた物が壁まで貫通して飛ぶ。\n呪い：射程が1マスに縮む。",
  light:
    "同じ部屋の地形・敵・アイテムがすべて見える。\n呪い：視界が1マスに狭まる。",
  teleport_trap:
    "描いた瞬間にランダムテレポートし、その後も部屋内で確率テレポートする。\n呪い：テレポートを封じる。",
  trap_gen:
    "毎ターン確率で部屋に罠が増える（別部屋でも発動することがある）。\n呪い：毎ターン高確率で罠が消える。",
  stone_throw:
    "部屋内のキャラに毎ターン確率で魔法の石が飛ぶ。\n呪い：石の効果が回復に変わる。",
  knockback_aura:
    "部屋内で近接攻撃を受けた者が大きく吹き飛ぶ。\n呪い：吹き飛びがごく短い。",
  explosion:
    "部屋内で倒された敵が爆発し、周囲に大きなダメージを与える。壁・罠・大箱も壊れる。\n呪い：炎・雷を不発にする。",
  decoy:
    "部屋内の敵がプレイヤーを無視してこの魔方陣へ集まり、陣取ると動かなくなる。近づいた敵同士は互いに攻撃し合う。",
  plain:
    "見た目だけの魔方陣で、特に効果はない。",
  gravity:
    "部屋内では浮遊できず、敵が罠にかかりやすく、吹き飛ばしや飛びつきが無効になる。水上の浮遊系敵は危険。\n呪い：部屋内の全員が浮遊状態になる。",
  dodge:
    "部屋内では投げ物・矢・石が必ず外れる（魔法や炎など一部は除く）。\n呪い：逆に必ず命中する。",
  equal_speed:
    "部屋内の全員が速度に関係なく1回ずつ行動する。\n呪い：全員が鈍足になる。",
  heal_aura:
    "部屋内の全員が毎ターン少しHPを回復する。アンデッドには逆効果。\n呪い：毎ターン少しダメージを受ける。",
  revival:
    "この魔方陣の上でHPがゼロになると、HP全回復で一度だけ復活する（敵味方問わず・使い捨て）。\n呪い：同じ部屋での蘇りをすべて封じる（MPによる復活・通常の復活魔方陣・骨からの復活など）。",
  portal:
    "ポータル同士が繋がると乗ってワープできる。上に投げた物も反対側から出る。\n呪い：ランダムな場所へ飛ぶ。",
  fixed_portal: FIXED_PORTAL_FLOOR_DESC,
};

/** 説明のみ（踏む・使うなし）の足元ロール */
export const FLOOR_INFO_ROLES = new Set(["vent", "pentacle"]);

/** 足元から「使う／降りる等」できるロール（説明と合わせて2アクション） */
export const FLOOR_USABLE_ROLES = new Set(["spring", "bigbox", "stair"]);

/**
 * 魔方陣が識別済みか。
 * 未識別ペンで描いた場合 penIK が付き、ident にそのキーが無い間は未識別。
 */
export function isPentacleIdentified(pc, ident) {
  if (!pc) return false;
  if (pc.kind === "fixed_portal") return true;
  if (!pc.penIK) return true; /* 描画時に識別済みだった */
  if (!ident) return false;
  if (ident instanceof Set) return ident.has(pc.penIK);
  if (typeof ident.has === "function") return ident.has(pc.penIK);
  if (Array.isArray(ident)) return ident.includes(pc.penIK);
  return false;
}

function pentacleFloorDesc(pc, ident) {
  if (!isPentacleIdentified(pc, ident)) return PENTACLE_UNKNOWN_DESC;
  if (pc.desc && pc.kind === "fixed_portal") return pc.desc;
  return PENTACLE_FLOOR_DESCS[pc.kind] || "魔方陣。効果は種類によって異なる。";
}

function pentacleDisplayName(pc, ident) {
  /* 名称は描画時に付いたものを優先（未識別は偽名のまま） */
  if (pc.name) return pc.name;
  if (pc.kind === "fixed_portal") return "転送の魔法陣";
  if (!isPentacleIdentified(pc, ident)) return "謎の魔方陣";
  return "魔方陣";
}

/**
 * @param {object|null|undefined} dungeon
 * @param {number} x
 * @param {number} y
 * @param {{ allBcKnown?: boolean, bbFakeNames?: object, ident?: Set|string[] }} [opts]
 */
export function listFloorInventoryEntries(dungeon, x, y, opts = {}) {
  if (!dungeon || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { items: [], traps: [], fixtures: [], all: [] };
  }
  const ident = opts.ident;
  const items = (dungeon.items || []).filter(
    (i) => i.x === x && i.y === y && !i.wallEmbedded && !i.noPickup,
  );
  const traps = (dungeon.traps || []).filter((t) => t.x === x && t.y === y);

  const vents = (dungeon.vents || [])
    .filter((v) => v.x === x && v.y === y)
    .map((v) => ({
      ...v,
      _floorRole: "vent",
      name: v.name || "風穴",
      desc: v.desc || VENT_FLOOR_DESC,
      tile: v.tile ?? 128,
    }));

  const pentacles = (dungeon.pentacles || [])
    .filter((pc) => pc.x === x && pc.y === y)
    .map((pc) => ({
      ...pc,
      _floorRole: "pentacle",
      name: pentacleDisplayName(pc, ident),
      desc: pentacleFloorDesc(pc, ident),
      tile: pc.tile ?? 42,
      _pentacleIdentified: isPentacleIdentified(pc, ident),
    }));

  const springs = (dungeon.springs || [])
    .filter((s) => s.x === x && s.y === y)
    .map((s) => ({
      ...s,
      _floorRole: "spring",
      name: s.name || "泉",
      desc: s.desc || SPRING_FLOOR_DESC,
      tile: s.tile ?? 31,
    }));

  const bigboxes = (dungeon.bigboxes || [])
    .filter((b) => b.x === x && b.y === y)
    .map((b) => {
      const revealed = b.revealed === true || !!opts.allBcKnown;
      const tpl = BB_TYPES.find((t) => t.kind === b.kind);
      const fake = opts.bbFakeNames?.[b.kind];
      return {
        ...b,
        _floorRole: "bigbox",
        name: revealed ? (b.name || tpl?.name || "大箱") : (fake || "謎の大箱"),
        desc: revealed
          ? (b.desc || tpl?.desc || "大箱。中にアイテムを入れたり取り出したりできる。")
          : BIGBOX_UNKNOWN_DESC,
        tile: b.tile ?? tpl?.tile ?? 40,
      };
    });

  const stairs = [];
  const stair = stairRefAt(dungeon, x, y);
  if (stair) stairs.push(stair);

  const fixtures = [...vents, ...pentacles, ...springs, ...bigboxes, ...stairs];
  return {
    items,
    traps,
    fixtures,
    all: [...items, ...traps, ...fixtures],
  };
}

export function floorEntryRole(entry, items, traps) {
  if (!entry) return "unknown";
  if (entry._floorRole) return entry._floorRole;
  if (entry.type === "vent") return "vent";
  if (items?.includes?.(entry)) return "item";
  if (traps?.includes?.(entry)) return "trap";
  return "unknown";
}

/** 表示ラベル用プレフィックス付き名前 */
export function floorEntryLabel(entry, items, traps, itemLabelFn) {
  const role = floorEntryRole(entry, items, traps);
  if (role === "item") return itemLabelFn ? itemLabelFn(entry) : entry.name;
  if (role === "trap") return `【罠】${entry.name || "罠"}`;
  if (role === "vent") return `【風穴】${entry.name || "風穴"}`;
  if (role === "pentacle") return `【魔方陣】${entry.name || "魔方陣"}`;
  if (role === "spring") return `【泉】${entry.name || "泉"}`;
  if (role === "bigbox") return `【大箱】${entry.name || "大箱"}`;
  if (role === "stair") return `【階段】${entry.name || "階段"}`;
  return entry.name || "？";
}

/**
 * 足元フィクスチャの主アクションラベル（踏む／使う／降りるなど）。
 * @param {object} entry
 * @param {{ depth?: number }} [player]
 */
export function floorUseLabel(entry, player) {
  const role = entry?._floorRole || entry?.type;
  if (role === "trap") return "踏む";
  if (role === "spring") return "使う";
  if (role === "bigbox") return "調べる";
  if (role === "stair") {
    if (entry.stairDir === "up") {
      return player?.depth === 1 ? "出る" : "上る";
    }
    return "降りる";
  }
  return "使う";
}

/** 足元ページのアクション数（キーボード左右用） */
export function floorEntryActionCount(entry, items, traps, canUseFn) {
  const role = floorEntryRole(entry, items, traps);
  if (role === "trap") return 2; /* 踏む + 説明 */
  if (FLOOR_USABLE_ROLES.has(role)) return 2; /* 使う/調べる/階段 + 説明 */
  if (FLOOR_INFO_ROLES.has(role)) return 1; /* 説明のみ */
  if (role !== "item") return 1;
  let n = 1; /* 拾う */
  if (entry.type === "pot") n += 1;
  else if (entry.type === "marker") n += 1;
  else if (canUseFn?.(entry)) n += 1;
  if (entry.type === "spellbook") n += 1;
  if (entry.type === "arrow") n += 1;
  if (entry.type === "wand") n += 2;
  if (entry.type === "pot") n += 1;
  n += 2; /* 投げる + 説明 */
  return n;
}
